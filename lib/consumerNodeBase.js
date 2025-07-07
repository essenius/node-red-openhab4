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

const { addStatusMethods, validateController } = require('./statusUtils');

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
        
        // Set node name for debug window display (if not already set)
        this.setupNodeName();
        
        this.setupNode();
    }

    setupNodeName() {
        // Ensure the node has a proper name for debug window display
        if (!this.node.name) {
            const nodeType = this.getNodeType().toLowerCase();
            this.node.name = this.config.name || `openhab4-${nodeType}`;
        }
    }
    
    setupNode() {
        
        // Always set up basic Node-RED event handlers
        this.setupBasicEventHandlers();
        
        // Validate controller
        if (!validateController(this.node, this.controller)) {
            // Controller validation failed - node shows "no controller" status
            // but stays running with basic handlers
            this.node.log(`${this.getNodeType()} node: no controller configured, staying in error state`);
            return;
        }
        
        // Controller is valid - set up node-specific logic
        this.setupNodeLogic();
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
    
    setupNodeLogic() {
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
}

module.exports = { ConsumerNodeBase };
