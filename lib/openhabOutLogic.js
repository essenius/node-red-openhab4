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

const { addStatusMethods, validateController } = require('./statusUtils');

function setupOpenhabOut(node, config, controller) {
  // Add semantic status methods to the node
  addStatusMethods(node);
  
  // Validate controller configuration
  if (!validateController(node, controller)) {
    return;
  }

  node.setStatusReady();

  node.on("input", function (msg) {
    const item = (config.itemname && config.itemname.length > 0) ? config.itemname : msg.item;
    const topic = (config.topic && config.topic.length > 0) ? config.topic : msg.topic;
    const payload = (config.payload && config.payload.length > 0) ? config.payload : msg.payload;

    if (!item) {
      node.setStatusError("no item specified");
      node.error("No item specified. Set item in configuration or provide msg.item");
      return;
    }

    if (payload === undefined || payload === null) {
      node.setStatusError("no payload specified");
      node.error("No payload specified. Set payload in configuration or provide msg.payload");
      return;
    }

    node.setStatusWorking("sending...");

    controller.control(
      item,
      topic,
      payload,
      function () {
        node.setStatusOK("sent");
        node.send(msg);
      },
      function (err) {
        node.setStatusError(String(err));
        node.error(`Failed to send to item '${item}': ${err}`);
      }
    );
  });

  node.on("close", function () {
    node.log("OpenHABOut: closing node");
    node.setStatusDisconnected();
  });
}

module.exports = { setupOpenhabOut };
