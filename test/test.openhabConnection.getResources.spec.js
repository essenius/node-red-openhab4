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

/*
beforeEach(function () {
    httpStub = sinon.stub();

    connection = createOpenhabConnection(
                {
            url: "http://localhost:8080",
            token: "",
            username: "",
            password: "",
            isHttps: false
        },
        {
            //eventSourceImpl: MockEventSource,
            //setTimeoutImpl: fakeSetTimeout,
            //clearTimeoutImpl: fakeClearTimeout,
            now: () => 1000,
            httpRequest: httpStub
        }
    );

    connection.CACHE_TTL = 500;

});
*/


const { expect } = require("chai");
const sinon = require("sinon");

const { OpenhabConnection } = require("../lib/openhabConnection");

describe("OpenhabConnection.getResources", function () {

    let nowStub, httpStub, connection;

    beforeEach(function () {
        nowStub = sinon.stub();
        httpStub = sinon.stub();
        connection = new OpenhabConnection({}, {
            url: "http://example.com/",
            httpRequest: httpStub,
            now: nowStub
        });
        // reset cache
        connection.cache = {
            items: { data: null, timestamp: 0 },
            things: { data: null, timestamp: 0 }
        };

        connection.CACHE_TTL = 500;

    });

    it("returns 404 for unknown type", async function () {
        const result = await connection.getResources("unknownType", "endpoint");
        expect(result.ok).to.be.false;
        expect(result.status).to.equal(404);
        expect(result.message).to.match(/unknownType/);
    });

    it("fetches and caches resources when cache empty", async function () {
        nowStub.returns(1000);
        const fetchData = { ok: true, data: [{ name: "item1" }] };
        httpStub.resolves(fetchData);

        const result = await connection.getResources("items", "endpoint");

        expect(result.ok).to.be.true;
        expect(result.data).to.deep.equal(fetchData.data);
        expect(connection.cache.items.data).to.deep.equal(fetchData.data);
        expect(connection.cache.items.timestamp).to.equal(1000);
        expect(httpStub.calledOnce).to.be.true;
    });

    it("returns cached data if within TTL", async function () {
        const cachedData = [{ name: "cachedItem" }];
        connection.cache.items = { data: cachedData, timestamp: 1000 };
        nowStub.returns(1000 + connection.CACHE_TTL - 1);

        const result = await connection.getResources("items", "endpoint");

        expect(result.ok).to.be.true;
        expect(result.data).to.equal(cachedData);
        expect(httpStub.notCalled).to.be.true;
    });

    it("refreshes cache if TTL expired", async function () {
        connection.cache.items = { data: [{ name: "old" }], timestamp: 1000 };
        nowStub.returns(1000 + connection.CACHE_TTL + 1);
        const newData = { ok: true, data: [{ name: "newItem" }] };
        httpStub.resolves(newData);

        const result = await connection.getResources("items", "endpoint");

        expect(result.data).to.deep.equal(newData.data);
        expect(connection.cache.items.data).to.deep.equal(newData.data);
        expect(connection.cache.items.timestamp).to.equal(1000 + connection.CACHE_TTL + 1);
    });

    it("returns cached data on httpRequest failure", async function () {
        connection.cache.items = { data: [{ name: "cached" }], timestamp: 1000 };
        nowStub.returns(2000);
        const failResponse = { ok: false, status: 500 };
        httpStub.resolves(failResponse);

        const result = await connection.getResources("items", "endpoint");

        expect(result.ok).to.be.false;
        expect(result.data).to.deep.equal([{ name: "cached" }]);
    });

    it("returns failed status with no cached data", async function () {
        connection.cache.items = { data: null, timestamp: 1000 };
        nowStub.returns(2000);
        const failResponse = { ok: false };
        httpStub.resolves(failResponse);

        const result = await connection.getResources("items", "endpoint");

        expect(result.ok).to.be.false;
        expect(result.status).to.equal(503);
        expect(result.data).to.be.undefined;
    });
});