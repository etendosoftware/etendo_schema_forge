/**
 * ETP-4774 — Notes field 255-char guard.
 *
 * `handleNotesSave` (a useCallback closure inside DetailView, not exported)
 * gained a client-side length guard right before the PATCH fetch call:
 *
 *   if (value !== undefined && value.length > 255) {
 *     toast.error(ui('notesMaxLengthExceeded'));
 *     return;
 *   }
 *
 * Because the handler is a closure (not exported like the pure helpers in
 * DetailView.extractedHelpers.vitest.js), it can only be exercised by
 * mounting the real DetailView and interacting with the rendered Notes
 * field (`renderNotesField`, wired via onNotesSave={handleNotesSave}).
 * Mocks below mirror DetailView.render.vitest.jsx so the component tree
 * mounts in isolation.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'sonner';
import { DetailView } from '../DetailView.jsx';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    useLocation: () => ({ pathname: '/sales-order/123', search: '' }),
  };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

const mockHook = {
  loading: false,
  items: [],
  selected: { id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false, notes: '' },
  editing: { id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false, notes: '' },
  children: [],
  isDirtyHeader: false,
  loadingChildren: false,
  childrenLoading: false,
  error: null,
  handleChange: vi.fn(),
  handleSave: vi.fn().mockResolvedValue({}),
  handleCreate: vi.fn().mockResolvedValue({}),
  handleDelete: vi.fn().mockResolvedValue({}),
  handleDeleteChild: vi.fn(),
  handleSelect: vi.fn(),
  handleUpdateChild: vi.fn(),
  handleProcess: vi.fn(),
  handleSaveAndProcess: vi.fn().mockResolvedValue({}),
  fetchById: vi.fn().mockResolvedValue({}),
  fetchChildren: vi.fn(),
  refreshChildren: vi.fn(),
  isSaving: false,
  primeSaved: vi.fn(),
};

vi.mock('@/hooks/useEntity', () => ({
  useEntity: () => mockHook,
  extractErrorMessage: async () => 'Error',
}));

vi.mock('@/hooks/useCatalogs', () => ({
  useCatalogs: () => ({ catalogs: {}, loading: false }),
}));

vi.mock('@/hooks/useDisplayLogic', () => ({
  useDisplayLogic: () => ({ visibleFields: [], hiddenFields: new Set() }),
}));

vi.mock('@/hooks/useCallout', () => ({
  useCallout: () => ({
    calloutResult: null,
    calloutLoading: false,
    executeCallout: vi.fn(),
  }),
}));

vi.mock('@/hooks/useCurrency', () => ({
  useCurrency: () => 'EUR',
}));

vi.mock('@/hooks/useLineGrossAmount', () => ({
  useLineGrossAmount: () => ({ grossAmount: 0, calculate: vi.fn() }),
  ORDER_LINE_CONFIG: {
    qtyField: 'orderedQuantity',
    priceField: 'unitPrice',
    totalField: 'lineNetAmount',
  },
}));

vi.mock('@/hooks/useDocumentAction', () => ({
  useDocumentAction: () => ({
    executeAction: vi.fn(),
    loading: false,
  }),
}));

vi.mock('@/i18n', () => ({
  useMenuLabel: () => (k) => k,
  useUI: () => (k) => k,
  useLabel: () => () => '',
}));

vi.mock('@/components/layout/PageMetaContext', () => ({
  useSetPageMeta: () => vi.fn(),
}));

vi.mock('@/components/layout/FavoritesContext', () => ({
  useFavorites: () => ({
    isFavorite: () => false,
    toggleFavorite: vi.fn(),
  }),
}));

vi.mock('@/components/CurrentWindowContext', () => ({
  useRegisterWindowContext: () => {},
}));

vi.mock('@/components/copilot/ocr/ocrDocTypes', () => ({
  matchOcrDocType: () => null,
}));

vi.mock('@/lib/selectorContext.js', () => ({
  buildHeaderSelectorContext: () => ({}),
  buildLineSelectorContext: () => ({}),
}));

vi.mock('@/lib/selectorCatalog.js', () => ({
  getCatalogOptions: () => [],
}));

vi.mock('@/lib/formatAmount.js', () => ({
  formatAmount: (v) => v != null ? String(v) : '—',
}));

vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (data, f) => data?.[f] || data?._identifier || '',
}));

vi.mock('@/lib/documentTotals', () => ({
  resolveTotalDiscountPct: () => 0,
}));

vi.mock('@/lib/backendErrors.js', () => ({
  translateBackendError: (m) => m,
}));

vi.mock('@/utils/recordActions.js', () => ({
  isDeleteVisibleForRecord: () => true,
}));

vi.mock('@/lib/utils.js', () => ({
  cn: (...args) => args.filter(Boolean).join(' '),
}));

vi.mock('@/components/ui/dialog.jsx', () => ({
  Dialog: ({ children, open }) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
  DialogDescription: ({ children }) => <p>{children}</p>,
  DialogFooter: ({ children }) => <div data-testid="dialog-footer">{children}</div>,
  DialogClose: ({ children }) => children,
}));

vi.mock('../DocumentPrintDrawer.jsx', () => ({
  default: () => null,
  printDocuments: vi.fn(),
}));

vi.mock('../SummaryBar.jsx', () => ({
  SummaryBar: () => null,
}));

vi.mock('../DocumentTotalsPanel.jsx', () => ({
  default: () => null,
}));

vi.mock('../LinesSelectionBar.jsx', () => ({
  default: () => null,
}));

vi.mock('../DocumentStatusPill.jsx', () => ({
  default: ({ status }) => <span data-testid="status-pill">{status}</span>,
}));

vi.mock('@/components/attachments/AttachmentIcon', () => ({
  AttachmentIcon: () => <span>📎</span>,
}));

const MockForm = ({ data }) => (
  <div data-testid="mock-form">
    <span>{data?.documentNo}</span>
  </div>
);

const MockTable = ({ data }) => (
  <div data-testid="mock-table">
    {(data || []).map((r) => <div key={r.id}>{r.id}</div>)}
  </div>
);

function renderDetailView(props = {}) {
  return render(
    <MemoryRouter>
      <DetailView
        entity="header"
        detailEntity="lines"
        Form={MockForm}
        DetailTable={MockTable}
        DetailForm={null}
        summary={[]}
        statusField="documentStatus"
        processes={[]}
        addLineFields={{ entry: [], derived: [] }}
        api={{}}
        entityLabel="Sales Order"
        detailLabel="Lines"
        titleField="documentNo"
        windowName="sales-order"
        recordId="123"
        token="test-token"
        apiBaseUrl="/api/sales-order"
        breadcrumb="Sales / Orders"
        notesField="notes"
        {...props}
      />
    </MemoryRouter>,
  );
}

/** Enters edit mode (click on the notes display div) and returns the textarea. */
function openNotesTextarea() {
  const wrapper = screen.getByTestId('notes-textarea');
  const displayDiv = wrapper.querySelector('[role="textbox"]');
  fireEvent.click(displayDiv);
  const textarea = wrapper.querySelector('textarea');
  expect(textarea).toBeTruthy();
  return textarea;
}

describe('DetailView notes field — 255-char guard (ETP-4774)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHook.selected = { id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false, notes: '' };
    mockHook.editing = { id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false, notes: '' };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // handleNotesSave's onBlur reads `data[notesField]` — the value the *DetailView
  // render* currently holds (hook.editing[notesField]) — not the textarea's live DOM
  // value (see detailViewHelpers.jsx renderNotesField: `onBlur={() =>
  // handleNotesSave(data[notesField])}`). hook.handleChange is stubbed as a bare
  // vi.fn() here and never mutates mockHook.editing, so firing a real `change` event
  // on the textarea would not be reflected by the time `blur` fires. Instead, each
  // test seeds `mockHook.editing[notesField]` with the target value up front (exactly
  // what a real save flow ends up with once hook.handleChange has committed the
  // in-progress edit) and opens + blurs the field to trigger the save with that value.

  it('blocks the save and shows an error toast when notes exceed 255 characters', async () => {
    const tooLong = 'a'.repeat(256);
    mockHook.editing.notes = tooLong;
    mockHook.selected.notes = tooLong;
    renderDetailView();
    const textarea = openNotesTextarea();

    fireEvent.blur(textarea);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('notesMaxLengthExceeded'));
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mockHook.handleChange).not.toHaveBeenCalledWith('notes', tooLong);
  });

  it('allows the save when notes are exactly 255 characters (boundary)', async () => {
    const exactly255 = 'a'.repeat(255);
    mockHook.editing.notes = exactly255;
    mockHook.selected.notes = exactly255;
    renderDetailView();
    const textarea = openNotesTextarea();

    fireEvent.blur(textarea);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    const [url, options] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/api/sales-order/header/123');
    expect(options.method).toBe('PATCH');
    expect(JSON.parse(options.body)).toEqual({ notes: exactly255 });

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('noteSaved'));
    expect(mockHook.handleChange).toHaveBeenCalledWith('notes', exactly255);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('blocks the save when notes exceed 255 by one character (256, just above boundary)', async () => {
    const exactly256 = 'a'.repeat(256);
    mockHook.editing.notes = exactly256;
    mockHook.selected.notes = exactly256;
    renderDetailView();
    const textarea = openNotesTextarea();

    fireEvent.blur(textarea);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('notesMaxLengthExceeded'));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('allows a normal, short notes save to proceed unaffected by the guard', async () => {
    const shortValue = 'A short note';
    mockHook.editing.notes = shortValue;
    mockHook.selected.notes = shortValue;
    renderDetailView();
    const textarea = openNotesTextarea();

    fireEvent.blur(textarea);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('noteSaved'));
    expect(mockHook.handleChange).toHaveBeenCalledWith('notes', shortValue);
    expect(toast.error).not.toHaveBeenCalled();
  });
});
