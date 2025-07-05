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

const { ENDPOINTS, EVENT_TOPICS, EVENT_TYPE_GROUPS, CONTROL_TOPICS, RETRY_CONFIG, HTTP_METHODS, EVENT_TYPES, SWITCH_STATUS } = require("./openhabConstants");
const { addStatusMethods } = require('./statusUtils');

const { fetchOpenHAB, isPhantomError } = require("./connectionUtils")
const EventSource = require("@joeybaker/eventsource");

class OpenhabConnection {
    constructor(config, node) {
        this.config = config;
        this.node = node;
        this.es = null;
        this.retryTimer = null;
        this.status = "INIT";
        this.retryAttempts = 0;
        
        // Add semantic status methods to the node if not already added
        if (!node.setStatus) {
            addStatusMethods(node);
        }
    }

    get baseUrl() {
        return `${this.config.protocol || "http"}://${this.config.host}:${this.config.port}`;
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

        this.node.emit(EVENT_TYPES.COMMUNICATION_STATUS, SWITCH_STATUS.ON);
        return result.data;
    }

    async getItems() {
        const url = this.baseUrl + ENDPOINTS.ITEMS;;

        const result = await fetchOpenHAB(url);
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

        const url = this.baseUrl + config.endpoint;
        const headers = { "Content-Type": "text/plain" };

        // For GET requests (item queries), we need "text" response to match old behavior
        // For PUT/POST requests (commands/updates), we use default "json" response
        const responseType = config.method === HTTP_METHODS.GET ? "text" : "json";

        const result = await fetchOpenHAB(url, {
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
        let url = this.baseUrl + ENDPOINTS.EVENTS;
        if (options.topics) {
            url += `?topics=${options.topics}`;
        }
        this.node.log(`Connecting to EventSource at: ${url}`);

        // Disable automatic retries by setting retry to 0
        this.es = new EventSource(url, { 
            retry: 0 // Disable automatic retries - we'll handle retries manually
        });

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