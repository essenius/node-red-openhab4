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

const sinon = require('sinon');

function createMockRED(registerType = sinon.spy(), httpAdminGet = sinon.spy()) {
    return {
        nodes: {
            registerType,
            createNode: sinon.spy(),
            getNode: sinon.stub().returns({ handler: { config: { url: "http://mocked", token: "abc" }}})
        },
        httpAdmin: { get: httpAdminGet, use: sinon.spy() }
    };
}

function createNodeThis(name = "") {
    return {
        credentials: {},
        name,
        log: sinon.spy(),
        on: sinon.spy(),
        warn: sinon.spy(),
        status: sinon.spy(),
        error: sinon.spy(),
        setStatus: sinon.spy(),
        removeListener: sinon.spy()
    };
}

module.exports = { createMockRED, createNodeThis };
