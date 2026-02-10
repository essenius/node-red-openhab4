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

const { EVENT_TAGS } = require("./constants");
const { ConsumerNodeHandler } = require('./consumerNodeHandler');

/** HealthNode class to monitor and report the health of the OpenHAB connection */
class HealthNodeHandler extends ConsumerNodeHandler {
    constructor(node, config, controller, utils) {
        super(node, config, controller, utils);
        this._lastStatus = null; // Track last status to avoid duplicates
    }

    /** Override to setup node logic, sending any errors to the second channel. */
    setupNodeLogic() {
        // setup a second event handler for status, sending a message to the first channel if it changes
        this.handlerOn(EVENT_TAGS.CONNECTION_STATUS, this._onConnectionStatus2);
        // Setup an event handler for global errors, sending a message to the second channel
        this.handlerOn(EVENT_TAGS.GLOBAL_ERROR, this._onGlobalError);
    }

    /** override to clean up event listeners */
    cleanup() {
        this.handlerOff(EVENT_TAGS.GLOBAL_ERROR, this._onGlobalError);
        this.handlerOff(EVENT_TAGS.CONNECTION_STATUS, this._onConnectionStatus2);
        this._lastStatus = null;
    }

    // --- Event handlers ---

    _onConnectionStatus2 = (state) => {
        if (this._lastStatus !== state) {
            this._lastStatus = state;
            const statusMsg = this.createMessage({ payload: state, topic: EVENT_TAGS.CONNECTION_STATUS });
            this.node.send([statusMsg, null]);
        }
    }

    _onGlobalError = (error) => {
        const errorMsg = this.createMessage({ payload: String(error), topic: EVENT_TAGS.GLOBAL_ERROR });
        this.node.send([null, errorMsg]);
    }
}

/** Entry point to create and setup the HealthNode. Called by the health node registration. */
function setupHealthNodeHandler(node, config, controller, utils) {
    return new HealthNodeHandler(node, config, controller, utils).setupNode();
}

module.exports = { HealthNodeHandler, setupHealthNodeHandler };