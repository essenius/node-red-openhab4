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
const { EVENT_TYPES, RETRY_CONFIG } = require("../lib/constants");

/* describe("openHABConnection real", function () {

    // This test uses the real OpenhabConnection class, not a mock. Therefore it can fail.
    // It is used to test the connection to a real openHAB instance.

    const { OpenhabConnection } = require("../lib/openhabConnection");

    it("should provide the right result with a Get", async function () {
        this.timeout(10000); // 10 seconds
        // create a mock node object having an emit method
        const mockNode = {
            emit: sinon.spy(),
            setStatusWarning: sinon.spy(),
            setStatusError: sinon.spy(),
            send: sinon.spy(),
            warn: sinon.spy()
        };
        let connection = new OpenhabConnection({
            protocol: "http",
            host: "localhost",
            port: 8080,
            path: "",
            username: "",
            password: ""
        }, mockNode);
        const item = "TestItem";
        let result = await connection.controlItem(item);
        console.log(`result: ${result}`);
        expect(result).to.equal("MockValue");
    });
}); */

describe("openHABConnection with mocked fetch", function () {

    // Import the httpRequest function from connectionUtils.js, using proxyquire to stub out node-fetch
    // This allows us to control the behavior of fetch without making actual HTTP requests.

    let fetchStub, originalFetch, mockNode, connection;


    beforeEach(() => {
        originalFetch = global.fetch;
        fetchStub = sinon.stub();
        global.fetch = fetchStub;
        mockNode = {
            emit: sinon.spy(),
            setStatus: sinon.spy(),
            send: sinon.spy(),
            warn: sinon.spy()
        };

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
        }, mockNode);
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
    });

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
        //const node = { log: sinon.spy(), error: sinon.spy(), warn: sinon.spy(), emit: sinon.spy(), status: sinon.spy() };
        const config = { protocol: "http", host: "localhost", port: 8080, path: "", username: "", password: "", allowSelfSigned: true };
        const connection = new OpenhabConnection(config, MockEventSource, fakeSetTimeout, fakeClearTimeout);

        const openSpy = sinon.spy();
        const messageSpy = sinon.spy();
        const errorSpy = sinon.spy();
        const warningSpy = sinon.spy();
        connection.startEventSource({ onOpen: openSpy, onMessage: messageSpy, onError: errorSpy, onWarning: warningSpy });
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
        expect(warningSpy.notCalled, "onWarning not called").to.be.true;
        expect(errorSpy.notCalled, "onError not called").to.be.true;

        // Simulate message
        const message = { data: "test" };
        connection.eventSource.onmessage(message);
        expect(messageSpy.calledWith({ data: "test" })).to.be.true;
        expect(errorSpy.notCalled, "Node error not called").to.be.true;
        expect(warningSpy.notCalled, "Node warning not called").to.be.true;

        connection.eventSource.onerror({ status: 500, statusText: "Internal Server Error" });
        expect(errorSpy.calledWith(500, "Internal Server Error"), "Right message").to.be.true;
        expect(fakeSetTimeout.notCalled, "setTimeout not called").to.be.true;
        expect(connection.retryTimer, "retryTimer not set").to.be.null;
    });

    it("should start EventSource and handle open, error, and message events", function () {
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

        // simulate non-ignorable repeat error
        connection.eventSource.onerror({ status: 503, statusText: "Service Unavailable" });
        expect(warningSpy.calledWith("Retry attempt 1 in 30 s"), "onWarning called").to.be.true;
        expect(errorSpy.notCalled, "onError not called").to.be.true;
        expect(fakeSetTimeout.calledOnce, "setTimeout called").to.be.true;

        expect(connection.retryTimer, "retryTimer set").to.not.be.null;
        expect(connection.eventSource, "EventSource null").to.be.null;

        // Simulate retry by calling the function provided to setTimeout()
        retryFn();

        connection.eventSource.onerror({ status: 503, statusText: "Service Unavailable" });
        expect(warningSpy.calledWith("Retry attempt 2 in 30 s"), "onWarning called").to.be.true;
        expect(errorSpy.notCalled, "onError not called").to.be.true;

        expect(connection.retryTimer, "retryTimer set").to.not.be.null;
        expect(connection.eventSource, "EventSource null").to.be.null;


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