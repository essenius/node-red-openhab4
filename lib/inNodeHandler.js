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

const { EVENT_TAGS, STATE, CONTEXT } = require("./constants");
const { ConsumerNodeHandler } = require('./consumerNodeHandler');

/** InNode class for handling incoming OpenHAB events for a specified item */
class InNodeHandler extends ConsumerNodeHandler {
    constructor(node, config, controller, utils) {

        super(node, config, controller, utils);
        this.itemName = (config.itemName || "").trim();
        this.itemTag = EVENT_TAGS.ITEM(this.itemName);

        this.changesOnly = config.changesOnly || true;
    }

    /** Override to setup node logic. It will set the initial state and listen for item events */
    setupNodeLogic() {
        if (!this.itemName) {
            this.setStatus(STATE.ERROR, "no item specified");
            return;
        }

        let state = this.node.context().get(CONTEXT.STATE);
        if (state === undefined) {
            this.node.context().set(CONTEXT.STATE, CONTEXT.UNKNOWN);
        }

        this.handlerOn(this.itemTag, this._processEvent);
    }

    /** Process incoming state events, update the node status and send to the output channel (if required).
     * Note: using arrow function to maintain 'this' context (avoid need for bind) */
    _processEvent = (event) => {
   		const { type, value } = event.payload;
        // if we don't have a value, there is nothing to do.
        if (!value) return;
        let currentState = this.node.context().get(CONTEXT.STATE);

        // Payload is the value, and topic is the event type. Name is the new id (since we support more than only items now).
        // We pass item for compatibility with earlier releases.

        const message = this.createMessage({ 
            payload: value, 
            topic: event.type, 
   			...(type && { type }),
            name: event.name, 
            item: event.name, 
            rawEvent: event });

        let wasChanged = false;
        if ((value != currentState) && (value != CONTEXT.NULL)) {
            wasChanged = true;
            currentState = value;
            this.node.context().set(CONTEXT.STATE, currentState);
            this.setItemStatus(currentState);
        }
        if (!this.changesOnly || wasChanged) this.node.send(message);        
    }

    /** Override to clean up event listeners */
    cleanup() {
        this.handlerOff(this.itemTag, this._processEvent);
    }
}

/** Entry point to create and setup the InNode. Called by the in node registration. */
function setupInNode(node, config, controller, utils) {
    return new InNodeHandler(node, config, controller, utils).setupNode();
}

module.exports = { InNodeHandler, setupInNode };
