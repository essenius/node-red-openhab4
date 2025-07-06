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

const { EVENT_TYPES, SWITCH_STATUS } = require("./openhabConstants");
const { ConsumerNodeBase } = require('./consumerNodeBase');

class InNode extends ConsumerNodeBase {
    constructor(node, config, controller, utils) {
        // Set itemName BEFORE calling super() so it's available during setup
        node.itemName = (config.itemname || "").trim();
        
        super(node, config, controller, utils);
        
        // Also set it on the instance for consistency
        this.itemName = node.itemName;
    }

    getNodeType() {
        return 'In';
    }

    getItemName() {
        return this.itemName || this.node.itemName || "";
    }

    setupNodeLogic() {
        this.node.log('OpenHABIn, config: ' + JSON.stringify(this.config));
        this.node.context().set("currentState", "?");

        this.setupControllerEvents();
        this.setupItemListeners();
        this.refreshNodeStatus();
    }

    setupControllerEvents() {
        this.controller.on(EVENT_TYPES.COMMUNICATION_ERROR, (err) => {
            this.node.setStatusError("connection error: " + err);
        });

        this.controller.on(EVENT_TYPES.COMMUNICATION_STATUS, (state) => {
            if (state === SWITCH_STATUS.ON) {
                this.node.setStatusReady();
            }
        });
    }

    setupItemListeners() {
        // Bind event handler methods to maintain 'this' context
        this.processStateEvent = this.processStateEvent.bind(this);
        this.processRawEvent = this.processRawEvent.bind(this);

        const itemName = this.getItemName();
        const stateEventName = itemName + '/' + EVENT_TYPES.STATE_EVENT;
        const rawEventName = itemName + '/' + EVENT_TYPES.RAW_EVENT;

        this.controller.addListener(rawEventName, this.processRawEvent);
        this.controller.addListener(stateEventName, this.processStateEvent);
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

            const itemName = this.getItemName();
            const stateMsg = this.createMessage(currentState, EVENT_TYPES.STATE_EVENT);
            stateMsg.item = itemName;
            stateMsg.event = EVENT_TYPES.STATE_EVENT;
            this.node.send([stateMsg, null]);
        }
    }

    processRawEvent(event) {
        const itemName = this.getItemName();
        const rawMsg = this.createMessage(event, EVENT_TYPES.RAW_EVENT);
        rawMsg.item = itemName;
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
            const itemName = this.getItemName();
            this.controller.removeListener(itemName + '/' + EVENT_TYPES.STATE_EVENT, this.processStateEvent);
            this.controller.removeListener(itemName + '/' + EVENT_TYPES.RAW_EVENT, this.processRawEvent);
        }
    }
}

function setupInNode(node, config, controller, utils) {
    return new InNode(node, config, controller, utils);
}

module.exports = { setupInNode };
