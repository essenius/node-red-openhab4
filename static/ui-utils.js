// Copyright 2025-2026 Rik Essenius
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy of the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under the License is
// distributed on an "AS IS" BASIS WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and limitations under the License.

(function (_global) {

    class ControllerStateTracker {
        constructor() { this.trackedControllers = new Map(); }
        setHash(id, hash) { this.trackedControllers.set(id, hash); }
        getHashWithDefault(id, defaultValue) {
            if (!this.trackedControllers.has(id)) {
                this.trackedControllers.set(id, defaultValue);
                return defaultValue;
            }
            return this.trackedControllers.get(id);
        }
        hasHashChanged(id, hash) { return this.trackedControllers.get(id) !== hash; }
    }

    const controllerStateTracker = new ControllerStateTracker();

    let deployListenerAttached = false;

    function safeAsync(fn) {
        Promise.resolve()
            .then(fn)
            .catch(err => {
                console.error("openHAB editor error:", err);
            });
    }

    async function getControllerNode(RED, controllerId, attempts = 10) {
        for (let i = 0; i < attempts; i++) {
            const node = RED.nodes.node(controllerId);
            if (node) return node;
            await new Promise(r => setTimeout(r, 50));
        }
        return null;
    }

    async function checkedControllerNode(RED, node, controllerInput) {
        const selectedControllerId = controllerInput?.value;

        if (!selectedControllerId) {
            return { message: "Select a controller first" };
        }

        const controllerNode = await getControllerNode(RED, selectedControllerId);

        if (!controllerNode) {
            return { message: "Controller not ready" };
        }

        // default makes sure that we have a value in the tracker (and using it implies the hash hasn't changed).
        let deployedHash = controllerStateTracker.getHashWithDefault(selectedControllerId, controllerNode.hash);

        console.log(`Deployed hash for ${selectedControllerId}`, deployedHash);

        // if the deployed hash isn't equal to the local node's hash, we need a deploy
        const controllerChanged = controllerStateTracker.hasHashChanged(selectedControllerId, controllerNode.hash);

        console.log("Controller changed", controllerChanged);
        console.log("Node:", node);
        console.log("Controller:", selectedControllerId, controllerNode);

        if (controllerChanged) {
            return { message: "⚠ Controller configuration changed, deploy first" };
        }

        return { controllerNode };
    }

    function ensureDeployListener(RED) {
        if (!deployListenerAttached) {
            RED.events.on("deploy", () => {
                console.log("Deploying");
                RED.nodes.eachConfig(n => {
                    if (n.hash) {
                        console.log(`Adding ${n.id} : ${n.hash}`);
                        controllerStateTracker.setHash(n.id, n.hash);
                    }
                });
            });
            deployListenerAttached = true; 
        }
    }

    function getInputField(name) {
        return document.getElementById(`node-input-${name}`);
    }

    function getFields() {
        return {
            controllerInput: getInputField("controller"),
            conceptInput: getInputField("concept"),
            itemNameInput: getInputField("identifier")
        };
    }

    function openhabEditCancel(RED, node) {
        removeEventListeners(RED, node);
    }

    function openhabEditSave(RED, node) { safeAsync(() => openhabEditSaveAsync(RED, node)) };

    async function openhabEditSaveAsync(RED, node) {
        removeEventListeners(RED, node);
        const { message } = await checkedControllerNode(RED, node, getInputField("controller"));

        if (message) {
            console.warn(message);
        }
    }

    async function openhabEditPrepare(RED, node, emptyText) {
        safeAsync(async () => {
            try {
                await openhabEditPrepareAsync(RED, node, emptyText);
            } catch (err) {
                console.error("Prepare failed:", err);
                removeEventListeners(RED, node);
                throw err;
            }
        });
    }

    /**
     * Populate a native <select> dropdown with OpenHAB items.
     * @param node    the current node instance
     * @param emptyText  Text to use for empty value
     */
    async function openhabEditPrepareAsync(RED, node, emptyText) {
        removeEventListeners(RED, node);

        ensureDeployListener(RED);

        // Fix existing array data
        if (Array.isArray(node.identifier)) {
            node.identifier = node.identifier[0] || "";
        }
        const { controllerInput, conceptInput, itemNameInput } = getFields();
        console.log(`oneditprepare for ${node.type}/${node.id}`);

        let allItemNames = [];
        let callCount = 0;
        let refreshVersion = 0;

        function getConcept() {
            return conceptInput?.value ?? "items";
        }

        async function updateItemNameDropdown(selectedValue, version) {
            if (!itemNameInput) return; // in case the dialog is closed during refresh
            itemNameInput.innerHTML = "";
            const controllerCheck = await checkedControllerNode(RED, node, controllerInput);
            if (version !== refreshVersion) return; // ignore stale responses
            if (controllerCheck.message) {
                const option = document.createElement("option");
                option.disabled = true;
                option.textContent = controllerCheck.message;
                itemNameInput.appendChild(option);
                return;
            }

            const concept = getConcept();

            try {
                // if there is no concept input (e.g. with out), we default to "items" as concept
                // pass on the controller Id for server side fetching of config
                const items = await $.getJSON(`openhab4/${concept}`, { controller: controllerInput.value });
                if (version !== refreshVersion) return; // ignore stale responses

                callCount++;
                const nameKey = concept === "things" ? "UID" : "name";
                console.log("CallCount: ", callCount);
                console.log("Items: ", items);

                items.sort((a, b) => a[nameKey].localeCompare(b[nameKey]));
                allItemNames = items.map(item => item[nameKey]); // Store all names for filtering
                console.log("allItemNames:", allItemNames);

                let specialOption = { value: "", text: emptyText };
                if (getInputField('list-filter')) {
                    const makeDropdownParams = {
                        filterInputId: 'list-filter',
                        selectId: 'identifier',
                        allOptions: allItemNames,
                        specialOption: specialOption,
                        selectedValue: selectedValue
                    }
                    makeFilterableDropdown(makeDropdownParams, node);
                }
            }
            catch (err) {
                console.log("Failed loading resources", err);
                itemNameInput.innerHTML = "";
                const option = document.createElement("option");
                option.disabled = true;
                option.textContent = `⚠️ Could not load resources (${err.responseText ?? err.status})`;
                itemNameInput.appendChild(option);
            }
        }

        async function refreshDropdown() {
            const version = ++refreshVersion;
            await updateItemNameDropdown(node.identifier, version);
        }

        node._controllerChangeDomHandler = refreshDropdown;

        // reload when controller content changes
        attachControllerChangeListener(RED, node, controllerInput, node._controllerChangeDomHandler);

        // reload when controller or concept dropdown changes
        controllerInput.addEventListener("change", node._controllerChangeDomHandler);
        conceptInput?.addEventListener("change", node._controllerChangeDomHandler);

        // initial load

        await refreshDropdown();
    }

    function removeEventListeners(RED, node) {
        const { controllerInput, conceptInput } = getFields();
        controllerInput?.removeEventListener("change", node._controllerChangeDomHandler);
        conceptInput?.removeEventListener("change", node._controllerChangeDomHandler);
        delete node._controllerChangeDomHandler;

        const filterInput = getInputField("list-filter");

        if (filterInput && node._filterInputHandler) {
            filterInput.removeEventListener("input", node._filterInputHandler);
            delete node._filterInputHandler;
        }

        detachRedControllerChangeListener(RED, node);
    }

    function appendOption(select, { value, text }, selectedValue) {
        const option = document.createElement('option');
        option.value = value;
        option.text = text;
        option.selected = value === selectedValue;
        select.appendChild(option);
    }

    /**
     * Makes a <select> element filterable by a text input.
     * @param {string} filterInputId - The ID of the text input for filtering.
     * @param {string} selectId - The ID of the select element to filter.
     * @param {Array<string>} allOptions - The full list of options.
     * @param {Object} [specialOption] - An object { value, text } for a special first option.
     */
    function makeFilterableDropdown(params, node) {

        const filterInput = getInputField(params.filterInputId);
        const select = getInputField(params.selectId);

        function populateDropdown(options) {
            select.innerHTML = '';
            if (params.specialOption) {
                appendOption(select, params.specialOption, params.selectedValue);
            }
            options.forEach(item => {
                appendOption(select, { value: item, text: item }, params.selectedValue);
            });
        }

        if (node._filterInputHandler) {
            filterInput.removeEventListener('input', node._filterInputHandler);
        }

        node._filterInputHandler = function () {
            const filter = this.value.toLowerCase();
            const filtered = params.allOptions.filter(item =>
                item.toLowerCase().includes(filter)
            );
            populateDropdown(filtered);
        };

        filterInput.addEventListener('input', node._filterInputHandler);

        // Initial population
        populateDropdown(params.allOptions);
    }

    function attachControllerChangeListener(RED, node, controllerInput, refreshFn) {

        // Prevent duplicate listeners
        if (node._controllerChangeRedHandler) {
            RED.events.off("nodes:change", node._controllerChangeRedHandler);
        }

        node._controllerChangeRedHandler = async function (changedNode) {

            if (!changedNode?._def) return;
            if (changedNode._def.category !== "config") return;

            const selectedControllerId = controllerInput?.value;
            if (!selectedControllerId) return;

            if (changedNode.id === selectedControllerId) {
                console.log("Controller config changed → refreshing");
                await refreshFn();
            }
        };

        RED.events.on("nodes:change", node._controllerChangeRedHandler);
    }

    function detachRedControllerChangeListener(RED, node) {
        if (node._controllerChangeRedHandler) {
            RED.events.off("nodes:change", node._controllerChangeRedHandler);
            delete node._controllerChangeRedHandler;
        }
    }

    globalThis.openhabEditPrepare = openhabEditPrepare;
    globalThis.openhabEditSave = openhabEditSave;
    globalThis.openhabEditCancel = openhabEditCancel;
    globalThis.makeFilterableDropdown = makeFilterableDropdown;

    // for testing
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ControllerStateTracker };
    }
})(globalThis);
