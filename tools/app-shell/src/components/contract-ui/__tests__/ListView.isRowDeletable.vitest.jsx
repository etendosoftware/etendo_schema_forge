/**
 * ETP-4871 — ListView's optional `isRowDeletable` prop, which gates the generic bulk-delete
 * button (the selection-bar "Delete selected") for a mixed selection.
 *
 * This is deliberately a SEPARATE concern from `isRowSelectable` and from the bulk-delete
 * REQUEST wiring covered in `ListView.bulkDelete.vitest.jsx` (which this file reuses the
 * harness/mocks from) — it only touches whether the button is disabled and whether it shows a
 * tooltip, never whether/how the delete request itself runs.
 *
 * The single highest-value case here is (a): when the prop is absent, behavior must be
 * byte-identical to every window that predates ETP-4871 — this is the regression-proof test
 * that no other window's bulk delete was silently changed by this feature.
 */
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/test-entity', search: '' }),
  NavLink: ({ children, ...props }) => <a {...props}>{children}</a>,
}));

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key, { field } = {}) => (field ? null : key),
  // Renders the key plus its interpolation vars, so `bulkDeleteBlockedTooltip`'s `count` can
  // be asserted on the resulting text without needing the real locale dictionary loaded.
  useUI: () => (key, vars) => (vars ? `${key}(${JSON.stringify(vars)})` : key),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

// `useEntity`'s `items` drive what ListView hands the Table as `data` — mutable per test
// (via `mockItems`, reassigned before each render) rather than the fixed `items: []` the
// sibling ListView.bulkDelete.vitest.jsx harness uses, since each case here needs its own
// specific deletable/non-deletable row mix.
let mockItems = [];
vi.mock('@/hooks/useEntity', () => ({
  useEntity: () => ({
    items: mockItems,
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
vi.mock('../DocumentPrintDrawer.jsx', () => ({ default: () => null, printDocuments: vi.fn() }));
vi.mock('../ListFilterBar.jsx', () => ({ ListFilterBar: () => <div data-testid="list-filter-bar" /> }));
vi.mock('@/lib/gridQuery', () => ({ buildAdvancedFilterCriteria: () => null }));
vi.mock('@/hooks/useWindowFilterPresets', () => ({
  useWindowFilterPresets: () => ({ presets: {}, savePreset: vi.fn(), deletePreset: vi.fn() }),
}));

import { ListView } from '../ListView.jsx';

// Same shape as ListView.bulkDelete.vitest.jsx's SelectableCapturingTable: a "select all"
// button that forwards ListView's own `data` (== hook.items == the current `mockItems`) back
// through `onSelectionChange`, so each case's row mix ends up as the selection.
function SelectableCapturingTable({ data, onSelectionChange }) {
  return (
    <table data-testid="mock-table">
      <tbody>
        <tr>
          <td>
            <button
              type="button"
              data-testid="trigger-select"
              onClick={() => onSelectionChange?.(data)}
            >
              select-all
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

const ROWS_ALL_DELETABLE = [{ id: 'r1', deletable: true }, { id: 'r2', deletable: true }];
const ROWS_MIXED = [{ id: 'r1', deletable: true }, { id: 'r2', deletable: false }];
const ROWS_NO_FLAG = [{ id: 'r1' }, { id: 'r2' }];
const ROWS_ALL_BLOCKED = [{ id: 'r1', deletable: false }, { id: 'r2', deletable: false }];

function renderList(items, extraProps = {}) {
  mockItems = items;
  render(
    <ListView
      entity="testEntity"
      Table={SelectableCapturingTable}
      entityLabel="Test Entity"
      windowName="test-entity"
      token="fake-token"
      apiBaseUrl="http://localhost/api"
      {...extraProps}
    />,
  );
  fireEvent.click(screen.getByTestId('trigger-select'));
}

describe('ListView — isRowDeletable (ETP-4871)', () => {
  beforeEach(() => {
    mockItems = [];
  });

  // ── (a) absent → unchanged behavior — the regression-proof case ───────────
  // ETP-4972 — the button became icon-only, so it now always carries a
  // `title` tooltip (previously it had a visible "Eliminar" label and no
  // title at all when not blocked). The blocked-tooltip title still
  // overrides this default one — see the (c)/(d) cases below.
  it('prop absent: the button is never disabled by this mechanism, plain delete tooltip, for a mix that would otherwise be blocked', () => {
    renderList(ROWS_MIXED);

    const button = screen.getByTestId('bulk-delete-selected');
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute('title', 'delete');
  });

  it('prop absent: still not disabled even when every row has no deletable flag at all', () => {
    renderList(ROWS_NO_FLAG);

    expect(screen.getByTestId('bulk-delete-selected')).not.toBeDisabled();
  });

  // ── (b) present, every selected row passes ─────────────────────────────────
  it('prop present, every row deletable: button enabled, plain delete tooltip', () => {
    renderList(ROWS_ALL_DELETABLE, { isRowDeletable: (row) => row.deletable === true });

    const button = screen.getByTestId('bulk-delete-selected');
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute('title', 'delete');
  });

  // ── (c) present, some selected rows fail ───────────────────────────────────
  it('prop present, one of two rows blocked: button disabled with a tooltip reporting the count', () => {
    renderList(ROWS_MIXED, { isRowDeletable: (row) => row.deletable === true });

    const button = screen.getByTestId('bulk-delete-selected');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'bulkDeleteBlockedTooltip({"count":1})');
  });

  it('prop present, all rows blocked: button disabled, tooltip reports the full count', () => {
    renderList(ROWS_ALL_BLOCKED, { isRowDeletable: (row) => row.deletable === true });

    const button = screen.getByTestId('bulk-delete-selected');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'bulkDeleteBlockedTooltip({"count":2})');
  });

  it('prop present, nothing in the current selection fails the predicate: plain delete tooltip', () => {
    renderList(ROWS_ALL_DELETABLE, { isRowDeletable: () => true });

    expect(screen.getByTestId('bulk-delete-selected')).toHaveAttribute('title', 'delete');
  });
});
