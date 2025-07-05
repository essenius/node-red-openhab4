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

async function fetchOpenHAB(url, options = {}, responseType = "json") {
  try {
    const response = await fetchImpl(url, options);

    if (response.status === 503) {
      return { retry: true, status: response.status };
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = responseType === "text" ? await response.text() : await response.json();
    return { data };
  } catch (error) {
    return { error };
  }
}

function getConnectionString(config) {
    let url;

    if (config.protocol)
        url = config.protocol;
    else
        url = "http";

    url += "://";

    if (isSpecified(config.username)) {
        url += encodeURIComponent(config.username.trim());

        if (isSpecified(config.password)) {
            url += ":" + encodeURIComponent(config.password);
        }
        url += "@";
    }
    url += config.host;

    if (isSpecified(config.port)) {
        url += ":" + config.port;
    }

    if (isSpecified(config.path)) {
        let path = trimSlashes(config.path.trim());
        url += "/" + path;
    }

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
