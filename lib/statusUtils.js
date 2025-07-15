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

const { STATE, STATE_MAPPING } = require('./constants');

/**
 * Adds semantic status functionality to a Node-RED node
 * @param {object} node - The Node-RED node instance
 */
function addStatusMethods(node) {
    /**
     * Set node status using semantic state enum
     * @param {string} state - One of STATE values
     * @param {string} [text] - Optional status text to display
     */
    node.setStatus = function (state, text = "") {
        let mapping = STATE_MAPPING[state];
        if (!mapping) {
            node.warn(`Unknown status state: ${state}. Using ERROR state.`);
            mapping = STATE_MAPPING[STATE.ERROR];
        }

        node.status({
            fill: mapping.fill,
            shape: mapping.shape,
            text: text || "unknown"
        });
    };

    /**
     * Clear node status
     */
    node.clearStatus = function () {
        node.status({});
    };

    /**
     * Convenience methods for common status states
     */
    node.setStatusInit = (text = "initializing") => node.setStatus(STATE.INIT, text);
    node.setStatusReady = (text = "ready") => node.setStatus(STATE.READY, text);
    node.setStatusWaiting = (text = "waiting...") => node.setStatus(STATE.WAITING, text);
    node.setStatusWorking = (text = "working...") => node.setStatus(STATE.WORKING, text);
    node.setStatusConnected = (text = "connected") => node.setStatus(STATE.CONNECTED, text);
    node.setStatusOK = (text = "") => node.setStatus(STATE.OK, text);
    node.setStatusOKFalsy = (text = "") => node.setStatus(STATE.OK_FALSY, text);
    node.setStatusWarning = (text = "warning") => node.setStatus(STATE.WARNING, text);
    node.setStatusError = (text = "error") => node.setStatus(STATE.ERROR, text);
    node.setStatusDisconnected = (text = "disconnected") => node.setStatus(STATE.DISCONNECTED, text);
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
    validateController
};
