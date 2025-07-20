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

// API Endpoints (from your actual code)
const ENDPOINTS = {
    ITEMS: '/rest/items',
    EVENTS: '/rest/events',
    TEST_URL: '/rest',
    ITEM_STATE: (itemname) => `/rest/items/${itemname}/state`,
    ITEM_COMMAND: (itemname) => `/rest/items/${itemname}`
};

// Event Topics (from your EventSource usage)
const EVENT_TOPICS = {
    ALL_ITEMS: 'openhab/items/*/*',
    //ITEM_SPECIFIC: (itemname) => `openhab/items/${itemname}/*`
};

// Event Types (from your message handling)
const EVENT_TYPES = {
    ITEM_STATE: 'ItemStateEvent',
    ITEM_STATE_CHANGED: 'ItemStateChangedEvent',
    ITEM_STATE_UPDATED: 'ItemStateUpdatedEvent',
    GROUP_ITEM_STATE_CHANGED: 'GroupItemStateChangedEvent',
    RAW_EVENT: 'RawEvent',
    STATE_EVENT: 'StateEvent',
    ITEM_STATE_EVENT: 'ItemStateEvent',
    CONNECTION_STATUS: 'ConnectionStatus',
    CONNECTION_ERROR: 'ConnectionError',
    ITEM_EVENT: (itemName, event) => `${itemName}/${event}` 
};

const EVENT_TYPE_GROUPS = {
    STATE_EVENTS: [EVENT_TYPES.ITEM_STATE, EVENT_TYPES.ITEM_STATE_CHANGED, EVENT_TYPES.ITEM_STATE_UPDATED, EVENT_TYPES.GROUP_ITEM_STATE_CHANGED]
};

// Switch Status Values
const SWITCH_STATUS = {
    ON: 'ON',
    OFF: 'OFF'
};

// Node Status Configuration (for consistent UI across all nodes)
const NODE_STATUS = {
    COLORS: {
        RED: "red",
        GREEN: "green",
        BLUE: "blue",
        YELLOW: "yellow",
        GREY: "grey"
    },
    SHAPES: {
        DOT: "dot",
        RING: "ring"
    }
};

// Semantic Status States (high-level abstraction)
const STATE = {
    INIT: 'INIT',           // Node is initializing
    READY: 'READY',         // Node is ready/idle
    WAITING: 'WAITING',     // Node is waiting for something
    WORKING: 'WORKING',     // Node is actively working
    CONNECTED: 'CONNECTED', // Node/connection is connected
    OK: 'OK',               // Operation completed successfully
    OK_FALSY: 'OK_FALSY',   // Operation completed successfully but with falsy value
    WARNING: 'WARNING',     // Warning state
    ERROR: 'ERROR',         // Error state
    DISCONNECTED: 'DISCONNECTED' // Node/connection is disconnected
};

// Status State to Visual Mapping
const STATE_MAPPING = {
    [STATE.INIT]: { fill: NODE_STATUS.COLORS.GREY, shape: NODE_STATUS.SHAPES.RING },
    [STATE.READY]: { fill: NODE_STATUS.COLORS.GREY, shape: NODE_STATUS.SHAPES.DOT },
    [STATE.WAITING]: { fill: NODE_STATUS.COLORS.BLUE, shape: NODE_STATUS.SHAPES.RING },
    [STATE.WORKING]: { fill: NODE_STATUS.COLORS.BLUE, shape: NODE_STATUS.SHAPES.DOT },
    [STATE.CONNECTED]: { fill: NODE_STATUS.COLORS.GREEN, shape: NODE_STATUS.SHAPES.DOT },
    [STATE.OK]: { fill: NODE_STATUS.COLORS.GREEN, shape: NODE_STATUS.SHAPES.DOT },
    [STATE.WARNING]: { fill: NODE_STATUS.COLORS.YELLOW, shape: NODE_STATUS.SHAPES.DOT },
    [STATE.ERROR]: { fill: NODE_STATUS.COLORS.RED, shape: NODE_STATUS.SHAPES.RING },
    [STATE.DISCONNECTED]: { fill: NODE_STATUS.COLORS.RED, shape: NODE_STATUS.SHAPES.RING },
    [STATE.OK_FALSY]: { fill: NODE_STATUS.COLORS.GREEN, shape: NODE_STATUS.SHAPES.RING }
};

// Control Topics (from your node.control function)
const CONTROL_TOPICS = {
    ITEM_UPDATE: 'ItemUpdate',
    ITEM_COMMAND: 'ItemCommand'
};

// Retry Configuration (from your actual retry logic)
const RETRY_CONFIG = {
    STATE_RETRY_DELAY: 15000,        // 15 seconds instead of 5
    CONTROLLER_READY_TIMEOUT: 5000,  // Fallback timeout when waiting for controller

    EVENTSOURCE_INITIAL_DELAY: 2500,    // initial delay in ms (2.5 seconds) 
    EVENTSOURCE_MAX_RETRY_DELAY: 60000, // max delay in ms (1 minute)
    EVENTSOURCE_BACKOFF_FACTOR: 2       // exponential factor
};

const HTTP_METHODS = {
    GET: 'GET',
    POST: 'POST',
    PUT: 'PUT'
};

const CONTEXT = {
    STATE: 'state',
    ITEM: 'item',
    ITEMS: 'items',
    ITEM_DATA: 'item_data',
    PAYLOAD_IN: 'payload_in',
    PAYLOAD: 'payload',
    UNKNOWN: '?',
    NULL: "null"
}

module.exports = {
    ENDPOINTS,
    EVENT_TOPICS,
    EVENT_TYPES,
    EVENT_TYPE_GROUPS,
    CONTROL_TOPICS,
    HTTP_METHODS,
    RETRY_CONFIG,
    SWITCH_STATUS,
    NODE_STATUS,
    STATE,
    STATE_MAPPING,
    CONTEXT
};