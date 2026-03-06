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

'use strict';

const { EVENT_TAGS, STATE } = require('./constants');
const { ConsumerNodeHandler } = require('./consumerNodeHandler');

/** HealthNode class to monitor and report the health of the OpenHAB connection */
class HealthNodeHandler extends ConsumerNodeHandler {
    constructor(node, config, controller, utils) {
        super(node, config, controller, utils);
        this._lastStatus = null; // Track last status to avoid duplicates
    }

    /** override to clean up event listeners */
    cleanup() {
        console.log('Switching off health error handler');
        this.handlerOff(EVENT_TAGS.GLOBAL_ERROR, this._onGlobalError);
        this._lastStatus = null;
    }

    /** Override to setup node logic, sending any errors to the second channel. */
    setupNodeLogic() {
        console.log('Switching on health error handler');
        // Setup an event handler for global errors, sending a message to the second channel
        this.handlerOn(EVENT_TAGS.GLOBAL_ERROR, this._onGlobalError);
    }

    // --- Internal methods ---

    // called from _onConnectionStatus in ConsumerNodeHandler after updating the status.
    _afterConnectionStatus(message) {
        const state = message.payload;
        if (this._lastStatus !== state) {
            this._lastStatus = state;
            this.node.send([message, null]);
        }
    }

    // --- Event handlers ---

    _onGlobalError = (error) => {
        const errorMsg = this.createMessage({ ...error, topic: EVENT_TAGS.GLOBAL_ERROR });
        this.node.send([null, errorMsg]);
        this.setStatus(error.context.state ?? STATE.ERROR, error.payload.code ?? error.payload.message);
    };
}

/** Entry point to create and setup the HealthNode. Called by the health node registration. */
function setupHealthNodeHandler(node, config, controller, utils) {
    return new HealthNodeHandler(node, config, controller, utils).setupNode();
}

module.exports = { HealthNodeHandler, setupHealthNodeHandler };
