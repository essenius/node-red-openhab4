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

class EventBus {
    constructor() {
        // Exact subscriptions: key = eventTag, value = Set of callbacks
        this.exactSubscriptions = new Map();

        // Regex subscriptions: key = pattern, value = { regex, set of callbacks }
        this.regexSubscriptions = new Map();
    }

    publish(eventTag, payload) {
        const subscribers = new Set();
        this._addSubscriberSet(this.exactSubscriptions.get(eventTag), subscribers);
        this._addRegexSubscribers(subscribers, /*(regex) => regex.test(eventTag)*/ eventTag);
        this._invokeCallbacks(subscribers, payload);
    }

    subscribe(patternString, callback) {
        for (const pattern of this._parsePatterns(patternString)) {
            this._subscribe(pattern, callback);
        }
    }

    unsubscribe(patternString, callback) {
        for (const pattern of this._parsePatterns(patternString)) {
            if (pattern.includes('*')) {
                this._unsubscribeRegex(pattern, callback);
            } else {
                this._unsubscribeExact(pattern, callback);
            }
        }
    }

    // --- Private methods ---

    _addRegexSubscribers(result, eventTag) {
        for (const { regex, callbacks } of this.regexSubscriptions.values()) {
            if (regex.test(eventTag)) {
                for (const callback of callbacks) {
                    result.add(callback);
                }
            }
        }
    }

    _addSubscriberSet(subscriberSet, result) {
        if (!subscriberSet) return;
        for (const callback of subscriberSet) {
            result.add(callback);
        }
    }

    _invokeCallbacks(callbacks, payload) {
        for (const callback of callbacks) {
            try {
                callback(payload);
            } catch (err) {
                console.error('EventBus callback error:', err);
            }
        }
    }

    _parsePatterns(patterns) {
        if (!Array.isArray(patterns)) {
            patterns = patterns.split(/[;,]/); // if it's a string, split on commas or semicolons
        }

        // remove all falsy values, including empty strings
        return patterns.map((p) => p.trim()).filter(Boolean); 
    }

    _patternToRegex(pattern) {
        const escaped = pattern.replaceAll(/[-/\\^$+?.()|[\]{}]/g, (match) => `\\${match}`);
        return new RegExp('^' + escaped.replaceAll('*', '.*') + '$');
    }

    // Subscribe to an event tag
    _subscribe(pattern, callback) {
        if (pattern.includes('*')) {
            this._subscribeRegex(pattern, callback);
        } else {
            this._subscribeExact(pattern, callback);
        }
    }

    _subscribeExact(pattern, callback) {
        if (!this.exactSubscriptions.has(pattern)) {
            this.exactSubscriptions.set(pattern, new Set());
        }
        this.exactSubscriptions.get(pattern).add(callback);
    }

    _subscribeRegex(pattern, callback) {
        const regex = this._patternToRegex(pattern);
        const key = regex.source;

        if (!this.regexSubscriptions.has(key)) {
            this.regexSubscriptions.set(key, { regex, callbacks: new Set() });
        }
        this.regexSubscriptions.get(key).callbacks.add(callback);
    }

    _unsubscribeExact(pattern, callback) {
        const set = this.exactSubscriptions.get(pattern);
        if (set) {
            set.delete(callback);
            if (set.size === 0) {
                this.exactSubscriptions.delete(pattern);
            }
        }
    }

    _unsubscribeRegex(pattern, callback) {
        const regex = this._patternToRegex(pattern);
        const key = regex.source;

        if (this.regexSubscriptions.has(key)) {
            const entry = this.regexSubscriptions.get(key);
            entry.callbacks.delete(callback);
            if (entry.callbacks.size === 0) this.regexSubscriptions.delete(key);
        }
    }
}

module.exports = { EventBus };
