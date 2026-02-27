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
const { DropdownController } = require('../static/ui-utils');

describe('ui-utils DropdownController (with injected fetchFn)', function () {
    let dropdown;
    let controllerInput;
    let conceptInput;
    let checker;
    let fetchFn;
    let controller;

    function createDropdownController(concept, currentValue) {
        dropdown = {
            setSingleDisabledOption: sinon.spy(),
            setOptions: sinon.spy(),
        };
        controllerInput = { value: 'controller-1' };
        conceptInput = { value: concept };
        checker = { check: sinon.stub() };
        fetchFn = sinon.stub();

        controller = new DropdownController({
            checker,
            controllerInput,
            conceptInput,
            dropdown,
            currentValue,
            fetchFn,
        });
    }

    it('calls fetchFn and populates dropdown on success', async function () {
        createDropdownController('items', 'B');
        checker.check.resolves({});
        const items = [{ name: 'B' }, { name: 'A' }, { name: 'C' }];
        fetchFn.resolves(items);

        await controller.refresh();

        expect(fetchFn.calledOnceWith('openhab4/items', { controller: 'controller-1' })).to.be.true;
        expect(dropdown.setOptions.calledOnce).to.be.true;
        expect(dropdown.setOptions.firstCall.args[0]).to.deep.equal(['A', 'B', 'C']);
        expect(dropdown.setOptions.firstCall.args[1]).to.equal('B');
    });

    it('shows error message if fetchFn rejects', async function () {
        createDropdownController(undefined);
        checker.check.resolves({});
        const error = new Error('Network error');
        fetchFn.rejects(error);

        await controller.refresh();

        expect(dropdown.setSingleDisabledOption.calledOnceWith('Network error')).to.be.true;
        expect(dropdown.setOptions.called).to.be.false;
    });

    it('shows checker message if checker returns message', async function () {
        createDropdownController('things');

        checker.check.resolves({ message: 'Controller not ready' });

        await controller.refresh();

        expect(dropdown.setSingleDisabledOption.calledOnceWith('Controller not ready')).to.be.true;
        expect(fetchFn.called).to.be.false;
    });

    it('calls fetchFn for things and populates dropdown on success', async function () {
        createDropdownController('things', 'C');
        const things = [{ UID: 'B' }, { UID: 'A' }, { UID: 'C' }];
        checker.check.resolves({});

        fetchFn.resolves(things);

        await controller.refresh();

        expect(fetchFn.calledOnceWith('openhab4/things', { controller: 'controller-1' })).to.be.true;
        expect(dropdown.setOptions.calledOnce).to.be.true;
        expect(dropdown.setOptions.firstCall.args[0]).to.deep.equal(['A', 'B', 'C']);
        expect(dropdown.setOptions.firstCall.args[1]).to.equal('C');
    });
});
