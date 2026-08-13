// Regression tests for the `excludeId` prop on InlineSearchCombo (ETP-4030).
//
// Feature: an inline add-row selector must be able to drop a sibling field's
// live value from its dropdown. Concretely, in an invoice's Exchange Rates
// add-row the "To Currency" selector must NOT offer the document currency
// (the read-only "From Currency" already shown in the row).
//
// Wiring under test:
//   - DataTable's InlineAddRow computes `excludeId = values[field.excludeValueOf]`
//     and passes it to InlineSearchCombo.
//   - InlineSearchCombo filters out `o.id === excludeId` from both the local
//     `options` and any server `serverResults` before slicing.
//
// These tests render InlineSearchCombo directly (no selectorUrl/token, so the
// server-fetch path is inert) and verify the local-options exclusion, plus a
// control case proving the option only disappears because of `excludeId`.

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('lucide-react', () => ({ ChevronDown: () => <span data-testid="chevron" /> }));
vi.mock('@/lib/buildUrlWithParams.js', () => ({
  buildUrlWithParams: (url, params) => {
    const qs = new URLSearchParams(params).toString();
    return qs ? `${url}?${qs}` : url;
  },
}));

import InlineSearchCombo from '../InlineSearchCombo.jsx';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIELD = { key: 'toCurrency' };

// Three currencies — `eur` plays the role of the excluded document currency.
const OPTIONS = [
  { id: 'eur', name: 'EUR' },
  { id: 'usd', name: 'USD' },
  { id: 'gbp', name: 'GBP' },
];

function renderCombo(overrides = {}) {
  const onChange = vi.fn();
  const props = {
    field: FIELD,
    value: '',
    options: OPTIONS,
    onChange,
    placeholder: 'Search currency',
    clearOnType: true,
    // No selectorUrl / token: the server-fetch branch stays inert, so the
    // `options`-based path is exercised deterministically.
    ...overrides,
  };
  const result = render(<InlineSearchCombo {...props} />);
  const input = screen.getByTestId('inline-add-field-toCurrency');
  return { ...result, input, onChange };
}

// ---------------------------------------------------------------------------
// 1. excludeId removes the matching option (the load-bearing assertion)
// ---------------------------------------------------------------------------

describe('InlineSearchCombo — excludeId removes the excluded option', () => {
  it('lists the other options but NOT the excluded one when excludeId is set', async () => {
    const user = userEvent.setup();
    const { input } = renderCombo({ excludeId: 'eur' });
    await user.click(input);
    await waitFor(() => {
      expect(screen.getByTestId('inline-add-options-toCurrency')).toBeInTheDocument();
    });
    // usd + gbp present, eur excluded.
    expect(screen.getByTestId('inline-add-option-toCurrency-usd')).toBeInTheDocument();
    expect(screen.getByTestId('inline-add-option-toCurrency-gbp')).toBeInTheDocument();
    expect(screen.queryByTestId('inline-add-option-toCurrency-eur')).not.toBeInTheDocument();
  });

  it('cannot select the excluded option via Enter (first filtered is usd, not eur)', async () => {
    const user = userEvent.setup();
    const { input, onChange } = renderCombo({ excludeId: 'eur' });
    await user.click(input);
    await waitFor(() => screen.getByTestId('inline-add-option-toCurrency-usd'));
    await user.keyboard('{Enter}');
    // First filtered option is usd (eur was dropped), so Enter commits usd.
    expect(onChange).toHaveBeenCalledWith('usd', 'USD', expect.objectContaining({ id: 'usd' }));
    expect(onChange).not.toHaveBeenCalledWith('eur', expect.anything(), expect.anything());
  });
});

// ---------------------------------------------------------------------------
// 2. Control case — without excludeId all three options appear
// ---------------------------------------------------------------------------

describe('InlineSearchCombo — excludeId control case', () => {
  it('shows all three options when no excludeId is provided (default null)', async () => {
    const user = userEvent.setup();
    const { input } = renderCombo(); // no excludeId
    await user.click(input);
    await waitFor(() => {
      expect(screen.getByTestId('inline-add-options-toCurrency')).toBeInTheDocument();
    });
    // The very option excluded above is present here — proving excludeId is the
    // sole cause of its removal, not some unrelated filtering.
    expect(screen.getByTestId('inline-add-option-toCurrency-eur')).toBeInTheDocument();
    expect(screen.getByTestId('inline-add-option-toCurrency-usd')).toBeInTheDocument();
    expect(screen.getByTestId('inline-add-option-toCurrency-gbp')).toBeInTheDocument();
  });

  it('treats excludeId={null} the same as omitting it (no exclusion)', async () => {
    const user = userEvent.setup();
    const { input } = renderCombo({ excludeId: null });
    await user.click(input);
    await waitFor(() => screen.getByTestId('inline-add-options-toCurrency'));
    expect(screen.getByTestId('inline-add-option-toCurrency-eur')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 3. Exclusion survives the typed-query path
// ---------------------------------------------------------------------------

describe('InlineSearchCombo — excludeId with a typed query', () => {
  it('does not surface the excluded option even when the query matches it', async () => {
    const user = userEvent.setup();
    const { input } = renderCombo({ excludeId: 'eur' });
    await user.click(input);
    // Type a query that would match "EUR" by name.
    await user.type(input, 'eur');
    // Either the dropdown closes (no matches) or it stays open with no eur entry;
    // in both cases the excluded option must never be rendered.
    await waitFor(() => {
      expect(screen.queryByTestId('inline-add-option-toCurrency-eur')).not.toBeInTheDocument();
    });
  });

  it('still surfaces a non-excluded option that matches the query', async () => {
    const user = userEvent.setup();
    const { input } = renderCombo({ excludeId: 'eur' });
    await user.click(input);
    await user.type(input, 'usd');
    await waitFor(() => {
      expect(screen.getByTestId('inline-add-option-toCurrency-usd')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('inline-add-option-toCurrency-eur')).not.toBeInTheDocument();
  });
});
