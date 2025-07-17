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
const { expect } = require('chai');
const sinon = require('sinon');
const EventEmitter = require('events');
const { EVENT_TYPES } = require('../lib/constants');

describe('consumerNodeBase', function () {
    it('fails when child class does not implement getNodeType', function () {
        const consumerNodeBasePath = path.join(__dirname, '..', 'lib', 'consumerNodeBase.js');
        const { ConsumerNodeBase } = require(consumerNodeBasePath);
        class TestNode extends ConsumerNodeBase {
            // Intentionally not implementing getNodeType
        }

        expect(() => new TestNode({}, {}, {}).getNodeType()).to.throw(Error, /Subclasses must implement getNodeType/);
    });

    describe('StatusMethods', function () {
        let mockNode, controller, node;

        const { ConsumerNodeBase } = require(path.join(__dirname, '..', 'lib', 'consumerNodeBase.js'));
        class TestNode extends ConsumerNodeBase {
            getNodeType() { return "Test"; }
            setupNodeLogic(options) {
                this.setupNodeLogicCalledWith = options;
            }
        }

        beforeEach(function () {
            mockNode = {
                status: sinon.stub(),
                warn: sinon.stub(),
                error: sinon.stub(),
                log: sinon.stub(),
                setStatusError: sinon.stub()
            };
            controller = new EventEmitter();

            node = new TestNode(mockNode, {}, controller, {});
        });

        it('calls the handler registered with controller.on', function () {
            node.createMessage = () => { };
            node.setupControllerEvents();

            // Spy on the status methods of the ConsumerNodeBase instance
            const errorSpy = sinon.spy(node, 'setStatusError');
            const readySpy = sinon.spy(node, 'setStatusReady');
            const waitingSpy = sinon.spy(node, 'setStatusWaiting');

            // Emit the event
            controller.emit(EVENT_TYPES.CONNECTION_ERROR, "test error");
            expect(errorSpy.calledOnceWithExactly("test error")).to.be.true;
            controller.emit(EVENT_TYPES.CONNECTION_STATUS, "ON");
            expect(readySpy.calledOnce).to.be.true;
            controller.emit(EVENT_TYPES.CONNECTION_STATUS, "OFF");
            expect(waitingSpy.calledOnceWithExactly("Disconnected from openHAB")).to.be.true;
        });

        it('should set status to init', function () {
            node.setStatusInit("testing");
            expect(mockNode.status.calledOnceWithExactly({ fill: "grey", shape: "ring", text: "testing" }, "correct status parameters"));
        });

        it('should set status to warning', function () {
            node.setStatusWarning();
            expect(mockNode.status.calledOnceWithExactly({ fill: "yellow", shape: "dot", text: "warning" }, "correct status parameters"));
        });

        it('should replace unknown status by error', function () {
            node.setStatus("bogus");
            expect(mockNode.status.calledOnceWithExactly({ fill: "red", shape: "ring", text: "unknown" }, "correct status parameters"));
            expect(mockNode.warn.calledOnceWithExactly({ message: "Unknown status state: bogus. Using ERROR state." }, "correct warn parameters"));
        });

        it("should clear status", function () {
            node.clearStatus();
            expect(mockNode.status.calledOnceWith({}));
        });

        it('should handle missing controller gracefully', function () {
            node = new TestNode(mockNode, {}, undefined, {});
            node.setupNode();
            expect(mockNode.error.calledOnceWithExactly("No controller configured. Please select an openHAB controller in the node configuration.")).to.be.true;
            expect(mockNode.setStatusError.calledOnceWithExactly({ error: "No controller configured" }), "Status message OK");

        });

    });
});

