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

const path = require('node:path');
const { expect } = require('chai');
const sinon = require('sinon');
const { STATE, SWITCH_STATUS } = require('../lib/constants');

describe('consumerNodeHandler', function () {
    let mockNode, mockHandler, mockBus, mockController, nodeHandler;

    const { ConsumerNodeHandler } = require(path.join(__dirname, '..', 'lib', 'consumerNodeHandler.js'));
    class TestNodeHandler extends ConsumerNodeHandler {
        setupNodeLogic(options) {
            this.setupNodeLogicCalledWith = options;
        }
    }

    beforeEach(function () {
        mockNode = {
            type: 'openhab4-test',
            status: sinon.stub(),
            warn: sinon.stub(),
            error: sinon.stub(),
            log: sinon.stub(),
            on: sinon.stub(),
            off: sinon.stub(),
        };

        mockBus = {
            publish: sinon.spy(),
            subscribe: sinon.spy(),
        };

        mockHandler = {
            eventBus: mockBus,
        };

        mockController = {
            handler: mockHandler,
        };

        nodeHandler = new TestNodeHandler(mockNode, {}, mockController, { generateTime: () => '12:34:56' });
    });

    it('retrieves type correctly', function () {
        expect(nodeHandler.getNodeType()).to.equal('Test', 'Node type with prefix determined correctly');
        nodeHandler.node.type = 'type-without-prefix';
        expect(nodeHandler.getNodeType()).to.equal(
            'type-without-prefix',
            'Node type without prefix determined correctly'
        );
        nodeHandler.node = null;
        expect(nodeHandler.getNodeType(), 'Node type undefined when no node').to.be.undefined;
    });

    it('lets createMessage throw on missing payload or topic', function () {
        expect(() => nodeHandler.createMessage({ payload: 'bogus' })).to.throw(
            'createMessage requires either a message property, or payload and topic properties'
        );
    });

    it('handles a connection error adequately', function () {
        const statusSpy = sinon.spy(nodeHandler, 'setStatus');
        nodeHandler._onError('test error');
        expect(statusSpy.lastCall.args).to.deep.equal([STATE.ERROR, 'test error']);
    });

    it('handles a connection status change adequately', function () {
        const statusSpy = sinon.spy(nodeHandler, 'setStatus');
        nodeHandler._onConnectionStatus(SWITCH_STATUS.ON);
        expect(statusSpy.lastCall.args).to.deep.equal([STATE.READY, 'ready']);
        nodeHandler._onConnectionStatus(SWITCH_STATUS.OFF);
        expect(statusSpy.lastCall.args).to.deep.equal([STATE.WAITING, 'disconnected']);
    });

    it('should set status to init', function () {
        nodeHandler.setStatus(STATE.INIT, 'testing');
        expect(mockNode.status.firstCall.args).to.deep.equal(
            [{ fill: 'grey', shape: 'ring', text: 'testing @ 12:34:56' }],
            'Init handled ok'
        );
    });

    it('should set status to warning', function () {
        nodeHandler.setStatus(STATE.WARNING, 'warning');
        expect(mockNode.status.firstCall.args).to.deep.equal(
            [{ fill: 'yellow', shape: 'ring', text: 'warning @ 12:34:56' }],
            'Warning handled ok'
        );
    });

    it('should replace unknown status by warning', function () {
        nodeHandler.setStatus('bogus');
        expect(mockNode.status.firstCall.args).to.deep.equal(
            [{ fill: 'yellow', shape: 'ring', text: 'bogus @ 12:34:56' }],
            'Unknown handled ok'
        );
    });

    it('should replace unknown status by warning and message', function () {
        nodeHandler.setStatus('bogus', 'message');
        expect(mockNode.status.firstCall.args).to.deep.equal(
            [{ fill: 'yellow', shape: 'ring', text: 'bogus: message @ 12:34:56' }],
            'Unknown handled ok'
        );
    });
    it('should clear status', function () {
        nodeHandler.clearStatus();
        expect(mockNode.status.calledOnceWith({}));
    });

    it('should handle missing controller gracefully', function () {
        nodeHandler = new TestNodeHandler(mockNode, {}, undefined, {});
        const setStatusSpy = sinon.spy(nodeHandler, 'setStatus');
        nodeHandler.setupNode();

        expect(setStatusSpy.callCount).to.equal(2);
        expect(setStatusSpy.firstCall.args).to.deep.equal([STATE.INIT, 'initializing...'], 'Init sent first');
        expect(setStatusSpy.secondCall.args).to.deep.equal([STATE.ERROR, 'no controller'], 'Error sent second');
    });

    const testCases = [
        {
            input: 0,
            expected: { fill: 'green', shape: 'ring', text: '0 @ 12:34:56' },
        },
        {
            input: false,
            expected: { fill: 'green', shape: 'ring', text: 'false @ 12:34:56' },
        },
        {
            input: 'ON',
            expected: { fill: 'green', shape: 'dot', text: 'ON @ 12:34:56' },
        },
        {
            input: '',
            expected: { fill: 'green', shape: 'ring', text: ' @ 12:34:56' },
        },
        {
            input: null,
            expected: { fill: 'yellow', shape: 'ring', text: '? @ 12:34:56' },
        },
        {
            input: 'very long text that exceeds the maximum length',
            expected: { fill: 'green', shape: 'dot', text: 'very long text that exceeds the maxim...' },
        },
    ];

    for (const { input, expected } of testCases) {
        it(`should handle setValueStatus correctly for input: ${JSON.stringify(input)}`, function () {
            nodeHandler.setValueStatus(input);
            expect(mockNode.status.calledOnce, 'called once').to.be.true;
            expect(mockNode.status.firstCall.args[0]).to.deep.equal(expected, 'Content correct');
        });
    }

    describe('ParseTopic tests', function () {
        it('should parse topic with slash', function () {
            const result = nodeHandler.parseTopic('items/testItem');
            expect(result).to.deep.equal({ concept: 'items', identifier: 'testItem' });
        });

        it('should parse topic without slash as item', function () {
            const result = nodeHandler.parseTopic('item');
            expect(result).to.deep.equal({ concept: 'items', identifier: 'item' });
        });

        it('should handle topic with leading/trailing spaces', function () {
            const result = nodeHandler.parseTopic('  things/testThing  ');
            expect(result).to.deep.equal({ concept: 'things', identifier: 'testThing' });
        });

        it('should stringify non-string topics', function () {
            const result = nodeHandler.parseTopic(123);
            expect(result).to.deep.equal({ concept: 'items', identifier: '123' });
        });

        it('should correctly identify empty topic', function () {
            const emptyResult = nodeHandler.parseTopic('   ');
            expect(emptyResult).to.be.null;
            const onlySlashResult = nodeHandler.parseTopic('/  ');
            expect(onlySlashResult).to.be.null;
        });
    });
});
