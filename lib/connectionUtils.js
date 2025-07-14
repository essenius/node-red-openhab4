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

function errorDetails(status = 500, hasCredentials = false, message = "") {
  if (status >= 200 && status <= 299) {
    return { status: status, ok: true };
  }
  if (status === 503 || status === 404) {
    return { retry: true, status, message };
  }
  if (status === 401) {
    if (!hasCredentials) {
      return { authRequired: true, status, message: "No credentials provided." };
    } else {
      return { authFailed: true, status, message: "Wrong credentials provided." };
    }
  }
  if (message) message = ": " + message;
  return { unexpected: true, status, message: `HTTP error ${status}${message}` };
}

async function fetchOpenHAB(url, config, options = {}, responseType = "json") {
  try {
    options.headers = options.headers || {};
    const hasCredentials = !!config.username;

    if (hasCredentials) {
      const auth = Buffer.from(`${config.username}:${config.password || ""}`).toString("base64");
      options.headers["Authorization"] = `Basic ${auth}`;
    }

    const response = await fetchImpl(url, options);

    const errorObject = errorDetails(response.status, hasCredentials, response.statusText);
    if (!errorObject.ok) {
      errorObject.error = new Error(errorObject.message);
      return errorObject;
    }

    // Handle response data
    let data;
    if (responseType === "text") {
      data = await response.text();
    } else {
      // For JSON responses, handle empty responses gracefully
      const text = await response.text();
      data = (text.trim() === "") ? null : JSON.parse(text);
    }
    return { data };
  } catch (error) {
    return { error };
  }
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
