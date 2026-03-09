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

const { ERROR_TYPE } = require('./constants');

class FetchEventSource {
    constructor(url, dependencies = {}) {
        this.url = url;
        this.dependencies = {
            onOpen: () => {},
            onError: () => {},
            onMessage: () => {},
            ...dependencies,
        };
        this._running = false;
        this._abortController = null;
    }

    close() {
        this._running = false;
        this._abortController?.abort();
    }

    async start() {
        this._running = true;
        if (!this.dependencies.fetch) {
            await this._handleError({
                type: ERROR_TYPE.SYSTEM,
                message: 'Missing fetch implementation in FetchEventSource',
            });
            return;
        }

        this._abortController = new AbortController();
        this._initialized = false;

        while (this._running) {
            try {
                console.log('Calling fetch');
                const res = await this.dependencies.fetch(this.url, {
                    signal: this._abortController.signal,
                });

                if (res.ok) {
                    // only send onOpen when we know the connection works
                    if (!this._initialized) {
                        await this._safeInvoke('onOpen', this.dependencies.onOpen);
                        this._initialized = true;
                    }
                    await this._handleContent(res);
                } else {
                    await this._handleError({ type: ERROR_TYPE.HTTP, ...res });
                }
            } catch (error) {
                await this._handleError({ type: ERROR_TYPE.TRANSPORT, error });
            }
        }
    }

    // --- Private methods ---

    async _handleContent(res) {
        const reader = res.body.getReader();
        let buffer = '';

        while (this._running) {
            const { done, value } = await reader.read();
            if (done) {
                // no more data in this batch, but connection is still there.
                return;
            }
            buffer += new TextDecoder().decode(value, { stream: true });

            let lines = buffer.split('\n');
            buffer = lines.pop();

            await this._sendMessages(lines);
        }
    }

    async _handleError(error) {
        // ignore errors happening after stopping (e.g. AbortErrors)
        if (!this._running) return;
        await this._safeInvoke('onError', this.dependencies.onError, [error]);
        this.close();
    }

    async _safeInvoke(name, fn, args = []) {
        try {
            await fn?.(...args);
        } catch (err) {
            console.error(`${name} failed`, {
                error: err,
                args,
            });
        }
    }

    async _sendMessages(lines) {
        for (const line of lines) {
            if (line.startsWith('data:')) {
                const payload = line.slice(5).trim();
                await this._safeInvoke('onMessage', this.dependencies.onMessage, [{ data: payload }]);
            }
        }
    }
}

module.exports = { FetchEventSource };
