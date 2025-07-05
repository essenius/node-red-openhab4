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

function setupOpenHABGet(node, config, controller) {

  node.status({ fill: "grey", shape: "ring", text: "ready" });
  
  node.on("input", function (msg) {
    const item = config.itemname?.length > 0 ? config.itemname : msg.item;

    if (!item) {
      node.status({ fill: "red", shape: "ring", text: "no item specified" });
      node.error("No item name specified in config or msg.item");
      return;
    }

        // Show requesting status
    node.status({ fill: "blue", shape: "dot", text: "requesting..." });

    controller.control(
      item,
      null,
      null,
        function (body) {
        try {
          const itemData = JSON.parse(body);
          
          // Show the item value in status
          const displayValue = itemData.state || "unknown";
          
          // Limit status text length for display
          const truncatedText = displayValue.length > 30 ? 
            displayValue.substring(0, 27) + "..." : displayValue;
          
          node.status({ fill: "green", shape: "dot", text: truncatedText });

          // Prepare message
          msg.payload_in = msg.payload;
          msg.payload = itemData;
          msg.itemname = item;
          
          node.send(msg);
          
        } catch (err) {
          // If JSON parsing fails, treat as plain text response
          node.warn(`Failed to parse JSON for item ${item}: ${err.message}`);
          const truncatedText = body.length > 30 ? body.substring(0, 27) + "..." : body;
            
          node.status({ fill: "yellow", shape: "dot", text: truncatedText });

          msg.payload_in = msg.payload;
          msg.payload = body;
          msg.itemname = item;
          
          node.send(msg);
        }
      },

      function (err) {
        node.status({ fill: "red", shape: "ring", text: String(err) });
        node.error(`Failed to get item ${item}: ${err}`);
      }
    );
  });

  node.on("close", () => {
    node.log("close");
  });
}

module.exports = { setupOpenHABGet };