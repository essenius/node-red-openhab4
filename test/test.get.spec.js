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

const helper = require("node-red-node-test-helper");
const getNode = require("../nodes/get.js");
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
      control: sinon.stub().callsFake(async (_concept, item, _options) => {
        if (item === "TestItem") {
          return { ok: true, data: {topic: "items/TestItem", payload: "MockValue"} };
        }
        return null;
      })
    };
    RED.nodes.createNode(this, config);
    // Spy/stub for the control method
  }

  RED.nodes.registerType("openhab4-controller", ControllerNode);
};

// Simple flow: get node wired to controller
function getFlow() {
  return [
    {
      id: "controller1",
      type: "openhab4-controller",
      name: "Test Controller"
    },
    {
      id: "get1",
      type: "openhab4-get",
      name: "Test Get",
      controller: "controller1",
      wires: [["helper1"]]
    },
    {
      id: "helper1",
      type: "helper"
    }
  ];
}

describe("openhab4-get node", function () {
  before(function (done) {
    helper.startServer(done);
  });

  after(function (done) {
    helper.stopServer(done);
  });

  afterEach(function () {
    helper.unload();
  });

  it("should get an item value from the controller", function (done) {
    this.timeout(1000); 

    const flow = getFlow();

    helper.load([controllerNode, getNode], flow, function (err) {
      if (err) return done(err);

      const get = helper.getNode("get1");
      const helperNode = helper.getNode("helper1");
      const controller = helper.getNode("controller1");

      // Fail the test if nothing happens
      const failTimer = setTimeout(() => {
        done(new Error("helperNode input handler was never called"));
      }, 1000);

      helperNode.on("input", function (msg) {
        clearTimeout(failTimer);
        try {
          const control = controller.handler.control;
          expect(control.calledOnce, "control called once").to.be.true;
          expect(control.firstCall.args[1]).to.equal("TestItem");
          expect(msg.payload).to.equal('MockValue');
          done();
        } catch (error) {
          done(error);
        }
      });
      // Trigger the get node
      get.receive({ topic: "items/TestItem" });
    });
  });
});