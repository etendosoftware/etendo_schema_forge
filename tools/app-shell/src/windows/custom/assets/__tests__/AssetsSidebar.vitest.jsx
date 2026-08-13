import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// ── Mocks ──
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/hooks/useCurrency', () => ({
  useCurrency: () => 'USD',
}));

vi.mock('@/lib/formatCurrency', () => ({
  formatCurrency: (cur, val) => `${cur} ${val}`,
}));

import AssetsSidebar from '../AssetsSidebar.jsx';

describe('AssetsSidebar', () => {
  it('renders section title', () => {
    render(<AssetsSidebar data={null} />);
    expect(screen.getByText('assetsDepreciationSummary')).toBeInTheDocument();
  });

  it('shows dashes when data is null', () => {
    render(<AssetsSidebar data={null} />);
    const dashes = screen.getAllByText('\u2014');
    // currentValue, residual, planned, depreciated all show dashes
    expect(dashes.length).toBeGreaterThanOrEqual(4);
  });

  it('shows formatted values when data is provided', () => {
    render(
      <AssetsSidebar
        data={{
          assetValue: 10000,
          residualAssetValue: 2000,
          depreciatedPlan: 8000,
          etgoAmortizationStatus: 75,
        }}
      />,
    );
    expect(screen.getByText('USD 10000')).toBeInTheDocument();
    expect(screen.getByText('USD 2000')).toBeInTheDocument();
    expect(screen.getByText('USD 8000')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('shows "still in progress" subtitle when pct < 100', () => {
    render(
      <AssetsSidebar data={{ etgoAmortizationStatus: 50 }} />,
    );
    expect(screen.getByText('assetsStillInProgress')).toBeInTheDocument();
  });

  it('shows "fully depreciated" subtitle when pct is 100', () => {
    render(
      <AssetsSidebar data={{ etgoAmortizationStatus: 100 }} />,
    );
    expect(screen.getByText('assetsFullyDepreciated')).toBeInTheDocument();
  });

  it('shows "still in progress" when pct is 0', () => {
    render(
      <AssetsSidebar data={{ etgoAmortizationStatus: 0 }} />,
    );
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('assetsStillInProgress')).toBeInTheDocument();
  });

  it('renders all metric labels via i18n keys', () => {
    render(<AssetsSidebar data={{ assetValue: 1 }} />);
    expect(screen.getByText('assetsCurrentValue')).toBeInTheDocument();
    expect(screen.getByText('assetsResidualValueLabel')).toBeInTheDocument();
    expect(screen.getByText('assetsPlannedDepreciation')).toBeInTheDocument();
    expect(screen.getByText('assetsDepreciated')).toBeInTheDocument();
  });

  it('renders subtitle labels', () => {
    render(<AssetsSidebar data={{ assetValue: 1 }} />);
    expect(screen.getByText('assetsBookValue')).toBeInTheDocument();
    expect(screen.getByText('assetsTotalScheduled')).toBeInTheDocument();
  });

  it('handles missing numeric fields defaulting to 0', () => {
    render(<AssetsSidebar data={{}} />);
    // Multiple cards show 'USD 0' (assetValue, residual, depreciatedPlan)
    expect(screen.getAllByText('USD 0').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });
});
