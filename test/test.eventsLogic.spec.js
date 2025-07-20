// Copyright 2025 Rik Essenius
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

const path = require('path');
const { expect } = require("chai");
const sinon = require("sinon");
const eventsLogicPath = path.join(__dirname, '..', 'lib', 'eventsLogic.js');
const { EventsNode } = require(eventsLogicPath);

describe("eventsLogic", function () {

    it("should setup the right handler and send the right messages", async function () {
        const node = { error: sinon.spy(), status: sinon.spy(), send: sinon.spy(), on: sinon.spy() };
        const config = {};

        const eventHandlers = {};
        const controller = {
            on: sinon.spy((event, handler) => { eventHandlers[event] = handler; }),
            off: sinon.spy()
        };
        const eventsNode = new EventsNode(node, config, controller, { generateId: () => "123" });
        expect(eventsNode.getNodeType(), "node type is events").to.equal("Events");
        eventsNode.setupNode();
        expect(controller.on.callCount, "controller.on called 3 times").to.equal(3);

        var message = {topic: "openhab/items/ub_warning/state",  payload: { type: "String", value: "testValue" }, type: "ItemStateEvent" }
        eventsNode._processIncomingEvent(message);
        var sendArgs = node.send.getCall(0).args[0]; // The array passed to node.send
        expect(sendArgs, "Right message sent").to.deep.include(message); 
        
        eventsNode.cleanup();
        expect(controller.off.callCount, "controller.off called once").to.equal(1);
    });

    it("should not setup an event handler if error is set", async function () {
        const node = { error: sinon.spy(), status: sinon.spy(), send: sinon.spy(), on: sinon.spy() };
        const config = {};

        // force an error by having no controller
        const eventsNode = new EventsNode(node, config, null);
        expect(eventsNode.setupNode(), "setting up without controller should not throw").to.not.throw;
        expect(eventsNode.cleanup(), "Cleanup should succeed").to.not.throw;
    });
});