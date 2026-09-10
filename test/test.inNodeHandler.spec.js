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
const inNodeHandlerPath = path.join(__dirname, '..', 'lib', 'inNodeHandler.js');
const { InNodeHandler } = require(inNodeHandlerPath);
const { EVENT_TYPE, SWITCH } = require('../lib/constants');

function createEvent(payload, payloadType = 'OnOff') {
    return {
        topic: 'items/testItem',
        eventType: EVENT_TYPE.ITEM_STATE,
        payload,
        ...(payloadType && { payloadType }),
    };
}

describe('inNodeHandler', function () {
    it('should setup the right handlers and send the right messages', async function () {
        const contextStore = {};
        const node = {
            type: 'openhab4-in',
            error: sinon.spy(),
            status: sinon.spy(),
            send: sinon.spy(),
            on: sinon.spy(),
            off: sinon.spy(),
            log: sinon.spy(),
            context: () => ({
                set: (key, value) => {
                    contextStore[key] = value;
                },
                get: (key) => contextStore[key],
            }),
        };
        const config = { concept: 'items', identifier: 'testItem', changesOnly: true, eventTypesAll: true };
        const eventBus = { publish: sinon.spy(), subscribe: sinon.spy(), unsubscribe: sinon.spy() };
        const controller = { handler: { eventBus: eventBus }, on: sinon.spy(), off: sinon.spy() };

        const inNodeHandler = new InNodeHandler(node, config, controller, {
            generateId: () => '123',
            generateTime: () => '12:34:56',
        });

        expect(inNodeHandler.identifier).to.equal('testItem', 'identifier is set correctly');
        expect(inNodeHandler.resourceTag).to.equal('items/testItem', 'resourceTag is correct');
        expect(inNodeHandler.getNodeType(), 'node type is in').to.equal('In');

        inNodeHandler.setupNode();

        // node.on called for close
        expect(node.on.callCount).to.equal(2, 'node.on called twice');

        // subscribe called for ConnectionStatus, NodeError, items/TestItem (no input)
        expect(eventBus.subscribe.callCount).to.equal(2, 'Subscribe called 3 times');

        inNodeHandler._processEvent(createEvent(SWITCH.ON, null));
        expect(node.send.firstCall.args[0]).to.deep.include(
            { payload: SWITCH.ON, eventType: EVENT_TYPE.ITEM_STATE, topic: 'items/testItem' },
            'First incoming message sent out'
        );

        node.send.resetHistory();
        inNodeHandler._processEvent(createEvent(SWITCH.ON));
        expect(node.send.notCalled, 'send not called when payload unchanged (despite type is now sent too)').to.be.true;

        const offMessage = createEvent(SWITCH.OFF);
        inNodeHandler._processEvent(offMessage);
        expect(node.send.firstCall.args[0]).to.deep.include(offMessage, 'Message with different value does get sent');

        node.send.resetHistory();
        inNodeHandler.config.changesOnly = false;
        inNodeHandler._processEvent(offMessage);
        expect(node.send.firstCall.args[0]).to.deep.include(offMessage, 'Sent same value if not changes only');

        inNodeHandler.config.eventTypesAll = false;
        inNodeHandler.config.eventTypes = ['updated'];
        node.send.resetHistory();
        inNodeHandler._processEvent(offMessage);
        expect(node.send.notCalled, 'send not called when event type does not match').to.be.true;

        eventBus.unsubscribe.resetHistory();
        inNodeHandler.cleanup();
        expect(eventBus.unsubscribe.calledOnce, 'unsubscribe called once').to.be.true;
    });

    it('should not setup logic if error is set', async function () {
        const node = {
            status: sinon.spy(),
            send: sinon.spy(),
            on: sinon.spy(),
            off: sinon.spy(),
            log: sinon.spy(),
            error: sinon.spy(),
        };
        const config = { concept: 'items' };

        // force an error by having no controller
        const inNodeHandler = new InNodeHandler(node, config, null, { generateTime: () => '12:34:56' });
        inNodeHandler.setupNode();
        expect(node.on.callCount, 'Only on setup and close called (no input channel)').to.equal(2);
        expect(node.status.getCall(0).args[0]).to.deep.equal(
            { fill: 'grey', shape: 'ring', text: '[12:34:56] initializing...' },
            'node.status called with initializing'
        );
        expect(node.status.getCall(1).args[0]).to.deep.equal(
            { fill: 'red', shape: 'ring', text: '[12:34:56] no controller' },
            'node.status called with no controller'
        );
        expect(inNodeHandler.cleanup(), 'Cleanup should succeed').to.not.throw;
        expect(node.off.callCount, 'No off called').to.equal(0);
    });

    it('should call node.error if no resource is specified', function () {
        const node = {
            status: sinon.spy(),
            send: sinon.spy(),
            on: sinon.spy(),
            off: sinon.spy(),
            log: sinon.spy(),
            error: sinon.spy(),
            context: () => ({ get: sinon.stub(), set: sinon.stub() }),
        };
        const eventBus = { subscribe: sinon.spy(), unsubscribe: sinon.spy() };
        const controller = { handler: { eventBus } };
        const config = { concept: 'items' }; // no identifier

        const inNodeHandler = new InNodeHandler(node, config, controller, { generateTime: () => '12:34:56' });
        inNodeHandler.setupNode();

        expect(node.status.getCall(2).args[0]).to.deep.equal(
            { fill: 'red', shape: 'ring', text: '[12:34:56] no resource specified' },
            'error status set'
        );
        expect(node.error.calledOnce, 'node.error called').to.be.false;
    });

    it('should filter events accurately', async function () {
        const node = { status: sinon.spy(), send: sinon.spy(), on: sinon.spy(), off: sinon.spy(), log: sinon.spy() };
        const config = { concept: 'items', eventTypes: ['updated', 'command'], eventTypesAll: false };
        const inNodeHandler = new InNodeHandler(node, config, null, { generateTime: () => '12:34:56' });
        expect(inNodeHandler._matchesEvent('state')).to.be.false;

        inNodeHandler.config.eventTypes = ['updated'];
        expect(inNodeHandler._matchesEvent('updated')).to.be.true;

        inNodeHandler.config.eventTypes = ['updated'];
        inNodeHandler.config.eventTypesAll = true;
        expect(inNodeHandler._matchesEvent('bogus')).to.be.true;

        inNodeHandler.config.eventTypes = ['state'];
        inNodeHandler.config.eventTypesAll = false;
        expect(inNodeHandler._matchesEvent('status')).to.be.true;

        inNodeHandler.config.eventTypes = ['status'];
        expect(inNodeHandler._matchesEvent('state')).to.be.false;

        inNodeHandler.config.eventTypes = ['changed'];
        expect(inNodeHandler._matchesEvent('statechanged')).to.be.true;
    });

    it('should normalize event types accurately', async function () {
        const inNodeHandler = new InNodeHandler({}, { concept: 'items' }, null, { generateTime: () => '12:34:56' });
        expect(inNodeHandler._normalizeEventTypes(['state'])).to.deep.equal(['state']);
        expect(inNodeHandler._normalizeEventTypes('["state"]')).to.deep.equal(['state']);
        expect(inNodeHandler._normalizeEventTypes('')).to.deep.equal([]);
        expect(inNodeHandler._normalizeEventTypes(1)).to.deep.equal([]);
    });
});
