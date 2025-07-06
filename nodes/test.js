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

const { addStatusMethods, validateController } = require('../lib/statusUtils');

module.exports = function (RED) {
  function createTestNode(config) {
    
    RED.nodes.createNode(this, config);
    const node = this;

    // Add semantic status methods to the node
    addStatusMethods(node);

    const controller = RED.nodes.getNode(config.controller);

    if (!validateController(node, controller)) {
      return;
    }

    node.on("input", async function (msg) {
      // Use controller's method
      try {
        const response = await controller.getStatus(); // or .getItem("SomeItem")
        node.log(`Controller responded: ${JSON.stringify(response)}`);
        msg.payload = response;
        node.send(msg);
      } catch (err) {
        node.error("Failed to contact OpenHAB: " + err.message);
      }
    });
  }

  RED.nodes.registerType("openhab4-test", createTestNode);
};