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

const { CONCEPTS, ERROR_TYPES, HTTP_METHODS, RETRY_CONFIG, STATE } = require('./constants');
const { createEventSourceOptions, getEventSource, httpRequest } = require('./connectionUtils');

const OPENHAB = 'OpenHAB';

/** OpenhabConnection class for managing OpenHAB connections and event handling */
class OpenhabConnection {
    constructor(config, options = {}) {
        this.options = {
            eventSourceImpl: getEventSource(),
            setTimeoutImpl: setTimeout,
            clearTimeoutImpl: clearTimeout,
            httpRequest: httpRequest,
            now: Date.now,
            onMessage: async () => {},
            onStateChange: async () => {},
            ...options,
        };

        // config was already be validated by the node, so we can assume it's correct here
        this.config = config;
        this.eventSource = null;
        this.retryTimer = null;
        this.retryAttempts = 0;
        this.currentRetryDelay = RETRY_CONFIG.EVENTSOURCE_INITIAL_DELAY;
        this.state = STATE.DOWN;
        this.eventSourceEndPoint = CONCEPTS.get(CONCEPTS.EVENTS).streamUrl(config.eventFilter);
        this.healthProbeEndPoint = CONCEPTS.get(CONCEPTS.SYSTEM).getUrl();

        this.cache = {
            items: { data: null, timestamp: 0 },
            things: { data: null, timestamp: 0 },
        };
        this.CACHE_TTL = 30000; // ms, adjust as needed
    }

    async close() {
        await this._enterDown();
    }

    /** Get all the resources of a certain type, using caching */
    async getResources(type, endpoint) {
        const now = this.options.now();
        const cacheEntry = this.cache[type];
        if (!cacheEntry) {
            return { ok: false, status: 404, message: `Resource type: '${type}' not found` };
        }

        if (cacheEntry.data && now - cacheEntry.timestamp < this.CACHE_TTL) {
            return { ok: true, data: cacheEntry.data }; // return cached
        }

        const url = this.config.url + endpoint;
        console.log('Requesting', url);
        const result = await this.options.httpRequest(url, this.config);
        if (!result.ok) {
            // return the cached data if the call failed, but keep ok on false
            if (cacheEntry.data) {
                console.log('Returning cached value');
                return { ...result, data: cacheEntry.data };
            }
            // return the failure, making sure there is a status code
            return { ...result, status: result.status ?? 503 };
        }
        console.log('Refreshing cache');
        cacheEntry.data = result.data;
        cacheEntry.timestamp = now;
        return result;
    }

    async sendRequest(endPoint, method = HTTP_METHODS.GET, payload = null) {
        if (this.state !== STATE.UP)
            return { ok: false, type: ERROR_TYPES.SYSTEM, retry: true, message: `${OPENHAB} offline` };
        const url = this.config.url + endPoint;
        const result = await this.options.httpRequest(url, this.config, {
            method,
            body: payload ?? undefined,
        });

        return this._handleResponse(result);
    }

    startEventSource() {
        this._closeEventSource();
        const esOptions = createEventSourceOptions(this.config);
        const url = this.config.url + this.eventSourceEndPoint;
        this.eventSource = new this.options.eventSourceImpl(url, esOptions);
        this.eventSource.onopen = async () => this._enterUp();
        this.eventSource.onmessage = async (event) => this.options.onMessage(event);
        this.eventSource.onerror = async (error) => this._handleEventSourceError(error);
    }

    // ---- private methods ----

    _clearRetryTimer() {
        if (this.retryTimer) {
            this.options.clearTimeoutImpl(this.retryTimer);
            this.retryTimer = null;
        }
    }

    _closeEventSource() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
    }

    async _enterConnecting() {
        if (this.state === STATE.CONNECTING) return;
        await this._setState(STATE.CONNECTING);
        this._closeEventSource();
        this._clearRetryTimer();
        this._scheduleReconnect();
    }

    async _enterDown() {
        if (this.state === STATE.DOWN) return;
        await this._setState(STATE.DOWN);
        this._clearRetryTimer();
        this._closeEventSource();
    }

    async _enterUp() {
        this.retryAttempts = 0;
        this.currentRetryDelay = RETRY_CONFIG.EVENTSOURCE_INITIAL_DELAY;
        this._clearRetryTimer();
        await this._setState(STATE.UP);
    }

    async _handleEventSourceError(error) {
        console.log('EventSource error:', error);
        if (this._isPhantomError(error)) return;
        await this._enterConnecting();
    }

    // check if the request result implies that the system is offline, and handle if so
    async _handleResponse(result) {
        const HEALTH_CHECK_STATUSES = new Set([404, 500]);

        if (!result.ok) {
            if (!result.retry && HEALTH_CHECK_STATUSES.has(result.status)) {
                const healthy = await this._probeHealth();
                if (healthy) {
                    result.type = ERROR_TYPES.DOMAIN;
                } else {
                    result.type = ERROR_TYPES.SYSTEM;
                    result.retry = true;
                }
            }
            if (result.retry) {
                await this._enterConnecting();
                result.message = `${OPENHAB} offline` + (result.message ? `(${result.message})` : '');
            }
        }

        return result;
    }

    /** Check if the error is a phantom error, which can be ignored. */
    _isPhantomError(err) {
        if (err == null || typeof err !== 'object') return false;
        if (!err.type || typeof err.type !== 'object') return false;
        return Object.keys(err.type).length === 0;
    }

    async _setState(state) {
        this.state = state;
        await this.options.onStateChange(state);
    }

    // this is always reachable without authentication
    async _probeHealth() {
        const probeUrl = this.config.url + this.healthProbeEndPoint;
        const result = await this.options.httpRequest(probeUrl, this.config, { method: HTTP_METHODS.GET });
        return result.ok === true;
    }

    _scheduleReconnect() {
        if (this.retryTimer) return; // already scheduled

        this.retryTimer = this.options.setTimeoutImpl(async () => {
            this.retryTimer = null;
            this.retryAttempts++;

            const healthy = await this._probeHealth();

            // in case close() was called in between
            if (this.state !== STATE.CONNECTING) return;

            if (healthy) {
                this.startEventSource();
                return;
            }

            this.currentRetryDelay = Math.min(
                this.currentRetryDelay * RETRY_CONFIG.EVENTSOURCE_BACKOFF_FACTOR,
                RETRY_CONFIG.EVENTSOURCE_MAX_RETRY_DELAY
            );

            this._scheduleReconnect();
        }, this.currentRetryDelay);
    }
}

function createOpenhabConnection(config, options) {
    return new OpenhabConnection(config, options);
}

module.exports = { OpenhabConnection, createOpenhabConnection };
