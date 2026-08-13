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
  StatusPill: ({ estado }) => <span data-testid="status-pill">{estado}</span>,
  NumFactura: ({ n }) => <span>{n}</span>,
  ScrollSentinel: () => null,
  isErrorStatus: () => false,
  isPendingStatus: () => false,
  fmtDate: (d) => d ?? '',
  PAGE_SIZE: 20,
  ExportIcon: () => <span>export</span>,
  useFmSelection: () => ({
    selectedIds: stableSelectedIds,
    setSelectedIds: stableSetSelectedIds,
    handleToggleAll: stableToggleAll,
    handleToggleRow: stableToggleRow,
  }),
}));
vi.mock('../useFiscalMonitor.js', () => ({
  SII_SPEC: 'sii-monitor',
  SII_EMITIDAS_ENTITY: 'issuedInvoices',
  SII_RECIBIDAS_ENTITY: 'receivedInvoices',
  SII_EMITIDAS_ANT_ENTITY: 'issuedInvoices(previousPeriod)',
  SII_RECIBIDAS_ANT_ENTITY: 'receivedInvoices(previousPeriod)',
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SiiMonitorSection from '../SiiMonitorSection.jsx';

const baseProps = {
  orgId: 'org-1',
  apiBaseUrl: '/sws/neo/sii-monitor',
  parentId: 'parent-1',
  kpis: { sii: { issued: 3, received: 2, issuedPrevious: 1, receivedPrevious: 0 } },
};

describe('SiiMonitorSection', () => {
  beforeEach(() => vi.clearAllMocks());

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

  it('shows period toggle pills in standard mode', () => {
    render(<SiiMonitorSection {...baseProps} mockRows={[]} />);
    expect(screen.getByTestId('fm-period-toggle')).toBeInTheDocument();
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
