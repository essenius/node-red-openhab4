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

const helper = require('node-red-node-test-helper');
const inNode = require('../nodes/in.js');
const { EventBus } = require('../lib/eventBus.js');
const { expect } = require('chai');

const eventBus = new EventBus();

const controllerNode = function (RED) {
    function ControllerNode(config) {
        RED.nodes.createNode(this, config);
        this.handler = {
            eventBus: eventBus,
        };
    }

    RED.nodes.registerType('openhab4-controller', ControllerNode);
};

describe('openhab4-in node', function () {
    before(function (done) {
        helper.startServer(done);
    });
    after(function (done) {
        helper.stopServer(done);
    });
    afterEach(function () {
        return helper.unload();
    });

    it('should emit a message when an openHAB event is received', function (done) {
        const flow = [
            { id: 'controller1', type: 'openhab4-controller', name: 'Test Controller' },
            {
                id: 'in1',
                type: 'openhab4-in',
                controller: 'controller1',
                concept: 'items',
                identifier: 'TestItem',
                wires: [['helper1']],
            },
            { id: 'helper1', type: 'helper' },
        ];

        helper.load([controllerNode, inNode], flow, function () {
            const helperNode = helper.getNode('helper1');
            const controller = helper.getNode('controller1');

            helperNode.on('input', function (msg) {
                try {
                    expect(msg).to.deep.include(
                        { topic: 'items/TestItem', payload: 'OFF', payloadType: 'OnOff', eventType: 'ItemStateEvent' },
                        'Right message sent'
                    );
                    done();
                } catch (err) {
                    done(err);
                }
            });

            controller.handler.eventBus.publish('items/TestItem', {
                topic: 'items/TestItem',
                payload: 'OFF',
                payloadType: 'OnOff',
                eventType: 'ItemStateEvent',
            });
        });
    });
});
