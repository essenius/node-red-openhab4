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

const { fetchJson } = require("../static/ui-utils.js");

describe("ui-utils fetchJson", function () {

    let fetchStub;
    let clock;
    let abortSpy;
    let controllerStub;

    beforeEach(function () {

        clock = sinon.useFakeTimers();

        abortSpy = sinon.spy();

        controllerStub = {
            signal: {},
            abort: abortSpy
        };

        global.AbortController = sinon.stub().returns(controllerStub);
        fetchStub = sinon.stub();
        global.fetch = fetchStub;
    });

    afterEach(function () {
        sinon.restore();
        clock.restore();
    });

    it("calls fetch with correct URL and headers", async function () {

        fetchStub.resolves({
            ok: true,
            json: async () => ({ success: true })
        });

        const result = await fetchJson(
            "http://example.com/api",
            { a: 1, b: "x" }
        );

        expect(fetchStub.calledOnce).to.be.true;

        const [url, options] = fetchStub.firstCall.args;

        expect(url).to.equal("http://example.com/api?a=1&b=x");
        expect(options.method).to.equal("GET");
        expect(options.headers.Accept).to.equal("application/json");

        expect(result).to.deep.equal({ success: true });
    });

    it("throws if response is not ok", async function () {

        fetchStub.resolves({
            ok: false,
            status: 404
        });

        try {
            await fetchJson("http://example.com/api", {});
            throw new Error("Expected error was not thrown");
        } catch (err) {
            expect(err.message).to.equal("HTTP 404");
        }
    });

    it("aborts when timeout is exceeded", async function () {

        // fetch never resolves
        fetchStub.callsFake(() => new Promise(() => {}));

        const promise = fetchJson("http://example.com/api", {}, 1000);

        // advance fake timer
        clock.tick(1000);

        expect(abortSpy.calledOnce).to.be.true;

        // prevent unhandled promise
        promise.catch(() => {});
    });

    it("clears timeout after successful completion", async function () {

        const clearTimeoutSpy = sinon.spy(global, "clearTimeout");

        fetchStub.resolves({
            ok: true,
            json: async () => ({ ok: true })
        });

        await fetchJson("http://example.com/api", {});

        expect(clearTimeoutSpy.calledOnce).to.be.true;
    });

});