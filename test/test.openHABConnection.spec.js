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

describe("openHABConnection real", function () {

    // This test uses the real OpenhabConnection class, not a mock. Therefore it can fail.
    // It is used to test the connection to a real openHAB instance, but is forgiving if there isn't one.

    const { OpenhabConnection } = require("../lib/openhabConnection");

    it("should provide the right result with a Get or throw a connection refused", async function () {
        this.timeout(5000); // 5 seconds

        let connection = new OpenhabConnection({
            protocol: "http",
            host: "localhost",
            port: 8082,
            path: "",
            username: "",
            password: ""
        });
        const item = "ub_warning";
        try {
            let items = await connection.getItems();
            expect(items).to.include(item, "Item should be in the list of items");
        } catch (error) {
            expect(String(error)).to.include("ECONNREFUSED", "Connection refused error expected");
        }
    });
});

describe("openHABConnection with mocked fetch", function () {

    // Import the httpRequest function from connectionUtils.js, using proxyquire to stub out node-fetch
    // This allows us to control the behavior of fetch without making actual HTTP requests.

    let fetchStub, originalFetch, connection;


    beforeEach(() => {
        originalFetch = global.fetch;
        fetchStub = sinon.stub();
        global.fetch = fetchStub;

        const { OpenhabConnection } = proxyquire("../lib/openhabConnection", {
            "./connectionUtils": proxyquire("../lib/connectionUtils", {
                "node-fetch": fetchStub
            })
        });

        connection = new OpenhabConnection({
            protocol: "http",
            host: "localhost",
            port: 8081,
            path: "",
            username: "",
            password: ""
        });
    });

    afterEach(() => {
        if (originalFetch === undefined) {
            delete global.fetch;
        } else {
            global.fetch = originalFetch;
        }
    });
    describe("controlItem tests", function () {
        it("should throw an error on fetch failure", async function () {
            const cause = JSON.parse('{"errno":-4078,"code":"ECONNREFUSED","syscall":"connect","address":"localhost","port":8081}');
            const error = new Error("fetch failed");
            error.cause = cause;
            fetchStub.rejects(error);
            try {
                await connection.controlItem("TestItem");
                expect.fail("Expected error to be thrown");
            } catch (error) {
                expect(error.message).to.equal("ECONNREFUSED");
                expect(error.status).to.equal(-4078);
            }
        });

        it("should return error details on fetch with missing item", async function () {
            let returnObject = {
                text: async () => JSON.stringify({ error: { message: "Item TestItem does not exist!", "http-code": 404 } }),
                headers: {
                    get: (name) => name.toLowerCase() === "content-type" ? "application/json" : undefined
                },
                status: 404,
                statusText: "Not Found"
            };

            const fakeResponse = returnObject;
            fetchStub.resolves(fakeResponse);
            try {
                await connection.controlItem("TestItem");
                expect.fail("Expected error to be thrown");
            } catch (error) {

                expect(fetchStub.calledOnce).to.be.true;
                expect(error.status).to.equal(404);
                expect(error.message).to.include("Item TestItem does not exist!");
            }
        });

        it("should return error details from http if no body", async function () {
            let returnObject = {
                text: async () => "",
                status: 404,
                statusText: "Not Found"
            };

            const fakeResponse = returnObject;
            fetchStub.resolves(fakeResponse);
            try {
                await connection.controlItem("TestItem");
                expect.fail("Expected error to be thrown");
            } catch (error) {
                expect(fetchStub.calledOnce).to.be.true;
                expect(error.status).to.equal(404);
                expect(error.message).to.include("Not Found");
            }
        });

        it("should return value if all goes well", async function () {
            let returnObject = {
                text: async () => '{"link":"http://localhost:8080/rest/items/ub_warning","state":"123","stateDescription":{"pattern":"%s","readOnly":false,"options":[]},"editable":false,"type":"String","name":"ub_warning","label":"Warning","tags":[],"groupNames":["Indoor"]}',
                headers: {
                    get: (name) => name.toLowerCase() === "content-type" ? "application/json" : undefined
                },
                status: 200,
                statusText: "OK"
            };

            const fakeResponse = returnObject;
            fetchStub.resolves(fakeResponse);
            const response = await connection.controlItem("ub_warning");
            expect(fetchStub.calledOnce).to.be.true;
            expect(response.name).to.equal("ub_warning");
            expect(response.state).to.equal("123");
        });
    });

    it("should handle getItems() successfully", async function () {
        let returnObject = {
            text: async () => JSON.stringify(["item1", "item2"]),
            headers: {
                get: (name) => name.toLowerCase() === "content-type" ? "application/json" : undefined
            },
            status: 200,
            statusText: "OK"
        };

        const fakeResponse = returnObject;
        fetchStub.resolves(fakeResponse);
        const items = await connection.getItems();
        expect(fetchStub.calledOnce).to.be.true;
        expect(items).to.deep.equal(["item1", "item2"]);
        expect(fetchStub.getCall(0).args[0]).to.equal("http://localhost:8081/rest/items");
    });


    /*
    it("should handle testIfLive() successfully", async function () {
        let returnObject = {
            text: async () => JSON.stringify({ status: "OK" }),
            headers: {
                get: (name) => name.toLowerCase() === "content-type" ? "application/json" : undefined
            },
            status: 200,
            statusText: "OK"
        };

        const fakeResponse = returnObject;
        fetchStub.resolves(fakeResponse);
        const isLive = await connection.testIfLive();
        expect(fetchStub.calledOnce).to.be.true;
        expect(isLive).to.be.true;
        expect(fetchStub.getCall(0).args[0]).to.equal("http://localhost:8081/rest");
    }); */

});

describe("openHABConnection StartEventSource", function () {
    class MockEventSource {
        constructor(url, options) {
            this.url = url;
            this.options = options;
            this.onopen = null;
            this.onerror = null;
            this.onmessage = null;
            this.close = sinon.spy();
        }
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
        const config = { protocol: "http", host: "localhost", port: 8080, path: "", username: "", password: "", allowSelfSigned: true };
        const connection = new OpenhabConnection(config, MockEventSource, fakeSetTimeout, fakeClearTimeout);

        const openSpy = sinon.spy();
        const messageSpy = sinon.spy();
        const errorSpy = sinon.spy();
        connection.startEventSource({ onOpen: openSpy, onMessage: messageSpy, onError: errorSpy });
        expect(connection.eventSource.options.https).to.deep.equal({ rejectUnauthorized: false }, "https options set for self-signed certs");
        expect(connection.eventSource, "instance of MockEventSource").to.be.an.instanceof(MockEventSource);
        expect(connection.eventSource.url, "URL ok").to.include("http://localhost:8080/rest/events");
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

        connection.eventSource.onerror("No response");
        expect(errorSpy.calledOnce).to.be.true;
        const errorArgs = errorSpy.lastCall.args;
        expect(errorArgs, "Right message").to.deep.equal([500, "No response (Retry #1 in 2.5 s)", "Retry #1 in 2.5 s"]);
        expect(fakeSetTimeout.calledOnce, "setTimeout called").to.be.true;
        expect(connection.retryTimer, "retryTimer set").to.not.be.null;
    });

    it("should start EventSource allowing self signed and handle open, error, and message events", function () {
        const config = { protocol: "http", host: "localhost", port: 8080, path: "", username: "", password: "" };
        const connection = new OpenhabConnection(config, MockEventSource, fakeSetTimeout, fakeClearTimeout);

        const errorSpy = sinon.spy();
        const warningSpy = sinon.spy();
        connection.startEventSource({ onError: errorSpy, onWarning: warningSpy, topics: "first-topic" });

        expect(connection.eventSource.url, "URL ok").to.include("http://localhost:8080/rest/events?topics=first-topic");
        expect(connection.eventSource.options.https).to.be.undefined;

        connection.eventSource.onopen();

        const message = { data: "test" };
        connection.eventSource.onmessage(message);

        expect(errorSpy.notCalled, "Node error not called").to.be.true;

        function validateError(index, delay) {
            fakeSetTimeout.resetHistory();
            connection.eventSource.onerror({ type: { errno: -111, code: "ERRCONREFUSED" } });
            const errorArgs = errorSpy.lastCall.args;
            expect(errorArgs, `onError #${index} called with right parameters`)
                .to.deep.equal([-111, `ERRCONREFUSED (Retry #${index} in ${delay} s)`, `Retry #${index} in ${delay} s`]);
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
        connection.startEventSource({ topics: "second-topic" });
        expect(fakeClearTimeout.calledOnce, "clearTimeout called (when calling close()").to.be.true;
        expect(connection.eventSource, "EventSource not null").to.not.be.null;

        // start the EventSource again with different options. This should clear the existing one first.
        connection.startEventSource({ topics: "third-topic" });
        expect(connection.eventSource.url, "URL ok").to.include("http://localhost:8080/rest/events?topics=third-topic");
        expect(!connection.retryTimer, "retryTimer reset").to.be.true;
        expect(connection.eventSource, "EventSource re-initialized after close()").to.not.be.null;
    });

});