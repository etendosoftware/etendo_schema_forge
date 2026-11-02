// @covers tools/app-shell/src/components/contract-ui/evalTabVisible.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evalTabVisible } from '../src/components/contract-ui/evalTabVisible.js';

// Same shape the generator emits for the foreign-currency exchange-rates tab.
const foreignCurrency = (record, ctx) =>
  ctx['OrgCurrencyId'] != null &&
  ((record['currency'] != null && record['currency'] !== '') && record['currency'] !== ctx['OrgCurrencyId']);

describe('evalTabVisible', () => {
  it('is visible when the tab declares no visibleWhen', () => {
    assert.equal(evalTabVisible({ key: 'notes' }, {}, {}), true);
  });

  it('is visible for a nullish tab or a non-function visibleWhen (never gated by garbage)', () => {
    assert.equal(evalTabVisible(undefined, {}, {}), true);
    assert.equal(evalTabVisible({ visibleWhen: 'yes' }, {}, {}), true);
  });

  it('hides the tab when the predicate throws (fail-closed)', () => {
    const tab = { visibleWhen: () => { throw new Error('boom'); } };
    assert.equal(evalTabVisible(tab, {}, {}), false);
  });

  it('coerces the predicate result to a boolean', () => {
    assert.equal(evalTabVisible({ visibleWhen: () => 'truthy' }, {}, {}), true);
    assert.equal(evalTabVisible({ visibleWhen: () => 0 }, {}, {}), false);
    assert.equal(evalTabVisible({ visibleWhen: () => undefined }, {}, {}), false);
  });

  it('passes empty objects when record/ctx are null or undefined, so the predicate does not throw', () => {
    const seen = [];
    const tab = { visibleWhen: (r, c) => { seen.push([r, c]); return true; } };
    assert.equal(evalTabVisible(tab, null, undefined), true);
    assert.deepEqual(seen, [[{}, {}]]);
  });

  it('forwards the real record and ctx untouched', () => {
    const record = { currency: 'USD' };
    const ctx = { OrgCurrencyId: 'EUR' };
    let got;
    evalTabVisible({ visibleWhen: (r, c) => { got = [r, c]; return true; } }, record, ctx);
    assert.equal(got[0], record);
    assert.equal(got[1], ctx);
  });

  describe('foreign-currency predicate', () => {
    const tab = { visibleWhen: foreignCurrency };
    it('hidden when record currency equals the org currency', () => {
      assert.equal(evalTabVisible(tab, { currency: 'EUR' }, { OrgCurrencyId: 'EUR' }), false);
    });
    it('shown when record currency differs', () => {
      assert.equal(evalTabVisible(tab, { currency: 'USD' }, { OrgCurrencyId: 'EUR' }), true);
    });
    it('hidden while the org currency is still loading (null)', () => {
      assert.equal(evalTabVisible(tab, { currency: 'USD' }, { OrgCurrencyId: null }), false);
    });
    it('hidden for an empty, null or missing record currency', () => {
      for (const currency of ['', null, undefined]) {
        assert.equal(evalTabVisible(tab, { currency }, { OrgCurrencyId: 'EUR' }), false);
      }
      assert.equal(evalTabVisible(tab, null, { OrgCurrencyId: 'EUR' }), false);
    });
  });
});
