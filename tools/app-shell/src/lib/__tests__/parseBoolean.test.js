import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseBoolean } from '../parseBoolean.js';

describe('parseBoolean', () => {
  it('passes real booleans through unchanged', () => {
    assert.equal(parseBoolean(true), true);
    assert.equal(parseBoolean(false), false);
  });

  it('treats 1 as true and 0 as false', () => {
    assert.equal(parseBoolean(1), true);
    assert.equal(parseBoolean(0), false);
  });

  it('returns null for other numbers', () => {
    assert.equal(parseBoolean(2), null);
    assert.equal(parseBoolean(-1), null);
  });

  it('recognizes truthy string forms, case-insensitively', () => {
    for (const value of ['true', 'True', 'TRUE', 'y', 'Y', 'yes', 'YES', '1']) {
      assert.equal(parseBoolean(value), true, `expected "${value}" to parse as true`);
    }
  });

  it('recognizes falsy string forms, case-insensitively', () => {
    for (const value of ['false', 'False', 'FALSE', 'n', 'N', 'no', 'NO', '0']) {
      assert.equal(parseBoolean(value), false, `expected "${value}" to parse as false`);
    }
  });

  it('trims surrounding whitespace before matching', () => {
    assert.equal(parseBoolean('  true  '), true);
    assert.equal(parseBoolean('\tno\n'), false);
  });

  it('returns null for unrecognized or invalid input', () => {
    assert.equal(parseBoolean('maybe'), null);
    assert.equal(parseBoolean(''), null);
    assert.equal(parseBoolean(null), null);
    assert.equal(parseBoolean(undefined), null);
    assert.equal(parseBoolean({}), null);
    assert.equal(parseBoolean([]), null);
  });
});
