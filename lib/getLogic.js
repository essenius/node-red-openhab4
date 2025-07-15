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

//const _get = require('../nodes/get');

const { ConsumerNodeBase } = require('./consumerNodeBase');

class GetNode extends ConsumerNodeBase {
    getNodeType() {
        return 'Get';
    }

    setupNodeLogic() {
    }

    handleInput(msg) {
        const item = this.config.itemname || msg.item || "";

        if (!item) {
            this.handleErrorResponse(new Error("No item specified"));
            return;
        }

        // Show requesting status
        this.node.setStatusWorking("requesting...");

        var response = this.controller.control(item, null, null);
        if (response && typeof response.then === "function") {
            // Handle Promise
            response.then(resolved => {
                this.handleGetResponse(resolved, msg, item);
            }).catch(err => {
                this.handleErrorResponse(err);
            });
            return;
        }

        if (response instanceof Error) {
            this.handleErrorResponse(response);
        } else {
            this.handleGetResponse(response, msg, item);
        }
    }


    handleErrorResponse(error) {
        this.controller.handleControllerError(error, this.getNodeType());
        this.node.setStatusError(this.truncateMessage(error.message));

        // Prepare message
        //msg.payload_in = msg.payload;
        //msg.payload = { error: err.message };
        //msg.item = item;
        //this.node.send(msg);
    }

    truncateMessage(message, maxLength = 30) {
        return (message.length > maxLength) ? message.substring(0, maxLength - 3) + "..." : message;
    }

    handleGetResponse(body, msg, item) {
        try {
            const itemData = JSON.parse(body);
            if (itemData.error) {
                this.handleErrorResponse(new Error(itemData.error));
                return;
            }
            // Show the item value in status
            const displayValue = this.truncateMessage(itemData.state || "unknown");
            this.refreshNodeStatus(displayValue)

            // Prepare message
            msg.payload_in = msg.payload;
            msg.payload = itemData;
            msg.item = item;
            this.node.send(msg);
        } catch (error) {
            // If JSON parsing fails, treat as plain text response
            this.node.warn(`Failed to parse JSON for item ${item}: ${error.message}`);
            const message = this.truncateMessage(`${item}: ${body}`);
            this.node.setStatusWarning(message);
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