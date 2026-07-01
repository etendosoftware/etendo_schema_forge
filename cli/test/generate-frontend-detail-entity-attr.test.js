import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildDetailEntityAttr } from '../src/generate-frontend.js';

describe('buildDetailEntityAttr', () => {
  it('returns the detailEntity JSX attribute with leading newline and 8-space indentation for a given name', () => {
    assert.equal(buildDetailEntityAttr('OrderLine'), '\n        detailEntity="OrderLine"');
  });

  it('returns an empty string for undefined', () => {
    assert.equal(buildDetailEntityAttr(undefined), '');
  });

  it('returns an empty string for an empty string', () => {
    assert.equal(buildDetailEntityAttr(''), '');
  });

  it('returns an empty string for null', () => {
    assert.equal(buildDetailEntityAttr(null), '');
  });
});
