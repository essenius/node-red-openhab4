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

const { EVENT_TYPES, SWITCH_STATUS, STATE, STATE_MAPPING } = require('./constants');

/** Base class for openHAB consumer nodes (nodes that consume a controller).
  * Handles common patterns like setting up basic event handlers, status management, and lifecycle. */
class ConsumerNodeBase {
    constructor(node, config, controller, utils = {}) {
        this.node = node;

        this.config = config;
        this.controller = controller;
        this.utils = utils;
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
        this._onConnectionError = (err) => {
            this.setStatus(STATE.ERROR, err);
        };
        this._onConnectionStatus = (state) => {
            if (state === SWITCH_STATUS.ON) {
                this.setStatus(STATE.READY, "ready");
            } else {
                this.setStatus(STATE.WAITING, "Disconnected from openHAB");
            }
        };

        this.controller.on(EVENT_TYPES.CONNECTION_ERROR, this._onConnectionError);
        this.controller.on(EVENT_TYPES.CONNECTION_STATUS, this._onConnectionStatus);

    }

    /** Setup the node. This needs to be called separately. Since it's a base class, we can't call it in the constructor
      * as subclasses may not be ready yet. */
    setupNode() {
        this.setupNodeName();
        this.setStatus(STATE.INIT, "initializing");

        if (!this.controller) {
            const error = "No controller configured. Please select an openHAB controller in the node configuration.";
            this.node.error(error);
            this.setStatus(STATE.ERROR, "no controller");
            // make sure stays running with basic handlers
            this.node.log(`${this.getNodeType()} node: no controller configured, staying in error state`);
            this.setupNodeLogic({ error: "No controller configured" });
            return;
        }

        // we have a valid controller. Setup event handlers for input and close events

        this.node.on("input", (msg) => {
            this.handleInput(msg);
        });

        this.node.on("close", () => {
            this.switchOffHandler(EVENT_TYPES.CONNECTION_ERROR, this._onConnectionError);
            this.switchOffHandler(EVENT_TYPES.CONNECTION_STATUS, this._onConnectionStatus);
            this.cleanup();
        });

        this.setStatus(STATE.WAITING, "Waiting for openHAB");
        this.setupControllerEvents();
        this.setupNodeLogic();
        return this;
    }

    switchOffHandler(eventType, handler) {
        if (this.controller) {
            this.node.log(`Switching off handler for ${eventType}`);
            this.controller.off(eventType, handler);
        }
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
    setupNodeLogic(_options = {}) { }

    /** Default input handler. Subclasses can override this method if they want to handle input messages. */
    handleInput(_msg) { }

    /** Cleans up the node. This is called when the node is closed. Subclasses can override this method to perform custom cleanup. */
    cleanup() { }

    /** Refreshes the node status based on the current state. */
    refreshNodeStatus(state) {
        if (state == null || state === '?') { // == null catches both undefined and null
            this.setStatus(STATE.WARNING, "unknown");
            return;
        }

        const isFalsy = !state || state === "OFF";
        this.setStatus(isFalsy ? STATE.OK_FALSY : STATE.OK, state);
    }

    /** Truncate a message to a maximum length, adding "..." if it exceeds the limit. */
    truncateMessage(message, maxLength = 30) {
        const result =  (message.length > maxLength) ? message.substring(0, maxLength - 3) + "..." : message;
        return result;
    }

    /** set the status field in the node using semantic status mapping */
    setStatus(state, text = "") {
        let mapping = STATE_MAPPING[state];
        if (!mapping) {
            this.node.warn(`Unknown status state: ${state}. Using ERROR state.`);
            mapping = STATE_MAPPING[STATE.ERROR];
        }
        this.node.status({
            fill: mapping.fill,
            shape: mapping.shape,
            text: this.truncateMessage(String(text))
        });
    }

    /** Clear the status field of the node */
    clearStatus() {
        this.node.status({});
    }
}

module.exports = { ConsumerNodeBase };
