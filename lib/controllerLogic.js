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

const { CONTEXT, EVENT_TOPICS, EVENT_TYPE_GROUPS, EVENT_TYPES, SWITCH_STATUS, RETRY_CONFIG } = require("./constants");
const { OpenhabConnection } = require("./openhabConnection");


/** Validates the connection to OpenHAB and waits for it to become ready. Emits Connection status / connection errors accordlingly.
 * On success, it starts the EventSource connection and emits the initial state of all items. */
function setupControllerNode(node, config) {

	let stateRetryTimer = null;
	let connection = null;

	// we're offline until we have a confirmed connection
	node.emit(EVENT_TYPES.CONNECTION_STATUS, SWITCH_STATUS.OFF);

	// the defaults have already been applied here (happens in controller.js)

	node.getConfig = function () {
		return config;
	}

	node.handleControllerError = function (error, source = null) {
		const message = (source === null ? "" : (source + ": ")) + ((error && error.message) ? error.message : String(error));
		node.error(message);
		node.emit(EVENT_TYPES.CONNECTION_ERROR, message);
	}

	node.log(`OpenHAB Controller connecting to: ${config.protocol}://${config.host}:${config.port}`);

	connection = new OpenhabConnection(config);

	// wait until openHAB is ready before starting EventSource

	function ifActive(node, fn) {
		return (...args) => {
			if (isActive(node)) {
				fn(...args);
			}
		};
	}

	node.log("openHAB is ready, starting EventSource connection...");

	connection.startEventSource({
		topics: EVENT_TOPICS.ALL_ITEMS,
		onOpen: ifActive(node, () => {
			node.log("✅ EventSource connection established");
			node.emit(EVENT_TYPES.CONNECTION_STATUS, SWITCH_STATUS.ON);
			emitStateOfItems();
		}),
		onError: ifActive(node, (status, message, shortMessage) => {
			node.warn(`Error ${status}: ${message}`);
			if (shortMessage === "") return;
			shortMessage = shortMessage || `error ${status}`;
			node.emit(EVENT_TYPES.CONNECTION_STATUS, SWITCH_STATUS.OFF);
			node.emit(EVENT_TYPES.CONNECTION_ERROR, shortMessage);
		}),
		onMessage: ifActive(node, handleControllerMessage)
	});

	// setup the control function to send commands to openHAB
	node.control = async function (itemName, topic = null, payload = null) {
		try {
			return await connection.controlItem(itemName, topic, payload);
		} catch (error) {
			node.handleControllerError(error, itemName);
			throw error;
		}
	};

	// setup the close handler
	node.on("close", function (removed, done) {
		node.log('✅ CONTROLLER CLOSE EVENT - removed:', removed);
		node.emit(EVENT_TYPES.CONNECTION_STATUS, SWITCH_STATUS.OFF);

		// Clear state retry timer
		if (stateRetryTimer) {
			node.log('🔥 Clearing state retry timer');
			clearTimeout(stateRetryTimer);
			stateRetryTimer = null;
		}

		// Close centralized connection (handles all EventSource cleanup)
		if (connection) {
			node.log('🔥 Closing centralized connection');
			connection.close();
			connection = null;
		}

		node.log('✅ Controller cleanup complete');
		done();
	});

	// Nested functions for setupControllerNode

	/** Check if the node is still active (not closed) */
	function isActive(node) {
		return node && !node._closed;
	}

	/** Repeatedly send a cheap URL to OpenHAB until it succeeds or times out  */
	/*async function waitForOpenHABReady(maxAttempts = 20, interval = 500) {
		let attempts = 0;
		while (attempts < maxAttempts) {
			// Exit early if node is closed
			if (!isActive) return false;
			if (await connection.testIfLive()) return true;
			attempts++;
			await new Promise(resolve => setTimeout(resolve, interval));
		}
		// We reached max attempts without a live connection and give up.
		return false;
	}*/

	/** Emit the state of all items to the node. This is called after the EventSource connection is established.
	 * If it fails, it will retry after a delay. TODO: check if this is still needed now we have waitForOpenHABReady  */
	async function emitStateOfItems() {
		try {
			node.log("Getting state of all items");
			const items = await connection.getItems();

			items.forEach(item => {
				node.emit(`${item.name}/${EVENT_TYPES.STATE_EVENT}`, {
					type: EVENT_TYPES.ITEM_STATE_EVENT,
					state: item.state
				});
			});
		} catch (error) {
			node.handleControllerError(error);

			// Retry after delay
			stateRetryTimer = setTimeout(() => {
				stateRetryTimer = null;
				emitStateOfItems();
			}, RETRY_CONFIG.STATE_RETRY_DELAY);
		}
	}

	function isNonEmptyString(value) {
		return typeof value === "string" && value.trim() !== "";
	}


	/** Emit item events based on the message received from the controller. 
	 * This will usually be 3 messages, one raw event, and two item events (raw and state) */
	function emitItemEvents(node, msg) {
		// Emit raw event with the full message for events and health nodes
		node.emit(EVENT_TYPES.RAW_EVENT, msg);

		// The topic should now be openhab/items/itemName/type. Ignore others, if any
		const topicParts = msg.topic.split('/');
		const topicType = topicParts[1];
		if (topicType !== CONTEXT.ITEMS) return;

		// The item name is the third part of the topic. Ignore if it is not there
		const item = topicParts[2];
		if (!item) return;

		// Emit raw event with the full message for events and health nodes
		node.emit(EVENT_TYPES.ITEM_EVENT(item, EVENT_TYPES.RAW_EVENT), msg);

		// Emit state events with item name prepended so in nodes can listen to it
		if (EVENT_TYPE_GROUPS.STATE_EVENTS.includes(msg.type)) {
			node.emit(EVENT_TYPES.ITEM_EVENT(item, EVENT_TYPES.STATE_EVENT), { type: msg.type, state: msg.payload.value });
		}
	}

	/** Handle incoming messages. Parse non-empty data, and try parsing payload again (it can be stringified JSON).
	 * Extract the item name from the topic and emit all messages as RAW_EVENT, and state messages as their respective type. 
	 * Note: Assumes that the check for node validity was already done. */
	function handleControllerMessage(event) {
		try {
			// Safely parse the event data
			if (!event.data || event.data.trim() === "") {
				node.warn("Received empty event data, ignoring");
				return;
			}

			// Parse the message data
			let msg = JSON.parse(event.data);
			// Safely parse the payload if it's a string
			if (isNonEmptyString(msg.payload)) {
				try {
					msg.payload = JSON.parse(msg.payload);
				} catch (_payloadError) {
					node.warn(`Could not parse string payload as JSON: ${msg.payload}`);
					// Keep the payload as string if it's not valid JSON
				}
			}

			emitItemEvents(node, msg);
		} catch (error) {
			node.handleControllerError(error);
		}
	}
}

module.exports = { setupControllerNode };
