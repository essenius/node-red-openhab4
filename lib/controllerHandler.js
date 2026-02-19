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

	async control(resource, operation = OPERATION.GET, payload = null) {

		let parameters;
		const { concept, identifier } = resource;
		const conceptType = CONCEPTS.get(concept);
		if (conceptType.isUnknown) {
			parameters = { ok: false, message: `${conceptType.name}: unknown concept` };
		} else if (conceptType.idFromRequest && !identifier) {
			parameters = { ok: false, message: `${conceptType.name}: missing identifier` };
		} else {
			parameters = this._getRequestParameters(conceptType, identifier, operation);
		}

		// if unsuccessful, bail out (and let the caller report)
		if (parameters.message) return parameters;

		const response = await this.connection.sendRequest(parameters.endPoint, parameters.verb, payload, (errorResult) => {
			// normally the callers take care of reporting errors, but in case of retries the call won't return until it
			// either succeeds or times out. So we only report retries from here.
			// A retryable error implies that the connection is (temporarily?) down.

			if(!errorResult.retry) return;
			console.log("Error:", errorResult);
			const context = {
				...parameters,
				...(payload ? { payload } : {}),
			}
			this._publishError(context, errorResult, true); 
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

		const eventSourceEndPoint = CONCEPTS.get(CONCEPTS.EVENTS).streamUrl(config.eventFilter);
		this.connection.startEventSource({
			endPoint: eventSourceEndPoint,

			onOpen: this._ifActive(node, () => {
				node.log("EventSource connection established");
				this._publishCurrentState();
			}),
			onError: this._ifActive(node, (message, shortMessage) => {
				// if we get an error from the event event source, publish it.
				this._publishError({ endPoint: eventSourceEndPoint }, message);
			}),
			onMessage: this._ifActive(node, this._handleMessage)
		});

		return this;
	}

	// --- Private methods ---

	async _getAll(conceptType) {
        // will never get called with an unknown concept, or one without getAllUrl
		this.node.log(`Getting statuses of all ${conceptType.name}...`);
		const endPoint = conceptType.getAllUrl?.();
		const operation = HTTP_METHODS.GET;
		const callResponse = await this.connection.sendRequest(endPoint, HTTP_METHODS.GET, null, errorResponse => {
			// inform the listeners of errors. We can do that here, since controllerHandler is initiator.
			// This is only called right after the event handler starts, so connection isn't reported up yet.
			this._publishError({ endPoint, operation }, errorResponse, false);
		});
		return callResponse;
	}

	_getEndPoint(method, identifier) {	return method?.(identifier); }

	_getRequestParameters(conceptType, identifier, operation) {
		let endPoint, verb;
		switch (operation) {
			case OPERATION.GET:
				endPoint = this._getEndPoint(conceptType.getUrl, identifier);
				verb = HTTP_METHODS.GET;
				break;
			case OPERATION.COMMAND:
				endPoint = this._getEndPoint(conceptType.commandUrl, identifier);
				verb = conceptType.commandVerb;
				break;
			case OPERATION.UPDATE:
				endPoint = this._getEndPoint(conceptType.updateUrl, identifier);
				verb = conceptType.updateVerb;
				break;
			default: {
				const message = `${operation}: unknown operation`;
				return { ok: false, message };
			}
		}

		if (!endPoint || !verb) {
			const message = `${operation}: unsupported for '${conceptType.name}'`;
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
		const identifier = conceptType.idFromRequest?.(openhab); // not defined for concepts that don't require an identifier
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

		const thingType = CONCEPTS.get(CONCEPTS.THINGS);

		const thingsResponse = await this._getAll(thingType);
		if (!thingsResponse.ok) return; // fatal, already reported via callback 

		const itemsType = CONCEPTS.get(CONCEPTS.ITEMS);

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

	_publishError(context, payload, reportConnectionIssue = true) {
		if (reportConnectionIssue) {
			this.eventBus.publish(EVENT_TAGS.CONNECTION_STATUS, SWITCH_STATUS.OFF);
		}
		this.eventBus.publish(EVENT_TAGS.GLOBAL_ERROR, { context, payload });

	}

	/** Publish message in standard format across concepts */
	_publishMessage(concept, identifier, incoming, eventType) {
		const conceptType = CONCEPTS.get(concept);

		// ignore messages with unknown concepts.
		if (conceptType.isUnknown) return;

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
			this._publishError({ event }, `Failed to parse event as JSON: ${event.data}`, false);
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
