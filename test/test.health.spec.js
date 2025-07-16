// Copyright 2025 Rik Essenius
//
// Licensed under the Apache License, Version 2.0

"use strict";

const helper = require("node-red-node-test-helper");
const healthNode = require("../nodes/health.js");
const { expect } = require("chai");

const controllerNode = function (RED) {
    function ControllerNode(config) {
        RED.nodes.createNode(this, config);
    }
    RED.nodes.registerType("openhab4-controller", ControllerNode);
};

describe("openhab4-health node", function () {
    before(function (done) { helper.startServer(done); });
    after(function (done) { helper.stopServer(done); });
    afterEach(function () { return helper.unload(); });

    it("should send a raw event message on the third output when a RAW_EVENT is received", function (done) {

        const flow = [
            { id: "controller1", type: "openhab4-controller", name: "Test Controller" },
            { id: "health1", type: "openhab4-health", controller: "controller1", wires: [[], [], ["helper1"]] },
            { id: "helper1", type: "helper" }
        ];

        helper.load([controllerNode, healthNode], flow, function () {
            const controller = helper.getNode("controller1");
            const helperNode = helper.getNode("helper1");

            helperNode.on("input", function (msg) {
                try {
                    expect(msg).to.have.property("payload", "event-data");
                    expect(msg).to.have.property("event", "RawEvent");
                    done();
                } catch (err) {
                    done(err);
                }
            });

            // Emit the RAW_EVENT on the controller
            controller.emit("RawEvent", "event-data");
        });
    });
});