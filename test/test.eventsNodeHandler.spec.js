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

const path = require('node:path');
const { expect } = require('chai');
const sinon = require('sinon');
const eventsLogicPath = path.join(__dirname, '..', 'lib', 'eventsNodeHandler.js');
const { EventsNodeHandler } = require(eventsLogicPath);

describe("eventsNodeHandler", function () {

    it("should setup the right handler and send the right messages", async function () {

        const node = {
            type: "openhab4-events",
            status: sinon.spy(), 
            send: sinon.spy(), 
            on: sinon.spy(),
            off: sinon.spy(),
            log: sinon.spy(),
        };
        const config = { filter: "items/*" };

        const eventBus = {
            publish: sinon.spy(),
            subscribe: sinon.spy(),
            unsubscribe: sinon.spy()
        };

        const handler = {
            eventBus: eventBus
        };

        const controller = {
            handler: handler,
            on: sinon.spy(),
            off: sinon.spy()
        };

        // Setup and validate handler
        const eventsNodeHandler = new EventsNodeHandler(node, config, controller, { generateTime: () => "12:34:56" });
        expect(eventsNodeHandler.getNodeType(), "node type is events").to.equal("Events");
        eventsNodeHandler.setupNode();
        
        // validate subscriptions are correct
        const subscribe = eventBus.subscribe;
        expect(subscribe.callCount, "subscribe called 3 times").to.equal(2);
        expect(subscribe.calledWith('items/*', eventsNodeHandler._processIncomingEvent),"Subscribed to items/*").to.be.true;

        // bypass pub/sub as that is mocked, send message straight to the callback

        const message = {topic: "openhab/items/ub_warning/state",  payload: { type: "String", value: "testValue" }, type: "ItemStateEvent" };
        eventsNodeHandler._processIncomingEvent(message);

        // check tha the node sends out the message.
        expect(node.send.getCall(0).args[0], "Right message sent").to.deep.include(message); 
        eventsNodeHandler.cleanup();
        expect(eventBus.unsubscribe.callCount, "unsubscribe called once").to.equal(1);
    });

    it("should not setup an event handler if error is set", async function () {
        const node = { status: sinon.spy(), send: sinon.spy(), on: sinon.spy(), log: sinon.spy() };
        const config = {};

        // force an error by having no controller
        const eventsNodeHandler = new EventsNodeHandler(node, config, null, { generateTime: () => "12:34:56" });
        expect(eventsNodeHandler.setupNode(), "setting up without controller should not throw").to.not.throw;
        expect(node.on.callCount, "on called once (only 'close')").to.equal(1);

        expect(node.status.getCall(0).args[0], "Initializing status called").to.deep.equal({ fill: 'grey', shape: 'ring', text: 'initializing... @ 12:34:56' });
        expect(node.status.getCall(1).args[0], "Error status called").to.deep.equal({ fill: 'red', shape: 'ring', text: 'no controller @ 12:34:56' });

        expect(eventsNodeHandler.cleanup(), "Cleanup should succeed despite having no eventBus").to.not.throw;
    });
});