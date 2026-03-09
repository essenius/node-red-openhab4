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

const { CONCEPT, EVENT_TAG, EVENT_TYPE, ACTION, STATE, SWITCH } = require('./constants');
const { isNonEmptyString } = require('./payloadUtils');
const { createOpenhabConnection } = require('./openhabConnection');
const { EventBus } = require('./eventBus');
const { Resource, createResourceFromMessage } = require('./resource');

const BASE_EVENT = {
    ADDED: 'added',
    REMOVED: 'removed',
    UPDATED: 'updated',
    STATE: 'state',
    COMMAND: 'command',
    STATE_CHANGED: 'statechanged',
    STATE_PREDICTED: 'statepredicted',
    STATUS: 'status',
    STATUS_CHANGED: 'statuschanged',
    DESCRIPTION_CHANGED: 'descriptionchanged',
    TRIGGERED: 'triggered',
};

class ControllerHandler {
    constructor(node, config, { eventBus = new EventBus(), createConnection = createOpenhabConnection }) {
        this.node = node;
        this.config = config;
        this.connection = createConnection(config, {
            onMessage: this._ifActive(this.node, this._handleMessage),
            onStateChange: this._ifActive(this.node, this._handleStateChange),
            onError: this._ifActive(this.node, this._handleError),
        });
        this.eventBus = eventBus;
    }

    /** request value of or send command/update to a resource */
    async control(resource, action = ACTION.GET, payload = null) {
        let parameters;

        if (resource?.isValid()) {
            parameters = resource.endPoint(action) ?? {
                ok: false,
                message: `${action}: unsupported for '${resource.concept}'`,
            };
        } else {
            parameters = { ok: false, message: `${resource.concept}: missing identifier` };
        }

        // if unsuccessful, bail out (and let the caller report)
        if (parameters.message) return parameters;

        const response = await this.connection.sendRequest(parameters.url, parameters.verb, payload);

        if (!response.ok || !response.data) return response;
        const message = { payload: response.data };
        resource.parseMessage(message);

        return { ok: true, data: resource.responseMessage({ openhab: response.data }) };
    }

    /** Get all the resources of a certain type at an endpoint */
    async getResources(concept) {
        const endPoint = Resource.getAllUrl(concept);
        return await this.connection.getResources(concept, endPoint);
    }

    /** Validates the connection to OpenHAB and waits for it to become ready. Emits Connection status / connection errors accordlingly.
     * On success, it starts the EventSource connection and emits the initial state of all items. */
    setupNode() {
        const { node, config, connection } = this;
        node.on('close', this._onClose);

        // we're offline until we have a confirmed connection
        this._publishConnectionStatus(SWITCH.OFF);

        node.log(`Starting OpenHAB EventSource connection to ${config.url}...`);
        connection.startEventSource();
        return this;
    }

    // --- Private methods ---

    async _getAll(concept) {
        // will never get called with an unknown concept
        this.node.log(`Getting statuses of all ${concept}...`);
        // using the same function as the front-end uses to get the dropdown content
        const response = await this.getResources(concept);
        if (!response.ok) {
            // inform the listeners of errors. We can do that here, since controllerHandler is initiator.
            this._publishError(
                { function: '_getAll', concept, response },
                { message: response.message, code: response.code }
            );
        }
        return response;
    }

    _getEndPoint(method, identifier) {
        return method?.(identifier);
    }

    // using an arrow function to keep 'this' context
    _ifActive(node, fn) {
        return async (...args) => {
            if (this._isActive(node)) {
                return await fn(...args);
            }
        };
    }

    /** Check if the node is still active (not closed) */
    _isActive(node) {
        return node && !node._closed;
    }

    _publishConnectionStatus(payload) {
        const message = { payload, topic: EVENT_TAG.CONNECTION_STATUS, payloadType: 'Switch' };
        this.eventBus.publish(EVENT_TAG.CONNECTION_STATUS, message);
    }

    /** Publish the current state of all things and items to the subscribers. This is called after the EventSource connection is established. */
    async _publishCurrentState() {
        const thingsResponse = await this._getAll(CONCEPT.THINGS);
        if (!thingsResponse.ok) return;

        const itemsResponse = await this._getAll(CONCEPT.ITEMS);
        if (!itemsResponse.ok) return;

        // Now we know we're online since the calls succeeded
        this._publishConnectionStatus(SWITCH.ON);

        // Send initial states so listeners can update

        const rootTopic = Resource.ROOT_TOPIC[0];

        for (const element of thingsResponse.data) {
            // transform response data into event format, but with empty id (gets filled from the payload)
            const message = {
                topic: `${rootTopic}/${CONCEPT.THINGS}//${BASE_EVENT.STATUS}`,
                payload: element,
                type: EVENT_TYPE.THING_STATUS,
            };
            const resource = createResourceFromMessage(message);
            this._publishMessage(resource, element);
        }

        for (const element of itemsResponse.data) {
            const message = {
                topic: `${rootTopic}/${CONCEPT.ITEMS}//${BASE_EVENT.STATE}`,
                payload: element,
                type: EVENT_TYPE.ITEM_STATE,
            };
            const resource = createResourceFromMessage(message);
            this._publishMessage(resource, element);
            // Note that payload type can be different from what the events return.
            // This is an inconsistency in OpenHAB that we can't easily fix without hardcoding.
        }
    }

    _publishError(context, payload) {
        context.node = this.node.name;
        if (!context.state) context.state = STATE.ERROR;
        this.eventBus.publish(EVENT_TAG.GLOBAL_ERROR, { context, payload });
    }

    /** Publish message in standard format across concepts */
    _publishMessage(resource, openhab) {
        const message = resource.responseMessage({ openhab });
        this.eventBus.publish(message.topic, message);
    }

    /** Publish event based on the message received from the event server. */
    _publishReceivedEvent(incoming) {
        if (!Resource.isValidEvent(incoming)) return;
        const resource = createResourceFromMessage(incoming);

        // if we can't create the resource, it couldn't be parsed. Ignore it.
        if (!resource) return;

        this._publishMessage(resource, incoming);
    }

    _safeParseJSON(str, fallback = null) {
        try {
            return JSON.parse(str);
        } catch {
            return fallback;
        }
    }

    // --- Event handlers ---

    _handleError = (error) => {
        // containing properties type, retry, code, message
        const payload = { message: error.message, code: error.code ?? error.name };
        const context = { function: '_handleError', ...error };
        delete context.message;
        delete context.code;
        delete context.cause;

        this._publishError(context, payload);
    };

    /** Handle incoming messages. If the payload is a JSON string, parse it, otherwise publish as is.
     * Note: Assumes that the check for node validity was already done. */
    _handleMessage = (event) => {
        // ignore events without data
        if (!event?.data || event.data.trim() === '') return;

        const msg = this._safeParseJSON(event.data);
        if (!msg) {
            this._publishError(
                { function: '_handleMessage', event },
                { message: 'Failed to parse incoming event as JSON', code: 'ParseError' }
            );
            return;
        }

        // if the payload is a string, try parsing to JSON, Otherwise, pass on as-is
        if (isNonEmptyString(msg.payload)) {
            const UNIQUE_TAG = Symbol('unique');
            const parsedPayload = this._safeParseJSON(msg.payload, UNIQUE_TAG);
            if (parsedPayload !== UNIQUE_TAG) {
                msg.payload = parsedPayload;
            }
        }

        this._publishReceivedEvent(msg);
    };

    _handleStateChange = async (state) => {
        try {
            switch (state) {
                case STATE.UP:
                    // not publishing ON as that is done in _publishCurrentState();
                    this.node.log('OpenHAB connection established');
                    this.node.hasConnected = true;
                    await this._publishCurrentState();
                    break;

                // this only happens if a retryable error occurred
                case STATE.CONNECTING:
                    this.node.warn('OpenHAB reconnecting...');
                    this._publishConnectionStatus(SWITCH.OFF);
                    this._publishError(
                        { function: '_handleStateChange', state },
                        { message: 'Event source disconnected. Reconnecting...', code: 'reconnecting...' }
                    );
                    break;

                case STATE.WAITING:
                    this._publishError(
                        { function: '_handleStateChange', state },
                        { message: 'Waiting to reconnect...', code: 'waiting...' }
                    );
                    break;

                case STATE.DOWN:
                    console.log('State down called with connected:', this.node.hasConnected);
                    if (this.node.hasConnected) {
                        // don't warn the first time
                        this.node.warn('OpenHAB connection closed');
                        this._publishError(
                            { function: '_handleStateChange', state },
                            { message: 'Event source is down', code: 'disconnected' }
                        );
                    }
                    this._publishConnectionStatus(SWITCH.OFF);
                    break;
            }
        } catch (err) {
            console.error('Error handling state change', err);
        }
    };

    _onClose = (removed, done) => {
        const node = this.node;
        node.log('Closing controller');

        // Close eventSource connection
        if (this.connection) {
            this._publishConnectionStatus(SWITCH.OFF);
            this.connection.close();
            this.connection = null;
        }
        node.removeListener('close', this._onClose);
        done();
    };
}

/** Entry point to create and setup the GetNode. Called by the get node registration. */
function setupControllerHandler(node, config, dependencies = {}) {
    return new ControllerHandler(node, config, dependencies).setupNode();
}

module.exports = { ControllerHandler, setupControllerHandler };
