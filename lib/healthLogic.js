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

const { EVENT_TYPES, SWITCH_STATUS } = require("./openhabConstants");
const { ConsumerNodeBase } = require('./consumerNodeBase');
const { validateController } = require('./statusUtils');

class HealthNode extends ConsumerNodeBase {
    constructor(node, config, controller, utils) {
        super(node, config, controller, utils);
        this.lastStatus = null; // Track last status to avoid duplicates
    }
    setupNode() {
        
        // Always set up basic Node-RED event handlers
        this.setupBasicEventHandlers();
        
        // Validate controller
        if (!validateController(this.node, this.controller)) {
            // Controller validation failed - emit error message and stay in error state
            this.node.log(`${this.getNodeType()} node: no controller configured, emitting error`);
            
            // Send error message through error channel (2nd output)
            const errorMsg = this.createMessage("No controller configured", "ConfigurationError");
            this.node.send([null, errorMsg, null]);
            
            return;
        }
        
        // Controller is valid - set up node-specific logic
        this.setupNodeLogic();
    }

    setupBasicEventHandlers() {
        // Call parent implementation
        super.setupBasicEventHandlers();
    }

    getNodeType() {
        return 'Health';
    }
    
    setupNodeLogic() {
        // Listen for communication status changes
        this.controller.on(EVENT_TYPES.COMMUNICATION_STATUS, (state) => {
            // Only send status message if it's different from the last one
            if (this.lastStatus !== state) {
                this.node.log(`Health node status change: ${this.lastStatus} -> ${state}`);
                this.lastStatus = state;
                
                const statusMsg = this.createMessage(state, "ConnectionStatus");
                this.node.send([statusMsg, null, null]);
                
                if (state === SWITCH_STATUS.ON) {
                    this.node.setStatusConnected("connected");
                } else {
                    this.node.setStatusDisconnected("disconnected");
                }
            } else {
                this.node.log(`Health node ignoring duplicate status: ${state}`);
            }
        });

        // Listen for communication errors
        this.controller.on(EVENT_TYPES.COMMUNICATION_ERROR, (err) => {
            const errorMsg = this.createMessage(String(err), "ConnectionError");
            this.node.send([null, errorMsg, null]);
            
            this.node.setStatusError("error: " + err);
        });

        // Listen for all raw events (global event monitoring)
        this.controller.on(EVENT_TYPES.RAW_EVENT, (event) => {
            const rawMsg = this.createMessage(event, "RawEvent");
            this.node.send([null, null, rawMsg]);
        });

        // Set initial status
        this.node.setStatusReady("monitoring");
    }
    
    handleInput(msg) {
        // Health node doesn't typically process input messages
        this.node.warn("Health node received input message - no action taken");
    }
    
    cleanup() {
        // Event listeners are automatically cleaned up by the controller
        super.cleanup();
    }
}

function setupHealthNode(node, config, controller, utils) {
    return new HealthNode(node, config, controller, utils);
}

module.exports = { setupHealthNode };