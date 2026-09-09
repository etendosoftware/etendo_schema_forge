import { render, screen } from '@testing-library/react';

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

// Mock i18n — ui() returns the key as-is so assertions can target it directly.
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

// Mock dashboardNumberFormat
vi.mock('@/lib/dashboardNumberFormat.js', () => ({
  formatDashboardCompact: (value) => String(value),
  localeFromUi: (locale) => (locale === 'es_ES' ? 'es-ES' : 'en-US'),
}));

import { FinancialSummaryCard } from '../FinancialSummaryCard.jsx';

const POSITIVE_KPIS = [
  { key: 'revenueThisMonth', value: 5000, trend: 10 },
  { key: 'expensesThisMonth', value: 2000, trend: 5 },
  { key: 'netProfit', value: 3000, trend: 20 },
];

const NEGATIVE_KPIS = [
  { key: 'revenueThisMonth', value: 2000, trend: 226 },
  { key: 'expensesThisMonth', value: 5000, trend: 556 },
  { key: 'netProfit', value: -3000, trend: -302 },
];

describe('FinancialSummaryCard', () => {
  it('renders empty state when there are no kpis', () => {
    render(<FinancialSummaryCard kpis={[]} currencyLabel="EUR" />);
    expect(screen.getByText('financialSummaryEmptyTitle')).toBeInTheDocument();
  });

  it('shows the positive headline and Check icon when netProfit >= 0', () => {
    const { container } = render(<FinancialSummaryCard kpis={POSITIVE_KPIS} currencyLabel="EUR" />);
    expect(screen.getByText('financialSummaryPositive')).toBeInTheDocument();
    expect(screen.queryByText('financialSummaryNegative')).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="Check__81e75f"]')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="X__81e75f"]')).not.toBeInTheDocument();
  });

  /**
   * Regression test for ETP-5011: the headline (icon + color + copy) used to be
   * hardcoded to the "positive" state regardless of the real netProfit sign —
   * a client whose expenses exceeded revenue still saw a green checkmark
   * claiming revenue beat expenses.
   */
  it('regression ETP-5011: shows the negative headline and X icon when netProfit < 0', () => {
    const { container } = render(<FinancialSummaryCard kpis={NEGATIVE_KPIS} currencyLabel="EUR" />);
    expect(screen.getByText('financialSummaryNegative')).toBeInTheDocument();
    expect(screen.queryByText('financialSummaryPositive')).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="X__81e75f"]')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="Check__81e75f"]')).not.toBeInTheDocument();
  });

  it('treats a missing netProfit kpi as non-negative (falls back to the positive state)', () => {
    render(<FinancialSummaryCard kpis={[POSITIVE_KPIS[0], POSITIVE_KPIS[1]]} currencyLabel="EUR" />);
    expect(screen.getByText('financialSummaryPositive')).toBeInTheDocument();
  });
});
