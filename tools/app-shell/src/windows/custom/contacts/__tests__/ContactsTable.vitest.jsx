// --- Mocks (before imports) ---

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocale: () => ({ genericLabels: {} }),
}));

// DataTable is a thin stub, but exposes a button that fires `onDeleteRow` so the
// confirm-delete dialog + toast flow (ETP-5026) can be exercised without a real grid.
vi.mock('@/components/contract-ui', () => ({
  DataTable: (props) => (
    <div
      data-testid="data-table"
      data-editing-row-id={props.editingRowId ?? ''}
      data-hidden-columns={JSON.stringify(props.hiddenColumns ?? null)}
    >
      <button
        type="button"
        data-testid="trigger-delete-row"
        onClick={() => props.onDeleteRow?.({ id: 'row-1', name: 'Acme' })}
      >
        delete row
      </button>
    </div>
  ),
}));

const apiFetch = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: () => apiFetch,
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...a) => toastSuccess(...a),
    error: (...a) => toastError(...a),
  },
}));

vi.mock('@/components/ui/tag', () => ({
  Tag: ({ label }) => <span data-testid="tag">{label}</span>,
}));

vi.mock('@/components/ui/button.jsx', () => ({
  Button: ({ children, ...rest }) => <button {...rest}>{children}</button>,
}));

vi.mock('@/components/ui/dialog.jsx', () => ({
  Dialog: ({ children, open }) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <div>{children}</div>,
  DialogDescription: ({ children }) => <div>{children}</div>,
  DialogFooter: ({ children }) => <div data-testid="dialog-footer">{children}</div>,
}));

vi.mock('@/lib/apiError', () => ({
  extractApiErrorMessage: async () => 'mock error',
}));

// --- Import under test ---

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ContactsTable from '../ContactsTable.jsx';

// --- Tests ---

const defaultProps = {
  data: [],
  apiBaseUrl: '/sws/neo/contacts',
  token: 'test-token',
  onDataMutated: vi.fn(),
};

describe('ContactsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ETP-5026: confirmDelete's success/error toasts, via the confirmation modal path.
  describe('delete confirmation flow (ETP-5026)', () => {
    async function triggerDeleteAndConfirm() {
      fireEvent.click(screen.getByTestId('trigger-delete-row'));
      expect(screen.getByTestId('dialog')).toBeInTheDocument();
      fireEvent.click(screen.getByText('delete'));
    }

    it('shows a success toast and refreshes data when the delete succeeds', async () => {
      apiFetch.mockResolvedValueOnce({ ok: true });
      const onDataMutated = vi.fn();
      render(<ContactsTable {...defaultProps} onDataMutated={onDataMutated} />);

      await triggerDeleteAndConfirm();

      await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('contactDeleteSuccess'));
      expect(toastError).not.toHaveBeenCalled();
      expect(onDataMutated).toHaveBeenCalled();
      expect(apiFetch).toHaveBeenCalledWith('/businessPartner/row-1', { method: 'DELETE' });
    });

    // TC-04: a failed delete must NOT trigger a success toast — only the error toast.
    it('shows only an error toast and does not mutate data when the delete fails', async () => {
      apiFetch.mockResolvedValueOnce({ ok: false, status: 500 });
      const onDataMutated = vi.fn();
      render(<ContactsTable {...defaultProps} onDataMutated={onDataMutated} />);

      await triggerDeleteAndConfirm();

      await waitFor(() => expect(toastError).toHaveBeenCalledWith('mock error'));
      expect(toastSuccess).not.toHaveBeenCalled();
      expect(onDataMutated).not.toHaveBeenCalled();
    });
  });

  it('renders DataTable without crashing', () => {
    render(<ContactsTable {...defaultProps} />);
    expect(screen.getByTestId('data-table')).toBeInTheDocument();
  });

  it('renders with default empty data', () => {
    render(<ContactsTable />);
    expect(screen.getByTestId('data-table')).toBeInTheDocument();
  });

  it('does not show delete dialog initially', () => {
    render(<ContactsTable {...defaultProps} />);
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  it('passes editingRowId as null when not editing', () => {
    render(<ContactsTable {...defaultProps} />);
    expect(screen.getByTestId('data-table')).toHaveAttribute('data-editing-row-id', '');
  });

  it('passes data and token to DataTable', () => {
    render(<ContactsTable {...defaultProps} data={[{ id: '1', name: 'Test' }]} />);
    expect(screen.getByTestId('data-table')).toBeInTheDocument();
  });

  // ETP-5182 (continuation of the ETP-4609 QA finding below) — ContactsTable
  // declares its own local `hiddenColumns={HIDDEN_COLS}` (= ['__contactType'])
  // and used to spread `{...rest}` AFTER it, same shape as the pre-fix
  // ProductCustomTable.jsx bug (ListView.jsx unconditionally forwards its own
  // `hiddenColumns = []` default to whatever Table it renders — see
  // ListView.jsx `hiddenColumns = []` default prop and the `tableProps` object
  // it builds for `ListTableRegion`). `rest.hiddenColumns` silently clobbered
  // HIDDEN_COLS, so `__contactType` rendered as a second, duplicate "Tipo"
  // column instead of staying hidden — this is Bug 2 of ETP-5182.
  //
  // CORRECTION to the original ETP-4609 note: `ContactsTable.jsx` is NOT dead
  // code — `artifacts/contacts/generated/web/contacts/BusinessPartnerPage.jsx`
  // imports it as `BusinessPartnerTable` and renders
  // `<ListView Table={BusinessPartnerTable} .../>`, and that generated page is
  // wired live via `@generated/contacts/generated/web/contacts/BusinessPartnerPage`
  // in `windows/custom/contacts/index.jsx`, which IS the registered window
  // component (`src/windows/registry.js`). So this bug was reachable from the
  // real Contacts window all along.
  it('keeps HIDDEN_COLS even when the parent forwards its own hiddenColumns=[] (ListView default)', () => {
    render(<ContactsTable {...defaultProps} hiddenColumns={[]} />);
    const hidden = JSON.parse(screen.getByTestId('data-table').getAttribute('data-hidden-columns'));
    expect(hidden).toContain('__contactType');
  });

  // Proves the fix is a MERGE, not just "own hiddenColumns always wins" — a
  // future real dynamic `hiddenColumns` forwarded by ListView (e.g. computed
  // from `lineDisplayLogic`, see docs/ui-customization.md §14) must survive
  // alongside `__contactType`, not be silently dropped by a naive reorder.
  it('merges a non-empty hiddenColumns forwarded by the parent with HIDDEN_COLS', () => {
    render(<ContactsTable {...defaultProps} hiddenColumns={['someOtherCol']} />);
    const hidden = JSON.parse(screen.getByTestId('data-table').getAttribute('data-hidden-columns'));
    expect(hidden).toContain('__contactType');
    expect(hidden).toContain('someOtherCol');
  });

  // Guards the `?? []` fallback — an absent `hiddenColumns` prop (the shape
  // ContactsTable would get if some future caller omits it entirely) must not
  // crash and must still hide `__contactType`.
  it('keeps HIDDEN_COLS when the parent does not forward hiddenColumns at all', () => {
    render(<ContactsTable {...defaultProps} />);
    const hidden = JSON.parse(screen.getByTestId('data-table').getAttribute('data-hidden-columns'));
    expect(hidden).toContain('__contactType');
  });
});
