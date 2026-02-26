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

"use strict";

const { expect } = require('chai');
const sinon = require('sinon');

const { EventEmitter } = require('node:events');
const { ControllerConfigChangeListener } = require('../static/ui-utils');

describe('ui-utils ControllerConfigChangeListener', function () {

    let RED;
    let controllerInput;
    let refreshSpy;
    let listener;

    beforeEach(function () {
        refreshSpy = sinon.spy();

        const emitter = new EventEmitter();
        // Fake RED.events event emitter

        RED = {
            events: emitter
        };

        controllerInput = { value: 'controller-1' };

        listener = new ControllerConfigChangeListener(RED, controllerInput, refreshSpy);
    });

    afterEach(function () {
        listener.destroy();
    });

    it('should call refresh when matching config node changes', async function () {
        RED.events.emit('nodes:change', {
            id: 'controller-1',
            _def: { category: 'config' }
        });

        expect(refreshSpy.calledOnce).to.be.true;
    });

    it('should not call refresh if category is not config', function () {
        RED.events.emit('nodes:change', {
            id: 'controller-1',
            _def: { category: 'other' }
        });

        expect(refreshSpy.notCalled).to.be.true;
    });

    it('should not call refresh if id does not match selected controller', function () {
        RED.events.emit('nodes:change', {
            id: 'controller-2',
            _def: { category: 'config' }
        });

        expect(refreshSpy.notCalled).to.be.true;
    });

    it('should not call refresh if no controller selected', function () {
        controllerInput.value = '';

        RED.events.emit('nodes:change', {
            id: 'controller-1',
            _def: { category: 'config' }
        });

        expect(refreshSpy.notCalled).to.be.true;
    });

    it('should detach listener on destroy', function () {
        listener.destroy();

        RED.events.emit('nodes:change', {
            id: 'controller-1',
            _def: { category: 'config' }
        });

        expect(refreshSpy.notCalled).to.be.true;
    });


    it('destroy should be idempotent', function () {
        listener.destroy();
        listener.destroy(); // second call should be safe

        RED.events.emit('nodes:change', {
            id: 'controller-1',
            _def: { category: 'config' }
        });

        expect(refreshSpy.notCalled).to.be.true;
    });

    it('should isolate multiple listener instances', function () {
        const emitter = new EventEmitter();

        RED = { events: emitter };

        const input1 = { value: 'controller-1' };
        const input2 = { value: 'controller-2' };

        const spy1 = sinon.spy();
        const spy2 = sinon.spy();

        const l1 = new ControllerConfigChangeListener(RED, input1, spy1);
        const l2 = new ControllerConfigChangeListener(RED, input2, spy2);

        emitter.emit('nodes:change', {
            id: 'controller-1',
            _def: { category: 'config' }
        });

        expect(spy1.calledOnce).to.be.true;
        expect(spy2.notCalled).to.be.true;

        l1.destroy();
        l2.destroy();
    });
});