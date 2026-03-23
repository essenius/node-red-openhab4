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

const ERROR_TYPE = {
    AUTH: 'auth',
    DOMAIN: 'domain',
    HTTP: 'http',
    NETWORK: 'network', // eliminate?
    SYSTEM: 'system',
    TLS: 'tls',
    TRANSPORT: 'transport',
    UNKNOWN: 'unknown',
};

const EVENT_TYPE = {
    ITEM_STATE: 'ItemStateEvent',
    ITEM_COMMAND: 'ItemCommandEvent',
    ITEM_UPDATE: 'ItemUpdateEvent',
    THING_STATUS: 'ThingStatusInfoEvent',
    ITEM_INITIALIZE: 'ItemInitializeEvent', // added events
    THING_INITIALIZE: 'ThingInitializeEvent',
};

const EVENT_TAG = {
    GLOBAL_ERROR: 'GlobalError',
    CONNECTION_STATUS: 'ConnectionStatus',
};

const HTTP_METHOD = {
    GET: 'GET',
    POST: 'POST',
    PUT: 'PUT',
};

const CONCEPT = {
    ITEMS: 'items',
    THINGS: 'things',
    SYSTEM: 'system',
    EVENTS: 'events',
    UNKNOWN: 'unknown',
    ROOT_URL: '/rest',
};

// Switch Status Values
const SWITCH = {
    ON: 'ON',
    OFF: 'OFF',
};

// Node Status Configuration (for consistent UI across all nodes)
const _NODE_STATUS = {
    COLORS: {
        RED: 'red',
        GREEN: 'green',
        BLUE: 'blue',
        YELLOW: 'yellow',
        GREY: 'grey',
    },
    SHAPES: {
        DOT: 'dot',
        RING: 'ring',
    },
};

// Semantic Status States (high-level abstraction)
const STATE = {
    INIT: 'INIT', // Node is initializing
    READY: 'READY', // Node is ready/idle
    WAITING: 'WAITING', // Node is waiting for something
    WORKING: 'WORKING', // Node is actively working
    CONNECTING: 'CONNECTING', // Node/connection is connecting
    UP: 'UP', // Node/connection is up
    OK: 'OK', // Operation completed successfully
    OK_FALSY: 'OK_FALSY', // Operation completed successfully but with falsy value
    WARNING: 'WARNING', // Warning state
    ERROR: 'ERROR', // Error state
    DOWN: 'DOWN', // Node/connection is down
};

// Status State to Visual Mapping
const STATE_MAPPING = {
    [STATE.INIT]: { fill: _NODE_STATUS.COLORS.GREY, shape: _NODE_STATUS.SHAPES.RING },
    [STATE.READY]: { fill: _NODE_STATUS.COLORS.GREY, shape: _NODE_STATUS.SHAPES.DOT },
    [STATE.WAITING]: { fill: _NODE_STATUS.COLORS.BLUE, shape: _NODE_STATUS.SHAPES.RING },
    [STATE.WORKING]: { fill: _NODE_STATUS.COLORS.BLUE, shape: _NODE_STATUS.SHAPES.DOT },
    [STATE.CONNECTING]: { fill: _NODE_STATUS.COLORS.YELLOW, shape: _NODE_STATUS.SHAPES.DOT },
    [STATE.UP]: { fill: _NODE_STATUS.COLORS.GREEN, shape: _NODE_STATUS.SHAPES.DOT },
    [STATE.OK]: { fill: _NODE_STATUS.COLORS.GREEN, shape: _NODE_STATUS.SHAPES.DOT },
    [STATE.WARNING]: { fill: _NODE_STATUS.COLORS.YELLOW, shape: _NODE_STATUS.SHAPES.RING },
    [STATE.ERROR]: { fill: _NODE_STATUS.COLORS.RED, shape: _NODE_STATUS.SHAPES.RING },
    [STATE.DOWN]: { fill: _NODE_STATUS.COLORS.RED, shape: _NODE_STATUS.SHAPES.RING },
    [STATE.OK_FALSY]: { fill: _NODE_STATUS.COLORS.GREEN, shape: _NODE_STATUS.SHAPES.RING },
};

const ACTION = {
    UPDATE: 'update',
    COMMAND: 'command',
    GET: 'get',
};

// Retry Configuration
const RETRY_CONFIG = {
    STATE_RETRY_DELAY: 15000, // 15 seconds instead of 5
    CONTROLLER_READY_TIMEOUT: 5000, // Fallback timeout when waiting for controller

    EVENTSOURCE_INITIAL_DELAY: 2500, // initial delay in ms (2.5 seconds)
    EVENTSOURCE_MAX_RETRY_DELAY: 60000, // max delay in ms (1 minute)
    EVENTSOURCE_BACKOFF_FACTOR: 2, // exponential factor
};

const CONTEXT = {
    STATE: 'state',
    UNKNOWN: '?',
    NULL: 'null',
};

module.exports = {
    CONCEPT,
    CONTEXT,
    EVENT_TAG,
    EVENT_TYPE,
    ERROR_TYPE,
    HTTP_METHOD,
    ACTION,
    RETRY_CONFIG,
    STATE,
    STATE_MAPPING,
    SWITCH,
};
