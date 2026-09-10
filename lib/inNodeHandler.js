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

const { STATE, CONTEXT } = require('./constants');
const { ConsumerNodeHandler } = require('./consumerNodeHandler');
const { createResource } = require('./resource');

const TYPE_ALIASES = {
    added: ['added'],
    changed: ['statechanged', 'statuschanged', 'descriptionchanged'],
    command: ['command'],
    initialized: ['initialized'],
    predicted: ['predicted'],
    removed: ['removed'],
    state: ['state', 'status'],
    updated: ['updated'],
    triggered: ['triggered'],
};

/** InNode class for handling incoming OpenHAB events for a specified item */
class InNodeHandler extends ConsumerNodeHandler {
    constructor(node, config, controller, utils) {
        super(node, config, controller, utils);
        this.identifier = (config.identifier || '').trim();
        this.resourceTag = createResource(config.concept, this.identifier).topic();
    }

    /** Override to clean up event listeners */
    cleanup() {
        this.handlerOff(this.resourceTag, this._processEvent);
    }

    /** Override to setup node logic. It will set the initial state and listen for item events */
    setupNodeLogic() {
        // TODO: indicate which resource we're listening to in the status (e.g. "listening to items/testItem") and in the error messages, 
        // to make it easier for users to understand which node is having issues when they have multiple nodes.
        this.enableInputHandling();

        if (!this.identifier) {
            this.setStatus(STATE.ERROR, 'no resource specified');
            // set status, but do not log error since node may have a dynamic subscription
            return;
        }

        let state = this.node.context().get(CONTEXT.STATE);
        if (state === undefined) {
            this.node.context().set(CONTEXT.STATE, CONTEXT.UNKNOWN);
        }

        this.handlerOn(this.resourceTag, this._processEvent);
    }

    async handleInput(msg) {
        let item = this.getResource(msg);

        if (!item) {
            this.setStatus(STATE.ERROR, 'found no item');
            return;
        }

        this.identifier = (msg.topic || '').trim();
        this.resourceTag = createResource(this.config.concept, this.identifier).topic();
        this.setupNode();
    }

    // --- Private methods ---

    _matchesEvent(event) {
        // "All" selected or we have an old node that doesn't have the eventTypesAll property, so we should default to the old behavior of sending all events
        if (this.config.eventTypesAll === true || this.config.eventTypesAll === undefined) return true;

        // Alias-based matching
        return this._normalizeEventTypes(this.config.eventTypes).some((sel) =>
            (TYPE_ALIASES[sel] || [sel]).includes(event)
        );
    }

    _normalizeEventTypes(eventTypes) {
        if (Array.isArray(eventTypes)) return eventTypes;

        if (typeof eventTypes === 'string') {
            try {
                return JSON.parse(eventTypes);
            } catch {
                return [];
            }
        }

        return [];
    }

    /** Process incoming state events, update the node status and send to the output channel (if required).
     * Note: using arrow function to maintain 'this' context (avoid need for bind) */
    _processEvent = (event) => {
        const isRelevant = this._matchesEvent(event.event);
        if (!isRelevant) {
            return;
        }
        const wasChanged = this._recordChange(event.payload);
        if (this.config.changesOnly && !wasChanged) {
            return;
        }
        const message = this.createMessage({ message: event });
        this.setValueStatus(event.payload);
        this.node.send(message);
    };

    _recordChange(payload) {
        let currentState = this.node.context().get(CONTEXT.STATE);
        let wasChanged = false;
        if (payload !== currentState && payload !== CONTEXT.NULL) {
            wasChanged = true;
            this.node.context().set(CONTEXT.STATE, payload);
        }

        return wasChanged;
    }
}

/** Entry point to create and setup the InNode. Called by the in node registration. */
function setupInNodeHandler(node, config, controller, utils) {
    return new InNodeHandler(node, config, controller, utils).setupNode();
}

module.exports = { InNodeHandler, setupInNodeHandler };
