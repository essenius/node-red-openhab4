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

const { ACTION, CONCEPT, HTTP_METHOD } = require('./constants');

class Resource {
    static ROOT_URL = '/rest';
    static ROOT_TOPIC = ['openhab', 'smarthome'];

    constructor(concept, identifier, event) {
        this.concept = concept.trim().toLowerCase();
        this.identifier = identifier?.trim();
        this.event = event?.trim().toLowerCase();
        this.payload = null;
        this.payloadType = null;
        this.eventType = null;
    }

    // --- Static methods ---

    static adminUrl(concept) {
        return `/openhab4/${concept}`;
    }
    static getAllUrl(concept) {
        return `${Resource.ROOT_URL}/${concept}`;
    }

    static isValidEvent(message) {
        return !!(message.type && message.payload && message.topic);
    }

    static streamUrl(filter) {
        return `${this.ROOT_URL}/events` + (filter ? `?topics=${encodeURIComponent(filter)}` : '');
    }

    // -- Public methods

    endPoint(action) {
        if (action === ACTION.GET) return { url: this._identifierUrl(), verb: HTTP_METHOD.GET };
        return undefined;
    }

    // the resource is valid if the _id is specified or if it's not needed
    isValid() {
        return (this.identifier != null && this.identifier != '') || !this._parseIdentifier;
    }

    nullIfInvalid() {
        if (!this.isValid()) return null;
        return this;
    }

    parseMessage(message) {
        if (!this.identifier) {
            this._parseIdentifier?.(message.payload);
        }

        this._parsePayload(message.payload);
        this._parseEventType(message);
    }

    responseMessage(appendMessage) {
        return {
            topic: this.topic(),
            payload: this.payload,
            ...(this.identifier && { identifier: this.identifier }),
            ...(this.payloadType && { payloadType: this.payloadType }),
            ...(this.event && { event: this.event }),
            ...(this.eventType && { eventType: this.eventType }),
            ...appendMessage,
        };
    }

    topic() {
        return `${this.concept}/${this.identifier}`;
    }

    // --- Private methods

    _conceptUrl() {
        return `${Resource.ROOT_URL}/${this.concept}`;
    }

    _identifierUrl() {
        return `${this._conceptUrl()}/${this.identifier}`;
    }

    _parseEventType(openhab) {
        this.eventType = openhab.type;
    }

    // default, in case we get unknown concepts
    _parsePayload(payload) {
        this.payload = payload;
    }
}

class Item extends Resource {
    constructor(identifier, event) {
        super(CONCEPT.ITEMS, identifier, event);
    }

    endPoint(action) {
        switch (action) {
            case ACTION.COMMAND:
                return { url: this._identifierUrl(), verb: HTTP_METHOD.POST };
            case ACTION.UPDATE:
                return { url: `${this._identifierUrl()}/state`, verb: HTTP_METHOD.PUT };
        }
        return super.endPoint(action);
    }

    _parseIdentifier(payload) {
        this.identifier = payload.name;
    }

    _parsePayload(payload) {
        // if there is a state, this is a request and state is the value.
        this.payload = payload.state ? payload.state : payload.value;
        this.payloadType = payload.type;
    }
}

class Thing extends Resource {
    constructor(identifier, event) {
        super(CONCEPT.THINGS, identifier, event);
    }

    _parseIdentifier(payload) {
        this.identifier = payload.UID;
    }

    _parsePayload(payload) {
        // if there is a statusInfo, this is a request and we take payload from there.
        // if not, it's an event and we need to take the payload instead.
        this.payload = payload.statusInfo ? payload.statusInfo.status : payload.status;
        this.payloadType = 'String';
    }
}

class System extends Resource {
    constructor() {
        super(CONCEPT.SYSTEM);
    }

    endPoint(action) {
        if (action === ACTION.GET) return { url: Resource.ROOT_URL, verb: HTTP_METHOD.GET };
        return undefined;
    }

    topic() {
        return this.concept;
    }

    _parsePayload(payload) {
        this.payload = payload.runtimeInfo?.version ?? '2.x';
        this.payloadType = 'String';
    }
}

function createResource(concept, identifier, event) {
    if (!concept) return undefined;
    switch (concept.trim().toLowerCase()) {
        case CONCEPT.ITEMS:
            return new Item(identifier, event);
        case CONCEPT.THINGS:
            return new Thing(identifier, event);
        case CONCEPT.SYSTEM:
            return new System();
        // fallback, could e.g. happen for inbox and link
        default:
            return new Resource(concept, identifier, event);
    }
}

function createResourceFromTopic(topic) {
    if (!topic) return undefined;
    const parts = topic.trim().split('/');
    // if 0 or 1 slashes, we have a short form (concept/identifier), and no event
    if (parts.length == 1) return createResource(CONCEPT.ITEMS, topic);
    if (parts.length == 2) return createResource(parts[0], parts[1]);

    // now we know we should have an event topic (openhab/concept/identifier/event).
    const root = parts[0];

    // Ignore messages we don't recognize (not starting with openhab or smarthome)
    if (!Resource.ROOT_TOPIC.includes(root)) return undefined;

    const concept = parts[1];

    // event is the last
    const event = parts.at(-1);

    // identifier is everything in between. usually at 2, but for groups it can be 2 and 3 (groupid/memberid)
    const identifier = parts.slice(2, -1).join('/');

    return createResource(concept, identifier, event);
}

function createResourceFromMessage(message) {
    const resource = createResourceFromTopic(message.topic);
    if (resource === undefined) return undefined;
    resource.parseMessage(message);
    return resource;
}

module.exports = { Resource, Item, Thing, System, createResource, createResourceFromTopic, createResourceFromMessage };
