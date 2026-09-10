import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// ETP-5183 — CreatableSearchSelect's fetch-once mode (serverSearch: false,
// the default) re-fetches options on `field.dependsOn` parent-value changes,
// but used to IGNORE a `selectorContext` CONTENT change when the parent value
// itself stayed the same object identity across renders (e.g. a sibling field
// whose selectorContext is deliberately rebuilt keyed on another field's value
// — see BillingPreferencesForm.jsx's customer/vendor account selectors). The
// options-fetch effect's dependency array omitted `selectorContext` entirely
// and its `cacheKey` only tracked `parentValue`/`refreshKey`, so a
// content-only selectorContext change was silently dropped and the stale
// option list (fetched under the OLD context) kept being shown.
//
// These tests render the REAL component and assert the request is actually
// re-issued (and reflects the new context) when selectorContext's CONTENT
// changes under a new object reference, while confirming an unrelated
// re-render with an unchanged (but newly-referenced) selectorContext does
// NOT cause extra fetches.
// ---------------------------------------------------------------------------

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/lib/buildUrlWithParams.js', () => ({
  buildUrlWithParams: (url, params) => {
    const qs = new URLSearchParams(params).toString();
    return qs ? `${url}?${qs}` : url;
  },
}));

import { CreatableSearchSelect } from '../CreatableSearchSelect.jsx';

function jsonOk(items) {
  return Promise.resolve({ ok: true, json: async () => ({ items }) });
}

const field = {
  key: 'account',
  required: false,
  dependsOn: { field: 'paymentMethod', filterKey: 'Fin_Paymentmethod_ID' },
};

const baseProps = {
  value: '',
  displayValue: '',
  resolvedLabel: 'Account',
  selectorUrl: '/api/selectors/account',
  token: 'test-token',
  // serverSearch defaults to false — this is the fetch-once mode.
};

describe('CreatableSearchSelect — dependsOn + selectorContext content refetch (ETP-5183)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('re-fetches when selectorContext CONTENT changes under a new object reference, with the parent value unchanged', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonOk([{ id: 'A1', label: 'Account under method 1' }]))
      .mockResolvedValueOnce(jsonOk([{ id: 'A2', label: 'Account under method 2' }]));

    const formData = { paymentMethod: 'PM1' };
    const { rerender } = render(
      <CreatableSearchSelect
        {...baseProps}
        field={field}
        formData={formData}
        selectorContext={{ Fin_Paymentmethod_ID: 'PM1' }}
        onChange={vi.fn()}
      />
    );

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    let [url] = global.fetch.mock.calls[0];
    expect(url).toContain('Fin_Paymentmethod_ID=PM1');

    // A NEW selectorContext object (different reference, different content) — the parent
    // field itself (`formData.paymentMethod`) is unchanged, only the sibling context payload
    // changed (e.g. FIN_ISRECEIPT flipped, or another filter param was added upstream).
    rerender(
      <CreatableSearchSelect
        {...baseProps}
        field={field}
        formData={formData}
        selectorContext={{ Fin_Paymentmethod_ID: 'PM1', FIN_ISRECEIPT: 'Y' }}
        onChange={vi.fn()}
      />
    );

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    [url] = global.fetch.mock.calls[1];
    expect(url).toContain('FIN_ISRECEIPT=Y');
  });

  it('does NOT re-fetch when selectorContext is re-rendered with a new reference but IDENTICAL content', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonOk([{ id: 'A1', label: 'Account' }]));

    const formData = { paymentMethod: 'PM1' };
    const { rerender } = render(
      <CreatableSearchSelect
        {...baseProps}
        field={field}
        formData={formData}
        selectorContext={{ Fin_Paymentmethod_ID: 'PM1' }}
        onChange={vi.fn()}
      />
    );

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    // New object, same keys/values — a common inline-object-literal re-render pattern.
    rerender(
      <CreatableSearchSelect
        {...baseProps}
        field={field}
        formData={formData}
        selectorContext={{ Fin_Paymentmethod_ID: 'PM1' }}
        onChange={vi.fn()}
      />
    );

    // Give any (incorrect) extra fetch a chance to fire before asserting it didn't.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
