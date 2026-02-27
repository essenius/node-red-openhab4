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

describe('eventBus single tag subscribe', function () {
    const { EventBus } = require('../lib/eventBus');

    const exactMatchCallback1 = sinon.spy();
    const exactMatchCallback2 = sinon.spy();
    const regexCallback1 = sinon.spy();
    const regexCallback2 = sinon.spy();
    const regexCallback3 = sinon.spy();

    let eventBus;

    beforeEach(function () {
        eventBus = new EventBus();
        eventBus.subscribe('items/testItem1', exactMatchCallback1);
        eventBus.subscribe('items/testItem2', exactMatchCallback2);
        eventBus.subscribe('items/anotherTestItem', exactMatchCallback1);
        eventBus.subscribe('items/test*', regexCallback1);
        eventBus.subscribe('*', regexCallback2);
        eventBus.subscribe('things/*', regexCallback3);
        exactMatchCallback1.resetHistory();
        exactMatchCallback2.resetHistory();
        regexCallback1.resetHistory();
        regexCallback2.resetHistory();
        regexCallback3.resetHistory();
    });

    it('should successfully notify nodes of testItem1', function () {
        eventBus.publish('items/testItem1', 'Payload1');
        expect(exactMatchCallback1.calledWith('Payload1'), 'exact node 1 notified').to.be.true;
        expect(exactMatchCallback2.notCalled, 'exact node 2 not notified').to.be.true;
        expect(regexCallback1.calledWith('Payload1'), 'regex node 1 notified').to.be.true;
        expect(regexCallback2.calledWith('Payload1'), 'regex node 2 notified').to.be.true;
        expect(regexCallback3.notCalled, 'regex node 3 not notified').to.be.true;
    });

    it('should successfully notify nodes of testItem2', function () {
        eventBus.publish('items/testItem2', 'Payload2');
        expect(exactMatchCallback1.notCalled, 'exact node 1 not notified').to.be.true;
        expect(exactMatchCallback2.calledWith('Payload2'), 'exact node 2 notified').to.be.true;
        expect(regexCallback1.calledWith('Payload2'), 'regex node 1 notified').to.be.true;
        expect(regexCallback2.calledWith('Payload2'), 'regex node 2 notified').to.be.true;
        expect(regexCallback3.notCalled, 'regex node 3 not notified').to.be.true;
    });

    it('should successfully notify nodes of anotherTestItem', function () {
        eventBus.publish('items/anotherTestItem', 'Payload3');
        expect(exactMatchCallback1.calledWith('Payload3'), 'exact node 1 notified').to.be.true;
        expect(exactMatchCallback2.notCalled, 'exact node 2 not notified').to.be.true;
        expect(regexCallback1.notCalled, 'regex node 1 not notified').to.be.true;
        expect(regexCallback2.calledWith('Payload3'), 'regex node 2 notified').to.be.true;
        expect(regexCallback3.notCalled, 'regex node 3 not notified').to.be.true;
    });

    it('should not allow multiple subscriptions to the same tag with the same callback', function () {
        eventBus.subscribe('items/testItem1', exactMatchCallback1);
        eventBus.publish('items/testItem1', 'Payload4');
        expect(exactMatchCallback1.callCount).to.equal(1, 'exact node 1 notified once');
        expect(exactMatchCallback1.calledWith('Payload4'), 'exact node 1 notified').to.be.true;
        eventBus.unsubscribe('items/testItem1', exactMatchCallback1);
        exactMatchCallback1.resetHistory();
        eventBus.publish('items/testItem1', 'Payload5');
        expect(exactMatchCallback1.notCalled, 'exact node 1 not notified as unsubscribed').to.be.true;
        expect(regexCallback1.calledWith('Payload5'), 'regex node 1 notified').to.be.true;
    });

    function testMultipleSubscriptions(eventBus, { pattern, baseCallback, payload, label }) {
        const extraCallback = sinon.spy();

        eventBus.subscribe(pattern, extraCallback);
        eventBus.publish('items/testItem1', payload);

        expect(baseCallback.calledWith(payload), `${label} base notified`).to.be.true;
        expect(extraCallback.calledWith(payload), `${label} extra notified`).to.be.true;

        baseCallback.resetHistory();
        extraCallback.resetHistory();

        eventBus.unsubscribe(pattern, baseCallback);
        eventBus.publish('items/testItem1', payload);

        expect(baseCallback.notCalled, `${label} base unsubscribed`).to.be.true;
        expect(extraCallback.calledWith(payload), `${label} extra still notified`).to.be.true;

        extraCallback.resetHistory();

        eventBus.unsubscribe(pattern, extraCallback);
        eventBus.publish('items/testItem1', payload);

        expect(baseCallback.notCalled, `${label} base not called after final unsubscribe`).to.be.true;
        expect(extraCallback.notCalled, `${label} extra not called after final unsubscribe`).to.be.true;
    }

    it('should allow multiple exact subscriptions to the same tag with a different callback', function () {
        testMultipleSubscriptions(eventBus, {
            pattern: 'items/testItem1',
            baseCallback: exactMatchCallback1,
            payload: 'Payload6',
            label: 'exact',
        });
    });

    it('should allow multiple regex subscriptions to the same tag with a different callback', function () {
        testMultipleSubscriptions(eventBus, {
            pattern: 'items/test*',
            baseCallback: regexCallback1,
            payload: 'Payload7',
            label: 'regex',
        });
    });

    it('should unsubscribe correctly', function () {
        eventBus.unsubscribe('*/bogus', regexCallback1);
        eventBus.publish('items/testQ', 'Payload7');
        expect(regexCallback1.callCount).to.equal(1, 'regex node 1 still notified after bogus unsubscribe');
        eventBus.unsubscribe('items/test*', regexCallback1);
        regexCallback1.resetHistory();
        eventBus.publish('items/testQ', 'Payload7');
        expect(regexCallback1.notCalled, 'regex node 1 not notified after unsubscribe').to.be.true;
    });
});
