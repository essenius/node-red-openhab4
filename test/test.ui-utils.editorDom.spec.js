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

const { expect } = require('chai');
const sinon = require('sinon');
const { JSDOM } = require('jsdom');

const { EditorDom, getInputField } = require('../static/ui-utils');

describe('ui-utils EditorDom', () => {
    const cases = [
        {
            method: 'controllerInput',
            selector: 'controller',
        },
        {
            method: 'conceptInput',
            selector: 'concept',
        },
        {
            method: 'identifierInput',
            selector: 'identifier',
        },
        {
            method: 'filterInput',
            selector: 'list-filter',
        },
    ];

    cases.forEach(({ method, selector }) => {
        it(`${method} delegates to getInputField with ${selector}`, () => {
            const getInputField = sinon.stub();
            const fakeElement = { id: `node-input-${selector}` };

            getInputField.withArgs(selector).returns(fakeElement);

            const dom = new EditorDom(getInputField);

            const result = dom[method]();

            expect(getInputField.calledOnceWithExactly(selector)).to.be.true;
            expect(result).to.equal(fakeElement);
        });
    });
});

describe('ui-utils EditorDom with real getInputField', () => {
    let dom;
    let editorDom;

    beforeEach(() => {
        dom = new JSDOM(`
            <input id="node-input-controller" />
            <input id="node-input-concept" />
            <input id="node-input-identifier" />
            <input id="node-input-list-filter" />
        `);

        globalThis.document = dom.window.document;
        globalThis.window = dom.window;

        editorDom = new EditorDom(getInputField);
    });

    afterEach(() => {
        delete global.document;
        delete global.window;
    });

    const cases = [
        { method: 'controllerInput', id: 'node-input-controller' },
        { method: 'conceptInput', id: 'node-input-concept' },
        { method: 'identifierInput', id: 'node-input-identifier' },
        { method: 'filterInput', id: 'node-input-list-filter' },
    ];

    cases.forEach(({ method, id }) => {
        it(`${method} returns correct DOM element`, () => {
            const el = editorDom[method]();
            expect(el).to.not.be.null;
            expect(el.id).to.equal(id);
        });
    });
});
