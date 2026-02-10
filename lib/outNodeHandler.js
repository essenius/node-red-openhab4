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
const { STATE, CONTROL_TOPICS } = require('./constants');

/** OutNode class for handling outgoing OpenHAB commands */
class OutNodeHandler extends ConsumerNodeHandler {

    setupNodeLogic() {
        this.enableInputHandling();
    }
    
    handleSendError(message, shortMessage) {
        this.setStatus(STATE.ERROR, shortMessage);
    }

    _prioritizeString(configProperty, msgProperty, defaultValue = "") {
        if (configProperty && configProperty.length > 0) { // no null, empty string, or undefined 
            return configProperty;
        }
        if (msgProperty != null) { // no null or undefined, but do allow empty string
            return msgProperty;
        }
        return defaultValue;
    }

    /** Override to handle input messages. It will prepare a message for OpenHAB, and send it to OpenHAB. 
     * If the send is successful, it will update the node status and send the original message out. */
    async handleInput(msg) {
        const item = this._prioritizeString(this.config.itemName, msg.item);
        if (!item) {
            this.handleSendError("No item specified. Set item in configuration or provide msg.item", "no item specified");
            return;
        }
        const topic = this._prioritizeString(this.config.topic, msg.topic, CONTROL_TOPICS.ITEM_UPDATE);
        const payload = this._prioritizeString(this.config.payload, msg.payload);

        this.setStatus(STATE.WORKING, `${payload} ⇨`);

        const result = await this.controller.handler.control(this, item, topic, payload);
        if (result.ok) {
            this.setItemStatus(`${payload} ✓`);
            this.node.send(msg);
        } else {
            this.handleSendError(result.message || "send failed", `${payload} ✗`);
        }
    }
}

/** Entry point to create and setup the OutNode. Called by the out node registration. */
function setupOutNodeHandler(node, config, controller) {
    return new OutNodeHandler(node, config, controller).setupNode();
}

module.exports = { OutNodeHandler, setupOutNodeHandler };
