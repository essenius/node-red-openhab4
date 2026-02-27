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

// Import or define ListenerManager here
const { ListenerManager } = require('../static/ui-utils.js');

describe('ListenerManager', function () {
    let manager;
    let listenerA, listenerB;

    beforeEach(function () {
        manager = new ListenerManager();

        listenerA = { destroy: sinon.stub() };
        listenerB = { destroy: sinon.stub() };
    });

    it('should add and store listeners', function () {
        manager.add('a', listenerA);
        expect(manager.listeners.get('a')).to.equal(listenerA);

        manager.add('b', listenerB);
        expect(manager.listeners.get('b')).to.equal(listenerB);
    });

    it('should remove a listener by key', function () {
        manager.add('a', listenerA);
        manager.add('b', listenerB);

        manager.remove('a');
        expect(listenerA.destroy.calledOnce).to.be.true;
        expect(manager.listeners.has('a')).to.be.false;
        expect(manager.listeners.has('b')).to.be.true;
    });

    it('should clear all listeners', function () {
        manager.add('a', listenerA);
        manager.add('b', listenerB);

        manager.clear();
        expect(listenerA.destroy.calledOnce).to.be.true;
        expect(listenerB.destroy.calledOnce).to.be.true;
        expect(manager.listeners.size).to.equal(0);
    });

    it('should replace a listener if key already exists', function () {
        const listenerA2 = { destroy: sinon.stub() };
        manager.add('a', listenerA);
        manager.add('a', listenerA2);

        // old listener destroyed
        expect(listenerA.destroy.calledOnce).to.be.true;
        expect(manager.listeners.get('a')).to.equal(listenerA2);
    });

    it('forEach iterates over all listeners', function () {
        manager.add('a', listenerA);
        manager.add('b', listenerB);

        const keys = [];
        const values = [];
        manager.forEach((listener, key) => {
            keys.push(key);
            values.push(listener);
        });

        expect(keys).to.have.members(['a', 'b']);
        expect(values).to.have.members([listenerA, listenerB]);
    });

    it('removing non-existent listener does nothing', function () {
        expect(() => manager.remove('nonexistent')).to.not.throw();
    });

    it('clearing empty manager does nothing', function () {
        expect(() => manager.clear()).to.not.throw();
    });
});
