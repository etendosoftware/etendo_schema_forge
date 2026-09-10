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

// Deliberately NOT mocking '@/components/ui/checkbox' here, unlike
// ImportLinesModal.vitest.jsx. ETP-5067 was a real-browser click bug: the
// Checkbox renders a native <label> wrapping a visually-hidden <input>, and
// clicking the visible box beside it makes the browser dispatch a SECOND,
// synthetic click event straight at the <input> (native label-activation
// behavior) in addition to the original one. A row that nests Checkbox and
// wires the same toggle handler to both the row's onClick and the Checkbox's
// onChange (exactly what this component does) got that handler called twice
// per click, canceling itself out. A mock that renders a bare <input> (as the
// sibling suite does, for its own unrelated selection-logic coverage) has no
// <label> to generate that second dispatch, so it cannot see this bug. This
// suite renders the real component tree so a regression here fails again.

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ImportLinesModal from '../ImportLinesModal.jsx';

// --- Fixtures ---

const DOC_ROWS = [
  { id: 'doc-1', documentNo: 'INV-001', 'businessPartner$_identifier': 'Acme Inc' },
];

const LINE_ROWS = [
  { id: 'line-1', _productName: 'Widget A', _maxQty: 5, _alreadyImported: false, _unitPrice: 10, _lineNetAmount: 50 },
  { id: 'line-2', _productName: 'Widget B', _maxQty: 3, _alreadyImported: false, _unitPrice: 20, _lineNetAmount: 60 },
];

const defaultProps = {
  invoiceId: 'inv-1',
  bpId: 'bp-1',
  base: '/sws/neo/purchase-invoice',
  headers: { Authorization: 'Bearer test', 'Accept-Language': 'es_ES', 'Content-Type': 'application/json' },
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

async function expandDoc() {
  // The modal's own "eagerly load every doc's lines" effect fires right after
  // the doc list first arrives and briefly re-shows the loading text — an
  // `await waitFor(...)` yields to that pending effect before the next line
  // runs, so the doc row can vanish again between confirming it exists and
  // clicking it. Retry the click itself until it lands, guarded so it only
  // ever dispatches once (avoids re-toggling an already-expanded row while
  // waiting for its lines to load).
  let clicked = false;
  await waitFor(() => {
    if (!clicked) {
      fireEvent.click(screen.getByText('INV-001').closest('div[style]'));
      clicked = true;
    }
    expect(screen.getByText('Widget A')).toBeInTheDocument();
  });
}

// Clicking the visible box (a <div> sibling of the sr-only <input>, both
// nested in a <label>) is how a real user actually clicks the checkbox —
// clicking the <input> directly, as a naive test would, never exercises the
// native label double-dispatch that causes ETP-5067.
function clickVisibleBox(checkboxInput) {
  fireEvent.click(checkboxInput.closest('label').querySelector('div'));
}

describe('ImportLinesModal — real Checkbox click semantics (ETP-5067)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultProps.fetchDocuments.mockResolvedValue({ documents: DOC_ROWS, sharedContext: {} });
    defaultProps.fetchLines.mockResolvedValue(LINE_ROWS);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('selects an individual line when a real click lands on its checkbox, and enables the import button', async () => {
    renderModal();
    await expandDoc();

    // [doc-1 checkbox, line-1 checkbox, line-2 checkbox]
    const lineCheckbox = screen.getAllByRole('checkbox')[1];
    expect(lineCheckbox).not.toBeChecked();

    clickVisibleBox(lineCheckbox);

    expect(lineCheckbox).toBeChecked();
    expect(screen.getByText(/importSelected/).closest('button')).toBeEnabled();
  });

  it('deselects the line on a second real click (round trip stays in sync, does not cancel itself out)', async () => {
    renderModal();
    await expandDoc();

    const lineCheckbox = screen.getAllByRole('checkbox')[1];
    clickVisibleBox(lineCheckbox);
    expect(lineCheckbox).toBeChecked();

    clickVisibleBox(lineCheckbox);
    expect(lineCheckbox).not.toBeChecked();
  });

  it('selecting a line via a real click does not collapse the invoice it belongs to', async () => {
    renderModal();
    await expandDoc();

    const lineCheckbox = screen.getAllByRole('checkbox')[1];
    clickVisibleBox(lineCheckbox);

    expect(screen.getByText('Widget A')).toBeInTheDocument();
  });

  it('selects the whole invoice when a real click lands on the doc-level checkbox, without collapsing it', async () => {
    renderModal();
    await expandDoc();

    const docCheckbox = screen.getAllByRole('checkbox')[0];
    clickVisibleBox(docCheckbox);

    expect(docCheckbox).toBeChecked();
    // The doc row's own onClick toggles expand/collapse; a real click on its
    // checkbox must not also fire that handler as a side effect.
    expect(screen.getByText('Widget A')).toBeInTheDocument();
  });
});
