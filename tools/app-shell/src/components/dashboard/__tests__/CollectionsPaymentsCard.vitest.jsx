import { render, screen } from '@testing-library/react';

// Mock i18n
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'es' }),
}));

// Mock number formatter — produce a recognisable string we can assert on.
vi.mock('@/lib/dashboardNumberFormat.js', () => ({
  formatDashboardAmount: (val, currency) => `${val}|${currency}`,
  localeFromUi: (locale) => locale,
}));

// Mock navigation helpers. `resolveDashboardNavigation` returns null so the
// component falls back to its hardcoded `/sales-invoice?filter=pending` /
// `/purchase-invoice?filter=pending` defaults — that fallback is what we
// verify in the populated state. ETP-5012: this card shows the TOTAL
// pending balance (any due date), so it must drill down into 'pending',
// not the now date-restricted 'overdue' filter.
vi.mock('@/lib/dashboardNavigation.js', () => ({
  createDashboardNavigation: (args) => args,
  resolveDashboardNavigation: () => null,
}));

// react-router-dom: keep <Link> as a plain <a> so the rendered DOM has hrefs.
vi.mock('react-router-dom', () => ({
  Link: ({ to, children, ...rest }) => (
    <a href={typeof to === 'string' ? to : '#'} {...rest}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
}));

import { CollectionsPaymentsCard } from '../CollectionsPaymentsCard.jsx';

describe('CollectionsPaymentsCard', () => {
  it('renders the header title from useUI', () => {
    render(<CollectionsPaymentsCard pendingAmounts={{}} currencyLabel="EUR" />);
    expect(screen.getByText('collectionsPaymentsTitle')).toBeInTheDocument();
  });

  it('shows empty-state title and subtitle when both counts are zero', () => {
    render(
      <CollectionsPaymentsCard
        pendingAmounts={{ toCollect: { count: 0, amount: 0 }, toPay: { count: 0, amount: 0 } }}
        currencyLabel="EUR"
      />,
    );
    expect(screen.getByText('collectionsPaymentsEmptyTitle')).toBeInTheDocument();
    expect(screen.getByText('collectionsPaymentsEmptySubtitle')).toBeInTheDocument();
  });

  it('shows empty state when pendingAmounts is missing entirely (defaults to zeros)', () => {
    render(<CollectionsPaymentsCard />);
    expect(screen.getByText('collectionsPaymentsEmptyTitle')).toBeInTheDocument();
  });

  it('renders toCollect and toPay labels in populated state', () => {
    render(
      <CollectionsPaymentsCard
        pendingAmounts={{
          toCollect: { count: 3, amount: 100 },
          toPay: { count: 2, amount: 50 },
        }}
        currencyLabel="EUR"
      />,
    );
    expect(screen.getByText('toCollectLabel')).toBeInTheDocument();
    expect(screen.getByText('toPayLabel')).toBeInTheDocument();
  });

  it('renders count badges with the right values', () => {
    render(
      <CollectionsPaymentsCard
        pendingAmounts={{
          toCollect: { count: 3, amount: 100 },
          toPay: { count: 7, amount: 50 },
        }}
        currencyLabel="EUR"
      />,
    );
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('formats amounts via formatDashboardAmount with the currencyLabel', () => {
    render(
      <CollectionsPaymentsCard
        pendingAmounts={{
          toCollect: { count: 1, amount: 100 },
          toPay: { count: 1, amount: 50 },
        }}
        currencyLabel="EUR"
      />,
    );
    expect(screen.getByText('100|EUR')).toBeInTheDocument();
    expect(screen.getByText('50|EUR')).toBeInTheDocument();
  });

  it('renders two links pointing to the fallback pending list URLs', () => {
    const { container } = render(
      <CollectionsPaymentsCard
        pendingAmounts={{
          toCollect: { count: 1, amount: 100 },
          toPay: { count: 1, amount: 50 },
        }}
        currencyLabel="EUR"
      />,
    );
    const anchors = container.querySelectorAll('a');
    const hrefs = Array.from(anchors).map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/sales-invoice?filter=pending');
    expect(hrefs).toContain('/purchase-invoice?filter=pending');
  });
});
