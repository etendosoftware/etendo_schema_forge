// Vitest render tests for VerifactuMonitorSection

const stableApiFetch = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ response: { data: [], totalRows: 0 } }) }));
const stableSetSelectedIds = vi.fn();

// isErrorStatus and useFmSelection are vi.fn() so tests can override them per-describe
const mockIsErrorStatus = vi.fn(() => false);
const mockUseFmSelection = vi.fn(() => ({
  selectedIds: new Set(),
  setSelectedIds: stableSetSelectedIds,
  allSelected: false,
  someSelected: false,
  handleToggleAll: vi.fn(),
  handleToggleRow: vi.fn(),
}));

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => stableApiFetch }));
vi.mock('@/components/related-documents/helpers.js', () => ({ neoBase: (u) => u }));
vi.mock('lucide-react', () => ({}));
vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, onChange }) => <input type="checkbox" checked={!!checked} onChange={onChange ?? (() => {})} />,
}));
vi.mock('../FmPrimitives.jsx', () => ({
  StatusPill: ({ estado, onClick }) => <span data-testid="status-pill" onClick={onClick}>{estado}</span>,
  NumFactura: ({ n }) => <span>{n}</span>,
  ScrollSentinel: () => null,
  isErrorStatus: (...args) => mockIsErrorStatus(...args),
  PAGE_SIZE: 20,
  ExportIcon: () => <span>export</span>,
  useFmSelection: (...args) => mockUseFmSelection(...args),
}));
vi.mock('../useFiscalMonitor.js', () => ({
  VF_SPEC: 'monitor-verifactu',
  VF_ACEPTADAS_ENTITY: 'facturasAceptadas',
  VF_PARCIAL_ENTITY: 'facturasParcialmenteAceptadas',
  VF_RECHAZADAS_ENTITY: 'facturasRechazadas',
  VF_INVALIDAS_ENTITY: 'facturasInvalidas',
}));

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import VerifactuMonitorSection from '../VerifactuMonitorSection.jsx';

const baseProps = {
  orgId: 'org-1',
  apiBaseUrl: '/sws/neo/verifactu',
  kpis: { verifactu: { accepted: 5, partiallyAccepted: 1, rejected: 2, invalid: 0 } },
};

describe('VerifactuMonitorSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsErrorStatus.mockReturnValue(false);
    mockUseFmSelection.mockReturnValue({
      selectedIds: new Set(),
      setSelectedIds: stableSetSelectedIds,
      allSelected: false,
      someSelected: false,
      handleToggleAll: vi.fn(),
      handleToggleRow: vi.fn(),
    });
  });

  it('renders without crashing with mockRows', () => {
    render(<VerifactuMonitorSection {...baseProps} mockRows={[]} />);
    expect(screen.getByText('fiscalMonitor.export')).toBeInTheDocument();
  });

  it('renders section wrapper by default', () => {
    const { container } = render(<VerifactuMonitorSection {...baseProps} mockRows={[]} />);
    expect(container.querySelector('.fm-section')).toBeTruthy();
  });

  it('skips section wrapper when noWrap is true', () => {
    const { container } = render(<VerifactuMonitorSection {...baseProps} mockRows={[]} noWrap />);
    expect(container.querySelector('.fm-section')).toBeNull();
  });

  it('shows correct and problems filter pills', () => {
    render(<VerifactuMonitorSection {...baseProps} mockRows={[]} />);
    expect(screen.getByText('fiscalMonitor.verifactu.pill.correct')).toBeInTheDocument();
    expect(screen.getByText('fiscalMonitor.verifactu.pill.problems')).toBeInTheDocument();
  });

  it('shows empty state when mockRows is empty', () => {
    render(<VerifactuMonitorSection {...baseProps} mockRows={[]} />);
    expect(screen.getByText('fiscalMonitor.empty')).toBeInTheDocument();
  });

  it('renders table column headers', () => {
    render(<VerifactuMonitorSection {...baseProps} mockRows={[]} />);
    expect(screen.getByText('fiscalMonitor.col.invoiceNumber')).toBeInTheDocument();
    expect(screen.getByText('fiscalMonitor.col.operationType')).toBeInTheDocument();
    expect(screen.getByText('fiscalMonitor.col.csv')).toBeInTheDocument();
    expect(screen.getByText('fiscalMonitor.col.status')).toBeInTheDocument();
    expect(screen.getByText('fiscalMonitor.col.errorReason')).toBeInTheDocument();
  });

  it('calls onTabChange when switching filter', () => {
    const onTabChange = vi.fn();
    render(<VerifactuMonitorSection {...baseProps} mockRows={[]} onTabChange={onTabChange} />);
    fireEvent.click(screen.getByText('fiscalMonitor.verifactu.pill.problems'));
    expect(onTabChange).toHaveBeenCalledWith('problems');
  });

  it('shows pill counts from kpis', () => {
    render(<VerifactuMonitorSection {...baseProps} mockRows={[]} />);
    // correct=5, problems=1+2+0=3
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('fetches from API when no mockRows and orgId exists', async () => {
    render(<VerifactuMonitorSection {...baseProps} mockRows={null} />);
    await waitFor(() => {
      expect(stableApiFetch).toHaveBeenCalled();
    });
  });

  it('renders verifactu-tablecard testid when wrapped', () => {
    render(<VerifactuMonitorSection {...baseProps} mockRows={[]} />);
    expect(screen.getByTestId('verifactu-tablecard')).toBeInTheDocument();
  });

  it('accepts legacy initialTab="accepted" mapping to correct', () => {
    render(<VerifactuMonitorSection {...baseProps} mockRows={[]} initialTab="accepted" />);
    const pill = screen.getByText('fiscalMonitor.verifactu.pill.correct').closest('button');
    expect(pill?.className).toContain('active');
  });

  it('renders error message when API fails', async () => {
    stableApiFetch.mockRejectedValueOnce(new Error('HTTP 500'));
    render(<VerifactuMonitorSection {...baseProps} mockRows={null} />);
    await waitFor(() => expect(screen.getByText(/HTTP 500/)).toBeInTheDocument());
  });

  it('fetches correct tab with _org param', async () => {
    render(<VerifactuMonitorSection {...baseProps} mockRows={null} />);
    await waitFor(() => expect(stableApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('_org=org-1'),
    ));
  });

  it('fetches problems tab when switching filter', async () => {
    render(<VerifactuMonitorSection {...baseProps} mockRows={null} />);
    await waitFor(() => expect(stableApiFetch).toHaveBeenCalled());
    stableApiFetch.mockClear();
    fireEvent.click(screen.getByText('fiscalMonitor.verifactu.pill.problems'));
    await waitFor(() => expect(stableApiFetch).toHaveBeenCalled());
  });

  it('does not show resolve button when no rows are selected', () => {
    render(<VerifactuMonitorSection {...baseProps} mockRows={[]} />);
    expect(screen.queryByText('vfSolveError.resolveBtn')).toBeNull();
  });
});

describe('VerifactuMonitorSection — resolve button interactions', () => {
  // Error rows for problems tab. Note: we use the API path (no mockRows) because with
  // mockRows the synchronous data-load effect is overridden by the tab-reset effect in the
  // same React batch. The async API path avoids this race condition.
  const ERROR_ROW   = { id: 'err-1', verifactuSendingStatus: 'IN', 'invoice$documentNo': 'FV-001' };
  const PARTIAL_ROW = { id: 'err-2', verifactuSendingStatus: 'AE', 'invoice$documentNo': 'FV-002' };

  function setupFetch(rows = [ERROR_ROW]) {
    // fetchProblems calls 3 endpoints (partial, rejected, invalid) in Promise.all
    stableApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: rows, totalRows: rows.length } }),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsErrorStatus.mockImplementation((status) => status === 'invalid' || status === 'partiallyAccepted');
    mockUseFmSelection.mockReturnValue({
      selectedIds: new Set(['err-1']),
      setSelectedIds: stableSetSelectedIds,
      allSelected: false,
      someSelected: true,
      handleToggleAll: vi.fn(),
      handleToggleRow: vi.fn(),
    });
    setupFetch();
  });

  it('shows resolve button when an error row is selected on the problems tab', async () => {
    render(<VerifactuMonitorSection {...baseProps} initialTab="problems" />);
    await waitFor(() => expect(screen.getByText(/vfSolveError\.resolveBtn/)).toBeInTheDocument());
  });

  it('calls onVfResolveClick with selected error rows when resolve button is clicked', async () => {
    const onVfResolveClick = vi.fn();
    render(<VerifactuMonitorSection {...baseProps} initialTab="problems" onVfResolveClick={onVfResolveClick} />);
    const btn = await waitFor(() => screen.getByText(/vfSolveError\.resolveBtn/));
    fireEvent.click(btn);
    expect(onVfResolveClick).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'err-1' })]),
    );
  });

  it('resolve button is enabled when all selected errors share the same type (IN)', async () => {
    render(<VerifactuMonitorSection {...baseProps} initialTab="problems" />);
    const btn = await waitFor(() => screen.getByText(/vfSolveError\.resolveBtn/).closest('button'));
    expect(btn).not.toBeDisabled();
  });

  it('resolve button is disabled when mixed error types are selected', async () => {
    // Both rows selected, both are errors but different types (IN vs AE) → mixed → disabled
    mockUseFmSelection.mockReturnValue({
      selectedIds: new Set(['err-1', 'err-2']),
      setSelectedIds: stableSetSelectedIds,
      allSelected: false,
      someSelected: true,
      handleToggleAll: vi.fn(),
      handleToggleRow: vi.fn(),
    });
    setupFetch([ERROR_ROW, PARTIAL_ROW]);
    render(<VerifactuMonitorSection {...baseProps} initialTab="problems" />);
    const btn = await waitFor(() => screen.getByText(/vfSolveError\.resolveBtn/).closest('button'));
    expect(btn).toBeDisabled();
  });
});
