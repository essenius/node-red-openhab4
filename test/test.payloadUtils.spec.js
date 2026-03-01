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
    isNonEmptyString,
    safeParseJSON,
    setWithDefault,
    trimSlashes,
    truncateMessage,
} = require('../lib/payloadUtils');

describe('PayloadUtils', function () {
    it('should correctly identify non-empty strings', function () {
        expect(isNonEmptyString(''), 'empty string').to.be.false;
        expect(isNonEmptyString(undefined), 'undefined').to.be.false;
        expect(isNonEmptyString(null), 'null').to.be.false;
        expect(isNonEmptyString(1), 'number').to.be.false;
        expect(isNonEmptyString([]), 'array').to.be.false;
        expect(isNonEmptyString({}), 'object').to.be.false;
        expect(isNonEmptyString('1'), 'string').to.be.true;
    });

    it('should successfully parse JSON', function () {
        expect(safeParseJSON(undefined), 'undefined input and no fallback').to.be.null;
        expect(safeParseJSON(undefined, {}), 'undefined input and fallback').to.deep.equal({});
        expect(safeParseJSON('{"test":1}'), 'correct json').to.deep.equal({ test: 1 });
    });

    it('should successfully set properties with defaults', function () {
        expect(setWithDefault(null, 'default'), 'null => default').to.equal('default');
        expect(setWithDefault(1, 42)).to.equal(1, 'number taken over as is');
        expect(setWithDefault('   1   ', 'default')).to.equal('1', 'string value trimmed');
        expect(setWithDefault('  1  ', 'default', { noTrim: true })).to.equal('  1  ', 'not trimmed with noTrim');
        expect(setWithDefault('    ', 'default'), { noTrim: false }).to.equal('default', 'just spaces => default');
        expect(setWithDefault('    ', 'default', { noTrim: true })).to.equal('    ', 'just spaces with noTrim');
        expect(setWithDefault('   a   ', 42)).to.equal(42, 'non-number => default if default is number');
    });

    it('should trim slashes accurately', function () {
        expect(trimSlashes('/value/with/slashes/')).to.equal('value/with/slashes');
        expect(trimSlashes('//')).to.equal('');
        expect(trimSlashes('value/with/slashes')).to.equal('value/with/slashes');
        expect(trimSlashes('/value/with/slashes')).to.equal('value/with/slashes');
        expect(trimSlashes('/value/with/slashes/')).to.equal('value/with/slashes');
    });

    it('should truncate messages accurately', function () {
        expect(truncateMessage('1234567890', 10)).to.equal('1234567890', 'just fits, not truncated');
        expect(truncateMessage('12345678901', 10)).to.equal('1234567...', 'too long, truncated');
        expect(truncateMessage('12345678901')).to.equal('12345678901', 'shorter than default length, not truncated');
        expect(truncateMessage('123', 1)).to.equal('...', 'safety net');
    });
});
