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

        __mockMarker() { /* dummy to satisfy SonarQube */ }
    };

    fakeSetTimeout = sinon.stub().callsFake((fn, _delay) => {
        scheduledFn = fn;
        return "timer";
    });

    fakeClearTimeout = sinon.spy();

    const module = proxyquire("../lib/openhabConnection", {
        "./connectionUtils": {
            httpRequest: httpRequestStub,
            getEventSource: () => MockEventSource,
            addAuthHeader: () => { }
        }
    });
    createOpenhabConnection = module.createOpenhabConnection;
});

function createConnection(configOverrides = {}, optionsOverrides = {}) {
    return createOpenhabConnection(
        {
            url: "http://localhost:8080",
            token: "",
            username: "",
            password: "",
            isHttps: false,
            ...configOverrides
        },
        {
            eventSourceImpl: MockEventSource,
            setTimeoutImpl: fakeSetTimeout,
            clearTimeoutImpl: fakeClearTimeout,
            ...optionsOverrides
        }
    );
}

// ----------------------------
// HTTP BEHAVIOR
// ----------------------------

describe("OpenhabConnection sendRequest", function () {

    it("should reject when not UP", async function () {
        const connection = createConnection.call(this);

        const result = await connection.sendRequest("/rest/items");

        expect(result.ok).to.be.false;
        expect(result.type).to.equal(ERROR_TYPES.SYSTEM);
    });

    it("should enter CONNECTING on retryable error", async function () {
        const connection = createConnection.call(this);

        connection.state = STATE.UP;

        httpRequestStub.resolves({
            ok: false,
            retry: true,
            status: 500
        });

        await connection.sendRequest("/rest/items");

        expect(connection.state).to.equal(STATE.CONNECTING);
    });

    [
        {
            name: "health probe succeeds → state stays UP",
            secondResponse: { ok: true },
            expectedState: STATE.UP
        },
        {
            name: "health probe fails → state moves to CONNECTING",
            secondResponse: { ok: false },
            expectedState: STATE.CONNECTING
        }
    ].forEach(({ name, secondResponse, expectedState }) => {
        it(`should call health probe for 404/500 without retry flag and ${name}`, async function () {
            const connection = createConnection.call(this);
            connection.state = STATE.UP;

            httpRequestStub
                .onFirstCall().resolves({ ok: false, retry: false, status: 404 })
                .onSecondCall().resolves(secondResponse);

            await connection.sendRequest("/rest/items");

            expect(httpRequestStub.calledTwice).to.be.true;
            expect(connection.state, `State after probe: ${name}`).to.equal(expectedState);
        });
    });
});

// ----------------------------
// SSE LIFECYCLE
// ----------------------------

describe("OpenhabConnection EventSource lifecycle", function () {

    it("should create EventSource with correct URL", function () {
        const connection = createConnection.call(this);
        connection.startEventSource();

        expect(connection.eventSource).to.be.instanceOf(MockEventSource);
        expect(connection.eventSource.url).to.include("/rest/events");
    });

    it("should transition to UP on open", function () {
        const stateSpy = sinon.spy();
        const connection = createConnection.call(this, {}, { onStateChange: stateSpy });
        expect(connection.state, "State DOWN right after start").to.equal(STATE.DOWN);

        connection.startEventSource();
        connection.eventSource.onopen();

        expect(connection.state, "State UP after startEventSource and onopen").to.equal(STATE.UP);
        expect(stateSpy.calledWith(STATE.UP), "StateSpy called with UP").to.be.true;
    });

    it("should transition to CONNECTING on error", function () {
        const connection = createConnection.call(this);

        connection.startEventSource();
        connection.eventSource.onerror({ message: "failure" });

        expect(connection.state).to.equal(STATE.CONNECTING);
    });

    [
        { name: "undefined", payload: undefined, expected: false },
        { name: "null", payload: null, expected: false },
        { name: "string", payload: "error", expected: false },
        { name: "number", payload: 42, expected: false },
        { name: "bool", payload: true, expected: false },
        { name: "object without type", payload: { message: "fail" }, expected: false },
        { name: "object with empty type", payload: { type: {} }, expected: true },
        { name: "object with non-empty type", payload: { type: { code: 123 } }, expected: false }
    ].forEach(({ name, payload, expected }) => {

        it(`should ${(expected ? "not " : "")}ignore errors with payload ${name}`, function () {
            const connection = createConnection.call(this);
            connection.startEventSource();
            connection.eventSource.onerror(payload);
            expect(connection.state !== STATE.CONNECTING).to.equal(expected);
        });
    })

});

// ----------------------------
// RETRY SCHEDULER
// ----------------------------

describe("OpenhabConnection Retry scheduler", function () {

    it("should schedule reconnect when entering CONNECTING", async function () {
        const connection = createConnection.call(this);
        await connection._enterConnecting();
        expect(fakeSetTimeout.calledOnce).to.be.true;
    });

    it("should increase backoff when probe unhealthy", async function () {
        const connection = createConnection.call(this);
        sinon.stub(connection, "_probeHealth").resolves(false);
        await connection._enterConnecting();

        await scheduledFn();

        expect(connection.retryAttempts).to.equal(1);
        expect(connection.currentRetryDelay)
            .to.equal(RETRY_CONFIG.EVENTSOURCE_INITIAL_DELAY * RETRY_CONFIG.EVENTSOURCE_BACKOFF_FACTOR);
    });

    it("should restart EventSource when probe healthy", async function () {
        const connection = createConnection.call(this);
        sinon.stub(connection, "_probeHealth").resolves(true);
        const startSpy = sinon.spy(connection, "startEventSource");
        await connection._enterConnecting();

        await scheduledFn();

        expect(startSpy.calledOnce).to.be.true;
    });

    it("should not restart after close()", async function () {
        const connection = createConnection.call(this);
        sinon.stub(connection, "_probeHealth").resolves(true);
        const startSpy = sinon.spy(connection, "startEventSource");

        await connection._enterConnecting();
        connection.close();
        await scheduledFn();

        expect(startSpy.notCalled).to.be.true;
    });

});

// ----------------------------
// STATE CALLBACKS
// ----------------------------

describe("OpenhabConnection State change callback", function () {

    it("should notify on state changes", async function () {
        const stateSpy = sinon.spy();

        const connection = createConnection.call(this, {}, {
            onStateChange: stateSpy
        });

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

describe("OpenhabConnection EventSource event tests", function () {
    it("should start EventSource and handle open, error, and message events", async function () {
        const messageSpy = sinon.spy();
        const stateChangeSpy = sinon.spy();
        const connection = createConnection.call(this, { url: "https://localhost:8443", isHttps: true, allowSelfSigned: true }, { onMessage: messageSpy, onStateChange: stateChangeSpy })

        connection.startEventSource();
        expect(connection.eventSource.options.https).to.deep.equal({ rejectUnauthorized: false }, "https options set for self-signed certs");
        expect(connection.eventSource, "instance of MockEventSource").to.be.an.instanceof(MockEventSource);
        expect(connection.eventSource.url, "URL ok").to.include("https://localhost:8443/rest/events");
        expect(connection.eventSource.onopen, "onopen set").to.be.a('function');
        expect(connection.eventSource.onerror, "onerror set").to.be.a('function');
        expect(connection.eventSource.onmessage, "onmessage set").to.be.a('function');

        // Simulate open
        await connection.eventSource.onopen();
        expect(stateChangeSpy.calledOnceWithExactly("UP"), "State change called on open").to.be.true;

        stateChangeSpy.resetHistory();

        // Simulate phantom error which should be ignored
        const error = { "type": {} };
        await connection.eventSource.onerror(error);
        expect(stateChangeSpy.notCalled, "Phantom error ignored").to.be.true;
        expect(connection.eventSource.close.notCalled).to.be.true;
        expect(connection.eventSource, "eventSource not null").to.not.be.null;

        // Simulate message
        const message = { data: "test" };
        await connection.eventSource.onmessage(message);
        expect(messageSpy.calledWith({ data: "test" })).to.be.true;
        expect(stateChangeSpy.notCalled, "Message did not cause state change").to.be.true;

        await connection.eventSource.onerror({ message: "No response" });
        expect(stateChangeSpy.calledOnceWithExactly("CONNECTING"), "Error caused reconnect").to.be.true;
        expect(fakeSetTimeout.calledOnce, "setTimeout called").to.be.true;
        expect(connection.retryTimer, "retryTimer set").to.not.be.null;
    });
});


//});


//---------------------




/*
describe("openhabConnection with mocked fetch", function () {

    // Import the httpRequest function from connectionUtils.js, using proxyquire to stub out node-fetch
    // This allows us to control the behavior of fetch without making actual HTTP requests.

    let fetchStub, originalFetch, connection;

    beforeEach(() => {
        originalFetch = globalThis.fetch;
        fetchStub = sinon.stub();
        globalThis.fetch = fetchStub;

        const { OpenhabConnection } = proxyquire("../lib/openhabConnection", {
            "./connectionUtils": proxyquire("../lib/connectionUtils", {
                "node-fetch": fetchStub
            })
        });

        connection = new OpenhabConnection({
            url: "http://localhost:8081",
            token: "",
            username: "",
            password: "",
            retryTimeout: 0
        });
    });

    afterEach(() => {
        if (originalFetch === undefined) {
            delete globalThis.fetch;
        } else {
            globalThis.fetch = originalFetch;
        }
    });
    describe("sendRequest tests", function () {
        it("should return error details on fetch failure", async function () {
            const cause = new Error("Network failure");
            cause.code = "ECONNREFUSED";
            const err = new TypeError("fetch failed", { cause });
            fetchStub.rejects(err);
            const response = await connection.sendRequest("/rest/items/TestItem");

            expect(response).to.deep.equal({ attempts: 1, ok: false, retry: true, type: "network", message: "ECONNREFUSED" });
        });

        it("should return error details on fetch with missing item", async function () {
            fetchStub.resolves(createNotFoundResponse(
                JSON.stringify({ error: { message: "Item TestItem does not exist!", "http-code": 404 } })
            ));
            const response = await connection.sendRequest("/rest/items/TestItem");


            expect(fetchStub.calledOnce).to.be.true;
            expect(response.status).to.equal(404);
            expect(response.message).to.include("Item TestItem does not exist!");
        });

        it("should return error details from http if no body", async function () {
            fetchStub.resolves(createNotFoundResponse(""));
            const result = await connection.sendRequest("/rest/items/TestItem");

            expect(fetchStub.calledOnce).to.be.true;
            expect(result.status).to.equal(404);
            expect(result.message).to.include("Not Found");
        });

        it("should return value if all goes well", async function () {
            fetchStub.resolves(createOkFetchResponse(
                {
                    link: "http://localhost:8080/rest/items/ub_warning", state: "123",
                    stateDescription: { pattern: "%s", readOnly: false, options: [] },
                    editable: false, type: "String", name: "ub_warning", label: "Warning",
                    tags: [], groupNames: ["Indoor"]
                }
            ));
            const response = await connection.sendRequest("/rest/items/ub_warning");

            expect(fetchStub.calledOnce).to.be.true;
            expect(response.data.name).to.equal("ub_warning");
            expect(response.data.state).to.equal("123");
        });

        it("should not break if runtimeInfo does not exist", async function () {
            fetchStub.resolves(createOkFetchResponse({ version: "3", links: [] }));
            const response = await connection.sendRequest("/rest");
            expect(fetchStub.calledOnce).to.be.true;
            expect(response.data.version).to.equal("3");
        });
    });

    it("should handle multiple results successfully", async function () {
        fetchStub.resolves(createOkFetchResponse(["item1", "item2"]));
        const items = await connection.sendRequest("/rest/items");

        expect(fetchStub.calledOnce).to.be.true;
        expect(items.ok, "OK response").to.be.true;
        expect(items.data, "data ok").to.deep.equal(["item1", "item2"]);
        expect(fetchStub.getCall(0).args[0]).to.equal("http://localhost:8081/rest/items", "right call");
    });
});

describe("openhabConnection StartEventSource real", function () {
    it("should run the real event source", function () {
        const { OpenhabConnection } = require('../lib/openhabConnection');
        const config = { url: "http://localhost:8080", token: "", username: "", password: "", allowSelfSigned: true };
        const connection = new OpenhabConnection(config);
        connection.startEventSource({ onOpen: {}, onMessage: {}, onError: {}, endPoint: "/rest/events" });

        if (connection.eventSource && connection.eventSource.close) {
            connection.eventSource.close();
        }
    });
});

describe("openhabConnection StartEventSource", function () {
    class MockEventSource {
        constructor(url, options) {
            this.url = url;
            this.options = options;
            this.onopen = null;
            this.onerror = null;
            this.onmessage = null;
            this.close = sinon.stub();
        }

        __mockMarker() { /* Satisfy Sonar – this class intentionally acts as a test double *//* }
}

const { OpenhabConnection } = require('../lib/openhabConnection');
const sinon = require('sinon');

let retryFn;
const fakeSetTimeout = sinon.stub().callsFake((fn, _delay) => {
retryFn = fn; // Save the function for manual invocation
return fn;    // Return the function as the "timer handle"
});
const fakeClearTimeout = sinon.spy();

it("should start EventSource and handle open, error, and message events", function () {
const config = { url: "https://localhost:8080", token: "", username: "", password: "", allowSelfSigned: true, retryTimeout: 0 };
setDefaults(config);
const connection = new OpenhabConnection(config, MockEventSource, fakeSetTimeout, fakeClearTimeout);

const openSpy = sinon.spy();
const messageSpy = sinon.spy();
const errorSpy = sinon.spy();
connection.startEventSource({ onOpen: openSpy, onMessage: messageSpy, onError: errorSpy, endPoint: "/rest/events" });
expect(connection.eventSource.options.https).to.deep.equal({ rejectUnauthorized: false }, "https options set for self-signed certs");
expect(connection.eventSource, "instance of MockEventSource").to.be.an.instanceof(MockEventSource);
expect(connection.eventSource.url, "URL ok").to.include("https://localhost:8080/rest/events");
expect(connection.eventSource.onopen, "onopen set").to.be.a('function');
expect(connection.eventSource.onerror, "onerror set").to.be.a('function');
expect(connection.eventSource.onmessage, "onmessage set").to.be.a('function');

// Simulate open
connection.eventSource.onopen();
expect(openSpy.calledOnce).to.be.true;

// Simulate phantom error which should be ignored
const error = { "type": {} };
connection.eventSource.onerror(error);
expect(connection.eventSource.close.notCalled).to.be.true;
expect(connection.eventSource, "eventSource not null").to.not.be.null;
expect(errorSpy.notCalled, "onError not called").to.be.true;

// Simulate message
const message = { data: "test" };
connection.eventSource.onmessage(message);
expect(messageSpy.calledWith({ data: "test" })).to.be.true;
expect(errorSpy.notCalled, "Node error not called").to.be.true;

connection.eventSource.onerror({ message: "No response" });
expect(errorSpy.calledOnce).to.be.true;
const errorArgs = errorSpy.lastCall.args;
expect(errorArgs, "Right message").to.deep.equal(["No response (Retry #1 in 2.5 s)"]);
expect(fakeSetTimeout.calledOnce, "setTimeout called").to.be.true;
expect(connection.retryTimer, "retryTimer set").to.not.be.null;
});

it("should start EventSource allowing self signed and handle open, error, and message events", function () {
const config = { url: "http://localhost:8080", token: "", username: "", password: "" };
const connection = new OpenhabConnection(config, MockEventSource, fakeSetTimeout, fakeClearTimeout);

const errorSpy = sinon.spy();
const warningSpy = sinon.spy();
connection.startEventSource({ onError: errorSpy, onWarning: warningSpy, endPoint: "/rest/events" });

expect(connection.eventSource.url, "URL ok").to.include("http://localhost:8080/rest/events");
expect(connection.eventSource.options.https).to.be.undefined;
connection.eventSource.onopen();

const message = { data: "test" };
connection.eventSource.onmessage(message);

expect(errorSpy.notCalled, "Node error not called").to.be.true;

function validateError(index, delay) {
fakeSetTimeout.resetHistory();
connection.eventSource.onerror({ message: "ERRCONREFUSED" });
const errorArgs = errorSpy.lastCall.args;
expect(errorArgs, `onError #${index} called with right parameters`)
.to.deep.equal([`ERRCONREFUSED (Retry #${index} in ${delay} s)`]);

expect(fakeSetTimeout.calledOnce, "setTimeout called").to.be.true;
expect(connection.retryTimer, "retryTimer set").to.not.be.null;
expect(connection.eventSource, "EventSource null").to.be.null;
}

// simulate error and validate handling
validateError(1, 2.5);

// Simulate retry by calling the function provided to setTimeout()
retryFn();
validateError(2, 5);

retryFn();
validateError(3, 10);

retryFn();
validateError(4, 20);

retryFn();
validateError(5, 40);

retryFn();
validateError(6, 60);

// start the EventSource again to get it back in good shape.
fakeClearTimeout.resetHistory();
connection.startEventSource({ endPoint: "/rest/events?topics=third-topic" });
expect(fakeClearTimeout.calledOnce, "clearTimeout called (when calling close()").to.be.true;
expect(connection.eventSource, "EventSource not null").to.not.be.null;

// start the EventSource again with different options. This should clear the existing one first.
connection.startEventSource({ endPoint: "/rest/events?topics=third-topic" });
expect(connection.eventSource.url, "URL ok").to.include("http://localhost:8080/rest/events?topics=third-topic");
expect(!connection.retryTimer, "retryTimer reset").to.be.true;
expect(connection.eventSource, "EventSource re-initialized after close()").to.not.be.null;
});


});

*/
