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

class EventsNode extends ConsumerNodeBase {

    getNodeType() {
        return 'Events';
    }

    processIncomingEvent(message) {
        const outMessage = this.createMessage({ message });
        this.node.send(outMessage);
    }

    setupNodeLogic(options = {}) {
        if (options.error) return;
        this.processIncomingEvent = this.processIncomingEvent.bind(this);
        this.controller.on(EVENT_TYPES.RAW_EVENT, this.processIncomingEvent);
    }

    handleInput(_msg) {
        // Events node typically doesn't handle input messages
        this.node.warn("Events node received input message - no action taken");
    }

    cleanup() {
        this.node.log("Events node cleanup");
        this.controller.off(EVENT_TYPES.RAW_EVENT, this.processIncomingEvent);
        super.cleanup();
    }
}

function setupEventsNode(node, config, controller) {
    return new EventsNode(node, config, controller).setupNode();
}

module.exports = { setupEventsNode };
