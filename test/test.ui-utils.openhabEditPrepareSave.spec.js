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

'use strict';

const { expect } = require('chai');
const sinon = require('sinon');

// Import the module
const { openhabEditPrepare, openhabEditSave } = require('../static/ui-utils.js');

describe('ui-utils sync entry points', function () {
    let RED, node;
    let safeStub;

    beforeEach(function () {
        RED = {};
        node = {};
        safeStub = sinon.stub();
    });

    afterEach(function () {
        sinon.restore();
    });

    it('openhabEditPrepare calls safeAsync with a function', function () {
        openhabEditPrepare(RED, node, 'empty text', { safeAsyncFn: safeStub });
        expect(safeStub.calledOnce).to.be.true;
        const arg = safeStub.firstCall.args[0];
        expect(arg).to.be.a('function');
    });

    it('openhabEditSave calls safeAsync with a function', function () {
        openhabEditSave(RED, node, { safeAsyncFn: safeStub });
        expect(safeStub.calledOnce).to.be.true;
        const arg = safeStub.firstCall.args[0];
        expect(arg).to.be.a('function');
    });
});
