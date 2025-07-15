// Copyright 2025 Rik Essenius
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy of the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under the License is
// distributed on an "AS IS" BASIS WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and limitations under the License.

console.log('ui-utils.js loaded successfully');

(function (_global) {
  /**
   * Populate a native <select> dropdown with OpenHAB items.
   * @param node    the current node instance
   * @param allowEmpty  if true, adds a “[No item]” blank option
   */
  function openhabEditPrepare(node, allowEmpty) {
    // Fix existing array data
    if (Array.isArray(node.itemname)) {
      node.itemname = node.itemname[0] || "";
    }

    const $ctrlSel = $("#node-input-controller");
    const $itemSel = $("#node-input-itemname");

    let allItemNames = [];

    async function updateItems(controllerConfig, selected) {
      $itemSel.empty();

      if (!controllerConfig) {
        return $itemSel.append(
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
        let specialOption = allowEmpty
          ? { value: "", text: "[No item]" }
          : { value: "", text: "Select item..." };
        if (document.getElementById('node-input-item-filter')) {
          makeFilterableDropdown('node-input-item-filter', 'node-input-itemname', allItemNames, specialOption);
        }
        // Always add the special option first
        $itemSel.append($("<option>").val(specialOption.value).text(specialOption.text));

        items.forEach(item => {
          const option = $("<option>").val(item.name).text(item.name);
          if (item.name === (selected || node.itemname)) {
            option.prop('selected', true);
          }
          $itemSel.append(option);
        });
      }
      catch (err) {
        console.warn("Failed loading items", err);
        $itemSel.empty();
        $itemSel.append(
          $("<option disabled>").text("⚠️ Failed to load items")
        );
      }
    }

    // initial load

    
    const controllerNode = RED.nodes.node(node.controller);
    if (controllerNode) {
      updateItems(controllerNode, node.itemname);
    }

    // reload when controller dropdown changes
    $ctrlSel.on("change", () => {
      const newCtrl = RED.nodes.node($ctrlSel.val());
      updateItems(newCtrl, node.itemname);
    });
  }

  /**
   * Makes a <select> element filterable by a text input.
   * @param {string} filterInputId - The ID of the text input for filtering.
   * @param {string} selectId - The ID of the select element to filter.
   * @param {Array<string>} allOptions - The full list of options.
   * @param {Object} [specialOption] - Optional. An object { value, text } for a special first option.
   */
  function makeFilterableDropdown(filterInputId, selectId, allOptions, specialOption) {
    const filterInput = document.getElementById(filterInputId);
    const select = document.getElementById(selectId);

    function populateDropdown(options) {
      select.innerHTML = '';
      if (specialOption) {
        const opt = document.createElement('option');
        opt.value = specialOption.value;
        opt.text = specialOption.text;
        select.appendChild(opt);
      }
      options.forEach(item => {
        const option = document.createElement('option');
        option.value = item;
        option.text = item;
        select.appendChild(option);
      });
    }

    filterInput.addEventListener('input', function() {
      const filter = this.value.toLowerCase();
      const filtered = allOptions.filter(item => item.toLowerCase().includes(filter));
      populateDropdown(filtered);
    });

    // Initial population
    populateDropdown(allOptions);
  }
  window.openhabEditPrepare = openhabEditPrepare;
  window.makeFilterableDropdown = makeFilterableDropdown;
})(window);



