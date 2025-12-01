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
const { GetNodeHandler } = require(getLogicPath);

function createGetNodeHandler({
    controlResult = { ok: true, payload: {} },
    config = {},
    time = "12:34:56"
} = {}) {
    const node = { status: sinon.spy(), send: sinon.spy(), on: sinon.spy() };
    let controller;
    if (controlResult === null) {
        controller = null;
    } else {
        const controllerHandler = { control: sinon.stub().resolves(controlResult) };
        controller = { handler: controllerHandler, handleControllerError: sinon.spy() };
    }
    const utils = { generateTime: () => time };
    const getNodeHandler = new GetNodeHandler(node, config, controller, utils);
    getNodeHandler.setupNode();
    return { getNodeHandler, node, controller };
}

describe("getLogic handleInput", function () {

    it("should show version info if no item is specified", async function () {
        const { node, getNodeHandler } = createGetNodeHandler({ controlResult: { ok: true, data: { version: 8, runtimeInfo: { version: "4.3.5" } } } });
        expect(node.on.getCall(0).args[0], "Close handler registered").to.equal("close");
        expect(node.on.getCall(1).args[0], "Input handler registered").to.equal("input");
        expect(node.status.getCall(0).args[0], "initializing status called").to.deep.equal({ fill: 'grey', shape: 'ring', text: 'initializing... @ 12:34:56' });
        expect(node.status.getCall(1).args[0], "status cleared after init").to.deep.equal({});

        await getNodeHandler.handleInput({});

        expect(node.status.getCall(2).args[0], "requesting status called").to.deep.equal({ fill: 'blue', shape: 'ring', text: 'requesting... @ 12:34:56' });
        expect(node.status.getCall(3).args[0], "OpenHAB version shown").to.deep.equal({ fill: 'green', shape: 'dot', text: '4.3.5 @ 12:34:56' });
        expect(node.send.getCall(0).args[0], "Version sent").to.deep.equal(
            { payload_in: {}, payload: "4.3.5", name: "openhab_version", item_data: { version: 8, runtimeInfo: { version: '4.3.5' } } }
        );

    });

    it("should show an error if incoming data is malformed", async function () {
        const { node, getNodeHandler } = createGetNodeHandler({ controlResult: { ok: true, data: [] } });
        await getNodeHandler.handleInput({ payload: "test" });
        expect(node.status.getCall(2).args[0], "requesting status called").to.deep.equal({ fill: 'blue', shape: 'ring', text: 'requesting... @ 12:34:56' });
        expect(node.status.getCall(3).args[0], "Error shown").to.deep.equal({ fill: 'red', shape: 'ring', text: 'Unexpected response @ 12:34:56' });
        expect(node.send.notCalled, "No message sent").to.be.true;
    });

    it("should show waiting and then value if an item is specified", async function () {
        const { node, getNodeHandler } = createGetNodeHandler({ controlResult: { ok: true, data: { state: "ON" } } });
        const msg = { item: "testItem", payload: "test" };
        await getNodeHandler.handleInput(msg);
        expect(node.status.getCall(2).args[0], "requesting status called").to.deep.equal({ fill: 'blue', shape: 'ring', text: 'requesting... @ 12:34:56' });
        expect(node.status.getCall(3).args[0], "item status called").to.deep.equal({ fill: 'green', shape: 'dot', text: 'ON @ 12:34:56' });
        expect(node.send.calledWith({ payload_in: "test", payload: "ON", item: "testItem", name: "testItem", item_data: { state: 'ON' } }), "send called").to.be.true;
    });

    it("should show error message if no controller was specified", async function () {
        const { node } = createGetNodeHandler({ controlResult: null });
        expect(node.status.getCall(0).args[0], "initializing status called").to.deep.equal({ fill: 'grey', shape: 'ring', text: 'initializing... @ 12:34:56' });
        expect(node.status.getCall(1).args[0], "error status called").to.deep.equal({ fill: 'red', shape: 'ring', text: 'no controller @ 12:34:56' });
        expect(node.on.callCount, "On called twice (for close and input").to.equal(2);
    });

});