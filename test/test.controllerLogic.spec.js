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

const { expect } = require("chai");
const sinon = require("sinon");
const proxyquire = require("proxyquire");

describe("controllerLogic.setupControllerNode", function () {
    let setupControllerNode, controlItemStub, startEventSourceStub, testIfLiveStub, OpenhabConnectionStub, node, config;

    function setupOpenhabConnectionWithGetItems(getItemsStub) {
        OpenhabConnectionStub.returns({
            getItems: getItemsStub,
            startEventSource: startEventSourceStub,
            controlItem: controlItemStub,
            close: sinon.stub(),
            testIfLive: testIfLiveStub
        });
    }
    beforeEach(() => {
        controlItemStub = sinon.stub().callsFake(async (itemname, topic, payload) => {
            if (topic === "error") {
                throw new Error("Simulated error");
            }
            return "ok";
        });

        startEventSourceStub = sinon.stub();

        testIfLiveStub = sinon.stub().resolves(true);

        OpenhabConnectionStub = sinon.stub();
        // Stub OpenhabConnection so no real connection is made
        setupOpenhabConnectionWithGetItems(sinon.stub().resolves([{ name: "Item1", state: "ON" }]));

        // Proxyquire to inject the stub
        ({ setupControllerNode } = proxyquire("../lib/controllerLogic", {
            "./openhabConnection": { OpenhabConnection: OpenhabConnectionStub },
            "./statusUtils": { addStatusMethods: sinon.stub() }
        }));

        // Mock node object
        node = {
            _closed: false,
            error: sinon.spy(),
            warn: sinon.spy(),
            log: sinon.spy(),
            setStatusError: sinon.spy(),
            emit: sinon.spy(),
            on: sinon.stub(),
        };

        config = {
            host: "localhost",
            protocol: "http",
            port: 8080
        };
    });

    it("should set error and status if host is missing", function () {
        const badConfig = {};
        setupControllerNode(node, badConfig);
        expect(node.error.calledOnce).to.be.true;
        expect(node.setStatusError.calledWith("config error")).to.be.true;
    });

    it("should log connection info and create OpenhabConnection", function () {
        setupControllerNode(node, config);
        expect(node.log.calledWithMatch("OpenHAB Controller connecting to: http://localhost:8080")).to.be.true;
        expect(OpenhabConnectionStub.calledOnce).to.be.true;
    });

    it("should add getConfig method to node", function () {
        setupControllerNode(node, config);
        expect(node.getConfig).to.be.a("function");
        expect(node.getConfig()).to.equal(config);
    });

    it("should register a close handler that cleans up timers and connection", function () {
        setupControllerNode(node, config);
        // call the close handler (the first call to node.on in setupControllerNode, and args[1] is the close handler)
        node.on.getCall(0).args[1](false, () => { });

        // Should call log, emit, and set connection to null
        expect(node.log.calledWithMatch("CONTROLLER CLOSE EVENT")).to.be.true;
        expect(node.emit.calledWithMatch(sinon.match.string, sinon.match.any)).to.be.true;
    });

    it("should register a close handler when node ends", async function () {
        let closingNode = node;
        closingNode._closed = true; // Simulate node being closed

        // Create a promise that resolves when the log is called with the expected message
        let logPromise = new Promise(resolve => {
            closingNode.log = function (msg) {
                if (msg && msg.includes("Node was closed before openHAB became ready")) {
                    resolve(msg);
                }
            };
        });

        setupControllerNode(closingNode, config);

        // Wait for the log to be called (or timeout after 100ms)
        const logMsg = await Promise.race([
            logPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error("Log not called in time")), 100))
        ]);

        expect(logMsg).to.include("Node was closed before openHAB became ready");
    });

    it("should raise an error (not ready) if openHAB does not become ready in time", async function () {

        // Replace log with a function that resolves a promise when called with the expected message
        let errorPromise = new Promise(resolve => {
            node.error = function (msg) {
                if (msg && msg.includes("openHAB did not become ready in time.")) {
                    resolve(msg);
                }
            };
        });

        // by setting maxAttempts to 0, we simulate that openHAB is not ready (the readiness test isn't executed)
        setupControllerNode(node, config, { maxAttempts: 0, interval: 50 });

        // Wait for the log to be called (or timeout after 100ms)
        const errorMessage = await Promise.race([
            errorPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error("Error not called in time")), 100))
        ]);

        expect(errorMessage).to.include("openHAB did not become ready in time.");
    });

    async function runEventSourceOnOpenCallback() {
        // Manually trigger the onOpen callback
        const startEventSourceArgs = startEventSourceStub.getCall(0).args[0];
        if (startEventSourceArgs && typeof startEventSourceArgs.onOpen === "function") {
            await startEventSourceArgs.onOpen();
        }
        // Wait for getStateOfItems to finish
        await new Promise(resolve => setImmediate(resolve));
    }

    it("should start EventSource and get state of items when openHAB is ready (happy path)", async function () {

        setupControllerNode(node, config, { maxAttempts: 1, interval: 0 });

        // Wait for async code to run
        await new Promise(resolve => setImmediate(resolve));

        // get the items via the onOpen callback
        await runEventSourceOnOpenCallback();

        expect(startEventSourceStub.calledOnce, "EventSource should be started").to.be.true;
        const emitCalls = node.emit.getCalls();

        console.log("Emit calls:", emitCalls.map(call => call.args));
        const stateEventCall = emitCalls.find(call => call.args[0] === "Item1/StateEvent");

        expect(stateEventCall, "Should emit state event for Item1").to.exist;
        expect(stateEventCall.args[1]).to.deep.include({ type: "ItemStateEvent", state: "ON" });

        // call the control function to simulate a control command
        await node.control("Item1", "command", "OFF", (result) => {
            expect(result).to.equal("ok");
        }, (error) => {
            expect.fail("Control command should not fail: " + error);
        });

        // call the control function to simulate a control command
        await node.control("Item1", "error", "OFF", (result) => {
            console.log("Control command succeeded:", result);
        }, (error) => {
            expect(error).to.equal("Simulated error");
        });
    });

    it("should handle error in getItems appropriately", async function () {
        const setTimeoutStub = sinon.stub(global, "setTimeout").returns(42);
        const clearTimeoutStub = sinon.stub(global, "clearTimeout");

        try {

            //const startEventSourceStub = sinon.stub();
            const errorGetItemsStub = sinon.stub().rejects(new Error("Failed to fetch items"));
            setupOpenhabConnectionWithGetItems(errorGetItemsStub);

            setupControllerNode(node, config, { maxAttempts: 1, interval: 0 });

            // Wait for async code to run
            await new Promise(resolve => setImmediate(resolve));

            await  runEventSourceOnOpenCallback();

            /// call the close handler
            expect(node.on.calledOnce).to.be.true;
            expect(node.on.getCall(0).args[0]).to.equal("close");
            node.on.getCall(0).args[1](false, () => { });

            expect(errorGetItemsStub.calledOnce).to.be.true;
            expect(node.warn.calledWithMatch("Error getting item states")).to.be.true;
            expect(node.emit.calledWithMatch("CommunicationError")).to.be.true;
            expect(node.emit.calledWithMatch("CommunicationStatus")).to.be.true;
            expect(setTimeoutStub.calledOnce).to.be.true; // retry should be scheduled
            expect(clearTimeoutStub.calledOnce).to.be.true; // retry timer should be cleared (in close handler)
        } finally {
            setTimeoutStub.restore();
            clearTimeoutStub.restore();
        }
    });


    function simulateEventSourceMessage(message) {
        const args = startEventSourceStub.getCall(0).args[0];
        args.onMessage(message);
    }

    function resetNodeSpies() {
        node.warn.resetHistory();
        node.emit.resetHistory();
        node.error.resetHistory();
    }

    it("should emit the correct event and payload when startEventSource.onMessage is called", async function () {

        setupControllerNode(node, config, { maxAttempts: 1, interval: 0 });

        // Wait for async code to run
        await new Promise(resolve => setImmediate(resolve));

        // Get the onMessage handler passed to startEventSource

        const startEventSourceArgs = startEventSourceStub.getCall(0).args[0];
        expect(startEventSourceArgs).to.have.property("onMessage").that.is.a("function", "onMessage should be a function");

        // Simulate a valid incoming message
        const message = {
            data: JSON.stringify({
                type: "ItemStateEvent",
                topic: "openhab/items/Item1/StateEvent",
                payload: JSON.stringify({ value: 'ON' })
            })
        };
        simulateEventSourceMessage(message);

        console.log("Event source calls:", node.emit.getCalls().map(call => call.args));
        // Assert: node.emit should be called with the correct arguments
        expect(node.emit.calledWith("Item1/RawEvent", sinon.match.has("type", "ItemStateEvent")), "Item/RawEvent").to.be.true;
        expect(node.emit.calledWith("RawEvent", sinon.match.has("topic", "openhab/items/Item1/StateEvent")), "RawEvent").to.be.true;
        expect(node.emit.calledWith("Item1/StateEvent", { type: 'ItemStateEvent', state: 'ON' }), "StateEvent").to.be.true;

        // check if empty message is handled correctly
        const emptyMessage = JSON.stringify({});

        resetNodeSpies();

        simulateEventSourceMessage(emptyMessage);
        expect(node.warn.calledWithMatch("Received empty event data, ignoring"), "Ignored empty").to.be.true;
        expect(node.emit.callCount).to.equal(0, "No events should be emitted for empty message", "Emit callcount for empty message");

        // check if invalid message is handled correctly
        const wrongMessage = {
            data: "This is not a valid JSON string"
        };
        simulateEventSourceMessage(wrongMessage);

        expect(node.error.calledWithMatch("Error parsing event data"), "Error on parse error").to.be.true;
        expect(node.emit.callCount).to.equal(0, "No events should be emitted for invalid message", "Emit callcount for invalid message");

        resetNodeSpies();

        // note the use of RawEvent. For state events, we need msg.payload.value, so then payload should always be (parsable as) an object
        const numericPayloadMessage = {
            data: JSON.stringify({
                type: "RawEvent",
                topic: "openhab/items/Item1/StateEvent",
                payload: 25
            })
        };
        simulateEventSourceMessage(numericPayloadMessage);

        expect(node.emit.callCount).to.equal(2, "Two events should be emitted for numeric payload (RawEvent and Item1/RawEvent)");
        expect(node.emit.calledWith("Item1/RawEvent", sinon.match.has("payload", 25)), "Item/RawEvent with numeric payload").to.be.true;
        expect(node.warn.callCount).to.equal(0, "No warnings should be logged for numeric payload");

        resetNodeSpies();

        const numericPayloadInStringMessage = {
            data: JSON.stringify({
                type: "RawEvent",
                topic: "openhab/items/Item1/StateEvent",
                payload: "25"
            })
        };
        startEventSourceArgs.onMessage(numericPayloadInStringMessage);

        expect(node.emit.callCount).to.equal(2, "Two events should be emitted for numeric payload in string");
        expect(node.emit.calledWith("Item1/RawEvent", sinon.match.has("payload", 25)), "Item/RawEvent with stringified numeric payload").to.be.true;
        expect(node.warn.callCount).to.equal(0, "No warnings should be logged for numeric payload");

        resetNodeSpies();

        const wrongPayloadInStringMessage = {
            data: JSON.stringify({
                type: "RawEvent",
                topic: "openhab/items/Item1/StateEvent",
                payload: "foo"
            })
        };
        startEventSourceArgs.onMessage(wrongPayloadInStringMessage);

        expect(node.emit.callCount).to.equal(2, "Non-object payload should be passed on as is");
        expect(node.emit.calledWith("RawEvent", sinon.match.has("payload", "foo")), "RawEvent with string payload").to.be.true;
        expect(node.warn.calledWith("Could not parse string payload as JSON: foo"), "Warning about invalid string payload");

        // Simulate node being closed, which should prevent further processing
        node._closed = true;

        resetNodeSpies();

        startEventSourceArgs.onMessage(message);
        expect(node.emit.callCount).to.equal(0, "No events should be emitted after node is closed", "Emit callcount after close");
        expect(node.warn.callCount).to.equal(0, "No warnings should be logged after node is closed", "Warn callcount after close");
        expect(node.error.callCount).to.equal(0, "No errors should be logged after node is closed", "Error callcount after close");

        // call the close handler
        expect(node.on.getCall(0).args[0]).to.equal("close", "First on handler should be 'close'");
        node.on.getCall(0).args[1](false, () => { });
    });
});