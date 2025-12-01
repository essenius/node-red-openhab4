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

const { EVENT_TAGS, EVENT_TYPES, SWITCH_STATUS } = require("./constants");
const { OpenhabConnection } = require("./openhabConnection");
const { EventBus } = require("./eventBus");


class ControllerHandler {
	constructor(node, config, eventBus = new EventBus()) {
		this.node = node;
		node.handler = this;
		this.config = config;
		this.connection = null;
		this.eventBus = eventBus;
	}

	/** request value of or send command/update to an item */
	async control(clientNode, itemName, topic = null, payload = null) {
		const result = await this.connection.controlItem(itemName, topic, payload, (result) => { 
			// if it fails, inform the requester (only, not all clients) and global error listeners
			clientNode.emit(EVENT_TAGS.NODE_ERROR, result.message);
			this.eventBus.publish(EVENT_TAGS.GLOBAL_ERROR, result.message);
		});

		return result;
	}

	/** Validates the connection to OpenHAB and waits for it to become ready. Emits Connection status / connection errors accordlingly.
	* On success, it starts the EventSource connection and emits the initial state of all items. */
	setupNode() {
		const { node, config } = this; 
		node.on("close", this._onClose);

		// we're offline until we have a confirmed connection
		this.eventBus.publish(EVENT_TAGS.CONNECTION_STATUS, SWITCH_STATUS.OFF);

		// the defaults have already been applied here (happens in controller.js)

		node.log(`OpenHAB Controller connecting to: ${config.protocol}://${config.host}:${config.port}`);

		// TODO: inject this dependency
		this.connection = new OpenhabConnection(config);

		node.log("OpenHAB is ready, starting EventSource connection...");

		this.connection.startEventSource({
			topics: config.eventFilter,

			onOpen: this._ifActive(node, () => {
				node.log("EventSource connection established");
				this._emitStateOfItems();
			}),
			onError: this._ifActive(node, (message, shortMessage) => {
				this._emitError(message, shortMessage);
			}),
			onMessage: this._ifActive(node, this._handleMessage)
		});

		return this;
	}

	publish(tag, payload) {
		this.eventBus.publish(tag, payload);
	}

    subscribe(node, tag) {
		this.eventBus.subscribe(node, tag);
    }

    unsubscribe(node, tag) {
		this.eventBus.unsubscribe(node, tag);
	}

	// --- Private methods ---

	_emitError(message, nodeMessage, reportConnectionIssue = true) {
		// TODO: defer warnings a client node.
		if (nodeMessage == null) nodeMessage = message;
		if (nodeMessage !== "") {
			this.eventBus.publish(EVENT_TAGS.NODE_ERROR, nodeMessage);
		}
		this.eventBus.publish(EVENT_TAGS.GLOBAL_ERROR, message);

		if (reportConnectionIssue) {
			this.eventBus.publish(EVENT_TAGS.CONNECTION_STATUS, SWITCH_STATUS.OFF);
		}
	}

	/** Emit the state of all items to the subscribers. This is called after the EventSource connection is established.
	 * If useful, it will retry after a delay on failure. */
	async _emitStateOfItems() {
		const { connection, node } = this;
		node.log("Getting state of all items");
		// getItems takes an error handler as parameter, allowing intermediate messages during retries
		const itemsResponse = await connection.getItems((response) => {
			// if we have a non-retryable error, it's most likely fatal so we inform all listeners
			if (!response.retry) {
				this._emitError(response.message);
			}
		});
		if (!itemsResponse.ok) {
			// fatal error, already reported via callback
			return;
		}
		
		this.eventBus.publish(EVENT_TAGS.CONNECTION_STATUS, SWITCH_STATUS.ON);


		for (const element of itemsResponse.data) {
			// element already has name and state
			const message = { ...element, item: element.name, fullName: EVENT_TAGS.ITEM(element.name), event: EVENT_TYPES.ITEM_STATE_EVENT };
			this.eventBus.publish(message.fullName, message);
		};
	}

	/** OpenHAB events always have (event) type, topic and payload */
	isValidEvent(event) {
		if (!event) return false;
		return event.type && event.payload && event.topic;
	}

	/** Emit event based on the message received from the event server. */
	_emitReceivedEvent(incoming) {

        // the topic format is openhab/concept/name/event (OH3+) or smarthome/concept/name/event (OH2)
		// Extract name and concept/name as fullName
		// Regex notes:
		// 1) No escape needed for / within character class [...]. 
		// 2) (?:) is non-capturing group.
		// 3) the last group is optional

		if (!this.isValidEvent(incoming)) return;

		const match = incoming.topic.match(/^(?:openhab|smarthome)\/([^/]+)\/([^/]+)(?:\/(.*))?$/);
		if (!match) return;
		const [, concept, name, event] = match;
		let message = {
			...incoming,
			concept,
			name,
			fullName: EVENT_TAGS.FULL_NAME(concept, name),
			...(event && { event }),
		}
		this.eventBus.publish(message.fullName, message);
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

	_safeParseJSON(str, fallback = null) {
		try {
			return JSON.parse(str);
		} catch {
			return fallback;
		}
	}

	// --- Event handlers ---

	/** Handle incoming messages. Parse non-empty data, and try parsing payload again (it can be stringified JSON).
	 * Extract the item name from the topic and emit all messages as RAW_EVENT, and state messages as their respective type. 
	 * Note: Assumes that the check for node validity was already done. */
	_handleMessage = (event) => {

		// ignore events without data
		if (!event.data || event.data.trim() === "") return;

		const msg = this._safeParseJSON(event.data);
		if (!msg) {
	        this._emitError(`Failed to parse event as JSON: ${event.data}`, "", false);
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

		this._emitReceivedEvent(msg);
	};

	_onClose = (removed, done) => {
        const node = this.node;
        node.log(`✅ CONTROLLER CLOSE EVENT - removed: ${removed}`);
        this.eventBus.publish(EVENT_TAGS.CONNECTION_STATUS, SWITCH_STATUS.OFF);

        // Close centralized EventSource connection
        if (this.connection) {
            node.log("🔥 Closing centralized connection");
            this.connection.close();
            this.connection = null;
        }

        node.log("✅ Controller cleanup complete");
        done();
    };

}

/** Entry point to create and setup the GetNode. Called by the get node registration. */
function setupController(node, config) {
	return new ControllerHandler(node, config).setupNode();
}

module.exports = { ControllerHandler, setupController };
