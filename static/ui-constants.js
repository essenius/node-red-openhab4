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

// ensure the namespace exists
window.OPENHAB4 = window.OPENHAB4 || {};

// Attach constants
; (function (ns) {
    ns.NODE_COLOR = "#3bd17e"; // balanced spring = #3bd17e, seafoam green = #33cc99, spring green = #00e676, #4caf50 = moss green

    // Shared naming utilities to avoid code duplication
    ns.generateNodeName = function (nodeType, customName, itemName) {
        if (customName) {
            return customName;
        }
        const trimmedItemName = (itemName || "").trim();
        if (trimmedItemName) {
            return `${nodeType} (${trimmedItemName})`;
        }
        return `openhab4-${nodeType}`;
    };
})(window.OPENHAB4);

