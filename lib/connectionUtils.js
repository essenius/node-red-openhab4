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

let fetchImpl;

try {
  fetchImpl = global.fetch || require("node-fetch");
} catch (err) {
  throw new Error("No fetch available. Install 'node-fetch' or upgrade Node.js. Error: " + err.message);
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

    if (response.status === 503) {
      return { retry: true, status: response.status };
    }

    if (response.status === 401) {
      if (!hasCredentials) {
        return { authRequired: true, status: 401, error: new Error("Authentication required but no credentials provided.") };
      } else {
        return { authFailed: true, status: 401, error: new Error("Authentication failed. Please check your credentials.") };
      }
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    // Handle response data
    let data;
    if (responseType === "text") {
      data = await response.text();
    } else {
      // For JSON responses, handle empty responses gracefully
      const text = await response.text();
      
      if (text.trim() === "") {
        data = null; // Empty response is valid for commands/updates
      } else {
        try {
          data = JSON.parse(text);
        } catch (parseError) {
          throw new Error(`Invalid JSON response: ${parseError.message}`);
        }
      }
    }
    
    return { data };
  } catch (error) {
    return { error };
  }
}

function getConnectionString(config) {

    let url = (config.protocol || "http") + "://" + config.host;
    if (isSpecified(config.port)) url += ":" + config.port;
    if (isSpecified(config.path)) url += "/" + trimSlashes(config.path.trim());
    return url;
}

function isPhantomError(err) {
    return !err || typeof err !== 'object' ||
        (err.type && typeof err.type === 'object' && Object.keys(err.type).length === 0);
}

function isSpecified(property) {
  if (property === undefined || property === null) return false;
  if (typeof property === "string") return property.trim().length > 0;
  if (typeof property === "number") return !isNaN(property);
  return true; // Fallback for other types like objects or booleans
}


function trimSlashes(str) {
    return str.replace(/^\/+|\/+$/g, '');
}

module.exports = {
    fetch: fetchImpl,
    fetchOpenHAB,
    getConnectionString,
    isPhantomError,
    isSpecified,
    trimSlashes
};
