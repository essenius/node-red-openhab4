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

const { CONCEPTS, CONTEXT, EVENT_TAGS, SWITCH_STATUS, STATE, STATE_MAPPING } = require('./constants');

/** Base class for openHAB consumer nodes (nodes that consume a controller).
  * Handles common patterns like setting up basic event handlers, status management, and lifecycle. */
class ConsumerNodeHandler {
    constructor(node, config, controller, utils = {}) {
        this.node = node;
        node.handler = this;
        this.config = config;
        this.controller = controller;
        this.eventBus = controller?.handler?.eventBus;
        this.utils = utils;
    }

    /** Cleans up the node. This is called when the node is closed. Subclasses can override this method to perform custom cleanup. */
    cleanup() { /* Placeholder */ }

    /** Clear the status field of the node */
    clearStatus() {
        this.node.status({});
    }

    /** Creates a standardized message object with the specified properties
     * Requires payload and topic if message was not defined in the properties
     */
    createMessage({ message, ...properties }) {
        const { generateId } = this.utils;
        const messageId = generateId ? generateId() : undefined;

        if (message) {
            message._msgid = messageId;
            // Copy any extra properties passed in props onto the message
            Object.assign(message, properties);
        } else {
            if (!properties.payload || !properties.topic) {
                throw new Error("createMessage requires either a message property, or payload and topic properties");
            }
            message = { _msgid: messageId, ...properties };
        }

        return message;
    }

    /** Returns the type of the node, used for names, logging and debugging
     * We use the type that was set in the node registration without the prefix, with the first letter capitalized
      * @returns {string} The type of the node.  */
    getNodeType() {
        const prefix = "openhab4-"
        const type = this.node?.type;
        if (!type) return undefined;
        if (type.startsWith(prefix)) {
            return type.charAt(prefix.length).toUpperCase() + type.slice(prefix.length + 1);
        }
        return type; // fallback if prefix missing
    }

    /** Default input handler. Subclasses can override this method if they want to handle input messages. */
    async handleInput(_msg) { /* Placeholder */ }

    /** Switch off handler for a tag */
    handlerOff(eventTag, handler) {
        if (this.eventBus) {
            this.eventBus.unsubscribe(eventTag, handler);
        }
    }

    /** Switch on handler for a tag */
    handlerOn(eventTag, handler) {
        if (this.eventBus) {
            this.eventBus.subscribe(eventTag, handler);
        }
    }

    /** Refreshes the node status based on the current state. */
    setValueStatus(state) {
        if (state == null || state === CONTEXT.UNKNOWN) { // == null catches both undefined and null
            this.setStatus(STATE.WARNING, CONTEXT.UNKNOWN);
            return;
        }

        // First check the falsy state before converting to string, so we do that in the original type
        let isFalsy = !state;
        state = String(state).trim();
        // re-check falsy state after conversion to string, as we may have had a non-trimmed string before
        // also check if the value is "OFF", "OFFLINE" or starts with "OFF " (all case insensitive), which are also considered falsy
        isFalsy = isFalsy || !state || /^OFF($| |LINE$)/i.test(state);
        this.setStatus(isFalsy ? STATE.OK_FALSY : STATE.OK, state);
    }

    /** Set the status field in the node using semantic status mapping */
    setStatus(state, text = "") {
        let mapping = STATE_MAPPING[state];
        if (!mapping) {
            mapping = STATE_MAPPING[STATE.WARNING];
            text = text ? `${state}: ${text}` : state;
        }

        // Add a timestamp. Allow for custom formatting or mocking via utils.generateTime()
        const { generateTime } = this.utils;
        let timeText = (generateTime) ? generateTime() : new Date().toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        text += ` @ ${timeText}`;
        this.node.status({
            fill: mapping.fill,
            shape: mapping.shape,
            text: this._truncateMessage(String(text))
        });
    }

    prioritizedProperty(messageProperty, configProperty) {
        if (this.config.priority === "message") {
            return messageProperty ?? configProperty;
        }
        return configProperty ?? messageProperty;
    }

    // get the resource to use based on the config and the message. The resource consists of a concept and an identifier. 
    // The priority determines whether the message or the config takes precedence. 
    getResource(message) {
        const messageResource = this.parseTopic(message.topic);
        const concept = this.config.concept  ?? CONCEPTS.ITEMS; // default to items if concept is not specified in config (happens with out node)
        const conceptDef = CONCEPTS.get(concept);
        // we define the config filled if an identifier was specified or the concept doesn't need one (i.e. has no idFromRequest method)
        const isFilled = this.config.identifier || !conceptDef.idFromRequest;
        const configResource = isFilled ? { concept, identifier: this.config.identifier } : null;
        return this.prioritizedProperty(messageResource, configResource);
    }

    parseTopic(topic) {
        if (!topic) return null;
        topic = String(topic).trim();
        if (!topic) return null;
        if (!topic.includes("/")) return { concept: CONCEPTS.ITEMS, identifier: topic }; 
        let [concept, ...rest] = topic.split("/");
        concept = concept.trim().toLowerCase();
        const identifier = rest.join("/");
        if (!concept && !identifier) return null;
        return { concept, identifier };
    }

    enableInputHandling() {
        this.node.on("input", (msg) => {
            Promise.resolve(this.handleInput(msg));
        });
    }

    /** Setup the node. This needs to be called separately. Since it's a base class, we can't call it in the constructor
      * as subclasses may not be ready yet. */
    setupNode() {
        this._setupNodeName();
        this.setStatus(STATE.INIT, "initializing...");
        this.handlerOn(EVENT_TAGS.CONNECTION_STATUS, this._onConnectionStatus);
        this.node.on("close", () => {
            this.handlerOff(EVENT_TAGS.CONNECTION_STATUS, this._onConnectionStatus);
            this.cleanup();
        });

        if (this.controller) {
            this.clearStatus();
        } else {
            this.setStatus(STATE.ERROR, "no controller");
            // no use sending events, as no controller means no event bus
            // we also don't log this, as users will see it in the status right away when setting things up.
        }

        // the handler messages will be no-ops if there is no controller, but node logic can do more
        this.setupNodeLogic();

        return this;
    }

    /** Setup hook for subclasses. Intended for setup logic in the child, but does not have to be overridden */
    setupNodeLogic() { /* Placeholder */ }

    // --- Private methods ---

    /** Sets up the node name for display in the Node-RED debug window. */
    _setupNodeName() {
        if (!this.node.name) {
            this.node.name = this.config.name || this.node.type;
        }
    }

    /** Truncate a message to a maximum length, adding "..." if it exceeds the limit. */
    _truncateMessage(message, maxLength = 40) {
        const result = (message.length > maxLength) ? message.substring(0, maxLength - 3) + "..." : message;
        return result;
    }

    // --- Event handlers ---

    _onError = (err) => {
        this.setStatus(STATE.ERROR, err);
    };

    _onConnectionStatus = (state) => {
        if (state === SWITCH_STATUS.ON) {
            this.setStatus(STATE.READY, "ready");
        } else {
            this.setStatus(STATE.WAITING, "disconnected");
        }
        this._afterConnectionStatus?.(state);

    };
}

module.exports = { ConsumerNodeHandler };
