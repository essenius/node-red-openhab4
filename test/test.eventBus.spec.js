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

const { expect } = require("chai");
const sinon = require("sinon");

function expectOneErrorEvent(node, label) {
    expect(node.emit.calledWith("Error", "Connection broken"), label + " notified with right parameters").to.be.true;
    expect(node.emit.calledOnce, label + " notified once").to.be.true;
}

describe("eventBus single tag subscribe", function () {

    const { EventBus } = require("../lib/eventBus");

    const createNode = () => ({ emit: sinon.spy() });

    const [exactMatchNode1, exactMatchNode2, regexNode1, regexNode2, regexNode3] = Array.from({ length: 5 }, createNode);

    let eventBus;

    beforeEach(function () {
        eventBus = new EventBus();
        eventBus.subscribe(exactMatchNode1, "items/testItem1");
        eventBus.subscribe(exactMatchNode2, "items/testItem2");
        eventBus.subscribe(exactMatchNode1, "items/anotherTestItem");
        eventBus.subscribe(regexNode1, "items/test*");
        eventBus.subscribe(regexNode2, "*");
        eventBus.subscribe(regexNode3, "things/*");
        exactMatchNode1.emit.resetHistory();
        exactMatchNode2.emit.resetHistory();
        regexNode1.emit.resetHistory();
        regexNode2.emit.resetHistory();
        regexNode3.emit.resetHistory();
    });

    it("should successfully notify nodes of testItem1", function () {
        eventBus.publish("items/testItem1", "Payload1");
        expect(exactMatchNode1.emit.calledWith("items/testItem1", "Payload1"), "exact node 1 notified").to.be.true;
        expect(exactMatchNode2.emit.notCalled, "exact node 2 not notified").to.be.true;
        expect(regexNode1.emit.calledWith("items/testItem1", "Payload1"), "regex node 1 notified").to.be.true;
        expect(regexNode2.emit.calledWith("items/testItem1", "Payload1"), "regex node 2 notified").to.be.true;
        expect(regexNode3.emit.notCalled, "regex node 3 not notified").to.be.true;
    });

    it("should successfully notify nodes of testItem2", function () {
        eventBus.publish("items/testItem2", "Payload2");
        expect(exactMatchNode1.emit.notCalled, "exact node 1 not notified").to.be.true;
        expect(exactMatchNode2.emit.calledWith("items/testItem2", "Payload2"), "exact node 2 notified").to.be.true;
        expect(regexNode1.emit.calledWith("items/testItem2", "Payload2"), "regex node 1 notified").to.be.true;
        expect(regexNode2.emit.calledWith("items/testItem2", "Payload2"), "regex node 2 notified").to.be.true;
        expect(regexNode3.emit.notCalled, "regex node 3 not notified").to.be.true;
    });

    it("should successfully notify nodes of anotherTestItem", function () {
        eventBus.publish("items/anotherTestItem", "Payload3");
        expect(exactMatchNode1.emit.calledWith("items/anotherTestItem", "Payload3"), "exact node 1 notified").to.be.true;
        expect(exactMatchNode2.emit.notCalled, "exact node 2 not notified").to.be.true;
        expect(regexNode1.emit.notCalled, "regex node 1 not notified").to.be.true;
        expect(regexNode2.emit.calledWith("items/anotherTestItem", "Payload3"), "regex node 2 notified").to.be.true;
        expect(regexNode3.emit.notCalled, "regex node 3 not notified").to.be.true;
    });

    it("should not allow multiple subscriptions to the same tag", function () {
        eventBus.subscribe(exactMatchNode1, "items/testItem1");
        eventBus.publish("items/testItem1", "Payload4");
        expect(exactMatchNode1.emit.callCount).to.equal(1, "exact node 1 notified once");
        expect(exactMatchNode1.emit.calledWith("items/testItem1", "Payload4"), "exact node 1 notified").to.be.true;
        eventBus.unsubscribe(exactMatchNode1, "items/testItem1");
        exactMatchNode1.emit.resetHistory();
        eventBus.publish("items/testItem1", "Payload5");
        expect(exactMatchNode1.emit.notCalled, "exact node 1 not notified as unsubscribed").to.be.true;
        expect(regexNode1.emit.calledWith("items/testItem1", "Payload5"), "regex node 1 notified").to.be.true;
    });

    it("should unsubscribe correctly", function () {
        eventBus.unsubscribe(regexNode1, "*/bogus");
        eventBus.publish("items/testQ", "Payload6");
        expect(regexNode1.emit.callCount).to.equal(1, "regex node 1 still notified after bogus unsubscribe");
        eventBus.unsubscribe(regexNode1, "items/test*");
        regexNode1.emit.resetHistory();
        eventBus.publish("items/testQ", "Payload6");
        expect(regexNode1.emit.notCalled, "regex node 1 not notified after unsubscribe").to.be.true;
    });

    // TODO: eliminate
    it("should broadcast correctly", function () {
        eventBus.broadcastToAll("Error", "Connection broken");
        expectOneErrorEvent(exactMatchNode1, "exactMatchNode1");
        expectOneErrorEvent(exactMatchNode2, "exactMatchNode2");
        expectOneErrorEvent(regexNode1, "regexNode1");
        expectOneErrorEvent(regexNode2, "regexNode2");
        expectOneErrorEvent(regexNode3, "regexNode3");
    });
});