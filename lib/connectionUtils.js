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

let fetchImpl;

try {
    fetchImpl = global.fetch || require("node-fetch");
} catch (err) {
    throw new Error("No fetch available. Install 'node-fetch' or upgrade Node.js. Error: " + err.message);
}

function getErrorMessage(response, data, status) {
    if (data?.error?.message) {
        return data.error.message;
    }
    if (typeof data === "string") {
        return data;
    }
    if (response.statusText) {
        return response.statusText;
    }
    return `HTTP Error ${status}`;
}

function errorDetails(response, data, hasCredentials) {
    const status = response.status || 500;
    var message = getErrorMessage(response, data, status);

    if (Math.floor(status / 100) === 2) {
        return { ok: true, status };
    }

    function baseErrorObject(status, hasCredentials, message) {
        switch (status) {
            // Service Unavailable can be sent when OpenHAB is restarting
            case 503: return { retry: true, status, message };
            // Not Found can also be sent when OpenHAB is restarting, or if the URL is incorrect
            // if the response message contains "does not exist", this is most likely a request to a non-existing resource where a rety won't help
            case 404: return message.includes("does not exist") ? { status, message } : { retry: true, status, message };
            case 401: return hasCredentials
                ? { authFailed: true, status, message: "Wrong credentials provided." }
                : { authRequired: true, status, message: "No credentials provided." };
            // all others are treated as errors            
            default:
                return { status, message };
        }
    }

    const errorObject = baseErrorObject(status, hasCredentials, message);
    let error = new Error();
    Object.assign(error, errorObject);
    return error;
}

async function retrieveResponseData(response) {
    let data = (await response.text()).trim();
    if (data === "") {
        return null; // No content, return null
    }
    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
            return (data.trim() === "") ? null : JSON.parse(data);
    }
    if (contentType?.includes("text/plain")) {
        return data;
    }
    throw new Error(`Unsupported content type: ${contentType}`);
}

async function fetchOpenHAB(url, config, options = {}) {
    console.log(`fetchOpenHAB called with url: ${url}, config: ${JSON.stringify(config)}, options: ${JSON.stringify(options)}`);
    options.headers = options.headers || {};
    const hasCredentials = !!config.username;

    if (hasCredentials) {
        const auth = Buffer.from(`${config.username}:${config.password || ""}`).toString("base64");
        options.headers["Authorization"] = `Basic ${auth}`;
    }
    let response;
    let data;
    try {
        response = await fetchImpl(url, options);
        console.log(`Response: ${JSON.stringify(response)}`);
        data = await retrieveResponseData(response);
        console.log(`Response from ${url}: ${JSON.stringify(data)}`);
    } catch (error) { // this is thrown by fetchImpl in case of network errors. response will be undefined
        console.error(`Error fetching ${url}: ${JSON.stringify(error)}`);
        error.status = error.cause?.errno || 500; // default to 500 if no cause is available
        error.message = error.cause?.code || error.message || "Fetch failed"; 
        return error;
    }
    const errorObject = errorDetails(response, data, hasCredentials);
    return errorObject.ok ? { data } : errorObject; 
}

function setDefaults(config) {
    // Set default values for config properties
    config.protocol = setWithDefault(config.protocol, "http");
    config.host = setWithDefault(config.host, "localhost");
    config.port = setWithDefault(config.port, config.protocol === "https" ? 8443 : 8080);
    config.path = trimSlashes(setWithDefault(config.path, ""));
    config.username = setWithDefault(config.username, "");
    config.password = setWithDefault(config.password, "", { noTrim: true });
    return config;
}

function getConnectionString(config, options = {}) {

    let url = config.protocol + "://";
    if (options.includeCredentials && isSpecified(config.username)) {
        // Embed credentials in the URL for EventSource (SSE) as that has no other way to pass them
        const user = encodeURIComponent(config.username);
        const pass = encodeURIComponent(config.password);
        url += `${user}:${pass}@`;
    }
    url += `${config.host}:${config.port}`;
    if (isSpecified(config.path)) url += "/" + config.path;
    return url;
}

function isPhantomError(err) {
    return !err || typeof err !== 'object' ||
        (!!err.type && typeof err.type === 'object' && Object.keys(err.type).length === 0);
}

function isSpecified(property) {
    if (property === undefined || property === null) return false;
    if (typeof property === "string") return property.trim().length > 0;
    if (typeof property === "number") return !isNaN(property);
    return true; // Fallback for other types like objects or booleans
}

function setWithDefault(property, defaultValue, options = {}) {
    if (property === undefined || property === null) return defaultValue;
    if (typeof property === "string") {
        if (!options.noTrim) property = property.trim();
        return property.length > 0 ? property : defaultValue;
    }
    if (typeof property === "number") {
        return isNaN(property) ? defaultValue : property;
    }
    // For other types, return as is (safety net, should not be needed for setDefaults)
    return property;
}

function trimSlashes(str) {
    return str.replace(/^\/+|\/+$/g, '');
}

module.exports = {
    errorDetails,
    fetch: fetchImpl,
    fetchOpenHAB,
    getConnectionString,
    isPhantomError,
    isSpecified,
    setDefaults,
    trimSlashes
};
