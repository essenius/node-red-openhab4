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
const { CONCEPTS, ERROR_TYPES, EVENT_TAGS, OPERATION, SWITCH_STATUS, HTTP_METHODS } = require('../lib/constants');
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
    let sendRequestStub, startEventSourceStub, testIfLiveStub, OpenhabConnectionStub, config;
    let bus, mockNode, ControllerHandler, globalErrorHandlerSpy, connectionStatusSpy, simulateError, simulateOldVersion;

    async function runEventSourceOnOpenCallback() {
        // Manually trigger the onOpen callback
        const startEventSourceArgs = startEventSourceStub.getCall(0).args[0];
        if (startEventSourceArgs && typeof startEventSourceArgs.onOpen === "function") {
            await startEventSourceArgs.onOpen();
        }
        // Wait for getStateOfItems to finish
        await new Promise(resolve => setImmediate(resolve));
    }

    beforeEach(() => {
        bus = new EventBus();

        globalErrorHandlerSpy = sinon.spy();
        bus.subscribe(EVENT_TAGS.GLOBAL_ERROR, globalErrorHandlerSpy);
        connectionStatusSpy = sinon.spy();
        bus.subscribe(EVENT_TAGS.CONNECTION_STATUS, connectionStatusSpy);

        simulateError = false;
        simulateOldVersion = false;
        sendRequestStub = sinon.stub().callsFake(async (endPoint, verb, payload, handler) => {
            if (simulateError) {
                const result = { ok: false, retry: false, type: ERROR_TYPES.NETWORK, message: "Simulated error" };
                handler(result);
                return result;
            }

            if (verb === HTTP_METHODS.GET) {
                if (endPoint.endsWith("/things"))
                    return { ok: true, data: [{ UID: "Thing1", statusInfo: { status: "ONLINE" } }] };

                if (endPoint.endsWith("/items"))
                    return { ok: true, data: [{ name: "Item1", state: SWITCH_STATUS.OFF, type: "Switch" }] };

                if (endPoint === CONCEPTS.ROOT_URL) {
                    const data = simulateOldVersion ? {} : { runtimeInfo: { version: "4.0.1" } };
                    return { ok: true, data };
                }

                if (endPoint.includes("items/"))
                    return { ok: true, data: { name: "item1", state: SWITCH_STATUS.OFF, type: "OnOff" } };

                return { ok:true, data: {UID: "Thing2", statusInfo: { status: "OFFLINE" } } };
            }
            return { ok: true, data: null };
        });

        startEventSourceStub = sinon.stub();
        testIfLiveStub = sinon.stub().resolves(true);

        const fakeConnection = {
            startEventSource: startEventSourceStub,
            sendRequest: sendRequestStub,
            close: sinon.stub(),
            testIfLive: testIfLiveStub
        };

        OpenhabConnectionStub = sinon.stub().returns(fakeConnection);

        mockNode = createMockNode();

        delete require.cache[require.resolve("../lib/controllerHandler")];

        ({ ControllerHandler } = proxyquire("../lib/controllerHandler", {
            "./openhabConnection": { OpenhabConnection: OpenhabConnectionStub },
        }));

        config = { url: "http://localhost:8080" };
    });

    it("should log connection info and create OpenhabConnection", function () {
        const mockNode = createMockNode();
        new ControllerHandler(mockNode, config, bus).setupNode();

        const logArgs = mockNode.log.getCalls().map(call => call.args[0]);
        expect(logArgs, "connecting message").to.include("OpenHAB Controller connecting to: http://localhost:8080");
        expect(logArgs, "connected message").to.include("OpenHAB is ready, starting EventSource connection...");
        expect(OpenhabConnectionStub.calledOnce).to.be.true;
    });

    it("should clean up adequately after calling _onClose()", function () {
        config.eventFilter = "items/*";
        const controllerHandler = new ControllerHandler(mockNode, config, bus).setupNode();
        const publishSpy = sinon.spy(bus, 'publish');

        controllerHandler._onClose(() => { }, () => { });

        // Should call log, publish, and set connection to null
        expect(mockNode.log.calledWithMatch("Closing controller")).to.be.true;
        expect(publishSpy.calledOnceWithExactly(EVENT_TAGS.CONNECTION_STATUS, SWITCH_STATUS.OFF)).to.be.true;
        expect(controllerHandler.connection).to.be.null;
    });

    describe('retrieval tests', function () {

        let controllerHandler, publishSpy;

        beforeEach(async function () {
            publishSpy = sinon.spy(bus, 'publish');
            controllerHandler = new ControllerHandler(mockNode, config, bus).setupNode();
            // Wait for async code to run
            await new Promise(resolve => setImmediate(resolve));
            this.startEventSourceArgs = startEventSourceStub.getCall(0).args[0];
        });

        this.afterEach(function () {
            controllerHandler._onClose(false, () => { });
            publishSpy.restore();
        });

        it("should start EventSource and get state of items when openHAB is ready (happy path)", async function () {

            expect(publishSpy.calledWithMatch(EVENT_TAGS.CONNECTION_STATUS, SWITCH_STATUS.OFF), "Connection status OFF published").to.be.true;
            publishSpy.resetHistory();

            // simulate OnOpen
            await runEventSourceOnOpenCallback();
            expect(mockNode.log.calledWithMatch("EventSource connection established"), "Connected to event source").to.be.true;
            expect(startEventSourceStub.calledOnce, "EventSource should be started").to.be.true;
            expect(mockNode.log.calledWithMatch("Getting statuses of all things..."), "Getting things").to.be.true;
            expect(publishSpy.calledWithMatch(EVENT_TAGS.CONNECTION_STATUS, SWITCH_STATUS.ON), "Connection status ON published").to.be.true;

            const calls = publishSpy.getCalls();

            const matchingCall2 = calls.find(call => call.args[0] === 'items/Item1');
            expect(matchingCall2, "publish called with topic").to.exist;
            console.log(matchingCall2.args[1]);
            expect(matchingCall2.args[1], "Item published").to.deep.include(
                {
                    topic: "items/Item1",
                    payload: SWITCH_STATUS.OFF,
                    payloadType: "Switch",
                    eventType: "ItemStateEvent",
                    openhab: { name: 'Item1', state: SWITCH_STATUS.OFF, type: "Switch" }
                });
        });

        it("should call control for a get and return a response", async function () {
            publishSpy.resetHistory();

            const result = await controllerHandler.control(CONCEPTS[CONCEPTS.ITEMS], "Item1", OPERATION.GET);

            expect(result).to.deep.equal({
                ok: true,
                data: {
                    topic: "items/item1",
                    payload: SWITCH_STATUS.OFF,
                    payloadType: "OnOff",
                    openhab: { name: 'item1', state: SWITCH_STATUS.OFF, type: "OnOff" }
                }
            }, "Result 1 is ok as expected");
            expect(publishSpy.notCalled, "No events published for error").to.be.true;
        });

        it("should call control for a command and return no response", async function () {
            const result = await controllerHandler.control(CONCEPTS[CONCEPTS.ITEMS], "Item1", OPERATION.COMMAND, SWITCH_STATUS.ON);
            expect(result).to.deep.equal({ ok: true, data: null }, "Result 1 is ok as expected");
            expect(sendRequestStub.calledWithMatch("/rest/items/Item1", HTTP_METHODS.POST, SWITCH_STATUS.ON), "sendRequest called with correct args").to.be.true;
        });

        it("should call control for an update and return no response", async function () {
            const result = await controllerHandler.control(CONCEPTS[CONCEPTS.ITEMS], "Item1", OPERATION.UPDATE, SWITCH_STATUS.ON);
            expect(result).to.deep.equal({ ok: true, data: null }, "Result 1 is ok as expected");
            expect(sendRequestStub.calledWithMatch("/rest/items/Item1/state", HTTP_METHODS.PUT, SWITCH_STATUS.ON), "sendRequest called with correct args").to.be.true;
        });

        it("should return thing info when called with thing concept", async function () {
            const result = await controllerHandler.control(CONCEPTS[CONCEPTS.THINGS], "Thing1");
            expect(result).to.deep.equal({
                ok: true,
                data: {
                    topic: "things/Thing2",
                    payload: "OFFLINE",
                    payloadType: "Status",
                    openhab: { UID: "Thing2", statusInfo: { status: "OFFLINE" } }
                }
            }, "Ping request returns the right data");
        });


        it("should return version data when called with system concept", async function () {
            const result = await controllerHandler.control(CONCEPTS[CONCEPTS.SYSTEM], "any");
            expect(result).to.deep.equal({
                ok: true,
                data: {
                    topic: "system",
                    payload: "4.0.1",
                    payloadType: "Version",
                    openhab: { runtimeInfo: { version: "4.0.1" } }
                }
            }, "Ping request on newer openHAB returns the right data");
        });


        it("should return default version data when called with system concept", async function () {
            simulateOldVersion = true;
            const result = await controllerHandler.control(CONCEPTS[CONCEPTS.SYSTEM], "old");
            expect(result).to.deep.equal({
                ok: true,
                data: {
                    topic: "system",
                    payload: "2.x",
                    payloadType: "Version",
                    openhab: { }
                }
            }, "Ping request on older openHAB returns the right data");

            simulateOldVersion = false; // reset for other tests
        });

        it("should handle errors in control and publish a GlobalError", async function () {
            publishSpy.resetHistory();

            simulateError = true;
            const result = await controllerHandler.control(CONCEPTS[CONCEPTS.ITEMS], "Item1", OPERATION.ERROR, SWITCH_STATUS.OFF);
            expect(result).to.deep.equal({ ok: false, retry: false, type: "network", message: "Simulated error" }, "Result 2 is error as expected");
            expect(publishSpy.calledWithMatch('GlobalError', 'Simulated error'), "Error event raised").to.be.true;
        });

        it("should handle error in _getAll appropriately", async function () {
            simulateError = true;
            const controllerHandler = new ControllerHandler(mockNode, config, bus).setupNode();
            bus.subscribe(EVENT_TAGS.GLOBAL_ERROR, globalErrorHandlerSpy);
            bus.subscribe(EVENT_TAGS.CONNECTION_STATUS, connectionStatusSpy);

            await runEventSourceOnOpenCallback(); // which should call _getAll and thus trigger the error

            controllerHandler._onClose(false, () => { });
            expect(connectionStatusSpy.calledOnceWithExactly('OFF'));
                expect(globalErrorHandlerSpy.calledOnceWithMatch("Simulated error"), "GlobalError emitted").to.be.true;
        });
    });

    async function runEventSourceOnErrorCallback(message) {
        // Manually trigger the onError callback        
        const startEventSourceArgs = startEventSourceStub.getCall(0).args[0];
        if (startEventSourceArgs && typeof startEventSourceArgs.onError === "function") {
            await startEventSourceArgs.onError(message);
        }
        // Wait for any async error handling to finish
        await new Promise(resolve => setImmediate(resolve));
    }

    async function testErrorEvent(shortMessage, longMessage, expectedGlobalError) {
        const publishSpy = sinon.spy(bus, 'publish');

        new ControllerHandler(mockNode, config, bus).setupNode();
        await new Promise(resolve => setImmediate(resolve));

        await runEventSourceOnErrorCallback(longMessage);

        expect(publishSpy.calledWith("GlobalError", expectedGlobalError), "GlobalError emitted").to.be.true;
        expect(publishSpy.calledWithMatch("ConnectionStatus", "OFF"), "ConnectionStatus emitted").to.be.true;

        publishSpy.restore();
    }

    it("should emit a connection error on Error event if short message is not empty", async function () {
        await testErrorEvent("Service Unavailable", "The service is unavailable right now", "The service is unavailable right now");
    });

    it("should not emit a connection error on Error event if short message is empty", async function () {
        await testErrorEvent("", "The service is unavailable right now", "The service is unavailable right now");
    });

    it("should use long error on Error event if short message is null or undefined", async function () {
        await testErrorEvent(undefined, "The service is unavailable right now", "The service is unavailable right now");
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
            publishSpy.resetHistory();
            controllerHandler._handleMessage(message);
            expect(publishSpy.firstCall.args[1]).to.deep.include(
                {
                    payload: "ON",
                    topic: "items/Item1",
                    eventType: "ItemStateEvent"
                }, "Item Event emitted");
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

        function expectIgnoredMessage(message) {
            publishSpy.resetHistory();
            controllerHandler._handleMessage(message);
            expect(publishSpy.callCount).to.equal(0);
        }

        it("should ignore messages not starting with openhab or smarthome", function () {
            expectIgnoredMessage({
                data: JSON.stringify({
                    type: "ItemStateEvent",
                    topic: "bogus/items/Item1/StateEvent",
                    payload: JSON.stringify({ value: 'ON' })
                })
            });
        });

        it("should ignore messages not having all of type, topic and payload", function () {
            expectIgnoredMessage({
                data: JSON.stringify({
                    topic: "bogus/items/Item1/state",
                    payload: JSON.stringify({ value: 'ON' })
                })
            });
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
                        topic: "openhab/items/message/event",
                        payload: testCase.payload
                    })
                };
                publishSpy.resetHistory();
                controllerHandler._handleMessage(message);
                expect(publishSpy.calledWithMatch("items/message", sinon.match.any), `Item published for ${testCase.desc}`).to.be.true;
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