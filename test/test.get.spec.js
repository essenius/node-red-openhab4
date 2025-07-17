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
const getNode = require("../nodes/get.js"); 
const { expect } = require("chai");
const sinon = require("sinon");

// Mock controller node with getItem method


// Enhanced mock controller node
const controllerNode = function (RED) {
  function ControllerNode(config) {
    RED.nodes.createNode(this, config);
    // Spy/stub for the control method
    this.control = sinon.spy((item, _topic, _payload, _consumerNode) => {
      if (item === "TestItem") {
        return '{ state: "MockValue" }';
      }
      return null;
    });
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
    const flow = getFlow();

    helper.load([controllerNode, getNode], flow, function (err) {
      if (err) return done(err);

      const get = helper.getNode("get1");
      const helperNode = helper.getNode("helper1");
      const controller = helper.getNode("controller1");
      helperNode.on("input", function (msg) {
        try {
          expect(controller.control.calledOnce, "control called once").to.be.true;
          expect(controller.control.firstCall.args[0]).to.equal("TestItem");
          expect(msg.payload).to.equal('{ state: "MockValue" }');
          done();
        } catch (error) {
          done(error);
        }
      });

      // Trigger the get node
      get.receive({ item: "TestItem" });
    });
  });
});