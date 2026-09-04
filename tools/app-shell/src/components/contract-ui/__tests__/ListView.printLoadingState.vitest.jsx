/**
 * ETP-5129 — SelectionToolbar's bulk-print button had no loading/disabled
 * state at all: a slow print (one client render per selected document plus
 * a jsreport network round-trip) gave no visible feedback on the first
 * click, so an impatient re-click fired a second, fully independent
 * `printDocuments()` call — whichever of the two finished (and wasn't
 * silently dropped by the browser's popup blocker, since `window.open` sits
 * several `await`s past the click) is what looked like "the second click
 * did it".
 *
 * `printDocuments` (../DocumentPrintDrawer.jsx) is mocked with a
 * controllable deferred promise so tests can assert the button's state
 * WHILE a print is still pending, not just after it settles. Per QA
 * (Sentinel) review of ETP-5129: the primary proof of re-entrancy is the
 * mock's CALL COUNT, not the DOM `disabled` attribute alone — a fast
 * double-click can outrace a DOM assertion.
 *
 * Harness mirrors ListView.bulkDelete.vitest.jsx (same Table-mock style;
 * that file's own "idle-toolbar Print button" block is how
 * `screen.getByTitle('print')` is known to uniquely target the
 * SelectionToolbar's icon-only Print button, as opposed to the idle
 * top-right Print button which renders a visible text node instead of a
 * `title` attribute).
 *
 * Row-object fixtures ({ id: 'r1' }), not bare id strings — ETP-5124's
 * (not yet merged) draft-exclusion commit touches this same onClick via a
 * `toPrintableDocument()` filter over row objects, so this file is written
 * to survive that merge unchanged.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/test-entity', search: '' }),
  NavLink: ({ children, ...props }) => <a {...props}>{children}</a>,
}));

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key, { field } = {}) => (field ? null : key),
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/hooks/useEntity', () => ({
  useEntity: () => ({
    items: [],
    loading: false,
    loadingMore: false,
    hasMore: false,
    refresh: vi.fn(),
    loadMore: vi.fn(),
    sortColumn: 'creationDate',
    sortDirection: 'desc',
    setSortColumn: vi.fn(),
    setSortDirection: vi.fn(),
  }),
}));

vi.mock('@/hooks/useBulkRowDelete', () => ({
  useBulkRowDelete: () => ({
    requestBulkDelete: vi.fn(),
    bulkDeleteDialog: <div data-testid="bulk-delete-dialog-stub" />,
    deleting: false,
  }),
}));

vi.mock('@/components/layout/PageMetaContext', () => ({
  useSetPageMeta: vi.fn(),
}));
vi.mock('@/components/layout/FavoritesContext', () => ({
  useFavorites: () => ({ favorites: [], toggleFavorite: vi.fn(), isFavorite: () => false }),
}));

vi.mock('../ReportDrawer.jsx', () => ({ default: () => null }));

// The mock's call count is the primary re-entrancy proof throughout this
// file. `printDocumentsMock` is referenced through a wrapper arrow function
// (not passed directly as the property value) because `vi.mock` factories
// are hoisted above the whole module and invoked as soon as ListView.jsx is
// first imported — a direct reference is resolved at that (too-early) call
// time and throws a TDZ error; wrapping it in a function that's only
// invoked later, when ListView.jsx actually calls `printDocuments(...)` at
// click time, defers the lookup until after this const has initialized.
const printDocumentsMock = vi.fn();
vi.mock('../DocumentPrintDrawer.jsx', () => ({
  default: () => null,
  printDocuments: (...args) => printDocumentsMock(...args),
}));

vi.mock('../ListFilterBar.jsx', () => ({ ListFilterBar: () => <div data-testid="list-filter-bar" /> }));
vi.mock('@/lib/gridQuery', () => ({ buildAdvancedFilterCriteria: () => null }));
vi.mock('@/hooks/useWindowFilterPresets', () => ({
  useWindowFilterPresets: () => ({ presets: {}, savePreset: vi.fn(), deletePreset: vi.fn() }),
}));

import { ListView } from '../ListView.jsx';

// Two selectable buttons so a test can change the selection WHILE a print is
// in flight — ETP-5129's "in flight" lock is a single boolean, not
// row-scoped like the drawer's `currentDocId`, so this proves a changed
// selection does not unlock a second concurrent print.
function SelectableCapturingTable({ onSelectionChange }) {
  return (
    <table data-testid="mock-table">
      <tbody>
        <tr>
          <td>
            <button data-testid="select-ab" onClick={() => onSelectionChange?.([{ id: 'r1' }, { id: 'r2' }])}>
              select-ab
            </button>
            <button data-testid="select-c" onClick={() => onSelectionChange?.([{ id: 'r3' }])}>
              select-c
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('ListView — bulk-print loading/disabled state (ETP-5129)', () => {
  const defaultProps = {
    entity: 'testEntity',
    Table: SelectableCapturingTable,
    entityLabel: 'Test Entity',
    windowName: 'test-entity',
    token: 'fake-token',
    apiBaseUrl: 'http://localhost/api',
  };

  beforeEach(() => {
    printDocumentsMock.mockReset();
  });

  function selectRows(testId = 'select-ab') {
    fireEvent.click(screen.getByTestId(testId));
  }

  it('calls printDocuments with the selected row ids on click', () => {
    printDocumentsMock.mockReturnValue(new Promise(() => {})); // never settles — irrelevant to this assertion
    render(<ListView {...defaultProps} />);
    selectRows();
    fireEvent.click(screen.getByTitle('print'));
    expect(printDocumentsMock).toHaveBeenCalledWith(
      'test-entity',
      ['r1', 'r2'],
      'fake-token',
      expect.any(Function),
      'http://localhost/api',
    );
  });

  it('disables the print button the instant a print starts, before it resolves', () => {
    const { promise } = deferred();
    printDocumentsMock.mockReturnValue(promise);
    render(<ListView {...defaultProps} />);
    selectRows();
    const printBtn = screen.getByTitle('print');
    expect(printBtn).not.toBeDisabled();

    fireEvent.click(printBtn);

    expect(printBtn).toBeDisabled();
  });

  it('rejects a second (and third) click while a print is still in flight — proven by call count, not just DOM state', async () => {
    const { promise, resolve } = deferred();
    printDocumentsMock.mockReturnValue(promise);
    render(<ListView {...defaultProps} />);
    selectRows();
    const printBtn = screen.getByTitle('print');

    fireEvent.click(printBtn);
    fireEvent.click(printBtn);
    fireEvent.click(printBtn);

    // The call count is the assertion that survives a double-click racing
    // ahead of a DOM re-render — a fast triple-click must still register as
    // exactly ONE print.
    expect(printDocumentsMock).toHaveBeenCalledTimes(1);

    resolve();
    await waitFor(() => expect(printBtn).not.toBeDisabled());
  });

  it('a selection change while a print is in flight does not unlock a second call — the lock is not row-scoped', async () => {
    const { promise, resolve } = deferred();
    printDocumentsMock.mockReturnValue(promise);
    render(<ListView {...defaultProps} />);
    selectRows('select-ab');
    const printBtn = screen.getByTitle('print');

    fireEvent.click(printBtn);
    expect(printDocumentsMock).toHaveBeenCalledTimes(1);
    expect(printDocumentsMock).toHaveBeenLastCalledWith(
      'test-entity', ['r1', 'r2'], expect.anything(), expect.anything(), expect.anything(),
    );

    // Selection changes while the first print is still pending.
    selectRows('select-c');
    fireEvent.click(printBtn);

    // Still just the one in-flight call.
    expect(printDocumentsMock).toHaveBeenCalledTimes(1);

    resolve();
    await waitFor(() => expect(printBtn).not.toBeDisabled());

    // Now that the first print settled, a click with the NEW selection is allowed.
    printDocumentsMock.mockReturnValue(new Promise(() => {}));
    fireEvent.click(printBtn);
    expect(printDocumentsMock).toHaveBeenCalledTimes(2);
    expect(printDocumentsMock).toHaveBeenLastCalledWith(
      'test-entity', ['r3'], expect.anything(), expect.anything(), expect.anything(),
    );
  });

  it('clears the loading state on failure too (finally, not just the happy path)', async () => {
    printDocumentsMock.mockRejectedValueOnce(new Error('boom'));
    render(<ListView {...defaultProps} />);
    selectRows();
    const printBtn = screen.getByTitle('print');

    fireEvent.click(printBtn);
    await waitFor(() => expect(printBtn).not.toBeDisabled());

    // The lock was released after the failure, so a second click is allowed
    // and fires a fresh, independent print.
    printDocumentsMock.mockResolvedValueOnce();
    fireEvent.click(printBtn);
    await waitFor(() => expect(printDocumentsMock).toHaveBeenCalledTimes(2));
  });
});
