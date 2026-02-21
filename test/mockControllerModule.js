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
const proxyquire = require('proxyquire');

proxyquire.noCallThru();

function createMockControllerModule({ connectionOverrides = {}, handlerOverrides = {} } = {}) {

    // Fake OpenhabConnection
    const fakeConnection = {
        startEventSource: sinon.stub(),
        sendRequest: sinon.stub().resolves({ ok: true, data: [] }),
        close: sinon.stub(),
        ...connectionOverrides
    };

    // Fake ControllerHandler
    const fakeHandler = {
        setupNode: sinon.stub().returnsThis(),
        control: sinon.stub(),
        _onClose: sinon.stub(),
        connection: fakeConnection,
        ...handlerOverrides
    };

    const ControllerHandlerStub = sinon.stub().returns(fakeHandler);

    // Load controller.js with stub injected
    const controllerModule = proxyquire("../nodes/controller.js", {
        "../lib/controllerHandler": { setupControllerHandler: ControllerHandlerStub }
    });

    return { controllerModule, fakeHandler, fakeConnection, ControllerHandlerStub };
}

module.exports = { createMockControllerModule };

