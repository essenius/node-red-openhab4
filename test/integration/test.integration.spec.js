'use strict';

const { OpenhabConnection } = require('../../lib/openhabConnection');

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Quick smoke test. Should start the (real) event server for 5 seconds and then shut down,
// showing incoming events in the meantime.

describe('integration test', async function () {
    this.timeout(10000); // 10 seconds for all tests in this suite
    const connection = new OpenhabConnection(
        { url: 'https://server:8443', isHttps: true, allowSelfSigned: true },
        {
            onMessage: (message) => console.log('onMessage', message),
            onError: (error) => console.log('onError', error),
            onStateChange: (state) => console.log('onStateChange:', state),
        }
    );

    connection.startEventSource();

    await sleep(5000);
    connection.close();
});
