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
            setStatusWarning: sinon.spy(),
            setStatusError: sinon.spy(),
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

    it("should throw an error on fetch failure", async function () {
        const cause = JSON.parse('{"errno":-4078,"code":"ECONNREFUSED","syscall":"connect","address":"localhost","port":8081}');
        const error = new Error("fetch failed");
        error.cause = cause;
        fetchStub.rejects(error);
        try {
            const response = await connection.controlItem("TestItem");
            console.log(`Unexpected response: ${JSON.stringify(response)}`);
            expect.fail("Expected error to be thrown");
        } catch (error) {
            console.log(`Caught error: ${JSON.stringify(error)}`);
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
            console.log(`Caught error: ${JSON.stringify(error)}`);

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
            console.log(`Caught error: ${JSON.stringify(error)}`);

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
        console.log(`Response: ${JSON.stringify(response)}`);
        expect(fetchStub.calledOnce).to.be.true;
        expect(response.name).to.equal("ub_warning");
        expect(response.state).to.equal("123");
    });

});

