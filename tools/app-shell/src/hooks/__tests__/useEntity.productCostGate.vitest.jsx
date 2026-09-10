import { renderHook, act } from '@testing-library/react';
import { useEntity } from '../useEntity';
import { toast } from 'sonner';
import { getSaveBlockCount, resetSaveBlockSignals } from '@/lib/saveBlockSignal.js';

/**
 * ETP-5245 — the Product-only hard save-block for a stockable item with no cost line.
 *
 * A stockable product with no `M_Costing` row fails later, at the first shipment or count, far
 * from whoever created it. `performSave` therefore refuses the save while the Cost tab is still
 * one click away.
 *
 * What must hold:
 *  - The save is refused (returns null) and no write request is issued.
 *  - The toast carries a STABLE id — Product autosaves on blur, so every field the user leaves
 *    would otherwise stack another copy of the same toast.
 *  - It is a no-op for every other window, and for a product that is not in the blocking state.
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

const TOAST_ID = 'product-cost-required';

/** A saved, stocked product with no cost — the record the gate exists to refuse. */
const BLOCKING_PRODUCT = {
  id: 'prod-1',
  name: 'Widget',
  productType: 'I',
  stocked: true,
  bookUsingPurchaseOrderPrice: false,
  etgoHasCost: false,
};

describe('useEntity — product cost save gate (ETP-5245)', () => {
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

  /** Every write the hook could have issued for this record. */
  function writeCalls() {
    return globalThis.fetch.mock.calls.filter(
      ([, opts]) => opts?.method === 'PATCH' || opts?.method === 'POST');
  }

  // ── the block ─────────────────────────────────────────────────────────────

  it('refuses the save for a product with no cost', async () => {
    const { result } = renderEntity({ specName: 'product' });
    const saved = await editAndSave(result, BLOCKING_PRODUCT);

    expect(saved).toBeNull();
    expect(writeCalls()).toHaveLength(0);
  });

  it('surfaces the i18n key rather than a hardcoded message', async () => {
    const { result } = renderEntity({ specName: 'product' });
    await editAndSave(result, BLOCKING_PRODUCT);

    expect(toast.error).toHaveBeenCalledWith('productCostRequired', { id: TOAST_ID });
    expect(result.current.saveError).toBe('productCostRequired');
  });

  it('releases the saving flag so the form is usable again', async () => {
    const { result } = renderEntity({ specName: 'product' });
    await editAndSave(result, BLOCKING_PRODUCT);

    expect(result.current.isSaving).toBe(false);
  });

  it('reuses one stable toast id across repeated blur-driven save attempts', async () => {
    const { result } = renderEntity({ specName: 'product' });
    act(() => { result.current.handleSelect(BLOCKING_PRODUCT); });

    for (const value of ['a', 'b', 'c']) {
      act(() => { result.current.handleChange('name', value); });
      // eslint-disable-next-line no-await-in-loop
      await act(async () => { await result.current.handleSave(); });
    }

    expect(toast.error).toHaveBeenCalledTimes(3);
    // Same id every time — sonner collapses them into a single toast instead of stacking.
    for (const call of toast.error.mock.calls) {
      expect(call[1]).toEqual({ id: TOAST_ID });
    }
  });

  /**
   * ETP-5245 — banners are dismissible by default, so the refusal has to be announceable: the
   * gate publishes it on the save-block bus under the SAME stable id as the toast, and
   * ProductCostBanner re-opens itself on it. Without this, a user who closed the banner would be
   * refused with no on-screen explanation left.
   */
  it('announces the refusal on the save-block bus under the toast id', async () => {
    const { result } = renderEntity({ specName: 'product' });
    await editAndSave(result, BLOCKING_PRODUCT);

    expect(getSaveBlockCount(TOAST_ID)).toBe(1);
  });

  it('announces every repeated refusal, so a re-dismissed banner comes back each time', async () => {
    const { result } = renderEntity({ specName: 'product' });
    act(() => { result.current.handleSelect(BLOCKING_PRODUCT); });

    for (const value of ['a', 'b', 'c']) {
      act(() => { result.current.handleChange('name', value); });
      // eslint-disable-next-line no-await-in-loop
      await act(async () => { await result.current.handleSave(); });
    }

    expect(getSaveBlockCount(TOAST_ID)).toBe(3);
  });

  it('announces nothing when the save is allowed through', async () => {
    const { result } = renderEntity({ specName: 'product' });
    const saved = await editAndSave(result, { ...BLOCKING_PRODUCT, etgoHasCost: true });

    expect(saved).not.toBeNull();
    expect(getSaveBlockCount(TOAST_ID)).toBe(0);
  });

  // ── no regression for anything else ───────────────────────────────────────

  it('does not block another window whose record happens to look like a costless product', async () => {
    const { result } = renderEntity({ specName: 'sales-order' });
    const saved = await editAndSave(result, BLOCKING_PRODUCT);

    expect(saved).not.toBeNull();
    expect(toast.error).not.toHaveBeenCalledWith('productCostRequired', expect.anything());
    expect(writeCalls()).toHaveLength(1);
  });

  it('does not block when no specName is supplied at all', async () => {
    const { result } = renderEntity();
    const saved = await editAndSave(result, BLOCKING_PRODUCT);

    expect(saved).not.toBeNull();
    expect(writeCalls()).toHaveLength(1);
  });

  it('does not block a product that already has a cost', async () => {
    const { result } = renderEntity({ specName: 'product' });
    const saved = await editAndSave(result, { ...BLOCKING_PRODUCT, etgoHasCost: true });

    expect(saved).not.toBeNull();
    expect(writeCalls()).toHaveLength(1);
  });

  it('does not block when the backend never emitted etgoHasCost', async () => {
    const { etgoHasCost, ...withoutFlag } = BLOCKING_PRODUCT;
    expect(etgoHasCost).toBe(false);
    const { result } = renderEntity({ specName: 'product' });
    const saved = await editAndSave(result, withoutFlag);

    expect(saved).not.toBeNull();
    expect(writeCalls()).toHaveLength(1);
  });

  /**
   * WIDENED SCOPE (deliberate — do not restore the old expectations). The gate used to let a
   * non-stocked or non-`Item` product through; by product decision every costless product is now
   * refused, services, expenses and resources included. The two cases below are the inverse of
   * what they asserted when ETP-5245 first landed.
   */
  it('refuses a non-stocked product (was allowed before the widening)', async () => {
    const { result } = renderEntity({ specName: 'product' });
    const saved = await editAndSave(result, { ...BLOCKING_PRODUCT, stocked: false });

    expect(saved).toBeNull();
    expect(writeCalls()).toHaveLength(0);
  });

  it.each(['S', 'E', 'R'])(
    'refuses product type "%s" (was allowed before the widening)',
    async (productType) => {
      const { result } = renderEntity({ specName: 'product' });
      const saved = await editAndSave(result, { ...BLOCKING_PRODUCT, productType });

      expect(saved).toBeNull();
      expect(writeCalls()).toHaveLength(0);
    },
  );

  it('refuses a product valued at its purchase order price (was allowed before the widening)', async () => {
    const { result } = renderEntity({ specName: 'product' });
    const saved = await editAndSave(
      result, { ...BLOCKING_PRODUCT, bookUsingPurchaseOrderPrice: true });

    expect(saved).toBeNull();
    expect(writeCalls()).toHaveLength(0);
  });

  it('refuses every kind of edit, not just the one that could add a cost', async () => {
    // Consequence of the widened rule, asserted so it is a documented decision rather than a
    // surprise: a costless product cannot be deactivated, renamed or corrected in any way until
    // someone adds a line on the Costing tab.
    const { result } = renderEntity({ specName: 'product' });
    act(() => { result.current.handleSelect(BLOCKING_PRODUCT); });
    act(() => { result.current.handleChange('active', false); });

    let saved;
    await act(async () => { saved = await result.current.handleSave(); });

    expect(saved).toBeNull();
    expect(writeCalls()).toHaveLength(0);
  });

  it('does not block the creation of a product (the Cost tab needs a saved record)', async () => {
    const { result } = renderEntity({ specName: 'product' });
    await act(async () => { await result.current.handleNew(); });
    act(() => { result.current.handleChange('name', 'Brand new widget'); });
    act(() => { result.current.handleChange('productType', 'I'); });
    act(() => { result.current.handleChange('stocked', true); });

    let saved;
    await act(async () => { saved = await result.current.handleSave(); });

    expect(saved).not.toBeNull();
    expect(toast.error).not.toHaveBeenCalledWith('productCostRequired', expect.anything());
  });
});
