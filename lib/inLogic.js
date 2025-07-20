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

const { EVENT_TYPES, STATE, CONTEXT } = require("./constants");
const { ConsumerNodeBase } = require('./consumerNodeBase');

/** InNode class for handling incoming OpenHAB events for a specified item */
class InNode extends ConsumerNodeBase {
    constructor(node, config, controller, utils) {

        super(node, config, controller, utils);
        this.itemName = (config.itemname || "").trim();
        this._stateEventName = null; 
        this._rawEventName = null; 
    }

    /** Override to return the type of this node */
    getNodeType() {
        return 'In';
    }

    /** Override to setup node logic. It will set the initial state and listen for item events */
    setupNodeLogic(options = {}) {
        if (options.error) return;
        if (!this.itemName) {
            this.setStatus(STATE.ERROR, "no item specified");
            return;
        }

        let state = this.node.context().get(CONTEXT.STATE);
        if (state === undefined) {
            this.node.context().set(CONTEXT.STATE, CONTEXT.UNKNOWN);
        }

        this._setupItemListeners();
    }

    _setupItemListeners() {
        this._stateEventName = EVENT_TYPES.ITEM_EVENT(this.itemName, EVENT_TYPES.STATE_EVENT);
        this._rawEventName = EVENT_TYPES.ITEM_EVENT(this.itemName, EVENT_TYPES.RAW_EVENT);

        this.controller.on(this._rawEventName, this._processRawEvent);
        this.controller.on(this._stateEventName, this._processStateEvent);
    }

    /** Process incoming state events, update the node status and send to the first channel.
     * Note: using arrow function to maintain 'this' context (avoid need for bind) */
    _processStateEvent = (event) => {
        let currentState = this.node.context().get(CONTEXT.STATE);
        if ((event.state != currentState) && (event.state != CONTEXT.NULL)) {
            currentState = event.state;
            this.node.context().set(CONTEXT.STATE, currentState);
            this.setItemStatus(currentState);
            const stateMsg = this.createMessage({ payload: currentState, event: EVENT_TYPES.STATE_EVENT });
            stateMsg.item = this.itemName;
            stateMsg.event = EVENT_TYPES.STATE_EVENT;
            this.node.send([stateMsg, null]);
        }
    }

    /** Process incoming raw events and send them to the second channel */
    _processRawEvent = (event) =>{
        const rawMsg = this.createMessage({ payload: event, event: EVENT_TYPES.RAW_EVENT });
        rawMsg.item = this.itemName;
        rawMsg.event = EVENT_TYPES.RAW_EVENT;
        this.node.send([null, rawMsg]);
    }

    /** Override to clean up event listeners */
    cleanup() {
        this.switchOffHandler(this._stateEventName, this._processStateEvent);
        this.switchOffHandler(this._rawEventName, this._processRawEvent);
    }
}

/** Entry point to create and setup the InNode. Called by the in node registration. */
function setupInNode(node, config, controller, utils) {
    return new InNode(node, config, controller, utils).setupNode();
}

module.exports = { InNode, setupInNode };
