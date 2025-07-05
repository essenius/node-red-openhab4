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

function buildAdminStaticPath(path) {
  return "openhab4/" + path;
}

(function (global) {
  /**
   * Populate a native <select> dropdown with OpenHAB items.
   * @param node    the current node instance
   * @param allowEmpty  if true, adds a “[No item]” blank option
   */
  function openhabEditPrepare(node, allowEmpty) {
    console.log('openhabEditPrepare called with node:', node);

        // Fix existing array data
    if (Array.isArray(node.itemname)) {
      node.itemname = node.itemname[0] || "";
    }

    const $ctrlSel = $("#node-input-controller");
    const $itemSel = $("#node-input-itemname");

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

        if (allowEmpty) {
          $itemSel.append($("<option>").val("").text("[No item]"));
        } else {
          $itemSel.append($("<option>").val("").text("Select item..."));
        }

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

  window.openhabEditPrepare = openhabEditPrepare;
})(window);



