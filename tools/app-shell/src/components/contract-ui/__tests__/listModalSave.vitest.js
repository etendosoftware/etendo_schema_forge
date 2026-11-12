// @covers tools/app-shell/src/components/contract-ui/listModalSave.js
//
// The list-modal save gate. Defect found live on payment-term (compact popup): a client-side
// numeric violation (a decimal in an `integer` field) showed its blur toast but the save was
// still sent — the modal had no client gate.
import { describe, it, expect } from 'vitest';
import { firstFieldViolation } from '../listModalSave.js';

// Marks every translated key, so "translated" is distinguishable from "echoed back".
const ui = (key, params) => `T:${key}${params ? JSON.stringify(params) : ''}`;

describe('firstFieldViolation', () => {
  const fields = [
    { key: 'name', type: 'text' },
    { key: 'days', type: 'number', min: 0, max: 365, integer: true },
  ];

  it('reports a decimal in an integer field', () => {
    expect(firstFieldViolation(fields, { name: 'x', days: '10.5' }, ui)).toEqual({
      key: 'days', message: 'T:fieldIntegerError{}',
    });
  });

  it('reports a value below min', () => {
    expect(firstFieldViolation(fields, { days: '-1' }, ui)?.key).toBe('days');
  });

  it('returns null when every field is valid or empty', () => {
    expect(firstFieldViolation(fields, { name: 'x', days: '10' }, ui)).toBeNull();
    expect(firstFieldViolation(fields, { name: 'x', days: '' }, ui)).toBeNull();
  });
});
