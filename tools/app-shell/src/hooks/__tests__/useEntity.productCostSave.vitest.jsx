import { renderHook, act } from '@testing-library/react';
import { useEntity } from '../useEntity';
import { toast } from 'sonner';
import { getSaveBlockCount, resetSaveBlockSignals } from '@/lib/saveBlockSignal.js';

/**
 * ETP-5245 — a product with no cost line SAVES. This suite is the regression net around the
 * removal of the hard save-block, not around the block itself.
 *
 * The block once lived in `performSave`: a saved product whose `etgoHasCost` was false could not
 * be written at all. It was removed by product decision, because a missing `M_Costing` row was
 * stopping edits that have nothing to do with costing (renaming the product, un-ticking `Active`)
 * and a product created from a document line is born in exactly that state. Only the advisory
 * `ProductCostBanner` remains.
 *
 * What must hold now:
 *  - The write request IS issued for a costless product, and `handleSave` returns the record.
 *  - Nothing reports the refusal any more: no `productCostRequired` toast, no `saveError`, and
 *    nothing published on the save-block bus under the id the gate used to use.
 *  - No product shape is special-cased — type, `stocked` and `bookUsingPurchaseOrderPrice` are
 *    irrelevant to whether the save goes through.
 *
 * The save-block bus itself is still live infrastructure used by other blocking rules; it is
 * asserted here only to prove the product-cost id is no longer one of its publishers.
 */

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

/** The id the removed gate used for its toast and its save-block announcement. */
const RETIRED_BLOCK_ID = 'product-cost-required';
/** The i18n key the removed gate raised as a save error (the banner still uses it as copy). */
const COST_MESSAGE_KEY = 'productCostRequired';

/** A saved, stocked product with no cost — the record the removed gate used to refuse. */
const COSTLESS_PRODUCT = {
  id: 'prod-1',
  name: 'Widget',
  productType: 'I',
  stocked: true,
  bookUsingPurchaseOrderPrice: false,
  etgoHasCost: false,
};

describe('useEntity — a costless product saves normally (ETP-5245 block removed)', () => {
  const baseOpts = {
    token: 'test-token',
    apiBaseUrl: 'http://localhost/api',
    skipListFetch: true,
  };

  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ response: { data: [{ id: 'prod-1', name: 'Widget' }] } }),
    }));
    vi.clearAllMocks();
    resetSaveBlockSignals();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderEntity(opts = {}) {
    return renderHook(() => useEntity('header', null, { ...baseOpts, ...opts }));
  }

  /** Selects `record`, edits an unrelated field and saves. Returns the save result. */
  async function editAndSave(result, record) {
    act(() => { result.current.handleSelect(record); });
    act(() => { result.current.handleChange('name', 'Widget renamed'); });
    let saved;
    await act(async () => { saved = await result.current.handleSave(); });
    return saved;
  }

  /** Every write the hook issued for this record. */
  function writeCalls() {
    return globalThis.fetch.mock.calls.filter(
      ([, opts]) => opts?.method === 'PATCH' || opts?.method === 'POST');
  }

  /** Every error toast that was raised under the removed gate's key or its stable id. */
  function costBlockToasts() {
    return toast.error.mock.calls.filter(
      ([msg, opts]) => msg === COST_MESSAGE_KEY || opts?.id === RETIRED_BLOCK_ID);
  }

  // ── the save goes through ─────────────────────────────────────────────────

  it('issues the write for a saved product with no cost', async () => {
    const { result } = renderEntity({ specName: 'product' });
    const saved = await editAndSave(result, COSTLESS_PRODUCT);

    expect(saved).not.toBeNull();
    expect(writeCalls()).toHaveLength(1);
    expect(writeCalls()[0][1].method).toBe('PATCH');
  });

  it('sends the edited value to the backend rather than dropping it', async () => {
    const { result } = renderEntity({ specName: 'product' });
    await editAndSave(result, COSTLESS_PRODUCT);

    expect(JSON.parse(writeCalls()[0][1].body)).toMatchObject({ name: 'Widget renamed' });
  });

  it('raises no cost-related error toast', async () => {
    const { result } = renderEntity({ specName: 'product' });
    await editAndSave(result, COSTLESS_PRODUCT);

    expect(costBlockToasts()).toEqual([]);
  });

  it('leaves no save error behind', async () => {
    const { result } = renderEntity({ specName: 'product' });
    await editAndSave(result, COSTLESS_PRODUCT);

    expect(result.current.saveError).toBeNull();
  });

  it('releases the saving flag so the form is usable again', async () => {
    const { result } = renderEntity({ specName: 'product' });
    await editAndSave(result, COSTLESS_PRODUCT);

    expect(result.current.isSaving).toBe(false);
  });

  it('lets every blur-driven autosave through, not just the first', async () => {
    const { result } = renderEntity({ specName: 'product' });
    act(() => { result.current.handleSelect(COSTLESS_PRODUCT); });

    for (const value of ['a', 'b', 'c']) {
      act(() => { result.current.handleChange('name', value); });
      // eslint-disable-next-line no-await-in-loop
      await act(async () => { await result.current.handleSave(); });
    }

    expect(writeCalls()).toHaveLength(3);
    expect(costBlockToasts()).toEqual([]);
  });

  /**
   * The banner is dismissible and used to re-open itself through the save-block bus every time the
   * gate fired. Nothing publishes that id any more; this pins it, so re-adding the block without
   * re-adding the banner wiring (or the other way round) fails here.
   */
  it('announces nothing on the save-block bus under the retired cost id', async () => {
    const { result } = renderEntity({ specName: 'product' });
    await editAndSave(result, COSTLESS_PRODUCT);

    expect(getSaveBlockCount(RETIRED_BLOCK_ID)).toBe(0);
  });

  it('announces nothing on the bus across repeated saves either', async () => {
    const { result } = renderEntity({ specName: 'product' });
    act(() => { result.current.handleSelect(COSTLESS_PRODUCT); });

    for (const value of ['a', 'b', 'c']) {
      act(() => { result.current.handleChange('name', value); });
      // eslint-disable-next-line no-await-in-loop
      await act(async () => { await result.current.handleSave(); });
    }

    expect(getSaveBlockCount(RETIRED_BLOCK_ID)).toBe(0);
  });

  it('saves a product that already has a cost, exactly as before', async () => {
    const { result } = renderEntity({ specName: 'product' });
    const saved = await editAndSave(result, { ...COSTLESS_PRODUCT, etgoHasCost: true });

    expect(saved).not.toBeNull();
    expect(writeCalls()).toHaveLength(1);
    expect(getSaveBlockCount(RETIRED_BLOCK_ID)).toBe(0);
  });

  it('saves when the backend never emitted etgoHasCost', async () => {
    const { etgoHasCost, ...withoutFlag } = COSTLESS_PRODUCT;
    expect(etgoHasCost).toBe(false);
    const { result } = renderEntity({ specName: 'product' });
    const saved = await editAndSave(result, withoutFlag);

    expect(saved).not.toBeNull();
    expect(writeCalls()).toHaveLength(1);
  });

  /**
   * ETP-5245 follow-up — `etgoHasCost` is stamped on the PRODUCT record, but a cost line is a POST
   * to another entity, so `withHeaderRefreshOnChildWrite` (detailViewHelpers.jsx) re-reads the
   * header after a child add/delete. The refreshed value still has to land in the record the
   * banner reads; the save must be indifferent to it in BOTH directions.
   */
  describe('a header refresh updates the record the banner reads', () => {
    /** Answers the header GET with `etgoHasCost: flag`, everything else as usual. */
    function mockHeaderGetReturning(flag) {
      globalThis.fetch = vi.fn(async (url, opts) => ({
        ok: true,
        json: async () => ({
          response: {
            data: [
              (!opts?.method || opts.method === 'GET') && String(url).includes('/header/prod-1')
                ? { ...COSTLESS_PRODUCT, etgoHasCost: flag }
                : { id: 'prod-1', name: 'Widget' },
            ],
          },
        }),
      }));
    }

    it('lands the refreshed cost flag on the editing record and still saves', async () => {
      const { result } = renderEntity({ specName: 'product' });
      act(() => { result.current.handleSelect(COSTLESS_PRODUCT); });

      mockHeaderGetReturning(true);
      await act(async () => { result.current.refreshHeaderTotals('prod-1'); });

      expect(result.current.editing.etgoHasCost).toBe(true);
      act(() => { result.current.handleChange('name', 'Widget renamed'); });
      let saved;
      await act(async () => { saved = await result.current.handleSave(); });
      expect(saved).not.toBeNull();
    });

    // The inverse case: the last cost line is removed and the flag flips back to false. The
    // warning comes back, the save does not stop.
    it('keeps saving once the refreshed header reports no cost again', async () => {
      const { result } = renderEntity({ specName: 'product' });
      act(() => { result.current.handleSelect({ ...COSTLESS_PRODUCT, etgoHasCost: true }); });

      mockHeaderGetReturning(false);
      await act(async () => { result.current.refreshHeaderTotals('prod-1'); });

      expect(result.current.editing.etgoHasCost).toBe(false);
      act(() => { result.current.handleChange('name', 'Widget renamed'); });
      let saved;
      await act(async () => { saved = await result.current.handleSave(); });
      expect(saved).not.toBeNull();
      expect(getSaveBlockCount(RETIRED_BLOCK_ID)).toBe(0);
    });
  });

  // ── no product shape is special-cased ─────────────────────────────────────

  it('saves a non-stocked product', async () => {
    const { result } = renderEntity({ specName: 'product' });
    const saved = await editAndSave(result, { ...COSTLESS_PRODUCT, stocked: false });

    expect(saved).not.toBeNull();
    expect(writeCalls()).toHaveLength(1);
  });

  it.each(['I', 'S', 'E', 'R'])('saves product type "%s" with no cost', async (productType) => {
    const { result } = renderEntity({ specName: 'product' });
    const saved = await editAndSave(result, { ...COSTLESS_PRODUCT, productType });

    expect(saved).not.toBeNull();
    expect(writeCalls()).toHaveLength(1);
  });

  it('saves a product valued at its purchase order price', async () => {
    const { result } = renderEntity({ specName: 'product' });
    const saved = await editAndSave(
      result, { ...COSTLESS_PRODUCT, bookUsingPurchaseOrderPrice: true });

    expect(saved).not.toBeNull();
    expect(writeCalls()).toHaveLength(1);
  });

  it('saves an edit that has nothing to do with costing', async () => {
    // The reason the block was removed: deactivating or correcting a costless product used to be
    // impossible until someone added a line on the Costing tab.
    const { result } = renderEntity({ specName: 'product' });
    act(() => { result.current.handleSelect(COSTLESS_PRODUCT); });
    act(() => { result.current.handleChange('active', false); });

    let saved;
    await act(async () => { saved = await result.current.handleSave(); });

    expect(saved).not.toBeNull();
    expect(writeCalls()).toHaveLength(1);
    expect(costBlockToasts()).toEqual([]);
  });

  it('saves the creation of a product (the Costing tab needs a saved record)', async () => {
    const { result } = renderEntity({ specName: 'product' });
    await act(async () => { await result.current.handleNew(); });
    act(() => { result.current.handleChange('name', 'Brand new widget'); });
    act(() => { result.current.handleChange('productType', 'I'); });
    act(() => { result.current.handleChange('stocked', true); });

    let saved;
    await act(async () => { saved = await result.current.handleSave(); });

    expect(saved).not.toBeNull();
    expect(costBlockToasts()).toEqual([]);
  });

  // ── other windows are untouched ───────────────────────────────────────────

  it('saves in another window whose record happens to look like a costless product', async () => {
    const { result } = renderEntity({ specName: 'sales-order' });
    const saved = await editAndSave(result, COSTLESS_PRODUCT);

    expect(saved).not.toBeNull();
    expect(costBlockToasts()).toEqual([]);
    expect(writeCalls()).toHaveLength(1);
  });

  it('saves when no specName is supplied at all', async () => {
    const { result } = renderEntity();
    const saved = await editAndSave(result, COSTLESS_PRODUCT);

    expect(saved).not.toBeNull();
    expect(writeCalls()).toHaveLength(1);
  });
});
