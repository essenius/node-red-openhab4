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
const { CONCEPTS, OPERATION, STATE } = require('./constants');

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

        const { valid, concept, identifier } = this._getValidatedTopic(msg);
        if (!valid) return;

        const conceptType = this.getConceptType(concept);
        if (!conceptType) return; // getConceptType will set the error status if the concept is unknown, so we can just return here.

        const operation = this._getOperation(msg, conceptType);
        if (!operation) return; // no need to do anything if we don't have an operation or a payload to send.

        const payload = msg.payload || this.config.payload;
        this.setStatus(STATE.WORKING, `${payload} ⇨`);
        const result = await this.controller.handler.control(conceptType, identifier, operation, payload);
        if (result.ok) {
            this.setValueStatus(`${payload} ✓`);
            const message = {
                ...msg, // copy all properties from the original message, so we can preserve any custom properties that the user might have added.
                ...result.data, // add properties from the result data
                openhabControl: { operation }, 
                inputMessage: msg
            }
            const outMsg = this.createMessage({ message });
            this.node.send(outMsg);
        } else {
            this.handleSendError(result.message || "send failed", `${payload} ✗`);
        }
    }

    _getOperation(msg, conceptType) {
        const operation = (msg.openhabControl?.operation || this.config.operation).trim().toLowerCase();
        switch (operation) {
                case OPERATION.COMMAND:
                    if (!conceptType.commandVerb) {
                        this.handleSendError(`Concept "${conceptType.name}" does not support command operation`, "command unsupported");
                        return null;
                    } 
                    return OPERATION.COMMAND;
                case OPERATION.UPDATE:
                    if (!conceptType.updateVerb) {
                        this.handleSendError(`Concept "${conceptType.name}" does not support update operation`, "update unsupported");
                        return null;
                    }   
                    return OPERATION.UPDATE;
                default:
                    this.handleSendError(`"Output node does not support "${operation}". Choose "${OPERATIONS.COMMAND}" or "${OPERATIONS.UPDATE}".`, "unsupported operation");
                    return null;
        }
    }

    _getValidatedTopic(msg) {   
        let { valid, concept, identifier } = this.parseTopic(msg.topic);
        if (!valid) {
            console.log("Topic is not valid, falling back to config:", this.config);
            concept = this.config.concept;
            identifier = this.config.identifier;
            valid = !!concept && !!identifier;
        }
        console.log(`Parsed topic: concept="${concept}", identifier="${identifier}"`);
        if (concept != CONCEPTS.ITEMS) {
            this.handleSendError(`Only concept "${CONCEPTS.ITEMS}" is supported for Out nodes, but found "${concept}"`, "invalid concept");
            valid = false;
        } else if (!identifier) {
            this.handleSendError("No resource specified. Set item in configuration or provide msg.topic.", "no item specified");
            valid = false;
        }
        return { valid, concept, identifier };
    }
}

/** Entry point to create and setup the OutNode. Called by the out node registration. */
function setupOutNodeHandler(node, config, controller) {
    return new OutNodeHandler(node, config, controller).setupNode();
}

module.exports = { OutNodeHandler, setupOutNodeHandler };
