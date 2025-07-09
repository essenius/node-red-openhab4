
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

const { expect } = require("chai");
const sinon = require("sinon");
const proxyquire = require("proxyquire");

describe("connectionUtils Load", function () {

    it("should throw an error if fetch is not available", function () {
        // Skip this test on Node.js 18 or higher as fetch is built-in
        const [major] = process.versions.node.split(".").map(Number);
        if (major >= 18) {
            this.skip();
        }

        let originalFetch = global.fetch;
        global.fetch = undefined; // Simulate no fetch available

        function loadConnectionUtils() {
            proxyquire("../lib/connectionUtils", {
                "node-fetch": () => { console.log("called"); throw new Error("fake node-fetch error"); }
            });
        }
        expect(loadConnectionUtils).to.throw("No fetch available. Install 'node-fetch' or upgrade Node.js. Error: fake node-fetch error");

        // Restore global.fetch
        if (originalFetch !== undefined) {
            global.fetch = originalFetch;
        }
    });

});

describe("fetchOpenHAB", function () {

    // Import the fetchOpenHAB function from connectionUtils.js, using proxyquire to stub out node-fetch
    // This allows us to control the behavior of fetch without making actual HTTP requests.

    let fetchStub, fetchOpenHAB, originalFetch;

    beforeEach(() => {
        originalFetch = global.fetch;
        fetchStub = sinon.stub();
        global.fetch = fetchStub;
        ({ fetchOpenHAB } = proxyquire("../lib/connectionUtils", {
            "node-fetch": fetchStub
        }));
    });

    afterEach(() => {
        if (originalFetch === undefined) {
            delete global.fetch;
        } else {
            global.fetch = originalFetch;
        }
    });

    function createFakeResponse({ ok = true, status = 200, text = "" } = {}) {
        return {
            ok,
            status,
            text: async () => text
        };
    }
    it("should return JSON data on success", async function () {
        const fakeResponse = createFakeResponse({ text: JSON.stringify({ foo: "bar" }) });
        fetchStub.resolves(fakeResponse);

        const result = await fetchOpenHAB("http://test", {}, {}, "json");
        expect(result.data).to.deep.equal({ foo: "bar" });
    });

    it("should allow empty responses", async function () {
        const fakeResponse = createFakeResponse({ text: "" });
        fetchStub.resolves(fakeResponse);

        const result = await fetchOpenHAB("http://test", {}, {}, "json");
        expect(result.data).to.be.null;
    });
    it("should return text data on success when responseType is text", async function () {
        const fakeResponse = createFakeResponse({ text: "plain text" })
        fetchStub.resolves(fakeResponse);

        const result = await fetchOpenHAB("http://test", {}, {}, "text");
        expect(result.data).to.equal("plain text");
    });

    it("should handle HTTP 503 as retry", async function () {
        const fakeResponse = createFakeResponse({ ok: false, status: 503 });
        fetchStub.resolves(fakeResponse);

        const result = await fetchOpenHAB("http://test", {}, {});
        expect(result.retry).to.be.true;
        expect(result.status).to.equal(503);
    });

    it("should handle HTTP 401 as authRequired and report missing credentials", async function () {
        const fakeResponse = createFakeResponse({ ok: false, status: 401 });
        fetchStub.resolves(fakeResponse);

        const result = await fetchOpenHAB("http://test", {}, {});
        expect(result.authRequired).to.be.true;
        expect(result.status).to.equal(401);
        expect(result.error.message).to.equal("Authentication required but no credentials provided.");
    });

    it("should handle HTTP 401 as authRequired and report wrong credentials", async function () {
        const fakeResponse = createFakeResponse({ ok: false, status: 401 });
        fetchStub.resolves(fakeResponse);

        const result = await fetchOpenHAB("http://test", { username: "foo" }, {});
        expect(result.authFailed).to.be.true;
        expect(result.status).to.equal(401);
        expect(result.error.message).to.equal("Authentication failed. Please check your credentials.");
    });

    it("should return error on fetch failure", async function () {
        fetchStub.rejects(new Error("network fail"));
        const result = await fetchOpenHAB("http://test", {}, {});
        expect(result.error).to.be.an("error");
        expect(result.error.message).to.equal("network fail");
    });

    it("should return the error code on any other error", async function () {
        const fakeResponse = createFakeResponse({ ok: false, status: 500 });
        fetchStub.resolves(fakeResponse);
        const result = await fetchOpenHAB("http://test", {}, {});
        expect(result.error).to.be.an("error");
        expect(result.error.message).to.include("HTTP 500");
    });

    it("should throw an error if JSON is invalid", async function () {
        const fakeResponse = createFakeResponse({ text: "<>" });
        fetchStub.resolves(fakeResponse);

        const result = await fetchOpenHAB("http://test", {}, {}, "json");
        expect(result.error).to.be.an("error");
        expect(result.error.message).to.include("Invalid JSON response");
    });
});


describe("getConnectionString", function () {

    const { getConnectionString } = require("../lib/connectionUtils");

    it("should build a URL without credentials", function () {
        const config = {
            protocol: "http",
            host: "localhost",
            port: 8080,
            path: "rest"
        };
        const url = getConnectionString(config);
        expect(url).to.equal("http://localhost:8080/rest");
    });

    it("should build a URL with credentials when includeCredentials is true, and pass empty password", function () {
        const config = {
            protocol: "https",
            host: "openhab.local",
            port: 8443,
            path: "api",
            username: "user",
            password: ""
        };
        const url = getConnectionString(config, { includeCredentials: true });
        expect(url).to.equal("https://user:@openhab.local:8443/api");
    });

    it("should encode credentials in the URL and pass non-empty password", function () {
        const config = {
            protocol: "https",
            host: "openhab.local",
            port: 8443,
            path: "api",
            username: "user@domain.com",
            password: "p@ss word"
        };
        const url = getConnectionString(config, { includeCredentials: true });
        expect(url).to.equal("https://user%40domain.com:p%40ss%20word@openhab.local:8443/api");
    });

    it("should omit port and path if not specified, default to http, and not include username if includeCredentials was not set", function () {
        const config = {
            host: "localhost",
            username: "user"
        };
        const url = getConnectionString(config);
        expect(url).to.equal("http://localhost");
    });
});

describe("isPhantomError", function () {

    const { isPhantomError } = require("../lib/connectionUtils");

    it("should return true for undefined", function () {
        expect(isPhantomError(undefined)).to.be.true;
    });

    it("should return true for null", function () {
        expect(isPhantomError(null)).to.be.true;
    });

    it("should return true for non-object types", function () {
        expect(isPhantomError("error")).to.be.true;
        expect(isPhantomError(42)).to.be.true;
        expect(isPhantomError(true)).to.be.true;
    });

    it("should return false for an object without type", function () {
        expect(isPhantomError({ message: "fail" })).to.be.false;
    });

    it("should return true for an object with empty type property", function () {
        expect(isPhantomError({ type: {} })).to.be.true;
    });

    it("should return false for an object with non-empty type property", function () {
        expect(isPhantomError({ type: { code: 123 } })).to.be.false;
    });
});

describe("isSpecified", function () {

    const { isSpecified } = require("../lib/connectionUtils");

    it("should return false for undefined", function () {
        expect(isSpecified(undefined)).to.be.false;
    });

    it("should return false for null", function () {
        expect(isSpecified(null)).to.be.false;
    });

    it("should return false for empty string", function () {
        expect(isSpecified("")).to.be.false;
        expect(isSpecified("   ")).to.be.false;
    });

    it("should return true for non-empty string", function () {
        expect(isSpecified("abc")).to.be.true;
        expect(isSpecified("  abc  ")).to.be.true;
    });

    it("should return true for a number but false for NaN", function () {
        expect(isSpecified(0)).to.be.true;
        expect(isSpecified(42)).to.be.true;
        expect(isSpecified(-1)).to.be.true;
        expect(isSpecified(NaN)).to.be.false;
    });

    it("should return true for objects and booleans", function () {
        expect(isSpecified({})).to.be.true;
        expect(isSpecified([])).to.be.true;
        expect(isSpecified(true)).to.be.true;
        expect(isSpecified(false)).to.be.true;
    });
});