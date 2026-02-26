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

const { setupDom, cleanupDom } = require('./helpers/dom-setup');
const { expect } = require('chai');
const sinon = require('sinon');

const { openhabEditPrepareAsync } = require("../static/ui-utils.js");

describe("openhabEditPrepareAsync with injections", function () {
    let controllerInput, conceptInput, identifierInput, filterInput, node, RED, fetchStub;

    beforeEach(function () {
        setupDom();

        controllerInput = document.createElement("input");
        controllerInput.id = "node-input-controller";
        controllerInput.value = "controller1";
        document.body.appendChild(controllerInput);

        conceptInput = document.createElement("input");
        conceptInput.id = "node-input-concept";
        conceptInput.value = "items";
        document.body.appendChild(conceptInput);

        identifierInput = document.createElement("select");
        identifierInput.id = "node-input-identifier";
        document.body.appendChild(identifierInput);

        filterInput = document.createElement("input");
        filterInput.id = "list-filter";
        document.body.appendChild(filterInput);

        // Node & RED mocks
        node = { identifier: "item1", type: "testNode", id: "node1" };
        RED = {
            nodes: {
                node: sinon.stub().callsFake(controllerId => {
                    // return a fake controller node
                    return { id: controllerId, hash: "hash1" };
                })
            },
            events: {
                on: sinon.stub(),
                off: sinon.stub()
            }
        };
        fetchStub = sinon.stub().resolves([{ name: "item1" }, { name: "item2" }]);
    });

    afterEach(() => {
        cleanupDom();
    });

    it("creates listeners and populates dropdown", async function () {
        await openhabEditPrepareAsync(RED, node, "[None]", {
            fetchFn: fetchStub,
            getInputFieldFn: name => {
                switch (name) {
                    case "controller": return controllerInput;
                    case "concept": return conceptInput;
                    case "identifier": return identifierInput;
                    case "list-filter": return filterInput;
                }
            }
        });

        // assert ListenerManager created
        expect(node._listenerManager).to.exist;

        // assert dropdown populated
        const options = Array.from(identifierInput.options).map(o => o.value);
        expect(options).to.include.members(["item1", "item2"]);
    });
});
/*const { _resetControllerStateTracker, openhabEditPrepareAsync } = require("../static/ui-utils.js");

describe("ui-utils openhabEditPrepareAsync", function () {

    let RED;
    let node;
    let fetchStub;

    beforeEach(function () {

        _resetControllerStateTracker();
        RED = {
            events: {
                on: sinon.spy(),
                off: sinon.spy()
            },
            nodes: {
                node: sinon.stub().returns({ hash: "h1" }),
                eachConfig: sinon.spy()
            }
        };

        node = {
            id: "node1",
            type: "test",
            identifier: "abc"
        };

        fetchStub = sinon.stub().resolves([]);

        sinon.stub(document, "getElementById").callsFake((_id) => {
            return {
                value: "controller1",
                addEventListener: sinon.spy(),
                removeEventListener: sinon.spy(),
                appendChild: sinon.spy(),
                innerHTML: ""
            };
        });
    });

    afterEach(function () {
        sinon.restore();
    });

    it("creates listeners and dropdown controller", async function () {

        await openhabEditPrepareAsync(RED, node, "[None]", fetchStub);

        expect(node._listenerManager).to.exist;
        expect(node._controllerChecker).to.exist;
        expect(node._dropdownController).to.exist;
    });

    it("normalizes identifier if array", async function () {

        node.identifier = ["first", "second"];

        await openhabEditPrepareAsync(RED, node, "[None]", fetchStub);

        expect(node.identifier).to.equal("first");
    });

    it("removes existing listeners before setup", async function () {

        const destroySpy = sinon.spy();
        node._fieldChangeListener = { destroy: destroySpy };
        await openhabEditPrepareAsync(RED, node, "[None]", fetchStub);
        expect(destroySpy.calledOnce).to.be.true;
    });

});*/