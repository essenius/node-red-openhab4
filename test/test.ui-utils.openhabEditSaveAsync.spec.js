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

const { expect } = require('chai');
const sinon = require('sinon');

const {
    openhabEditSaveAsync,
    openhabEditCancel,
    ControllerChecker,
    ListenerManager,
} = require('../static/ui-utils.js');

describe('ui-utils openhabEditSaveAsync and openhabEditCancel', function () {
    let RED, node, checker;

    beforeEach(function () {
        globalThis.document = {
            getElementById: () => ({ value: 'controller1' }),
        };
        RED = { nodes: {}, events: { on: sinon.stub(), off: sinon.stub() } };
        checker = new ControllerChecker(RED, { getHashWithDefault: sinon.stub(), hasHashChanged: sinon.stub() });
        node = {
            type: 'testNode',
            id: 'node1',
            checker,
            _listenerManager: new ListenerManager(),
        };
        node._listenerManager.add('dummy', { destroy: sinon.stub() });
        sinon.stub(console, 'log');
        sinon.stub(console, 'warn');
    });

    afterEach(function () {
        sinon.restore();
        delete globalThis.document;
    });

    it('logs and returns if no checker present', async function () {
        node.checker = null;
        await openhabEditSaveAsync(RED, node);
        expect(console.log.calledOnce).to.be.true;
        expect(console.warn.notCalled).to.be.true;
    });

    it('calls checker and warns if message returned', async function () {
        const checkStub = sinon.stub().resolves({ message: 'Deploy first' });
        node.checker = { check: checkStub };

        await openhabEditSaveAsync(RED, node);
        expect(checkStub.calledOnce).to.be.true;
        expect(console.warn.calledOnceWith('Deploy first')).to.be.true;
        expect(node._listenerManager).to.be.null;
    });

    it('calls checker and does not warn if no message', async function () {
        const checkStub = sinon.stub().resolves({ controllerNode: {} });
        node.checker = { check: checkStub };
        const destroySpy = sinon.spy();
        node._fieldChangeListener = { destroy: destroySpy };
        await openhabEditSaveAsync(RED, node);
        expect(checkStub.calledOnce).to.be.true;
        expect(console.warn.notCalled).to.be.true;
        expect(node._listenerManager).to.be.null;
    });

    it('openhabEditCancel calls removeEventListeners', function () {
        openhabEditCancel(RED, node);
        expect(node._listenerManager).to.be.null;
    });
});
