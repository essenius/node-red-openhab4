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

const { EVENT_TOPICS, EVENT_TYPE_GROUPS, EVENT_TYPES, SWITCH_STATUS, RETRY_CONFIG } = require("./openhabConstants");
const { addStatusMethods } = require('./statusUtils');
const { OpenhabConnection } = require("./openhabConnection");

function setupControllerNode(node, config, options = {}) {
	// Add semantic status methods to the node
	addStatusMethods(node);

	let stateRetryTimer = null;
	let connection = null;

	node.getConfig = function () {
		return config;
	}

	// Add URL validation at startup
	if (!config.host) {
		const error = "Invalid OpenHAB configuration: Missing host";
		node.error(error);
		node.setStatusError("config error");
		return;
	}

	node.log(`OpenHAB Controller connecting to: ${config.protocol || "http"}://${config.host}:${config.port}`);

	// Create centralized connection
	connection = new OpenhabConnection(config, node);

	// wait until openHAB is ready before starting EventSource

	(async () => {
		node.log("Waiting for openHAB to become ready...");
		const ready = await waitForOpenHABReady(options.maxAttempts, options.interval);

		if (!node || node._closed) {
			node.log("🛑 Node was closed before openHAB became ready. Aborting connection.");
			return;
		}
		if (!ready) {
			node.error("openHAB did not become ready in time.");
			node.setStatusError("openHAB not ready");
			return;
		}

		node.log("openHAB is ready, starting EventSource connection...");
		connection.startEventSource({
			topics: EVENT_TOPICS.ALL_ITEMS,
			onOpen: () => {
				if (node && !node._closed) {
					getStateOfItems();
				}
			},
			onMessage: handleControllerMessage
		});
	})();

	node.control = async function (itemname, topic, payload, okCb, errCb) {
		try {
			const result = await connection.controlItem(itemname, topic, payload);
			okCb(result);
		} catch (error) {
			errCb(error.message);
		}
	};

	node.on("close", function (removed, done) {
		node.log('✅ CONTROLLER CLOSE EVENT - removed:', removed);
		node.emit(EVENT_TYPES.COMMUNICATION_STATUS, SWITCH_STATUS.OFF);

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

	async function waitForOpenHABReady(maxAttempts = 20, interval = 500) {
		let attempts = 0;
		while (attempts < maxAttempts) {
			// Exit early if node is closed
			node.log(JSON.stringify(node));
			if (!node || node._closed) return false;
			if (await connection.testIfLive()) return true;
			attempts++;
			await new Promise(resolve => setTimeout(resolve, interval));
		}
		// We reached max attempts without a live connection and give up.
		return false;
	}

	async function getStateOfItems() {
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
			node.warn("Error getting item states: " + error.message);
			node.emit(EVENT_TYPES.COMMUNICATION_ERROR, error);

			// Retry after delay
			stateRetryTimer = setTimeout(() => {
				stateRetryTimer = null;
				getStateOfItems();
			}, RETRY_CONFIG.STATE_RETRY_DELAY);
		}
	}

	// Define controller-specific message handler
	function handleControllerMessage(event) {
		// Safety check: don't process if node is being destroyed
		if (!node || node._closed) {
			return;
		}

		try {
			// Safely parse the event data
			if (!event.data || event.data.trim() === "") {
				node.warn("Received empty event data, ignoring");
				return;
			}

			// Parse the message data (same logic as before)
			let msg = JSON.parse(event.data);
			// Safely parse the payload if it's a string
			if (typeof msg.payload === "string" && msg.payload.trim() !== "") {
				try {
					msg.payload = JSON.parse(msg.payload);
				} catch (payloadError) {
					node.warn(`Could not parse string payload as JSON: ${msg.payload}`);
					// Keep the payload as string if it's not valid JSON
				}
			}

			const topicParts = msg.topic.split('/');
			const item = topicParts[2] || "";

			// Emit events exactly as before
			node.emit(item + "/" + EVENT_TYPES.RAW_EVENT, msg);
			node.emit(EVENT_TYPES.RAW_EVENT, msg);

			if (EVENT_TYPE_GROUPS.STATE_EVENTS.includes(msg.type)) {
				node.emit(item + "/" + EVENT_TYPES.STATE_EVENT, { type: msg.type, state: msg.payload.value });
			}
		} catch (e) {
			if (node && !node._closed) {
				node.error("Error parsing event data: " + e.message);
			}
		}
	}

}

module.exports = { setupControllerNode };
