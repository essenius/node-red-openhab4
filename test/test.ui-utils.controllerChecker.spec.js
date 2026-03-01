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
const { ControllerChecker } = require('../static/ui-utils');

describe('ui-utils ControllerChecker', function () {
    let RED;
    let tracker;
    let checker;
    let clock;

    beforeEach(function () {
        RED = {
            nodes: {
                node: sinon.stub(),
            },
        };

        tracker = {
            getHashWithDefault: sinon.stub(),
            hasHashChanged: sinon.stub(),
        };

        checker = new ControllerChecker(RED, tracker);

        clock = sinon.useFakeTimers();

        sinon.stub(console, 'log');
    });

    afterEach(function () {
        sinon.restore();
        clock.restore();
    });

    it('returns message when no controller selected', async function () {
        const result = await checker.check({ value: null });

        expect(result).to.deep.equal({
            message: 'Select a controller first',
        });
    });

    it('returns message when controller node not found', async function () {
        RED.nodes.node.returns(null);

        const promise = checker.check({ value: 'ctrl-1' });

        // advance retry loop
        await clock.runAllAsync();

        const result = await promise;

        expect(result).to.deep.equal({
            message: 'Controller not ready',
        });

        expect(RED.nodes.node.callCount).to.equal(10);
    });

    it('returns warning when hash changed', async function () {
        const controllerNode = { id: 'ctrl-1', hash: 'newHash' };

        RED.nodes.node.returns(controllerNode);
        tracker.getHashWithDefault.returns('oldHash');
        tracker.hasHashChanged.returns(true);

        const result = await checker.check({ value: 'ctrl-1' });

        expect(result).to.deep.equal({
            message: '⚠ Controller configuration changed, deploy first',
        });

        expect(tracker.getHashWithDefault.calledWith('ctrl-1', 'newHash')).to.be.true;
        expect(tracker.hasHashChanged.calledWith('ctrl-1', 'newHash')).to.be.true;
    });

    it('returns controllerNode when everything is valid', async function () {
        const controllerNode = { id: 'ctrl-1', hash: 'hash1' };

        RED.nodes.node.returns(controllerNode);
        tracker.getHashWithDefault.returns('hash1');
        tracker.hasHashChanged.returns(false);

        const result = await checker.check({ value: 'ctrl-1' });

        expect(result).to.deep.equal({
            controllerNode,
        });
    });

    it('retries until node becomes available', async function () {
        const controllerNode = { id: 'ctrl-1' };

        RED.nodes.node.onFirstCall().returns(null).onSecondCall().returns(null).onThirdCall().returns(controllerNode);

        const promise = checker.getControllerNode('ctrl-1', 5);

        await clock.runAllAsync();

        const result = await promise;

        expect(result).to.equal(controllerNode);
        expect(RED.nodes.node.callCount).to.equal(3);
    });

    it('returns null when node never appears', async function () {
        RED.nodes.node.returns(null);

        const promise = checker.getControllerNode('ctrl-1', 3);

        await clock.runAllAsync();

        const result = await promise;

        expect(result).to.be.null;
        expect(RED.nodes.node.callCount).to.equal(3);
    });
});

describe('ui-utils ControllerChecker without mocking ControllerChecker', function () {
    it('second checker gets the same state tracker', async function () {
        const events = { on: sinon.spy(), off: sinon.spy() };
        const RED = { events };
        const checker1 = new ControllerChecker(RED);
        const checker2 = new ControllerChecker(RED);
        expect(checker1.tracker).to.equal(checker2.tracker, 'Trackers are equal');
        expect(events.on.calledOnce, 'one deploy listener added').to.be.true;
    });
});
