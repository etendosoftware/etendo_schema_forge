import { render, screen, fireEvent } from '@testing-library/react';

// --- Mocks ----------------------------------------------------------------

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/lib/formatCurrency', () => ({
  formatCurrency: (_curr, val) => `$${Number(val || 0).toFixed(2)}`,
}));

vi.mock('lucide-react', () => ({
  FileText: () => <span data-testid="icon-file" />,
  Check: () => <span data-testid="icon-check" />,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), custom: vi.fn() },
}));

vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createPortal: (node) => node,
  };
});

// --- Import under test ----------------------------------------------------

import PurchaseOrderActions from '../PurchaseOrderActions.jsx';

// --- Helpers --------------------------------------------------------------

function renderActions(overrides = {}) {
  const defaults = {
    data: { documentStatus: 'DR', documentNo: 'PO-001', grandTotalAmount: 500 },
    recordId: 'order-1',
    token: 'tok',
    apiBaseUrl: '/api/purchase-order',
    api: { save: vi.fn() },
    onProcess: vi.fn(),
  };
  return { ...render(<PurchaseOrderActions {...defaults} {...overrides} />), props: { ...defaults, ...overrides } };
}

// --- Tests ----------------------------------------------------------------

describe('PurchaseOrderActions', () => {
  beforeEach(() => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ response: { data: [] } }),
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when data is null', () => {
    const { container } = render(
      <PurchaseOrderActions
        data={null}
        recordId="x"
        token="tok"
        apiBaseUrl="/api"
        onProcess={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders draft state buttons', () => {
    renderActions();
    expect(screen.getByText('poSave')).toBeInTheDocument();
    expect(screen.getByText('poConfirmBtn')).toBeInTheDocument();
  });

  it('renders delete icon in draft state', () => {
    renderActions();
    expect(screen.getByLabelText('delete')).toBeInTheDocument();
  });

  it('calls api.save when save button is clicked', () => {
    const { props } = renderActions();
    fireEvent.click(screen.getByText('poSave'));
    expect(props.api.save).toHaveBeenCalled();
  });

  it('calls onProcess(delete) when delete icon is clicked', () => {
    const { props } = renderActions();
    fireEvent.click(screen.getByLabelText('delete'));
    expect(props.onProcess).toHaveBeenCalledWith('delete');
  });

  // ETP-4728 (Hallazgo 2) — the decorative Print icon (which called
  // onProcess('print') → a broken handleProcess POST to .../action/undefined)
  // was removed; the generic DetailView Printer button + DocumentPrintDrawer
  // now own printing for this window (see DocumentPrintDrawer.vitest.jsx).
  it('does not render a print icon (removed — see DocumentPrintDrawer)', () => {
    renderActions();
    expect(screen.queryByLabelText('print')).not.toBeInTheDocument();
  });

  it('shows confirm modal when confirm button is clicked', () => {
    renderActions();
    fireEvent.click(screen.getByText('poConfirmBtn'));
    // The modal renders option cards
    expect(screen.getByText('poConfirmWithInvoice')).toBeInTheDocument();
    expect(screen.getByText('soConfirmOnly')).toBeInTheDocument();
  });

  it('renders confirmed state buttons', () => {
    renderActions({
      data: { documentStatus: 'CO', documentNo: 'PO-001', grandTotalAmount: 500 },
    });
    expect(screen.getByText('poReceiveGoods')).toBeInTheDocument();
    expect(screen.getByText('poCreateInvoice')).toBeInTheDocument();
  });

  it('calls onProcess(email) when email icon is clicked in confirmed state', () => {
    const { props } = renderActions({
      data: { documentStatus: 'CO', documentNo: 'PO-001', grandTotalAmount: 500 },
    });
    fireEvent.click(screen.getByLabelText('send'));
    expect(props.onProcess).toHaveBeenCalledWith('email');
  });
});
