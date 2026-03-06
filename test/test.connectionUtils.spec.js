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
const { ERROR_TYPES } = require('../lib/constants');

const {
    createEventSourceDependencies,
    httpRequest,
    resolveFetch,
    setDefaults,
    setFetch,
    classifyError,
} = require('../lib/connectionUtils');

describe('connectionUtils resolveFetch', function () {
    // assume globalThis.fetch isn't there and require fails

    beforeEach(() => {
        setFetch(undefined);
    });

    it('should throw an error if neither globalThis.fetch or undici are available', function () {
        expect(() =>
            resolveFetch(() => {
                throw new Error('fake require fail');
            }, {})
        ).to.throw("No fetch available. Install 'undici' or upgrade Node.js. Error: fake require fail");
    });

    it('should resolve to undici fetch if globalThis.fetch is unavailable', function () {
        const { fetch: fetchUndici } = require('undici');
        expect(resolveFetch(undefined, {})).to.equal(fetchUndici);
    });

    it('should resolve to globalThis.fetch if it exists and cache it', function () {
        // const [major] = process.versions.node.split('.').map(Number);
        // if (major >= 18) {

        const globalObj = { fetch: true };
        const resolvedFetch = resolveFetch(undefined, globalObj);
        expect(resolvedFetch).to.equal(globalObj.fetch, 'resolved to globalThis.fetch');
        const secondCallResult = resolveFetch(undefined, {});
        expect(secondCallResult).to.equal(globalObj.fetch, 'second call returns cached value');
    });
});

function createFakeResponse({
    ok = true,
    status = 200,
    text = '',
    statusText = '',
    contentType = 'application/json',
} = {}) {
    return {
        ok,
        status,
        statusText,
        text: async () => text,
        headers: {
            get: (header) => {
                if (header.toLowerCase() === 'content-type') {
                    return contentType;
                }
                return undefined;
            },
        },
    };
}

describe('connectionUtils.classifyError', function () {
    it('classifies null error as unknown', function () {
        expect(classifyError(null)).to.deep.equal({ type: ERROR_TYPES.UNKNOWN });
    });

    it('classifies unaugmented transport error as transport', function () {
        expect(classifyError({ type: ERROR_TYPES.TRANSPORT })).to.deep.equal({ type: ERROR_TYPES.TRANSPORT });
    });

    it('classifies unaugmented http error as http', function () {
        expect(classifyError({ type: ERROR_TYPES.HTTP })).to.deep.equal({ type: ERROR_TYPES.HTTP });
    });

    it('leaves an error without type intact', function () {
        expect(classifyError({ bogus: 'test' })).to.deep.equal({ bogus: 'test' });
    });
});

describe('connectionUtils.httpRequest', function () {
    // Import the httpRequest function from connectionUtils.js, using proxyquire to stub out node-fetch
    // This allows us to control the behavior of fetch without making actual HTTP requests.

    let fetchStub;

    beforeEach(() => {
        fetchStub = sinon.stub();
        setFetch(fetchStub);
    });

    const successTestCases = [
        {
            testId: 'valid JSON data',
            fetchResponse: { text: JSON.stringify({ foo: 'bar' }) },
            data: { foo: 'bar' },
        },
        {
            testId: 'empty responses',
            fetchResponse: { text: '' },
            data: null,
        },
        {
            testId: 'text/plain content type',
            fetchResponse: { text: 'Hello, World!', contentType: 'text/plain' },
            data: 'Hello, World!',
        },
    ];

    for (const { testId, fetchResponse, data } of successTestCases) {
        it(`should handle valid ${testId} as expected`, async function () {
            fetchStub.resolves(createFakeResponse(fetchResponse));
            const result = await httpRequest('http://test', {}, {});

            if (data === null) {
                expect(result.data).to.be.null;
            } else {
                expect(result.data).to.deep.equal(data);
            }
        });
    }

    it('should convert objects to json and set content type', async function () {
        fetchStub.resolves(createFakeResponse({ text: '' }));
        await httpRequest('http://test', {}, { body: { payload: 1 } });
        expect(fetchStub.calledOnce, 'Fetch called once').to.be.true;
        const options = fetchStub.firstCall.args[1];
        expect(options.body).to.equal('{"payload":1}', 'payload stringified');
        expect(options.headers['Content-Type']).to.equal('application/json', 'content type set');
        expect(options.dispatcher, 'dispatcher undefined').to.be.undefined;
    });

    it('should allow self signed cert if config is set', async function () {
        fetchStub.resolves(createFakeResponse({ text: '' }));
        await httpRequest('https://test', { isHttps: true, allowSelfSigned: true }, {});
        expect(fetchStub.calledOnce, 'Fetch called once').to.be.true;
        const options = fetchStub.firstCall.args[1];
        expect(options.dispatcher, 'dispatcher defined').to.not.be.undefined;
    });

    const errorTestCases = [
        {
            testId: '503 - retry',
            fetchResponse: { status: 503 },
            retry: true,
            status: 503,
        },
        {
            testId: '403 - no retry',
            fetchResponse: {
                status: 403,
                statusText: 'Forbidden',
                text: '{"error":{"message":"Access denied","http-code":403}}',
            },
            retry: false,
            status: 403,
            message: 'Access denied',
        },
        {
            testId: '404 - no retry',
            fetchResponse: {
                status: 404,
                statusText: 'Not Found',
                text: '{"error":{"message":"Item q does not exist!","http-code":404}}',
            },
            retry: false,
            status: 404,
            message: 'Item q does not exist!',
        },
        {
            testId: '401 without credentials - authRequired',
            fetchResponse: {
                status: 401,
                statusText: 'Unauthorized',
                text: '{"error":{"message":"Authentication required","http-code":401}}',
            },
            status: 401,
            message: 'Authentication required',
        },
        {
            testId: 'No status, statusText',
            fetchResponse: { status: null, statusText: 'Internal Server Error' },
            message: 'Internal Server Error',
        },
        {
            testId: 'No status, no statusText',
            fetchResponse: { status: null, statusText: null },
            message: 'HTTP Error 500',
        },
        {
            testId: 'XML',
            fetchResponse: {
                status: 400,
                headers: new Headers({ 'content-type': 'application/xml' }),
                text: '<xml>error</xml>',
            },
            message: '<xml>error</xml>',
        },
    ];

    for (const { testId, config, fetchResponse, authRequired, authFailed, retry, status, message } of errorTestCases) {
        it(`should report an error for ${testId} as expected`, async function () {
            fetchStub.resolves(createFakeResponse(fetchResponse));
            let conf = config ?? {};
            conf.url = 'http://mocked';
            conf = setDefaults(conf);
            const result = await httpRequest('http://test', conf, {});
            expect(result.ok, 'Result not ok').to.be.false;
            if (retry !== undefined) expect(!!result.retry, 'retry test').to.equal(retry);
            if (authRequired !== undefined)
                expect(!!result.authRequired, `authRequired test for ${testId}`).to.equal(authRequired);
            if (authFailed !== undefined)
                expect(!!result.authFailed, `autFailed test for ${testId}`).to.equal(authFailed);
            if (status !== undefined) expect(result.status, `status test for ${testId}`).to.equal(status);
            if (message !== undefined) expect(result.message, `message test for ${testId}`).to.equal(message);
        });
    }

    describe('connectionUtils.httpRequest error handling', function () {
        const cases = [
            {
                name: 'should report retryable error on network failure',
                code: 'ECONNREFUSED',
                expected: { ok: false, retry: true, type: ERROR_TYPES.NETWORK },
            },
            {
                name: 'should report unknown error as transport',
                code: 'BOGUS',
                expected: { ok: false, type: ERROR_TYPES.TRANSPORT },
            },
            {
                name: 'should report error on tls failure',
                code: 'ERR_TLS_CERT_EXPIRED',
                expected: { ok: false, type: ERROR_TYPES.TLS },
            },
            {
                name: 'should have inner name as code if code was undefined',
                code: undefined,
                expected: { ok: false, type: ERROR_TYPES.TRANSPORT, code: 'Error' },
            },
        ];

        cases.forEach(({ name, code, expected }) => {
            it(name, async function () {
                const cause = new Error('error details');
                cause.code = code;
                const err = new TypeError('fetch failed', { cause });

                fetchStub.rejects(err);

                const result = await httpRequest('http://test', {}, {});
                const expectedResult = { name: 'TypeError', message: 'error details', ...expected };
                expect(result).to.deep.include(expectedResult, name);
            });
        });
    });
});

describe('connectionUtils.setDefaultsTest', function () {
    const { setDefaults } = require('../lib/connectionUtils');

    it('should provide all defaults', function () {
        const config = { url: 'http://localhost' };
        setDefaults(config);
        expect(config.url).to.equal('http://localhost', 'url OK');
        expect(config.token).to.equal('', 'token empty');
        expect(config.username).to.equal('', 'username empty');
        expect(config.password).to.equal('', 'password empty');
        expect(config.retryTimeout).to.equal(Infinity, 'retryTimeout infinite');
        expect(config.authMethod).to.equal('', 'authMethod None');
    });

    it('should default https to 8443 and trim values correctly', function () {
        const config = {
            url: '   https://server:8443/   ',
            token: '  ',
            username: '    abc',
            password: '  def  ',
            retryTimeout: ' 10000 ',
        };
        setDefaults(config);
        expect(config.url).to.equal('https://server:8443', 'url trimmed and slash removed');
        expect(config.token).to.equal('', 'token empty');
        expect(config.username).to.equal('abc', 'username trimmed');
        expect(config.password).to.equal('  def  ', 'password preserves leading/trailing spaces');
        expect(config.retryTimeout).to.equal(10000, 'retryTimeout trimmed and converted to a number');
        expect(config.authMethod).to.equal('Basic', 'authMethod Basic');
    });

    it('should return authMethod Bearer if token is provided, even if username is also provided', function () {
        const config = {
            url: 'https://server',
            token: '    mytoken   ',
            username: '    abc   ',
        };
        setDefaults(config);
        expect(config.authMethod).to.equal('Bearer', 'authMethod Bearer');
    });
});

describe('createEventSourceDependencies', () => {
    let fetchStub;
    const input = 'http://example.com';
    const init = { headers: { 'X-Test': '1' } };

    beforeEach(() => {
        fetchStub = sinon.stub();
        fetchStub.resolves({ ok: true, status: 200, text: async () => 'ok' });
        setFetch(fetchStub);
    });

    it('calls fetch with augmented headers for bearer auth and does not set dispatcher', async () => {
        const config = { token: 'abc123', isHttps: false, allowSelfSigned: false, authMethod: 'Bearer' };
        const options = createEventSourceDependencies(config);

        await options.fetch(input, init);

        expect(fetchStub.calledOnce, 'fetchStub called').to.be.true;
        const fetchArgs = fetchStub.firstCall.args;
        expect(fetchArgs[0]).to.equal(input, 'input passed on to fetch');
        expect(fetchArgs[1].headers).to.deep.include(init.headers, 'Headers included in fetch call');
        expect(fetchArgs[1].headers).to.include({ Authorization: 'Bearer abc123' }, 'Authorization header added');
        expect(fetchArgs[1].dispatcher, 'dispatcher does not exist').to.be.undefined;
    });

    it('calls fetch with augmented headers for basic auth', async () => {
        const config = { username: 'joe', isHttps: false, authMethod: 'Basic' };
        const options = createEventSourceDependencies(config);

        await options.fetch(input, init);
        expect(fetchStub.calledOnce, 'fetchStub called').to.be.true;
        const fetchArgs = fetchStub.firstCall.args;
        expect(fetchArgs[1].headers).to.include(
            { Authorization: 'Basic am9lOnVuZGVmaW5lZA==' },
            'Authorization header added'
        );
    });

    it('sets custom dispatcher when self signed is allowed', async () => {
        const config = { isHttps: true, allowSelfSigned: true };
        const options = createEventSourceDependencies(config);
        await options.fetch(input, init);

        const fetchArgs = fetchStub.firstCall.args;
        expect(fetchArgs[1].dispatcher, 'dispatcher exists').to.not.be.undefined;
    });

    it('does not set dispatcher when not needed', async () => {
        const config = { isHttps: true, allowSelfSigned: false };
        const options = createEventSourceDependencies(config);
        await options.fetch(input, init);

        const fetchArgs = fetchStub.firstCall.args;
        expect(fetchArgs[1].dispatcher, 'dispatcher does not exist').to.be.undefined;
    });
});
