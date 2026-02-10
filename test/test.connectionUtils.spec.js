
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

const { expect } = require("chai");
const sinon = require("sinon");
const proxyquire = require("proxyquire");
const { ERROR_TYPES } = require("../lib/constants");

function loadConnectionUtils() {
    proxyquire("../lib/connectionUtils", {
        "node-fetch": () => { console.log("called"); throw new Error("fake node-fetch error"); }
    });
}

describe("connectionUtils Load", function () {

    it("should throw an error if fetch is not available", function () {
        // Skip this test on Node.js 18 or higher as fetch is built-in
        const [major] = process.versions.node.split(".").map(Number);
        if (major >= 18) {
            this.skip("this test is skipped", () => { /* ... */ });
        }

        let originalFetch = globalThis.fetch;
        globalThis.fetch = undefined; // Simulate no fetch available


        expect(loadConnectionUtils).to.throw("No fetch available. Install 'node-fetch' or upgrade Node.js. Error: fake node-fetch error");

        // Restore globalThis.fetch
        if (originalFetch !== undefined) {
            globalThis.fetch = originalFetch;
        }
    });

});

function createFakeResponse({ ok = true, status = 200, text = "", statusText = "", contentType = "application/json" } = {}) {
    return {
        ok,
        status,
        statusText,
        text: async () => text,
        headers: {
            get: (header) => {
                if (header.toLowerCase() === "content-type") {
                    return contentType;
                }
                return undefined;
            }
        }
    };
}

describe("connectionUtils.httpRequest", function () {

    // Import the httpRequest function from connectionUtils.js, using proxyquire to stub out node-fetch
    // This allows us to control the behavior of fetch without making actual HTTP requests.

    let fetchStub, httpRequest, originalFetch, setDefaults;

    beforeEach(() => {
        originalFetch = globalThis.fetch;
        fetchStub = sinon.stub();
        globalThis.fetch = fetchStub;
        ({ httpRequest, setDefaults } = proxyquire("../lib/connectionUtils", {
            "node-fetch": fetchStub
        }));
    });

    afterEach(() => {
        if (originalFetch === undefined) {
            delete globalThis.fetch;
        } else {
            globalThis.fetch = originalFetch;
        }
    });

    const successTestCases = [
        {
            testId: "valid JSON data",
            fetchResponse: { text: JSON.stringify({ foo: "bar" }) },
            data: { foo: "bar" }
        },
        {
            testId: "empty responses",
            fetchResponse: { text: "" },
            data: null
        },
        {
            testId: "text/plain content type",
            fetchResponse: { text: "Hello, World!", contentType: "text/plain" },
            data: "Hello, World!"
        },

    ];

    for (const { testId, fetchResponse, data } of successTestCases) {
        it(`should handle valid ${testId} as expected`, async function () {
            fetchStub.resolves(createFakeResponse(fetchResponse));
            const result = await httpRequest("http://test", {}, {});

            if (data === null) {
                expect(result.data).to.be.null;
            } else {
                expect(result.data).to.deep.equal(data);
            }
        });
    };

    const errorTestCases = [
        {
            testId: "503 - retry",
            fetchResponse: { status: 503 },
            retry: true,
            status: 503,
        },
        {
            testId: "403 - no retry",
            fetchResponse: { status: 403, statusText: "Forbidden", text: '{"error":{"message":"Access denied","http-code":403}}' },
            retry: false,
            status: 403,
            message: "Access denied" 
        },        
        {
            testId: "404 with body - no retry",
            fetchResponse: { status: 404, statusText: "Not Found", text: '{"error":{"message":"Item q does not exist!","http-code":404}}' },
            retry: false,
            status: 404,
            message: "Item q does not exist!"
        },
        {
            testId: "404 without body - retry",
            fetchResponse: { status: 404, statusText: "Not Found" },
            retry: true,
            status: 404,
            message: "Not Found"
        },
        {
            testId: "401 without credentials - authRequired - no text",
            fetchResponse: { status: 401, statusText: "Unauthorized" },
            authRequired: true,
            status: 401,
            message: "Unauthorized"
        },
        {
            testId: "401 without credentials - authRequired",
            fetchResponse: { status: 401, statusText: "Unauthorized", text: '{"error":{"message":"Authentication required","http-code":401}}' },
            authRequired: true,
            status: 401,
            message: "Authentication required"
        },
        {
            testId: "401 with credentials - authFailed",
            config: { username: "foo" },
            fetchResponse: { status: 401, text: '{"error":{"message":"Invalid credentials","http-code":401}}' },
            authFailed: true,
            status: 401,
            message: "Invalid credentials"
        },
        {
            testId: "No status, statusText",
            fetchResponse: { status: null, statusText: "Internal Server Error" },
            message: "Internal Server Error"
        },
        {
            testId: "No status, no statusText",
            fetchResponse: { status: null, statusText: null },
            message: "HTTP Error 500"
        },
        {
            testId: "XML",
            fetchResponse: { status: 400, headers: new Headers({ "content-type": "application/xml" }), text: "<xml>error</xml>" },
            message: "<xml>error</xml>"
        }
    ];

    for (const { testId, config, fetchResponse, authRequired, authFailed, retry, status, message } of errorTestCases) {
        it(`should report an error for ${testId} as expected`, async function () {
            fetchStub.resolves(createFakeResponse(fetchResponse));
            let conf = config ?? {};
            conf.url = "http://mocked";
            conf = setDefaults(conf);
            const result = await httpRequest("http://test", conf, {});
            expect(result.ok, "Result not ok").to.be.false;
            if (retry !== undefined) expect(!!result.retry, "retry test").to.equal(retry);
            if (authRequired !== undefined) expect(!!result.authRequired, `authRequired test for ${testId}`).to.equal(authRequired);
            if (authFailed !== undefined) expect(!!result.authFailed, `autFailed test for ${testId}`).to.equal(authFailed);
            if (status !== undefined) expect(result.status, `status test for ${testId}`).to.equal(status);
            if (message !== undefined) expect(result.message, `message test for ${testId}`).to.equal(message);
        });
    };

    describe("connectionUtils.httpRequest error handling", function () {

        const cases = [
            {
                name: "should report error on network failure",
                code: "ENOTFOUND",
                errorType: ERROR_TYPES.NETWORK,
                expected: { ok: false, retry: true, type: ERROR_TYPES.NETWORK, message: "ENOTFOUND" }
            },
            {
                name: "should report unknown error",
                code: "BOGUS",
                errorType: ERROR_TYPES.UNKNOWN,
                expected: { ok: false, type: ERROR_TYPES.UNKNOWN, message: "BOGUS" }
            },
            {
                name: "should report error on tls failure",
                code: "ERR_TLS_CERT_EXPIRED",
                errorType: ERROR_TYPES.TLS,
                expected: { ok: false, type: ERROR_TYPES.TLS, message: "ERR_TLS_CERT_EXPIRED" }
            },
            {
                name: "should show the message of an error that does not have a cause property",
                code: undefined,
                errorType: undefined,
                expected: { ok: false, retry: false, type: ERROR_TYPES.UNKNOWN, name: "TypeError", message: "fetch failed" }
            }
        ];

        cases.forEach(({ name, code, expected }) => {
            it(name, async function () {
                const cause = new Error("Test failure");
                cause.code = code;
                const err = new TypeError("fetch failed", { cause });

                fetchStub.rejects(err);

                const result = await httpRequest("http://test", {}, {});
                expect(result).to.deep.equal(expected);
            });
        });
    });

});

/*function setConfig(username, password) {
    return {
        protocol: "https",
        host: "openhab.local",
        port: 8443,
        path: "api",
        username: username,
        password: password
    };
}


 describe("connectionUtils.getConnectionString", function () {

    const { getConnectionString } = require("../lib/connectionUtils");

    it("should build a URL without credentials", function () {
        const config = {
            url: "http://localhost:8080",
            path: "rest"
        };
        const url = getConnectionString(config);
        expect(url).to.equal("http://localhost:8080/rest");
    });


    it("should build a URL with credentials when includeCredentials is true, and pass empty password", function () {
        const config = setConfig("user", "");
        const url = getConnectionString(config, { includeCredentials: true });
        expect(url).to.equal("https://user:@openhab.local:8443/api");
    });

    it("should encode credentials in the URL and pass non-empty password", function () {
        const config = setConfig("user@domain.com", "p@ss word");
        const url = getConnectionString(config, { includeCredentials: true });
        expect(url).to.equal("https://user%40domain.com:p%40ss%20word@openhab.local:8443/api");
    });

    it("does require protocol, port and host, but does not require path, and does not include username if includeCredentials was not set", function () {
        const config = {
            username: "user"
        };
        const url = getConnectionString(config);
        expect(url).to.equal("undefined://undefined:undefined");
    });
}); */

describe("connectionUtils.isPhantomError", function () {

    const { isPhantomError } = require("../lib/connectionUtils");

    it("should return false for undefined", function () {
        expect(isPhantomError(undefined)).to.be.false;
    });

    it("should return false for null", function () {
        expect(isPhantomError(null)).to.be.false;
    });

    it("should return false for non-object types", function () {
        expect(isPhantomError("error")).to.be.false;
        expect(isPhantomError(42)).to.be.false;
        expect(isPhantomError(true)).to.be.false;
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

describe("connectionUtils.retryable", function () {
    it("should retry", async function () {
        const { retryable } = require("../lib/connectionUtils");

        let callCount = 0;
        const mockAsync = sinon.stub().callsFake(async () => {
            return { ok: callCount++ > 0, retry: true };
        });
        const result = await retryable(mockAsync, { retryTimeout: 1, startInterval: 1 });
        expect(result.ok).to.be.true;
        expect(callCount).to.equal(2);

    });
});

describe("connectionUtils.setDefaultsTest", function () {

    const { setDefaults } = require("../lib/connectionUtils");

    it("should provide all defaults", function () {
        const config = { url: "http://localhost"};
        setDefaults(config);
        expect(config.url).to.equal("http://localhost", "url OK");
        expect(config.token).to.equal("", "token empty");
        expect(config.username).to.equal("", "username empty");
        expect(config.password).to.equal("", "password empty");
        expect(config.retryTimeout).to.equal(Infinity, "retryTimeout infinite")
    });

    it("should default https to 8443 and trim values correctly", function () {
        const config = {

            url: "   https://server:8443/   ",
            token: "  ",
            username: "    abc",
            password: "  def  ",
            retryTimeout: " 10000 "
        }
        setDefaults(config);
        expect(config.url).to.equal("https://server:8443", "url trimmed and slash removed");
        expect(config.token).to.equal("", "token empty");
        expect(config.username).to.equal("abc", "username trimmed");
        expect(config.password).to.equal("  def  ", "password preserves leading/trailing spaces");
        expect(config.retryTimeout).to.equal(10000, "retryTimeout trimmed and converted to a number");
    });

    /*it("should not override port if specified", function () {
        const config = {
            protocol: "http",
            host: "a",
            port: 8443,
            path: "/root/",
            username: "    "
        };
        setDefaults(config);
        expect(config.protocol).to.equal("http", "Protocol OK");
        expect(config.host).to.equal("a", "Host OK");
        expect(config.port).to.equal(8443, "Port OK");
        expect(config.path).to.equal("root", "Path ok");
        expect(config.username).to.equal("", "username ok");

    });*/
});

