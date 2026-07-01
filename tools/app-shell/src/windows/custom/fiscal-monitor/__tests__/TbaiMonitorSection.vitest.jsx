// Vitest render tests for TbaiMonitorSection

const stableApiFetch = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ response: { data: [], totalRows: 0 } }) }));
const stableSetSelectedIds = vi.fn();

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => stableApiFetch }));
vi.mock('@/components/related-documents/helpers.js', () => ({ neoBase: (u) => u }));
vi.mock('lucide-react', () => ({}));
vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, onChange }) => <input type="checkbox" checked={!!checked} onChange={onChange ?? (() => {})} />,
}));
vi.mock('../FmPrimitives.jsx', () => ({
  StatusPill: ({ estado }) => <span data-testid="status-pill">{estado}</span>,
  NumFactura: ({ n }) => <span>{n}</span>,
  ScrollSentinel: () => null,
  isErrorStatus: () => false,
  isPendingStatus: () => false,
  fmtDate: (d) => d ?? '',
  PAGE_SIZE: 20,
  ExportIcon: () => <span>export</span>,
  useFmSelection: () => ({
    selectedIds: new Set(),
    setSelectedIds: stableSetSelectedIds,
    allSelected: false,
    someSelected: false,
    handleToggleAll: vi.fn(),
    handleToggleRow: vi.fn(),
  }),
}));
vi.mock('../useFiscalMonitor.js', () => ({
  TBAI_SPEC: 'tbai-facturas-enviadas',
  TBAI_ENTITY: 'header',
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TbaiMonitorSection from '../TbaiMonitorSection.jsx';

const baseProps = {
  orgId: 'org-1',
  apiBaseUrl: '/sws/neo/tbai',
  kpis: { tbai: { total: 10, received: 7, rejected: 2, error: 1 } },
};

describe('TbaiMonitorSection', () => {
  beforeEach(() => vi.clearAllMocks());

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
