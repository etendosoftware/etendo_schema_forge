import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { newEtendoId } from '../src/lib/etendo-uuid.js';

describe('etendo-uuid', () => {
  describe('newEtendoId', () => {
    it('returns a 32-character string', () => {
      const id = newEtendoId();
      assert.equal(id.length, 32);
    });

    it('returns only uppercase hex characters', () => {
      const id = newEtendoId();
      assert.match(id, /^[0-9A-F]{32}$/);
    });

    it('contains no dashes', () => {
      const id = newEtendoId();
      assert.ok(!id.includes('-'), 'must not contain dashes');
    });

    it('generates unique IDs on each call', () => {
      const ids = new Set(Array.from({ length: 100 }, () => newEtendoId()));
      assert.equal(ids.size, 100, 'all 100 generated IDs must be unique');
    });

    it('is always uppercase', () => {
      const id = newEtendoId();
      assert.equal(id, id.toUpperCase());
    });
  });
});
