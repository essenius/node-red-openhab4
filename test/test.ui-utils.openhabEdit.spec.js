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

const { openhabEditPrepare, openhabEditSave, openhabEditCancel, OpenhabEditorSession } = require('../static/ui-utils');

describe('ui-utils openHAB editor helpers', () => {
    let RED, node;

    beforeEach(() => {
        RED = {};
        node = {};
    });

    it('openhabEditPrepare creates session and wires listeners', async () => {
        // Stub class to track constructor + prepare call

        const prepareSpy = sinon.spy();
        const session = { prepare: prepareSpy, dispose: sinon.spy() };

        openhabEditPrepare(RED, node, 'empty', { session });
        await new Promise((r) => setImmediate(r));

        expect(node.session).to.equal(session);
        expect(prepareSpy.calledOnce).to.be.true;
    });

    it('openhabEditSave calls session.save and disposes', async () => {
        const saveSpy = sinon.spy();
        node._editorSession = { save: saveSpy, dispose: sinon.spy() };

        openhabEditSave(RED, node);

        // wait for the next tick so the async code in save actually runs
        await new Promise((r) => setImmediate(r));

        expect(saveSpy.calledOnce).to.be.true;
        expect(node._editorSession).to.be.undefined;
    });

    it('openhabEditCancel calls session.cancel and disposes', () => {
        const cancelSpy = sinon.spy();
        node._editorSession = { cancel: cancelSpy, dispose: sinon.spy() };

        openhabEditCancel(RED, node);

        expect(cancelSpy.calledOnce).to.be.true;
        expect(node._editorSession).to.be.undefined;
    });

    it('openhabEditPrepare craetes a new OpenhabEditorSession', async () => {
        openhabEditPrepare(RED, node, 'empty');
        await new Promise((r) => setImmediate(r));
        expect(node.session).to.be.instanceOf(OpenhabEditorSession, 'instance created');
        expect(node.session.RED).to.equal(RED, 'RED equal');
        expect(node.session.node).to.equal(node, 'Node equal');
    });
});
