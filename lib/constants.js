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

const ERROR_TYPES = {
    AUTH: 'auth',
    HTTP: "http",
    NETWORK: "network",
    TLS: "tls",
    UNKNOWN: "unknown",
}

// Event Types (from your message handling)
const EVENT_TYPES = {
    ITEM_STATE: 'ItemStateEvent',
    THING_STATUS: 'ThingStatusInfoEvent',
};

const EVENT_TAGS = {
    GLOBAL_ERROR: 'GlobalError',
    CONNECTION_STATUS: 'ConnectionStatus',
}


const HTTP_METHODS = {
    GET: 'GET',
    POST: 'POST',
    PUT: 'PUT'
};

const _RESOURCES = {
    ITEMS: "items",
    THINGS: "things",
    SYSTEM: "system",
    EVENTS: "events",
}

const _CONCEPTS = {
        // URL for admin/config fetch in the Node-RED UI
    adminUrl: concept => `/openhab4/${concept}`,
    baseUrl: concept => `/rest/${concept}`,

    // URL for REST operations (GET/PUT/POST)
    resourceUrl: (concept, id) => {
        if (concept === CONCEPTS.SYSTEM) return '/rest'; // system gets the OH version from the root endpoint
        return `/rest/${concept}/${id}`;
    },

    extractId: longTopic => {
        const parts = longTopic.split('/');
        return parts.length > 2 ? parts[2] : null;
    },

    topic: (concept, id) => {
        if (concept === CONCEPTS.SYSTEM) return CONCEPTS.SYSTEM;
        return `${concept}/${id}`;
    }
}

const CONCEPTS = {
    ..._RESOURCES,
    ..._CONCEPTS,
    [_RESOURCES.EVENTS]: {
        name: _RESOURCES.EVENTS,
        streamUrl: filter => _CONCEPTS.baseUrl(_RESOURCES.EVENTS) + (filter ? `?topics=${filter}` : '')
    },

    [_RESOURCES.ITEMS]: {
        name: _RESOURCES.ITEMS,
        getUrl: id => _CONCEPTS.resourceUrl(_RESOURCES.ITEMS, id),
        payload: data => data?.state ?? data?.payload?.value,
        payloadType: data => data?.type ?? data?.payload?.type,
        topic: id => `${_RESOURCES.ITEMS}/${id}`,
        idFromEvent: longTopic => _CONCEPTS.extractId(longTopic),
        idFromRequest: data => data?.name,
        commandVerb: HTTP_METHODS.POST,
        updateVerb: HTTP_METHODS.PUT,
        commandUrl: id => _CONCEPTS.resourceUrl(_RESOURCES.ITEMS, id),
        updateUrl: id => `${_CONCEPTS.resourceUrl(_RESOURCES.ITEMS, id)}/state`,
        getAllUrl: () => _CONCEPTS.baseUrl(_RESOURCES.ITEMS),
    },

    [_RESOURCES.THINGS]: {
        name: _RESOURCES.THINGS,
        getUrl: id => _CONCEPTS.resourceUrl(_RESOURCES.THINGS, id),
        payload: data => data?.payload?.status ?? data?.statusInfo?.status,
        payloadType: () => "Status",
        idFromRequest: data => data?.UID,
        idFromEvent: longTopic => _CONCEPTS.extractId(longTopic),
        topic: id => `${_RESOURCES.THINGS}/${id}`,
        getAllUrl: () => _CONCEPTS.baseUrl(_RESOURCES.THINGS),
    },

    [_RESOURCES.SYSTEM]: {
        name: _RESOURCES.SYSTEM,
        getUrl: () => _CONCEPTS.resourceUrl(_RESOURCES.SYSTEM),
        payload: data => data?.runTimeInfo?.version ?? "2.x",
        payloadType: () => 'Version',
        idFromRequest: () => '',
        topic: () => _RESOURCES.SYSTEM
    }
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

const OPERATION = {
    UPDATE: 'update',
    COMMAND: 'command',
    GET: 'get'
};

// Retry Configuration
const RETRY_CONFIG = {
    STATE_RETRY_DELAY: 15000,        // 15 seconds instead of 5
    CONTROLLER_READY_TIMEOUT: 5000,  // Fallback timeout when waiting for controller

    EVENTSOURCE_INITIAL_DELAY: 2500,    // initial delay in ms (2.5 seconds) 
    EVENTSOURCE_MAX_RETRY_DELAY: 60000, // max delay in ms (1 minute)
    EVENTSOURCE_BACKOFF_FACTOR: 2       // exponential factor
};


const CONTEXT = {
    STATE: 'state',
    UNKNOWN: '?',
    NULL: "null"
}

module.exports = {
    CONCEPTS,
    CONTEXT,
    EVENT_TAGS,
    EVENT_TYPES,
    ERROR_TYPES,
    HTTP_METHODS,
    NODE_STATUS,
    OPERATION,
    RETRY_CONFIG,
    STATE,
    STATE_MAPPING,
    SWITCH_STATUS
};