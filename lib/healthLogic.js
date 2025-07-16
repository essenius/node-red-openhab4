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

const { EVENT_TYPES, SWITCH_STATUS } = require("./constants");
const { ConsumerNodeBase } = require('./consumerNodeBase');

class HealthNode extends ConsumerNodeBase {
    constructor(node, config, controller, utils) {
        super(node, config, controller, utils);
        this.lastStatus = null; // Track last status to avoid duplicates
    }

    setupControllerEvents() {
        // overrides consumerNodeBase's method

        // Listen for communication status changes 
        this.controller.on(EVENT_TYPES.CONNECTION_STATUS, (state) => {
            // Only send status message if it's different from the last one
            if (this.lastStatus !== state) {
                this.lastStatus = state;

                const statusMsg = this.createMessage({payload: state, event: EVENT_TYPES.CONNECTION_STATUS});
                this.node.send([statusMsg, null, null]);

                if (state === SWITCH_STATUS.ON) {
                    this.node.setStatusConnected("connected");
                } else {
                    this.node.setStatusDisconnected("disconnected");
                }
            }
        });

        // Listen for communication errors
        this.controller.on(EVENT_TYPES.CONNECTION_ERROR, (err) => {
            const errorMsg = this.createMessage({ payload: String(err), event: EVENT_TYPES.CONNECTION_ERROR });
            this.node.send([null, errorMsg, null]);
            this.node.setStatusError(err);
        });

        // Listen for all raw events (global event monitoring)
        this.controller.on(EVENT_TYPES.RAW_EVENT, (event) => {
            const rawMsg = this.createMessage({ payload: event, event: EVENT_TYPES.RAW_EVENT});
            this.node.send([null, null, rawMsg]);
        });
    }

    getNodeType() {
        return 'Health';
    }

    setupNodeLogic(options = {}) {

        if (options.error) {
            this.node.send([null, options.error, null]);
            return;
        }
    }

    handleInput(_msg) {
        // Health node doesn't typically process input messages
    }

    cleanup() {
        // Event listeners are automatically cleaned up by the controller
        super.cleanup();
    }
}

function setupHealthNode(node, config, controller, utils) {
    return new HealthNode(node, config, controller, utils).setupNode();
}

module.exports = { setupHealthNode };