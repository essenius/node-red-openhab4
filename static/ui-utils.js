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
        if (Array.isArray(node.itemName)) {
            node.itemName = node.itemName[0] || "";
        }

        const controllerInput = document.getElementById("node-input-controller");
        const itemNameInput = document.getElementById("node-input-itemName");

        let allItemNames = [];

        async function updateItemNameDropdown(controllerConfig, selectedValue) {
            itemNameInput.innerHTML = "";

            if (!controllerConfig) {
                return itemNameInput.append(
                    $("<option disabled>").text("Select a controller first")
                );
            }

            // build your query params from controllerConfig…
            const params = {
                name: controllerConfig.name,
                protocol: controllerConfig.protocol,
                host: controllerConfig.host,
                port: controllerConfig.port,
                path: controllerConfig.path,
                username: controllerConfig.credentials?.username,
                password: controllerConfig.credentials?.password
            };

            try {
                const items = await $.getJSON("openhab4/items", params);
                items.sort((a, b) => a.name.localeCompare(b.name));
                allItemNames = items.map(item => item.name); // Store all names for filtering
                let specialOption = { value: "", text: emptyText };
                if (document.getElementById('node-input-item-filter')) {
                    const makeDropdownParams = {
                        filterInputId: 'node-input-item-filter',
                        selectId: 'node-input-itemName',
                        allOptions: allItemNames,
                        specialOption: specialOption,
                        selectedValue: selectedValue
                    }
                    makeFilterableDropdown(makeDropdownParams);
                }
            }
            catch (err) {
                console.warn("Failed loading items", err);
                itemNameInput.innerHTML = ""; 

                const option = document.createElement("option");
                option.disabled = true;
                option.textContent = "⚠️ Failed to load items";
                itemNameInput.appendChild(option);
            }
        }

        // initial load

        const controllerNode = RED.nodes.node(node.controller);
        if (controllerNode) {
            updateItemNameDropdown(controllerNode, node.itemName);
        }

        // reload when controller dropdown changes
        controllerInput.addEventListener("change", () => {
            const newController = RED.nodes.node(controllerInput.value);
            updateItemNameDropdown(newController, node.itemName);
        });
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
})(window);
