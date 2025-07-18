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
const { STATE } = require('./constants');

/** GetNode class for handling OpenHAB item retrieval */
class GetNode extends ConsumerNodeBase {

    /** Override to return the type of this node */
    getNodeType() {
        return 'Get';
    }

    /** Override to handle input messages. It will prepare a message for OpenHAB, send it out, and wait for the response. */
    async handleInput(msg) {
        const item = this.config.itemname || msg.item || "";

        if (!item) {
            this._handleErrorResponse(new Error("No item specified"));
            return;
        }

        // Show requesting status
        this.setStatus(STATE.WAITING, "requesting...");

        try {
            const response = await this.controller.control(item, null, null);
            this._handleGetResponse(response, msg, item);
        } catch (err) {
            this._handleErrorResponse(err);
        }
    }

    /** If we get an error, ask the controller to handle it, and set the node status */
    _handleErrorResponse(error) {
        this.controller.handleControllerError(error, this.getNodeType());
        this.setStatus(STATE.ERROR, error.message);
    }

    _isObjectWithField(value, field) {
        return value && typeof value === 'object' && !Array.isArray(value) && field in value;
    }

    /** Parse the response from OpenHAB, convert it to a message, and send that to the next node.
     * If an error occurs, set the node status to error and log the error message. */
    _handleGetResponse(body, msg, item) {
        let payload;
        if (this._isObjectWithField(body, 'state')) {
            payload = body.state;
        } else if (typeof body === "string") {
            payload = body; 
        } else {
            this._handleErrorResponse(new Error("Unexpected response format"));
            return;
        }
        console.log("GetNode.handleInput response payload:", payload);
        this.setItemStatus(payload)

        // Prepare message
        msg.payload_in = msg.payload;
        msg.payload = payload;
        msg.item_data = body; // full body as item_data
        msg.item = item;
        this.node.send(msg);
    }
}

/** Entry point to create and setup the GetNode. Called by the get node registration. */
function setupGetNode(node, config, controller) {
    return new GetNode(node, config, controller).setupNode();
}

module.exports = { GetNode, setupGetNode };