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
const sinon = require("sinon");
const { expect } = require("chai");
const proxyquire = require("proxyquire");

// Helper to create the handler with mocks
function getHandler(fetchResult) {
    const mockFetchOpenHAB = sinon.stub().resolves(fetchResult);
    const mockGetConnectionString = sinon.stub().returns("http://mocked");
    const controller = proxyquire("../nodes/controller.js", {
        "../lib/connectionUtils": {
            fetchOpenHAB: mockFetchOpenHAB,
            getConnectionString: mockGetConnectionString
        }
    });
    return {
        handler: controller.createItemsHandler(mockFetchOpenHAB, mockGetConnectionString),
        mockFetchOpenHAB,
        mockGetConnectionString
    };
}

// Helper to create a mock Express response
function createMockResponse() {
    return {
        send: sinon.spy(),
        status: sinon.stub().returnsThis()
    };
}

function createMockRED(registerType = sinon.spy(), httpAdminGet = sinon.spy()) {
    return {
        RED: {
            nodes: { registerType, createNode: sinon.spy() },
            httpAdmin: { get: httpAdminGet, use: sinon.spy() }
        },
        registerType,
        httpAdminGet
    };
}

describe("controller.js /openhab4/items handler", function () {
    it("should create the right URL and return items from mocked fetchOpenHAB", async function () {
        // Arrange: create mocks
        const { handler, mockFetchOpenHAB, mockGetConnectionString } = getHandler({ data: ["item1", "item2"] });
        const request = { query: { some: "config" } };
        const response = createMockResponse();

        // Act
        await handler(request, response);

        // Assert
        expect(mockGetConnectionString.calledOnce).to.be.true;
        expect(mockFetchOpenHAB.calledOnce).to.be.true;
        const urlArg = mockFetchOpenHAB.getCall(0).args[0];
        expect(urlArg).to.equal("http://mocked/rest/items");
        expect(response.status.notCalled).to.be.true; // No error, so status should not be called
        expect(response.send.calledWith(["item1", "item2"])).to.be.true;
    });

    it("should propagate status 503 and error message when fetchOpenHAB returns retry", async function () {
        // Arrange: create mocks
        const { handler } = getHandler({ retry: true, status: 503 });
        const request = { query: { some: "config" } };
        const response = createMockResponse();

        // Act
        await handler(request, response);

        // Assert
        expect(response.status.calledOnceWith(503)).to.be.true;
        const message = response.send.firstCall.args[0];
        expect(message).to.include("OpenHAB returned 503");
    });

    it("should return status 500 and error message when authentication fails in fetchOpenHAB", async function () {
        // Arrange: create mocks
        const { handler } = getHandler({ retry: false, status: 401, error: new Error("Authentication failed") });
        const request = { query: { some: "config" } };
        const response = createMockResponse();

        // Act
        await handler(request, response);

        // Assert
        expect(response.status.calledOnceWith(500)).to.be.true;
        const message = response.send.firstCall.args[0];
        expect(message).to.include("Authentication failed");
    });
});

describe("controllerModule", function () {
    it("should register the node type and HTTP endpoint", function () {
        // Arrange: create spies for RED methods
        const { RED, registerType, httpAdminGet } = createMockRED();

        // Proxyquire to avoid running real admin code
        const controllerModule = proxyquire("../nodes/controller.js", {
            "./admin": () => { } // stub out admin
        });

        // Act
        controllerModule(RED);

        // Assert
        expect(httpAdminGet.calledWith(
            "/openhab4/items"
        )).to.be.true;

        expect(registerType.calledWith(
            "openhab4-controller"
        )).to.be.true;
    });

    it("should call createControllerNode when a node is instantiated", function () {

        const controllerModule = require("../nodes/controller.js");

        // Arrange: create a RED mock with spies
        const { RED, registerType, httpAdminGet } = createMockRED();

        // Act: register the node type
        controllerModule(RED);

        // Find the function passed to registerType
        const call = registerType.getCalls().find(c => c.args[0] === "openhab4-controller");
        expect(call).to.exist;
        const createControllerNode = call.args[1];

        // Prepare a config and a spy for RED.nodes.createNode
        const config = { name: "TestController", host: "localhost" };
        const nodeThis = {
            credentials: {},
            name: "",
            log: sinon.spy(),
            on: sinon.spy(),
            warn: sinon.spy(),
            emit: sinon.spy(),
            status: sinon.spy(),
            error: sinon.spy()
        };
        RED.nodes.createNode = sinon.spy();

        // Call createControllerNode with the test context and config
        createControllerNode.call(nodeThis, config);

        // Assert: RED.nodes.createNode was called and nodeThis was set up
        expect(RED.nodes.createNode.calledOnce).to.be.true;
        expect(nodeThis.name).to.include("TestController");
    });
});
