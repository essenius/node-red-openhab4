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

/** HealthNode class to monitor and report the health of the OpenHAB connection */
class HealthNode extends ConsumerNodeBase {
    constructor(node, config, controller, utils) {
        super(node, config, controller, utils);
        this._lastStatus = null; // Track last status to avoid duplicates
    }

    /** Override to return the type of this node */
    getNodeType() {
        return 'Health';
    }

    /*
    setupControllerEvents() {

        // Listen for communication status changes 
        this.controller.on(EVENT_TYPES.CONNECTION_STATUS, (state) => {
            // Only send status message if it's different from the last one
            if (this.lastStatus !== state) {
                this.lastStatus = state;

                const statusMsg = this.createMessage({ payload: state, event: EVENT_TYPES.CONNECTION_STATUS });
                this.node.send([statusMsg, null, null]);

                if (state === SWITCH_STATUS.ON) {
                    this.setStatusConnected("connected");
                } else {
                    this.setStatusDisconnected("disconnected");
                }
            }
        });

        // Listen for communication errors
        this.controller.on(EVENT_TYPES.CONNECTION_ERROR, (err) => {
            const errorMsg = this.createMessage({ payload: String(err), event: EVENT_TYPES.CONNECTION_ERROR });
            this.node.send([null, errorMsg, null]);
            this.setStatusError(err);
        });

        // Listen for all raw events (global event monitoring)
        this.controller.on(EVENT_TYPES.RAW_EVENT, (event) => {
            const rawMsg = this.createMessage({ payload: event, event: EVENT_TYPES.RAW_EVENT });
            this.node.send([null, null, rawMsg]);
        });
    } */

    /** Override to setup node logic, sending any errors to the second channel. */
    setupNodeLogic(options = {}) {

        if (options.error) {
            this.node.send([null, options.error, null]);
            return;
        }

        // setup a second event handler for status, sending a message to the first channel if it changes
        this._onConnectionStatus = (state) => {
        
            if (this._lastStatus !== state) {
                this._lastStatus = state;

                const statusMsg = this.createMessage({ payload: state, event: EVENT_TYPES.CONNECTION_STATUS });
                this.node.send([statusMsg, null, null]);
            }
        }
        this.controller.on(EVENT_TYPES.CONNECTION_STATUS, this._onConnectionStatus);

        // Setup a second event handler for communication errors, sending a message to the second channel
        this._onConnectionError = (error) => {
            const errorMsg = this.createMessage({ payload: String(error), event: EVENT_TYPES.CONNECTION_ERROR });
            this.node.send([null, errorMsg, null]);
        }
        this.controller.on(EVENT_TYPES.CONNECTION_ERROR, this._onConnectionError);

        // Listen for all raw events (global event monitoring)
        this._onRawEvent = (event) => {
            const rawMsg = this.createMessage({ payload: event, event: EVENT_TYPES.RAW_EVENT });
            this.node.send([null, null, rawMsg]);
        }
        this.controller.on(EVENT_TYPES.RAW_EVENT, this._onRawEvent);
    }

    cleanup() {
        this.node.log('HealthNode cleanup called');
        this.switchOffHandler(EVENT_TYPES.CONNECTION_ERROR, this._onConnectionError);
        this.switchOffHandler(EVENT_TYPES.CONNECTION_STATUS, this._onConnectionStatus);
        this.switchOffHandler(EVENT_TYPES.RAW_EVENT, this._onRawEvent);
        this._lastStatus = null;
    }
}

/** Entry point to create and setup the HealthNode. Called by the health node registration. */
function setupHealthNode(node, config, controller, utils) {
    return new HealthNode(node, config, controller, utils).setupNode();
}

module.exports = { setupHealthNode };