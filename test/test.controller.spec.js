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
const controllerFactory = require('../nodes/controller')._create;

const { createMockRED, createNodeThis, createMockResponse } = require('./helpers/mockRED');

const { createControllerDependencies } = require('./helpers/mockControllerDependencies');

function setupControllerTest() {
    const deps = createControllerDependencies();

    const controllerModule = controllerFactory({
        setupHandler: deps.setupHandlerStub
    });

    const RED = createMockRED();
    controllerModule(RED);

    const createNode = RED.nodes.registerType.getCall(0).args[1];

    return { deps, createNode };
}

describe("openhab4-controller", function () {

    describe("module registration", function () {

        it("should register node type and HTTP endpoints", function () {

            const RED = createMockRED();

            const controllerModule = controllerFactory();
            controllerModule(RED);

            expect(RED.nodes.registerType.calledWith("openhab4-controller")).to.be.true;
            expect(RED.httpAdmin.get.calledTwice).to.be.true;
        });

    });

    describe("node instantiation", function () {

        it("should call setupHandler", function () {
            const { deps, createNode } = setupControllerTest();
            const nodeThis = createNodeThis();
            createNode.call(nodeThis, { name: "Test", url: "http://localhost" });
            expect(deps.setupHandlerStub.calledOnce).to.be.true;
            expect(nodeThis.handler).to.equal(deps.fakeHandler);
        });

        it("should default name to stripped url when name missing", function () {
            const { createNode } = setupControllerTest();
            const nodeThis = createNodeThis();
            createNode.call(nodeThis, { url: "http://localhost" });
            expect(nodeThis.name).to.equal("localhost");
        });

    });

    describe("HTTP resource handlers", function () {

        it("should return data when request succeeds", async function () {

            const deps = createControllerDependencies();
            const controllerModule = controllerFactory({
                httpRequestFn: deps.httpRequestStub
            });

            const RED = createMockRED();
            RED.nodes.getNode.returns({
                handler: { config: { url: "http://mocked" } }
            });

            const handler = controllerModule.createResourceHandler(RED, "/rest/items");
            const res = createMockResponse();
            await handler({ query: { controller: "123" } }, res);
            expect(deps.httpRequestStub.calledOnce).to.be.true;
            expect(res.send.called).to.be.true;
        });

    });

    describe("createResourceHandler", function () {

        it("should return 404 if controller does not exist", async function () {
            const RED = createMockRED();
            const controllerModule = controllerFactory({
                setupHandler: sinon.stub()
            });

            controllerModule(RED); // registers nodes and HTTP endpoints

            const req = { query: { controller: "nonexistent" } };
            const res = createMockResponse();

            // Ensure getNode returns undefined
            RED.nodes.getNode = sinon.stub().withArgs("nonexistent").returns(undefined);

            // Create the handler
            const handler = controllerModule.createResourceHandler(RED, "/items");

            // Call the handler
            await handler(req, res);

            expect(res.status.calledOnceWith(404)).to.be.true;
            expect(res.send.calledOnce).to.be.true;
        });

        it("should propagate non-200 status from fetch", async function () {
            const fakeHttpRequest = sinon.stub().resolves({
                ok: false,
                status: 503,
                message: "Service Unavailable"
            });

            const controllerFactory = require("../nodes/controller")._create;

            const controllerModule = controllerFactory({
                httpRequestFn: fakeHttpRequest
            });

            const RED = createMockRED();

            RED.nodes.getNode = sinon.stub().returns({
                handler: { config: { url: "http://localhost:8080" } }
            });

            controllerModule(RED);

            const handler = controllerModule.createResourceHandler(RED, "/foo");

            const req = { query: { controller: "mockController" } };
            const res = createMockResponse();

            await handler(req, res);

            expect(res.status.calledOnceWith(503)).to.be.true;
        });

    });
});


/*

"use strict";

const sinon = require('sinon');
const { expect } = require('chai');
const proxyquire = require('proxyquire');
const { CONCEPTS } = require('../lib/constants');

function createMockRequest() {
    return {
        query: {
            controller: {}
        }
    }
}

function createMockResponse() {
    return {
        send: sinon.spy(),
        status: sinon.stub().returnsThis()
    };
}

function createMockRED(registerType = sinon.spy(), httpAdminGet = sinon.spy()) {
    return {
        nodes: {
            registerType,
            createNode: sinon.spy(),
            getNode: sinon.stub().returns({ handler: { config: { url: "http://mocked", token: "abc" }}})
        },
        httpAdmin: { get: httpAdminGet, use: sinon.spy() }
    };
}

function createNodeThis() {
    return {
        credentials: {},
        name: "",
        log: sinon.spy(),
        on: sinon.spy(),
        warn: sinon.spy(),
        status: sinon.spy(),
        error: sinon.spy(),
        setStatus: sinon.spy(),
        removeListener: sinon.spy()
    };
}

function testCreateControllerNode(nodeThis, config, expectedNamePart) {
    try {
        const RED = createMockRED();

        // Stub ControllerHandler so that no real connections happen
        const fakeHandler = {
            setupNode: sinon.stub().returnsThis(),
            control: sinon.stub(),
            _onClose: sinon.stub(),
            connection: { startEventSource: sinon.stub(), sendRequest: sinon.stub().resolves({ ok: true, data: [] }), close: sinon.stub() }
        };

        const ControllerHandlerStub = sinon.stub().returns(fakeHandler);

        delete require.cache[require.resolve("../nodes/controller.js")];

        // Load the module via proxyquire, injecting our stub
        const controllerModule = proxyquire("../nodes/controller.js", {
            '../lib/controllerHandler': { setupControllerHandler: ControllerHandlerStub }
        });

        controllerModule(RED);

        const registerType = RED.nodes.registerType;
        const call = registerType.getCalls().find(c => c.args[0] === "openhab4-controller");
        expect(call).to.exist;

        const createControllerNode = call.args[1];
        RED.nodes.createNode = sinon.spy();
        createControllerNode.call(nodeThis, config);

        expect(RED.nodes.createNode.calledOnce, `Created node for test '${expectedNamePart}'`).to.be.true;
        expect(nodeThis.name, `name ${expectedNamePart} included`).to.include(expectedNamePart);

    } catch (error_) {
        nodeThis.error("Error running testCreateControllerNode", error_);
    }

    // Call close handler if set, to ensure test cleanup
    if (nodeThis.on.callCount > 0) {
        nodeThis.on.getCall(0).args[1](false, () => { });
    }
}

describe("openhab4-controller /openhab4/items handler", function () {
    it("should create the right URL and return items from mocked httpRequest", async function () {
        const mockHttpRequest = sinon.stub().resolves({ ok: true, data: ["item1", "item2"] });
        const RED = createMockRED();
        const { createMockControllerModule } = require('./mockControllerModule');
        const { controllerModule } = createMockControllerModule();

        const handler = controllerModule.createResourceHandler(RED, CONCEPTS.baseUrl(CONCEPTS.ITEMS), mockHttpRequest);
        const response = createMockResponse();

        await handler(createMockRequest(), response);

        expect(mockHttpRequest.calledOnce).to.be.true;
        const urlArg = mockHttpRequest.getCall(0).args[0];
        expect(urlArg).to.equal("http://mocked/rest/items");
        expect(response.status.notCalled).to.be.true; // No error, so status should not be called
        expect(response.send.calledWith(["item1", "item2"])).to.be.true;
    });

    it("should propagate status and error message when httpRequest does not return data", async function () {
        const mockHttpRequest = sinon.stub().resolves({ ok: false, retry: true, status: 503, message: "Service Unavailable" });
        const RED = createMockRED();
        const { createMockControllerModule } = require('./mockControllerModule');
        const { controllerModule } = createMockControllerModule();

        const handler = controllerModule.createResourceHandler(RED, CONCEPTS.baseUrl(CONCEPTS.ITEMS), mockHttpRequest);
        const response = createMockResponse();
        await handler(createMockRequest(), response);
        expect(response.status.calledOnceWith(503), "Response.status must be 503").to.be.true;
        const message = response.send.firstCall.args[0];
        expect(message).to.include("Service Unavailable");
    });
}); 

describe("openhab4-controller controllerModule", function () {
    it("should register the node type and HTTP endpoint", function () {
        // Arrange: create spies for RED methods
        const RED = createMockRED();
        const registerType = RED.nodes.registerType;
        const httpAdminGet = RED.httpAdmin.get;
        // Proxyquire to avoid running real admin code
        const controllerModule = proxyquire("../nodes/controller.js", {
            "./admin": () => { } // stub out admin
        });

        controllerModule(RED);
        expect(httpAdminGet.calledWith("/openhab4/items")).to.be.true;
        expect(registerType.calledWith("openhab4-controller")).to.be.true;
    });

    it("should call createControllerNode when a node is instantiated", function () {
        const nodeThis = createNodeThis();
        testCreateControllerNode(nodeThis, { name: "TestController", url: "http://localhost:8080" }, "TestController");
        expect(nodeThis.error.calledOnce).to.be.false;

    });

    it("should be ok with not having credentials", function () {

        const nodeThis = createNodeThis();
        
        nodeThis.credentials = null;
        testCreateControllerNode(nodeThis, { url: "http://localhost:8080" }, "localhost:8080");
        expect(nodeThis.error.calledOnce).to.be.false;
    }); 
});

*/
