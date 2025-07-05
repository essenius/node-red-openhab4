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
const { addStatusMethods, validateController, STATUS_STATES } = require('./statusUtils');

function setupOpenhabIn(node, config, controller, utils) {
	// Add semantic status methods to the node
	addStatusMethods(node);
	
	const { generateId } = utils;
	const itemName = (config.itemname || "").trim();
	
	// Validate controller configuration
	if (!validateController(node, controller)) {
		return;
	}

	node.log('OpenHABIn, config: ' + JSON.stringify(config));
	node.context().set("currentState", "?");

	// Helper function to create standardized messages
	function createMessage(payload, eventType) {
		return {
			_msgid: generateId(),
			payload: payload,
			item: itemName,
			event: eventType
		};
	}

	controller.on(EVENT_TYPES.COMMUNICATION_ERROR, (err) => {
		node.setStatusError("connection error: " + err);
	});

	controller.on(EVENT_TYPES.COMMUNICATION_STATUS, (state) => {
		if (state === SWITCH_STATUS.ON) {
			node.setStatusReady();
		} /*else {
				node.setStatusDisconnected();
			} */
	});

	node.refreshNodeStatus = function () {
		const state = node.context().get("currentState");
		
		if (state == null) {
			node.setStatusWarning("state:null");
		} else if (state === SWITCH_STATUS.ON) {
			node.setStatusConnected("state:" + state);
		} else if (state === SWITCH_STATUS.OFF) {
			node.setStatusOK("state:" + state);
		} else {
			node.setStatusWaiting("state:" + state);
		}
	};

	node.processStateEvent = function (event) {
		let currentState = node.context().get("currentState");

		if ((event.state != currentState) && (event.state != "null")) {
			currentState = event.state;
			node.context().set("currentState", currentState);
			node.refreshNodeStatus();

			const stateMsg = createMessage(currentState, EVENT_TYPES.STATE_EVENT);
			node.send([stateMsg, null]);
		}
	};

	node.processRawEvent = function (event) {
		const rawMsg = createMessage(event, EVENT_TYPES.RAW_EVENT);
		node.send([null, rawMsg]);
	};

	controller.addListener(itemName + '/' + EVENT_TYPES.RAW_EVENT, node.processRawEvent);
	controller.addListener(itemName + '/' + EVENT_TYPES.STATE_EVENT, node.processStateEvent);
	node.refreshNodeStatus();

	/* ===== Node-Red events ===== */
	node.on("input", function (msg) {
		if (msg != null) {
			// placeholder for input logic
		};
	});
	node.on("close", function () {
		node.log('close');
		controller.removeListener(itemName + '/' + EVENT_TYPES.STATE_EVENT, node.processStateEvent);
		controller.removeListener(itemName + '/' + EVENT_TYPES.RAW_EVENT, node.processRawEvent);
	});
}

module.exports = { setupOpenhabIn: setupOpenhabIn };
