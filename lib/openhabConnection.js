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

const { ENDPOINTS, EVENT_TOPICS, EVENT_TYPE_GROUPS, CONTROL_TOPICS, RETRY_CONFIG, HTTP_METHODS, EVENT_TYPES, SWITCH_STATUS } = require("./openhabConstants");
const { addStatusMethods } = require('./statusUtils');
const { fetchOpenHAB, getConnectionString, isPhantomError } = require("./connectionUtils")
const EventSource = require("@joeybaker/eventsource");

class OpenhabConnection {
    constructor(config, node) {
        this.config = config;
        this.node = node;
        this.es = null;
        this.retryTimer = null;
        this.status = "INIT";
        this.retryAttempts = 0;
        
        if (!node.setStatus) {
            addStatusMethods(node);
        }
    }

    _handleFetchResult(result, url, operation = "operation") {
        if (result.retry) {
            this.node.emit(EVENT_TYPES.COMMUNICATION_ERROR, {
                status: result.status,
                message: `OpenHAB responded with ${result.status} for ${url}`
            });
            throw new Error(`Retry not supported for ${url} in ${operation}`);
        }

        if (result.error) {
            this.node.emit(EVENT_TYPES.COMMUNICATION_ERROR, result.error);
            throw result.error;
        }

        // Don't emit COMMUNICATION_STATUS here - let EventSource handle connection status
        return result.data;
    }

    async getItems() {
        const url = getConnectionString(this.config) + ENDPOINTS.ITEMS;

        const result = await fetchOpenHAB(url, this.config);
        return this._handleFetchResult(result, url, "getItems");
    }

    async controlItem(name, topic, payload) {
        const topicConfig = {
            [CONTROL_TOPICS.ITEM_UPDATE]: { endpoint: ENDPOINTS.ITEM_STATE(name), method: HTTP_METHODS.PUT },
            [CONTROL_TOPICS.ITEM_COMMAND]: { endpoint: ENDPOINTS.ITEM_COMMAND(name), method: HTTP_METHODS.POST },
        };

        const config = topicConfig[topic] || {
            endpoint: ENDPOINTS.ITEM_COMMAND(name),
            method: HTTP_METHODS.GET
        };

        const url = getConnectionString(this.config) + config.endpoint;
        const headers = { "Content-Type": "text/plain" };

        // For GET requests (item queries), we need "text" response to match old behavior
        // For PUT/POST requests (commands/updates), we use default "json" response
        const responseType = config.method === HTTP_METHODS.GET ? "text" : "json";

        const result = await fetchOpenHAB(url, this.config, {
            method: config.method,
            headers,
            body: config.method === HTTP_METHODS.GET ? undefined : String(payload)
        }, responseType);

        return this._handleFetchResult(result, url, "controlItem") ?? "";
    }


    startEventSource(options = {}) {
        if (this.retryTimer) clearTimeout(this.retryTimer);
        if (this.es) this.close();

        // Build URL with optional topics filter
        /*if (this.config.username) {
            // Embed credentials in the URL for EventSource (SSE)
            const user = encodeURIComponent(this.config.username);
            const pass = this.config.password ? ':' + encodeURIComponent(this.config.password) : ':';
            url = `${this.config.protocol || "http"}://${user}${pass}@${this.config.host}:${this.config.port}${ENDPOINTS.EVENTS}`;
        } else { */

        // For SSE, we have to include credentials in the URL. This is a limitation of the EventSource API.
        let url = getConnectionString(this.config, { includeCredentials: true }) + ENDPOINTS.EVENTS;

        if (options.topics) {
            url += `?topics=${options.topics}`;
        }

        // Disable automatic retries by setting retry to 0
        const eventSourceOptions = { retry: 0 };

        // If allowSelfSigned is enabled, set rejectUnauthorized to false
        if (this.config.allowSelfSigned) {
            eventSourceOptions.https = { rejectUnauthorized: false };
        }
        this.es = new EventSource(url, eventSourceOptions);

        this.es.onopen = () => {
            this.node.setStatusConnected();
            this.node.emit(EVENT_TYPES.COMMUNICATION_STATUS, SWITCH_STATUS.ON);
            this.retryAttempts = 0; // Reset retry attempts on successful connection
            
            // Call custom onopen callback if provided
            if (options.onOpen) {
                options.onOpen();
            }
        };

        this.es.onerror = (err) => {
            // Ignore phantom errors (heartbeat misses) like {"type":{}}
            if (isPhantomError(err)) {
                return;
            }

            this.node.warn(`[openhab4] SSE error: ${JSON.stringify(err)}`);
            this.node.emit(EVENT_TYPES.COMMUNICATION_ERROR, err);
            this.node.setStatusDisconnected();

            const errStr = JSON.stringify(err);
            
            // Handle connection errors (ECONNREFUSED, ENOTFOUND, etc.) - stop retrying
            if (errStr.includes("ENOTFOUND") || errStr.includes("ECONNREFUSED") || errStr.includes("ETIMEDOUT")) {
                this.es.close();
                this.es = null;
                this.node.error("Connection error - stopping retries: " + errStr);
                this.node.setStatusError("connection failed");
                return; // Don't retry connection errors
            }

            if (err && (err.status === 503 || err.status === 404)) {
                this.es.close();
                this.es = null;
                
                // Check retry limits
                if (this.retryAttempts >= RETRY_CONFIG.MAX_RETRY_ATTEMPTS) {
                    this.node.error(`Maximum retry attempts (${RETRY_CONFIG.MAX_RETRY_ATTEMPTS}) reached. Stopping retries.`);
                    this.node.setStatusError("max retries reached");
                    return;
                }
                
                if (!this.retryTimer) {
                    this.retryAttempts++;
                    this.node.warn(`Retry attempt ${this.retryAttempts}/${RETRY_CONFIG.MAX_RETRY_ATTEMPTS} in ${RETRY_CONFIG.EVENTSOURCE_RETRY_DELAY}ms`);
                    this.retryTimer = setTimeout(() => {
                        this.retryTimer = null;
                        this.startEventSource(options); // Preserve options on retry
                    }, RETRY_CONFIG.EVENTSOURCE_RETRY_DELAY);
                }
            }
        };

        this.es.onmessage = (event) => {
            // Call custom message handler if provided, otherwise emit RAW_EVENT
            if (options.onMessage) {
                options.onMessage(event);
            } else {
                this.node.emit(EVENT_TYPES.RAW_EVENT, event);
            }
        };
    }

    close() {
        this.node.log('🔥 OpenhabConnection.close() called');
        
        // Clear all timers first
        if (this.retryTimer) {
            this.node.log('🔥 Clearing retry timer');
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }

        // Close EventSource
        if (this.es) {
            try {
                this.node.log('🔥 Closing EventSource');
                this.es.close();
                this.node.log("EventSource closed");
            } catch (e) {
                this.node.error("Error closing EventSource: " + e.message);
            }
            this.es = null;
        }

        // Reset status
        this.node.status({});
        this.retryAttempts = 0;
        this.node.log('✅ OpenhabConnection cleanup complete');
    }

    resetRetryAttempts() {
        this.retryAttempts = 0;
        this.node.log("Retry attempts reset");
    }
}

module.exports = { OpenhabConnection };