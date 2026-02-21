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

const { ERROR_TYPES } = require('./constants');

const { safeParseJSON, trimSlashes, setWithDefault } = require('./payloadUtils');

const _NETWORK_ERRORS = new Set([
    'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH',
    'ENOTFOUND', 'ECONNABORTED', 'EPIPE', 'ERR_TLS_HANDSHAKE_TIMEOUT'
]);

const _TLS_ERRORS = new Set(['ERR_TLS_CERT_ALTNAME_INVALID', 'ERR_TLS_CERT_EXPIRED', 'ERR_SSL_WRONG_VERSION_NUMBER']);

let fetchImpl;

try {
    fetchImpl = globalThis.fetch || require('node-fetch');
} catch (err) {
    throw new Error("No fetch available. Install 'node-fetch' or upgrade Node.js. Error: " + err.message);
}


function createEventSourceOptions(config) {
    const options = {
        fetch: (input, init) => {
            const headers = { ...init.headers };
            addAuthHeader(headers, config);
            return fetch(input, { ...init, headers });
        }
    };

    if (config.isHttps && config.allowSelfSigned) {
        options.https = { rejectUnauthorized: false };
    }
    return options;
}

/** Get the event source constructor */
function getEventSource() {
    const es = require('eventsource');
    // Prefer the module's default export first to handle ESM/CJS interop correctly.
    // Some bundlers/export styles place the constructor on `default`, others on `EventSource`.
    return es.default || es.EventSource || es;
}

function addAuthHeader(headers, config) {
    if (config.authMethod === "Bearer") {
        headers["Authorization"] = `Bearer ${config.token}`;
        return true;
    }
    if (config.authMethod === "Basic") {
        const auth = Buffer.from(`${config.username}:${config.password}`).toString("base64");
        headers["Authorization"] = `Basic ${auth}`;
        return true;
    }
    return false;
}

function isObject(body) {
    return body && typeof body === "object" &&  !(body instanceof Buffer);
}

/** Perform an HTTP request using the fetch API. Returns a standardized response object with data or an error. 
 * Is flagged as complex because of the defaulting, but isn't really that complex. */
async function httpRequest(url, config, options = {}) {
    options.headers = options.headers || {};
    const useAuth = addAuthHeader(options.headers, config);

    // --- handle JSON bodies automatically ---
    if (isObject(options.body)) {
        options.body = JSON.stringify(options.body);
        options.headers["Content-Type"] ??= "application/json";
    }
    let response;
    let data;
    try {
        response = await fetchImpl(url, options);
        data = await _retrieveResponseData(response);
    } catch (error) { // this is thrown by fetchImpl in case of network errors. response and data will be undefined.
        return { ok: false, ..._classifyFetchError(error) };
    }
    return responseStatus(response, data, useAuth);
}

/** Set default values for the config data. This should be called very early on, when the config is injected first
 * (i.e. when the controller node is created). */
function setDefaults(config) {
    // Set default values for config properties, Also trims text, unless told not to 
    config.url = trimSlashes(setWithDefault(config.url.toLowerCase(), ""));
    config.allowSelfSigned = !!config.allowSelfSigned;
    config.token = setWithDefault(config.token, "")
    config.username = setWithDefault(config.username, "");
    config.password = setWithDefault(config.password, "", { noTrim: true });
    config.retryTimeout = setWithDefault(config.retryTimeout, Infinity);
    config.isHttps = config.url.startsWith("https://");
    config.authMethod = _getAuthMethod(config.token, config.username);
    return config;
}

// --- Private methods ---

function _getAuthMethod(token, userName) {
    if (token) return "Bearer";
    return userName ? "Basic" : "";
}

/** create non-default properties for an unknown error (only non-default property values) */
function _buildUnknownError(err) {
    return {
        retry: false,
        type: ERROR_TYPES.UNKNOWN,
        ...("name" in err ? { name: err.name } : {}),
        ...("message" in err ? { message: err.message } : {})
    };
}

/** classify the error from a failing fetch command (only non-default property values) */
function _classifyFetchError(err) {
    const code = err.cause?.code;
    if (!code) return _buildUnknownError(err);

    if (_NETWORK_ERRORS.has(code)) {
        return { retry: true, type: ERROR_TYPES.NETWORK, message: code };
    }

    if (_TLS_ERRORS.has(code)) {
        return { type: ERROR_TYPES.TLS, message: code };
    }

    return { type: ERROR_TYPES.UNKNOWN, message: code };
}

/** Classify an erroneous HTTP message using the returned error status (only non-default property values). */
function _classifyHttpError(status, hasCredentials) {
    switch (status) {
        case 401: return hasCredentials
            ? { authFailed: true, type: ERROR_TYPES.AUTH }
            : { authRequired: true, type: ERROR_TYPES.AUTH };
        case 403: return { type: ERROR_TYPES.AUTH };

        // 404 is tricky. the most frequent issue is a non-existing resource where a retry won't help.
        // There is an edge case where 404 can be sent when OpenHAB is restarting.
        // So we define it as not retryable here, and let the business logic deal with it.

        // Service Unavailable can be sent when OpenHAB is restarting
        case 503: return { retry: true };
        default: return {};
    }
}

/** create an error message based on the response, the response body, and the status */
function _getErrorMessage(data, status, statusText) {
    const dataMessage = data == null ? null : data.error?.message || data.message;
    return dataMessage || (typeof data === "string" ? data : null) || statusText || `HTTP Error ${status}`;
}

/** Enhance the fetch function to handle errors and return a standardized response. Takes care of setting properties 
 * ok, retry, authFailed, authRequired, and message on the error object. */
function responseStatus(response, data, hasCredentials) {
    const status = response.status || 500;

    // Codes in the 200 range imply success
    if (Math.floor(status / 100) === 2) return { ok: true, status, data };

    const message = _getErrorMessage(data, status, response.statusText);
    return { ok: false, type: ERROR_TYPES.HTTP, status, message, ..._classifyHttpError(status, hasCredentials) };
}

/** Retrieve the response data, handling empty responses and content types JSON and text. Returns null for no content. */
async function _retrieveResponseData(response) {
    if (!response) return null;
    const data = (await response.text()).trim();
    if (data === "") return null;
    return safeParseJSON(data, data);
}

module.exports = {
    createEventSourceOptions,
    fetch: fetchImpl,
    getEventSource,
    httpRequest,
    setDefaults
};
