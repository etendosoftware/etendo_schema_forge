// @covers tools/app-shell/src/windows/custom/fiscal-monitor/TbaiMonitorSection.jsx
const gridBoundary = await vi.hoisted(async () => (await import('@/test/gridViewTestDoubles.jsx')).createGridBoundary());
vi.mock('@/lib/flags', async () => (await import('@/test/gridViewTestDoubles.jsx')).gridFlagsMock(() => gridBoundary.enabled));
vi.mock('@/hooks/useGridView.js', async () => (await import('@/test/gridViewTestDoubles.jsx')).gridViewHookMock(gridBoundary));
vi.mock('@/components/contract-ui/GridViewControls.jsx', async () => (await import('@/test/gridViewTestDoubles.jsx')).gridViewControlsMock());
import { resetGridBoundary } from '@/test/gridViewTestDoubles.jsx';

// Vitest render tests for TbaiMonitorSection

const stableApiFetch = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ response: { data: [], totalRows: 0 } }) }));
const stableSetSelectedIds = vi.fn();
const stableToggleAll = vi.fn();
const stableToggleRow = vi.fn();

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => stableApiFetch }));
vi.mock('@/components/related-documents/helpers.js', () => ({ neoBase: (u) => u }));
vi.mock('lucide-react', () => ({}));
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
    selectedIds: new Set(),
    setSelectedIds: stableSetSelectedIds,
    allSelected: false,
    someSelected: false,
    handleToggleAll: stableToggleAll,
    handleToggleRow: stableToggleRow,
  }),
  selectedRowClassName: (selectedIds, id) => (selectedIds.has(id) ? 'fm-row--selected' : undefined),
}));
vi.mock('../useFiscalMonitor.js', () => ({
  TBAI_SPEC: 'tbai-facturas-enviadas',
  TBAI_ENTITY: 'sincronización',
  // ETP-5229 — real implementation stubbed here rather than imported: this
  // suite never passes earliestCutoverDate, so [] (no-op) is always correct.
  buildCutoverCriteria: (cutoverDate) => (cutoverDate
    ? [{ fieldName: 'invoiceDate', operator: 'greaterOrEqual', value: cutoverDate.slice(0, 10) }]
    : []),
}));

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import TbaiMonitorSection from '../TbaiMonitorSection.jsx';

const baseProps = {
  orgId: 'org-1',
  apiBaseUrl: '/sws/neo/tbai',
  kpis: { tbai: { total: 10, received: 7, rejected: 2, error: 1 } },
};

describe('TbaiMonitorSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGridBoundary(gridBoundary);
  });

  it('renders without crashing with mockRows', () => {
    render(<TbaiMonitorSection {...baseProps} mockRows={[]} />);
    expect(screen.getByText('fiscalMonitor.export')).toBeInTheDocument();
  });

  it('renders section wrapper by default', () => {
    const { container } = render(<TbaiMonitorSection {...baseProps} mockRows={[]} />);
    expect(container.querySelector('.fm-section')).toBeTruthy();
  });

  it('skips section wrapper when noWrap is true', () => {
    const { container } = render(<TbaiMonitorSection {...baseProps} mockRows={[]} noWrap />);
    expect(container.querySelector('.fm-section')).toBeNull();
  });

  it('shows all/sent/rejected filter pills in standalone mode', () => {
    render(<TbaiMonitorSection {...baseProps} mockRows={[]} />);
    expect(screen.getByText('fiscalMonitor.tbai.tab.all')).toBeInTheDocument();
    expect(screen.getByText('fiscalMonitor.tbai.pill.sent')).toBeInTheDocument();
    expect(screen.getByText('fiscalMonitor.tbai.pill.rejected')).toBeInTheDocument();
  });

  it('hides "all" pill when noWrap is true (compact mode)', () => {
    render(<TbaiMonitorSection {...baseProps} mockRows={[]} noWrap />);
    expect(screen.queryByText('fiscalMonitor.tbai.tab.all')).toBeNull();
  });

  it('shows empty state when mockRows is empty', () => {
    render(<TbaiMonitorSection {...baseProps} mockRows={[]} />);
    expect(screen.getByText('fiscalMonitor.empty')).toBeInTheDocument();
  });

  it('renders table column headers', () => {
    render(<TbaiMonitorSection {...baseProps} mockRows={[]} />);
    expect(screen.getByText('fiscalMonitor.col.date')).toBeInTheDocument();
    expect(screen.getByText('fiscalMonitor.col.invoiceNumber')).toBeInTheDocument();
    expect(screen.getByText('fiscalMonitor.col.description')).toBeInTheDocument();
    expect(screen.getByText('fiscalMonitor.col.signature')).toBeInTheDocument();
    expect(screen.getByText('fiscalMonitor.col.status')).toBeInTheDocument();
  });

  it('calls onFilterChange when switching filter', () => {
    const onFilterChange = vi.fn();
    render(<TbaiMonitorSection {...baseProps} mockRows={[]} onFilterChange={onFilterChange} />);
    fireEvent.click(screen.getByText('fiscalMonitor.tbai.pill.sent'));
    expect(onFilterChange).toHaveBeenCalledWith('sent');
  });

  it('fetches from API when no mockRows and orgId exists', async () => {
    render(<TbaiMonitorSection {...baseProps} mockRows={null} />);
    await waitFor(() => {
      expect(stableApiFetch).toHaveBeenCalled();
    });
  });

  it('renders fm-data-table testid', () => {
    render(<TbaiMonitorSection {...baseProps} mockRows={[]} />);
    expect(screen.getByTestId('fm-data-table')).toBeInTheDocument();
  });

  it('shows pill counts from kpis', () => {
    render(<TbaiMonitorSection {...baseProps} mockRows={[]} />);
    // total=10, received=7, rejected+error=3
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('fetches from API with organization param', async () => {
    render(<TbaiMonitorSection {...baseProps} mockRows={null} />);
    await waitFor(() => expect(stableApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('organization=org-1'),
    ));
  });

  it('fetches with sent criteria when switching to sent filter', async () => {
    render(<TbaiMonitorSection {...baseProps} mockRows={null} />);
    await waitFor(() => expect(stableApiFetch).toHaveBeenCalled());
    stableApiFetch.mockClear();
    fireEvent.click(screen.getByText('fiscalMonitor.tbai.pill.sent'));
    await waitFor(() => expect(stableApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('criteria='),
    ));
  });

  it('fetches with rejected criteria when switching to rejected filter', async () => {
    render(<TbaiMonitorSection {...baseProps} mockRows={null} />);
    await waitFor(() => expect(stableApiFetch).toHaveBeenCalled());
    stableApiFetch.mockClear();
    fireEvent.click(screen.getByText('fiscalMonitor.tbai.pill.rejected'));
    await waitFor(() => expect(stableApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('criteria='),
    ));
  });

  it('renders tbai-tablecard testid when wrapped', () => {
    render(<TbaiMonitorSection {...baseProps} mockRows={[]} />);
    expect(screen.getByTestId('tbai-tablecard')).toBeInTheDocument();
  });

  it('maps Recibido initial filter to sent tab', () => {
    render(<TbaiMonitorSection {...baseProps} mockRows={[]} initialFilter="Recibido" />);
    const pill = screen.getByText('fiscalMonitor.tbai.pill.sent').closest('button');
    expect(pill?.className).toContain('active');
  });

  it('maps Rechazado initial filter to rejected tab', () => {
    render(<TbaiMonitorSection {...baseProps} mockRows={[]} initialFilter="Rechazado" />);
    const pill = screen.getByText('fiscalMonitor.tbai.pill.rejected').closest('button');
    expect(pill?.className).toContain('active');
  });
});


describe('TbaiMonitorSection personal columns', () => {
  const row = { id: 'sync-1', invoice: 'invoice-1', invoiceDate: '2026-01-15',
    'invoice$_identifier': 'INV-1 - 15-01-2026', salesTransaction: true, estado: 'Error', businessPartner: 'bp-1' };
  beforeEach(() => {
    resetGridBoundary(gridBoundary);
    stableApiFetch.mockReset().mockResolvedValue({ ok: true, json: async () => ({ response: { data: [row], totalRows: 1 } }) });
    stableToggleRow.mockClear();
  });

  it('keeps the default data and fixed selection columns with the flag off', async () => {
    render(<TbaiMonitorSection {...baseProps} />);
    await screen.findByText('INV-1');
    expect(screen.getAllByRole('columnheader')).toHaveLength(8);
    expect(screen.queryByTestId('grid-view-save')).not.toBeInTheDocument();
    expect(gridBoundary.last.enabled).toBe(false);
  });

  it('restores column order and widths while retaining selection, invoice and status actions', async () => {
    gridBoundary.enabled = true;
    gridBoundary.active = true;
    gridBoundary.keys = ['estado', 'invoice'];
    gridBoundary.widths = { estado: 225 };
    const onInvoiceOpen = vi.fn();
    const onErrorClick = vi.fn();
    render(<TbaiMonitorSection {...baseProps} onInvoiceOpen={onInvoiceOpen} onErrorClick={onErrorClick} />);
    await screen.findByText('INV-1');
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader').map(cell => cell.textContent)).toEqual([
      '', 'fiscalMonitor.col.status', 'fiscalMonitor.col.invoiceNumber',
    ]);
    expect(within(table).getAllByRole('columnheader')[1]).toHaveStyle({ width: '225px' });
    const cells = table.querySelectorAll('tbody tr:first-child td');
    expect(cells).toHaveLength(3);
    fireEvent.click(within(cells[0]).getByRole('checkbox'));
    expect(stableToggleRow).toHaveBeenCalledWith('sync-1');
    fireEvent.click(screen.getByTestId('status-pill'));
    expect(onErrorClick).toHaveBeenCalledWith('bp-1', null, 'Error');
    fireEvent.click(screen.getByText('INV-1'));
    expect(onInvoiceOpen).toHaveBeenCalledWith('invoice-1', 'sales-invoice');
    expect(gridBoundary.last).toMatchObject({ spec: 'tbai-facturas-enviadas', entity: 'sincronización', enabled: true });
  });

  it('falls back to all default columns while the view is unavailable', async () => {
    gridBoundary.enabled = true;
    gridBoundary.active = false;
    gridBoundary.keys = ['estado'];
    render(<TbaiMonitorSection {...baseProps} />);
    await screen.findByText('INV-1');
    expect(screen.getAllByRole('columnheader')).toHaveLength(8);
    expect(screen.getByText('fiscalMonitor.col.description')).toBeInTheDocument();
  });
});
