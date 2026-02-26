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

"use strict";

(function (_global) {


    // --- ControllerChecker ---

    /**
    * @param {object} RED the node red object
    * @param {ControllerStateTracker} tracker the state tracker object
    */
    class ControllerChecker {
        constructor(RED, tracker) {
            this.RED = RED;
            this.tracker = tracker;
        }

        async getControllerNode(controllerId, attempts = 10) {
            for (let i = 0; i < attempts; i++) {
                const node = this.RED.nodes.node(controllerId);
                if (node) return node;
                await new Promise(r => setTimeout(r, 50));
            }
            return null;
        }

        async check(controllerInput) {
            const selectedControllerId = controllerInput?.value;
            if (!selectedControllerId) {
                return { message: "Select a controller first" };
            }

            const controllerNode = await this.getControllerNode(selectedControllerId);
            if (!controllerNode) {
                return { message: "Controller not ready" };
            }

            const deployedHash = this.tracker.getHashWithDefault(selectedControllerId, controllerNode.hash);
            console.log(`Deployed hash for ${selectedControllerId}`, deployedHash);

            const controllerChanged = this.tracker.hasHashChanged(selectedControllerId, controllerNode.hash);

            console.log("Controller changed", controllerChanged);
            console.log("Controller:", selectedControllerId, controllerNode);
            if (controllerChanged) {
                return { message: "⚠ Controller configuration changed, deploy first" };
            }

            return { controllerNode };
        }
    }

    // --- ControllerConfigChangeListener class ---

    class ControllerConfigChangeListener {
        /**
         * @param {object} RED
         * @param {HTMLSelectElement} controllerInput
         * @param {Function} refreshFn
         */
        constructor(RED, controllerInput, refreshFn) {
            this.RED = RED;
            this.controllerInput = controllerInput;

            this._handler = async (changedNode) => {
                if (!changedNode?._def) return;
                if (changedNode._def.category !== "config") return;

                const selectedControllerId = this.controllerInput?.value;
                if (!selectedControllerId) return;

                if (changedNode.id === selectedControllerId) {
                    console.log("Controller config changed → refreshing");
                    await refreshFn();
                }
            };
            this.RED.events.on("nodes:change", this._handler);
        }

        destroy() {
            this.RED.events.off("nodes:change", this._handler);
        }
    }

    // --- ControllerStateTracker class ---

    class ControllerStateTracker {
        constructor(RED) {
            this.trackedControllers = new Map();
            this.RED = RED;
            this._deployHandler = null;
            this._attachDeployListener();
        }

        destroy() {
            this._detachDeployListener();
        }

        setHash(id, hash) {
            this.trackedControllers.set(id, hash);
        }

        getHashWithDefault(id, defaultValue) {
            if (!this.trackedControllers.has(id)) {
                this.trackedControllers.set(id, defaultValue);
                return defaultValue;
            }
            return this.trackedControllers.get(id);
        }

        hasHashChanged(id, hash) {
            return this.trackedControllers.get(id) !== hash;
        }

        _attachDeployListener() {
            if (this._deployHandler || !this.RED) return;
            this._deployHandler = () => {
                this.RED.nodes.eachConfig(n => {
                    if (n.hash) this.setHash(n.id, n.hash);
                });
            };
            this.RED.events.on("deploy", this._deployHandler);
        }

        _detachDeployListener() {
            if (!this._deployHandler || !this.RED) return;
            this.RED.events.off("deploy", this._deployHandler);
            // Note: store the handler if you want proper off() later
            this._deployHandler = null;
        }
    }

    // --- DropdownController class ---

    class DropdownController {
        constructor({ checker, controllerInput, conceptInput, dropdown, currentValue, fetchFn }) {
            this.checker = checker;
            this.currentValue = currentValue;
            this.controllerInput = controllerInput;
            this.conceptInput = conceptInput;
            this.dropdown = dropdown;
            this.fetchFn = fetchFn;
            this._refreshVersion = 0;
        }

        async refresh() {
            const version = ++this._refreshVersion;

            const controllerCheck = await this.checker.check(this.controllerInput);

            if (controllerCheck.message) {
                this.dropdown.setSingleDisabledOption(controllerCheck.message);
                return;
            }

            const concept = this.conceptInput?.value ?? "items";

            let resources;
            try {
                resources = await this.fetchFn(`openhab4/${concept}`, { controller: this.controllerInput.value });
            } catch (err) {
                if (version !== this._refreshVersion) return;
                this.dropdown.setSingleDisabledOption(err.message);
                return;
            }

            if (version !== this._refreshVersion) return;

            const nameKey = concept === "things" ? "UID" : "name";
            const allNames = resources.map(i => i[nameKey]).sort();

            this.dropdown.setOptions(allNames, this.currentValue);
        }
    }

    // --- DropdownFilterListener class ---

    class DropdownFilterListener {
        /**
         * @param {HTMLSelectElement} select
         * @param {HTMLInputElement|null} filterInput
         * @param {string|null} specialOptionText
         */
        constructor(select, filterInput = null, specialOptionText = "[None]") {
            this.select = select;
            this.filterInput = filterInput;
            this.specialOption = { value: "", text: specialOptionText };
            this.allOptions = [];
            this.selectedValue = null;
            this._attachFilterInput();
        }

        destroy() {
            this._detachFilterInput();
        }

        clearOptions() {
            if (!this.select) return;
            this.select.innerHTML = '';
        }

        setOptions(allOptions, selectedValue) {
            this.allOptions = allOptions;
            this.selectedValue = selectedValue;
            this._populate(allOptions);
        }

        setSingleDisabledOption(optionText) {
            this.clearOptions();
            this._appendOption({ value: "", text: optionText, disabled: true });
        }

        // private methods

        _appendOption({ value, text, disabled = false }, selectedValue = null) {
            const option = document.createElement('option');
            option.value = value;
            option.text = text;
            if (disabled) option.disabled = disabled;
            if (selectedValue != null) option.selected = value === selectedValue;
            this.select.appendChild(option);
        }

        _attachFilterInput() {
            if (!this.filterInput) return;

            this._inputHandler = () => {
                const filter = this.filterInput.value.toLowerCase();
                const filtered = this.allOptions.filter(resource => resource.toLowerCase().includes(filter));
                this._populate(filtered);
            };

            this.filterInput.addEventListener('input', this._inputHandler);
        }

        _detachFilterInput() {
            if (this.filterInput && this._inputHandler) {
                this.filterInput.removeEventListener('input', this._inputHandler);
                this._inputHandler = null;
            }
        }

        _populate(options) {
            if (!this.select) return;
            this.clearOptions();

            this._appendOption(this.specialOption, this.selectedValue);

            options.forEach(resource => {
                this._appendOption({ value: resource, text: resource }, this.selectedValue);
            });
        }
    }

    // --- FieldChangeListener class ---

    class FieldChangeListener {
        constructor(controllerInput, conceptInput, refreshFn) {
            this.controllerInput = controllerInput;
            this.conceptInput = conceptInput;
            this._handler = () => refreshFn();
            this._attach();
        }

        destroy() {
            this._detach();
        }

        _attach() {
            this.controllerInput?.addEventListener("change", this._handler);
            this.conceptInput?.addEventListener("change", this._handler);
        }

        _detach() {
            this.controllerInput?.removeEventListener("change", this._handler);
            this.conceptInput?.removeEventListener("change", this._handler);
        }

    }

    // --- ListenerManager class ---

    class ListenerManager {
        constructor() {
            this.listeners = new Map();
        }

        /**
         * Add a listener under a unique key.
         * The listener must have a destroy() method.
         */
        add(key, listener) {
            if (this.listeners.has(key)) {
                // Optional: auto-remove old listener if key already exists
                this.remove(key);
            }
            this.listeners.set(key, listener);
        }

        get(key) {
            return this.listeners.get(key);
        }

        /**
         * Remove a single listener by key.
         */
        remove(key) {
            const listener = this.listeners.get(key);
            if (listener?.destroy) listener.destroy();
            this.listeners.delete(key);
        }

        /**
         * Remove all listeners.
         */
        clear() {
            for (const listener of this.listeners.values()) {
                if (listener.destroy) listener.destroy();
            }
            this.listeners.clear();
        }

        /**
         * Iterate over listeners (for testing or inspection)
         */
        forEach(callback) {
            this.listeners.forEach(callback);
        }
    }

    // --- Main entry point ---

    let controllerStateTracker = null;

    function getControllerStateTracker(RED) {
        if (!controllerStateTracker) {
            controllerStateTracker = new ControllerStateTracker(RED);
        }
        return controllerStateTracker;
    }

    async function fetchJson(url, data, timeoutMs = 5000) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const query = new URLSearchParams(data).toString();
            const response = await fetch(`${url}?${query}`, {
                method: "GET",
                headers: { "Accept": "application/json" },
                signal: controller.signal
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            return await response.json();
        } finally {
            clearTimeout(timeout);
        }
    }

    function safeAsync(fn) {
        Promise.resolve()
            .then(fn)
            .catch(err => {
                console.error("openHAB editor error:", err);
            });
    }

    function getInputField(name) {
        return document.getElementById(`node-input-${name}`);
    }

    /*function getFields() {
        return {
            controllerInput: getInputField("controller"),
            conceptInput: getInputField("concept"),
            identifierInput: getInputField("identifier")
        };
    } */

    function openhabEditCancel(RED, node) {
        removeEventListeners(node);
    }

    function openhabEditSave(RED, node, { safeAsync = safeAsync } = {}) {
        safeAsync(() => openhabEditSaveAsync(RED, node));
    }

    async function openhabEditSaveAsync(RED, node) {
        if (!node.checker) {
            console.log("No checker in node", node);
            return;
        }
        const { message } = await node.checker.check(RED, getInputField("controller"));

        removeEventListeners(node);

        if (message) {
            console.warn(message);
        }
    }

    function openhabEditPrepare(RED, node, emptyText, injections = {}) {
        const {
            safeAsyncFn = safeAsync,
        } = injections;

        safeAsyncFn(async () => {
            try {
                await openhabEditPrepareAsync(RED, node, emptyText, injections);
            } catch (err) {
                console.error("Prepare failed:", err);
                node._listenerManager?.clear();
                throw err;
            }
        });
    }

    /**
     * Populate a native <select> dropdown with OpenHAB resources (items/things).
     * @param RED     the node red object
     * @param node    the current node instance
     * @param emptyText  Text to use for empty value
     */
    async function openhabEditPrepareAsync(RED, node, emptyText, injections) {
        const {
            fetchFn = fetchJson,
            getInputFieldFn = getInputField,
        } = injections;

        removeEventListeners(node);

        // Fix existing array data
        if (Array.isArray(node.identifier)) {
            console.log("Fixing array");
            node.identifier = node.identifier[0] || "";
        }

        const controllerInput = getInputFieldFn("controller");
        const conceptInput = getInputFieldFn("concept");
        const identifierInput = getInputFieldFn("identifier");
        const filterInput = getInputFieldFn("list-filter");
        console.log(`oneditprepare for ${node.type}/${node.id}`);

        node._listenerManager = new ListenerManager();

        const dropdownFilterListener = new DropdownFilterListener(identifierInput, filterInput, emptyText);
        node._listenerManager.add("dropdownFilter", dropdownFilterListener);

        //        node._dropdownFilterListener = new DropdownFilterListener(identifierInput, filterInput, emptyText);
        node._controllerChecker = new ControllerChecker(RED, getControllerStateTracker(RED));

        node._dropdownController = new DropdownController({
            checker: node._controllerChecker,
            controllerInput,
            conceptInput,
            dropdown: dropdownFilterListener,
            currentValue: node.identifier,
            fetchFn
        });

        const refreshDropdown = () => node._dropdownController.refresh();
        node._listenerManager.add("controllerConfig", new ControllerConfigChangeListener(RED, controllerInput, refreshDropdown));
        node._listenerManager.add("fieldChange", new FieldChangeListener(controllerInput, conceptInput, refreshDropdown));

        //node._controllerConfigChangeListener = new ControllerConfigChangeListener(RED, controllerInput, refreshDropdown);
        //node._fieldChangeListener = new FieldChangeListener(controllerInput, conceptInput, refreshDropdown);

        await refreshDropdown();
    }

    /*function dispose(owner, property) {
        const obj = owner[property];
        if (!obj) return;
        if (obj.destroy) obj.destroy();
        owner[property] = null;
    } */

    function removeEventListeners(node) {
        node._listenerManager?.clear();
        node._listenerManager = null;
    }

    globalThis.openhabEditPrepare = openhabEditPrepare;
    globalThis.openhabEditSave = openhabEditSave;
    globalThis.openhabEditCancel = openhabEditCancel;

    const isTest = typeof module !== 'undefined' && module.exports;

    if (isTest) {
        module.exports = {
            ControllerChecker,
            ControllerConfigChangeListener,
            ControllerStateTracker,
            DropdownController,
            DropdownFilterListener,
            FieldChangeListener,
            ListenerManager,
            fetchJson,
            getInputField,
            openhabEditCancel,
            openhabEditPrepare,
            openhabEditPrepareAsync,
            openhabEditSave,
            openhabEditSaveAsync,
            removeEventListeners,
            safeAsync,
            _resetControllerStateTracker: () => {
                controllerStateTracker = null;
            }
        };
    }
})(globalThis);
