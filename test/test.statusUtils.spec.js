
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

describe('statusUtils.addStatusMethods tests', function () {
    let addStatusMethods, statusSpy, warnSpy, mockNode;

    before(function () {
        addStatusMethods = require('../lib/statusUtils').addStatusMethods;
    });

    beforeEach(function () {
        statusSpy = sinon.spy();
        warnSpy = sinon.spy();
        mockNode = { status: statusSpy, warn: warnSpy };
        addStatusMethods(mockNode);
    });

    it('should add status methods to a node', function () {
        expect(mockNode.setStatusInit, "setStatusInit is a function").to.be.a('function');
        expect(mockNode.setStatusError, "setStatusWarning is a function").to.be.a('function');
    });

    describe('executing status methods', function () {
        it('should set status to init', function () {
            statusSpy.resetHistory();
            mockNode.setStatusInit("testing");
            expect(statusSpy.calledOnce, "status should be called once").to.be.true;
            expect(statusSpy.firstCall.args[0], "correct status parameters").to.deep.include({ fill: "grey", shape: "ring" });
            expect(statusSpy.firstCall.args[0].text, "Right text").to.include("testing");
        });
        it('should set status to warning', function () {
            statusSpy.resetHistory();
            mockNode.setStatusWarning();
            expect(statusSpy.calledOnce, "status should be called once").to.be.true;
            expect(statusSpy.firstCall.args[0], "correct status parameters").to.deep.include({ fill: "yellow", shape: "dot" });
            expect(statusSpy.firstCall.args[0].text, "Default text").to.equal("warning");
        });
        it('should replace unknown status by error', function () {
            statusSpy.resetHistory();
            mockNode.setStatus("bogus");
            expect(statusSpy.calledOnce, "status should be called once").to.be.true;
            expect(statusSpy.firstCall.args[0], "correct status parameters").to.deep.include({ fill: "red", shape: "ring" });
            expect(statusSpy.firstCall.args[0].text, "Default text").to.equal("unknown");
            expect(warnSpy.calledOnce, "warn should be called once").to.be.true;
            expect(warnSpy.firstCall.args[0], "warn message").to.include("Unknown status state: bogus. Using ERROR state.");
        });
        
        it("should clear status", function () {
            statusSpy.resetHistory();
            mockNode.clearStatus();
            expect(statusSpy.calledOnce, "status should be called once").to.be.true;
            expect(statusSpy.firstCall.args[0]).to.deep.equal({});
        });

    });
});

describe('statusUtils.validateController tests', function () {
    it('should validate controllers correctly', function () {
        const { validateController } = require('../lib/statusUtils');
        const mockNode = { error: () => { }, setStatusError: () => { } };
        expect(validateController(mockNode, null)).to.be.false;
        expect(validateController(mockNode, undefined)).to.be.false;
        expect(validateController(mockNode, { host: 'localhost', port: 8080 })).to.be.true;
    });
});