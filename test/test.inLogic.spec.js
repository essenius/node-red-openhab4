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
const inLogicPath = path.join(__dirname, '..', 'lib', 'inLogic.js');
const { InNode } = require(inLogicPath);

describe("inLogic", function () {

    it("should setup the right handlers and send the right messages", async function () {
        const contextStore = {};
        const node = {
            error: sinon.spy(), status: sinon.spy(), send: sinon.spy(), on: sinon.spy(),
            context: () => ({
                set: (key, value) => { contextStore[key] = value; },
                get: (key) => contextStore[key]
            })
        };
        const config = { itemname: "testItem" };

        const controller = {
            on: sinon.spy(),
            off: sinon.spy()
        };
        const inNode = new InNode(node, config, controller, { generateId: () => "123", generateTime: () => "12:34:56" });

        expect(inNode.itemName).to.equal("testItem", "itemName is set correctly");
        expect(inNode._stateEventName).to.be.null;
        expect(inNode._rawEventName).to.be.null;
        expect(inNode.getNodeType(), "node type is in").to.equal("In");

        inNode.setupNode();
        expect(inNode._processStateEvent, "_processStateEvent is a function").to.be.a("function");
        expect(inNode._processRawEvent, "_processRawEvent is a function").to.be.a("function");
        expect(controller.on.callCount, "controller.on called 4 times").to.equal(4);
        expect(inNode._stateEventName, "_stateEventName is set").to.equal("testItem/StateEvent");
        expect(inNode._rawEventName, "_rawEventName is set").to.equal("testItem/RawEvent");

        inNode._processStateEvent({ state: "ON" });

        var sendArgs = node.send.getCall(0).args[0]; // The array passed to node.send
        expect(sendArgs[0], "First channel provides the status").to.include({ payload: 'ON', event: 'StateEvent' });
        expect(sendArgs[1], "Second channel is null").to.be.null;

        node.send.resetHistory();

        inNode._processStateEvent({ state: "ON" });
        expect(node.send.notCalled, "send not called again").to.be.true;

        inNode._processStateEvent({ state: "OFF" });
        sendArgs = node.send.getCall(0).args[0];
        expect(sendArgs[0], "First channel provides the status").to.include({ payload: 'OFF', event: 'StateEvent' });
        expect(sendArgs[1], "Second channel is null").to.be.null;

        for (let i = 1; i < 3; i++) {
            node.send.resetHistory();
            inNode._processRawEvent({ payload: "rawEvent1" });
            sendArgs = node.send.getCall(0).args[0];
            expect(sendArgs[0], `First channel is null for #${i}`).to.be.null;
            expect(sendArgs[1], `Second channel has the raw event for ${i}`).to.deep.include({ payload: { payload: 'rawEvent1' }, event: 'RawEvent', item: 'testItem' });
        }

        inNode.cleanup();
        expect(controller.off.callCount, "controller.off called 3 times").to.equal(2);
    });


    it("should not setup logic if error is set", async function () {
        const node = { error: sinon.spy(), status: sinon.spy(), send: sinon.spy(), on: sinon.spy() };
        const config = {};

        // force an error by having no controller
        const inNode = new InNode(node, config, null, { generateTime: () => "12:34:56" });
        inNode.setupNode();
        expect(node.error.calledWith("No controller configured. Please select an openHAB controller in the node configuration."), "node.error called once").to.be.true;
        console.log("node.status.args", node.status.args);
        expect(node.status.calledWith({ fill: "red", shape: "ring", text: "no controller @ 12:34:56" }), "node.status called with no controller").to.be.true;
        expect(inNode._stateEventName, "_stateEventName is not set").to.be.null;
        expect(inNode._rawEventName, "_rawEventName is not set").to.be.null;
        expect(inNode.cleanup(), "Cleanup should succeed").to.not.throw;
    });
});