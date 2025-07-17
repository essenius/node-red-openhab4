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

const fs = require('fs');
const path = require('path');
const { expect } = require('chai');

describe('Code validation', function () {

    const requiredFiles = [
        'lib/connectionUtils.js',
        'lib/constants.js',
        'lib/consumerNodeBase.js',
        'lib/controllerLogic.js',
        'lib/eventsLogic.js',
        'lib/getLogic.js',
        'lib/healthLogic.js',
        'lib/inLogic.js',
        'lib/openhabConnection.js',
        'lib/outLogic.js',
        'nodes/events.js',
        'nodes/events.html',
        'nodes/get.js',
        'nodes/get.html',
        'nodes/health.js',
        'nodes/health.html',
        'nodes/in.js',
        'nodes/in.html',
        'nodes/out.js',
        'nodes/out.html',
        'package.json',
        'static/ui-constants.js',
        'static/ui-utils.js',
    ];

    describe('Required files', function () {
        requiredFiles.forEach(file => {
            it(`should exist: ${file}`, function () {
                const filePath = path.join(__dirname, '..', file);
                expect(fs.existsSync(filePath), `${file} should exist`).to.be.true;
            });
        });
    });

    describe('Module imports', function () {
        const modulesToTest = [
            '../lib/connectionUtils',
            '../lib/constants',
            '../lib/consumerNodeBase',
            '../lib/controllerLogic',
            '../lib/eventsLogic',
            '../lib/getLogic',
            '../lib/healthLogic',
            '../lib/inLogic',
            '../lib/openhabConnection',
            '../lib/outLogic',
        ];

        modulesToTest.forEach(modulePath => {
            it(`should load ${modulePath}`, function () {
                expect(() => require(modulePath)).to.not.throw();
            });
        });
    });

    describe('Node-RED registration in package.json', function () {
        it('should register all expected nodes', function () {
            const packageJson = require('../package.json');
            const nodeRedNodes = packageJson['node-red']?.nodes || {};
            const expectedNodes = [
                'openhab4-controller',
                'openhab4-events',
                'openhab4-get',
                'openhab4-health',
                'openhab4-in',
                'openhab4-out'
            ];
            expectedNodes.forEach(nodeName => {
                expect(nodeRedNodes[nodeName], `${nodeName} should be registered in package.json`).to.exist;
            });
        });
    });

});