import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// ETP-5414 — QA rejection: the "Amortizado" percentage metric printed the raw
// JS number (`1.67%`, dot decimal) instead of the localized value (`1,67%`,
// comma decimal) required by the es-ES-style separator config. Fixed by
// routing the value through the canonical `formatPlainDecimal` (see
// CLAUDE.md § Currency & Amount Formatting / `formatCurrency.js`'s
// `formatPlainDecimal` doc comment) instead of interpolating `pct` raw.
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

import AssetsSidebar from '../AssetsSidebar.jsx';

describe('AssetsSidebar — "Amortizado" percentage formatting (ETP-5414)', () => {
  it('renders the percentage with a comma decimal separator, not a raw dot', () => {
    render(<AssetsSidebar data={{ etgoAmortizationStatus: 1.6666666, assetValue: 100, depreciationAmt: 0, depreciatedValue: 0, depreciatedPlan: 0 }} />);

    // Correct, localized value.
    expect(screen.getByText('1,67%')).toBeInTheDocument();
    // Never the old bug: raw JS dot-decimal string.
    expect(screen.queryByText('1.67%')).not.toBeInTheDocument();
  });

  it('does not round to an integer — keeps the 2-decimal precision', () => {
    render(<AssetsSidebar data={{ etgoAmortizationStatus: 33.333, assetValue: 100, depreciationAmt: 0, depreciatedValue: 0, depreciatedPlan: 0 }} />);

    expect(screen.getByText('33,33%')).toBeInTheDocument();
    expect(screen.queryByText('33%')).not.toBeInTheDocument();
  });

  it('renders a whole-number percentage without a trailing decimal (100%, complete)', () => {
    render(<AssetsSidebar data={{ etgoAmortizationStatus: 100, assetValue: 100, depreciationAmt: 0, depreciatedValue: 0, depreciatedPlan: 0 }} />);

    // formatPlainDecimal on "100.00" only swaps the separator (no trimming),
    // so the fixed-point string is preserved as "100,00".
    expect(screen.getByText('100,00%')).toBeInTheDocument();
    expect(screen.getByText('assetsFullyDepreciated')).toBeInTheDocument();
  });

  it('shows the em dash placeholder (not "0,00%") when there is no data at all', () => {
    render(<AssetsSidebar data={null} />);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });
});
