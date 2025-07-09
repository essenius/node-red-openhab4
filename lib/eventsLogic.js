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

const { OpenhabConnection } = require("./openhabConnection");
const { ConsumerNodeBase } = require('./consumerNodeBase');
const { EVENT_TYPES, SWITCH_STATUS, RETRY_CONFIG } = require('./openhabConstants');

class EventsNode extends ConsumerNodeBase {
    constructor(node, config, controller, utils) {
        super(node, config, controller, utils);
        this.fallbackTimer = null;
        this.connection = null;
    }

    getNodeType() {
        return 'Events';
    }

    setupNodeLogic() {
        // Wait for controller to be ready instead of arbitrary delay
        this.waitForControllerReady();
    }

    waitForControllerReady() {
        // Check if controller is already connected
        if (this.isControllerReady()) {
            this.node.log("Events: Controller is ready, starting event source");
            this.startEventSource();
            return;
        }

        // Listen for controller ready signal
        this.node.log("Events: Waiting for controller to be ready...");
        this.node.setStatusWaiting("waiting for controller");

        const onControllerReady = (state) => {
            if (state === SWITCH_STATUS.ON) {
                this.node.log("Events: Controller is now ready, starting event source");
                this.controller.removeListener(EVENT_TYPES.COMMUNICATION_STATUS, onControllerReady);
                this.startEventSource();
            }
        };

        this.controller.on(EVENT_TYPES.COMMUNICATION_STATUS, onControllerReady);

        // Fallback timeout in case controller never signals ready
        this.fallbackTimer = setTimeout(() => {
            this.node.warn("Events: Controller ready timeout, starting event source anyway");
            this.controller.removeListener(EVENT_TYPES.COMMUNICATION_STATUS, onControllerReady);
            this.startEventSource();
        }, RETRY_CONFIG.CONTROLLER_READY_TIMEOUT);
    }

    isControllerReady() {
        // Check if controller has an active connection or is in a ready state
        return this.controller && 
               typeof this.controller.getConfig === 'function' &&
               this.controller.getConfig() &&
               this.controller.getConfig().host;
    }

    startEventSource() {
        this.node.log("Events: setting up connection for config: " + JSON.stringify(this.controller.getConfig()));

        // Create a new connection instance
        this.connection = new OpenhabConnection(this.controller.getConfig(), this.node);
        
        // Set up custom message handler for events
        const handleMessage = (msg) => {
            this.handleEventMessage(msg);
        };
        
        // Set up custom open handler
        const handleOpen = () => {
            this.node.setStatusConnected();
        };
        
        // Start event stream with topic filter and custom handlers
        this.connection.startEventSource({
            topics: "openhab/*/*",
            onMessage: handleMessage,
            onOpen: handleOpen
        });
        
        this.node.setStatusReady();
    }

    handleEventMessage(msg) {
        try {
            // Safely parse the event data
            if (!msg.data || msg.data.trim() === "") {
                this.node.warn("Received empty event data, ignoring");
                return;
            }
            
            const data = JSON.parse(msg.data);
            if (typeof data.payload === "string" && data.payload.trim() !== "") {
                try {
                    data.payload = JSON.parse(data.payload);
                } catch (payloadError) {
                    this.node.warn(`Failed to parse event payload as JSON: ${data.payload}. Error: ${payloadError.message}`);
                    // Keep the payload as string if it's not valid JSON
                }
            }
            
            this.node.send(data);
        } catch (e) {
            this.node.error("Error parsing event data: " + e.message);
            this.node.setStatusError("Event parsing error");
        }
    }

    handleInput(msg) {
        // Events node typically doesn't handle input messages
        this.node.warn("Events node received input message - no action taken");
    }

    cleanup() {
        this.node.log("Events node cleanup");
        
        // Clear fallback timer
        if (this.fallbackTimer) {
            clearTimeout(this.fallbackTimer);
            this.fallbackTimer = null;
        }
        
        // Close connection (this will handle all cleanup)
        if (this.connection) {
            this.connection.close();
            this.connection = null;
        }
        
        this.node.setStatusDisconnected();
    }
}

function setupEventsNode(node, config, controller) {
    return new EventsNode(node, config, controller);
}

module.exports = { setupEventsNode };
