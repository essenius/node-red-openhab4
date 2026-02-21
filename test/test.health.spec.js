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

"use strict";

const helper = require('node-red-node-test-helper');
const healthNode = require('../nodes/health.js');
const { expect } = require('chai');
const { EVENT_TAGS, SWITCH_STATUS } = require('../lib/constants.js');
const { EventBus } = require('../lib/eventBus.js');

const eventBus = new EventBus();

const controllerNode = function (RED) {
  function ControllerNode(config) {
    RED.nodes.createNode(this, config);
    this.handler = {
        //control: sinon.spy((_itemName, _topic, _payload) => { return "OK"; }),
        eventBus: eventBus,
    };
  }

  RED.nodes.registerType("openhab4-controller", ControllerNode);
};

describe("openhab4-health node", function () {
    before(function (done) { helper.startServer(done); });
    after(function (done) { helper.stopServer(done); });
    afterEach(function () { return helper.unload(); });

    it("should send a message on the first output when a connection status event is published", function (done) {

        const flow = [
            { id: "controller1", type: "openhab4-controller", name: "Test Controller" },
            { id: "health1", type: "openhab4-health", controller: "controller1", wires: [["helper1"], []] },
            { id: "helper1", type: "helper" }
        ];

        helper.load([controllerNode, healthNode], flow, function () {
            const controller = helper.getNode("controller1");
            const helperNode = helper.getNode("helper1");

            helperNode.on("input", function (msg) {
                try {
                    expect(msg).to.have.property("payload", SWITCH_STATUS.OFF);
                    expect(msg).to.have.property("topic", EVENT_TAGS.CONNECTION_STATUS);
                    done();
                } catch (err) {
                    done(err);
                }
            });

            controller.handler.eventBus.publish(EVENT_TAGS.CONNECTION_STATUS, SWITCH_STATUS.OFF);
        });
    });
});