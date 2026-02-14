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

const path = require('node:path');
const { expect } = require('chai');
const sinon = require('sinon');
const outNodeHandlerPath = path.join(__dirname, '..', 'lib', 'outNodeHandler.js');
const { OutNodeHandler } = require(outNodeHandlerPath);


function createOutNodeHandler({
    controlResult = { ok: true, payload: {} },
    config = {},
    time = "12:34:56"
} = {}) {
    const node = { type: "openhab4-out", status: sinon.spy(), on: sinon.spy(), send: sinon.spy(), log: sinon.spy() };
    const controllerHandler = { control: sinon.stub().resolves(controlResult) };
    const controller = { handler: controllerHandler };
    const outNodeHandler = new OutNodeHandler(node, config, controller, { generateTime: () => time });
    return { outNodeHandler, node, controller };
}

describe("outNodeHandler", function () {

    it("should set state on successful send", async function () {
        const { outNodeHandler, node } = createOutNodeHandler({config: { operation: "command" }});
        const msg = { topic: "items/test", payload: "testPayload" };
        await outNodeHandler.handleInput(msg);
        expect(node.status.getCall(0).args[0]).to.deep.equal({ fill: 'blue', shape: 'dot', text: 'testPayload ⇨ @ 12:34:56'}, "status sending called");
        expect(node.status.getCall(1).args[0]).to.deep.equal({ fill: 'green', shape: 'dot', text: 'testPayload ✓ @ 12:34:56'}, "status sent called");

        // should be a separate test, but that seems too much overhead
        expect(outNodeHandler.getNodeType(), "node type is Out").to.equal("Out");
    });

    it("should set state and show error with handleInput on undefined items", async function () {
        const { outNodeHandler, node } = createOutNodeHandler({ config: { concept: "items" } });
        const msg = { payload: "test" };

        await outNodeHandler.handleInput(msg);
        expect(node.status.firstCall.args, "status called").to.deep.equal([{ fill: 'red', shape: 'ring', text: 'no item specified @ 12:34:56' }]);

    });

    it ("should show an error if control fails", async function () {
        const { outNodeHandler, node } = createOutNodeHandler(
            { controlResult: {ok: false, retry: false, message: "Simulated error"}, 
              config: { concept: "items", identifier: "testItem", operation: "update", payload: "testPayload" }});

        const msg = { payload: "test" }; // should override config

        await outNodeHandler.handleInput(msg);
        expect(node.status.secondCall.args, "status called").to.deep.equal([{ fill: 'red', shape: 'ring', text: 'test ✗ @ 12:34:56' }]);
    });
});