/**
 * ReconciliationListTab — refresh affordances (ETP-4921).
 *
 * This tab draws its own toolbar and table instead of going through ListView, so it inherited
 * neither ListView's refresh button nor ListView's refresh progress bar. Both were added back
 * explicitly; this spec locks the two things that can silently regress: the button is wired to
 * the parent's `onRefresh` (the rows are a prop — this tab never fetches), and the bar appears
 * only once rows are already on screen, since the table's own skeleton covers the first fetch.
 *
 * The heavy toolbar children get their own suites; they are stubbed here so the assertions stay
 * on this component's wiring. RefreshButton and ListProgressBar are deliberately NOT stubbed —
 * they are the subject.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  // useClientSort (the real one, kept unstubbed) reads the active locale for its collator.
  useLocaleSwitch: () => ({ locale: 'es_ES', setLocale: vi.fn() }),
}));

const navigateMock = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('@/components/ui/date-range-popover', () => ({
  DateRangePopover: () => <div data-testid="stub-date-range" />,
}));

vi.mock('@/components/contract-ui/AdvancedFilterButton.jsx', () => ({
  AdvancedFilterButton: () => <div data-testid="stub-advanced-filter" />,
}));

vi.mock('@/components/contract-ui/ListSortPopover.jsx', () => ({
  ListSortPopover: () => <div data-testid="stub-sort-popover" />,
}));

vi.mock('../ReconciliationListTable.jsx', () => ({
  ReconciliationListTable: ({ reconciliations, loading }) => (
    <div
      data-testid="stub-table"
      data-len={reconciliations.length}
      data-loading={loading ? 'true' : 'false'}
    />
  ),
  buildReconciliationSortAccessors: () => ({}),
  buildReconciliationSortColumns: () => [],
}));

import { ReconciliationListTab } from '../index.jsx';
import { todayCalendarISO } from '@/lib/dateOnly.js';

// `transactionDate` today so the toolbar's default last-30 window keeps both rows visible.
// Must be the LOCAL calendar day, not `toISOString()`'s UTC one: the toolbar's range bounds are
// local-time Dates, so west of UTC (UTC-3) this rolled the rows a day into the future from ~21:00
// local onward and the filter dropped them both — a suite that passed all day and failed at night.
function today() {
  return todayCalendarISO();
}

const ROWS = [
  { id: 'r1', documentNo: 'REC-001', transactionDate: today(), documentStatus: 'CO', posted: 'Y' },
  { id: 'r2', documentNo: 'REC-002', transactionDate: today(), documentStatus: 'DR', posted: 'N' },
];

function renderTab(props = {}) {
  return render(
    <ReconciliationListTab
      account={{ id: 'acc-1', currencyIso: 'EUR' }}
      reconciliations={ROWS}
      loading={false}
      onRefresh={vi.fn()}
      {...props}
    />,
  );
}

beforeEach(() => {
  navigateMock.mockClear();
});

describe('ReconciliationListTab — refresh button', () => {
  it('renders the shared refresh control in the toolbar', () => {
    renderTab();
    expect(screen.getByTestId('finance-refresh-button')).toBeInTheDocument();
  });

  it('labels it from useUI("refresh") rather than a hardcoded string', () => {
    renderTab();
    expect(screen.getByTestId('finance-refresh-button')).toHaveAttribute('aria-label', 'refresh');
  });

  it('delegates the reload to the parent (this tab never fetches its own rows)', () => {
    const onRefresh = vi.fn();
    renderTab({ onRefresh });
    fireEvent.click(screen.getByTestId('finance-refresh-button'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});

describe('ReconciliationListTab — refresh progress bar', () => {
  it('shows the bar while refreshing over rows already on screen', () => {
    renderTab({ loading: true });
    expect(screen.getByTestId('reconciliation-list-progress-bar')).toBeInTheDocument();
  });

  it('keeps the rows mounted underneath the bar (smooth refresh, not a remount)', () => {
    renderTab({ loading: true });
    expect(screen.getByTestId('reconciliation-list-progress-bar')).toBeInTheDocument();
    expect(screen.getByTestId('stub-table')).toHaveAttribute('data-len', '2');
  });

  it('hides the bar on the very first fetch, where the table skeleton is the indicator', () => {
    renderTab({ loading: true, reconciliations: [] });
    expect(screen.queryByTestId('reconciliation-list-progress-bar')).not.toBeInTheDocument();
    expect(screen.getByTestId('stub-table')).toHaveAttribute('data-loading', 'true');
  });

  it('hides the bar once the fetch settles', () => {
    renderTab({ loading: false });
    expect(screen.queryByTestId('reconciliation-list-progress-bar')).not.toBeInTheDocument();
  });

  it('uses its own testid so it never collides with another tab bar', () => {
    renderTab({ loading: true });
    expect(screen.queryByTestId('list-progress-bar')).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBe(
      screen.getByTestId('reconciliation-list-progress-bar'),
    );
  });
});
