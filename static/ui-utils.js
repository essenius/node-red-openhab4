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

(function (_global) {
    // --- ControllerChecker ---

    /**
     * @param {object} RED the node red object
     * @param {ControllerStateTracker} tracker the state tracker object
     */
    class ControllerChecker {
        constructor(RED, tracker) {
            this.RED = RED;
            this.tracker = tracker || getControllerStateTracker(this.RED);
        }

        async getControllerNode(controllerId, attempts = 10) {
            for (let i = 0; i < attempts; i++) {
                const node = this.RED.nodes.node(controllerId);
                if (node) return node;
                await new Promise((r) => setTimeout(r, 50));
            }
            return null;
        }

        async check(controllerInput) {
            const selectedControllerId = controllerInput?.value;
            if (!selectedControllerId) {
                return { message: 'Select a controller first' };
            }

            const controllerNode = await this.getControllerNode(selectedControllerId);
            if (!controllerNode) {
                return { message: 'Controller not ready' };
            }

            const deployedHash = this.tracker.getHashWithDefault(selectedControllerId, controllerNode.hash);
            console.log(`Deployed hash for ${selectedControllerId}`, deployedHash);

            const controllerChanged = this.tracker.hasHashChanged(selectedControllerId, controllerNode.hash);

            console.log('Controller changed', controllerChanged);
            console.log('Controller:', selectedControllerId, controllerNode);
            if (controllerChanged) {
                return { message: '⚠ Controller configuration changed, deploy first' };
            }

            return { controllerNode };
        }
    }

    // --- ControllerConfigChangeListener class ---

    class ControllerConfigChangeListener {
        /**
         * @param {object} RED
         * @param {HTMLSelectElement} controllerInput
         * @param {Function} refreshFn
         */
        constructor(RED, controllerInput, refreshFn) {
            this.RED = RED;
            this.controllerInput = controllerInput;

            this._handler = async (changedNode) => {
                if (!changedNode?._def) return;
                if (changedNode._def.category !== 'config') return;

                const selectedControllerId = this.controllerInput?.value;
                if (!selectedControllerId) return;

                if (changedNode.id === selectedControllerId) {
                    console.log('Controller config changed → refreshing');
                    await refreshFn();
                }
            };
            this.RED.events.on('nodes:change', this._handler);
        }

        destroy() {
            this.RED.events.off('nodes:change', this._handler);
        }
    }

    // --- ControllerStateTracker class ---

    class ControllerStateTracker {
        constructor(RED) {
            this.trackedControllers = new Map();
            this.RED = RED;
            this._deployHandler = null;
            this._attachDeployListener();
        }

        destroy() {
            this._detachDeployListener();
        }

        setHash(id, hash) {
            this.trackedControllers.set(id, hash);
        }

        getHashWithDefault(id, defaultValue) {
            if (!this.trackedControllers.has(id)) {
                this.trackedControllers.set(id, defaultValue);
                return defaultValue;
            }
            return this.trackedControllers.get(id);
        }

        hasHashChanged(id, hash) {
            return this.trackedControllers.get(id) !== hash;
        }

        _attachDeployListener() {
            if (this._deployHandler || !this.RED) return;
            this._deployHandler = () => {
                this.RED.nodes.eachConfig((n) => {
                    if (n.hash) this.setHash(n.id, n.hash);
                });
            };
            this.RED.events.on('deploy', this._deployHandler);
        }

        _detachDeployListener() {
            if (!this._deployHandler || !this.RED) return;
            this.RED.events.off('deploy', this._deployHandler);
            // Note: store the handler if you want proper off() later
            this._deployHandler = null;
        }
    }

    // --- DropdownController class ---

    class DropdownController {
        constructor({ checker, controllerInput, conceptInput, dropdown, currentValue, fetchFn = fetchJson }) {
            this.checker = checker;
            this.currentValue = currentValue;
            this.controllerInput = controllerInput;
            this.conceptInput = conceptInput;
            this.dropdown = dropdown;
            this.fetchFn = fetchFn;
            this._refreshToken = 0;
        }

        _nextRefreshToken() {
            return ++this._refreshToken;
        }

        _isRefreshValid(token) {
            return token === this._refreshToken;
        }

        async refresh() {
            const token = this._nextRefreshToken();
            const controllerCheck = await this.checker.check(this.controllerInput);

            if (controllerCheck.message) {
                this.render({ message: controllerCheck.message });
                return;
            }

            const concept = this.conceptInput?.value ?? 'items';

            let resources;
            try {
                resources = await this.fetchFn(`openhab4/${concept}`, { controller: this.controllerInput.value });
            } catch (err) {
                resources = { ok: false, message: err.message };
            }

            if (!this._isRefreshValid(token)) return;
            this.render(resources, concept);
        }

        render(resources, concept) {
            if (Array.isArray(resources.data)) {
                const nameKey = concept === 'things' ? 'UID' : 'name';
                const allNames = resources.data.map((i) => i[nameKey]).sort();
                this.dropdown.setOptions(allNames, this.currentValue);
                return;
            }
            this.dropdown.setSingleDisabledOption(resources.message);
        }
    }

    // --- DropdownWithFilterListener class ---

    class DropdownWithFilterListener {
        /**
         * @param {HTMLSelectElement} select
         * @param {HTMLInputElement|null} filterInput
         * @param {string|null} specialOptionText
         */
        constructor(select, filterInput = null, specialOptionText = '[None]') {
            this.select = select;
            this.filterInput = filterInput;
            this.specialOption = { value: '', text: specialOptionText };
            this.allOptions = [];
            this.selectedValue = null;
            this._attachFilterInput();
        }

        destroy() {
            this._detachFilterInput();
        }

        clearOptions() {
            if (!this.select) return;
            this.select.innerHTML = '';
        }

        setOptions(allOptions, selectedValue) {
            if (!this.select) return;
            this.allOptions = allOptions;
            this.selectedValue = selectedValue;
            this._populate(allOptions);
        }

        setSingleDisabledOption(optionText) {
            if (!this.select) return;
            this.clearOptions();
            this._appendOption({ value: '', text: optionText, disabled: true });
        }

        // private methods

        _appendOption({ value, text, disabled = false }, selectedValue = null) {
            const option = document.createElement('option');
            option.value = value;
            option.text = text;
            if (disabled) option.disabled = disabled;
            if (selectedValue != null) option.selected = value === selectedValue;
            this.select.appendChild(option);
        }

        _attachFilterInput() {
            if (!this.filterInput) return;

            this._inputHandler = () => {
                const filter = this.filterInput.value.toLowerCase();
                const filtered = this.allOptions.filter((resource) => resource.toLowerCase().includes(filter));
                this._populate(filtered);
            };

            this.filterInput.addEventListener('input', this._inputHandler);
        }

        _detachFilterInput() {
            if (this.filterInput && this._inputHandler) {
                this.filterInput.removeEventListener('input', this._inputHandler);
                this._inputHandler = null;
            }
        }

        _populate(options) {
            this.clearOptions();

            this._appendOption(this.specialOption, this.selectedValue);

            options.forEach((resource) => {
                this._appendOption({ value: resource, text: resource }, this.selectedValue);
            });
        }
    }

    // --- EditorDom class ---

    class EditorDom {
        constructor(getInputFieldFn) {
            this.getInputField = getInputFieldFn;
        }

        controllerInput() {
            return this.getInputField('controller');
        }
        conceptInput() {
            return this.getInputField('concept');
        }
        identifierInput() {
            return this.getInputField('identifier');
        }
        filterInput() {
            return this.getInputField('list-filter');
        }
    }

    // --- FieldChangeListener class ---

    class FieldChangeListener {
        constructor(controllerInput, conceptInput, refreshFn) {
            this.controllerInput = controllerInput;
            this.conceptInput = conceptInput;
            this._handler = () => refreshFn();
            this._attach();
        }

        destroy() {
            this._detach();
        }

        _attach() {
            this.controllerInput?.addEventListener('change', this._handler);
            this.conceptInput?.addEventListener('change', this._handler);
        }

        _detach() {
            this.controllerInput?.removeEventListener('change', this._handler);
            this.conceptInput?.removeEventListener('change', this._handler);
        }
    }

    // --- ListenerManager class ---

    class ListenerManager {
        constructor() {
            this.listeners = new Map();
        }

        /**
         * Add a listener under a unique key.
         * The listener must have a destroy() method.
         */
        add(key, listener) {
            if (this.listeners.has(key)) {
                // Optional: auto-remove old listener if key already exists
                this.remove(key);
            }
            this.listeners.set(key, listener);
        }

        get(key) {
            return this.listeners.get(key);
        }

        /**
         * Remove a single listener by key.
         */
        remove(key) {
            const listener = this.listeners.get(key);
            if (listener?.destroy) listener.destroy();
            this.listeners.delete(key);
        }

        /**
         * Remove all listeners.
         */
        dispose() {
            for (const listener of this.listeners.values()) {
                if (listener.destroy) listener.destroy();
            }
            this.listeners.clear();
        }

        /**
         * Iterate over listeners (for testing or inspection)
         */
        forEach(callback) {
            this.listeners.forEach(callback);
        }
    }

    // --- OpenhabEditorSession class ---
    /** Manage the editor session for the node configuration
     * RED, node, fetchFn and dom need to be defined.
     */
    class OpenhabEditorSession {
        constructor(RED, node, emptyText = '', dependencies = {}) {
            // Runtime parameters
            this.RED = RED;
            this.node = node;
            this.emptyText = emptyText;

            this.dependencies = dependencies;
            this.dom = dependencies.dom ?? new EditorDom(getInputField);

            this.listenerManager = new ListenerManager();

            this.dropdown = null;
            this.dropdownController = null;
            this.controllerChecker = null;
            this._disposed = false;
        }

        async prepare() {
            const controllerInput = this.dom.controllerInput();
            const conceptInput = this.dom.conceptInput();
            const identifierInput = this.dom.identifierInput();
            const filterInput = this.dom.filterInput();

            this.dropdown = new DropdownWithFilterListener(identifierInput, filterInput, this.emptyText);
            this.listenerManager.add('dropdownFilter', this.dropdown);
            this.controllerChecker = new ControllerChecker(this.RED);

            this.dropdownController = new DropdownController({
                checker: this.controllerChecker,
                controllerInput,
                conceptInput,
                dropdown: this.dropdown,
                currentValue: this.node.identifier,
                ...this.dependencies,
            });

            const refresh = () => this.dropdownController.refresh();

            this.listenerManager.add(
                'controllerConfig',
                new ControllerConfigChangeListener(this.RED, controllerInput, refresh)
            );
            this.listenerManager.add('fieldChange', new FieldChangeListener(controllerInput, conceptInput, refresh));

            await refresh();
        }

        async save() {
            const { message } = await this.controllerChecker.check(this.dom.controllerInput());
            this.dispose();
            if (message) console.warn(message);
        }

        cancel() {
            this.dispose();
        }

        dispose() {
            if (this._disposed) return;
            this.listenerManager.dispose();
            this._disposed = true;
        }
    }

    // --- Main entry point ---

    let controllerStateTracker = null;

    function getControllerStateTracker(RED) {
        if (!controllerStateTracker) {
            controllerStateTracker = new ControllerStateTracker(RED);
        }
        return controllerStateTracker;
    }

    async function fetchJson(url, data, timeoutMs = 5000) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const query = new URLSearchParams(data).toString();
            const response = await fetch(`${url}?${query}`, {
                method: 'GET',
                headers: { Accept: 'application/json' },
                signal: controller.signal,
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            return await response.json();
        } finally {
            clearTimeout(timeout);
        }
    }

    function safeAsync(fn) {
        Promise.resolve()
            .then(fn)
            .catch((err) => {
                console.error('openHAB editor error:', err);
            });
    }

    function getInputField(name) {
        return document.getElementById(`node-input-${name}`);
    }

    function openhabEditCancel(RED, node) {
        node._editorSession?.cancel();
        delete node._editorSession;
    }

    function openhabEditSave(RED, node) {
        safeAsync(async () => {
            await node._editorSession?.save();
            delete node._editorSession;
        });
    }

    function openhabEditPrepare(RED, node, emptyText, injections = {}) {
        node.session = injections.session ?? new OpenhabEditorSession(RED, node, emptyText, injections);

        safeAsync(async () => {
            await node.session.prepare();
        });
    }

    globalThis.openhabEditPrepare = openhabEditPrepare;
    globalThis.openhabEditSave = openhabEditSave;
    globalThis.openhabEditCancel = openhabEditCancel;

    const isTest = typeof module !== 'undefined' && module.exports;

    if (isTest) {
        module.exports = {
            ControllerChecker,
            ControllerConfigChangeListener,
            ControllerStateTracker,
            DropdownController,
            DropdownWithFilterListener,
            EditorDom,
            FieldChangeListener,
            ListenerManager,
            OpenhabEditorSession,
            fetchJson,
            getInputField,
            openhabEditCancel,
            openhabEditPrepare,
            openhabEditSave,
            safeAsync,
        };
    }
})(globalThis);
