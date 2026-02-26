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

const { expect } = require("chai");
const sinon = require("sinon");

const { safeAsync } = require("../static/ui-utils.js");

async function flush() {
    return new Promise(setImmediate);
}

describe("ui-utils safeAsync", function () {

    let consoleErrorStub;

    beforeEach(function () {
        consoleErrorStub = sinon.stub(console, "error");
    });

    afterEach(function () {
        sinon.restore();
    });

    it("executes the function", async function () {

        const fn = sinon.spy();

        safeAsync(fn);

        await flush(); // flush microtask queue

        expect(fn.calledOnce).to.be.true;
        expect(consoleErrorStub.notCalled).to.be.true;
    });

    it("logs error if function throws synchronously", async function () {

        const error = new Error("boom");

        safeAsync(() => {
            throw error;
        });

        await flush();

        expect(consoleErrorStub.calledOnce).to.be.true;

        const [message, loggedError] = consoleErrorStub.firstCall.args;

        expect(message).to.equal("openHAB editor error:");
        expect(loggedError).to.equal(error);
    });

    it("logs error if function returns a rejected promise", async function () {

        const error = new Error("async boom");

        safeAsync(() => Promise.reject(error));

        await flush();

        expect(consoleErrorStub.calledOnce).to.be.true;

        const [, loggedError] = consoleErrorStub.firstCall.args;
        expect(loggedError).to.equal(error);
    });

});