import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';

// ── i18n stub: return the key as-is ──────────────────────────────────────────
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

// EntityForm is stubbed to a capture harness: it records, per render, the `onChange`
// handler it received and the `fields` it was asked to render. handleAmountChange is
// AssetsDetailPanel's INTERNAL routing function — it is passed to the Financial-info
// EntityForm as `onChange`. Capturing that prop lets us invoke it the way DeferredInput
// would on blur (onChange(fieldKey, value, column)) and assert the routing decision
// (local recompute vs. fall-through onChange) without mounting the real form.
const formProbes = [];
vi.mock('@/components/contract-ui', () => ({
  EntityForm: (props) => {
    formProbes.push(props);
    return (
      <div
        data-testid="entity-form"
        data-fields={(props.fields || []).map((f) => f.key).join(',')}
      />
    );
  },
}));

import AssetsDetailPanel, { computeAssetAmounts } from '../AssetsDetailPanel.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// 1. computeAssetAmounts — pure SL_Assets arithmetic replica (highest value).
//
// SOURCE OF TRUTH: org.openbravo.erpCommon.ad_callouts.SL_Assets#execute (lines 43-63).
//   assetValue changed:  if (amort != 0) residual = asset - amort;  amort = asset - residual;
//   residual  changed:   amort = asset - residual;
//   depreciation changed: residual = asset - amort;
// ETP-4333.
// ─────────────────────────────────────────────────────────────────────────────
describe('computeAssetAmounts — SL_Assets arithmetic replica (ETP-4333)', () => {
  describe('field=assetValue', () => {
    it('with amort != 0 recomputes residual = asset - amort, then amort = asset - residual (unchanged)', () => {
      // asset 1000, amort 300 (≠0) → residual = 1000-300 = 700, amort = 1000-700 = 300.
      const out = computeAssetAmounts('assetValue', 1000, 999, 300);
      expect(out).toEqual({ assetValue: 1000, residualAssetValue: 700, depreciationAmt: 300 });
    });

    it('with amort === 0 keeps residual untouched and sets amort = asset - residual', () => {
      // THE BUG: the Java `if (amort != 0)` short-circuits the residual recompute.
      // With residual -2000 and amort 0, changing asset to 4000 must NOT move residual;
      // amort becomes 4000 - (-2000) = 6000. The pre-fix racy callout left residual at -2000
      // BUT (worse) the naive "residual = asset - amort" replica would wrongly set residual
      // to 4000. This asserts the short-circuit branch faithfully.
      const out = computeAssetAmounts('assetValue', 4000, -2000, 0);
      expect(out).toEqual({ assetValue: 4000, residualAssetValue: -2000, depreciationAmt: 6000 });
    });

    it('amort === 0 with residual 0 leaves residual 0 and amort = asset', () => {
      const out = computeAssetAmounts('assetValue', 5000, 0, 0);
      expect(out).toEqual({ assetValue: 5000, residualAssetValue: 0, depreciationAmt: 5000 });
    });
  });

  describe('field=residualAssetValue', () => {
    it('recomputes amort = asset - residual (asset/residual unchanged)', () => {
      const out = computeAssetAmounts('residualAssetValue', 1000, 250, 999);
      expect(out).toEqual({ assetValue: 1000, residualAssetValue: 250, depreciationAmt: 750 });
    });
  });

  describe('field=depreciationAmt', () => {
    it('recomputes residual = asset - amort (asset/amort unchanged)', () => {
      const out = computeAssetAmounts('depreciationAmt', 1000, 999, 400);
      expect(out).toEqual({ assetValue: 1000, residualAssetValue: 600, depreciationAmt: 400 });
    });
  });

  describe('null/empty operands treated as 0 by the caller coercion (TEST ASSET NULL-amounts)', () => {
    // The component coerces null/'' → 0 via `Number(x) || 0` before calling this. We
    // replicate that here to lock the contract end-to-end: a NULL-amounts asset whose
    // user sets assetValue must not produce NaN.
    const num = (x) => Number(x) || 0;
    it('assetValue set on an all-null asset yields finite amounts', () => {
      const out = computeAssetAmounts('assetValue', num('4000'), num(null), num(''));
      // amort 0 branch: residual stays 0, amort = 4000.
      expect(out).toEqual({ assetValue: 4000, residualAssetValue: 0, depreciationAmt: 4000 });
    });

    it('residual set on an all-null asset yields finite amounts', () => {
      const out = computeAssetAmounts('residualAssetValue', num(null), num('300'), num(undefined));
      expect(out).toEqual({ assetValue: 0, residualAssetValue: 300, depreciationAmt: -300 });
    });
  });

  describe('2-decimal rounding (no float drift)', () => {
    it('rounds to 2 decimals avoiding JS float artifacts', () => {
      // 0.1 + 0.2 = 0.30000000000000004 in IEEE754; via residual = asset - amort.
      const out = computeAssetAmounts('depreciationAmt', 0.3, 999, 0.1);
      expect(out.residualAssetValue).toBe(0.2);
      expect(out.depreciationAmt).toBe(0.1);
      expect(out.assetValue).toBe(0.3);
    });

    it('rounds a long-tail subtraction to exactly 2 decimals', () => {
      const out = computeAssetAmounts('residualAssetValue', 100.005, 33.33, 0);
      // amort = 100.005 - 33.33 = 66.675 → round2 → 66.68 (half away from zero via EPSILON nudge)
      expect(out.depreciationAmt).toBe(66.68);
      expect(out.assetValue).toBe(100.01);
      expect(out.residualAssetValue).toBe(33.33);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 & 3. handleAmountChange routing + clearing AssetValue (Failure A regression).
//
// handleAmountChange is wired as the Financial-info EntityForm's `onChange`. We grab
// that captured prop and invoke it exactly as DeferredInput would on blur. The three
// amount fields must:
//   • apply the recomputed triple through `onLocalChange` (NOT onChange),
//   • fire ZERO POSTs to the `/assets/callout` endpoint.
// Non-amount fields must fall through to the normal `onChange`.
// ─────────────────────────────────────────────────────────────────────────────
describe('AssetsDetailPanel — handleAmountChange routing (ETP-4333)', () => {
  const BASE_PROPS = {
    token: 'tok',
    apiBaseUrl: 'http://host/neo/assets',
    api: { labelOverrides: {} },
    catalogs: {},
    editing: true,
  };

  // The Financial-info EntityForm (group2Fields) is the one whose onChange is
  // handleAmountChange. It is the form whose fields include 'assetValue'.
  const grabAmountFormOnChange = () => {
    const probe = formProbes.find((p) => (p.fields || []).some((f) => f.key === 'assetValue'));
    return probe?.onChange;
  };

  beforeEach(() => {
    formProbes.length = 0;
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: async () => ({ response: { data: [{}] } }) }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderPanel(data, { onChange, onLocalChange } = {}) {
    return render(
      <AssetsDetailPanel
        {...BASE_PROPS}
        data={{ id: 'a1', depreciate: 'Y', ...data }}
        onChange={onChange ?? vi.fn()}
        onLocalChange={onLocalChange ?? vi.fn()}
      />,
    );
  }

  it('applies the full recomputed triple via onLocalChange when assetValue commits', () => {
    const onLocalChange = vi.fn();
    const onChange = vi.fn();
    // amort != 0 → residual = asset - amort.
    renderPanel(
      { assetValue: 1000, residualAssetValue: 700, depreciationAmt: 300 },
      { onChange, onLocalChange },
    );
    const formOnChange = grabAmountFormOnChange();
    expect(formOnChange).toBeTypeOf('function');

    // DeferredInput-style commit: user typed 2000 into assetValue and blurred.
    formOnChange('assetValue', 2000, 'AssetValueAmt');

    // All three writes go through onLocalChange (local setter), none through onChange.
    expect(onLocalChange).toHaveBeenCalledWith('assetValue', 2000);
    expect(onLocalChange).toHaveBeenCalledWith('residualAssetValue', 1700); // 2000 - 300
    expect(onLocalChange).toHaveBeenCalledWith('depreciationAmt', 300);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('fires ZERO POSTs to the /assets/callout endpoint for the three amount fields', () => {
    const onLocalChange = vi.fn();
    renderPanel(
      { assetValue: 1000, residualAssetValue: 700, depreciationAmt: 300 },
      { onLocalChange },
    );
    const formOnChange = grabAmountFormOnChange();

    formOnChange('assetValue', 2000, 'AssetValueAmt');
    formOnChange('residualAssetValue', 500, 'Residualassetvalueamt');
    formOnChange('depreciationAmt', 250, 'Amortizationvalueamt');

    const calloutPosts = globalThis.fetch.mock.calls.filter(([url, opts]) => {
      const u = typeof url === 'string' ? url : '';
      const method = (opts?.method || 'GET').toUpperCase();
      return /\/assets\/callout/.test(u) && method === 'POST';
    });
    expect(calloutPosts).toHaveLength(0);
  });

  it('routes residualAssetValue commit: amort = asset - residual, via onLocalChange', () => {
    const onLocalChange = vi.fn();
    renderPanel(
      { assetValue: 1000, residualAssetValue: 700, depreciationAmt: 300 },
      { onLocalChange },
    );
    grabAmountFormOnChange()('residualAssetValue', 250, 'Residualassetvalueamt');
    expect(onLocalChange).toHaveBeenCalledWith('assetValue', 1000);
    expect(onLocalChange).toHaveBeenCalledWith('residualAssetValue', 250);
    expect(onLocalChange).toHaveBeenCalledWith('depreciationAmt', 750); // 1000 - 250
  });

  it('routes depreciationAmt commit: residual = asset - amort, via onLocalChange', () => {
    const onLocalChange = vi.fn();
    renderPanel(
      { assetValue: 1000, residualAssetValue: 700, depreciationAmt: 300 },
      { onLocalChange },
    );
    grabAmountFormOnChange()('depreciationAmt', 400, 'Amortizationvalueamt');
    expect(onLocalChange).toHaveBeenCalledWith('assetValue', 1000);
    expect(onLocalChange).toHaveBeenCalledWith('residualAssetValue', 600); // 1000 - 400
    expect(onLocalChange).toHaveBeenCalledWith('depreciationAmt', 400);
  });

  it('falls through to onChange (NOT onLocalChange) for a non-amount field', () => {
    const onChange = vi.fn();
    const onLocalChange = vi.fn();
    renderPanel(
      { assetValue: 1000, residualAssetValue: 700, depreciationAmt: 300 },
      { onChange, onLocalChange },
    );
    // previouslyDepreciatedAmt lives in the same form but is NOT an amount field.
    grabAmountFormOnChange()('previouslyDepreciatedAmt', '50', 'Depreciatedpreviousamt');
    expect(onChange).toHaveBeenCalledWith('previouslyDepreciatedAmt', '50', 'Depreciatedpreviousamt');
    expect(onLocalChange).not.toHaveBeenCalled();
  });

  it('falls back to onChange as the local setter when onLocalChange is absent', () => {
    const onChange = vi.fn();
    // Render directly (NOT via renderPanel) so onLocalChange is genuinely omitted —
    // the helper would otherwise substitute a fresh vi.fn() for an undefined prop.
    render(
      <AssetsDetailPanel
        {...BASE_PROPS}
        data={{ id: 'a1', depreciate: 'Y', assetValue: 1000, residualAssetValue: 700, depreciationAmt: 300 }}
        onChange={onChange}
      />,
    );
    grabAmountFormOnChange()('assetValue', 2000, 'AssetValueAmt');
    // With no onLocalChange, the triple is applied through the fallback onChange setter.
    expect(onChange).toHaveBeenCalledWith('assetValue', 2000);
    expect(onChange).toHaveBeenCalledWith('residualAssetValue', 1700);
    expect(onChange).toHaveBeenCalledWith('depreciationAmt', 300);
  });

  // ── 3. Clearing AssetValue recomputes residual locally (Failure A regression) ──
  it('clearing AssetValue (→ 0) with amort != 0 recomputes residual = -amort locally', () => {
    // Failure A: clearing AssetValue must still recompute. amort 300 (≠0) → residual = 0-300.
    const onLocalChange = vi.fn();
    renderPanel(
      { assetValue: 1000, residualAssetValue: 700, depreciationAmt: 300 },
      { onLocalChange },
    );
    // DeferredInput coerces an empty number field to '0' before commit.
    grabAmountFormOnChange()('assetValue', '0', 'AssetValueAmt');
    expect(onLocalChange).toHaveBeenCalledWith('assetValue', 0);
    expect(onLocalChange).toHaveBeenCalledWith('residualAssetValue', -300); // 0 - 300
    expect(onLocalChange).toHaveBeenCalledWith('depreciationAmt', 300); // 0 - (-300)
  });

  it('clearing AssetValue with amort 0 keeps residual and sets amort = -residual', () => {
    // amort === 0 short-circuit branch: residual untouched, amort = 0 - residual.
    const onLocalChange = vi.fn();
    renderPanel(
      { assetValue: 4000, residualAssetValue: -2000, depreciationAmt: 0 },
      { onLocalChange },
    );
    grabAmountFormOnChange()('assetValue', '0', 'AssetValueAmt');
    expect(onLocalChange).toHaveBeenCalledWith('assetValue', 0);
    expect(onLocalChange).toHaveBeenCalledWith('residualAssetValue', -2000); // unchanged
    expect(onLocalChange).toHaveBeenCalledWith('depreciationAmt', 2000); // 0 - (-2000)
  });
});
