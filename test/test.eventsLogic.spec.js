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
const { EventsNodeHandler } = require(eventsLogicPath);

describe("eventsLogic", function () {

    it("should setup the right handler and send the right messages", async function () {

        const node = {
            type: "openhab4-events",
            status: sinon.spy(), 
            send: sinon.spy(), 
            on: sinon.spy(),
            off: sinon.spy(),
        };
        const config = { filter: "items/*" };

        const eventBus = {
            publish: sinon.spy(),
            subscribe: sinon.spy(),
            unsubscribe: sinon.spy()
        }

        const controller = {
            eventBus: eventBus,
            on: sinon.spy(),
            off: sinon.spy()
        };

        const eventsNodeHandler = new EventsNodeHandler(node, config, controller, { generateTime: () => "12:34:56" });
        expect(eventsNodeHandler.getNodeType(), "node type is events").to.equal("Events");
        eventsNodeHandler.setupNode();
        
        expect(node.on.callCount, "node.on called 4 times").to.equal(4);
        expect(node.on.getCall(3).args, "Subscribed to items/*").to.deep.equal([ 'items/*', eventsNodeHandler._processIncomingEvent ]);

        const message = {topic: "openhab/items/ub_warning/state",  payload: { type: "String", value: "testValue" }, type: "ItemStateEvent" }
        eventsNodeHandler._processIncomingEvent(message);
        expect(node.send.getCall(0).args[0], "Right message sent").to.deep.include(message); 
        eventsNodeHandler.cleanup();
        expect(node.off.callCount, "node.off called once").to.equal(1);
    });

    it("should not setup an event handler if error is set", async function () {
        const node = { status: sinon.spy(), send: sinon.spy(), on: sinon.spy() };
        const config = {};

        // force an error by having no controller
        const eventsNodeHandler = new EventsNodeHandler(node, config, null, { generateTime: () => "12:34:56" });
        expect(eventsNodeHandler.setupNode(), "setting up without controller should not throw").to.not.throw;
        expect(node.on.callCount, "on called once (only 'close')").to.equal(1);

        expect(node.status.getCall(0).args[0], "Initializing status called").to.deep.equal({ fill: 'grey', shape: 'ring', text: 'initializing... @ 12:34:56' });
        expect(node.status.getCall(1).args[0], "Error status called").to.deep.equal({ fill: 'red', shape: 'ring', text: 'no controller @ 12:34:56' });

        node.on.resetHistory();
        expect(eventsNodeHandler.cleanup(), "Cleanup should succeed").to.not.throw;
        expect(node.on.callCount, "on not called again (as there is no eventBus").to.equal(0);
    });
});