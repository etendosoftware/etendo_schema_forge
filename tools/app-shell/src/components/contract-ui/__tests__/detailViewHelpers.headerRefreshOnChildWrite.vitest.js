import { describe, it, expect, vi } from 'vitest';
import {
  HEADER_FIELDS_DERIVED_FROM_CHILD_ROWS,
  headerHasChildDerivedFields,
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
