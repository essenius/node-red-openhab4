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
    /**
     * Populate a native <select> dropdown with OpenHAB items.
     * @param node    the current node instance
     * @param emptyText  Text to use for empty value
     */
    function openhabEditPrepare(node, emptyText) {
        // Fix existing array data
        if (Array.isArray(node.identifier)) {
            node.identifier = node.identifier[0] || "";
        }

        const controllerInput = document.getElementById("node-input-controller");
        const itemNameInput = document.getElementById("node-input-identifier");
        const conceptInput = document.getElementById("node-input-concept");

        let allItemNames = [];

        async function updateItemNameDropdown(controllerId, selectedValue) {
            itemNameInput.innerHTML = "";

            if (!controllerId) {
                return itemNameInput.append(
                    $("<option disabled>").text("Select a controller first")
                );
            }

            try {
                // if there is no concept input (e.g. with out), we default to "items" as concept
                const concept = conceptInput?.value ?? "items";
                // pass on the controller Id for server side fetching of config
                console.log(`getting openhab4/${concept} with controller ${controllerId}`);
                const items = await $.getJSON(`openhab4/${concept}`, { controller: controllerId });
                console.log("Items:", items);
                const nameKey = concept === "things" ? "UID" : "name";
                items.sort((a, b) => a[nameKey].localeCompare(b[nameKey]));
                allItemNames = items.map(item => item[nameKey]); // Store all names for filtering
                let specialOption = { value: "", text: emptyText };
                if (document.getElementById('node-input-list-filter')) {
                    const makeDropdownParams = {
                        filterInputId: 'node-input-list-filter',
                        selectId: 'node-input-identifier',
                        allOptions: allItemNames,
                        specialOption: specialOption,
                        selectedValue: selectedValue
                    }
                    makeFilterableDropdown(makeDropdownParams);
                }
            }
            catch (err) {
                console.log("Failed loading resources", err);
                itemNameInput.innerHTML = ""; 

                const option = document.createElement("option");
                option.disabled = true;
                option.textContent = "⚠️ Failed to load resources";
                itemNameInput.appendChild(option);
            }
        }


        function refreshDropdown(topic) {
            const controllerNode = RED.nodes.node(node.controller);
            if (controllerNode) updateItemNameDropdown(controllerNode.id, topic);
        }

        // reload when controller or concept dropdown changes
        controllerInput.addEventListener("change", () => { refreshDropdown(node.identifier); });
        conceptInput?.addEventListener("change", () => { refreshDropdown(node.identifier); });

        // initial load

        refreshDropdown(node.identifier);
    }

    /**
     * Makes a <select> element filterable by a text input.
     * @param {string} filterInputId - The ID of the text input for filtering.
     * @param {string} selectId - The ID of the select element to filter.
     * @param {Array<string>} allOptions - The full list of options.
     * @param {Object} [specialOption] - An object { value, text } for a special first option.
     */
    function makeFilterableDropdown(params) {
        
        const filterInput = document.getElementById(params.filterInputId);
        const select = document.getElementById(params.selectId);

        function populateDropdown(options) {
            select.innerHTML = '';
            if (params.specialOption) {
                const opt = document.createElement('option');
                opt.value = params.specialOption.value;
                opt.text = params.specialOption.text;
                opt.selected = (params.specialOption.value === params.selectedValue);
                select.appendChild(opt);
            }
            options.forEach(item => {
                const option = document.createElement('option');
                option.value = item;
                option.text = item;
                option.selected = (item === params.selectedValue);
                select.appendChild(option);
            });
        }

        filterInput.addEventListener('input', function () {
            const filter = this.value.toLowerCase();
            const filtered = params.allOptions.filter(item => item.toLowerCase().includes(filter));
            populateDropdown(filtered);
        });

        // Initial population
        populateDropdown(params.allOptions);
    }

    globalThis.openhabEditPrepare = openhabEditPrepare;
    globalThis.makeFilterableDropdown = makeFilterableDropdown;
})(globalThis);
