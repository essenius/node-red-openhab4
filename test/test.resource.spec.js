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
const {
    Resource,
    Item,
    Thing,
    createResource,
    createResourceFromTopic,
    createResourceFromMessage,
} = require('../lib/resource');
const { ACTION, CONCEPT, HTTP_METHOD } = require('../lib/constants');

describe('Resource createResource', function () {
    it('should return correct static URLs', function () {
        expect(Resource.streamUrl()).to.equal('/rest/events', 'stream URL without filter ok');
        expect(Resource.streamUrl('*/items/*')).to.equal(
            '/rest/events?topics=*%2Fitems%2F*',
            'stream URL with filter ok'
        );
        expect(Resource.adminUrl('items')).to.equal('/openhab4/items', 'adminUrl ok');
        expect(Resource.getAllUrl('things')).to.equal('/rest/things', 'getAllUrl ok');
    });

    it('should correctly identify valid events', function () {
        expect(Resource.isValidEvent({ type: 'a', payload: 'b', topic: 'c' }), 'valid').to.be.true;
        expect(Resource.isValidEvent({ type: 'a', payload: 'b' }), 'missing topic').to.be.false;
        expect(Resource.isValidEvent({ type: 'a', topic: 'c' }), 'missing payload').to.be.false;
        expect(Resource.isValidEvent({ topic: 'c' }), 'missing type and topic').to.be.false;
        expect(Resource.isValidEvent({}), 'missing everything').to.be.false;
    });

    it('should create item and return correct properties', function () {
        const item = createResource(' ITEMS', '  i  ', 'update');
        expect(item).to.be.instanceOf(Item, 'Item object generated');
        expect(item.concept).to.equal(CONCEPT.ITEMS, 'concept is items');
        expect(item.identifier).to.equal('i', 'item identifier is i');
        expect(item.event).to.equal('update', 'event is update');
        expect(item.topic()).to.equal('items/i', 'node red topic ok');
        expect(item.isValid(), 'valid item').to.be.true;
        expect(item.nullIfInvalid(), 'nullIfInvalid() returns itself').to.equal(item);
    });

    it('should deal with incomplete items', function () {
        const item = createResource(' ITEMS');
        expect(item).to.be.instanceOf(Item, 'Item object generated');
        expect(item.isValid(), 'invalid item').to.be.false;
        expect(item.nullIfInvalid(), 'nullIfInvalid() is null').to.be.null;
    });

    it('should create thing and return correct url properties', function () {
        const thing = createResource(CONCEPT.THINGS, ' t', 'status');
        expect(thing).to.be.instanceOf(Thing, 'Thing object generated');
        expect(thing.concept).to.equal(CONCEPT.THINGS);

        expect(thing._conceptUrl()).to.equal('/rest/things', 'conceptUrl ok');
        expect(thing._identifierUrl()).to.equal('/rest/things/t');
    });

    it('should create thing, return correct endpoints and report payload type String', function () {
        const thing = createResourceFromTopic('  openhab/things/q/changed  ');
        expect(thing).to.be.instanceOf(Thing, 'Thing object generated');
        expect(thing.event).to.equal('changed');

        expect(thing.endPoint(ACTION.GET), 'get ok').to.deep.equal({ url: '/rest/things/q', verb: HTTP_METHOD.GET });
        expect(thing.endPoint(ACTION.COMMAND), 'No command possible').to.be.undefined;
        expect(thing.endPoint(ACTION.UPDATE), 'No update possible').to.be.undefined;
        expect(thing.endPoint('bogus'), 'Unknown action not possible').to.be.undefined;
        thing.parseMessage({ payload: {} });
        expect(thing.payloadType).to.equal('String', 'Payload type is String');
        expect(thing.payload != null, 'missing payload').to.be.false;
    });

    it('should create an item and support commands/updates', function () {
        const item = createResourceFromTopic('items / t1');
        expect(item.event, 'event not defined').to.be.undefined;
        expect(item.endPoint(ACTION.GET), 'get ok').to.deep.equal({ url: '/rest/items/t1', verb: HTTP_METHOD.GET });
        expect(item.endPoint(ACTION.COMMAND), 'command ok').to.deep.equal({
            url: '/rest/items/t1',
            verb: HTTP_METHOD.POST,
        });
        expect(item.endPoint(ACTION.UPDATE), 'update ok').to.deep.equal({
            url: '/rest/items/t1/state',
            verb: HTTP_METHOD.PUT,
        });
    });

    it('should create system object and return the right properties', function () {
        const system = createResourceFromTopic('system/ ');
        expect(system.identifier, 'id not defined').to.be.undefined;
        expect(system.event, 'event not defined').to.be.undefined;
        expect(system.endPoint(ACTION.GET), 'get URL ok').to.deep.equal({ url: '/rest', verb: HTTP_METHOD.GET });
        expect(system.endPoint(ACTION.COMMAND), 'no command URL').to.be.undefined;
        system.parseMessage({ payload: {} });
        expect(system.payload).to.equal('2.x', 'default version ok');
        system.parseMessage({ payload: { runtimeInfo: { version: '4.1.0' } } });
        expect(system.payload).to.equal('4.1.0', 'reported version ok');
        expect(system.payloadType).to.equal('String', 'Payload type is String');
    });

    it('should create a fallback Resource object with unknown concept', function () {
        expect(createResourceFromTopic(undefined)).to.be.undefined;

        const resource = createResourceFromTopic('inbox/test1');
        expect(resource).to.be.instanceOf(Resource, 'Resource object generated');
        expect(resource.endPoint(ACTION.GET)).to.deep.equal(
            { url: '/rest/inbox/test1', verb: HTTP_METHOD.GET },
            'get endPoint ok'
        );
        expect(resource.endPoint(ACTION.UPDATE), 'no update URL').to.be.undefined;
        expect(resource.topic()).to.equal('inbox/test1', 'topic ok');
    });

    it('should create a proper response message', function () {
        const resource = createResourceFromMessage({
            topic: 'openhab/items/test1/updated',
            payload: { state: 'ok', type: 'String' },
        });
        const response = resource.responseMessage({ bogus: true });
        expect(response).to.deep.include({
            topic: 'items/test1',
            payload: 'ok',
            payloadType: 'String',
            event: 'updated',
            bogus: true,
        });
        expect(response).to.not.haveOwnProperty('eventType');
    });
});
