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

        ({ setupControllerNode } = proxyquire("../lib/controllerLogic", {
            "./openhabConnection": { OpenhabConnection: OpenhabConnectionStub },
            "./statusUtils": { addStatusMethods: sinon.stub() }
        }));

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
                console.log("Message:", msg);
                if (msg && msg.includes("Waiting for openHAB: Timeout")) {
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

        expect(errorMessage).to.include("Waiting for openHAB: Timeout", "Error message should indicate timeout");
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
        let result = await node.control("Item1", "command", "OFF");
        expect(result).to.equal("ok", "Result of control command should be 'ok'");

        // now a command that should give an error

        result = await node.control("Item1", "error", "OFF");
        expect(result).to.be.instanceOf(Error, "Result of control command with error should be an Error instance");
        expect(result.message).to.equal("Simulated error", "Error message should match simulated error");
    });

    it("should handle error in getItems appropriately", async function () {
        const setTimeoutStub = sinon.stub(global, "setTimeout").returns(42);
        const clearTimeoutStub = sinon.stub(global, "clearTimeout");

        try {
            const errorGetItemsStub = sinon.stub().rejects(new Error("Failed to fetch items"));
            setupOpenhabConnectionWithGetItems(errorGetItemsStub);

            setupControllerNode(node, config, { maxAttempts: 1, interval: 0 });

            // Wait for async code to run
            await new Promise(resolve => setImmediate(resolve));

            await runEventSourceOnOpenCallback();

            /// call the close handler
            expect(node.on.calledOnce).to.be.true;
            expect(node.on.getCall(0).args[0]).to.equal("close");
            node.on.getCall(0).args[1](false, () => { });

            expect(errorGetItemsStub.calledOnce, "GetItems called").to.be.true;
            expect(node.error.calledWithMatch("Failed to fetch items"), "node error").to.be.true;
            expect(node.emit.calledWithMatch("CommunicationError"), "CommunicationError emitted").to.be.true;
            expect(node.emit.calledWithMatch("CommunicationStatus"), "CommunicationStatus emitted").to.be.true;
            expect(setTimeoutStub.calledOnce).to.be.true; // retry should be scheduled
            expect(clearTimeoutStub.calledOnce).to.be.true; // retry timer should be cleared (in close handler)
        } finally {
            setTimeoutStub.restore();
            clearTimeoutStub.restore();
        }
    });

    describe("Message handling tests", function () {

        function simulateEventSourceMessage(message) {
            const args = startEventSourceStub.getCall(0).args[0];
            args.onMessage(message);
        }

        beforeEach(async function () {
            setupControllerNode(node, config, { maxAttempts: 1, interval: 0 });
            await new Promise(resolve => setImmediate(resolve));
            node.emit.resetHistory(); // remove the communication events
            this.startEventSourceArgs = startEventSourceStub.getCall(0).args[0];
        });

        this.afterEach(function () {
            // call the close handler
            if (node.on.callCount > 0) {
                expect(node.on.getCall(0).args[0]).to.equal("close", "First on handler should be 'close'");
                node.on.getCall(0).args[1](false, () => { });
            }
        });

        it("should emit correct events for a valid ItemStateEvent", function () {
            const message = {
                data: JSON.stringify({
                    type: "ItemStateEvent",
                    topic: "openhab/items/Item1/StateEvent",
                    payload: JSON.stringify({ value: 'ON' })
                })
            };
            simulateEventSourceMessage(message);
            expect(node.emit.calledWith("Item1/RawEvent", sinon.match.has("type", "ItemStateEvent"))).to.be.true;
            expect(node.emit.calledWith("RawEvent", sinon.match.has("topic", "openhab/items/Item1/StateEvent"))).to.be.true;
            expect(node.emit.calledWith("Item1/StateEvent", { type: 'ItemStateEvent', state: 'ON' })).to.be.true;
        });

        it("should not emit empty message", function () {
            simulateEventSourceMessage(JSON.stringify({}));
            console.log(node.emit.getCalls().map(call => call.args));
            expect(node.emit.callCount).to.equal(0);
        });

        it("should raise an error and emit an error for invalid JSON", function () {
            simulateEventSourceMessage({ data: "This is not a valid JSON string" });
            expect(node.error.calledWithMatch("Parsing event: Unexpected token"), "error called with right message").to.be.true;

            expect(node.emit.calledWithMatch(
                "CommunicationError",
                sinon.match((val) => val.startsWith("Parsing event: Unexpected token"))
            ), "CommunicationError emitted").to.be.true;
        });

        [
            {
                desc: "numeric payloads",
                payload: 25,
                expectedPayload: 25,
            },
            {
                desc: "numeric payloads in string",
                payload: "25",
                expectedPayload: 25,
            },
            {
                desc: "non-object payloads",
                payload: "foo",
                expectedPayload: "foo",
                expectedWarning: "Could not parse string payload as JSON: foo"
            }
        ].forEach(({ desc, payload, expectedPayload, expectedWarning }) => {
            it(`should emit RawEvents for ${desc}`, function () {
                const message = {
                    data: JSON.stringify({
                        type: "RawEvent",
                        topic: "openhab/items/Item1/StateEvent",
                        payload: payload
                    })
                };
                simulateEventSourceMessage(message);
                expect(node.emit.callCount).to.equal(2, `Two events should be emitted for ${desc} (RawEvent and Item1/RawEvent)`);
                expect(node.emit.calledWith("Item1/RawEvent", sinon.match.has("payload", expectedPayload)), `Item1/RawEvent for ${desc}`).to.be.true;
                expect(node.emit.calledWith("RawEvent", sinon.match.has("payload", expectedPayload)), `RawEvent for ${desc}`).to.be.true;

                if (expectedWarning) {
                    expect(node.warn.calledWithMatch(expectedWarning), `Warning logged for ${desc}`).to.be.true;
                } else {
                    expect(node.warn.callCount).to.equal(0, `No warning logged for ${desc}`);
                }
                expect(node.error.callCount).to.equal(0, `No error should be logged for ${desc}`);
            });
        });

        it("should not emit events after node is closed", function () {
            // Simulate node being closed
            node._closed = true;
            simulateEventSourceMessage({
                data: JSON.stringify({
                    type: "ItemStateEvent",
                    topic: "openhab/items/Item1/StateEvent",
                    payload: JSON.stringify({ value: 'ON' })
                })
            });
            expect(node.emit.callCount).to.equal(0, "No events should be emitted after node is closed");
            expect(node.warn.callCount).to.equal(0, "No warnings should be logged after node is closed");
            expect(node.error.callCount).to.equal(0, "No errors should be logged after node is closed");
        });
    });
});