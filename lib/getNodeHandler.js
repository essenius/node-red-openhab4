// Copyright 2025-2026 Rik Essenius
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

const { ConsumerNodeHandler } = require('./consumerNodeHandler');
const { STATE } = require('./constants');

/** GetNode class for handling OpenHAB item retrieval */
class GetNodeHandler extends ConsumerNodeHandler {

    setupNodeLogic() {
        this.enableInputHandling();
    }

    /** Override to handle input messages. It will prepare a message for OpenHAB, send it out, and wait for the response. */
    async handleInput(msg) {
        const item = this.config.itemName || msg.item || "";

        // empty name is OK and will result in a call to /rest (returning version information, but also usable to check if tye system is online)

        this.setStatus(STATE.WAITING, "requesting...");
        const response = await this.controller.handler.control(this.node, item);
        this._handleGetResponse(response, msg, item);
    }

    _getPayload(body) {
        if (!body) return null;
        if (body.state !== undefined) return body.state;
        if (body.runtimeInfo?.version !== undefined) return body.runtimeInfo.version;
        if (typeof body === "string") return body; 
        return null;
    }

    /** Parse the response from OpenHAB, convert it to a message, and send that out.
     * If an error occurs, set the node status to error and log the error message. */
    _handleGetResponse(response, msg, item) {

        // An error was already passed on via the callback in control, no need to repeat here
        if (!response.ok) return;

        const payload = this._getPayload(response.data);
        if (payload == null) {
            this.setStatus(STATE.ERROR, "Empty response");
            return;
        }

        this.setItemStatus(payload);

        msg.payload_in = msg.payload || {};
        msg.payload = payload;
        msg.raw_response = response.data;
        if (item != null && item !== "") {
            msg.item = item;
            msg.name = item;
        } else {
            msg.name = "openhab_version";
        }
        this.node.send(msg);
    }
}

/** Entry point to create and setup the GetNode. Called by the get node registration. */
function setupGetNodeHandler(node, config, controller) {
    return new GetNodeHandler(node, config, controller).setupNode();
}

module.exports = { GetNodeHandler, setupGetNodeHandler };