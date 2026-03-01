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

'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const {
    CONCEPTS,
    ERROR_TYPES,
    EVENT_TAGS,
    OPERATION,
    SWITCH_STATUS,
    STATE,
    HTTP_METHODS,
} = require('../lib/constants');
const { EventBus } = require('../lib/eventBus');
const { EventEmitter } = require('node:events');
const { setupControllerHandler } = require('../lib/controllerHandler');

function createMockNode() {
    const node = new EventEmitter();
    node.name = 'MockNode';
    node.log = sinon.spy();
    node.warn = sinon.spy();
    node.error = sinon.spy();
    return node;
}

function getResource(concept, identifier) {
    return { concept, identifier };
}

const item1 = getResource(CONCEPTS.ITEMS, 'Item1');
const thing1 = getResource(CONCEPTS.THINGS, 'Thing1');

describe('controllerHandler.setupControllerHandler', function () {
    let eventBus, createConnection, mockNode, config, fakeHandlerOptions, fakeConnection;
    let startEventSourceStub;

    let simulateError = false;
    let simulateOldVersion = false;

    const sendRequestStub = sinon.stub().callsFake(async (endPoint, verb) => {
        await new Promise((resolve) => setImmediate(resolve));
        if (simulateError) {
            return { ok: false, retry: true, type: ERROR_TYPES.NETWORK, message: 'Simulated error' };
        }

        if (verb === HTTP_METHODS.GET) {
            if (endPoint.endsWith('/things'))
                return { ok: true, data: [{ UID: thing1.identifier, statusInfo: { status: 'ONLINE' } }] };

            if (endPoint.endsWith('/items'))
                return { ok: true, data: [{ name: item1.identifier, state: SWITCH_STATUS.OFF, type: 'Switch' }] };

            if (endPoint === CONCEPTS.ROOT_URL) {
                const data = simulateOldVersion ? {} : { runtimeInfo: { version: '4.0.1' } };
                return { ok: true, data };
            }

            if (endPoint.includes('items/'))
                return { ok: true, data: { name: 'item1', state: SWITCH_STATUS.OFF, type: 'OnOff' } };

            return { ok: true, data: { UID: thing1.identifier, statusInfo: { status: 'OFFLINE' } } };
        }
        return { ok: true, data: null };
    });

    beforeEach(() => {
        eventBus = new EventBus();
        mockNode = createMockNode();

        startEventSourceStub = sinon.stub();

        fakeConnection = {
            startEventSource: startEventSourceStub,
            sendRequest: sendRequestStub,
            close: sinon.stub(),
            getResources: sinon.stub(),
        };

        createConnection = function (config, options) {
            fakeConnection.config = config;
            fakeConnection.options = options;
            return fakeConnection;
        };

        fakeHandlerOptions = { eventBus, createConnection };
        config = { url: 'http://localhost:8080' };
    });

    it('should log connection info, start Event Source, and clean up after receiving Close', async function () {
        const controllerHandler = setupControllerHandler(mockNode, config, fakeHandlerOptions);

        const logArgs = mockNode.log.getCalls().map((call) => call.args[0]);
        expect(logArgs, 'connecting message').to.include(
            'Starting OpenHAB EventSource connection to http://localhost:8080...'
        );
        expect(startEventSourceStub.calledOnce).to.be.true;

        const publishSpy = sinon.spy(eventBus, 'publish');
        await new Promise((resolve) => {
            mockNode.emit('close', false, resolve);
        });

        // Should call log, publish, and set connection to null
        expect(mockNode.log.calledWithMatch('Closing controller')).to.be.true;
        expect(publishSpy.calledOnceWithExactly(EVENT_TAGS.CONNECTION_STATUS, SWITCH_STATUS.OFF)).to.be.true;
        expect(controllerHandler.connection).to.be.null;
    });

    it('should delegate getResources to connection', function () {
        const controllerHandler = setupControllerHandler(mockNode, config, fakeHandlerOptions);
        controllerHandler.getResources('type', 'endpoint');
        expect(fakeConnection.getResources.args[0]).to.deep.equal(['type', 'endpoint']);
    });

    describe('retrieval tests', function () {
        let controllerHandler, publishSpy;

        beforeEach(async function () {
            mockNode = createMockNode();
            publishSpy = sinon.spy(eventBus, 'publish');
            controllerHandler = setupControllerHandler(mockNode, config, fakeHandlerOptions);
            sendRequestStub.resetHistory();
            // Wait for async code to run
            await new Promise((resolve) => setImmediate(resolve));
        });

        afterEach(async function () {
            await new Promise((resolve) => {
                mockNode.emit('close', false, resolve);
            });
            publishSpy.restore();
            mockNode.removeAllListeners('close');
        });

        it('should start EventSource and get state of items when openHAB is ready (happy path)', async function () {
            expect(
                publishSpy.calledWithMatch(EVENT_TAGS.CONNECTION_STATUS, SWITCH_STATUS.OFF),
                'Connection status OFF published'
            ).to.be.true;
            publishSpy.resetHistory();

            await fakeConnection.options.onStateChange(STATE.UP);
            await new Promise((resolve) => setImmediate(resolve));

            expect(mockNode.log.calledWithMatch('OpenHAB connection established'), 'Connected to event source').to.be
                .true;
            expect(startEventSourceStub.calledOnce, 'EventSource should be started').to.be.true;
            expect(mockNode.log.calledWithMatch('Getting statuses of all things...'), 'Getting things').to.be.true;
            expect(mockNode.log.calledWithMatch('Getting statuses of all items...'), 'Getting items').to.be.true;
            expect(
                publishSpy.calledWithMatch(EVENT_TAGS.CONNECTION_STATUS, SWITCH_STATUS.ON),
                'Connection status ON published'
            ).to.be.true;

            const calls = publishSpy.getCalls();

            const matchingCall2 = calls.find((call) => call.args[0] === 'items/Item1');
            expect(matchingCall2, 'publish called with topic').to.exist;
            expect(matchingCall2.args[1], 'Item published').to.deep.include({
                topic: `items/${item1.identifier}`,
                payload: SWITCH_STATUS.OFF,
                payloadType: 'Switch',
                eventType: 'ItemStateEvent',
                openhab: { name: item1.identifier, state: SWITCH_STATUS.OFF, type: 'Switch' },
            });
        });

        it('should publish an error and a disconnect message with state connecting', async function () {
            publishSpy.resetHistory();
            await fakeConnection.options.onStateChange(STATE.CONNECTING);
            expect(
                publishSpy.calledWithMatch(EVENT_TAGS.GLOBAL_ERROR, {
                    context: {
                        function: '_handleStateChange',
                        node: 'MockNode',
                    },
                    payload: 'Connection lost. Reconnecting...',
                }),
                'Error message published'
            ).to.be.true;
            expect(
                publishSpy.calledWithMatch(EVENT_TAGS.CONNECTION_STATUS, SWITCH_STATUS.OFF),
                'Connection status OFF published'
            ).to.be.true;
        });

        it('should publish a disconnect message with state down', async function () {
            publishSpy.resetHistory();
            await fakeConnection.options.onStateChange(STATE.DOWN);
            expect(
                publishSpy.calledWithMatch(EVENT_TAGS.CONNECTION_STATUS, SWITCH_STATUS.OFF),
                'Connection status OFF published'
            ).to.be.true;
        });

        it('should ignore a message with an unknown state change', async function () {
            publishSpy.resetHistory();
            await fakeConnection.options.onStateChange(42);
            expect(publishSpy.notCalled).to.be.true;
        });

        it('should call control for a get and return a response', async function () {
            publishSpy.resetHistory();

            const result = await controllerHandler.control(item1, OPERATION.GET);

            expect(result).to.deep.equal(
                {
                    ok: true,
                    data: {
                        topic: 'items/item1',
                        payload: SWITCH_STATUS.OFF,
                        payloadType: 'OnOff',
                        openhab: { name: 'item1', state: SWITCH_STATUS.OFF, type: 'OnOff' },
                    },
                },
                'Result 1 is ok as expected'
            );
            expect(publishSpy.notCalled, 'No events published for error').to.be.true;
        });

        it('should return a missing identifier error when control is called without identifier', async function () {
            const result = await controllerHandler.control({ concept: 'items' }, OPERATION.COMMAND, SWITCH_STATUS.ON);
            expect(result).to.deep.equal({ ok: false, message: 'items: missing identifier' }, 'Result is ok');
            expect(sendRequestStub.notCalled, 'sendRequest not called').to.be.true;
        });

        const sendScenarios = [
            {
                name: 'should call control for a command and return no response',
                operation: OPERATION.COMMAND,
                expectedUrl: `/rest/items/${item1.identifier}`,
                expectedMethod: HTTP_METHODS.POST,
            },
            {
                name: 'should call control for an update and return no response',
                operation: OPERATION.UPDATE,
                expectedUrl: `/rest/items/${item1.identifier}/state`,
                expectedMethod: HTTP_METHODS.PUT,
            },
        ];

        sendScenarios.forEach(({ name, operation, expectedUrl, expectedMethod }) => {
            it(name, async function () {
                // Act
                const result = await controllerHandler.control(item1, operation, SWITCH_STATUS.ON);

                // Assert
                expect(result).to.deep.equal({ ok: true, data: null }, 'Result is ok');
                expect(
                    sendRequestStub.calledWithMatch(expectedUrl, expectedMethod, SWITCH_STATUS.ON),
                    'sendRequest called with correct args'
                ).to.be.true;
            });
        });

        it('should return an error when control called with unknown concept', async function () {
            const result = await controllerHandler.control(
                getResource('bogus', 'irrelevant'),
                OPERATION.UPDATE,
                SWITCH_STATUS.ON
            );
            expect(result).to.deep.equal(
                { ok: false, message: 'bogus: unknown concept' },
                'Result has right error message'
            );
            expect(sendRequestStub.notCalled, 'Request stub not called').to.be.true;
        });

        it('should return an error when control called with unsupported operation', async function () {
            const result = await controllerHandler.control(thing1, OPERATION.COMMAND, 'ONLINE');
            expect(result).to.deep.equal(
                { ok: false, message: "command: unsupported for 'things'" },
                'command not supported for things'
            );
            expect(sendRequestStub.notCalled, 'Request stub not called').to.be.true;
        });

        it('should return an error when control called with unsupported operation', async function () {
            const result = await controllerHandler.control(thing1, 'bogus', 'ONLINE');
            expect(result).to.deep.equal(
                { ok: false, message: 'bogus: unknown operation' },
                'command not supported for things'
            );
            expect(sendRequestStub.notCalled, 'Request stub not called').to.be.true;
        });

        const scenarioConcepts = [
            {
                name: 'should return thing info when called with thing concept',
                resource: thing1,
                expected: {
                    ok: true,
                    data: {
                        topic: `things/${thing1.identifier}`,
                        payload: 'OFFLINE',
                        payloadType: 'String',
                        openhab: { UID: `${thing1.identifier}`, statusInfo: { status: 'OFFLINE' } },
                    },
                },
                before: null,
                after: null,
            },
            {
                name: 'should return version data when called with system concept (new openHAB)',
                resource: getResource(CONCEPTS.SYSTEM, ''),
                expected: {
                    ok: true,
                    data: {
                        topic: 'system',
                        payload: '4.0.1',
                        payloadType: 'Version',
                        openhab: { runtimeInfo: { version: '4.0.1' } },
                    },
                },
                before: null,
                after: null,
            },
            {
                name: 'should return default version data when called with system concept (old openHAB)',
                resource: getResource(CONCEPTS.SYSTEM, 'any'),
                expected: {
                    ok: true,
                    data: {
                        topic: 'system',
                        payload: '2.x',
                        payloadType: 'Version',
                        openhab: {},
                    },
                },
                before: () => {
                    simulateOldVersion = true;
                },
                after: () => {
                    simulateOldVersion = false;
                },
            },
        ];

        scenarioConcepts.forEach(({ name, resource, expected, before, after }) => {
            it(name, async function () {
                if (before) before();

                const result = await controllerHandler.control(resource);

                expect(result).to.deep.equal(expected, 'Ping request returns the right data');

                if (after) after();
            });
        });

        it('should handle errors in control but not publish an error', async function () {
            publishSpy.resetHistory();

            simulateError = true;
            const result = await controllerHandler.control(item1, OPERATION.GET);
            expect(result).to.deep.equal(
                { ok: false, retry: true, type: 'network', message: 'Simulated error' },
                'Result 2 is error as expected'
            );
            expect(publishSpy.notCalled, 'Nothing published').to.be.true;
        });

        it('should handle error in _getAll appropriately', async function () {
            publishSpy.resetHistory();
            simulateError = true;

            setupControllerHandler(mockNode, config, fakeHandlerOptions);

            await fakeConnection.options.onStateChange(STATE.UP); // handler should call _getAll and thus trigger the error

            expect(
                publishSpy.calledWithMatch(EVENT_TAGS.CONNECTION_STATUS, SWITCH_STATUS.OFF),
                'Connection status OFF published'
            ).to.be.true;
            expect(publishSpy.secondCall.args).to.deep.equal([
                'GlobalError',
                {
                    context: { function: '_getAll', endPoint: '/rest/things', operation: 'GET', node: 'MockNode' },
                    payload: { ok: false, retry: true, type: 'network', message: 'Simulated error' },
                },
            ]);
        });
    });

    describe('Message handling tests', function () {
        let publishSpy;

        beforeEach(async function () {
            publishSpy = sinon.spy(eventBus, 'publish');
            setupControllerHandler(mockNode, config, fakeHandlerOptions);
            await new Promise((resolve) => setImmediate(resolve));
            await fakeConnection.options.onStateChange(STATE.UP);
        });

        it('should emit correct events for a valid ItemStateEvent', async function () {
            const message = {
                data: JSON.stringify({
                    type: 'ItemStateEvent',
                    topic: `openhab/items/${item1.identifier}/StateEvent`,
                    payload: JSON.stringify({ value: 'ON' }),
                }),
            };
            publishSpy.resetHistory();
            await fakeConnection.options.onMessage(message);
            expect(publishSpy.firstCall.args[1]).to.deep.include(
                {
                    payload: 'ON',
                    topic: `items/${item1.identifier}`,
                    eventType: 'ItemStateEvent',
                },
                'Item Event emitted'
            );
        });

        it('should not emit empty message', async function () {
            publishSpy.resetHistory();
            await fakeConnection.options.onMessage(JSON.stringify({}));
            expect(publishSpy.callCount).to.equal(0);
        });

        it('should not emit null message', async function () {
            publishSpy.resetHistory();
            await fakeConnection.options.onMessage(null);
            expect(publishSpy.callCount).to.equal(0);
        });

        it('should raise an error and emit an error for invalid JSON', function () {
            fakeConnection.options.onMessage({ data: 'This is not a valid JSON string' });
            expect(
                publishSpy.calledWith('GlobalError', 'Failed to parse event as JSON: This is not a valid JSON string')
            );
        });

        async function expectIgnoredMessage(message) {
            publishSpy.resetHistory();
            await fakeConnection.options.onMessage(message);
            expect(publishSpy.callCount).to.equal(0);
        }

        it('should ignore messages not starting with openhab or smarthome', async function () {
            await expectIgnoredMessage({
                data: JSON.stringify({
                    type: 'ItemStateEvent',
                    topic: `bogus/items/${item1.identifier}/StateEvent`,
                    payload: JSON.stringify({ value: 'ON' }),
                }),
            });
        });

        it('should ignore messages not having all of type, topic and payload', async function () {
            await expectIgnoredMessage({
                data: JSON.stringify({
                    topic: `bogus/items/${item1.identifier}/state`,
                    payload: JSON.stringify({ value: 'ON' }),
                }),
            });
        });

        it('should ignore messages with an unknown concept', async function () {
            await expectIgnoredMessage({
                data: JSON.stringify({
                    type: 'ItemStateEvent',
                    topic: 'openhab/bogus/bogus1/state',
                    payload: JSON.stringify({ value: 'ON' }),
                }),
            });
        });

        const testCases = [
            {
                desc: 'numeric payloads',
                payload: 25,
                expectedPayload: 25,
            },
            {
                desc: 'numeric payloads in string',
                payload: '25',
                expectedPayload: 25,
            },
            {
                desc: 'non-numeric non-JSON payloads',
                payload: 'foo',
                expectedPayload: 'foo',
            },
        ];

        for (const testCase of testCases) {
            it(`should emit item events for ${testCase.desc}`, async function () {
                const message = {
                    data: JSON.stringify({
                        type: 'RawEvent',
                        topic: 'openhab/items/message/event',
                        payload: testCase.payload,
                    }),
                };
                publishSpy.resetHistory();
                await fakeConnection.options.onMessage(message);
                expect(
                    publishSpy.calledWithMatch('items/message', sinon.match.any),
                    `Item published for ${testCase.desc}`
                ).to.be.true;
            });
        }

        it('should not emit events after node is closed', async function () {
            // Simulate node being closed
            mockNode._closed = true;
            publishSpy.resetHistory();
            await fakeConnection.options.onMessage({
                data: JSON.stringify({
                    type: 'ItemStateEvent',
                    topic: `openhab/items/${item1.identifier}/StateEvent`,
                    payload: JSON.stringify({ value: 'ON' }),
                }),
            });
            expect(publishSpy.callCount).to.equal(0, 'No events should be emitted after node is closed');
        });
    });
});

after(() => {
    const handles = process._getActiveHandles();
    console.log(
        'Handles:',
        handles.map((h) => h.constructor.name)
    );
});
