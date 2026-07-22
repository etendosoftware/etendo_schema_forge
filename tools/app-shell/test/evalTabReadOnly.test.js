import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evalTabReadOnly } from '../src/components/contract-ui/evalTabReadOnly.js';

describe('evalTabReadOnly', () => {
  it('returns false when the tab declares no readOnlyLogic', () => {
    assert.equal(evalTabReadOnly({}, { posted: true }), false);
  });

  it('returns false when readOnlyLogic itself throws', () => {
    const tab = { readOnlyLogic: () => { throw new Error('boom'); } };
    assert.equal(evalTabReadOnly(tab, {}), false);
  });

  it('evaluates a boolean-serialized Yes/No field as generated', () => {
    const tab = { readOnlyLogic: (record) => record.posted === true };
    assert.equal(evalTabReadOnly(tab, { posted: true }), true);
    assert.equal(evalTabReadOnly(tab, { posted: false }), false);
  });

  it('also evaluates true when NEO serializes the same field as the string "Y"', () => {
    // Reproduces the ETP-4029 bug: generated readOnlyLogic compiles `@Posted@='Y'`
    // to `record.posted === true`, but the invoice header GET returns the raw
    // string 'Y' for this column — without normalization the tab would stay
    // editable on a posted document.
    const tab = { readOnlyLogic: (record) => record.posted === true };
    assert.equal(evalTabReadOnly(tab, { posted: 'Y' }), true);
  });

  it('evaluates false for the string "N", matching the boolean false case', () => {
    const tab = { readOnlyLogic: (record) => record.posted === true };
    assert.equal(evalTabReadOnly(tab, { posted: 'N' }), false);
  });

  it('leaves non Yes/No values untouched', () => {
    const tab = { readOnlyLogic: (record) => record.documentStatus !== 'DR' };
    assert.equal(evalTabReadOnly(tab, { documentStatus: 'CO' }), true);
    assert.equal(evalTabReadOnly(tab, { documentStatus: 'DR' }), false);
  });

  it('handles the combined ETP-4029 exchangeRates condition (posted OR reversed)', () => {
    const tab = {
      readOnlyLogic: (record) =>
        record['posted'] === true
        || record['hASREVERSEDINVOICESO'] === 'Y'
        || record['hASREVERSEDINVOICEPO'] === 'Y',
    };
    assert.equal(evalTabReadOnly(tab, { posted: 'Y' }), true, 'posted string Y should lock');
    assert.equal(evalTabReadOnly(tab, { posted: 'N', hASREVERSEDINVOICESO: 'Y' }), true, 'reversed SO should lock');
    assert.equal(evalTabReadOnly(tab, { posted: 'N', hASREVERSEDINVOICEPO: 'N' }), false, 'draft, not reversed, unlocked');
  });

  it('defaults a missing record to an empty object without throwing', () => {
    const tab = { readOnlyLogic: (record) => record.posted === true };
    assert.equal(evalTabReadOnly(tab, undefined), false);
  });
});
