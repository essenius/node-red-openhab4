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

const { CONCEPTS, EVENT_TAGS, EVENT_TYPES, OPERATION, SWITCH_STATUS, HTTP_METHODS } = require("./constants");
const { OpenhabConnection } = require("./openhabConnection");
const { EventBus } = require("./eventBus");

class ControllerHandler {
	constructor(node, config, eventBus = new EventBus()) {
		this.node = node;
		this.config = config;
		this.connection = null;
		this.eventBus = eventBus;
	}

	/** request value of or send command/update to a resource */

	async control(conceptType, identifier, operation = OPERATION.GET, payload = null) {

		const parameters = this._getRequestParameters(conceptType, identifier, operation);
		if (!parameters.ok) {
			return parameters;
		}

		let response = await this.connection.sendRequest(parameters.endPoint, parameters.verb, payload, (errorResult) => {
			// if it fails, inform the global error listeners. Note that this can be called multiple times if we have retries.
			this.eventBus.publish(EVENT_TAGS.GLOBAL_ERROR, errorResult.message);
		});

		return this._parseResponse(conceptType, response);
	}

	/** Validates the connection to OpenHAB and waits for it to become ready. Emits Connection status / connection errors accordlingly.
	* On success, it starts the EventSource connection and emits the initial state of all items. */
	setupNode() {
		const { node, config } = this;
		node.on("close", this._onClose);

		// we're offline until we have a confirmed connection
		this.eventBus.publish(EVENT_TAGS.CONNECTION_STATUS, SWITCH_STATUS.OFF);

		// the defaults have already been applied here (happens in controller.js)

		node.log(`OpenHAB Controller connecting to: ${config.url}`);

		// TODO: inject this dependency
		this.connection = new OpenhabConnection(config);

		node.log("OpenHAB is ready, starting EventSource connection...");

		this.connection.startEventSource({
			endPoint: CONCEPTS[CONCEPTS.EVENTS].streamUrl(config.eventFilter),

			onOpen: this._ifActive(node, () => {
				node.log("EventSource connection established");
				this._publishCurrentState();
			}),
			onError: this._ifActive(node, (message, shortMessage) => {
				this._publishError(message);
			}),
			onMessage: this._ifActive(node, this._handleMessage)
		});

		return this;
	}

	// --- Private methods ---

	async _getAll(conceptType) {

		this.node.log(`Getting statuses of all ${conceptType.name}...`);
		const endPoint = conceptType.getAllUrl?.();
		if (!endPoint) {
			const message = `Concept "${conceptType.name}" does not support fetching all elements`;
			this._publishError(message);
			return { ok: false, message };
		}

		const callResponse = this.connection.sendRequest(endPoint, HTTP_METHODS.GET, null, errorResponse => {
			// if we have a non-retryable error, it's most likely fatal so we inform all listeners
			if (!errorResponse.retry) {
				this._publishError(errorResponse.message);
			}
		});
		return callResponse;
	}

	_getRequestParameters(conceptType, identifier, operation) {
		let endPoint, verb;
		switch (operation) {
			case OPERATION.GET:
				endPoint = conceptType.getUrl?.(identifier);
				verb = HTTP_METHODS.GET;
				break;
			case OPERATION.COMMAND:
				endPoint = conceptType.commandUrl?.(identifier);
				verb = conceptType.commandVerb;
				break;
			case OPERATION.UPDATE:
				endPoint = conceptType.updateUrl?.(identifier);
				verb = conceptType.updateVerb;
				break;
			default: {
					const message = `Unknown operation: ${operation}`;
					this._publishError(message);
					return { ok: false, message };
				}
		}
		if (!verb || !endPoint) {
			const message = `Operation ${operation} not supported for concept ${conceptType.name}`;
			this._publishError(message);
			return { ok: false, message };
		}
		return { ok:true, endPoint, verb };
	}

	// using an arrow function to keep 'this' context
	_ifActive(node, fn) {
		return (...args) => {
			if (this._isActive(node)) {
				fn(...args);
			}
		};
	}

	/** Check if the node is still active (not closed) */
	_isActive(node) {
		return node && !node._closed;
	}

	_isNonEmptyString(value) {
		return typeof value === "string" && value.trim() !== "";
	}

    /** OpenHAB events always have (event) type, topic and payload.
	 * We already know the event is not null or _publishReceivedEvent would not have been called.
	 */
	_isValidEvent(event) {
		return event.type && event.payload && event.topic;
	}

    _parseResponse(conceptType, response) {
		if (!response.ok || !response.data) return response;
		const openhab = response.data;
		const identifier = conceptType.idFromRequest(openhab);
		const data = this._prepareMessage(conceptType, conceptType.topic(identifier), openhab);
		return { ok: true, data };
	}

	_prepareMessage(conceptType, topic, openhab) {
		return {
			topic,
			payload: conceptType.payload?.(openhab),
			payloadType: conceptType.payloadType?.(openhab),
			openhab
		}
	}

	/** Publish the current state of all things and items to the subscribers. This is called after the EventSource connection is established. */
	async _publishCurrentState() {

		const thingType = CONCEPTS[CONCEPTS.THINGS];

		const thingsResponse = await this._getAll(thingType);
		if (!thingsResponse.ok) return; // fatal, already reported via callback 

		const itemsType = CONCEPTS[CONCEPTS.ITEMS];

		const itemsResponse = await this._getAll(itemsType);
		if (!itemsResponse.ok) return;

		// Now we know we're online since the calls succeeded
		this.eventBus.publish(EVENT_TAGS.CONNECTION_STATUS, SWITCH_STATUS.ON);

		// Send initial states so listeners can update

		for (const element of thingsResponse.data) {
			this._publishMessage(CONCEPTS.THINGS, thingType.idFromRequest(element), element, EVENT_TYPES.THING_STATUS);
		};

		for (const element of itemsResponse.data) {
			// Note that payload type is different than what the events return. This is an inconsistency in OpenHAB that we can't easily fix.
			this._publishMessage(CONCEPTS.ITEMS, itemsType.idFromRequest(element), element, EVENT_TYPES.ITEM_STATE);
		};
	}

	_publishError(message, reportConnectionIssue = true) {
		this.eventBus.publish(EVENT_TAGS.GLOBAL_ERROR, message);

		if (reportConnectionIssue) {
			this.eventBus.publish(EVENT_TAGS.CONNECTION_STATUS, SWITCH_STATUS.OFF);
		}
	}

	/** Publish message in standard format across concepts */
	_publishMessage(concept, identifier, incoming, eventType) {
		const conceptType = CONCEPTS[concept];
		if (!conceptType) {
			this._publishError(`Unknown concept: ${concept}`);
			return;
		}
		const topic = conceptType.topic(identifier);
		const message = this._prepareMessage(conceptType, topic, incoming);
		message.eventType = eventType;
		this.eventBus.publish(topic, message);
	}

	/** Publish event based on the message received from the event server. */
	_publishReceivedEvent(incoming) {

		if (!this._isValidEvent(incoming)) return;

		// the topic format is openhab/concept/name/event (OH3+) or smarthome/concept/name/event (OH2)
		// Extract name and concept/name as full_name
		// Regex notes:
		// 1) No escape needed for / within character class [...]. 
		// 2) (?:) is non-capturing group.
		// 3) the last group is optional
		const match = incoming.topic.match(/^(?:openhab|smarthome)\/([^/]+)\/([^/]+)(?:\/(.*))?$/);
		if (!match) return;
		const [, concept, identifier, event] = match;

		this._publishMessage(concept, identifier, incoming, incoming.type ?? event);
		/*		let message = {
					openhab: incoming,
					concept,
					identifier,
					topic: EVENT_TAGS.ADDRESS(concept, identifier),
					payload: incoming.payload,
					...(event && { event }),
				};
				this.eventBus.publish(message.topic, message); */
	}

	_safeParseJSON(str, fallback = null) {
		try {
			return JSON.parse(str);
		} catch {
			return fallback;
		}
	}

	// --- Event handlers ---

	/** Handle incoming messages. If the payload is a JSON string, parse it, otherwise publish as is.
	 * Note: Assumes that the check for node validity was already done. */
	_handleMessage = (event) => {
		// ignore events without data
		if (!event?.data || event.data.trim() === "") return;

		const msg = this._safeParseJSON(event.data);
		if (!msg) {
			this._publishError(`Failed to parse event as JSON: ${event.data}`, false);
			return;
		}

		// if the payload is a string, try parsing to JSON, Otherwise, pass on as-is
		if (this._isNonEmptyString(msg.payload)) {
			const UNIQUE_TAG = Symbol("unique");
			const parsedPayload = this._safeParseJSON(msg.payload, UNIQUE_TAG);
			if (parsedPayload !== UNIQUE_TAG) {
				msg.payload = parsedPayload;
			}
		}

		this._publishReceivedEvent(msg);
	};

	_onClose = (removed, done) => {
		const node = this.node;
		node.log(`Closing controller`);
		this.eventBus.publish(EVENT_TAGS.CONNECTION_STATUS, SWITCH_STATUS.OFF);

		// Close centralized EventSource connection
		if (this.connection) {
			this.connection.close();
			this.connection = null;
		}
		done();
	};

}

/** Entry point to create and setup the GetNode. Called by the get node registration. */
function setupControllerHandler(node, config) {
	return new ControllerHandler(node, config).setupNode();
}

module.exports = { ControllerHandler, setupControllerHandler };
