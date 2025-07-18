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

const { ENDPOINTS, CONTROL_TOPICS, RETRY_CONFIG, HTTP_METHODS, EVENT_TYPES } = require("./constants");
const { errorDetails, httpRequest, getConnectionString, isPhantomError } = require("./connectionUtils")
const EventSource = require("@joeybaker/eventsource");

/** OpenhabConnection class for managing OpenHAB connections and event handling */
class OpenhabConnection {
    constructor(config, node) {
        // config should already be validated by the node, so we can assume it's correct here
        this.config = config;
        this.node = node;
        this.eventSource = null;
        this.retryTimer = null;
        this.status = "INIT";
        this.retryAttempts = 0;
    }

    /** Get all items from OpenHAB via a single http request */
    async getItems() {
        const url = getConnectionString(this.config) + ENDPOINTS.ITEMS;

        const result = await httpRequest(url, this.config);
        //if (result.error) throw result.error; // let the controller deal with the error
        return result.data;
    }

    /** Test if the OpenHAB system is live. 
     */
    async testIfLive() {
        // take a known good URL returning a result, preferably not requiring authentication
        const url = getConnectionString(this.config) + ENDPOINTS.TEST_URL;
        try {
            const result = await httpRequest(url, this.config);
            // If the request was successful and returned data, the system is live
            return !!result.data;
        }
        catch (error) {
            // if we get an authentication challenge, we consider the system live
            return error.authRequired || error.authFailed;
        }
    }

    /** Control an OpenHAB item by sending a command, or getting/updating its state.
     * httpRequest will throw an error if the request fails, which is passed on to the caller.
     */
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

        // we now use the content type to determine how to handle the response,
        // so we don't need to predict it here.

        const result = await httpRequest(url, this.config, {
            method: config.method,
            body: config.method === HTTP_METHODS.GET ? undefined : String(payload)
        });

        return result.data;
    }

    /** Start the EventSource connection to OpenHAB. TODO: pretty complex, see if we can simplify */
    startEventSource(options = {}) {
        if (this.retryTimer) clearTimeout(this.retryTimer);
        if (this.eventSource) this.close();

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
        this.eventSource = new EventSource(url, eventSourceOptions);

        this.eventSource.onopen = () => {
            this.retryAttempts = 0; // Reset retry attempts on successful connection
         
            // Call custom onopen callback if provided
            if (options.onOpen) {
                options.onOpen();
            }
        };


        // Handle errors from the EventSource. If it's not a phantom, emit them, and if it's a retryable error, set a retry timer.
        this.eventSource.onerror = (err) => {
            // Ignore phantom errors (heartbeat misses) like {"type":{}}
            if (isPhantomError(err)) {
                return;
            }

            this.eventSource.close();
            this.eventSource = null;

            const result = errorDetails(err.status, null, !!this.config.username);
            if (result.retry) {
                if (this.retryAttempts >= RETRY_CONFIG.MAX_RETRY_ATTEMPTS) {
                    this.node.error(`Maximum retry attempts (${RETRY_CONFIG.MAX_RETRY_ATTEMPTS}) reached. Stopping retries.`);
                    this.node.emit(EVENT_TYPES.CONNECTION_ERROR, "max retries reached");
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
                return;
            }

            // if there is additional error handling, call that
            if (options.onError) {
                options.onError(err.status, result.message);
            }            
        };

        /** Handle incoming messages from the EventSource. Call custom message handler if provided, otherwise emit RAW_EVENT */

        this.eventSource.onmessage = (event) => {
            if (options.onMessage) {
                options.onMessage(event);
            } else {
                this.node.emit(EVENT_TYPES.RAW_EVENT, event);
            }
        };
    }

    /** Close the EventSource connection and clean up resources */
    close() {
        this.node.log('🔥 OpenhabConnection.close() called');
        
        // Clear all timers first
        if (this.retryTimer) {
            this.node.log('🔥 Clearing retry timer');
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }

        // Close EventSource
        if (this.eventSource) {
            try {
                this.node.log('🔥 Closing EventSource');
                this.eventSource.close();
                this.node.log("EventSource closed");
            } catch (e) {
                this.node.error("Error closing EventSource: " + e.message);
            }
            this.eventSource = null;
        }

        // Reset status
        this.node.status({});
        this.retryAttempts = 0;
        this.node.log('✅ OpenhabConnection cleanup complete');
    }
}

module.exports = { OpenhabConnection };