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

const path = require('path');
const { expect } = require("chai");
const sinon = require("sinon");
const getLogicPath = path.join(__dirname, '..', 'lib', 'getLogic.js');
const { GetNode } = require(getLogicPath);

describe("getLogic handleInput", function () {

    it("should show an error if no item is specified", async function () {
        const node = { error: sinon.spy(), status: sinon.spy() };
        const config = {};
        const controller = { handleControllerError: sinon.spy() };
        const getNode = new GetNode(node, config, controller);
        const msg = { payload: "test" };

        await getNode.handleInput(msg);
        expect(controller.handleControllerError.calledWith(sinon.match.instanceOf(Error), 'Get'), "Controller error called").to.be.true;
        expect(node.status.calledWith({ fill: 'red', shape: 'ring', text: 'No item specified' }), "status called").to.be.true;
    });

    it("should show waiting and then value if an item is specified", async function () {
        const node = { status: sinon.spy(), send: sinon.spy() };
        const config = {};
        const controller = { control: sinon.stub().returns({ state: "ON" }) };
        const getNode = new GetNode(node, config, controller);
        const msg = { item: "testItem", payload: "test" };

        await getNode.handleInput(msg);
        expect(node.status.getCall(0).args[0], "waiting status called").to.deep.equal({ fill: 'blue', shape: 'ring', text: 'requesting...' });
        expect(node.status.getCall(1).args[0], "item status called").to.deep.equal({ fill: 'green', shape: 'dot', text: 'ON' });
        expect(node.send.calledWith({ payload_in: "test", payload: "ON", item: "testItem", item_data: { state: 'ON' } }), "send called").to.be.true;

    });

    it("should show waiting and then error if response is unexpected", async function () {
        const node = { error: sinon.spy(), status: sinon.spy() };
        const config = {};
        const controller = { control: sinon.stub().returns({}), handleControllerError: sinon.spy() };
        const getNode = new GetNode(node, config, controller);
        const msg = { item: "testItem", payload: "test" };

        await getNode.handleInput(msg);
        expect(node.status.getCall(0).args[0], "waiting status called").to.deep.equal({ fill: 'blue', shape: 'ring', text: 'requesting...' });
        expect(controller.handleControllerError.calledWith(sinon.match.instanceOf(Error), 'Get'), "Controller error called").to.be.true;
        expect(node.status.getCall(1).args[0], "error status called").to.deep.equal({ fill: 'red', shape: 'ring', text: 'Unexpected response format' });
    });

        it("should show waiting and then error if control() throws", async function () {
        const node = { error: sinon.spy(), status: sinon.spy() };
        const config = {};
        const controller = { control: sinon.stub().rejects(new Error("Call failed")), handleControllerError: sinon.spy() };
        const getNode = new GetNode(node, config, controller);
        const msg = { item: "testItem", payload: "test" };

        await getNode.handleInput(msg);
        expect(node.status.getCall(0).args[0], "waiting status called").to.deep.equal({ fill: 'blue', shape: 'ring', text: 'requesting...' });
        expect(controller.handleControllerError.calledWith(sinon.match.instanceOf(Error), 'Get'), "Controller error called").to.be.true;
        expect(node.status.getCall(1).args[0], "error status called").to.deep.equal({ fill: 'red', shape: 'ring', text: 'Call failed' });
    });
});