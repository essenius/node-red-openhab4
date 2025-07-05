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

const { STATUS_STATES, STATUS_MAPPING } = require('./openhabConstants');

/**
 * Adds semantic status functionality to a Node-RED node
 * @param {object} node - The Node-RED node instance
 */
function addStatusMethods(node) {
    /**
     * Set node status using semantic state enum
     * @param {string} state - One of STATUS_STATES values
     * @param {string} [text] - Optional status text to display
     */
    node.setStatus = function(state, text = "") {
        const mapping = STATUS_MAPPING[state];
        if (!mapping) {
            node.warn(`Unknown status state: ${state}. Using ERROR state.`);
            const errorMapping = STATUS_MAPPING[STATUS_STATES.ERROR];
            node.status({ 
                fill: errorMapping.fill, 
                shape: errorMapping.shape, 
                text: text || `Unknown state: ${state}` 
            });
            return;
        }
        
        node.status({ 
            fill: mapping.fill, 
            shape: mapping.shape, 
            text: text 
        });
    };

    /**
     * Clear node status
     */
    node.clearStatus = function() {
        node.status({});
    };

    /**
     * Convenience methods for common status states
     */
    node.setStatusInit = (text = "initializing") => node.setStatus(STATUS_STATES.INIT, text);
    node.setStatusReady = (text = "ready") => node.setStatus(STATUS_STATES.READY, text);
    node.setStatusWaiting = (text = "waiting...") => node.setStatus(STATUS_STATES.WAITING, text);
    node.setStatusWorking = (text = "working...") => node.setStatus(STATUS_STATES.WORKING, text);
    node.setStatusConnected = (text = "connected") => node.setStatus(STATUS_STATES.CONNECTED, text);
    node.setStatusOK = (text = "") => node.setStatus(STATUS_STATES.OK, text);
    node.setStatusWarning = (text = "warning") => node.setStatus(STATUS_STATES.WARNING, text);
    node.setStatusError = (text = "error") => node.setStatus(STATUS_STATES.ERROR, text);
    node.setStatusDisconnected = (text = "disconnected") => node.setStatus(STATUS_STATES.DISCONNECTED, text);
}

/**
 * Validates that a controller is configured and shows appropriate error if not
 * @param {object} node - The Node-RED node instance
 * @param {object} controller - The controller object to validate
 * @returns {boolean} - True if controller is valid, false if invalid
 */
function validateController(node, controller) {
    if (!controller) {
        const error = "No controller configured. Please select an openHAB controller in the node configuration.";
        node.error(error);
        node.setStatusError("no controller");
        return false;
    }
    return true;
}

module.exports = { 
    addStatusMethods,
    validateController,
    STATUS_STATES 
};
