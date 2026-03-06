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

const { Agent } = require('undici');
const { ERROR_TYPES } = require('./constants');
const { safeParseJSON, trimSlashes, setWithDefault } = require('./payloadUtils');

const _RETRYABLE = new Set([
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'EHOSTUNREACH',
    'ECONNABORTED',
    'EPIPE',
    'EAI_AGAIN',
    'ERR_TLS_HANDSHAKE_TIMEOUT',
]);

const _NETWORK_ERRORS = new Set([
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'EHOSTUNREACH',
    'ENOTFOUND',
    'ECONNABORTED',
    'EPIPE',
    'EAI_AGAIN',
]);

const _TLS_ERRORS = new Set([
    'CERT_HAS_EXPIRED',
    'ERR_TLS_HANDSHAKE_TIMEOUT',
    'ERR_TLS_CERT_ALTNAME_INVALID',
    'ERR_TLS_CERT_EXPIRED',
    'ERR_SSL_WRONG_VERSION_NUMBER',
    'SELF_SIGNED_CERT_IN_CHAIN',
    'HPE_INVALID_CONSTANT',
]);

const _HEADERS = {
    AUTHORIZATION: 'Authorization',
    CONTENT_TYPE: 'Content-Type',
};

const _AUTH = {
    BEARER: 'Bearer',
    BASIC: 'Basic',
};

let fetchImpl;

function createEventSourceDependencies(config) {
    const dispatcher = getDispatcher(config);
    const deps = {
        fetch: (input, init = {}) => {
            const headers = { ...init.headers };
            addAuthHeader(headers, config);
            // we use the EventSource package since we need to support Node 18, which doesn't use undici
            return resolveFetch()(input, { ...init, headers, dispatcher });
        },
    };

    return deps;
}

let selfSignedDispatcher;

function getDispatcher(config) {
    if (!config.allowSelfSigned) return undefined; // default dispatcher
    if (!selfSignedDispatcher) {
        selfSignedDispatcher = new Agent({ connect: { rejectUnauthorized: false } });
    }
    return selfSignedDispatcher;
}

function addAuthHeader(headers, config) {
    if (config.authMethod === _AUTH.BEARER) {
        headers[_HEADERS.AUTHORIZATION] = `${_AUTH.BEARER} ${config.token}`;
        return true;
    }
    if (config.authMethod === _AUTH.BASIC) {
        const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');
        headers[_HEADERS.AUTHORIZATION] = `${_AUTH.BASIC} ${auth}`;
        return true;
    }
    return false;
}

function classifyError(err) {
    if (!err) return { type: ERROR_TYPES.UNKNOWN };

    // transport errors (causing fetch to throw) return the error object
    if (err.type === ERROR_TYPES.TRANSPORT) {
        const serializedError = _serializeError(err.error);
        return { ...serializedError, ..._classifyFetchError(serializedError) };
    }

    /// HTTP errors return the augmented response of the fetch request.
    if (err.type === ERROR_TYPES.HTTP) return { ...err, ..._classifyHttpError(err.status) };
    return { ...err };
}

/** Perform an HTTP request using the fetch API. Returns a standardized response object with data or an error. */
async function httpRequest(url, config, options = {}) {
    options.headers = options.headers || {};
    addAuthHeader(options.headers, config);
    options.dispatcher = getDispatcher(config);

    // --- handle JSON bodies automatically ---
    if (_isObject(options.body)) {
        options.body = JSON.stringify(options.body);
        options.headers[_HEADERS.CONTENT_TYPE] ??= 'application/json';
    }

    let response;
    let data;
    const fetch = resolveFetch();

    try {
        response = await fetch(url, options);
        data = await _retrieveResponseData(response);
    } catch (error) {
        // this is thrown by fetch in case of network errors. response and data will be undefined.
        const serializedError = _serializeError(error);
        return { ok: false, ...serializedError, ..._classifyFetchError(serializedError) };
    }
    return _responseStatus(response, data);
}

function resolveFetch(requireFn = require, globalObj = globalThis) {
    if (fetchImpl) return fetchImpl;
    if (globalObj.fetch) {
        fetchImpl = globalObj.fetch;
        return fetchImpl;
    }
    try {
        const { fetch } = requireFn('undici');
        fetchImpl = fetch;
    } catch (err) {
        throw new Error("No fetch available. Install 'undici' or upgrade Node.js. Error: " + err.message);
    }
    return fetchImpl;
}

/** Set default values for the config data. This should be called very early on, when the config is injected first
 * (i.e. when the controller node is created). */
function setDefaults(config) {
    // Set default values for config properties, Also trims text, unless told not to
    config.url = trimSlashes(setWithDefault(config.url.toLowerCase(), ''));
    config.allowSelfSigned = !!config.allowSelfSigned;
    config.token = setWithDefault(config.token, '');
    config.username = setWithDefault(config.username, '');
    config.password = setWithDefault(config.password, '', { noTrim: true });
    config.retryTimeout = setWithDefault(config.retryTimeout, Infinity, { number: true });
    config.isHttps = config.url.startsWith('https://');
    config.authMethod = _getAuthMethod(config.token, config.username);
    return config;
}

function setFetch(customFetch) {
    fetchImpl = customFetch;
}

// --- Private functions ---

/** classify the error from a failing fetch command. Always sets type */
function _classifyFetchError(err) {
    // if we don't have a cause we take the generic transport error.
    if (!err?.cause) return { type: ERROR_TYPES.TRANSPORT };

    const code = err.cause.code;
    const message = err.cause.message ?? err.message;

    // if we don't have a code, try and return the inner exception name instead.
    if (!code) return { type: ERROR_TYPES.TRANSPORT, code: err.cause.name, message };

    const result = { code, message };
    if (_NETWORK_ERRORS.has(code)) {
        result.type = ERROR_TYPES.NETWORK;
    } else if (_TLS_ERRORS.has(code)) {
        result.type = ERROR_TYPES.TLS;
    } else {
        result.type = ERROR_TYPES.TRANSPORT;
    }
    if (_RETRYABLE.has(code)) {
        result.retry = true;
    }
    return result;
}

/** Classify an erroneous HTTP message using the returned error status.
 * If type isn't changing, it doesn't need to be set. */
function _classifyHttpError(status) {
    switch (status) {
        case 401:
        case 403:
            return { type: ERROR_TYPES.AUTH };

        // 404 is tricky. the most frequent issue is a non-existing resource where a retry won't help.
        // There is an edge case where 404 can be sent when OpenHAB is restarting.
        // So we define it as not retryable here, and let the business logic deal with it.

        // Service Unavailable can be sent when OpenHAB is restarting
        case 503:
            return { retry: true };
        default:
            return {};
    }
}

function _getAuthMethod(token, userName) {
    if (token) return _AUTH.BEARER;
    return userName ? _AUTH.BASIC : '';
}

/** create an error message based on the response, the response body, and the status */
function _getErrorMessage(data, status, statusText) {
    const dataMessage = data == null ? null : data.error?.message || data.message;
    return dataMessage || (typeof data === 'string' ? data : null) || statusText || `HTTP Error ${status}`;
}

function _isObject(body) {
    return body && typeof body === 'object' && !(body instanceof Buffer);
}

/** Enhance the fetch function to handle errors and return a standardized response. Takes care of setting properties
 * ok, retry, authFailed, authRequired, and message on the error object. */
function _responseStatus(response, data) {
    const status = response.status || 500;

    // Codes in the 200 range imply success
    if (Math.floor(status / 100) === 2) return { ok: true, status, data };

    const message = _getErrorMessage(data, status, response.statusText);
    return { ok: false, type: ERROR_TYPES.HTTP, status, message, ..._classifyHttpError(status) };
}

/** Retrieve the response data, handling empty responses and content types JSON and text. Returns null for no content. */
async function _retrieveResponseData(response) {
    const data = (await response.text()).trim();
    if (data === '') return null;
    return safeParseJSON(data, data);
}

function _serializeError(err) {
    if (!err) return err;

    return {
        message: err.message,
        name: err.name,
        ...(err.code && { code: err.code }),
        //stack: err.stack,
        ...(err.cause && { cause: _serializeError(err.cause) }),
    };
}

module.exports = {
    addAuthHeader,
    classifyError,
    createEventSourceDependencies,
    getDispatcher,
    httpRequest,
    resolveFetch,
    setDefaults,
    setFetch,
};
