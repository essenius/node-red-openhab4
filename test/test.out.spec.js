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

const { CONCEPTS, OPERATION } = require("../lib/constants");
const helper = require("node-red-node-test-helper");
const outNode = require("../nodes/out.js");
const { expect } = require("chai");
const sinon = require("sinon");

// Enhanced mock controller node
const controllerNode = function (RED) {
  function ControllerNode(config) {
    this.eventBus = {
      publish: sinon.spy(),
      subscribe: sinon.spy(),
      unsubscribe: sinon.spy()
    };
    this.handler = {
      control: sinon.spy((_resource, _operation, _payload) => { return { ok: true } })
    };
    RED.nodes.createNode(this, config);
    // Spy/stub for the control method
  }

  RED.nodes.registerType("openhab4-controller", ControllerNode);
};

describe("openhab4-out node", function () {
  before(function (done) {
    helper.startServer(done);
  });

  after(function (done) {
    helper.stopServer(done);
  });

  afterEach(function () {
    return helper.unload();
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
        priority: "config",
        operation: "command",
        wires: [[]]
      }
    ];
  }

  it("should send a command to the controller with correct arguments", function (done) {
    const flow = getFlow();
    helper.load([controllerNode, outNode], flow, function (_err) {
      const controller = helper.getNode("controller1");
      const out = helper.getNode("out1");
      // Send a message to the out node

      out.receive({
        topic: "ub_Warning",
        openhabControl: { operation: "update" },
        payload: "test1"
      });

      // Assert that the controller handler's control was called with the correct arguments
      setTimeout(() => {
        try {

          const control = controller.handler.control;
          expect(control.calledOnce, "control called once").to.be.true;
          const call = control.getCall(0);
          expect(call.args[0]).to.deep.equal({ concept: CONCEPTS.ITEMS, identifier: "ub_Warning" }, "should get resource from message as not set in config");
          expect(call.args[1]).to.equal(OPERATION.COMMAND, "Should get operation from config");
          expect(call.args[2]).to.equal("test1", "should get payload from message as not set in config");
          done();
        } catch (err) {
          done(err);
        }
      }, 10); // Give the node a tick to process
    });
  });

  it("should use the configured payload instead of the incoming message payload", function (done) {
    const flow = getFlow();
    // Set the payload property in the out node config
    flow[1].payload = "configured-payload";
    flow[1].priority = "message";
    flow[1].identifier = "ub_test";
    helper.load([controllerNode, outNode], flow, function () {
      const out = helper.getNode("out1");
      const controller = helper.getNode("controller1");
      out.receive({
        topic: "items/ub_Warning",
        openhabControl: { operation: "update" },
        payload: "incoming-payload"
      });

      setTimeout(() => {
        try {
          const control = controller.handler.control;
          expect(control.calledOnce, "Control called once").to.be.true;
          const call = control.getCall(0);
          expect(call.args[0]).to.deep.equal({ concept: CONCEPTS.ITEMS, identifier: "ub_Warning"}, "should get resource from message");
          expect(call.args[1]).to.equal(OPERATION.UPDATE, "Should get operation from message");
          expect(call.args[2]).to.equal("incoming-payload", "Should get payload from message");

          done();
        } catch (err) {
          done(err);
        }
      }, 10);
    });
  });

});