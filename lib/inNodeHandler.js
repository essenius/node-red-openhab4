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

const { CONCEPTS, STATE, CONTEXT } = require("./constants");
const { ConsumerNodeHandler } = require('./consumerNodeHandler');

/** InNode class for handling incoming OpenHAB events for a specified item */
class InNodeHandler extends ConsumerNodeHandler {
    constructor(node, config, controller, utils) {

        super(node, config, controller, utils);
        this.identifier = (config.identifier || "").trim();
        this.resourceTag = CONCEPTS.topic(config.concept, this.identifier);
    }

    /** Override to setup node logic. It will set the initial state and listen for item events */
    setupNodeLogic() {
        if (!this.identifier) {
            this.setStatus(STATE.ERROR, "no resource specified");
            return;
        }

        let state = this.node.context().get(CONTEXT.STATE);
        if (state === undefined) {
            this.node.context().set(CONTEXT.STATE, CONTEXT.UNKNOWN);
        }

        this.handlerOn(this.resourceTag, this._processEvent);
    }

    /** Process incoming state events, update the node status and send to the output channel (if required).
     * Note: using arrow function to maintain 'this' context (avoid need for bind) */
    _processEvent = (event) => {
        const wasChanged = this._recordChange(event.payload);
        if (this.config.changesOnly && !wasChanged) return;
        const message = this.createMessage({ message: event });    
        this.node.send(message);        
    }

    _recordChange(payload) {
        let currentState = this.node.context().get(CONTEXT.STATE);
        let wasChanged = false;
        if ((payload != currentState) && (payload != CONTEXT.NULL)) {
            wasChanged = true;
            currentState = payload;
            this.node.context().set(CONTEXT.STATE, currentState);
            this.setValueStatus(currentState);
        }
        return wasChanged;
    }

    /** Override to clean up event listeners */
    cleanup() {
        this.handlerOff(this.resourceTag, this._processEvent);
    }
}

/** Entry point to create and setup the InNode. Called by the in node registration. */
function setupInNodeHandler(node, config, controller, utils) {
    return new InNodeHandler(node, config, controller, utils).setupNode();
}

module.exports = { InNodeHandler, setupInNodeHandler };
