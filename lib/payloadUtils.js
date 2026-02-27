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

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim() !== '';
}

function safeParseJSON(input, fallback = null) {
    try {
        return JSON.parse(input);
    } catch {
        return fallback;
    }
}

/** Set a property with a default value if it is not specified.
 * If the property is a string, it will be trimmed unless noTrim is set in options. */
function setWithDefault(property, defaultValue, options = {}) {
    if (property == null) return defaultValue; // includes undefined
    if (typeof property === 'string') {
        if (!options.noTrim) property = property.trim();
        if (property.length == 0) return defaultValue;
        if (typeof defaultValue === 'number') {
            const returnValue = Number(property);
            return Number.isNaN(returnValue) ? defaultValue : returnValue;
        }
    }

    // For other types, return as is (safety net, should not be needed)
    return property;
}

/** Trim leading and trailing slashes from a string. This is useful for paths in URLs. */
function trimSlashes(str) {
    str = str.replaceAll(/^\//g, ''); // Remove leading slash
    str = str.replaceAll(/\/$/g, ''); // Remove trailing slash
    return str;
}

/** Truncate a message to a maximum length, adding "..." if it exceeds the limit. */
function truncateMessage(message, maxLength = 40) {
    const result = message.length > maxLength ? message.substring(0, maxLength - 3) + '...' : message;
    return result;
}

module.exports = {
    isNonEmptyString,
    safeParseJSON,
    setWithDefault,
    trimSlashes,
    truncateMessage,
};
