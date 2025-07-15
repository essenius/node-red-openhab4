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

const { addStatusMethods, validateController } = require('./statusUtils');
const { EVENT_TYPES, SWITCH_STATUS, STATE } = require('./openhabConstants')
/**
 * Base class for openHAB consumer nodes (nodes that consume a controller)
 * Handles common patterns like controller validation, status management, and lifecycle
 */
class ConsumerNodeBase {
    constructor(node, config, controller, utils = {}) {
        this.node = node;

        // Merge credentials into config if present
        if (controller && controller.credentials) {
            this.config = { ...config, ...controller.credentials };
        } else {
            this.config = config;
        }

        this.controller = controller;
        this.utils = utils;

        // Add semantic status methods to the node
        addStatusMethods(this.node);

        console.log(`Constructed ${this.getNodeType()} node with config:`, this.config);

        //this.setupNode();
    }

    setupNodeName() {
        // Ensure the node has a proper name for debug window display
        if (!this.node.name) {
            const nodeType = this.getNodeType().toLowerCase();
            this.node.name = this.config.name || `openhab4-${nodeType}`;
        }
    }

    setupControllerEvents() {
        this.controller.on(EVENT_TYPES.COMMUNICATION_ERROR, (err) => {
            this.node.setStatusError(err);
        });

        this.controller.on(EVENT_TYPES.COMMUNICATION_STATUS, (state) => {
            if (state === SWITCH_STATUS.ON) {
                this.node.setStatusReady();
            } else {
                this.setStatusWaiting("Disconnected from openHAB");
            }
        });
    }

    // this needs to be called separately. Since it's a base class, we can't call it in the constructor
    // as subclasses may not be ready yet
    setupNode() {
        console.log(`Setting up ${this.getNodeType()} node logic`);
        // Set node name for debug window display (if not already set)
        this.setupNodeName();
        console.log(`Node name set to: ${this.node.name}`);
        this.node.setStatusInit();
        // Always set up basic Node-RED event handlers 
        console.log(`Set status init done`);
        this.setupBasicEventHandlers();
        console.log(`Finished setting up basic event handlers for ${this.getNodeType()} node`);
        // Validate controller
        const controllerOk = validateController(this.node, this.controller);
        if (!controllerOk) {
            // Controller validation failed - node shows "no controller" status
            // but stays running with basic handlers
            this.node.log(`${this.getNodeType()} node: no controller configured, staying in error state`);
            this.setupNodeLogic({ error: "No controller configured" });
            return;
        }
        console.log(`Controller is valid for ${this.getNodeType()} node`);
        // we have a valid controller
        this.node.setStatusWaiting("Waiting for openHAB");

        this.setupControllerEvents();

        this.setupNodeLogic();
        return this;
    }

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

    // Helper function to create standardized messages
    createMessage(payload, topic) {
        const { generateId } = this.utils;
        return {
            _msgid: generateId ? generateId() : undefined,
            payload: payload,
            topic: topic
        };
    }

    // Abstract methods that subclasses should implement
    getNodeType() {
        throw new Error('Subclasses must implement getNodeType()');
    }

    setupNodeLogic(options = {}) {
        throw new Error('Subclasses must implement setupNodeLogic()');
    }

    handleInput(msg) {
        // Default implementation - subclasses can override
        this.node.warn(`${this.getNodeType()} node received input message - no action taken`);
    }

    cleanup() {
        // Default implementation - subclasses can override
        this.node.log(`${this.getNodeType()} node cleanup`);
    }

    refreshNodeStatus(state) {
        console.log(`Refreshing node status for ${this.getNodeType()} node with state:`, state);
        if (state == null || state === '?') { // == null catches both undefined and null
            this.node.setStatusWarning("unknown");
        } else {
            console.log(`Setting node status for ${this.getNodeType()} node to:`, state);
            const isFalsy = (state === false || state === "OFF" || state === 0 || state === "");
            console.log(`Is state falsy? ${isFalsy}`);
            this.node.setStatus(isFalsy ? STATE.OK_FALSY : STATE.OK, state);
        }
        console.log(`Node status refreshed for ${this.getNodeType()} node with state:`, state);
    }
}

module.exports = { ConsumerNodeBase };
