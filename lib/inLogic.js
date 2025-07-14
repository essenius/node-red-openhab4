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

const { EVENT_TYPES, SWITCH_STATUS } = require("./openhabConstants");
const { ConsumerNodeBase } = require('./consumerNodeBase');

class InNode extends ConsumerNodeBase {
    constructor(node, config, controller, utils) {

        super(node, config, controller, utils);

        this.itemName = (config.itemname || "").trim();
    }

    getNodeType() {
        return 'In';
    }

    setupNodeLogic() {
        this.node.context().set("currentState", "?");
        if (!this.itemName) {
            this.node.setStatusError("no item specified");
            return;
        }
        this.setupItemListeners();
        this.refreshNodeStatus();
    }

    setupItemListeners() {
        // Bind event handler methods to maintain 'this' context
        this.processStateEvent = this.processStateEvent.bind(this);
        this.processRawEvent = this.processRawEvent.bind(this);

        const stateEventName = this.itemName + '/' + EVENT_TYPES.STATE_EVENT;
        const rawEventName = this.itemName + '/' + EVENT_TYPES.RAW_EVENT;

        this.controller.on(rawEventName, this.processRawEvent);
        this.controller.on(stateEventName, this.processStateEvent);
    }

    refreshNodeStatus() {
        const state = this.node.context().get("currentState");

        if (state == null) {
            this.node.setStatusWarning("state:null");
        } else if (state === SWITCH_STATUS.ON) {
            this.node.setStatusConnected("state:" + state);
        } else if (state === SWITCH_STATUS.OFF) {
            this.node.setStatusOK("state:" + state);
        } else {
            this.node.setStatusWaiting("state:" + state);
        }
    }

    processStateEvent(event) {
        let currentState = this.node.context().get("currentState");
        if ((event.state != currentState) && (event.state != "null")) {
            currentState = event.state;
            this.node.context().set("currentState", currentState);
            this.refreshNodeStatus();

            const stateMsg = this.createMessage(currentState, EVENT_TYPES.STATE_EVENT);
            stateMsg.item = this.itemName;
            stateMsg.event = EVENT_TYPES.STATE_EVENT;
            this.node.send([stateMsg, null]);
        }
    }

    processRawEvent(event) {
        const rawMsg = this.createMessage(event, EVENT_TYPES.RAW_EVENT);
        rawMsg.item = this.temName;
        rawMsg.event = EVENT_TYPES.RAW_EVENT;
        this.node.send([null, rawMsg]);
    }

    handleInput(msg) {
        if (msg != null) {
            // placeholder for input logic
        }
    }

    cleanup() {
        this.node.log('In node cleanup');
        if (this.controller) {
            this.controller.off(this.itemName + '/' + EVENT_TYPES.STATE_EVENT, this.processStateEvent);
            this.controller.off(this.itemName + '/' + EVENT_TYPES.RAW_EVENT, this.processRawEvent);
        }
    }
}

function setupInNode(node, config, controller, utils) {
    return new InNode(node, config, controller, utils).setupNode();
}

module.exports = { setupInNode };
