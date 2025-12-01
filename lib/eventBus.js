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

class EventBus {
    constructor() {
        // Exact subscriptions: key = eventTag, value = Set of nodes
        this.exactSubscriptions = new Map();

        // Regex subscriptions: array of { regex, node }
        this.regexSubscriptions = [];
    }

    publish(eventTag, payload) {
        const subscribers = new Set();
        this._addNodeSet(this.exactSubscriptions.get(eventTag), subscribers);
        this._addRegexNodes(subscribers, (regex) => regex.test(eventTag));
        this._emitToNodes(subscribers, eventTag, payload);
    }

    subscribe(node, patternString) {
        for (const pattern of this._parsePatterns(patternString)) {
            this._subscribe(node, pattern);
        }
    }

    unsubscribe(node, pattern) {
        if (pattern.includes("*")) {
            this.regexSubscriptions = this.regexSubscriptions.filter(
                sub => !(sub.node === node && sub.regex.source === this._patternToRegex(pattern).source)
            );
        } else {
            this.exactSubscriptions.get(pattern)?.delete(node);
            if (this.exactSubscriptions.get(pattern)?.size === 0) {
                this.exactSubscriptions.delete(pattern);
            }
        }
    }

    // TODO: eliminate
    broadcastToAll(eventTag, payload) {
        const subscribers = new Set();
        this._addAllNodeSets(this.exactSubscriptions.values(), subscribers);
        this._addRegexNodes(subscribers, () => true);
        this._emitToNodes(subscribers, eventTag, payload);
    }

    // --- Private methods ---

    _parsePatterns(patterns) {
        if (!Array.isArray(patterns)) {
            patterns = patterns.split(/[;,]/); // if it's a string, split on commas or semicolons
        }

        return patterns
            .map(p => p.trim())
            .filter(Boolean) // remove all falsy values
            .filter(p => p.length > 0);
    }

    // Subscribe to an event tag
    _subscribe(node, pattern) {
        if (pattern.includes("*")) {
            // Treat as regex
            const regex = this._patternToRegex(pattern);
            this.regexSubscriptions.push({ regex, node });
        } else {
            // Exact match
            if (!this.exactSubscriptions.has(pattern)) {
                this.exactSubscriptions.set(pattern, new Set());
            }
            this.exactSubscriptions.get(pattern).add(node);
        }
    }

    _patternToRegex(pattern) {
        const escaped = pattern.replaceAll(/[-/\\^$+?.()|[\]{}]/g, match => `\\${match}`);
        return new RegExp("^" + escaped.replaceAll("*", ".*") + "$");
    }

    _addNodeSet(nodeSet, result) {
        if (!nodeSet) return;
        for (const node of nodeSet) {
            result.add(node);
        }
    }

    _addAllNodeSets(nodeSets, result) {
        for (const set of nodeSets) {
            this._addNodeSet(set, result);
        }
    }

    _addRegexNodes(result, predicate) {
        for (const sub of this.regexSubscriptions) {
            if (!result.has(sub.node) && predicate(sub.regex, sub.node)) result.add(sub.node);
        }
    }

    _emitToNodes(nodes, eventTag, payload) {
        for (const node of nodes) {
            node.emit(eventTag, payload)
        }
    }
}

module.exports = { EventBus };
