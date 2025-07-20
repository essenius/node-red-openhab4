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
const healthLogicPath = path.join(__dirname, '..', 'lib', 'healthLogic.js');
const { HealthNode } = require(healthLogicPath);

describe("healthLogic", function () {

    it("should setup the right handlers and send the right messages", async function () {
        const node = { error: sinon.spy(), status: sinon.spy(), send: sinon.spy(), on: sinon.spy() };
        const config = {};

        const eventHandlers = {};
        const controller = {
            on: sinon.spy((event, handler) => { eventHandlers[event] = handler; }),
            off: sinon.spy()
        };
        const healthNode = new HealthNode(node, config, controller, { generateId: () => "123" });
        expect(healthNode.getNodeType(), "node type is health").to.equal("Health");

        expect(healthNode._lastStatus, "last status is null").to.be.null;

        healthNode.setupNode();

        expect(healthNode._onConnectionStatus, "_onConnectionStatus is a function").to.be.a("function");
        expect(healthNode._onConnectionError, "_onConnectionError is a function").to.be.a("function");
        expect(controller.on.callCount, "controller.on called 5 times").to.equal(5);

        healthNode._onConnectionStatus("ON");

        var sendArgs = node.send.getCall(0).args[0]; // The array passed to node.send
        expect(sendArgs[0], "First channel provides the status").to.include({ payload: 'ON', event: 'ConnectionStatus' }); 
        expect(sendArgs[1], "Second channel is null").to.be.null;
        expect(sendArgs[2], "Third channel is null").to.be.null; 
        node.send.resetHistory();
        healthNode._onConnectionStatus("ON");
        expect(node.send.notCalled, "send not called again").to.be.true;

        healthNode._onConnectionError("Connection error");
        sendArgs = node.send.getCall(0).args[0];
        expect(sendArgs[0], "First channel is null").to.be.null; 
        expect(sendArgs[1], "Second channel has the error message").to.include({ payload: 'Connection error', event: 'ConnectionError' });
        expect(sendArgs[2], "Third channel is null").to.be.null; 

        node.send.resetHistory();
        healthNode._onRawEvent("rawEvent1");
        sendArgs = node.send.getCall(0).args[0]; 
        expect(sendArgs[0], "First channel is null").to.be.null; 
        expect(sendArgs[1], "Second channel is null").to.be.null; 
        expect(sendArgs[2], "Third channel has the raw event").to.include({ payload: "rawEvent1", event: 'RawEvent' });
        
        healthNode.cleanup();
        expect(controller.off.callCount, "controller.off called 3 times").to.equal(3);
        expect(healthNode._lastStatus, "_lastStatus is null after cleanup").to.be.null;
    });

    
    it("should not setup logic if error is set", async function () {
        const node = { error: sinon.spy(), status: sinon.spy(), send: sinon.spy(), on: sinon.spy() };
        const config = {};

        // force an error by having no controller
        const healthNode = new HealthNode(node, config, null);
        healthNode.setupNode();

        const sendArgs = node.send.getCall(0).args[0]; // The array passed to node.send
        expect(sendArgs[0], "First channel is null").to.be.null; 
        expect(sendArgs[1], "Second channel has the error message").to.include({ payload: 'No controller configured', event: 'ConnectionError' });
        expect(sendArgs[2], "Third channel is null").to.be.null; 
        // the configuration has not completed, so the _onConnectionStatus should not be set
        expect(healthNode._onConnectionStatus, "_onConnectionStatus is not defined").to.be.undefined;
    });
});