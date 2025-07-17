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

//const { OpenhabConnection } = require("./openhabConnection");
const { ConsumerNodeBase } = require('./consumerNodeBase');
const { EVENT_TYPES } = require('./constants');

/** EventsNode class for handling all incoming OpenHAB events */
class EventsNode extends ConsumerNodeBase {

    /* Override to return the type of this node */
    getNodeType() {
        return 'Events';
    }

    _processIncomingEvent(message) {
        const outMessage = this.createMessage({ message });
        this.node.send(outMessage);
    }

    /** Override to setup event listener for raw events  */
    setupNodeLogic(options = {}) {
        if (options.error) return;
        this._processIncomingEvent = this._processIncomingEvent.bind(this);
        this.controller.on(EVENT_TYPES.RAW_EVENT, this._processIncomingEvent);
    }

    /** Override to handle input messages (should not be used) */
    handleInput(_msg) {
        // Events node typically doesn't handle input messages
        this.node.warn("Events node received input message - no action taken");
    }

    /** Override to clean up event listeners */
    cleanup() {
        this.node.log("Events node cleanup");
        this.controller.off(EVENT_TYPES.RAW_EVENT, this._processIncomingEvent);
        super.cleanup();
    }
}

/** Entry point to create and setup the EventsNode. Called by the events node registration. */
function setupEventsNode(node, config, controller) {
    return new EventsNode(node, config, controller).setupNode();
}

module.exports = { setupEventsNode };
