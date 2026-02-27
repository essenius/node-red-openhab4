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
const controllerFactory = require('../nodes/controller')._create;

const { createMockRED, createNodeThis, createMockResponse } = require('./helpers/mockRED');

const { createControllerDependencies } = require('./helpers/mockControllerDependencies');

function setupControllerTest() {
    const deps = createControllerDependencies();
    const controllerModule = controllerFactory({ setupHandler: deps.setupHandlerStub });

    const RED = createMockRED();
    controllerModule(RED);
    const createNode = RED.nodes.registerType.getCall(0).args[1];

    return { deps, createNode };
}

describe('openhab4-controller', function () {
    describe('module registration', function () {
        it('should register node type and HTTP endpoints', function () {
            const RED = createMockRED();

            const controllerModule = controllerFactory();
            controllerModule(RED);

            expect(RED.nodes.registerType.calledWith('openhab4-controller')).to.be.true;
            expect(RED.httpAdmin.get.calledTwice).to.be.true;
        });
    });

    describe('node instantiation', function () {
        it('should call setupHandler', function () {
            const { deps, createNode } = setupControllerTest();
            const nodeThis = createNodeThis();

            // call createControllerNode in controller.js
            createNode.call(nodeThis, { name: 'Test', url: 'http://localhost' });
            expect(deps.setupHandlerStub.calledOnce).to.be.true;
            expect(nodeThis.handler).to.equal(deps.fakeHandler);
        });

        it('should keep name undefined when name is missing', function () {
            const { createNode } = setupControllerTest();
            const nodeThis = createNodeThis();
            createNode.call(nodeThis, { url: 'http://localhost' });
            expect(nodeThis.name).to.be.undefined;
        });
    });

    describe('HTTP resource handlers', function () {
        it('should return data when request succeeds', async function () {
            const deps = createControllerDependencies();
            const controllerModule = controllerFactory();

            const RED = createMockRED();
            RED.nodes.getNode.returns({ handler: deps.fakeHandler });
            /*{
                handler: { config: { url: "http://mocked" }, getResources: sinon.stub().returns({ok:true, data:[] }) }
            }); */

            const resourceHandler = controllerModule.createResourceHandler(RED, 'items');
            const res = createMockResponse();
            await resourceHandler({ query: { controller: '123' } }, res);
            expect(deps.fakeHandler.getResources.calledOnce).to.be.true;
            expect(res.send.called).to.be.true;
        });
    });

    describe('createResourceHandler', function () {
        it('should return 404 if controller does not exist', async function () {
            const RED = createMockRED();
            const controllerModule = controllerFactory({
                setupHandler: sinon.stub(),
            });

            controllerModule(RED); // registers nodes and HTTP endpoints

            const req = { query: { controller: 'nonexistent' } };
            const res = createMockResponse();

            // Ensure getNode returns undefined
            RED.nodes.getNode = sinon.stub().withArgs('nonexistent').returns(undefined);

            // Create the handler
            const handler = controllerModule.createResourceHandler(RED, '/items');

            // Call the handler
            await handler(req, res);

            expect(res.status.calledOnceWith(404)).to.be.true;
            expect(res.send.calledOnce).to.be.true;
        });

        it('should propagate non-200 status from fetch', async function () {
            const fakeResponse = {
                ok: false,
                status: 503,
                message: 'Service Unavailable',
            };

            const controllerFactory = require('../nodes/controller')._create;

            const controllerModule = controllerFactory();

            const RED = createMockRED();

            RED.nodes.getNode = sinon.stub().returns({
                handler: { config: { url: 'http://localhost:8080' }, getResources: sinon.stub().returns(fakeResponse) },
            });

            controllerModule(RED);

            const handler = controllerModule.createResourceHandler(RED, '/foo');

            const req = { query: { controller: 'mockController' } };
            const res = createMockResponse();

            await handler(req, res);

            expect(res.send.calledOnceWith(fakeResponse)).to.be.true;
        });
    });
});
