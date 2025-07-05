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

const { OpenhabConnection } = require("./openhabConnection");

function setupOpenHABEvents(node, config, controller) {
  let startupTimer = null;
  let connection = null;
  
  function startEventSource() {
    if (!controller) {
      node.error("Invalid controller");
      return;
    }
    
    node.log("Events: setting up connection for config: " + JSON.stringify(controller.getConfig()));
    
    // Create a new connection instance
    connection = new OpenhabConnection(controller.getConfig(), node);
    
    // Set up custom message handler for events
    const handleMessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (typeof data.payload === "string") {
          data.payload = JSON.parse(data.payload);
        }
        node.send(data);
      } catch (e) {
        node.error("Unexpected Error : " + e);
        node.status({ fill: "red", shape: "dot", text: "Unexpected Error : " + e });
      }
    };
    
    // Set up custom open handler
    const handleOpen = () => {
      node.status({ fill: "green", shape: "dot", text: " " });
    };
    
    // Start event stream with topic filter and custom handlers
    connection.startEventSource({
      topics: "openhab/*/*",
      onMessage: handleMessage,
      onOpen: handleOpen
    });
    
    node.status({ fill: "green", shape: "ring", text: " " });
  }

  // Add startup delay
  startupTimer = setTimeout(() => {
    startupTimer = null;
    startEventSource();
  }, 5000);

  node.on("close", function () {
    node.log("Events: closing node");
    
    // Clear startup timer
    if (startupTimer) {
      clearTimeout(startupTimer);
      startupTimer = null;
    }
    
    // Close connection (this will handle all cleanup)
    if (connection) {
      connection.close();
      connection = null;
    }
    
    node.status({ fill: "red", shape: "dot", text: "CommunicationStatus OFF" });
  });
}

module.exports = { setupOpenHABEvents };
