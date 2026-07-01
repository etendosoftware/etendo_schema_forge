// Vitest render tests for VfSolveErrorModal

const mockApiFetch = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError   = vi.fn();

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => mockApiFetch }));
vi.mock('sonner', () => ({ toast: { success: (...a) => mockToastSuccess(...a), error: (...a) => mockToastError(...a) } }));
vi.mock('lucide-react', () => ({
  X: () => <span data-testid="icon-x">X</span>,
  Loader2: () => <span data-testid="icon-loader">L</span>,
  AlertTriangle: () => <span data-testid="icon-alert">!</span>,
  ChevronDown: () => <span>▼</span>,
  ChevronUp: () => <span>▲</span>,
}));
vi.mock('../FmPrimitives.jsx', () => ({
  StatusPill: ({ estado }) => <span data-testid="status-pill">{estado}</span>,
}));
vi.mock('../useFiscalMonitor.js', () => ({
  VF_SPEC: 'monitor-verifactu',
  VF_INVALIDAS_ENTITY: 'facturasInvalidas',
  VF_PARCIAL_ENTITY:   'facturasParcialmenteAceptadas',
}));

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import VfSolveErrorModal from '../VfSolveErrorModal.jsx';

const ROW_INVALID  = { id: 'r1', verifactuSendingStatus: 'IN', 'invoice$documentNo': 'FV-001', codeError: 'ERR01', errorReason: 'Bad format' };
const ROW_PARTIAL  = { id: 'r2', verifactuSendingStatus: 'AE', 'invoice$documentNo': 'FV-002' };
const ROW_REJECTED = { id: 'r3', verifactuSendingStatus: 'ER', 'invoice$documentNo': 'FV-003' };

const baseProps = { open: true, onClose: vi.fn(), onResolved: vi.fn(), neoApiBase: '/sws/neo' };

describe('VfSolveErrorModal — guard', () => {
  it('renders nothing when open is false', () => {
    const { container } = render(<VfSolveErrorModal {...baseProps} open={false} rows={[ROW_INVALID]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when rows is empty', () => {
    const { container } = render(<VfSolveErrorModal {...baseProps} rows={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when rows is undefined', () => {
    const { container } = render(<VfSolveErrorModal {...baseProps} rows={undefined} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('VfSolveErrorModal — single invalid row (IN)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the backdrop', () => {
    render(<VfSolveErrorModal {...baseProps} rows={[ROW_INVALID]} />);
    expect(screen.getByTestId('vf-solve-error-backdrop')).toBeInTheDocument();
  });

  it('renders title for invalid status', () => {
    render(<VfSolveErrorModal {...baseProps} rows={[ROW_INVALID]} />);
    expect(screen.getByText('vfSolveError.invalid.title')).toBeInTheDocument();
  });

  it('renders invoice number', () => {
    render(<VfSolveErrorModal {...baseProps} rows={[ROW_INVALID]} />);
    expect(screen.getByText('FV-001')).toBeInTheDocument();
  });

  it('renders invalid StatusPill', () => {
    render(<VfSolveErrorModal {...baseProps} rows={[ROW_INVALID]} />);
    expect(screen.getByTestId('status-pill')).toHaveTextContent('invalid');
  });

  it('renders error detail section when codeError is set', () => {
    render(<VfSolveErrorModal {...baseProps} rows={[ROW_INVALID]} />);
    expect(screen.getByText('[ERR01]')).toBeInTheDocument();
  });

  it('renders errorReason text', () => {
    render(<VfSolveErrorModal {...baseProps} rows={[ROW_INVALID]} />);
    expect(screen.getByText('Bad format')).toBeInTheDocument();
  });

  it('renders action button for invalid status', () => {
    render(<VfSolveErrorModal {...baseProps} rows={[ROW_INVALID]} />);
    expect(screen.getByText('vfSolveError.invalid.action')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<VfSolveErrorModal {...baseProps} rows={[ROW_INVALID]} onClose={onClose} />);
    fireEvent.click(screen.getAllByText('close')[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<VfSolveErrorModal {...baseProps} rows={[ROW_INVALID]} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('vf-solve-error-backdrop'));
    expect(onClose).toHaveBeenCalled();
  });

  it('does not propagate click from inner card to backdrop', () => {
    const onClose = vi.fn();
    const { container } = render(<VfSolveErrorModal {...baseProps} rows={[ROW_INVALID]} onClose={onClose} />);
    // The inner modal card stops propagation — click it directly via its CSS class
    const card = container.querySelector('.fm-config-modal');
    if (card) fireEvent.click(card);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('VfSolveErrorModal — single partial row (AE)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders title for partial status', () => {
    render(<VfSolveErrorModal {...baseProps} rows={[ROW_PARTIAL]} />);
    expect(screen.getByText('vfSolveError.partial.title')).toBeInTheDocument();
  });

  it('renders partiallyAccepted StatusPill', () => {
    render(<VfSolveErrorModal {...baseProps} rows={[ROW_PARTIAL]} />);
    expect(screen.getByTestId('status-pill')).toHaveTextContent('partiallyAccepted');
  });

  it('renders action button for partial status', () => {
    render(<VfSolveErrorModal {...baseProps} rows={[ROW_PARTIAL]} />);
    expect(screen.getByText('vfSolveError.partial.action')).toBeInTheDocument();
  });

  it('skips error detail section when no codeError or errorReason', () => {
    render(<VfSolveErrorModal {...baseProps} rows={[ROW_PARTIAL]} />);
    // AlertTriangle icon only renders when codeError or errorReason is present
    expect(screen.queryByTestId('icon-alert')).toBeNull();
  });
});

describe('VfSolveErrorModal — single rejected row (ER)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders rejected title', () => {
    render(<VfSolveErrorModal {...baseProps} rows={[ROW_REJECTED]} />);
    expect(screen.getByText('vfSolveError.rejected.title')).toBeInTheDocument();
  });

  it('renders rejected StatusPill', () => {
    render(<VfSolveErrorModal {...baseProps} rows={[ROW_REJECTED]} />);
    expect(screen.getByTestId('status-pill')).toHaveTextContent('rejected');
  });

  it('does not render action button for rejected status (canResolve=false)', () => {
    render(<VfSolveErrorModal {...baseProps} rows={[ROW_REJECTED]} />);
    expect(screen.queryByText('vfSolveError.invalid.action')).toBeNull();
    expect(screen.queryByText('vfSolveError.partial.action')).toBeNull();
  });
});

describe('VfSolveErrorModal — invoice number fallback', () => {
  it('falls back to invoice$_identifier split', () => {
    const row = { id: 'r4', verifactuSendingStatus: 'IN', 'invoice$_identifier': 'FV-099 – 2024-01-01' };
    render(<VfSolveErrorModal {...baseProps} rows={[row]} />);
    expect(screen.getByText('FV-099')).toBeInTheDocument();
  });

  it('falls back to em-dash when no invoice field', () => {
    const row = { id: 'r5', verifactuSendingStatus: 'IN' };
    render(<VfSolveErrorModal {...baseProps} rows={[row]} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('VfSolveErrorModal — multi-row', () => {
  const rows = [
    { id: 'r1', verifactuSendingStatus: 'IN', 'invoice$documentNo': 'FV-001' },
    { id: 'r2', verifactuSendingStatus: 'IN', 'invoice$documentNo': 'FV-002' },
  ];

  it('renders multi title for invalid', () => {
    render(<VfSolveErrorModal {...baseProps} rows={rows} />);
    expect(screen.getByText('vfSolveError.invalid.titleMulti')).toBeInTheDocument();
  });

  it('renders invoice count badge', () => {
    render(<VfSolveErrorModal {...baseProps} rows={rows} />);
    expect(screen.getByText(/vfSolveError\.invoicesSelected/)).toBeInTheDocument();
  });

  it('renders all invoice numbers', () => {
    render(<VfSolveErrorModal {...baseProps} rows={rows} />);
    expect(screen.getByText('FV-001')).toBeInTheDocument();
    expect(screen.getByText('FV-002')).toBeInTheDocument();
  });
});

describe('VfSolveErrorModal — handleResolve (invalid/POST)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with POST + Correct_Invoice for invalid row', async () => {
    mockApiFetch.mockResolvedValue({ ok: true });
    render(<VfSolveErrorModal {...baseProps} rows={[ROW_INVALID]} />);
    fireEvent.click(screen.getByText('vfSolveError.invalid.action'));
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('action/Correct_Invoice'),
      expect.objectContaining({ method: 'POST' }),
    ));
  });

  it('calls onResolved and onClose on success', async () => {
    const onResolved = vi.fn();
    const onClose    = vi.fn();
    mockApiFetch.mockResolvedValue({ ok: true });
    render(<VfSolveErrorModal {...baseProps} rows={[ROW_INVALID]} onResolved={onResolved} onClose={onClose} />);
    fireEvent.click(screen.getByText('vfSolveError.invalid.action'));
    await waitFor(() => expect(onResolved).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    expect(mockToastSuccess).toHaveBeenCalledWith('vfSolveError.success');
  });

  it('shows toast.error when request fails (ok=false)', async () => {
    mockApiFetch.mockResolvedValue({ ok: false });
    render(<VfSolveErrorModal {...baseProps} rows={[ROW_INVALID]} />);
    fireEvent.click(screen.getByText('vfSolveError.invalid.action'));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('vfSolveError.saveError'));
  });

  it('shows toast.error when request rejects', async () => {
    mockApiFetch.mockRejectedValue(new Error('network'));
    render(<VfSolveErrorModal {...baseProps} rows={[ROW_INVALID]} />);
    fireEvent.click(screen.getByText('vfSolveError.invalid.action'));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('vfSolveError.saveError'));
  });
});

describe('VfSolveErrorModal — handleResolve (partial/PUT)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with PUT + isSubsanation for partial row', async () => {
    mockApiFetch.mockResolvedValue({ ok: true });
    render(<VfSolveErrorModal {...baseProps} rows={[ROW_PARTIAL]} />);
    fireEvent.click(screen.getByText('vfSolveError.partial.action'));
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('facturasParcialmenteAceptadas'),
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ isSubsanation: true }) }),
    ));
  });
});

describe('VfSolveErrorModal — showDetail toggle', () => {
  const longReason = 'A'.repeat(121);
  const rowWithLongReason = { id: 'r6', verifactuSendingStatus: 'IN', 'invoice$documentNo': 'FV-006', errorReason: longReason };

  it('shows expand button when errorReason > 120 chars', () => {
    render(<VfSolveErrorModal {...baseProps} rows={[rowWithLongReason]} />);
    expect(screen.getByText('vfSolveError.showDetail')).toBeInTheDocument();
  });

  it('toggles to collapse label after clicking expand', () => {
    render(<VfSolveErrorModal {...baseProps} rows={[rowWithLongReason]} />);
    fireEvent.click(screen.getByText('vfSolveError.showDetail'));
    expect(screen.getByText('vfSolveError.hideDetail')).toBeInTheDocument();
  });

  it('does not show expand button when errorReason <= 120 chars', () => {
    const row = { id: 'r7', verifactuSendingStatus: 'IN', 'invoice$documentNo': 'FV-007', errorReason: 'Short' };
    render(<VfSolveErrorModal {...baseProps} rows={[row]} />);
    expect(screen.queryByText('vfSolveError.showDetail')).toBeNull();
  });
});
