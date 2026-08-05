/**
 * ETP-4656 — ListView's "Delete selected" wiring (useBulkRowDelete integration).
 *
 * `@/hooks/useBulkRowDelete` is mocked here (its own outcome logic — all
 * succeed / partial failure / all fail — is covered directly in
 * useBulkRowDelete.vitest.jsx). This file verifies ONLY what ListView does
 * with the hook's contract:
 *   - renders the "Delete selected" button when rows are selected, and wires
 *     its onClick to requestBulkDelete(selectedRows);
 *   - the two opt-outs (windowReadOnly, listViewOptions.hideBulkDelete) hide the
 *     button; merely supplying selectionBarRightActions does NOT (a host that
 *     wants to suppress the generic action must opt out explicitly — see the
 *     ETP-4656 review fix, inferring it from that prop's mere presence was
 *     fragile since selectionBarRightActions can be used for unrelated things);
 *   - the onSuccess callback passed to the hook correctly drives
 *     clearSelection / setSelectedRows / deselectTrigger+deselectRowIds and
 *     triggers hook.refresh() for all three outcomes.
 *
 * Harness mirrors ListView.vitest.jsx (same Table-mock and useEntity-mock style).
 */
import { render, screen, fireEvent, act } from '@testing-library/react';

// ETP-4576 — ListView reads the CSRF proof from the auth context for the writes
// useEntity issues, so mounting it needs that context. Shared mock; the default
// value is restored before each test by src/test/setup.js.
vi.mock('@/auth/AuthContext.jsx', async () =>
  (await import('@/test/authContextMock.js')).authContextMock);


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

const refreshMock = vi.fn();
vi.mock('@/hooks/useEntity', () => ({
  useEntity: () => ({
    items: [],
    loading: false,
    loadingMore: false,
    hasMore: false,
    refresh: refreshMock,
    loadMore: vi.fn(),
    sortColumn: 'creationDate',
    sortDirection: 'desc',
    setSortColumn: vi.fn(),
    setSortDirection: vi.fn(),
  }),
}));

// Capture the options ListView passes to useBulkRowDelete (in particular
// `onSuccess`) so tests can invoke it directly to simulate each outcome,
// without re-testing the hook's own DELETE/toast logic.
let capturedBulkDeleteOptions = null;
const requestBulkDeleteMock = vi.fn();
vi.mock('@/hooks/useBulkRowDelete', () => ({
  useBulkRowDelete: (opts) => {
    capturedBulkDeleteOptions = opts;
    return {
      requestBulkDelete: requestBulkDeleteMock,
      bulkDeleteDialog: <div data-testid="bulk-delete-dialog-stub" />,
      deleting: false,
    };
  },
}));

vi.mock('@/components/layout/PageMetaContext', () => ({
  useSetPageMeta: vi.fn(),
}));
vi.mock('@/components/layout/FavoritesContext', () => ({
  useFavorites: () => ({ favorites: [], toggleFavorite: vi.fn(), isFavorite: () => false }),
}));

vi.mock('../ReportDrawer.jsx', () => ({ default: () => null }));
vi.mock('../DocumentPrintDrawer.jsx', () => ({ default: () => null, printDocuments: vi.fn() }));
vi.mock('../ListFilterBar.jsx', () => ({ ListFilterBar: () => <div data-testid="list-filter-bar" /> }));
vi.mock('@/lib/gridQuery', () => ({ buildAdvancedFilterCriteria: () => null }));
vi.mock('@/hooks/useWindowFilterPresets', () => ({
  useWindowFilterPresets: () => ({ presets: {}, savePreset: vi.fn(), deletePreset: vi.fn() }),
}));

import { ListView } from '../ListView.jsx';

// Drives selectedRows non-empty via the forwarded onSelectionChange, and
// surfaces deselectTrigger/deselectRowIds so tests can assert what ListView
// forwards to the grid after a partial/full bulk-delete outcome.
let capturedDeselect = { trigger: 0, ids: [] };
function SelectableCapturingTable({ data, onSelectionChange, deselectTrigger, deselectRowIds }) {
  capturedDeselect = { trigger: deselectTrigger, ids: deselectRowIds };
  return (
    <table data-testid="mock-table">
      <tbody>
        <tr>
          <td>
            <button
              data-testid="trigger-select"
              onClick={() => onSelectionChange?.(data.length ? data : [{ id: 'r1' }, { id: 'r2' }])}
            >
              select-all
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

describe('ListView — bulk delete wiring (ETP-4656)', () => {
  const defaultProps = {
    entity: 'testEntity',
    Table: SelectableCapturingTable,
    entityLabel: 'Test Entity',
    windowName: 'test-entity',
    token: 'fake-token',
    apiBaseUrl: 'http://localhost/api',
  };

  beforeEach(() => {
    capturedBulkDeleteOptions = null;
    capturedDeselect = { trigger: 0, ids: [] };
    requestBulkDeleteMock.mockClear();
    refreshMock.mockClear();
  });

  function selectRows() {
    fireEvent.click(screen.getByTestId('trigger-select'));
  }

  // ── visibility ──────────────────────────────────────────────────────────

  it('renders the "Delete selected" button when rows are selected', () => {
    render(<ListView {...defaultProps} />);
    expect(screen.queryByTestId('bulk-delete-selected')).not.toBeInTheDocument();

    selectRows();

    expect(screen.getByTestId('bulk-delete-selected')).toBeInTheDocument();
  });

  it('wires the button onClick to requestBulkDelete(selectedRows)', () => {
    render(<ListView {...defaultProps} />);
    selectRows();

    fireEvent.click(screen.getByTestId('bulk-delete-selected'));

    expect(requestBulkDeleteMock).toHaveBeenCalledWith([{ id: 'r1' }, { id: 'r2' }]);
  });

  it('always mounts the bulkDeleteDialog', () => {
    render(<ListView {...defaultProps} />);
    expect(screen.getByTestId('bulk-delete-dialog-stub')).toBeInTheDocument();
  });

  it('opt-out: hides the button when the window is read-only', () => {
    render(<ListView {...defaultProps} api={{ window: { readOnly: true }, crud: {} }} />);
    selectRows();
    expect(screen.queryByTestId('bulk-delete-selected')).not.toBeInTheDocument();
  });

  it('does NOT infer an opt-out from the host supplying selectionBarRightActions alone (must opt out explicitly)', () => {
    const selectionBarRightActions = () => <button data-testid="host-own-action">Host action</button>;
    render(<ListView {...defaultProps} selectionBarRightActions={selectionBarRightActions} />);
    selectRows();
    // Both the generic action and the host's own action render side by side — a host
    // that wants to suppress the generic one must opt out via listViewOptions.hideBulkDelete
    // (see the next test), not merely by passing selectionBarRightActions.
    expect(screen.getByTestId('bulk-delete-selected')).toBeInTheDocument();
    expect(screen.getByTestId('host-own-action')).toBeInTheDocument();
  });

  it('opt-out: hides the button when listViewOptions.hideBulkDelete is set', () => {
    render(<ListView {...defaultProps} listViewOptions={{ hideBulkDelete: true }} />);
    selectRows();
    expect(screen.queryByTestId('bulk-delete-selected')).not.toBeInTheDocument();
  });

  it('opt-out: listViewOptions.hideBulkDelete still hides the button when selectionBarRightActions is also supplied (contacts-style)', () => {
    const selectionBarRightActions = () => <button data-testid="host-own-action">Host action</button>;
    render(
      <ListView
        {...defaultProps}
        selectionBarRightActions={selectionBarRightActions}
        listViewOptions={{ hideBulkDelete: true }}
      />
    );
    selectRows();
    expect(screen.queryByTestId('bulk-delete-selected')).not.toBeInTheDocument();
    expect(screen.getByTestId('host-own-action')).toBeInTheDocument();
  });

  it('regression: the button IS shown when only some unrelated listViewOptions are set', () => {
    render(<ListView {...defaultProps} listViewOptions={{ hideEye: true }} />);
    selectRows();
    expect(screen.getByTestId('bulk-delete-selected')).toBeInTheDocument();
  });

  // ── onSuccess outcome wiring ────────────────────────────────────────────

  describe('onSuccess outcome handling', () => {
    it('all succeeded: refreshes the grid and clears the selection entirely', () => {
      render(<ListView {...defaultProps} />);
      selectRows();
      expect(screen.getByTestId('selection-count')).toBeInTheDocument();

      const allRows = [{ id: 'r1' }, { id: 'r2' }];
      act(() => { capturedBulkDeleteOptions.onSuccess(allRows, []); });

      expect(refreshMock).toHaveBeenCalled();
      // Selection cleared -> the selection toolbar (and its bulk-delete button) disappears.
      expect(screen.queryByTestId('selection-count')).not.toBeInTheDocument();
      expect(screen.queryByTestId('bulk-delete-selected')).not.toBeInTheDocument();
    });

    it('partial failure: refreshes the grid, keeps only the failed rows selected, and bumps deselectTrigger with the succeeded ids', () => {
      render(<ListView {...defaultProps} />);
      selectRows();

      const succeeded = [{ id: 'r1' }];
      const failed = [{ id: 'r2' }];
      act(() => { capturedBulkDeleteOptions.onSuccess(succeeded, failed); });

      expect(refreshMock).toHaveBeenCalled();
      // Only the failed row remains selected -> selection count reflects 1, not 2.
      expect(screen.getByTestId('selection-count')).toBeInTheDocument();
      expect(screen.getByTestId('bulk-delete-selected').textContent).toContain('(1)');
      // DataTable's deselect mechanism is told to drop the succeeded id.
      expect(capturedDeselect.trigger).toBe(1);
      expect(capturedDeselect.ids).toEqual(['r1']);
    });

    it('all failed: does NOT refresh the grid and leaves the selection untouched', () => {
      render(<ListView {...defaultProps} />);
      selectRows();

      const allRows = [{ id: 'r1' }, { id: 'r2' }];
      act(() => { capturedBulkDeleteOptions.onSuccess([], allRows); });

      expect(refreshMock).not.toHaveBeenCalled();
      // Selection still shows both rows.
      expect(screen.getByTestId('bulk-delete-selected').textContent).toContain('(2)');
      // No deselect bump — deselectTrigger stays at its initial value.
      expect(capturedDeselect.trigger).toBe(0);
    });
  });
});
