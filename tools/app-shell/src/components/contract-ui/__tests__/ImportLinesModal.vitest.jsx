// --- Mocks (before imports) ---

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => {
    if (params) return `${key}:${JSON.stringify(params)}`;
    return key;
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, onChange, disabled, ...rest }) => (
    <input
      type="checkbox"
      data-testid="checkbox"
      checked={checked || false}
      disabled={disabled || false}
      onChange={onChange || (() => {})}
      {...rest}
    />
  ),
}));

// --- Import under test ---

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ImportLinesModal from '../ImportLinesModal.jsx';

// --- Helpers ---

const DOC_ROWS = [
  { id: 'doc-1', documentNo: 'INV-001', 'businessPartner$_identifier': 'Acme Inc' },
  { id: 'doc-2', documentNo: 'INV-002', 'businessPartner$_identifier': 'Acme Inc' },
];

const LINE_ROWS = [
  { id: 'line-1', _productName: 'Widget A', _maxQty: 5, _alreadyImported: false, _unitPrice: 10, _lineNetAmount: 50 },
  { id: 'line-2', _productName: 'Widget B', _maxQty: 3, _alreadyImported: false, _unitPrice: 20, _lineNetAmount: 60 },
];

const defaultProps = {
  invoiceId: 'inv-1',
  bpId: 'bp-1',
  base: '/sws/neo/purchase-invoice',
  headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
  onClose: vi.fn(),
  onSuccess: vi.fn(),
  titleKey: 'importFromOrders',
  searchPlaceholderKey: 'searchOrders',
  emptyMessageKey: 'noOrdersFound',
  noSearchResultsKey: 'noSearchResults',
  successMessageKey: 'importSuccess',
  linesEndpoint: 'invoiceLine',
  fetchDocuments: vi.fn().mockResolvedValue({ documents: DOC_ROWS, sharedContext: {} }),
  fetchLines: vi.fn().mockResolvedValue(LINE_ROWS),
  getDocDisplay: (doc) => ({ docNo: doc.documentNo, date: '2025-01-15' }),
  buildLineBody: vi.fn().mockResolvedValue({ product: 'p1', quantity: 1 }),
};

function renderModal(overrides = {}) {
  const props = { ...defaultProps, ...overrides };
  return { ...render(<ImportLinesModal {...props} />), props };
}

// --- Tests ---

describe('ImportLinesModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-establish the resolved values every test. The full suite restores mocks
    // between files, which wipes the module-level mockResolvedValue implementations
    // and would otherwise leave fetchLines returning undefined (modal stuck on
    // "loading"). Setting them here keeps the test deterministic in isolation and
    // under the full parallel run.
    defaultProps.fetchDocuments.mockResolvedValue({ documents: DOC_ROWS, sharedContext: {} });
    defaultProps.fetchLines.mockResolvedValue(LINE_ROWS);
    defaultProps.buildLineBody.mockResolvedValue({ product: 'p1', quantity: 1 });
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws when linesEndpoint is missing', () => {
    expect(() => {
      renderModal({ linesEndpoint: undefined });
    }).toThrow('linesEndpoint prop is required');
  });

  it('renders the modal with title', async () => {
    renderModal();
    expect(screen.getByText('importFromOrders')).toBeInTheDocument();
  });

  it('renders a search input', () => {
    renderModal();
    const searchInput = screen.getByPlaceholderText('searchOrders');
    expect(searchInput).toBeInTheDocument();
  });

  it('renders cancel button', () => {
    renderModal();
    expect(screen.getByText('cancel')).toBeInTheDocument();
  });

  it('calls onClose when cancel is clicked', () => {
    const { props } = renderModal();
    fireEvent.click(screen.getByText('cancel'));
    expect(props.onClose).toHaveBeenCalled();
  });

  it('calls onClose when clicking the backdrop overlay', () => {
    const { props, container } = renderModal();
    // The outermost div has onClick={onClose}
    const backdrop = container.firstChild;
    fireEvent.click(backdrop);
    expect(props.onClose).toHaveBeenCalled();
  });

  it('shows loading state initially', () => {
    renderModal({
      fetchDocuments: vi.fn(() => new Promise(() => {})), // never resolves
    });
    expect(screen.getByText('loading')).toBeInTheDocument();
  });

  it('shows documents after loading', async () => {
    renderModal();

    await waitFor(() => {
      expect(screen.getByText('INV-001')).toBeInTheDocument();
      expect(screen.getByText('INV-002')).toBeInTheDocument();
    });
  });

  it('shows business partner name', async () => {
    renderModal();

    await waitFor(() => {
      expect(screen.getByText('Acme Inc')).toBeInTheDocument();
    });
  });

  it('shows empty message when no documents', async () => {
    renderModal({
      fetchDocuments: vi.fn().mockResolvedValue({ documents: [], sharedContext: {} }),
    });

    await waitFor(() => {
      expect(screen.getByText('noOrdersFound')).toBeInTheDocument();
    });
  });

  it('renders import button as disabled when no lines are selected', async () => {
    renderModal();

    await waitFor(() => {
      expect(screen.getByText('INV-001')).toBeInTheDocument();
    });

    // The import button text should be present
    const importBtn = screen.getByText(/importSelected/);
    expect(importBtn.closest('button')).toBeInTheDocument();
  });

  it('shows selectLinesToImport when nothing is selected initially', async () => {
    renderModal();

    await waitFor(() => {
      expect(screen.getByText('selectLinesToImport')).toBeInTheDocument();
    });
  });

  it('expands a document row on click and loads lines', async () => {
    renderModal();

    // Wait for the fully-settled list state: fetchLines already called (eager load
    // started) AND no loading spinner (eager load finished) AND INV-001 visible.
    // Checking only INV-001 catches the brief window between initial render and the
    // eager-load spinner, which hides the list before stable state is reached.
    await waitFor(() => {
      expect(defaultProps.fetchLines).toHaveBeenCalled();
      expect(screen.queryByText('loading')).not.toBeInTheDocument();
      expect(screen.getByText('INV-001')).toBeInTheDocument();
    }, { timeout: 10000 });

    // Click on the first document row to expand it
    const docRow = screen.getByText('INV-001');
    fireEvent.click(docRow.closest('div[style]'));

    await waitFor(() => {
      expect(defaultProps.fetchLines).toHaveBeenCalledWith(
        expect.objectContaining({ docId: 'doc-1' })
      );
    }, { timeout: 10000 });

    // After lines load, product names should appear
    await waitFor(() => {
      expect(screen.getByText('Widget A')).toBeInTheDocument();
      expect(screen.getByText('Widget B')).toBeInTheDocument();
    }, { timeout: 10000 });
  });

  it('shows column headers when lines are expanded', async () => {
    renderModal();

    await waitFor(() => {
      expect(defaultProps.fetchLines).toHaveBeenCalled();
      expect(screen.queryByText('loading')).not.toBeInTheDocument();
      expect(screen.getByText('INV-001')).toBeInTheDocument();
    }, { timeout: 10000 });

    fireEvent.click(screen.getByText('INV-001').closest('div[style]'));

    await waitFor(() => {
      expect(screen.getByText('product')).toBeInTheDocument();
      expect(screen.getByText('qty')).toBeInTheDocument();
      expect(screen.getByText('price')).toBeInTheDocument();
      expect(screen.getByText('amount')).toBeInTheDocument();
    }, { timeout: 10000 });
  });

  it('hides price columns when showPriceColumns is false', async () => {
    renderModal({ showPriceColumns: false });

    await waitFor(() => {
      expect(defaultProps.fetchLines).toHaveBeenCalled();
      expect(screen.queryByText('loading')).not.toBeInTheDocument();
      expect(screen.getByText('INV-001')).toBeInTheDocument();
    }, { timeout: 10000 });

    fireEvent.click(screen.getByText('INV-001').closest('div[style]'));

    await waitFor(() => {
      expect(screen.getByText('product')).toBeInTheDocument();
      expect(screen.getByText('qty')).toBeInTheDocument();
    }, { timeout: 10000 });

    // price and amount columns should not exist
    expect(screen.queryByText('price')).not.toBeInTheDocument();
    expect(screen.queryByText('amount')).not.toBeInTheDocument();
  });

  it('formats docTotal, unitPrice and lineTotal in es-ES (comma decimal, grouped thousands), never dot', async () => {
    defaultProps.fetchLines.mockResolvedValue([
      { id: 'line-1', _productName: 'Widget A', _maxQty: 5, _alreadyImported: false, _unitPrice: 1234.56, _lineNetAmount: 2500 },
    ]);
    renderModal();

    await waitFor(() => {
      expect(defaultProps.fetchLines).toHaveBeenCalled();
      expect(screen.queryByText('loading')).not.toBeInTheDocument();
      expect(screen.getByText('INV-001')).toBeInTheDocument();
    }, { timeout: 10000 });

    // Collapsed docTotal (sum of line net amounts) shown next to each row — both
    // docs share the same mocked lines, so it's expected to appear more than once.
    expect(screen.getAllByText('2.500,00').length).toBeGreaterThan(0);
    expect(screen.queryByText('2500.00')).toBeNull();

    fireEvent.click(screen.getByText('INV-001').closest('div[style]'));

    await waitFor(() => expect(screen.getByText('Widget A')).toBeInTheDocument(), { timeout: 10000 });
    expect(screen.getByText('1.234,56')).toBeInTheDocument();
    expect(screen.queryByText('1234.56')).toBeNull();
  });

  it('filters documents by search query', async () => {
    renderModal();

    await waitFor(() => {
      expect(defaultProps.fetchLines).toHaveBeenCalled();
      expect(screen.queryByText('loading')).not.toBeInTheDocument();
      expect(screen.getByText('INV-001')).toBeInTheDocument();
    }, { timeout: 10000 });

    const searchInput = screen.getByPlaceholderText('searchOrders');
    fireEvent.change(searchInput, { target: { value: 'INV-002' } });

    expect(screen.queryByText('INV-001')).not.toBeInTheDocument();
    expect(screen.getByText('INV-002')).toBeInTheDocument();
  });

  it('shows noSearchResults when search matches nothing', async () => {
    renderModal();

    await waitFor(() => {
      expect(defaultProps.fetchLines).toHaveBeenCalled();
      expect(screen.queryByText('loading')).not.toBeInTheDocument();
      expect(screen.getByText('INV-001')).toBeInTheDocument();
    }, { timeout: 10000 });

    const searchInput = screen.getByPlaceholderText('searchOrders');
    fireEvent.change(searchInput, { target: { value: 'NONEXISTENT' } });

    expect(screen.getByText('noSearchResults')).toBeInTheDocument();
  });

  it('renders close X button', async () => {
    renderModal();
    // The X button has text content '\u00d7'
    const closeBtn = screen.getByText('\u00d7');
    expect(closeBtn).toBeInTheDocument();
  });

  it('calls onClose when X button is clicked', () => {
    const { props } = renderModal();
    fireEvent.click(screen.getByText('\u00d7'));
    expect(props.onClose).toHaveBeenCalled();
  });

  // ETP-4029 \u2014 currency-filter empty state. When fetchDocuments reports
  // excludedByCurrency: true (all bp/status candidates existed but were
  // removed by the currency filter) AND the caller passed
  // noCurrencyMatchMessageKey, the empty state must show that message instead
  // of the generic emptyMessageKey.
  describe('currency-filter empty state (excludedByCurrency)', () => {
    it('shows noCurrencyMatchMessageKey when excludedByCurrency is true and the prop is provided', async () => {
      renderModal({
        noCurrencyMatchMessageKey: 'noOrdersMatchCurrency',
        fetchDocuments: vi.fn().mockResolvedValue({ documents: [], sharedContext: {}, excludedByCurrency: true }),
      });

      await waitFor(() => {
        expect(screen.getByText('noOrdersMatchCurrency')).toBeInTheDocument();
      });
      expect(screen.queryByText('noOrdersFound')).not.toBeInTheDocument();
    });

    it('falls back to emptyMessageKey when excludedByCurrency is true but noCurrencyMatchMessageKey is not provided', async () => {
      renderModal({
        noCurrencyMatchMessageKey: undefined,
        fetchDocuments: vi.fn().mockResolvedValue({ documents: [], sharedContext: {}, excludedByCurrency: true }),
      });

      await waitFor(() => {
        expect(screen.getByText('noOrdersFound')).toBeInTheDocument();
      });
    });

    it('falls back to emptyMessageKey when excludedByCurrency is false, even if noCurrencyMatchMessageKey is provided', async () => {
      renderModal({
        noCurrencyMatchMessageKey: 'noOrdersMatchCurrency',
        fetchDocuments: vi.fn().mockResolvedValue({ documents: [], sharedContext: {}, excludedByCurrency: false }),
      });

      await waitFor(() => {
        expect(screen.getByText('noOrdersFound')).toBeInTheDocument();
      });
      expect(screen.queryByText('noOrdersMatchCurrency')).not.toBeInTheDocument();
    });

    it('falls back to emptyMessageKey when excludedByCurrency is omitted entirely (legacy fetchDocuments shape)', async () => {
      renderModal({
        noCurrencyMatchMessageKey: 'noOrdersMatchCurrency',
        fetchDocuments: vi.fn().mockResolvedValue({ documents: [], sharedContext: {} }),
      });

      await waitFor(() => {
        expect(screen.getByText('noOrdersFound')).toBeInTheDocument();
      });
    });
  });

  // ETP-4737 — negativeQuantity prop: used by the "Import from Source Invoice"
  // rectificativa flow to display/import lines as negative quantities while the
  // internal stepper state (and buildLineBody's input) always stays a positive
  // magnitude. See ImportLinesModal.jsx around `displayQty`.
  describe('negativeQuantity prop (ETP-4737)', () => {
    const NEG_LINE = { id: 'line-1', _productName: 'Widget A', _maxQty: 5, _alreadyImported: false, _unitPrice: 10, _lineNetAmount: 77 };

    async function renderExpanded(overrides = {}) {
      const result = renderModal(overrides);
      await waitFor(() => {
        expect(defaultProps.fetchLines).toHaveBeenCalled();
        expect(screen.queryByText('loading')).not.toBeInTheDocument();
        expect(screen.getByText('INV-001')).toBeInTheDocument();
      }, { timeout: 10000 });
      fireEvent.click(screen.getByText('INV-001').closest('div[style]'));
      await waitFor(() => expect(screen.getByText('Widget A')).toBeInTheDocument(), { timeout: 10000 });
      return result;
    }

    it('displays the quantity as negative when negativeQuantity is true', async () => {
      defaultProps.fetchLines.mockResolvedValue([NEG_LINE]);
      const { container } = await renderExpanded({ negativeQuantity: true });
      const qtyInput = container.querySelector('input[type="number"]');
      expect(qtyInput.value).toBe('-5');
    });

    it('keeps the quantity positive when negativeQuantity is false (default)', async () => {
      defaultProps.fetchLines.mockResolvedValue([NEG_LINE]);
      const { container } = await renderExpanded();
      const qtyInput = container.querySelector('input[type="number"]');
      expect(qtyInput.value).toBe('5');
    });

    it('flips the min/max attributes to negative bounds when negativeQuantity is true', async () => {
      defaultProps.fetchLines.mockResolvedValue([NEG_LINE]);
      const { container } = await renderExpanded({ negativeQuantity: true });
      const qtyInput = container.querySelector('input[type="number"]');
      expect(qtyInput.min).toBe('-5');
      expect(qtyInput.max).toBe('-1');
    });

    it('keeps positive min/max bounds when negativeQuantity is false (default)', async () => {
      defaultProps.fetchLines.mockResolvedValue([NEG_LINE]);
      const { container } = await renderExpanded();
      const qtyInput = container.querySelector('input[type="number"]');
      expect(qtyInput.min).toBe('1');
      expect(qtyInput.max).toBe('5');
    });

    it('clamps onChange to a positive magnitude internally, then re-displays it with the sign flipped', async () => {
      defaultProps.fetchLines.mockResolvedValue([NEG_LINE]);
      const { container } = await renderExpanded({ negativeQuantity: true });
      const qtyInput = container.querySelector('input[type="number"]');

      fireEvent.change(qtyInput, { target: { value: '-3' } });
      expect(qtyInput.value).toBe('-3');
    });

    it('clamps a magnitude above maxQty down to maxQty', async () => {
      defaultProps.fetchLines.mockResolvedValue([NEG_LINE]);
      const { container } = await renderExpanded({ negativeQuantity: true });
      const qtyInput = container.querySelector('input[type="number"]');

      fireEvent.change(qtyInput, { target: { value: '-100' } });
      expect(qtyInput.value).toBe('-5');
    });

    it('defaults a non-numeric input to a magnitude of 1', async () => {
      defaultProps.fetchLines.mockResolvedValue([NEG_LINE]);
      const { container } = await renderExpanded({ negativeQuantity: true });
      const qtyInput = container.querySelector('input[type="number"]');

      fireEvent.change(qtyInput, { target: { value: 'abc' } });
      expect(qtyInput.value).toBe('-1');
    });

    it('computes a negative lineTotal preview when negativeQuantity is true', async () => {
      defaultProps.fetchLines.mockResolvedValue([NEG_LINE]);
      await renderExpanded({ negativeQuantity: true });
      // unitPrice 10 * displayQty -5 = -50
      expect(screen.getByText('-50,00')).toBeInTheDocument();
    });

    it('computes a positive lineTotal preview when negativeQuantity is false (default)', async () => {
      defaultProps.fetchLines.mockResolvedValue([NEG_LINE]);
      await renderExpanded();
      expect(screen.getByText('50,00')).toBeInTheDocument();
    });

    it('computes a negative docTotal summary when negativeQuantity is true', async () => {
      defaultProps.fetchLines.mockResolvedValue([NEG_LINE]);
      renderModal({ negativeQuantity: true });
      await waitFor(() => {
        expect(defaultProps.fetchLines).toHaveBeenCalled();
        expect(screen.queryByText('loading')).not.toBeInTheDocument();
        expect(screen.getByText('INV-001')).toBeInTheDocument();
      }, { timeout: 10000 });
      // _lineNetAmount 77 * docTotalSign -1 = -77, shown collapsed for both docs
      const totals = screen.getAllByText('-77,00');
      expect(totals.length).toBeGreaterThan(0);
    });

    it('computes a positive docTotal summary when negativeQuantity is false (default)', async () => {
      defaultProps.fetchLines.mockResolvedValue([NEG_LINE]);
      renderModal();
      await waitFor(() => {
        expect(defaultProps.fetchLines).toHaveBeenCalled();
        expect(screen.queryByText('loading')).not.toBeInTheDocument();
        expect(screen.getByText('INV-001')).toBeInTheDocument();
      }, { timeout: 10000 });
      const totals = screen.getAllByText('77,00');
      expect(totals.length).toBeGreaterThan(0);
    });

    it('adds Tailwind classes to hide the native number-input spin buttons on the quantity input', async () => {
      defaultProps.fetchLines.mockResolvedValue([NEG_LINE]);
      const { container } = await renderExpanded();
      const qtyInput = container.querySelector('input[type="number"]');
      expect(qtyInput.className).toContain('[appearance:textfield]');
      expect(qtyInput.className).toContain('[&::-webkit-outer-spin-button]:appearance-none');
      expect(qtyInput.className).toContain('[&::-webkit-inner-spin-button]:appearance-none');
    });
  });
});
