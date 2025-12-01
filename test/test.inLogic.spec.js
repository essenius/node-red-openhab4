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

const path = require('node:path');
const { expect } = require("chai");
const sinon = require("sinon");
const inLogicPath = path.join(__dirname, '..', 'lib', 'inLogic.js');
const { InNodeHandler } = require(inLogicPath);

describe("inLogic", function () {

    it("should setup the right handlers and send the right messages", async function () {
        const contextStore = {};
        const node = {
            type: "openhab4-in",
            error: sinon.spy(), 
            status: sinon.spy(), 
            send: sinon.spy(), 
            on: sinon.spy(),
            off: sinon.spy(),
            context: () => ({
                set: (key, value) => { contextStore[key] = value; },
                get: (key) => contextStore[key]
            })
        };
        const config = { itemname: "testItem" };

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

        const inNodeHandler = new InNodeHandler(node, config, controller, { generateId: () => "123", generateTime: () => "12:34:56" });

        expect(inNodeHandler.itemName).to.equal("testItem", "itemName is set correctly");
        expect(inNodeHandler.itemTag).to.equal("items/testItem", "itemTag is correct")
        expect(inNodeHandler.getNodeType(), "node type is in").to.equal("In");

        inNodeHandler.setupNode();

        // node.on called for ConnectionStatus, NodeError, close and items/TestItem (no input)
        expect(node.on.callCount, "node.on called 4 times").to.equal(4);

        inNodeHandler._processEvent({ name: "testItem", type: "StateEvent", payload: { value: "ON" }});
        expect(node.send.firstCall.args[0]).to.deep.include({ payload: 'ON', topic: 'StateEvent', name: "testItem", item: "testItem" }, "First incoming message sent out");

        node.send.resetHistory();
        inNodeHandler._processEvent({ name: "testItem", type: "StateEvent", payload: { value: "ON", type: "OnOff" }});
        expect(node.send.called, "send not called again when payload not changed (despite type is now sent too)").to.be.false;

        inNodeHandler._processEvent({ name: "testItem", type: "StateEvent", payload: { value: "OFF", type: "OnOff" }});
        expect(node.send.firstCall.args[0]).to.deep.include({ payload: 'OFF', topic: 'StateEvent', name: "testItem", item: "testItem", type: "OnOff" }, "Message with different value does get sent");

        inNodeHandler.cleanup();
        expect(node.off.calledOnce, "node.off called once").to.be.true;
    });


    it("should not setup logic if error is set", async function () {
        const node = { status: sinon.spy(), send: sinon.spy(), on: sinon.spy(), off: sinon.spy() };
        const config = {};

        // force an error by having no controller
        const inNodeHandler = new InNodeHandler(node, config, null, { generateTime: () => "12:34:56" });
        inNodeHandler.setupNode();
        expect(node.on.callCount, "Only on close called (no input channel)").to.equal(1);
        expect(node.status.getCall(0).args[0]).to.deep.equal({ fill: "grey", shape: "ring", text: "initializing... @ 12:34:56" }, "node.status called with initializing");
        expect(node.status.getCall(1).args[0]).to.deep.equal({ fill: "red", shape: "ring", text: "no controller @ 12:34:56" }, "node.status called with no controller");
        expect(inNodeHandler.cleanup(), "Cleanup should succeed").to.not.throw;
        expect(node.off.callCount, "No off called").to.equal(0);
    });
});