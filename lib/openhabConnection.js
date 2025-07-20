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

const { ENDPOINTS, CONTROL_TOPICS, RETRY_CONFIG, HTTP_METHODS } = require("./constants");
const { httpRequest, getConnectionString, isPhantomError, responseStatus } = require("./connectionUtils");

/** OpenhabConnection class for managing OpenHAB connections and event handling */
class OpenhabConnection {
    constructor(config, EventSourceImpl = require("@joeybaker/eventsource"), setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout) {
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
    async getItems() {
        const url = getConnectionString(this.config) + ENDPOINTS.ITEMS;
        const result = await httpRequest(url, this.config);
        return result.data;
    }

    /** Test if the OpenHAB system is live. */
    /*async testIfLive() {
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
    }*/

    /** Control an OpenHAB item by sending a command, or getting/updating its state.
     * httpRequest will throw an error if the request fails, which is passed on to the caller.  */
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


    /** Start the EventSource connection to OpenHAB. */
    startEventSource(options = {}) {
        const { onOpen = () => { }, onMessage = () => { }, onError = () => { }, topics } = options;

        // Close any existing EventSource before starting a new one
        this.close(onError);

        // For SSE, we have to include credentials in the URL. This is a limitation of the EventSource API.
        let url = getConnectionString(this.config, { includeCredentials: true }) + ENDPOINTS.EVENTS;

        if (topics) {
            url += `?topics=${topics}`;
        }

        // Disable automatic retries by setting retry to 0
        const eventSourceOptions = { retry: 0 };

        // If allowSelfSigned is enabled, set rejectUnauthorized to false
        if (this.config.allowSelfSigned) {
            eventSourceOptions.https = { rejectUnauthorized: false };
        }

        this.eventSource = new this.EventSourceImpl(url, eventSourceOptions);

        this.eventSource.onopen = () => {
            // Reset retry attempts on successful connection
            this.retryAttempts = 0;
            this.currentRetryDelay = RETRY_CONFIG.EVENTSOURCE_INITIAL_DELAY;
            onOpen();
        };

        // Handle errors from the EventSource, ignoring phantom errors like heartbeat misses.
        this.eventSource.onerror = (error) => {
            // Ignore phantom errors (heartbeat misses) like {"type":{}}
            if (isPhantomError(error)) {
                return;
            }
            // the event source usually returns an error object with a type property, but it can also be a string
            let response = {};
            if (error.type) {
                response.type = error.type;
                response.status = error.type.errno;
                response.message = error.type.code;
            } else {
                response.status = 500; // default to Internal Server Error
                if (typeof error === "string") {
                    response.message = error; // use the string as the message
                }
            }

            // we can't use the event source anymore, so close it and make sure we don't use it again
            this.eventSource.close();
            this.eventSource = null;

            const result = responseStatus(response, response.message, !!this.config.username);


            if (this.retryTimer) {
                onError(result.status, result.message, "");
                return;
            }

            this.retryAttempts++;
            let shortMessage = `Retry #${this.retryAttempts} in ${this.currentRetryDelay / 1000} s`
            onError(result.status, `${result.message} (${shortMessage})`, shortMessage);
            this.retryTimer = this.setTimeout(() => {
                this.retryTimer = null;
                this.startEventSource(options); // Preserve options on retry
            }, this.currentRetryDelay);

            // Exponential backoff for retry delay
            this.currentRetryDelay = Math.min(
                this.currentRetryDelay * RETRY_CONFIG.EVENTSOURCE_BACKOFF_FACTOR,
                RETRY_CONFIG.EVENTSOURCE_MAX_RETRY_DELAY
            );
        };

        /** Handle incoming messages from the EventSource */
        this.eventSource.onmessage = (event) => {
            onMessage(event);
        };
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
                onError("CLOSE_ERROR", `Error closing EventSource: ${e.message}`, "");
            }
            this.eventSource = null;
        }
    }
}

module.exports = { OpenhabConnection };