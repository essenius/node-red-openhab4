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

const { ControllerStateTracker } = require('../static/ui-utils.js'); // adjust path as needed

describe('ui-utils ControllerStateTracker', function () {
    let tracker;

    beforeEach(function () {
        tracker = new ControllerStateTracker();
    });

    it('setHash stores the hash', function () {
        tracker.setHash('controller1', 'hash123');
        expect(tracker.trackedControllers.get('controller1')).to.equal('hash123');
    });

    it('getHashWithDefault returns default if not set', function () {
        const value = tracker.getHashWithDefault('controller2', 'defaultHash');
        expect(value).to.equal('defaultHash');
        expect(tracker.trackedControllers.get('controller2')).to.equal('defaultHash');
    });

    it('getHashWithDefault returns existing value if set', function () {
        tracker.setHash('controller3', 'existingHash');
        const value = tracker.getHashWithDefault('controller3', 'defaultHash');
        expect(value).to.equal('existingHash');
    });

    it('hasHashChanged returns true if different', function () {
        tracker.setHash('controller4', 'hashA');
        expect(tracker.hasHashChanged('controller4', 'hashB')).to.be.true;
        expect(tracker.hasHashChanged('controller4', 'hashA')).to.be.false;
    });


    it('combined behavior', function () {
        const id = 'controller5';
        const defaultHash = 'hashX';

        // initially not set → default returned
        expect(tracker.getHashWithDefault(id, defaultHash)).to.equal(defaultHash);

        // hash has not changed
        expect(tracker.hasHashChanged(id, defaultHash)).to.be.false;

        // updating hash → detected as changed
        tracker.setHash(id, 'hashY');
        expect(tracker.hasHashChanged(id, defaultHash)).to.be.true;

        // make sure that this works without RED
        expect(tracker.destroy()).to.not.throw;
    });


    it('stores hashes from RED.nodes.eachConfig on deploy event', function () {
        let deployHandler;

        // Fake RED object
        const RED = {
            nodes: {
                eachConfig: (callback) => {
                    callback({ id: 'config1', hash: 'hash1' });
                    callback({ id: 'config2', hash: null });      // should be ignored
                    callback({ id: 'config3', hash: 'hash3' });
                }
            },
            events: {
                on: (event, handler) => {
                    if (event === 'deploy') {
                        deployHandler = handler;
                    }
                },
                off: () => { deployHandler = null; }
            }
        };

        const tracker = new ControllerStateTracker(RED);

        // Ensure handler was attached
        expect(deployHandler).to.be.a('function');

        // Fire deploy event manually
        deployHandler();

        // Verify only configs with hash were stored
        expect(tracker.trackedControllers.get('config1')).to.equal('hash1');
        expect(tracker.trackedControllers.has('config2')).to.be.false;
        expect(tracker.trackedControllers.get('config3')).to.equal('hash3');

        tracker.destroy();
        
        expect(tracker._deployHandler).to.be.null;
        expect(deployHandler).to.be.null;
    });
});