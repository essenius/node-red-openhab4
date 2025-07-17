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

const { addStatusMethods } = require('./statusUtils');
const { EVENT_TYPES, SWITCH_STATUS, STATE } = require('./constants')

/** Base class for openHAB consumer nodes (nodes that consume a controller).
  * Handles common patterns like setting up basic event handlers, status management, and lifecycle. */
class ConsumerNodeBase {
    constructor(node, config, controller, utils = {}) {
        this.node = node;

        this.config = config;
        this.controller = controller;
        this.utils = utils;

        // Add semantic status methods to the node
        addStatusMethods(this.node);
    }

    /** Returns the type of the node, used for logging and debugging.
      * Subclasses should implement this method to return their specific type.
      * @returns {string} The type of the node.  */
    getNodeType() {
        throw new Error('Subclasses must implement getNodeType()');
    }

    /** Sets up the node name for display in the Node-RED debug window. */
    setupNodeName() {
        if (!this.node.name) {
            const nodeType = this.getNodeType().toLowerCase();
            this.node.name = this.config.name || `openhab4-${nodeType}`;
        }
    }

    /** Sets up the ConnectionError and ConnectionStatus event handlers */
    setupControllerEvents() {
        this.controller.on(EVENT_TYPES.CONNECTION_ERROR, (err) => {
            this.node.setStatusError(err);
        });

        this.controller.on(EVENT_TYPES.CONNECTION_STATUS, (state) => {
            if (state === SWITCH_STATUS.ON) {
                this.node.setStatusReady();
            } else {
                this.setStatusWaiting("Disconnected from openHAB");
            }
        });
    }

    /** Setup the node. This needs to be called separately. Since it's a base class, we can't call it in the constructor
      * as subclasses may not be ready yet. */
    setupNode() {
        this.setupNodeName();
        this.node.setStatusInit();
        this.setupBasicEventHandlers();

        if (!this.controller) {
            const error = "No controller configured. Please select an openHAB controller in the node configuration.";
            this.node.error(error);
            this.node.setStatusError("no controller");
            // make sure stays running with basic handlers
            this.node.log(`${this.getNodeType()} node: no controller configured, staying in error state`);
            this.setupNodeLogic({ error: "No controller configured" });
            return;
        }
        // we have a valid controller
        this.node.setStatusWaiting("Waiting for openHAB");
        this.setupControllerEvents();
        this.setupNodeLogic();
        return this;
    }

    /** Sets up basic event handlers for the node. This includes handling input messages and closing the node. */
    setupBasicEventHandlers() {
        this.node.on("input", (msg) => {
            if (!this.controller) {
                this.node.warn(`${this.getNodeType()} node received input message but no controller is configured`);
                return;
            }
            this.handleInput(msg);
        });

        this.node.on("close", () => {
            this.node.log(`${this.getNodeType()} node closing`);
            if (this.controller) {
                this.cleanup();
            }
        });
    }

    /** Creates a standardized message object.
 * @param {Object} params - Message parameters.
 * @param {*} params.payload - The payload (required).
 * @param {string} [params.event] - Event type (required).
 * @param {string} [params.item] - Optional item.
 * @returns {Object} The message object.
 */
    createMessage({ payload, event, item, message }) {
        const { generateId } = this.utils;
        const messageId = generateId ? generateId() : undefined;
        if (message !== undefined) {
            message._msgid = messageId;
        } else {
            if (payload === undefined || event === undefined) {
                throw new Error("createMessage requires either message or payload and event parameters");
            }
            message = {
                _msgid: messageId,
                payload,
                event
            };
        }
        if (item !== undefined) message.item = item;
        return message;
    }

    /** Setup hook for subclasses. Intended for setup logic in the child, but does not have to be overridden */
    setupNodeLogic(_options = {}) {}

    /** Default input handler. Subclasses can override this method if they want to handle input messages. */
    handleInput(_msg) {}

    /** Cleans up the node. This is called when the node is closed. Subclasses can override this method to perform custom cleanup. */
    cleanup() {}

    /** Refreshes the node status based on the current state. */
    refreshNodeStatus(state) {
        if (state == null || state === '?') { // == null catches both undefined and null
            this.node.setStatusWarning("unknown");
        } else {
            const isFalsy = (state === false || state === "OFF" || state === 0 || state === "");
            this.node.setStatus(isFalsy ? STATE.OK_FALSY : STATE.OK, state);
        }
    }
}

module.exports = { ConsumerNodeBase };
