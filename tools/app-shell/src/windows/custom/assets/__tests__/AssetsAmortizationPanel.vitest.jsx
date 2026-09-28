import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ETP-5414 — QA rejection, two bugs fixed on this panel:
//  1) the "Porcentaje" column printed the raw dot-decimal percentage
//     (`1.67%`) instead of the localized comma-decimal value (`1,67%`).
//  2) the plan total was compared against the FULL `depreciationAmt`
//     instead of `depreciationAmt - previouslyDepreciatedAmt`, so a
//     perfectly correct plan (lines summing to exactly what's left to
//     schedule) was flagged red (`text-destructive`).
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

// Checkbox re-exports from @etendosoftware/app-shell-core which is not
// available in this test environment — same mock convention already used by
// AmortizationLinesTable.vitest.jsx for the sibling amortization window.
vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, indeterminate, disabled, onChange, 'aria-label': ariaLabel }) => (
    <button
      role="checkbox"
      aria-label={ariaLabel}
      aria-checked={indeterminate ? 'mixed' : Boolean(checked)}
      disabled={disabled}
      onClick={disabled ? undefined : onChange}
    />
  ),
}));

import AssetsAmortizationPanel from '../AssetsAmortizationPanel.jsx';

function mockFetchReturning(rows) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ response: { data: rows } }),
  });
}

const renderInRouter = (ui, options) =>
  render(ui, { wrapper: MemoryRouter, ...options });

const BASE_PROPS = {
  recordId: 'asset-1',
  token: 'tok',
  apiBaseUrl: 'http://host/neo/assets',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AssetsAmortizationPanel — "Porcentaje" column formatting (ETP-5414)', () => {
  beforeEach(() => {
    global.fetch = mockFetchReturning([
      { id: 'line-1', sEQNoAsset: 1, amortizationPercentage: 1.6666666, amortizationAmount: 100, 'amortization$_identifier': 'Period 1' },
    ]);
  });

  it('renders the line percentage with a comma decimal separator, not a raw dot', async () => {
    renderInRouter(<AssetsAmortizationPanel {...BASE_PROPS} data={{ id: 'asset-1' }} />);
    await waitFor(() => expect(screen.getByText('Period 1')).toBeInTheDocument());

    expect(screen.getByText('1,67%')).toBeInTheDocument();
    expect(screen.queryByText('1.67%')).not.toBeInTheDocument();
  });
});

describe('AssetsAmortizationPanel — plan total vs. previouslyDepreciatedAmt (ETP-5414)', () => {
  it('does NOT mark the total red when lines correctly sum to (depreciationAmt - previouslyDepreciatedAmt)', async () => {
    // QA's exact repro: 2000 total to amortize, 200 already amortized before this
    // plan existed -> lines only need to cover the remaining 1800.
    global.fetch = mockFetchReturning([
      { id: 'line-1', sEQNoAsset: 1, amortizationAmount: 900, 'amortization$_identifier': 'Period 1' },
      { id: 'line-2', sEQNoAsset: 2, amortizationAmount: 900, 'amortization$_identifier': 'Period 2' },
    ]);

    const { container } = renderInRouter(
      <AssetsAmortizationPanel
        {...BASE_PROPS}
        data={{ id: 'asset-1', depreciationAmt: 2000, previouslyDepreciatedAmt: 200 }}
      />,
    );
    await waitFor(() => expect(screen.getByText('Period 1')).toBeInTheDocument());

    const totalCell = container.querySelector('tfoot td:nth-child(4)');
    expect(totalCell).not.toBeNull();
    expect(totalCell.className).not.toContain('text-destructive');
    expect(totalCell.className).toContain('text-foreground');
  });

  it('still marks the total red when lines do NOT sum to (depreciationAmt - previouslyDepreciatedAmt)', async () => {
    // Same depreciationAmt/previouslyDepreciatedAmt as above, but lines sum to
    // 1700 instead of the expected 1800 — a genuine mismatch must still be caught.
    global.fetch = mockFetchReturning([
      { id: 'line-1', sEQNoAsset: 1, amortizationAmount: 900, 'amortization$_identifier': 'Period 1' },
      { id: 'line-2', sEQNoAsset: 2, amortizationAmount: 800, 'amortization$_identifier': 'Period 2' },
    ]);

    const { container } = renderInRouter(
      <AssetsAmortizationPanel
        {...BASE_PROPS}
        data={{ id: 'asset-1', depreciationAmt: 2000, previouslyDepreciatedAmt: 200 }}
      />,
    );
    await waitFor(() => expect(screen.getByText('Period 1')).toBeInTheDocument());

    const totalCell = container.querySelector('tfoot td:nth-child(4)');
    expect(totalCell.className).toContain('text-destructive');
  });

  it('treats a missing previouslyDepreciatedAmt as 0 (compares against the full depreciationAmt)', async () => {
    global.fetch = mockFetchReturning([
      { id: 'line-1', sEQNoAsset: 1, amortizationAmount: 1000, 'amortization$_identifier': 'Period 1' },
      { id: 'line-2', sEQNoAsset: 2, amortizationAmount: 1000, 'amortization$_identifier': 'Period 2' },
    ]);

    const { container } = renderInRouter(
      <AssetsAmortizationPanel
        {...BASE_PROPS}
        data={{ id: 'asset-1', depreciationAmt: 2000 }}
      />,
    );
    await waitFor(() => expect(screen.getByText('Period 1')).toBeInTheDocument());

    const totalCell = container.querySelector('tfoot td:nth-child(4)');
    expect(totalCell.className).not.toContain('text-destructive');
  });

  it('marks the total red when a plan without previouslyDepreciatedAmt does not sum to the full depreciationAmt', async () => {
    global.fetch = mockFetchReturning([
      { id: 'line-1', sEQNoAsset: 1, amortizationAmount: 1000, 'amortization$_identifier': 'Period 1' },
      { id: 'line-2', sEQNoAsset: 2, amortizationAmount: 500, 'amortization$_identifier': 'Period 2' },
    ]);

    const { container } = renderInRouter(
      <AssetsAmortizationPanel
        {...BASE_PROPS}
        data={{ id: 'asset-1', depreciationAmt: 2000 }}
      />,
    );
    await waitFor(() => expect(screen.getByText('Period 1')).toBeInTheDocument());

    const totalCell = container.querySelector('tfoot td:nth-child(4)');
    expect(totalCell.className).toContain('text-destructive');
  });

  it('never marks the total red when depreciationAmt itself is absent (no expected value to compare)', async () => {
    global.fetch = mockFetchReturning([
      { id: 'line-1', sEQNoAsset: 1, amortizationAmount: 1000, 'amortization$_identifier': 'Period 1' },
    ]);

    const { container } = renderInRouter(
      <AssetsAmortizationPanel {...BASE_PROPS} data={{ id: 'asset-1' }} />,
    );
    await waitFor(() => expect(screen.getByText('Period 1')).toBeInTheDocument());

    const totalCell = container.querySelector('tfoot td:nth-child(4)');
    expect(totalCell.className).not.toContain('text-destructive');
  });
});
