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

// make sure addStatusMethods is not called in the tests, as that overrides the spy() calls

const controllerLogic = proxyquire("../lib/controllerLogic", {
    "./statusUtils": { addStatusMethods: function () { } }
});
const controllerModule = proxyquire("../nodes/controller.js", {
    "../lib/controllerLogic": controllerLogic
});

// Helper to create the handler with mocks
function getHandler(fetchResult) {
    const mockHttpRequest = sinon.stub().resolves(fetchResult);
    const mockGetConnectionString = sinon.stub().returns("http://mocked");
    const controller = proxyquire("../nodes/controller.js", {
        "../lib/connectionUtils": {
            httpRequest: mockHttpRequest,
            getConnectionString: mockGetConnectionString
        }
    });
    return {
        handler: controller.createItemsHandler(mockHttpRequest, mockGetConnectionString),
        mockHttpRequest,
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

function createNodeThis() {
    return {
        credentials: {},
        name: "",
        log: sinon.spy(),
        on: sinon.spy(),
        warn: sinon.spy(),
        emit: sinon.spy(),
        status: sinon.spy(),
        error: sinon.spy(),
        setStatusError: sinon.spy()
    };
}


describe("openhab4-controller /openhab4/items handler", function () {
    it("should create the right URL and return items from mocked httpRequest", async function () {
        // Arrange: create mocks
        const { handler, mockHttpRequest, mockGetConnectionString } = getHandler({ data: ["item1", "item2"] });
        const request = { query: { some: "config" } };
        const response = createMockResponse();

        // Act
        await handler(request, response);

        // Assert
        expect(mockGetConnectionString.calledOnce).to.be.true;
        expect(mockHttpRequest.calledOnce).to.be.true;
        const urlArg = mockHttpRequest.getCall(0).args[0];
        expect(urlArg).to.equal("http://mocked/rest/items");
        expect(response.status.notCalled).to.be.true; // No error, so status should not be called
        expect(response.send.calledWith(["item1", "item2"])).to.be.true;
    });

    it("should propagate status and error message when httpRequest does not return data", async function () {
        // Arrange: create mocks
        const { handler } = getHandler({ retry: true, status: 503, message: "Service Unavailable" });
        const request = { query: { some: "config" } };
        const response = createMockResponse();

        // Act
        await handler(request, response);

        // Assert
        expect(response.status.calledOnceWith(503), "Response.status must be 503").to.be.true;
        const message = response.send.firstCall.args[0];
        expect(message).to.include("Service Unavailable");
    });
});

describe("openhab4-controller controllerModule", function () {
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

    function testCreateControllerNode(nodeThis, config, expectedNamePart) {
        try {
            const { RED, registerType } = createMockRED();
            controllerModule(RED);
            const call = registerType.getCalls().find(c => c.args[0] === "openhab4-controller");
            expect(call).to.exist;
            const createControllerNode = call.args[1];
            RED.nodes.createNode = sinon.spy();
            createControllerNode.call(nodeThis, config);
            expect(RED.nodes.createNode.calledOnce, `Created node for test '${expectedNamePart}'`).to.be.true;
            expect(nodeThis.name, `name ${expectedNamePart} included`).to.include(expectedNamePart);
        } catch (err) {
            // ensure we don't leave the node in a bad state
        }
        // the only handler set in createControllerNode is the close handler, so we can check that
        if (nodeThis.on.callCount > 0) {
            // if it was set, call the close handler to break out of waitForOpenHABReady
            nodeThis.on.getCall(0).args[1](false, () => { });
        }
    }

    it("should call createControllerNode when a node is instantiated", function () {
        const nodeThis = createNodeThis();
        testCreateControllerNode(nodeThis, { name: "TestController", host: "localhost" }, "TestController");

    });

    it("should be ok with not having credentials", function () {

        const nodeThis = createNodeThis();
        nodeThis.credentials = null;
        testCreateControllerNode(nodeThis, { host: "localhost" }, "localhost:8080");
        expect(nodeThis.error.calledOnce).to.be.false;
    });
});
