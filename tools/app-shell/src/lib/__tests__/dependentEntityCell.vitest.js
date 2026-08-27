import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { asDependentEntityInput } from '../dependentEntityCell.js';

const CATEGORIES = [
  { id: 'CAT-ELEC', searchKey: 'ELEC', name: 'Electrónica' },
  { id: 'CAT-FOOD', searchKey: 'FOOD', name: 'Alimentos' },
];

describe('asDependentEntityInput', () => {
  it('sends a cell that matches an existing code down the code path', () => {
    assert.deepEqual(asDependentEntityInput('ELEC', CATEGORIES), { code: 'ELEC' });
  });

  it('sends anything else down the name path, so an auto-create still derives its code', () => {
    // `fallbackValue` collapses into `name` inside the resolver, which is what makes
    // "Distribución Especial" auto-create as DISTRIBUCION_ESPECIAL rather than as the
    // raw display text.
    assert.deepEqual(asDependentEntityInput('Distribución Especial', CATEGORIES), { fallbackValue: 'Distribución Especial' });
    assert.deepEqual(asDependentEntityInput('Electrónica', CATEGORIES), { fallbackValue: 'Electrónica' });
  });

  it('trims the cell before deciding and before handing it on', () => {
    assert.deepEqual(asDependentEntityInput('  ELEC  ', CATEGORIES), { code: 'ELEC' });
  });

  it('matches codes exposed as `value` or `code` instead of `searchKey`', () => {
    assert.deepEqual(asDependentEntityInput('BPG', [{ id: 'x', value: 'BPG' }]), { code: 'BPG' });
    assert.deepEqual(asDependentEntityInput('BPG', [{ id: 'x', code: 'BPG' }]), { code: 'BPG' });
  });

  it('treats an empty record list (or a blank cell) as a name, never as a code', () => {
    assert.deepEqual(asDependentEntityInput('ELEC', []), { fallbackValue: 'ELEC' });
    assert.deepEqual(asDependentEntityInput('', CATEGORIES), { fallbackValue: '' });
  });

  it('is case-sensitive on codes, mirroring the resolver it feeds', () => {
    // The resolver's own code match is `===` on the trimmed searchKey, so a lowercase
    // cell must NOT be claimed as a code here — it goes to the name path and the
    // resolver's key-conflict guard reports the mismatch with a useful message.
    assert.deepEqual(asDependentEntityInput('elec', CATEGORIES), { fallbackValue: 'elec' });
  });
});
