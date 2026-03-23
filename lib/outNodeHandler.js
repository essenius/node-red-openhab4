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

'use strict';

const { ConsumerNodeHandler } = require('./consumerNodeHandler');

const { STATE } = require('./constants');

/** OutNode class for handling outgoing OpenHAB commands */
class OutNodeHandler extends ConsumerNodeHandler {
    setupNodeLogic() {
        this.enableInputHandling();
    }

    handleSendError(message, shortMessage) {
        this.node.log(message);
        this.setStatus(STATE.ERROR, shortMessage);
    }

    /** Override to handle input messages. It will prepare a message for OpenHAB, and send it to OpenHAB.
     * If the send is successful, it will update the node status and send the original message out. */
    async handleInput(msg) {
        let item = this.getResource(msg);

        if (!item) {
            this.setStatus(STATE.ERROR, 'found no item');
            return;
        }

        // action is mandatory in config, so we can assume it is always available. Not so in the message.
        const action = this.prioritizedProperty(msg.action, this.config.action).trim().toLowerCase();
        const payload = this._normalizePayload(this.prioritizedProperty(msg.payload, this.config.payload));

        this.setStatus(STATE.WORKING, `${payload} ⇨`);
        const result = await this.controller.handler.control(item, action, payload);
        if (result.ok) {
            this.setValueStatus(`${payload} ✓`);
            const message = {
                ...msg, // copy all properties from the original message, so we can preserve any custom properties that the user might have added.
                ...result.data, // add properties from the result data
                topic: item.topic(), // override topic with the one actually used
                identifier: item.identifier,
                payload,
                action,
                input: msg,
            };
            delete msg.type; // to make sure we're not leaving it in from the incoming message, causing confusion

            const outMsg = this.createMessage({ message });
            this.node.send(outMsg);
        } else {
            this.handleSendError(result.code || `send failed for ${item.identifier}: ${result.message}`, `${payload} ✗ ${item.identifier}`);
        }
    }

    // --- Private methods ---

    _normalizePayload(payload) {
        // make buffers safe
        if (Buffer.isBuffer(payload)) {
            return payload.toString('utf8');
        }

        if (typeof payload === 'number' || typeof payload === 'boolean') {
            return String(payload);
        }
        // leave plain objects intact, httpRequest makes JSON out of that.
        return payload;
    }
}

/** Entry point to create and setup the OutNode. Called by the out node registration. */
function setupOutNodeHandler(node, config, controller) {
    return new OutNodeHandler(node, config, controller).setupNode();
}

module.exports = { OutNodeHandler, setupOutNodeHandler };
