// @covers tools/app-shell/src/components/contract-ui/detailViewHelpers.jsx
import { describe, it, expect, vi } from 'vitest';
import {
  EXCHANGE_RATES_TAB_KEY,
  HEADER_FIELDS_DERIVED_FROM_CHILD_ROWS,
  headerHasChildDerivedFields,
  refreshHeaderCurrencyRate,
  withExchangeRateHeaderSync,
  withHeaderRefreshOnChildWrite,
} from '../detailViewHelpers.jsx';

/**
 * ETP-5245 follow-up — the "no cost defined" banner did not go away when a cost line was added,
 * and only cleared on a full page reload.
 *
 * Root cause: `etgoHasCost` is computed by the backend from the existence of an `M_Costing` row
 * and stamped on the PRODUCT record. Creating a cost line is a POST to a different entity, so
 * nothing re-reads the product and the header held in memory keeps saying `false` — for the
 * banner AND for the save gate, which read the same record. This wrapper re-reads the header into
 * the main hook after a child write, so the server stays the single source of truth.
 *
 * Both directions matter and are covered below: adding the first line must REMOVE the banner, and
 * deleting the last one must BRING IT BACK.
 */
describe('withHeaderRefreshOnChildWrite (ETP-5245)', () => {
  /** A main-hook double: only the three members the wrapper touches. */
  function makeHook(editing) {
    return {
      editing,
      selected: editing,
      refreshHeaderTotals: vi.fn(),
    };
  }

  /** A secondary-hook double whose add resolves to the created row (the real contract). */
  function makeSecondaryHook(addResult = { id: 'cost-1' }) {
    return {
      children: [],
      handleAddChild: vi.fn(async () => addResult),
      handleDeleteChild: vi.fn(() => 'deleted'),
      handleSelect: vi.fn(),
    };
  }

  const COSTLESS_PRODUCT = { id: 'prod-1', etgoHasCost: false };
  const PRODUCT_WITH_COST = { id: 'prod-1', etgoHasCost: true };

  describe('headerHasChildDerivedFields', () => {
    it('lists etgoHasCost as the first child-derived header field', () => {
      expect(HEADER_FIELDS_DERIVED_FROM_CHILD_ROWS).toContain('etgoHasCost');
    });

    it('is true for a product whose flag is false (banner showing)', () => {
      expect(headerHasChildDerivedFields(COSTLESS_PRODUCT)).toBe(true);
    });

    // The inverse direction depends on this: a product that HAS a cost must still be wrapped, or
    // deleting its last cost line would never bring the banner back.
    it('is true for a product whose flag is true (banner hidden)', () => {
      expect(headerHasChildDerivedFields(PRODUCT_WITH_COST)).toBe(true);
    });

    it('is false when the backend never emitted the flag', () => {
      expect(headerHasChildDerivedFields({ id: 'inv-1', grandTotalAmount: 100 })).toBe(false);
    });

    it('is false for an explicitly null flag', () => {
      expect(headerHasChildDerivedFields({ id: 'prod-1', etgoHasCost: null })).toBe(false);
    });

    it('is false for an unsaved header', () => {
      expect(headerHasChildDerivedFields({ etgoHasCost: false })).toBe(false);
      expect(headerHasChildDerivedFields(null)).toBe(false);
    });
  });

  describe('windows with no child-derived header field', () => {
    it('returns the very same array, so nothing is wrapped and no request is added', () => {
      const hooks = [makeSecondaryHook()];
      const hook = makeHook({ id: 'inv-1', grandTotalAmount: 100 });
      expect(withHeaderRefreshOnChildWrite(hooks, hook)).toBe(hooks);
    });

    it('leaves the original handlers untouched', async () => {
      const sh = makeSecondaryHook();
      const hook = makeHook({ id: 'inv-1' });
      const [wrapped] = withHeaderRefreshOnChildWrite([sh], hook);
      await wrapped.handleAddChild({ cost: 10 });
      expect(hook.refreshHeaderTotals).not.toHaveBeenCalled();
    });
  });

  describe('direction 1 — adding a line clears the stale flag', () => {
    it('re-reads the header after a successful child add', async () => {
      const sh = makeSecondaryHook();
      const hook = makeHook(COSTLESS_PRODUCT);
      const [wrapped] = withHeaderRefreshOnChildWrite([sh], hook);

      await wrapped.handleAddChild({ cost: 10 });

      expect(sh.handleAddChild).toHaveBeenCalledWith({ cost: 10 });
      expect(hook.refreshHeaderTotals).toHaveBeenCalledWith('prod-1');
    });

    it('returns whatever the underlying hook returned', async () => {
      const sh = makeSecondaryHook({ id: 'cost-9' });
      const [wrapped] = withHeaderRefreshOnChildWrite([sh], makeHook(COSTLESS_PRODUCT));
      await expect(wrapped.handleAddChild({})).resolves.toEqual({ id: 'cost-9' });
    });

    it('does NOT re-read the header when the add was refused', async () => {
      const sh = makeSecondaryHook(null);
      const hook = makeHook(COSTLESS_PRODUCT);
      const [wrapped] = withHeaderRefreshOnChildWrite([sh], hook);

      await wrapped.handleAddChild({ cost: 10 });

      expect(hook.refreshHeaderTotals).not.toHaveBeenCalled();
    });
  });

  describe('direction 2 — deleting the last line brings the flag back', () => {
    it('re-reads the header after a child delete', () => {
      const sh = makeSecondaryHook();
      const hook = makeHook(PRODUCT_WITH_COST);
      const [wrapped] = withHeaderRefreshOnChildWrite([sh], hook);

      wrapped.handleDeleteChild('cost-1');

      expect(sh.handleDeleteChild).toHaveBeenCalledWith('cost-1');
      expect(hook.refreshHeaderTotals).toHaveBeenCalledWith('prod-1');
    });

    it('refreshes once per deleted row, covering the batch-delete loop', () => {
      const sh = makeSecondaryHook();
      const hook = makeHook(PRODUCT_WITH_COST);
      const [wrapped] = withHeaderRefreshOnChildWrite([sh], hook);

      for (const id of ['cost-1', 'cost-2']) wrapped.handleDeleteChild(id);

      expect(hook.refreshHeaderTotals).toHaveBeenCalledTimes(2);
    });

    it('returns whatever the underlying hook returned', () => {
      const [wrapped] = withHeaderRefreshOnChildWrite(
        [makeSecondaryHook()], makeHook(PRODUCT_WITH_COST));
      expect(wrapped.handleDeleteChild('cost-1')).toBe('deleted');
    });
  });

  describe('leaves everything else alone', () => {
    it('passes through the hook members it does not wrap', () => {
      const sh = makeSecondaryHook();
      sh.children = [{ id: 'cost-1' }];
      const [wrapped] = withHeaderRefreshOnChildWrite([sh], makeHook(COSTLESS_PRODUCT));

      expect(wrapped.children).toEqual([{ id: 'cost-1' }]);
      expect(wrapped.handleSelect).toBe(sh.handleSelect);
    });

    it('keeps the null placeholders DetailView passes for unused tab slots', () => {
      const wrapped = withHeaderRefreshOnChildWrite(
        [makeSecondaryHook(), null, undefined], makeHook(COSTLESS_PRODUCT));
      expect(wrapped[1]).toBeNull();
      expect(wrapped[2]).toBeUndefined();
    });

    it('does not blow up when a secondary hook has no mutating handlers yet', async () => {
      const hook = makeHook(COSTLESS_PRODUCT);
      const [wrapped] = withHeaderRefreshOnChildWrite([{ children: [] }], hook);
      await expect(wrapped.handleAddChild({})).resolves.toBeUndefined();
      expect(() => wrapped.handleDeleteChild('x')).not.toThrow();
    });
  });
});

/**
 * ETP-4029 / ETP-5657 — a write to the invoice Exchange rates tab also moves the header's hidden
 * `eTGOCurrencyRate` on the backend, so the header must be re-read after it. The PATCH path calls
 * `refreshHeaderCurrencyRate` directly; ADD and DELETE go through `withExchangeRateHeaderSync`.
 */
describe('refreshHeaderCurrencyRate', () => {
  function makeHook(id = 'inv-1') {
    return {
      selected: id ? { id } : null,
      clearUserChangedKey: vi.fn(),
      refreshHeaderTotals: vi.fn(),
    };
  }

  it('clears the user-changed mark on eTGOCurrencyRate, THEN re-reads the header', () => {
    const hook = makeHook();
    refreshHeaderCurrencyRate(hook);
    expect(hook.clearUserChangedKey).toHaveBeenCalledWith('eTGOCurrencyRate');
    expect(hook.refreshHeaderTotals).toHaveBeenCalledWith('inv-1');
    // Order matters: the merge refuses to overwrite a key still marked as changed by the user.
    expect(hook.clearUserChangedKey.mock.invocationCallOrder[0])
      .toBeLessThan(hook.refreshHeaderTotals.mock.invocationCallOrder[0]);
  });

  it('clears only that one key', () => {
    const hook = makeHook();
    refreshHeaderCurrencyRate(hook);
    expect(hook.clearUserChangedKey).toHaveBeenCalledTimes(1);
  });

  it('is a no-op without a selected header record', () => {
    for (const hook of [makeHook(null), { ...makeHook(), selected: {} }]) {
      refreshHeaderCurrencyRate(hook);
      expect(hook.clearUserChangedKey).not.toHaveBeenCalled();
      expect(hook.refreshHeaderTotals).not.toHaveBeenCalled();
    }
  });

  it('tolerates a missing hook', () => {
    expect(() => refreshHeaderCurrencyRate(undefined)).not.toThrow();
  });
});

describe('withExchangeRateHeaderSync', () => {
  const TABS = [{ key: 'paymentPlan' }, { key: EXCHANGE_RATES_TAB_KEY }];

  function makeHook() {
    return {
      selected: { id: 'inv-1' },
      clearUserChangedKey: vi.fn(),
      refreshHeaderTotals: vi.fn(),
    };
  }

  function makeSecondaryHook(addResult = { id: 'rate-1' }) {
    return {
      children: [],
      handleAddChild: vi.fn(async () => addResult),
      handleDeleteChild: vi.fn(() => 'deleted'),
      handleSelect: vi.fn(),
    };
  }

  it('uses the "exchangeRates" tab key', () => {
    expect(EXCHANGE_RATES_TAB_KEY).toBe('exchangeRates');
  });

  it('returns the same array (same identity) when the window has no Exchange rates tab', () => {
    const hooks = [makeSecondaryHook(), makeSecondaryHook()];
    expect(withExchangeRateHeaderSync(hooks, [{ key: 'paymentPlan' }, { key: 'tax' }], makeHook())).toBe(hooks);
    expect(withExchangeRateHeaderSync(hooks, undefined, makeHook())).toBe(hooks);
  });

  it('returns the same array when the Exchange rates slot has no hook', () => {
    const hooks = [makeSecondaryHook(), null];
    expect(withExchangeRateHeaderSync(hooks, TABS, makeHook())).toBe(hooks);
  });

  it('wraps only the Exchange rates index and keeps the other members of its hook', () => {
    const other = makeSecondaryHook();
    const rates = makeSecondaryHook();
    const wrapped = withExchangeRateHeaderSync([other, rates], TABS, makeHook());
    expect(wrapped).not.toBe([other, rates]);
    expect(wrapped[0]).toBe(other);
    expect(wrapped[1]).not.toBe(rates);
    expect(wrapped[1].children).toBe(rates.children);
    expect(wrapped[1].handleSelect).toBe(rates.handleSelect);
  });

  it('a successful ADD clears the rate mark, then re-reads the header, and returns the created row', async () => {
    const hook = makeHook();
    const rates = makeSecondaryHook({ id: 'rate-9' });
    const wrapped = withExchangeRateHeaderSync([null, rates], TABS, hook);

    await expect(wrapped[1].handleAddChild('inv-1', { rate: 0.68 })).resolves.toEqual({ id: 'rate-9' });
    expect(rates.handleAddChild).toHaveBeenCalledWith('inv-1', { rate: 0.68 });
    expect(hook.clearUserChangedKey).toHaveBeenCalledWith('eTGOCurrencyRate');
    expect(hook.refreshHeaderTotals).toHaveBeenCalledWith('inv-1');
    expect(hook.clearUserChangedKey.mock.invocationCallOrder[0])
      .toBeLessThan(hook.refreshHeaderTotals.mock.invocationCallOrder[0]);
  });

  for (const refused of [null, undefined, false]) {
    it(`a refused ADD (resolving ${refused}) re-reads nothing`, async () => {
      const hook = makeHook();
      // Built inline: passing undefined to makeSecondaryHook would pick up its default row.
      const rates = { ...makeSecondaryHook(), handleAddChild: vi.fn(async () => refused) };
      const wrapped = withExchangeRateHeaderSync([null, rates], TABS, hook);
      await expect(wrapped[1].handleAddChild('inv-1', {})).resolves.toBe(refused);
      expect(hook.clearUserChangedKey).not.toHaveBeenCalled();
      expect(hook.refreshHeaderTotals).not.toHaveBeenCalled();
    });
  }

  it('a DELETE clears the rate mark and re-reads the header, returning the inner result', () => {
    const hook = makeHook();
    const rates = makeSecondaryHook();
    const wrapped = withExchangeRateHeaderSync([null, rates], TABS, hook);

    expect(wrapped[1].handleDeleteChild('rate-1')).toBe('deleted');
    expect(rates.handleDeleteChild).toHaveBeenCalledWith('rate-1');
    expect(hook.clearUserChangedKey).toHaveBeenCalledWith('eTGOCurrencyRate');
    expect(hook.refreshHeaderTotals).toHaveBeenCalledWith('inv-1');
  });

  it('touches nothing on the other tabs', async () => {
    const hook = makeHook();
    const other = makeSecondaryHook();
    const wrapped = withExchangeRateHeaderSync([other, makeSecondaryHook()], TABS, hook);
    await wrapped[0].handleAddChild('inv-1', {});
    wrapped[0].handleDeleteChild('x');
    expect(hook.clearUserChangedKey).not.toHaveBeenCalled();
    expect(hook.refreshHeaderTotals).not.toHaveBeenCalled();
  });

  it('composes with withHeaderRefreshOnChildWrite, as DetailView chains them', async () => {
    const hook = makeHook();
    const rates = makeSecondaryHook();
    const chained = withExchangeRateHeaderSync(withHeaderRefreshOnChildWrite([null, rates], hook), TABS, hook);
    await chained[1].handleAddChild('inv-1', {});
    expect(rates.handleAddChild).toHaveBeenCalledTimes(1);
    expect(hook.clearUserChangedKey).toHaveBeenCalledWith('eTGOCurrencyRate');
    expect(hook.refreshHeaderTotals).toHaveBeenCalledWith('inv-1');
  });
});
