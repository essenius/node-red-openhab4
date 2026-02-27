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

const { expect } = require('chai');
const sinon = require('sinon');

const { FieldChangeListener } = require('../static/ui-utils.js');

describe('ui-utils FieldChangeListener', function () {
    let controllerInput;
    let conceptInput;
    let refreshFn;

    beforeEach(function () {
        controllerInput = {
            addEventListener: sinon.spy(),
            removeEventListener: sinon.spy(),
        };

        conceptInput = {
            addEventListener: sinon.spy(),
            removeEventListener: sinon.spy(),
        };

        refreshFn = sinon.spy();
    });

    afterEach(function () {
        sinon.restore();
    });

    it('attaches and detaches change listeners to/from both inputs', function () {
        const listener = new FieldChangeListener(controllerInput, conceptInput, refreshFn);

        expect(controllerInput.addEventListener.calledOnceWith('change')).to.be.true;
        expect(conceptInput.addEventListener.calledOnceWith('change')).to.be.true;

        const controllerHandler = controllerInput.addEventListener.firstCall.args[1];
        const conceptHandler = conceptInput.addEventListener.firstCall.args[1];

        listener.destroy();
        expect(controllerInput.removeEventListener.calledOnceWith('change', controllerHandler)).to.be.true;
        expect(conceptInput.removeEventListener.calledOnceWith('change', conceptHandler)).to.be.true;
    });

    it('calls refreshFn when change event fires', function () {
        const listener = new FieldChangeListener(controllerInput, conceptInput, refreshFn);

        // Capture the handler passed to addEventListener
        const controllerHandler = controllerInput.addEventListener.firstCall.args[1];

        controllerHandler();

        expect(refreshFn.calledOnce).to.be.true;
        listener.destroy();
    });

    it('does not throw if controllerInput is null', function () {
        expect(() => {
            new FieldChangeListener(null, conceptInput, refreshFn);
        }).to.not.throw();

        expect(conceptInput.addEventListener.calledOnceWith('change')).to.be.true;
    });

    it('does not throw if conceptInput is null', function () {
        expect(() => {
            new FieldChangeListener(controllerInput, null, refreshFn);
        }).to.not.throw();

        expect(controllerInput.addEventListener.calledOnceWith('change')).to.be.true;
    });

    it('does not throw if both inputs are null', function () {
        expect(() => {
            new FieldChangeListener(null, null, refreshFn);
        }).to.not.throw();
    });
});
