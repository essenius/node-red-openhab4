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

const helper = require("node-red-node-test-helper");
const outNode = require("../nodes/out.js");
const { expect } = require("chai");
const sinon = require("sinon");

// Enhanced mock controller node
const controllerNode = function (RED) {
  function ControllerNode(config) {
    RED.nodes.createNode(this, config);
    // Spy/stub for the control method
    this.control = sinon.spy((itemname, topic, payload, okCb, errCb) => {
      console.log("Mock control called with:", itemname, topic, payload);
      okCb("OK");
    });
  }
  RED.nodes.registerType("openhab4-controller", ControllerNode);
};

describe("out", function () {
  before(function (done) {
    helper.startServer(done);
  });

  after(function (done) {
    helper.stopServer(done);
  });

  afterEach(function () {
    helper.unload();
  });

    // Skeleton flow for reuse
  function getFlow() {
    return [
      {
        id: "controller1",
        type: "openhab4-controller",
        name: "Test Controller"
      },
      {
        id: "out1",
        type: "openhab4-out",
        name: "Test Out",
        controller: "controller1",
        wires: [[]]
      }
    ];
  }

  it("should send a command to the controller with correct arguments", function (done) {
    const flow = getFlow();

    helper.load([controllerNode, outNode], flow, function () {
      const out = helper.getNode("out1");
      const controller = helper.getNode("controller1");

      // Send a message to the out node
      out.receive({
        item: "ub_Warning",
        topic: "itemCommand",
        payload: "test1"
      });

      // Assert that controller.control was called with the correct arguments
      setTimeout(() => {
        expect(controller.control.calledOnce).to.be.true;
        const call = controller.control.getCall(0);
        expect(call.args[0]).to.equal("ub_Warning");
        expect(call.args[1]).to.equal("itemCommand");
        expect(call.args[2]).to.equal("test1");
        done();
      }, 10); // Give the node a tick to process
    });
  });

    it("should use the configured payload instead of the incoming message payload", function (done) {
    const flow = getFlow();
    // Set the payload property in the out node config
    flow[1].payload = "configured-payload";

    helper.load([controllerNode, outNode], flow, function () {
      const out = helper.getNode("out1");
      const controller = helper.getNode("controller1");

      out.receive({
        item: "ub_Warning",
        topic: "itemCommand",
        payload: "incoming-payload"
      });

      setTimeout(() => {
        expect(controller.control.calledOnce).to.be.true;
        const call = controller.control.getCall(0);
        expect(call.args[2]).to.equal("configured-payload"); // Should use the config value
        done();
      }, 10);
    });
  });

});