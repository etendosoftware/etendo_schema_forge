// ETP-5229 #14 — TBAI monitor "Direction" column.
//
// The `sincronización` entity links to C_Invoice via FK `invoice` with NO
// issotrx filter, so a sales and a purchase invoice can share the same
// documentno. isSalesRow(row) reads row.issotrx ?? row['invoice$issotrx']
// (companion field NEO already projects for the invoice FK, same pattern as
// row.invoiceDate / row['invoice$_identifier'] / row['invoice$description']
// consumed elsewhere in this file) to render a distinct badge per row and to
// route "open invoice" clicks to the correct spec (sales-invoice vs
// purchase-invoice).
//
// Rows are delivered through the normal list fetch (apiFetch), NOT the
// `mockRows` prop: the section's "reset on filter change" effect runs right
// after the list effect and clears `rows` before the synchronous mockRows
// branch can survive to render (documented in
// TbaiMonitorSection.selectedRow.vitest.jsx, same root cause here).
//
// Isolated from TbaiMonitorSection.vitest.jsx (whose FmPrimitives mock stubs
// isPendingStatus to always return false, which would make the pending-status
// invoice-open assertions here vacuous) — this file mocks isPendingStatus to
// mirror the real "estado === 'Pendiente'" contract instead.

// Rows served by the mocked apiFetch below — set per-test before render().
let currentRows = [];

// Stable function reference — the list-fetch effect lists `apiFetch` in its
// dependency array, so a fresh vi.fn() per render would re-run the effect →
// setState → re-render forever (same convention as the sibling suites).
const stableApiFetch = vi.fn(() => Promise.resolve({
  ok: true,
  json: async () => ({ response: { data: currentRows, totalRows: currentRows.length } }),
}));
// Same stability requirement as apiFetch above: the filter-reset effect lists
// setSelectedIds in its dependency array.
const stableSetSelectedIds = vi.fn();

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => stableApiFetch }));
vi.mock('@/components/related-documents/helpers.js', () => ({ neoBase: (u) => u }));
vi.mock('lucide-react', () => ({}));
vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, onChange }) => <input type="checkbox" checked={!!checked} onChange={onChange ?? (() => {})} />,
}));
vi.mock('../FmPrimitives.jsx', () => ({
  StatusPill: ({ estado, onClick }) => (
    <span data-testid="status-pill" onClick={onClick}>{estado}</span>
  ),
  NumFactura: ({ n, onOpen }) => <span data-testid="num-factura" onClick={onOpen}>{n}</span>,
  ScrollSentinel: () => null,
  isErrorStatus: (estado) => estado === 'Rechazado' || estado === 'Error',
  isPendingStatus: (estado) => estado === 'Pendiente',
  fmtDate: (d) => d ?? '',
  PAGE_SIZE: 20,
  ExportIcon: () => <span>export</span>,
  fetchCsvAndDownload: vi.fn(),
  useFmSelection: () => ({
    selectedIds: new Set(),
    setSelectedIds: stableSetSelectedIds,
    allSelected: false,
    someSelected: false,
    handleToggleAll: vi.fn(),
    handleToggleRow: vi.fn(),
  }),
  selectedRowClassName: () => undefined,
}));
vi.mock('../useFiscalMonitor.js', () => ({
  TBAI_SPEC: 'tbai-facturas-enviadas',
  TBAI_ENTITY: 'sincronización',
  buildCutoverCriteria: () => [],
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TbaiMonitorSection from '../TbaiMonitorSection.jsx';

const baseProps = {
  orgId: 'org-1',
  apiBaseUrl: '/sws/neo/tbai',
  kpis: { tbai: { total: 2, received: 0, rejected: 0, error: 0 } },
};

beforeEach(() => {
  currentRows = [];
  vi.clearAllMocks();
});

async function renderWithRows(rows, extraProps = {}) {
  currentRows = rows;
  const view = render(<TbaiMonitorSection {...baseProps} {...extraProps} />);
  if (rows.length > 0) {
    await waitFor(() => expect(screen.queryAllByTestId('tbai-direction-badge').length).toBe(rows.length));
  } else {
    await waitFor(() => expect(screen.getByText('fiscalMonitor.empty')).toBeInTheDocument());
  }
  return view;
}

describe('TbaiMonitorSection — Direction column (ETP-5229 #14)', () => {
  it('shows the "Issued" (sales) badge for a row with issotrx: true', async () => {
    await renderWithRows([
      { id: 't-1', invoice: 'inv-1', invoiceIdentifier: 'FA-1', estado: 'Recibido', issotrx: true },
    ]);
    const badge = screen.getByTestId('tbai-direction-badge');
    expect(badge).toHaveAttribute('data-direction', 'sales');
    expect(badge.textContent).toBe('fiscalMonitor.direction.sales');
  });

  it('shows the "Issued" (sales) badge for a row with issotrx: "Y"', async () => {
    await renderWithRows([
      { id: 't-1', invoice: 'inv-1', invoiceIdentifier: 'FA-1', estado: 'Recibido', issotrx: 'Y' },
    ]);
    expect(screen.getByTestId('tbai-direction-badge')).toHaveAttribute('data-direction', 'sales');
  });

  it('shows the "Received" (purchase) badge for a row with issotrx: false', async () => {
    await renderWithRows([
      { id: 't-1', invoice: 'inv-1', invoiceIdentifier: 'FA-1', estado: 'Recibido', issotrx: false },
    ]);
    const badge = screen.getByTestId('tbai-direction-badge');
    expect(badge).toHaveAttribute('data-direction', 'purchase');
    expect(badge.textContent).toBe('fiscalMonitor.direction.purchase');
  });

  it('shows the "Received" (purchase) badge for a row with issotrx: "N"', async () => {
    await renderWithRows([
      { id: 't-1', invoice: 'inv-1', invoiceIdentifier: 'FA-1', estado: 'Recibido', issotrx: 'N' },
    ]);
    expect(screen.getByTestId('tbai-direction-badge')).toHaveAttribute('data-direction', 'purchase');
  });

  it('defaults to "Received" (purchase) when issotrx is missing entirely', async () => {
    await renderWithRows([
      { id: 't-1', invoice: 'inv-1', invoiceIdentifier: 'FA-1', estado: 'Recibido' },
    ]);
    expect(screen.getByTestId('tbai-direction-badge')).toHaveAttribute('data-direction', 'purchase');
  });

  it('reads issotrx from the invoice$issotrx companion field when the plain field is absent', async () => {
    await renderWithRows([
      { id: 't-1', invoice: 'inv-1', invoiceIdentifier: 'FA-1', estado: 'Recibido', 'invoice$issotrx': 'Y' },
    ]);
    expect(screen.getByTestId('tbai-direction-badge')).toHaveAttribute('data-direction', 'sales');
  });

  it('renders the Direction column header', async () => {
    await renderWithRows([]);
    expect(screen.getByText('fiscalMonitor.col.direction')).toBeInTheDocument();
  });

  it('two rows sharing the SAME invoice number but opposite issotrx render distinct, correct direction labels', async () => {
    // The exact confusion scenario ETP-5229 #14 fixes: sales and purchase
    // invoices have independent documentno sequences and can collide.
    await renderWithRows([
      { id: 't-sales',    invoice: 'inv-sales',    invoiceIdentifier: 'FA-100', estado: 'Recibido', issotrx: 'Y' },
      { id: 't-purchase', invoice: 'inv-purchase', invoiceIdentifier: 'FA-100', estado: 'Recibido', issotrx: 'N' },
    ]);

    const badges = screen.getAllByTestId('tbai-direction-badge');
    expect(badges).toHaveLength(2);
    const directions = badges.map((b) => b.getAttribute('data-direction'));
    expect(directions).toEqual(['sales', 'purchase']);

    // Both rows are distinguishable in the DOM despite the shared doc number:
    // each row still carries its own row-scoped badge with the right direction.
    const rows = screen.getAllByTestId('num-factura').map((el) => el.closest('tr'));
    expect(rows[0].querySelector('[data-testid="tbai-direction-badge"]').getAttribute('data-direction')).toBe('sales');
    expect(rows[1].querySelector('[data-testid="tbai-direction-badge"]').getAttribute('data-direction')).toBe('purchase');
  });

  it('exports the Direction column in the CSV export cols (Sales/Purchase)', async () => {
    // buildTbaiExportCols is not exported; exercised indirectly via
    // fetchCsvAndDownload's captured `cols` argument (mocked above).
    const { fetchCsvAndDownload } = await import('../FmPrimitives.jsx');
    await renderWithRows([
      { id: 't-sales', invoice: 'inv-1', invoiceIdentifier: 'FA-1', estado: 'Recibido', issotrx: 'Y' },
    ]);
    fireEvent.click(screen.getByText('fiscalMonitor.export'));

    await waitFor(() => expect(fetchCsvAndDownload).toHaveBeenCalled());
    const [, , , , cols] = fetchCsvAndDownload.mock.calls[0];
    const directionCol = cols.find((c) => c.label === 'Direction');
    expect(directionCol).toBeDefined();
    expect(directionCol.get({ issotrx: 'Y' })).toBe('Sales');
    expect(directionCol.get({ issotrx: 'N' })).toBe('Purchase');
  });
});

describe('TbaiMonitorSection — pending-status row open uses the correct direction spec hint (ETP-5229 #14)', () => {
  it('clicking a PENDING purchase-invoice row (via the status pill) opens with purchase-invoice, not sales-invoice', async () => {
    const onInvoiceOpen = vi.fn();
    await renderWithRows(
      [{ id: 't-1', invoice: 'inv-purchase', invoiceIdentifier: 'FA-1', estado: 'Pendiente', issotrx: 'N' }],
      { onInvoiceOpen },
    );
    fireEvent.click(screen.getByTestId('status-pill'));
    expect(onInvoiceOpen).toHaveBeenCalledWith('inv-purchase', 'purchase-invoice');
  });

  it('clicking a PENDING sales-invoice row (via the status pill) still opens with sales-invoice', async () => {
    const onInvoiceOpen = vi.fn();
    await renderWithRows(
      [{ id: 't-1', invoice: 'inv-sales', invoiceIdentifier: 'FA-1', estado: 'Pendiente', issotrx: 'Y' }],
      { onInvoiceOpen },
    );
    fireEvent.click(screen.getByTestId('status-pill'));
    expect(onInvoiceOpen).toHaveBeenCalledWith('inv-sales', 'sales-invoice');
  });

  it('clicking the invoice number (NumFactura) of a purchase-invoice row also opens with purchase-invoice', async () => {
    const onInvoiceOpen = vi.fn();
    await renderWithRows(
      [{ id: 't-1', invoice: 'inv-purchase', invoiceIdentifier: 'FA-1', estado: 'Recibido', issotrx: 'N' }],
      { onInvoiceOpen },
    );
    fireEvent.click(screen.getByTestId('num-factura'));
    expect(onInvoiceOpen).toHaveBeenCalledWith('inv-purchase', 'purchase-invoice');
  });
});
