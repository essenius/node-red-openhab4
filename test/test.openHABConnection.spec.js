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
const proxyquire = require('proxyquire');
const { STATE, ERROR_TYPES, RETRY_CONFIG } = require('../lib/constants');

let httpRequestStub;
let MockEventSource;
let fakeSetTimeout;
let fakeClearTimeout;
let scheduledFn;
let createOpenhabConnection;

beforeEach(() => {
    httpRequestStub = sinon.stub();

    MockEventSource = class {
        constructor(url, options) {
            this.url = url;
            this.options = options;
            this.onopen = null;
            this.onerror = null;
            this.onmessage = null;
            this.close = sinon.spy();
        }

        __mockMarker() {
            // dummy to satisfy SonarQube
        }
    };

    fakeSetTimeout = sinon.stub().callsFake((fn, _delay) => {
        scheduledFn = fn;
        return 'timer';
    });

    fakeClearTimeout = sinon.spy();

    const module = proxyquire('../lib/openhabConnection', {
        './connectionUtils': {
            httpRequest: httpRequestStub,
            getEventSource: () => MockEventSource,
            addAuthHeader: () => {},
        },
    });
    createOpenhabConnection = module.createOpenhabConnection;
});

function createConnection(configOverrides = {}, optionsOverrides = {}) {
    return createOpenhabConnection(
        {
            url: 'http://localhost:8080',
            token: '',
            username: '',
            password: '',
            isHttps: false,
            ...configOverrides,
        },
        {
            eventSourceImpl: MockEventSource,
            setTimeoutImpl: fakeSetTimeout,
            clearTimeoutImpl: fakeClearTimeout,
            ...optionsOverrides,
        }
    );
}

// ----------------------------
// HTTP BEHAVIOR
// ----------------------------

describe('OpenhabConnection sendRequest', function () {
    it('should reject when not UP', async function () {
        const connection = createConnection.call(this);

        const result = await connection.sendRequest('/rest/items');

        expect(result.ok).to.be.false;
        expect(result.type).to.equal(ERROR_TYPES.SYSTEM);
    });

    it('should enter CONNECTING on retryable error', async function () {
        const connection = createConnection.call(this);

        connection.state = STATE.UP;

        httpRequestStub.resolves({
            ok: false,
            retry: true,
            status: 500,
        });

        await connection.sendRequest('/rest/items');

        expect(connection.state).to.equal(STATE.CONNECTING);
    });

    [
        {
            name: 'health probe succeeds → state stays UP',
            secondResponse: { ok: true },
            expectedState: STATE.UP,
        },
        {
            name: 'health probe fails → state moves to CONNECTING',
            secondResponse: { ok: false },
            expectedState: STATE.CONNECTING,
        },
    ].forEach(({ name, secondResponse, expectedState }) => {
        it(`should call health probe for 404/500 without retry flag and ${name}`, async function () {
            const connection = createConnection.call(this);
            connection.state = STATE.UP;

            httpRequestStub
                .onFirstCall()
                .resolves({ ok: false, retry: false, status: 404 })
                .onSecondCall()
                .resolves(secondResponse);

            await connection.sendRequest('/rest/items');

            expect(httpRequestStub.calledTwice).to.be.true;
            expect(connection.state, `State after probe: ${name}`).to.equal(expectedState);
        });
    });
});

// ----------------------------
// SSE LIFECYCLE
// ----------------------------

describe('OpenhabConnection EventSource lifecycle', function () {
    it('should create EventSource with correct URL', function () {
        const connection = createConnection.call(this);
        connection.startEventSource();

        expect(connection.eventSource).to.be.instanceOf(MockEventSource);
        expect(connection.eventSource.url).to.include('/rest/events');
    });

    it('should transition to UP on open', function () {
        const stateSpy = sinon.spy();
        const connection = createConnection.call(this, {}, { onStateChange: stateSpy });
        expect(connection.state, 'State DOWN right after start').to.equal(STATE.DOWN);

        connection.startEventSource();
        connection.eventSource.onopen();

        expect(connection.state, 'State UP after startEventSource and onopen').to.equal(STATE.UP);
        expect(stateSpy.calledWith(STATE.UP), 'StateSpy called with UP').to.be.true;
    });

    it('should transition to CONNECTING on error', function () {
        const connection = createConnection.call(this);

        connection.startEventSource();
        connection.eventSource.onerror({ message: 'failure' });

        expect(connection.state).to.equal(STATE.CONNECTING);
    });

    [
        { name: 'undefined', payload: undefined, expected: false },
        { name: 'null', payload: null, expected: false },
        { name: 'string', payload: 'error', expected: false },
        { name: 'number', payload: 42, expected: false },
        { name: 'bool', payload: true, expected: false },
        { name: 'object without type', payload: { message: 'fail' }, expected: false },
        { name: 'object with empty type', payload: { type: {} }, expected: true },
        { name: 'object with non-empty type', payload: { type: { code: 123 } }, expected: false },
    ].forEach(({ name, payload, expected }) => {
        it(`should ${expected ? 'not ' : ''}ignore errors with payload ${name}`, function () {
            const connection = createConnection.call(this);
            connection.startEventSource();
            connection.eventSource.onerror(payload);
            expect(connection.state !== STATE.CONNECTING).to.equal(expected);
        });
    });
});

// ----------------------------
// RETRY SCHEDULER
// ----------------------------

describe('OpenhabConnection Retry scheduler', function () {
    it('should schedule reconnect when entering CONNECTING', async function () {
        const connection = createConnection.call(this);
        await connection._enterConnecting();
        expect(fakeSetTimeout.calledOnce).to.be.true;
    });

    it('should increase backoff when probe unhealthy', async function () {
        const connection = createConnection.call(this);
        sinon.stub(connection, '_probeHealth').resolves(false);
        await connection._enterConnecting();

        await scheduledFn();

        expect(connection.retryAttempts).to.equal(1);
        expect(connection.currentRetryDelay).to.equal(
            RETRY_CONFIG.EVENTSOURCE_INITIAL_DELAY * RETRY_CONFIG.EVENTSOURCE_BACKOFF_FACTOR
        );
    });

    it('should restart EventSource when probe healthy', async function () {
        const connection = createConnection.call(this);
        sinon.stub(connection, '_probeHealth').resolves(true);
        const startSpy = sinon.spy(connection, 'startEventSource');
        await connection._enterConnecting();

        await scheduledFn();

        expect(startSpy.calledOnce).to.be.true;
    });

    it('should not restart after close()', async function () {
        const connection = createConnection.call(this);
        sinon.stub(connection, '_probeHealth').resolves(true);
        const startSpy = sinon.spy(connection, 'startEventSource');

        await connection._enterConnecting();
        connection.close();
        await scheduledFn();

        expect(startSpy.notCalled).to.be.true;
    });
});

// ----------------------------
// STATE CALLBACKS
// ----------------------------

describe('OpenhabConnection State change callback', function () {
    it('should notify on state changes', async function () {
        const stateSpy = sinon.spy();

        const connection = createConnection.call(
            this,
            {},
            {
                onStateChange: stateSpy,
            }
        );

        await connection._enterConnecting();
        await connection._enterUp();
        await connection._enterDown();

        expect(stateSpy.calledWith(STATE.CONNECTING)).to.be.true;
        expect(stateSpy.calledWith(STATE.UP)).to.be.true;
        expect(stateSpy.calledWith(STATE.DOWN)).to.be.true;
    });
});

// ----------------------------
// EVENTSOURCE CALLBACKS
// ----------------------------

describe('OpenhabConnection EventSource event tests', function () {
    it('should start EventSource and handle open, error, and message events', async function () {
        const messageSpy = sinon.spy();
        const stateChangeSpy = sinon.spy();
        const connection = createConnection.call(
            this,
            { url: 'https://localhost:8443', isHttps: true, allowSelfSigned: true },
            { onMessage: messageSpy, onStateChange: stateChangeSpy }
        );

        connection.startEventSource();
        expect(connection.eventSource.options.https).to.deep.equal(
            { rejectUnauthorized: false },
            'https options set for self-signed certs'
        );
        expect(connection.eventSource, 'instance of MockEventSource').to.be.an.instanceof(MockEventSource);
        expect(connection.eventSource.url, 'URL ok').to.include('https://localhost:8443/rest/events');
        expect(connection.eventSource.onopen, 'onopen set').to.be.a('function');
        expect(connection.eventSource.onerror, 'onerror set').to.be.a('function');
        expect(connection.eventSource.onmessage, 'onmessage set').to.be.a('function');

        // Simulate open
        await connection.eventSource.onopen();
        expect(stateChangeSpy.calledOnceWithExactly('UP'), 'State change called on open').to.be.true;

        stateChangeSpy.resetHistory();

        // Simulate phantom error which should be ignored
        const error = { type: {} };
        await connection.eventSource.onerror(error);
        expect(stateChangeSpy.notCalled, 'Phantom error ignored').to.be.true;
        expect(connection.eventSource.close.notCalled).to.be.true;
        expect(connection.eventSource, 'eventSource not null').to.not.be.null;

        // Simulate message
        const message = { data: 'test' };
        await connection.eventSource.onmessage(message);
        expect(messageSpy.calledWith({ data: 'test' })).to.be.true;
        expect(stateChangeSpy.notCalled, 'Message did not cause state change').to.be.true;

        await connection.eventSource.onerror({ message: 'No response' });
        expect(stateChangeSpy.calledOnceWithExactly('CONNECTING'), 'Error caused reconnect').to.be.true;
        expect(fakeSetTimeout.calledOnce, 'setTimeout called').to.be.true;
        expect(connection.retryTimer, 'retryTimer set').to.not.be.null;
    });
});
