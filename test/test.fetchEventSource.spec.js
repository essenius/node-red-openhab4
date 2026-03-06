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

const { createEventSourceDependencies, setFetch } = require('../lib/connectionUtils');
const { FetchEventSource } = require('../lib/fetchEventSource');

function createMockResponse(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);

    return {
        ok: true,
        body: new ReadableStream({
            start(controller) {
                controller.enqueue(data);
                controller.close();
            },
        }),
    };
}

describe('eventsource happy path works', function () {
    let callCount = 0;
    let eventSource;

    function onMessage(event) {
        const message = JSON.parse(event.data);
        callCount++;
        console.log(`Spec parsed event #${callCount}`, message);
        if (callCount == 2) eventSource.close();
    }

    it('starts the event source', async function () {
        const config = {};
        const fetchStub = sinon.stub();
        fetchStub.onFirstCall().resolves(
            createMockResponse(
                `event: alive
data: {"type":"ALIVE","interval":10}

`
            )
        );

        fetchStub.onSecondCall().resolves(
            createMockResponse(
                `event: message
data: {"topic":"openhab/items/hue_ms_office_motion/state","payload":"{\\"type\\":\\"OnOff\\",\\"value\\":\\"OFF\\"}","type":"ItemStateEvent"}

`
            )
        );
        setFetch(fetchStub);
        const dependencies = {
            ...createEventSourceDependencies(config),
            onOpen: async () => {
                console.log('Spec onOpen');
            },
            onMessage: async (event) => onMessage(event),
            onError: async (error) => console.log('Spec error', error),
        };
        console.log('Spec EventSource options:', dependencies);
        const url = 'https://localhost:8443/rest/events';

        eventSource = new FetchEventSource(url, dependencies);
        await eventSource.start();
        expect(callCount).to.equal(2);
    });

    it('fails if fetch does not exist', async function () {
        const onErrorSpy = sinon.spy();
        eventSource = new FetchEventSource('http://localhost:8080', { onError: onErrorSpy });

        await eventSource.start();
        expect(onErrorSpy.calledOnce, 'error handler called').to.be.true;
        expect(onErrorSpy.args[0][0], 'payload right').to.deep.equal({
            type: 'system',
            message: 'Missing fetch implementation in FetchEventSource',
        });
    });

    it('fails if authentication fails (HTTP error)', async function () {
        const fetchStub = sinon.stub().resolves({
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
        });

        const onErrorSpy = sinon.spy();
        eventSource = new FetchEventSource('http://localhost:8080', { fetch: fetchStub, onError: onErrorSpy });

        await eventSource.start();
        expect(onErrorSpy.calledOnce, 'error handler called').to.be.true;
        expect(onErrorSpy.args[0][0], 'payload right').to.deep.equal({
            ok: false,
            type: 'http',
            statusText: 'Unauthorized',
            status: 401,
        });
    });

    it('fails if fetch fails', async function () {
        const fetchStub = sinon.stub().rejects(new Error('network failure', { cause: { code: 'ENOTFOUND' } }));
        const onErrorSpy = sinon.spy();
        eventSource = new FetchEventSource('http://localhost:8080', { fetch: fetchStub, onError: onErrorSpy });

        await eventSource.start();
        expect(onErrorSpy.calledOnce, 'error handler called').to.be.true;
        const error = onErrorSpy.args[0][0].error;
        expect(error.name).to.equal('Error');
        expect(error.cause.code).to.equal('ENOTFOUND');
        expect(error.message).to.equal('network failure');
    });

    it('warns in the console if _safeInvoke throws', async function () {
        const onMessageStub = sinon.stub().rejects(new Error('failing call'));
        const consoleSpy = sinon.spy(console, 'error'); // or log/warn

        eventSource = new FetchEventSource('http://localhost:8080', { onMessage: onMessageStub });
        await eventSource._sendMessages(['data: test']);
        expect(consoleSpy.calledOnce, 'console.error called once').to.be.true;
        expect(consoleSpy.args[0][0]).to.equal('onMessage failed');
        consoleSpy.restore();
    });

    it('does not call onError if an error happens while not running', async function () {
        const onErrorSpy = sinon.spy();
        eventSource = new FetchEventSource('http://localhost:8080', { onError: onErrorSpy });

        await eventSource._handleError(new Error('test'));
        expect(onErrorSpy.notCalled).to.be.true;
    });
});
