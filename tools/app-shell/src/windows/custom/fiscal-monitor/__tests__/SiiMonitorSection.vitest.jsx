// @covers tools/app-shell/src/windows/custom/fiscal-monitor/SiiMonitorSection.jsx
const gridBoundary = await vi.hoisted(async () => (await import('@/test/gridViewTestDoubles.jsx')).createGridBoundary());
vi.mock('@/lib/flags', async () => (await import('@/test/gridViewTestDoubles.jsx')).gridFlagsMock(() => gridBoundary.enabled));
vi.mock('@/hooks/useGridView.js', async () => (await import('@/test/gridViewTestDoubles.jsx')).gridViewHookMock(gridBoundary));
vi.mock('@/components/contract-ui/GridViewControls.jsx', async () => (await import('@/test/gridViewTestDoubles.jsx')).gridViewControlsMock());
import { resetGridBoundary } from '@/test/gridViewTestDoubles.jsx';

// Vitest render tests for SiiMonitorSection

const stableApiFetch = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ response: { data: [], totalRows: 0 } }) }));
const stableSetSelectedIds = vi.fn();
const stableToggleAll = vi.fn();
const stableToggleRow = vi.fn();
const stableSelectedIds = new Set();

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => stableApiFetch }));
vi.mock('@/components/related-documents/helpers.js', () => ({ neoBase: (u) => u }));
vi.mock('@/lib/formatAmount.js', () => ({ formatAmount: (v) => String(v ?? '') }));
vi.mock('lucide-react', () => ({ FileUp: () => null, FileDown: () => null }));
vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, onChange }) => <input type="checkbox" checked={!!checked} onChange={onChange ?? (() => {})} />,
}));
vi.mock('../FmPrimitives.jsx', () => ({
  StatusPill: ({ estado, onClick }) => <button data-testid="status-pill" onClick={onClick}>{estado}</button>,
  NumFactura: ({ n, onOpen }) => <button onClick={onOpen}>{n}</button>,
  ScrollSentinel: () => null,
  isErrorStatus: estado => estado === 'Error',
  isPendingStatus: estado => estado === 'Pendiente',
  fmtDate: (d) => d ?? '',
  PAGE_SIZE: 20,
  ExportIcon: () => <span>export</span>,
  useFmSelection: () => ({
    selectedIds: stableSelectedIds,
    setSelectedIds: stableSetSelectedIds,
    handleToggleAll: stableToggleAll,
    handleToggleRow: stableToggleRow,
  }),
  selectedRowClassName: (selectedIds, id) => (selectedIds.has(id) ? 'fm-row--selected' : undefined),
}));
vi.mock('../useFiscalMonitor.js', () => ({
  SII_SPEC: 'sii-monitor',
  SII_EMITIDAS_ENTITY: 'issuedInvoices',
  SII_RECIBIDAS_ENTITY: 'receivedInvoices',
  SII_EMITIDAS_ANT_ENTITY: 'issuedInvoices(previousPeriod)',
  SII_RECIBIDAS_ANT_ENTITY: 'receivedInvoices(previousPeriod)',
  buildCutoverCriteria,
  SII_DATE_FIELD,
}));

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { buildCutoverCriteria, SII_DATE_FIELD } from './testHelpers/siiCutoverStub.js';
import SiiMonitorSection from '../SiiMonitorSection.jsx';

const baseProps = {
  orgId: 'org-1',
  apiBaseUrl: '/sws/neo/sii-monitor',
  parentId: 'parent-1',
  kpis: { sii: { issued: 3, received: 2, issuedPrevious: 1, receivedPrevious: 0 } },
};

describe('SiiMonitorSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGridBoundary(gridBoundary);
  });

  it('renders with mockRows and shows export button', () => {
    render(<SiiMonitorSection {...baseProps} mockRows={[]} />);
    expect(screen.getByText('fiscalMonitor.export')).toBeInTheDocument();
  });

  it('renders section wrapper by default', () => {
    const { container } = render(<SiiMonitorSection {...baseProps} mockRows={[]} />);
    expect(container.querySelector('.fm-section')).toBeTruthy();
  });

  it('skips section wrapper when noWrap is true', () => {
    const { container } = render(<SiiMonitorSection {...baseProps} mockRows={[]} noWrap />);
    expect(container.querySelector('.fm-section')).toBeNull();
  });

  it('shows issued and received tabs in non-compact mode', () => {
    render(<SiiMonitorSection {...baseProps} mockRows={[]} />);
    expect(screen.getByText('fiscalMonitor.sii.tab.issued')).toBeInTheDocument();
    expect(screen.getByText('fiscalMonitor.sii.tab.received')).toBeInTheDocument();
  });

  it('shows empty state when mockRows is empty', () => {
    render(<SiiMonitorSection {...baseProps} mockRows={[]} />);
    expect(screen.getByText('fiscalMonitor.empty')).toBeInTheDocument();
  });

  it('renders table header columns', () => {
    render(<SiiMonitorSection {...baseProps} mockRows={[]} />);
    expect(screen.getByText('fiscalMonitor.col.date')).toBeInTheDocument();
    expect(screen.getByText('fiscalMonitor.col.invoiceNumber')).toBeInTheDocument();
    expect(screen.getByText('fiscalMonitor.col.status')).toBeInTheDocument();
    expect(screen.getByText('fiscalMonitor.col.csv')).toBeInTheDocument();
  });

  it('calls onTabChange when switching tabs', () => {
    const onTabChange = vi.fn();
    render(<SiiMonitorSection {...baseProps} mockRows={[]} onTabChange={onTabChange} />);
    fireEvent.click(screen.getByText('fiscalMonitor.sii.tab.received'));
    expect(onTabChange).toHaveBeenCalled();
  });

  // ETP-5432: the "Periodo anterior" selector UI is intentionally hidden — see
  // SiiMonitorSection.jsx comments (AEATSII_PRESII_INVOICE doesn't implement a
  // real rolling previous-period window).
  it('does not render a period toggle in standard mode (removed, ETP-5432)', () => {
    render(<SiiMonitorSection {...baseProps} mockRows={[]} />);
    expect(screen.queryByTestId('fm-period-toggle')).not.toBeInTheDocument();
  });

  it('shows compact filter pills when compact=true', () => {
    render(<SiiMonitorSection {...baseProps} mockRows={[]} compact noWrap />);
    const pills = screen.getAllByText('fiscalMonitor.sii.tab.issued');
    expect(pills.length).toBeGreaterThanOrEqual(1);
  });

  it('renders data table testid', () => {
    render(<SiiMonitorSection {...baseProps} mockRows={[]} />);
    expect(screen.getByTestId('fm-data-table')).toBeInTheDocument();
  });

  it('fetches from API when no mockRows and parentId exists', async () => {
    render(<SiiMonitorSection {...baseProps} mockRows={null} />);
    await waitFor(() => {
      expect(stableApiFetch).toHaveBeenCalled();
    });
  });
});


describe('SiiMonitorSection personal columns', () => {
  const row = { id: 'invoice-1', documentNo: 'INV-1', invoiceDate: '2026-01-15',
    businessPartner: 'bp-1', aeatsiiEstado: 'Error', grandTotalAmount: 10 };
  beforeEach(() => {
    resetGridBoundary(gridBoundary);
    stableApiFetch.mockReset().mockResolvedValue({ ok: true, json: async () => ({ response: { data: [row], totalRows: 1 } }) });
    stableToggleRow.mockClear();
  });

  it('keeps all original columns and no personal controls when disabled', async () => {
    render(<SiiMonitorSection {...baseProps} />);
    await screen.findByText('INV-1');
    expect(screen.getAllByRole('columnheader')).toHaveLength(9);
    expect(screen.queryByTestId('grid-view-save')).not.toBeInTheDocument();
    expect(gridBoundary.last.enabled).toBe(false);
  });

  it('keeps fixed selection and status/invoice actions after hiding and moving data columns', async () => {
    gridBoundary.enabled = true;
    gridBoundary.active = true;
    gridBoundary.keys = ['aeatsiiEstado', 'documentNo'];
    gridBoundary.widths = { documentNo: 240 };
    const onInvoiceOpen = vi.fn();
    const onBpClick = vi.fn();
    render(<SiiMonitorSection {...baseProps} onInvoiceOpen={onInvoiceOpen} onBpClick={onBpClick} />);
    await screen.findByText('INV-1');
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader').map(cell => cell.textContent)).toEqual([
      '', 'fiscalMonitor.col.status', 'fiscalMonitor.col.invoiceNumber',
    ]);
    expect(within(table).getAllByRole('columnheader')[2]).toHaveStyle({ width: '240px' });
    const cells = table.querySelectorAll('tbody tr:first-child td');
    expect(cells).toHaveLength(3);
    fireEvent.click(within(cells[0]).getByRole('checkbox'));
    expect(stableToggleRow).toHaveBeenCalledWith('invoice-1');
    fireEvent.click(screen.getByTestId('status-pill'));
    expect(onBpClick).toHaveBeenCalledWith('bp-1', 'invoice-1', 'sales-invoice');
    fireEvent.click(screen.getByText('INV-1'));
    expect(onInvoiceOpen).toHaveBeenCalledWith('invoice-1', 'sales-invoice');
    expect(gridBoundary.last).toMatchObject({ spec: 'sii-monitor', entity: 'issuedInvoices', enabled: true });
    fireEvent.click(screen.getByText('fiscalMonitor.sii.tab.received'));
    await waitFor(() => expect(gridBoundary.last.entity).toBe('receivedInvoices'));
    fireEvent.click(await screen.findByText('INV-1'));
    expect(onInvoiceOpen).toHaveBeenLastCalledWith('invoice-1', 'purchase-invoice');
  });

  it('retains all default columns when personal view loading has not succeeded', async () => {
    gridBoundary.enabled = true;
    gridBoundary.active = false;
    gridBoundary.keys = ['documentNo'];
    render(<SiiMonitorSection {...baseProps} />);
    await screen.findByText('INV-1');
    expect(screen.getAllByRole('columnheader')).toHaveLength(9);
    expect(screen.getByText('fiscalMonitor.col.csv')).toBeInTheDocument();
  });
});
