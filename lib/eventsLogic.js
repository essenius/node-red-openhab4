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
const { addStatusMethods, validateController } = require('./statusUtils');

function setupEventsNode(node, config, controller) {
  // Add semantic status methods to the node
  addStatusMethods(node);
  
  // Validate controller configuration
  if (!validateController(node, controller)) {
    return;
  }
  
  let startupTimer = null;
  let connection = null;
  
  function startEventSource() {
    node.log("Events: setting up connection for config: " + JSON.stringify(controller.getConfig()));
    
    // Create a new connection instance
    connection = new OpenhabConnection(controller.getConfig(), node);
    
    // Set up custom message handler for events
    const handleMessage = (msg) => {
      try {
        // Safely parse the event data
        if (!msg.data || msg.data.trim() === "") {
          node.warn("Received empty event data, ignoring");
          return;
        }
        
        const data = JSON.parse(msg.data);
        if (typeof data.payload === "string" && data.payload.trim() !== "") {
          try {
            data.payload = JSON.parse(data.payload);
          } catch (payloadError) {
            node.warn(`Failed to parse event payload as JSON: ${data.payload}`);
            // Keep the payload as string if it's not valid JSON
          }
        }
        node.send(data);
      } catch (e) {
        node.error("Error parsing event data: " + e.message);
        node.setStatusError("Event parsing error");
      }
    };
    
    // Set up custom open handler
    const handleOpen = () => {
      node.setStatusConnected();
    };
    
    // Start event stream with topic filter and custom handlers
    connection.startEventSource({
      topics: "openhab/*/*",
      onMessage: handleMessage,
      onOpen: handleOpen
    });
    
    node.setStatusReady();
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
    
    node.setStatusDisconnected();
  });
}

module.exports = { setupEventsNode };
