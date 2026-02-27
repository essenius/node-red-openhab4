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

const helper = require('node-red-node-test-helper');
const { expect } = require('chai');
const { EVENT_TYPES, SWITCH_STATUS } = require('../lib/constants.js');
const { EventBus } = require('../lib/eventBus.js');

const eventsModule = require('../nodes/events.js');

const eventBus = new EventBus();

// Enhanced mock controller node
const controllerNode = function (RED) {
    function ControllerNode(config) {
        RED.nodes.createNode(this, config);
        this.handler = {
            eventBus: eventBus,
        };
    }

    RED.nodes.registerType('openhab4-controller', ControllerNode);
};

describe('openhab4-events integration', function () {
    before(function (done) {
        helper.startServer(done);
    });
    after(function (done) {
        helper.stopServer(done);
    });
    afterEach(function () {
        return helper.unload();
    });

    it('should send a message when an item is published', function (done) {
        const flow = [
            { id: 'controller1', type: 'openhab4-controller', name: 'Test Controller' },
            {
                id: 'events1',
                type: 'openhab4-events',
                controller: 'controller1',
                wires: [['helper1']],
                filter: 'items/*',
            },
            { id: 'helper1', type: 'helper' },
        ];

        helper.load([controllerNode, eventsModule], flow, function () {
            const helperNode = helper.getNode('helper1');
            const controller = helper.getNode('controller1');
            helperNode.on('input', function (msg) {
                try {
                    expect(msg.payload).to.equal(SWITCH_STATUS.OFF, 'payload OK');
                    expect(msg.type).to.equal(EVENT_TYPES.ITEM_STATE, 'type OK');
                    expect(msg.topic).to.equal('test1', 'topic OK');
                    expect(msg._msgid, '_msgid added').to.exist;
                    done();
                } catch (err) {
                    done(err);
                }
            });

            controller.handler.eventBus.publish('items/test1', {
                payload: SWITCH_STATUS.OFF,
                topic: 'test1',
                type: EVENT_TYPES.ITEM_STATE,
            });
        });
    });
});
