
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

describe("connectionUtils.httpRequest", function () {

    // Import the httpRequest function from connectionUtils.js, using proxyquire to stub out node-fetch
    // This allows us to control the behavior of fetch without making actual HTTP requests.

    let fetchStub, httpRequest, originalFetch;

    beforeEach(() => {
        originalFetch = global.fetch;
        fetchStub = sinon.stub();
        global.fetch = fetchStub;
        ({ httpRequest } = proxyquire("../lib/connectionUtils", {
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

    [
        {
            testId: "valid JSON data",
            fakeResponse: { text: JSON.stringify({ foo: "bar" }) },
            data: { foo: "bar" }
        },
        {
            testId: "empty responses",
            fakeResponse: { text: "" },
            data: null
        },
        {
            testId: "text/plain content type",
            fakeResponse: { text: "Hello, World!", contentType: "text/plain" },
            data: "Hello, World!"
        },

    ].forEach(({ testId, fakeResponse, data }) => {
        it(`should handle ${testId} as expected`, async function () {
            fetchStub.resolves(createFakeResponse(fakeResponse));
            const result = await httpRequest("http://test", {}, {});
            if (data === null) {
                expect(result.data).to.be.null;
            } else {
                expect(result.data).to.deep.equal(data);
            }
        });
    });

    [
        {
            testId: "503 - retry",
            fakeResponse: { status: 503 },
            retry: true,
            status: 503,
        },
        {
            testId: "404 with body - no retry",
            fakeResponse: { status: 404, statusText: "Not Found", text: '{"error":{"message":"Item q does not exist!","http-code":404}}' },
            retry: false,
            status: 404,
            message: "Item q does not exist!"
        },
        {
            testId: "404 without body - retry",
            fakeResponse: { status: 404, statusText: "Not Found" },
            retry: true,
            status: 404,
            message: "Not Found"
        },
        {
            testId: "401 without credentials - authRequired",
            fakeResponse: { status: 401 },
            authRequired: true,
            status: 401,
            message: "No credentials provided."
        },
        {
            testId: "No status, statusText",
            fakeResponse: { status: null, statusText: "Internal Server Error" },
            message: "Internal Server Error"
        },
        {
            testId: "No status, no statusText",
            fakeResponse: { status: null, statusText: null },
            message: "HTTP Error 500"
        },
        {
            testId: "Invalid JSON",
            fakeResponse: { text: "<>" },
            message: "Unexpected token '<', \"<>\" is not valid JSON"
        },
        {
            testId: "XML",
            fakeResponse: { status: 400, contentType: "application/xml", text: "<xml>error</xml>" },
            message: "Unsupported content type: application/xml"
        }
    ].forEach(({ testId, fakeResponse, authRequired, authFailed, retry, status, message }) => {
        it(`should throw an error for ${testId} as expected`, async function () {
            fetchStub.resolves(createFakeResponse(fakeResponse));
            try {
                await httpRequest("http://test", {}, {});
                expect.fail("Expected error to be thrown");
            } catch (error) {
                if (retry !== undefined) expect(!!error.retry, "retry test").to.equal(retry);
                if (authRequired !== undefined) expect(!!error.authRequired, "authRequired test").to.equal(authRequired);
                if (authFailed !== undefined) expect(!!error.authFailed, "autFailed test").to.equal(authFailed);
                if (status !== undefined) expect(error.status, "status test").to.equal(status);
                if (message !== undefined) expect(error.message, "message test").to.equal(message);
            }
        });
    });

    it("should handle HTTP 401 as authRequired and report wrong credentials", async function () {
        const fakeResponse = createFakeResponse({ ok: false, status: 401 });
        fetchStub.resolves(fakeResponse);

        try {
            await httpRequest("http://test", { username: "foo" }, {});
            expect.fail("Expected error to be thrown");
        } catch (error) {
            expect(error.authFailed).to.be.true;
            expect(error.status).to.equal(401);
            expect(error.message).to.equal("Wrong credentials provided.");
        }
    });

    it("should return error on fetch failure", async function () {
        fetchStub.rejects(new Error("network fail"));
        try {
            await httpRequest("http://test", {}, {});
            expect.fail("Expected error to be thrown");
        } catch (result) {
            expect(result).to.be.an("error");
            expect(result.message).to.equal("network fail");
        }
    });

    it("should return error on fetch failure and show default message", async function () {
        fetchStub.rejects(new Error());
        try {
            await httpRequest("http://test", {}, {});
            expect.fail("Expected error to be thrown");
        } catch (error) {
            expect(error.message).to.equal("Fetch failed");
        }
    });
});

describe("connectionUtils.getConnectionString", function () {

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

    function setConfig(username, password) {
        return {
            protocol: "https",
            host: "openhab.local",
            port: 8443, 
            path: "api",
            username: username,
            password: password
        };
    }
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
});

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

describe("connectionUtils.setDefaultsTest", function () {

    const { setDefaults } = require("../lib/connectionUtils");

    it("should provide all defaults", function () {
        const config = {};
        setDefaults(config);
        expect(config.protocol).to.equal("http", "Protocol OK");
        expect(config.host).to.equal("localhost", "Host OK");
        expect(config.port).to.equal(8080, "Port OK");
        expect(config.path).to.equal("", "Path empty");
        expect(config.username).to.equal("", "username empty");
        expect(config.password).to.equal("", "password empty");
    });

    it("should default https to 8443 and trim values correctly", function () {
        const config = {
            protocol: "   https  ",
            host: " 192.168.1.1  ",
            port: NaN,
            path: " /  ",
            username: "    abc",
            password: "  def  "
        }
        setDefaults(config);
        expect(config.protocol).to.equal("https", "Protocol trimmed");
        expect(config.host).to.equal("192.168.1.1", "Host trimmed");
        expect(config.port).to.equal(8443, "Port OK");
        expect(config.path).to.equal("", "Path empty");
        expect(config.username).to.equal("abc", "username trimmed");
        expect(config.password).to.equal("  def  ", "password preserves leading/trailing spaces");
    });

    it("should not override port if specified", function () {
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

    });
});