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

const { setupDom, cleanupDom } = require('./helpers/dom-setup');
const { expect } = require('chai');

let DropdownFilterListener;
let select, filter, dropdown;

describe('ui-utils DropdownFilterListener', () => {
    beforeEach(() => {
        setupDom(`<!DOCTYPE html><html><body>
            <select id="dropdown"></select>
            <input id="filter" />
            </body></html>`);

        DropdownFilterListener = require('../static/ui-utils.js').DropdownFilterListener;

        select = document.getElementById('dropdown');
        filter = document.getElementById('filter');
        dropdown = new DropdownFilterListener(select, filter); // take default 'None'
    });

    afterEach(() => {
        dropdown.destroy();
        select.innerHTML = '';
        filter.value = '';
        cleanupDom();
    });

    it('should initialize with empty options', () => {
        expect(select.options.length).to.equal(0);
    });

    it('should set options correctly', () => {
        const options = ['Apple', 'Banana', 'Cherry'];
        dropdown.setOptions(options, '');

        expect(select.options.length).to.equal(4); // 3 + special option
        expect(select.value).to.equal('');
        expect(select.options[1].text).to.equal('Apple');
        expect(select.options[2].text).to.equal('Banana');
        expect(select.options[3].text).to.equal('Cherry');
    });

    it('should filter options correctly', () => {
        const options = ['Apple', 'Banana', 'Cherry'];
        dropdown.setOptions(options, '[None]');
        filter.value = 'a';
        filter.dispatchEvent(new document.defaultView.Event('input'));

        expect(select.options.length).to.equal(3); // 2 + special option
        expect(select.selectedIndex).to.equal(0);
        expect(select.options[1].text).to.equal('Apple');
        expect(select.options[2].text).to.equal('Banana');
    });

    it('should set a single disabled option', () => {
        dropdown.setSingleDisabledOption('No items available');
        expect(select.options.length).to.equal(1);
        expect(select.options[0].text).to.equal('No items available');
        expect(select.options[0].disabled).to.be.true;
    });
});
