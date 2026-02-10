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

const { ENDPOINTS, CONTROL_TOPICS, RETRY_CONFIG, HTTP_METHODS } = require("./constants");
const { addAuthHeader, httpRequest, getEventSource, isPhantomError, responseStatus, retryable } = require("./connectionUtils");

/** OpenhabConnection class for managing OpenHAB connections and event handling */
class OpenhabConnection {
    constructor(config, EventSourceImpl = getEventSource(), setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout) {
        // config should already be validated by the node, so we can assume it's correct here
        this.config = config;
        this.EventSourceImpl = EventSourceImpl;
        this.setTimeout = setTimeoutImpl;
        this.clearTimeout = clearTimeoutImpl;
        this.eventSource = null;
        this.retryTimer = null;
        this.status = "INIT";
        this.retryAttempts = 0;
        this.currentRetryDelay = RETRY_CONFIG.EVENTSOURCE_INITIAL_DELAY;
    }

    /** Get all items from OpenHAB via a single http request */
    async getItems(errorHandler) {
        const url = this.config.url + ENDPOINTS.ITEMS;
        return await retryable(() => httpRequest(url, this.config), { errorFunction: errorHandler, retryTimeout: this.config.retryTimeout });
    }

    /** Control an OpenHAB item by sending a command, or getting/updating its state.
     * If an error occurs, the error handler is called, and if possible a retry is attempted.  */
    async controlItem(name, topic, payload, errorHandler) {
        const topicConfig = {
            [CONTROL_TOPICS.ITEM_UPDATE]: { endpoint: ENDPOINTS.ITEM_STATE(name), method: HTTP_METHODS.PUT },
            [CONTROL_TOPICS.ITEM_COMMAND]: { endpoint: ENDPOINTS.ITEM_COMMAND(name), method: HTTP_METHODS.POST }
        };
        const isPingTest = name == "";
        const config = topicConfig[topic] || {
            endpoint: isPingTest ? ENDPOINTS.TEST_URL : ENDPOINTS.ITEM_COMMAND(name),
            method: HTTP_METHODS.GET
        };

        const url = this.config.url + config.endpoint;
        const result = await retryable(() => httpRequest(url, this.config, {
            method: config.method,
            body: config.method === HTTP_METHODS.GET ? undefined : String(payload)
        }), { errorFunction: errorHandler, retryTimeout: this.config.retryTimeout });

        // if this is a ping test, return server metadata.
        if (isPingTest && result.ok) result.data = this.extractMetadata(result.data);
        return result;
    }

    extractMetadata(data) {
        const result = data;
        delete result.links;
        if (!result.runtimeInfo) {
            // OpenHAB 2 doesn't have a runtimeInfo property in the /rest endpoint
            result.runtimeInfo = { "version": "2.x" };
        }

        return result;
    }

    buildEventSourceUrl(topics) {
        let url = this.config.url + ENDPOINTS.EVENTS;
        if (topics) url += `?topics=${topics}`;
        return url;
    }

    buildEventSourceOptions() {
        const opts = {
            fetch: (input, init) => {
                const headers = { ...init.headers };
                addAuthHeader(headers, this.config);
                return fetch(input, { ...init, headers });
            }
        };

        if (this.config.isHttps && this.config.allowSelfSigned) {
            opts.https = { rejectUnauthorized: false };
        }

        return opts;
    }

    attachEventSourceHandlers(es, { onOpen, onMessage, onError, options }) {
        es.onopen = () => {
            this.resetRetryState();
            onOpen();
        };

        es.onmessage = (event) => onMessage(event);
        es.onerror = (error) => this.handleEventSourceError(error, options, onError);
    }

    resetRetryState() {
        this.retryAttempts = 0;
        this.elapsedTime = 0;
        this.currentRetryDelay = RETRY_CONFIG.EVENTSOURCE_INITIAL_DELAY;
    }

    handleEventSourceError(error, options, onError) {
        // Ignore phantom errors (like heartbeat misses)
        if (isPhantomError(error)) return;

        let response = { 
            message: error?.message ?? "Unknown SSE error",
            type: error?.type ?? "error",
            status: error?.status ?? 500 
        };

        // Close the EventSource safely
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }

        const result = responseStatus(response, response.message, !!this.config.username);

        // Retry logic with exponential backoff. TODO: migrate to retryable
        this.retryAttempts++;
        const shortMessage = `Retry #${this.retryAttempts} in ${this.currentRetryDelay / 1000} s`;
        onError(`${result.message} (${shortMessage})`, shortMessage);

        this.retryTimer = this.setTimeout(() => {
            this.retryTimer = null;
            this.startEventSource(options); // retry using the same options
        }, this.currentRetryDelay);

        this.currentRetryDelay = Math.min(
            this.currentRetryDelay * RETRY_CONFIG.EVENTSOURCE_BACKOFF_FACTOR,
            RETRY_CONFIG.EVENTSOURCE_MAX_RETRY_DELAY
        );
    }

    /** Start the EventSource connection to OpenHAB. */
    startEventSource(options = {}) {
        const { onOpen, onMessage, onError, topics } = {
            onOpen: () => {},
            onMessage: () => {},
            onError: () => {},
            ...options
        };

        // Close any existing EventSource before starting a new one
        this.close(onError);

        const url = this.buildEventSourceUrl(topics);
        const esOpts  = this.buildEventSourceOptions();
        this.eventSource = new this.EventSourceImpl(url, esOpts);

        this.attachEventSourceHandlers(this.eventSource, {
            onOpen, onMessage, onError, options
        });
    }

    /** Close the EventSource connection and clean up resources */
    close(onError = () => { }) {
        // Clear timer first so we don't try to retry after closing
        if (this.retryTimer) {
            this.clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }

        // Close EventSource
        if (this.eventSource) {
            try {
                this.eventSource.close();
            } catch (e) {
                // not a big deal usually, but we should report it. We won't show it in the node status, though.
                onError(`Error closing EventSource: ${e.message}`, "");
            }
            this.eventSource = null;
        }
    }
}

module.exports = { OpenhabConnection };