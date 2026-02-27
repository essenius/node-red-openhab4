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
const { EVENT_TYPES, SWITCH_STATUS } = require('../lib/constants');

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
        const config = { concept: 'items', identifier: 'testItem', changesOnly: true };

        const eventBus = {
            publish: sinon.spy(),
            subscribe: sinon.spy(),
            unsubscribe: sinon.spy(),
        };

        const handler = { eventBus: eventBus };

        const controller = {
            handler: handler,
            on: sinon.spy(),
            off: sinon.spy(),
        };

        const inNodeHandler = new InNodeHandler(node, config, controller, {
            generateId: () => '123',
            generateTime: () => '12:34:56',
        });

        expect(inNodeHandler.identifier).to.equal('testItem', 'identifier is set correctly');
        expect(inNodeHandler.resourceTag).to.equal('items/testItem', 'resourceTag is correct');
        expect(inNodeHandler.getNodeType(), 'node type is in').to.equal('In');

        inNodeHandler.setupNode();

        // node.on called for close
        expect(node.on.calledOnce, 'node.on called once').to.be.true;
        // subscribe called for ConnectionStatus, NodeError, items/TestItem (no input)
        expect(eventBus.subscribe.callCount).to.equal(2, 'Subscribe called 3 times');

        inNodeHandler._processEvent({
            topic: 'items/testItem',
            eventType: EVENT_TYPES.ITEM_STATE,
            payload: SWITCH_STATUS.ON,
        });
        expect(node.send.firstCall.args[0]).to.deep.include(
            { payload: SWITCH_STATUS.ON, eventType: EVENT_TYPES.ITEM_STATE, topic: 'items/testItem' },
            'First incoming message sent out'
        );

        node.send.resetHistory();
        inNodeHandler._processEvent({
            topic: 'items/testItem',
            eventType: EVENT_TYPES.ITEM_STATE,
            payload: SWITCH_STATUS.ON,
            payloadType: 'OnOff',
        });
        expect(node.send.notCalled, 'send not called again when payload not changed (despite type is now sent too)').to
            .be.true;

        inNodeHandler._processEvent({
            topic: 'items/testItem',
            eventType: EVENT_TYPES.ITEM_STATE,
            payload: SWITCH_STATUS.OFF,
            payloadType: 'OnOff',
        });
        expect(node.send.firstCall.args[0]).to.deep.include(
            {
                payload: SWITCH_STATUS.OFF,
                payloadType: 'OnOff',
                eventType: EVENT_TYPES.ITEM_STATE,
                topic: 'items/testItem',
            },
            'Message with different value does get sent'
        );

        node.send.resetHistory();
        inNodeHandler.config.changesOnly = false;
        inNodeHandler._processEvent({
            topic: 'items/testItem',
            eventType: EVENT_TYPES.ITEM_STATE,
            payload: SWITCH_STATUS.OFF,
            payloadType: 'OnOff',
        });
        expect(node.send.firstCall.args[0]).to.deep.include(
            {
                payload: SWITCH_STATUS.OFF,
                eventType: EVENT_TYPES.ITEM_STATE,
                topic: 'items/testItem',
                payloadType: 'OnOff',
            },
            'Send called again on same payload if changes only is false'
        );

        eventBus.unsubscribe.resetHistory();
        inNodeHandler.cleanup();
        expect(eventBus.unsubscribe.calledOnce, 'unsubscribe called once').to.be.true;
    });

    it('should not setup logic if error is set', async function () {
        const node = { status: sinon.spy(), send: sinon.spy(), on: sinon.spy(), off: sinon.spy(), log: sinon.spy() };
        const config = { concept: 'items' };

        // force an error by having no controller
        const inNodeHandler = new InNodeHandler(node, config, null, { generateTime: () => '12:34:56' });
        inNodeHandler.setupNode();
        expect(node.on.callCount, 'Only on close called (no input channel)').to.equal(1);
        expect(node.status.getCall(0).args[0]).to.deep.equal(
            { fill: 'grey', shape: 'ring', text: 'initializing... @ 12:34:56' },
            'node.status called with initializing'
        );
        expect(node.status.getCall(1).args[0]).to.deep.equal(
            { fill: 'red', shape: 'ring', text: 'no controller @ 12:34:56' },
            'node.status called with no controller'
        );
        expect(inNodeHandler.cleanup(), 'Cleanup should succeed').to.not.throw;
        expect(node.off.callCount, 'No off called').to.equal(0);
    });
});
