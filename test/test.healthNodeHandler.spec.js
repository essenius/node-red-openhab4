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
const { HealthNodeHandler } = require('../lib/healthNodeHandler');
const { STATE } = require('../lib/constants');

describe('healthNodeHandler', function () {
    it('should setup the right handlers and send the right messages', async function () {
        const node = {
            type: 'openhab4-health',
            status: sinon.spy(),
            send: sinon.spy(),
            on: sinon.spy(),
            off: sinon.spy(),
            log: sinon.spy(),
        };
        const config = {};

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

        const healthNodeHandler = new HealthNodeHandler(node, config, controller, {
            generateId: () => '123',
            generateTime: () => '12:34:56',
        });

        expect(healthNodeHandler.getNodeType(), 'node type is health').to.equal('Health');
        expect(healthNodeHandler._lastStatus, 'last status is null').to.be.null;

        healthNodeHandler.setupNode();
        expect(healthNodeHandler.node.name).to.equal('openhab4-health', 'node name is set to name of controller');
        expect(node.on.calledOnce, 'node.on called once').to.be.true;
        expect(node.on.firstCall.args[0]).to.equal('close');

        const subscribe = controller.handler.eventBus.subscribe;
        expect(subscribe.callCount, 'subscribe called twice').to.equal(2);
        expect(subscribe.getCall(0).args[0]).to.equal('ConnectionStatus');
        expect(subscribe.getCall(1).args[0]).to.equal('GlobalError');

        // this is called by the parent node when the connection status changes, but we can call it directly to test the logic
        healthNodeHandler._afterConnectionStatus({ payload: 'ON', topic: 'ConnectionStatus' });

        expect(node.send.calledOnce, 'send called once').to.be.true;
        let sendArgs = node.send.getCall(0).args[0];
        expect(sendArgs[0], 'First channel provides the status').to.include({
            payload: 'ON',
            topic: 'ConnectionStatus',
        });

        expect(sendArgs[1], 'Second channel is null').to.be.null;

        expect(node.status.calledTwice, 'status called twice').to.be.true;

        expect(node.status.getCall(0).args[0], 'Initializing status called').to.deep.equal({
            fill: 'grey',
            shape: 'ring',
            text: 'initializing... @ 12:34:56',
        });
        expect(node.status.getCall(1).args[0], 'Status cleared').to.deep.equal({});

        node.send.resetHistory();

        healthNodeHandler._afterConnectionStatus({ payload: 'ON', topic: 'ConnectionStatus' });
        expect(node.send.notCalled, 'send not called again').to.be.true;

        node.status.resetHistory();

        //simulate a typical error sequence
        healthNodeHandler._afterConnectionStatus({ payload: 'OFF', topic: 'ConnectionStatus' });
        healthNodeHandler._onGlobalError({
            context: { state: STATE.ERROR },
            payload: { message: 'connection error', code: 'CONN' },
        });
        sendArgs = node.send.getCall(0).args[0];
        expect(sendArgs[0], 'First channel provides the status').to.include({
            payload: 'OFF',
            topic: 'ConnectionStatus',
        });
        expect(sendArgs[1], 'Second channel is null').to.be.null;

        sendArgs = node.send.getCall(1).args[0];
        expect(sendArgs[0], 'First channel is null').to.be.null;
        expect(sendArgs[1], 'Second channel has the error message').to.deep.include({
            payload: { message: 'connection error', code: 'CONN' },
            topic: 'GlobalError',
        });

        expect(node.status.getCall(0).args[0], 'Status set to error').to.deep.equal({
            fill: 'red',
            shape: 'ring',
            text: 'CONN @ 12:34:56',
        });
        healthNodeHandler.cleanup();
        const unsubscribe = controller.handler.eventBus.unsubscribe;
        expect(unsubscribe.callCount, 'controller.off called once').to.equal(1);
        expect(unsubscribe.getCall(0).args[0]).to.equal('GlobalError');
        expect(healthNodeHandler._lastStatus, '_lastStatus is null after cleanup').to.be.null;
    });

    it('should not setup logic if error is set', async function () {
        const node = {
            type: 'openhab4-health',
            status: sinon.spy(),
            send: sinon.spy(),
            on: sinon.spy(),
            off: sinon.spy(),
            log: sinon.spy(),
        };
        const config = {};

        // force an error by having no controller
        const healthNodeHandler = new HealthNodeHandler(node, config, null, {
            generateId: () => '123',
            generateTime: () => '12:34:56',
        });
        healthNodeHandler.setupNode();

        expect(node.on.callCount, 'One call to on as there is no controller').to.equal(1);
        expect(node.on.firstCall.args[0]).to.equal('close');

        expect(node.name).to.equal('openhab4-health', 'node name is set to default');

        expect(node.status.getCall(0).args[0], 'Initializing status called').to.deep.equal({
            fill: 'grey',
            shape: 'ring',
            text: 'initializing... @ 12:34:56',
        });
        expect(node.status.getCall(1).args[0], 'no controller status called').to.deep.equal({
            fill: 'red',
            shape: 'ring',
            text: 'no controller @ 12:34:56',
        });

        expect(node.send.notCalled, 'Nothing sent out (as no controller, so no eventBus)').to.be.true;
        expect(node.off.notCalled, 'off not called as nothing subscribed to');
    });
});
