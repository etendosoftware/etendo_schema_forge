import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const navigateMock = vi.fn();
const openCopilotMock = vi.fn();
const telemetryMocks = vi.hoisted(() => ({
  trackDashboardKpi: vi.fn(),
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'es' }),
}));

vi.mock('@/components/CopilotContext', () => ({
  useCopilot: () => ({ open: openCopilotMock }),
}));

vi.mock('@/lib/dashboardNumberFormat.js', () => ({
  formatDashboardAmount: (val, currency) => `${val}|${currency}`,
  localeFromUi: (locale) => locale,
}));

vi.mock('@/lib/dashboardNavigation.js', () => ({
  resolveDashboardNavigation: () => null,
}));

vi.mock('@/lib/dashboardKpiTelemetry.js', () => ({
  DASHBOARD_KPI_IDS: {
    dashboardToDocument: 'kpi_ux_dashboard_to_document',
  },
  trackDashboardKpi: telemetryMocks.trackDashboardKpi,
}));

vi.mock('react-router-dom', () => ({
  Link: ({ to, children, ...rest }) => (
    <a href={typeof to === 'string' ? to : '#'} {...rest}>{children}</a>
  ),
  useNavigate: () => navigateMock,
}));

import { RecentSalesList } from '../RecentSalesList.jsx';

describe('RecentSalesList', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    openCopilotMock.mockReset();
    telemetryMocks.trackDashboardKpi.mockReset();
  });

  it('renders the header title from useUI', () => {
    render(<RecentSalesList invoices={[]} currencyLabel="EUR" />);
    expect(screen.getByText('recentSalesTitle')).toBeInTheDocument();
  });

  it('shows empty-state title and subtitle when invoices is empty', () => {
    render(<RecentSalesList invoices={[]} currencyLabel="EUR" />);
    expect(screen.getByText('recentSalesEmptyTitle')).toBeInTheDocument();
    expect(screen.getByText('recentSalesEmptySubtitle')).toBeInTheDocument();
  });

  it('renders both empty-state CTAs (Copilot and New sale)', () => {
    render(<RecentSalesList invoices={[]} currencyLabel="EUR" />);
    expect(screen.getByText('createWithCopilot')).toBeInTheDocument();
    expect(screen.getByText('newSale')).toBeInTheDocument();
  });

  it('invokes openCopilot when the Copilot button is clicked', async () => {
    const user = userEvent.setup();
    render(<RecentSalesList invoices={[]} currencyLabel="EUR" />);
    await user.click(screen.getByText('createWithCopilot'));
    expect(openCopilotMock).toHaveBeenCalledTimes(1);
  });

  it('navigates to /sales-invoice/new when the New sale button is clicked', async () => {
    const user = userEvent.setup();
    render(<RecentSalesList invoices={[]} currencyLabel="EUR" />);
    await user.click(screen.getByText('newSale'));
    expect(navigateMock).toHaveBeenCalledWith('/sales-invoice/new');
  });

  it('renders at most 5 rows even when given more invoices', () => {
    const invoices = Array.from({ length: 7 }, (_, i) => ({
      id: `inv-${i}`,
      client: `Client ${i}`,
      documentNo: `DOC-${i}`,
      amount: 100 + i,
    }));
    const { container } = render(<RecentSalesList invoices={invoices} currencyLabel="EUR" />);
    // Each row is an <a> link. We only have row links (header is plain text).
    const anchors = container.querySelectorAll('a');
    expect(anchors.length).toBe(5);
  });

  it('renders client name, document number and formatted amount per row', () => {
    const invoices = [
      { id: 'a', client: 'Acme', documentNo: 'INV-001', amount: 250 },
    ];
    render(<RecentSalesList invoices={invoices} currencyLabel="EUR" />);
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('INV-001')).toBeInTheDocument();
    expect(screen.getByText('250|EUR')).toBeInTheDocument();
  });

  it('falls back to "—" when no document number is present', () => {
    const invoices = [{ id: 'a', client: 'NoDocClient', amount: 0 }];
    render(<RecentSalesList invoices={invoices} currencyLabel="EUR" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('resolves documentNo from document_no when documentNo is absent', () => {
    const invoices = [{ id: 'a', client: 'C', document_no: 'SNAKE-1', amount: 0 }];
    render(<RecentSalesList invoices={invoices} currencyLabel="EUR" />);
    expect(screen.getByText('SNAKE-1')).toBeInTheDocument();
  });

  it('resolves documentNo from docNo as the last fallback', () => {
    const invoices = [{ id: 'a', client: 'C', docNo: 'CAMEL-1', amount: 0 }];
    render(<RecentSalesList invoices={invoices} currencyLabel="EUR" />);
    expect(screen.getByText('CAMEL-1')).toBeInTheDocument();
  });

  it('links each row to /sales-invoice/<id> when navigation cannot be resolved', () => {
    const invoices = [{ id: 'abc123', client: 'X', documentNo: 'D-1', amount: 0 }];
    const { container } = render(<RecentSalesList invoices={invoices} currencyLabel="EUR" />);
    const anchor = container.querySelector('a');
    expect(anchor?.getAttribute('href')).toBe('/sales-invoice/abc123');
  });

  it('tracks dashboard document navigation without record identifiers', async () => {
    const user = userEvent.setup();
    const invoices = [{ id: 'abc123', client: 'X', documentNo: 'D-1', amount: 0 }];

    render(<RecentSalesList invoices={invoices} currencyLabel="EUR" />);
    await user.click(screen.getByTestId('recent-sales-item-abc123'));

    expect(telemetryMocks.trackDashboardKpi).toHaveBeenCalledWith('dashboard_document_opened', {
      kpiId: 'kpi_ux_dashboard_to_document',
      entityType: 'sales_invoice',
      source: 'dashboard_recent_sales',
    });
  });

  it('falls back to /sales-invoice when invoice has no id and no navigation', () => {
    const invoices = [{ client: 'X', documentNo: 'D-1', amount: 0 }];
    const { container } = render(<RecentSalesList invoices={invoices} currencyLabel="EUR" />);
    const anchor = container.querySelector('a');
    expect(anchor?.getAttribute('href')).toBe('/sales-invoice');
  });

  // ETP-5367 — regression coverage for the column-alignment fix.
  describe('column alignment (ETP-5367 regression)', () => {
    const FIXED_GRID = 'minmax(0, 1fr) 96px 112px 28px';

    it('gives every row the same fixed gridTemplateColumns regardless of client-name length', () => {
      const invoices = [
        { id: 'short', client: 'A', documentNo: 'DOC-1', amount: 10 },
        {
          id: 'long',
          client: 'A Very Long Client Name That Would Have Pushed Things Before The Fix',
          documentNo: 'DOC-2',
          amount: 20,
        },
      ];
      render(<RecentSalesList invoices={invoices} currencyLabel="EUR" />);

      const shortRow = screen.getByTestId('recent-sales-item-short');
      const longRow = screen.getByTestId('recent-sales-item-long');

      expect(shortRow.style.gridTemplateColumns).toBe(FIXED_GRID);
      expect(longRow.style.gridTemplateColumns).toBe(FIXED_GRID);
      expect(shortRow.style.gridTemplateColumns).toBe(longRow.style.gridTemplateColumns);
      expect(shortRow.style.display).toBe('grid');
      expect(longRow.style.display).toBe('grid');
    });

    it('declares the doc-number and amount tracks as fixed pixel widths (not shrink-to-content)', () => {
      const invoices = [{ id: 'a', client: 'Acme', documentNo: 'DOC-1', amount: 10 }];
      render(<RecentSalesList invoices={invoices} currencyLabel="EUR" />);

      const row = screen.getByTestId('recent-sales-item-a');
      const grid = row.style.gridTemplateColumns;

      expect(grid).toContain('96px');
      expect(grid).toContain('112px');
      expect(grid).toContain('28px');
      expect(grid).not.toContain('flexShrink');
    });

    it('makes the client-name span a block element with ellipsis truncation enabled', () => {
      const client = 'A Very Long Client Name That Would Have Pushed Things Before The Fix';
      const invoices = [{ id: 'a', client, documentNo: 'DOC-1', amount: 10 }];
      render(<RecentSalesList invoices={invoices} currencyLabel="EUR" />);

      const clientSpan = screen.getByText(client);
      expect(clientSpan.tagName).toBe('SPAN');
      expect(clientSpan.style.display).toBe('block');
      expect(clientSpan.style.overflow).toBe('hidden');
      expect(clientSpan.style.textOverflow).toBe('ellipsis');
      expect(clientSpan.style.whiteSpace).toBe('nowrap');
    });

    it('makes the document-number pill span a block element with ellipsis truncation enabled', () => {
      const invoices = [{ id: 'a', client: 'Acme', documentNo: 'DOC-1', amount: 10 }];
      render(<RecentSalesList invoices={invoices} currencyLabel="EUR" />);

      const docSpan = screen.getByText('DOC-1');
      expect(docSpan.tagName).toBe('SPAN');
      expect(docSpan.style.display).toBe('block');
      expect(docSpan.style.overflow).toBe('hidden');
      expect(docSpan.style.textOverflow).toBe('ellipsis');
      expect(docSpan.style.whiteSpace).toBe('nowrap');
    });

    it('makes the amount pill span a block element with ellipsis truncation enabled', () => {
      const invoices = [{ id: 'a', client: 'Acme', documentNo: 'DOC-1', amount: 10 }];
      render(<RecentSalesList invoices={invoices} currencyLabel="EUR" />);

      const amountSpan = screen.getByText('10|EUR');
      expect(amountSpan.tagName).toBe('SPAN');
      expect(amountSpan.style.display).toBe('block');
      expect(amountSpan.style.overflow).toBe('hidden');
      expect(amountSpan.style.textOverflow).toBe('ellipsis');
      expect(amountSpan.style.whiteSpace).toBe('nowrap');
    });

    it('keeps the document-number column left-anchored and the amount column right-aligned', () => {
      const invoices = [{ id: 'a', client: 'Acme', documentNo: 'DOC-1', amount: 10 }];
      const { container } = render(<RecentSalesList invoices={invoices} currencyLabel="EUR" />);

      const row = screen.getByTestId('recent-sales-item-a');
      const columnDivs = row.querySelectorAll(':scope > div');
      // Column order: [0] client name, [1] document number, [2] amount.
      expect(columnDivs[1].style.justifyContent).toBe('flex-start');
      expect(columnDivs[2].style.justifyContent).toBe('flex-end');
    });
  });
});
