// @covers tools/app-shell/src/windows/custom/contacts/ContactsTable.jsx
// @covers tools/app-shell/src/windows/custom/contacts/contactsWebUrl.js
// --- Mocks (before imports) ---

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocale: () => ({ genericLabels: {} }),
}));

// DataTable is a thin stub, but exposes a button that fires `onDeleteRow` so the
// confirm-delete dialog + toast flow (ETP-5026) can be exercised without a real grid.
// It also keeps its last props, so a test can render a column's own cell renderer.
let dataTableProps = null;
vi.mock('@/components/contract-ui', () => ({
  DataTable: (props) => (dataTableProps = props) && (
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
  Tag: ({ label, children }) => <span data-testid="tag">{label}{children}</span>,
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

vi.mock('../ContactsEmptyState.jsx', () => ({
  default: ({ context }) => <div data-testid="contacts-empty-state-stub" data-has-create={String(Boolean(context?.onCreate))} />,
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

  describe('website column (link tag)', () => {
    function renderWebsiteCell(value, onRowClick = vi.fn()) {
      render(<ContactsTable {...defaultProps} />);
      const column = dataTableProps.columns.find((c) => c.key === 'etgoWeb');
      const cell = column.render({ id: 'bp-1', etgoWeb: value });
      // The row's own click handler, standing in for DataTable's navigate-to-record.
      render(<div data-testid="row" onClick={onRowClick}>{cell}</div>);
      return onRowClick;
    }

    it.each([
      // [stored value, label (no scheme), href]
      ['acme.example', 'acme.example', 'https://acme.example'],
      ['https://acme.example/es', 'acme.example/es', 'https://acme.example/es'],
      ['  HTTP://Acme.example  ', 'Acme.example', 'https://Acme.example'],
      // A hostile value can only ever become an https navigation, never a javascript: link.
      ['javascript:x', 'javascript:x', 'https://javascript:x'],
    ])('%s renders as a new-tab link labelled %s to %s', (value, label, href) => {
      renderWebsiteCell(value);
      const link = screen.getByTestId('ContactsTable__websiteLink');
      expect(link).toHaveTextContent(label);
      expect(link).toHaveAttribute('title', label);
      expect(link).toHaveAttribute('href', href);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('does not let a click on the link reach the row (no navigation to the record)', () => {
      const onRowClick = renderWebsiteCell('acme.example');
      fireEvent.click(screen.getByTestId('ContactsTable__websiteLink'));
      expect(onRowClick).not.toHaveBeenCalled();
    });

    it.each([[''], ['   '], [null]])('renders an empty value (%j) as a plain cell, not a link', (value) => {
      renderWebsiteCell(value);
      expect(screen.queryByTestId('ContactsTable__websiteLink')).toBeNull();
      expect(screen.getByTestId('row').querySelector('a')).toBeNull();
    });
  });

  describe('empty list (emptyListContext)', () => {
    it('renders ContactsEmptyState instead of the grid, handing it the context', () => {
      render(<ContactsTable {...defaultProps} emptyListContext={{ onCreate: vi.fn() }} />);
      expect(screen.getByTestId('contacts-empty-state-stub')).toHaveAttribute('data-has-create', 'true');
      expect(screen.queryByTestId('data-table')).toBeNull();
    });
  });
});
