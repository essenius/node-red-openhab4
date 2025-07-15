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

const helper = require("node-red-node-test-helper");
const inNode = require("../nodes/events.js");
const { expect } = require("chai");

const controllerNode = function (RED) {
    function ControllerNode(config) {
        RED.nodes.createNode(this, config);
    }
    RED.nodes.registerType("openhab4-controller", ControllerNode);
};

describe("openhab4-events node", function () {
    before(function (done) { helper.startServer(done); });
    after(function (done) { helper.stopServer(done); });
    afterEach(function () { return helper.unload(); });

    it("should emit a message when an openHAB event is received", function (done) {
        const flow = [
            { id: "controller1", type: "openhab4-controller", name: "Test Controller" },
            { id: "events1", type: "openhab4-events", controller: "controller1", wires: [["helper1"]] },
            { id: "helper1", type: "helper" }
        ];

        helper.load([controllerNode, inNode], flow, function () {
            flow.forEach(nodeDef => {
                const node = helper.getNode(nodeDef.id);
                console.log(`Node ${nodeDef.id} created:`, node);
            });
            const controller = helper.getNode("controller1");
            const helperNode = helper.getNode("helper1");

            helperNode.on("input", function (msg) {
                console.log("Received message:", msg);
                try {
                    expect(msg.payload).to.deep.include({ type: "RawEvent", state: "OFF" });
                    done();
                } catch (err) {
                    done(err); 
                }
            });

            controller.emit("RawEvent", { type: "RawEvent", state: "OFF" });

        });

    });
});