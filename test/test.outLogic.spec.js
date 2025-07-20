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
const outLogicPath = path.join(__dirname, '..', 'lib', 'outLogic.js');
const { OutNode } = require(outLogicPath);

describe("outLogic", function () {

    it("should set state and send error with handleInput on undefined items", async function () {
        const node = { error: sinon.spy(), status: sinon.spy(), debug: sinon.spy() };
        const config = {};
        const controller = { };
        const outNode = new OutNode(node, config, controller);
        const msg = { payload: "test" };

        await outNode.handleInput(msg);
        expect(node.status.calledWith({ fill: 'red', shape: 'ring', text: 'no item specified' }), "status called").to.be.true;
        expect(node.error.calledWith("No item specified. Set item in configuration or provide msg.item"), "error called").to.be.true;
        expect(node.debug.notCalled, "debug not called").to.be.true;

        // should be a separate test, but that seems topo much overhead
        expect(outNode.getNodeType(), "node type is out").to.equal("Out");
    });

    it ("should throw an error if control fails", async function () {
        const node = { error: sinon.spy(), status: sinon.spy(), debug: sinon.spy() };
        const config = { itemname: "testItem", topic: "testTopic", payload: "testPayload" };
        const controller = { control: sinon.stub().rejects(new Error("Control failed")) };
        const outNode = new OutNode(node, config, controller);
        const msg = { payload: "test" }; // should be overridden by config

        await outNode.handleInput(msg);
        expect(node.status.calledWith({ fill: 'red', shape: 'ring', text: 'testPayload ✗' }), "status called").to.be.true;
        expect(node.error.calledWith("Control failed"), "error called").to.be.true;
        expect(node.debug.calledWith(sinon.match.string), "debug called with stack trace").to.be.true;
    });
});