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
const { STATE, CONTROL_TOPICS } = require('./constants');


/** OutNode class for handling outgoing OpenHAB commands */
class OutNode extends ConsumerNodeBase {

    /** Override to return the type of this node */
    getNodeType() {
        return 'Out';
    }

    handleSendError(message, shortMessage = null, error = null) {
        this.setStatus(STATE.ERROR, shortMessage || message);
        this.node.error(message);
        if (error && error.stack) {
            this.node.debug(error.stack);
        }
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
     * If the send is successful, it will update the node status and send the original message out. 
     * It is flagged as complex because of the many || in the first lines, which prioritize config over incoming message. */
    async handleInput(msg) {
        const item = this._prioritizeString(this.config.itemname, msg.item);
        const topic = this._prioritizeString(this.config.topic, msg.topic, CONTROL_TOPICS.ITEM_UPDATE);
        const payload = this._prioritizeString(this.config.payload, msg.payload);

        if (!item) {
            this.handleSendError("No item specified. Set item in configuration or provide msg.item", "no item specified");
            return;
        }

        this.setStatus(STATE.WORKING, `'${payload}' ⇨`);
        try {
            await this.controller.control(item, topic, payload);
            this.setItemStatus(`${payload} ✓`);
            this.node.send(msg);
        } catch (error) {
            this.handleSendError(error.message || "send failed", `${payload} ✗`, error);
        }
    }
}

/** Entry point to create and setup the OutNode. Called by the out node registration. */
function setupOutNode(node, config, controller) {
    return new OutNode(node, config, controller).setupNode();
}

module.exports = { setupOutNode };
