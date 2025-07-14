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

"use strict";

const { ConsumerNodeBase } = require('./consumerNodeBase');

class GetNode extends ConsumerNodeBase {
    getNodeType() {
        return 'Get';
    }

    setupNodeLogic() {
        this.node.setStatusReady();
    }

    handleInput(msg) {
        const item = this.config.itemname || msg.item || "";

        if (!item) {
            this.node.setStatusError("no item specified");
            this.node.error("No item name specified in config or msg.item");
            return;
        }

        // Show requesting status
        this.node.setStatusWorking("requesting...");

        var response = this.controller.control({item, consumerNode: this.node});
        if (!(response instanceof Error)) {
            this.handleGetResponse(response, msg, item);
        }
    }

    handleGetResponse(body, msg, item) {
        try {
            const itemData = JSON.parse(body);
            
            // Show the item value in status
            const displayValue = itemData.state || "unknown";
            
            // Limit status text length for display
            const truncatedText = displayValue.length > 30 ? 
                displayValue.substring(0, 27) + "..." : displayValue;
            
            this.node.setStatusOK(truncatedText);

            // Prepare message
            msg.payload_in = msg.payload;
            msg.payload = itemData;
            msg.item = item;
            
            this.node.send(msg);
            
        } catch (err) {
            // If JSON parsing fails, treat as plain text response
            this.node.warn(`Failed to parse JSON for item ${item}: ${err.message}`);
            const truncatedText = body.length > 30 ? body.substring(0, 27) + "..." : body;
                
            this.node.setStatusWarning(truncatedText);

            msg.payload_in = msg.payload;
            msg.payload = body;
            msg.item = item;
            
            this.node.send(msg);
        }
    }

    cleanup() {
        this.node.log("Get node cleanup");
    }
}

function setupGetNode(node, config, controller) {
    return new GetNode(node, config, controller).setupNode();
}

module.exports = { setupGetNode };