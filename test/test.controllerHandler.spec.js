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

const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const { ERROR_TYPES, EVENT_TAGS, EVENT_TYPES, SWITCH_STATUS } = require('../lib/constants');
const { EventBus } = require('../lib/eventBus');
const { EventEmitter } = require('node:events');

function createMockNode() {
    const node = new EventEmitter();

    node.log = sinon.spy();
    node.warn = sinon.spy();
    node.error = sinon.spy();
    return node;
}

describe("controllerHandler.setupControllerHandler", function () {
    let controlItemStub, startEventSourceStub, testIfLiveStub, OpenhabConnectionStub, config;
    let bus, mockNode, ControllerHandler, nodeErrorHandlerSpy, globalErrorHandlerSpy, connectionStatusSpy;



    function setupOpenhabConnectionWithGetItems(getItemsResult, callErrorHandler = false) {
        const getItemsStub = sinon.stub().callsFake(async (errorHandler) => {
            if (callErrorHandler && errorHandler) {
                errorHandler(getItemsResult);
            }
            return getItemsResult;
        });

        const fakeConnection = {
            getItems: getItemsStub,
            startEventSource: startEventSourceStub,
            controlItem: controlItemStub,
            close: sinon.stub(),
            testIfLive: testIfLiveStub
        };
        OpenhabConnectionStub.returns(fakeConnection);
        return getItemsStub;
    }

    beforeEach(() => {
        bus = new EventBus();

        nodeErrorHandlerSpy = sinon.spy();
        bus.subscribe(EVENT_TAGS.NODE_ERROR, nodeErrorHandlerSpy);
        globalErrorHandlerSpy = sinon.spy();
        bus.subscribe(EVENT_TAGS.GLOBAL_ERROR, globalErrorHandlerSpy);
        connectionStatusSpy = sinon.spy();
        bus.subscribe(EVENT_TAGS.CONNECTION_STATUS, connectionStatusSpy);

        controlItemStub = sinon.stub().callsFake(async (_itemName, topic, _payload, handler) => {
            if (topic === "error") {
                const result = { ok: false, retry: false, type: ERROR_TYPES.NETWORK, message: "Simulated error" };
                handler(result);
                return result;
            }
            return { ok: true, data: { name: "test", state: SWITCH_STATUS.OFF } };
        });

        startEventSourceStub = sinon.stub();
        testIfLiveStub = sinon.stub().resolves(true);
        OpenhabConnectionStub = sinon.stub();

        // Stub OpenhabConnection so no real connection is made
        setupOpenhabConnectionWithGetItems({ ok: true, data: [{ name: "Item1", state: SWITCH_STATUS.ON }] });

        mockNode = createMockNode();

        delete require.cache[require.resolve("../lib/controllerHandler")];

        ({ ControllerHandler } = proxyquire("../lib/controllerHandler", {
            "./openhabConnection": { OpenhabConnection: OpenhabConnectionStub },
        }));

        config = {
            host: "localhost",
            protocol: "http",
            port: 8080
        };
    });

    it("should log connection info and create OpenhabConnection", function () {
        const mockNode = createMockNode();
        new ControllerHandler(mockNode, config, bus).setupNode();
        expect(mockNode.log.calledWithMatch("OpenHAB Controller connecting to: http://localhost:8080"), "connecting message").to.be.true;
        expect(mockNode.log.calledWithMatch("OpenHAB is ready, starting EventSource connection..."), "connected message").to.be.true;
        expect(OpenhabConnectionStub.calledOnce).to.be.true;
    });

    it("should clean up adequately after calling _onClose()", function () {
        const controllerHandler = new ControllerHandler(mockNode, config, bus).setupNode();
        const publishSpy = sinon.spy(bus, 'publish');

        controllerHandler._onClose(() => { }, () => { });

        // Should call log, publish, and set connection to null
        expect(mockNode.log.calledWithMatch("CONTROLLER CLOSE EVENT")).to.be.true;
        expect(publishSpy.calledOnceWithExactly(EVENT_TAGS.CONNECTION_STATUS, SWITCH_STATUS.OFF)).to.be.true;
        expect(controllerHandler.connection).to.be.null;
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

        const controllerHandler = new ControllerHandler(mockNode, config, bus);
        const publishSpy = sinon.spy(bus, 'publish');
        controllerHandler.setupNode();

        // Wait for async code to run
        await new Promise(resolve => setImmediate(resolve));
        // simulate OnOpen
        expect(publishSpy.calledWithMatch(EVENT_TAGS.CONNECTION_STATUS, SWITCH_STATUS.OFF), "Connection status OFF published").to.be.true;
        publishSpy.resetHistory();

        await runEventSourceOnOpenCallback();
        expect(mockNode.log.calledWithMatch("EventSource connection established"), "Connected to event source").to.be.true;
        expect(startEventSourceStub.calledOnce, "EventSource should be started").to.be.true;
        expect(mockNode.log.calledWithMatch("Getting state of all items"), "Getting items").to.be.true;
        expect(publishSpy.calledWithMatch(EVENT_TAGS.CONNECTION_STATUS, SWITCH_STATUS.ON), "Connection status ON published").to.be.true;
        expect(publishSpy.calledWithMatch('items/Item1', sinon.match({ name: 'Item1', state: SWITCH_STATUS.ON, event: EVENT_TYPES.ITEM_STATE })), "Item published").to.be.true;

        // TODO: extract to separate test
        let clientNode = {
            emit: sinon.spy()
        };

        publishSpy.resetHistory();

        // call the control function to simulate a control command
        let result = await controllerHandler.control(clientNode, "Item1", "command", "OFF");

        expect(result).to.deep.equal({ ok: true, data: { name: "test", state: "OFF" } }, "Result 1 is ok as expected");
        expect(clientNode.emit.neverCalled, "No emits to the client done");
        result = await controllerHandler.control(clientNode, "Item1", "error", "OFF");
        expect(result).to.deep.equal({ ok: false, retry: false, type: "network", message: "Simulated error" }, "Result 2 is error as expected");
        expect(clientNode.emit.calledWithMatch('NodeError', 'Simulated error'), "Correct error sent to client").to.be.true;

        expect(publishSpy.calledWithMatch('GlobalError', 'Simulated error'), "Error event raised").to.be.true;
    });

    it("should handle error in getItems appropriately", async function () {

        const errorGetItemsResult = { ok: false, retry: false, message: "Fake Error" };
        bus.subscribe(EVENT_TAGS.NODE_ERROR, nodeErrorHandlerSpy);
        bus.subscribe(EVENT_TAGS.GLOBAL_ERROR, globalErrorHandlerSpy);
        bus.subscribe(EVENT_TAGS.CONNECTION_STATUS, connectionStatusSpy);

        const getItemsStub = setupOpenhabConnectionWithGetItems(errorGetItemsResult, true);

        const controllerHandler = new ControllerHandler(mockNode, config, bus).setupNode();

        await controllerHandler.connection.getItems();
        expect(getItemsStub.calledOnce, "GetItems called").to.be.true;

        await runEventSourceOnOpenCallback();

        controllerHandler._onClose(false, () => { });
        expect(connectionStatusSpy.calledOnceWithExactly('OFF'));
        expect(nodeErrorHandlerSpy.calledOnceWithMatch("Fake Error"), "NodeError emitted").to.be.true;
        expect(globalErrorHandlerSpy.calledOnceWithMatch("Fake Error"), "GlobalError emitted").to.be.true;
    });

    async function runEventSourceOnErrorCallback(message, shortMessage) {
        // Manually trigger the onError callback        
        const startEventSourceArgs = startEventSourceStub.getCall(0).args[0];
        if (startEventSourceArgs && typeof startEventSourceArgs.onError === "function") {
            await startEventSourceArgs.onError(message, shortMessage);
        }
        // Wait for any async error handling to finish
        await new Promise(resolve => setImmediate(resolve));
    }

    async function testErrorEvent(shortMessage, longMessage, expectedNodeError, expectedGlobalError) {
        const publishSpy = sinon.spy(bus, 'publish');

        new ControllerHandler(mockNode, config, bus).setupNode();
        await new Promise(resolve => setImmediate(resolve));

        await runEventSourceOnErrorCallback(longMessage, shortMessage);

        if (expectedNodeError === false) {
            expect(publishSpy.calledWith("NodeError", sinon.match.any), "NodeError should not be emitted").to.be.false;
        } else {
            expect(publishSpy.calledWith("NodeError", expectedNodeError), "NodeError emitted").to.be.true;
        }

        expect(publishSpy.calledWith("GlobalError", expectedGlobalError), "GlobalError emitted").to.be.true;
        expect(publishSpy.calledWithMatch("ConnectionStatus", "OFF"), "ConnectionStatus emitted").to.be.true;

        publishSpy.restore();
    }

    it("should emit a connection error on Error event if short message is not empty", async function () {
        await testErrorEvent("Service Unavailable", "The service is unavailable right now", "Service Unavailable", "The service is unavailable right now");
    });


    it("should not emit a connection error on Error event if short message is empty", async function () {
        await testErrorEvent("", "The service is unavailable right now", false, "The service is unavailable right now");
    });

    it("should use long error on Error event if short message is null or undefined", async function () {
        await testErrorEvent(undefined, "The service is unavailable right now", "The service is unavailable right now", "The service is unavailable right now");
    });

    describe("Message handling tests", function () {

        let controllerHandler, publishSpy;

        beforeEach(async function () {
            publishSpy = sinon.spy(bus, 'publish');
            controllerHandler = new ControllerHandler(mockNode, config, bus).setupNode();
            await new Promise(resolve => setImmediate(resolve));
            this.startEventSourceArgs = startEventSourceStub.getCall(0).args[0];
        });

        this.afterEach(function () {
            controllerHandler._onClose(false, () => { });
        });

        it("should emit correct events for a valid ItemStateEvent", function () {
            const message = {
                data: JSON.stringify({
                    type: "ItemStateEvent",
                    topic: "openhab/items/Item1/StateEvent",
                    payload: JSON.stringify({ value: 'ON' })
                })
            };

            controllerHandler._handleMessage(message);
            expect(publishSpy.calledWith(
                "items/Item1",
                sinon.match({ topic: "openhab/items/Item1/StateEvent", name: "Item1", fullName: "items/Item1", payload: { value: "ON" } })
            ),
                "Item Event emitted").to.be.true;
        });

        it("should not emit empty message", function () {
            publishSpy.resetHistory();
            controllerHandler._handleMessage(JSON.stringify({}));
            expect(publishSpy.callCount).to.equal(0);
        });

        it("should not emit null message", function () {
            publishSpy.resetHistory();
            controllerHandler._handleMessage(null);
            expect(publishSpy.callCount).to.equal(0);
        });

        it("should raise an error and emit an error for invalid JSON", function () {
            controllerHandler._handleMessage({ data: "This is not a valid JSON string" });
            expect(publishSpy.calledWith("GlobalError", "Failed to parse event as JSON: This is not a valid JSON string"));
        });

        it("should ignore messages not starting with openhab or smarthome", function () {
            const message = {
                data: JSON.stringify({
                    type: "ItemStateEvent",
                    topic: "bogus/items/Item1/StateEvent",
                    payload: JSON.stringify({ value: 'ON' })
                })
            };
            publishSpy.resetHistory();
            controllerHandler._handleMessage(message);
            console.log(publishSpy.args);
            expect(publishSpy.callCount).to.equal(0);
        });

        it("should ignore messages not having all of type, topic and payload", function () {
            const message = {
                data: JSON.stringify({
                    topic: "bogus/items/Item1/state",
                    payload: JSON.stringify({ value: 'ON' })
                })
            };
            publishSpy.resetHistory();
            controllerHandler._handleMessage(message);
            console.log(publishSpy.args);
            expect(publishSpy.callCount).to.equal(0);
        });
        
        const testCases =
            [
                {
                    desc: "numeric payloads",
                    payload: 25,
                    expectedPayload: 25
                },
                {
                    desc: "numeric payloads in string",
                    payload: "25",
                    expectedPayload: 25
                },
                {
                    desc: "non-numeric non-JSON payloads",
                    payload: "foo",
                    expectedPayload: "foo"
                }
            ];

        for (const testCase of testCases) {
            it(`should emit item events for ${testCase.desc}`, function () {
                const message = {
                    data: JSON.stringify({
                        type: "RawEvent",
                        topic: "openhab/custom/message/event",
                        payload: testCase.payload
                    })
                };
                publishSpy.resetHistory();
                controllerHandler._handleMessage(message);
                expect(publishSpy.calledWithMatch("custom/message", sinon.match.any), `Item published for ${testCase.desc}`).to.be.true;
            });
        }

        it("should not emit events after node is closed", function () {
            // Simulate node being closed
            mockNode._closed = true;
            publishSpy.resetHistory();
            simulateEventSourceMessage({
                data: JSON.stringify({
                    type: "ItemStateEvent",
                    topic: "openhab/items/Item1/StateEvent",
                    payload: JSON.stringify({ value: 'ON' })
                })
            });
            expect(publishSpy.callCount).to.equal(0, "No events should be emitted after node is closed");
        });
    });

    /** almost the same as running _handleMessage, but includes _ifActive */
    function simulateEventSourceMessage(message) {
        const args = startEventSourceStub.getCall(0).args[0];
        args.onMessage(message);
    }
});