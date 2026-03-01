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
const { expect } = require('chai');
const sinon = require('sinon');
const { JSDOM } = require('jsdom');

const { OpenhabEditorSession, ControllerChecker, DropdownController, EditorDom } = require('../static/ui-utils');

describe('ui-utils OpenhabEditorSession', function () {
    let RED;
    let node;
    let dom;

    beforeEach(function () {
        // Set up jsdom DOM
        const jsdom = new JSDOM(`
            <html>
                <body>
                    <input id="node-input-controller" value="ctrl1">
                    <input id="node-input-concept" value="items">
                    <select id="node-input-identifier"></select>
                    <input id="list-filter">
                </body>
            </html>
        `);

        globalThis.document = jsdom.window.document;
        globalThis.window = jsdom.window;

        // Fake RED object
        RED = {
            nodes: {
                node: sinon.stub().returns({ id: 'ctrl1', hash: 'hash1' }),
            },
            events: {
                on: sinon.fake(),
                off: sinon.fake(),
            },
        };

        // Node object for editor session
        node = { identifier: 'item1', type: 'test-node', id: 'node1' };

        // EditorDom wrapper
        dom = {
            controllerInput: () => document.getElementById('node-input-controller'),
            conceptInput: () => document.getElementById('node-input-concept'),
            identifierInput: () => document.getElementById('node-input-identifier'),
            filterInput: () => document.getElementById('list-filter'),
        };
    });

    afterEach(function () {
        sinon.restore();
        globalThis.document = undefined;
        globalThis.window = undefined;
    });

    it('prepare wires collaborators correctly', async function () {
        const fetchFn = sinon.fake.resolves({ data: [{ name: 'item1' }] });

        // Not using the dom mock, but letting the session it use a new EditorDom
        const session = new OpenhabEditorSession(RED, node, undefined, { fetchFn });

        await session.prepare();

        expect(session.controllerChecker).to.be.instanceOf(ControllerChecker);
        expect(session.dropdownController).to.be.instanceOf(DropdownController);
        expect(session.listenerManager.listeners.size).to.equal(3);
        expect(session.dropdown.select.options.length).to.be.above(1); // includes special option
    });

    it('save calls controllerChecker and disposes session', async function () {
        const session = new OpenhabEditorSession(RED, node, 'emptyText', {
            fetchFn: async () => ({ data: [{ name: 'item1' }] }),
            dom,
        });

        // Replace controllerChecker.check with spy
        const checkSpy = sinon.stub().resolves({ message: 'ok' });
        session.controllerChecker = { check: checkSpy };

        // Also stub listenerManager.dispose
        const disposeSpy = sinon.spy(session.listenerManager, 'dispose');
        await session.save();
        expect(checkSpy.calledOnce).to.be.true;
        expect(disposeSpy.calledOnce).to.be.true;
    });

    it('cancel disposes session', function () {
        const session = new OpenhabEditorSession(RED, node, 'emptyText', { fetchFn: async () => {}, dom });
        const disposeSpy = sinon.spy(session.listenerManager, 'dispose');
        session.cancel();
        expect(disposeSpy.calledOnce, 'listenerManager.dispose called the first time').to.be.true;
        session.cancel();
        expect(disposeSpy.calledOnce, 'listenerManager.dispose not called again').to.be.true;
    });

    it('handles save without controllerChecker', function () {
        const session = new OpenhabEditorSession(RED, node, 'emptyText', { fetchFn: async () => {}, dom });
        const disposeSpy = sinon.spy(session.listenerManager, 'dispose');
        session.cancel();
        expect(disposeSpy.calledOnce, 'listenerManager.dispose called the first time').to.be.true;
        session.cancel();
        expect(disposeSpy.calledOnce, 'listenerManager.dispose not called again').to.be.true;
    });

    it('uses the default EditorDom if no dependencies are specified', function () {
        const session = new OpenhabEditorSession(RED, node, 'emptyText');
        expect(session.dom).to.be.instanceOf(EditorDom);
    });
});
