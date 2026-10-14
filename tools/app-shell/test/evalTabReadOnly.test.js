// @covers tools/app-shell/src/components/contract-ui/evalTabReadOnly.js
// @covers artifacts/sales-invoice/decisions.json
// @covers artifacts/purchase-invoice/decisions.json
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { convertLogicToJs } from '@etendosoftware/schema-forge-cli/src/generate-contract.js';
import { buildHeaderLogicMaps } from '@etendosoftware/schema-forge-cli/src/generate-frontend.js';
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

// ETP-5657 — the invoices' Exchange rates tab no longer locks on @Processed@: a completed but
// unposted invoice keeps its rates editable; posting (or a reversal) locks them. The rule under
// test is the REAL one — read from each window's decisions.json and compiled with the published
// generator's own `convertLogicToJs` (what the generated HeaderPage embeds) — not a hand copy.
for (const windowName of ['sales-invoice', 'purchase-invoice']) {
  describe(`${windowName} — Exchange rates tab readOnlyLogic`, () => {
    const read = (file) => JSON.parse(readFileSync(
      new URL(`../../../artifacts/${windowName}/${file}`, import.meta.url), 'utf8'));
    const decisions = read('decisions.json');
    const contract = read('contract.json');
    const rule = decisions.window.secondaryTabs.exchangeRates.readOnlyLogic;
    const { headerColumnMap, headerBooleanFields } = buildHeaderLogicMaps(contract, 'header');
    // eslint-disable-next-line no-new-func -- compiling the generator's own output, as HeaderPage does
    const readOnlyLogic = new Function('record', `return ${convertLogicToJs(rule, headerColumnMap, headerBooleanFields)};`);
    const tab = { readOnlyLogic };

    it('no longer mentions @Processed@, and the contract carries the same rule', () => {
      assert.doesNotMatch(rule, /@Processed@/);
      assert.equal(contract.frontendContract.window.secondaryTabs.exchangeRates.readOnlyLogic, rule);
    });

    it('keeps the tab EDITABLE on a completed but unposted invoice', () => {
      assert.equal(evalTabReadOnly(tab, { processed: 'Y', posted: 'N' }), false);
      assert.equal(evalTabReadOnly(tab, { processed: true, posted: false }), false);
    });

    it('keeps the tab editable on a draft', () => {
      assert.equal(evalTabReadOnly(tab, { processed: 'N', posted: 'N' }), false);
    });

    it('locks the tab once the invoice is posted', () => {
      assert.equal(evalTabReadOnly(tab, { processed: 'Y', posted: 'Y' }), true);
      assert.equal(evalTabReadOnly(tab, { processed: true, posted: true }), true);
    });

    it('locks the tab on a reversed invoice, sales or purchase side', () => {
      assert.equal(evalTabReadOnly(tab, { processed: 'Y', posted: 'N', hASREVERSEDINVOICESO: 'Y' }), true);
      assert.equal(evalTabReadOnly(tab, { processed: 'Y', posted: 'N', hASREVERSEDINVOICEPO: 'Y' }), true);
    });

    it('unlocks again after an unpost (posted back to N)', () => {
      const posted = { processed: 'Y', posted: 'Y' };
      assert.equal(evalTabReadOnly(tab, posted), true);
      assert.equal(evalTabReadOnly(tab, { ...posted, posted: 'N' }), false);
    });
  });
}
