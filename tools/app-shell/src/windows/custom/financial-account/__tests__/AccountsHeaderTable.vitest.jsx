/**
 * AccountsHeaderTable — rendering, contract-driven columns and filtering.
 *
 * ETP-4658: this slot component replaced `pages/FinancialAccountsPage.jsx` (the
 * hand-assembled page that lived on the hardcoded `finance/accounts` route). It is
 * mounted by the generated `AccountPage` through `window.customComponents.headerTable`,
 * so the rows now arrive as ListView's `data` prop and the sidebar aggregates as
 * `meta.summary` instead of coming from `useFinancialAccounts()`.
 *
 * The list/filter half of the retired page's suite is re-homed here (default view hides
 * archived accounts, "Inactivas" shows only archived across types, search inside the
 * inactive view, missing `active` flag counts as active) plus the new surface the slot
 * owns: the contract-driven data columns (headers from `gridLabelKey`, cell bodies bound
 * through `cellType` → ACCOUNT_CELL_TYPES), the one hand-appended actions column, the
 * stopPropagation guards that keep the pill / row actions from triggering row navigation, and
 * the ETP-4656 toolbar ↔ selection-bar swap the slot performs off ListView's `selectedRows`.
 *
 * The component lives in the artifact (`artifacts/financial-account/custom/`), which
 * vitest's `include` (`src/**`) does not collect — hence this file sits under the
 * app-shell window folder and imports through the `@generated` alias, the same
 * convention the other artifact custom components follow.
 */
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  // ListSortPopover (rendered in the toolbar since ETP-4921) resolves each menu entry
  // through resolveColumnLabel, which needs the AD dictionary translator.
  useLabel: () => (key) => key,
  useUI: () => (key, params = {}) => {
    if (key === 'financeAccountsReconcilePending') return `Conciliar (${params.count})`;
    return key;
  },
  useLocaleSwitch: () => ({ locale: 'es_ES', setLocale: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Bank connection hooks reach useAuth internally — stub at the module level (no AuthProvider needed).
vi.mock('@/hooks/useBankConnectionActions.js', () => ({
  useBankConnectionActions: () => ({ sync: vi.fn(), disconnect: vi.fn() }),
  launchSaltEdgePopup: vi.fn(),
}));
vi.mock('@/hooks/useBankConnectionFlow.js', () => ({
  useBankConnectionFlow: () => ({ startConnect: vi.fn(), startCreate: vi.fn() }),
}));

// Modals are covered by their own suites; stub them so this file stays focused on the slot.
vi.mock('@/windows/custom/financial-account/NewAccountWizard.jsx', () => ({
  NewAccountWizard: ({ open }) => <div data-testid="wizard" data-open={String(open)} />,
}));
vi.mock('@/windows/custom/financial-account/EditAccountModal.jsx', () => ({
  EditAccountModal: ({ open }) => <div data-testid="edit-modal" data-open={String(open)} />,
}));
vi.mock('@/windows/custom/financial-account/ArchiveAccountDialog.jsx', () => ({
  ArchiveAccountDialog: ({ open }) => <div data-testid="archive-dialog" data-open={String(open)} />,
}));
// ETP-4871 — a sibling of ArchiveAccountDialog, not a mode of it: mounted the same
// unconditional way in AccountsHeaderTable.jsx, so it needs the same module-level stub —
// otherwise the REAL component renders and its own `useAccountMutations()` call reaches the
// real (unmocked) `useAuth()`, throwing "useAuth must be used within AuthProvider" for every
// test in this file.
vi.mock('@/windows/custom/financial-account/DeleteAccountDialog.jsx', () => ({
  DeleteAccountDialog: ({ open }) => <div data-testid="delete-dialog" data-open={String(open)} />,
}));
vi.mock('@/windows/custom/financial-account/BankConnectionFlowUI.jsx', () => ({
  BankConnectionFlowUI: () => <div data-testid="bank-connection-flow" />,
}));
vi.mock('@/windows/custom/financial-account/FundsTransferModal.jsx', () => ({
  FundsTransferModal: (props) => <div data-testid="transfer-modal" data-source={props.sourceAccountId} />,
}));

/**
 * Faithful-but-minimal DataTable stub: it reproduces the three behaviours this suite
 * depends on — the generic `row-{id}` testid (DataTable.jsx emits exactly that and it
 * is not overridable from `columns`), the `cell-{rowId}-{colKey}` cell testids, and a
 * row-level click that calls `onNavigate(row)` with the WHOLE ROW (DataTable.jsx ~1902:
 * `else if (onNavigate) onNavigate(row);`) — while still invoking the real `col.render`
 * callbacks so the actual cell components (NameCell / TypeCell / BalanceCell /
 * ReconcilePill / AccountRowActions) render. Rendering the real DataTable here would
 * drag in filters, sorting and inline-add, none of which this slot configures.
 */
let tableProps = null;
vi.mock('@/components/contract-ui', () => ({
  DataTable: (props) => {
    tableProps = props;
    const { columns, data, onNavigate } = props;
    return (
      <div data-testid="data-table">
        {(data ?? []).map((row) => (
          <div
            key={row.id}
            data-testid={`row-${row.id}`}
            role="presentation"
            onClick={() => onNavigate?.(row)}
          >
            {columns.map((col) => (
              <span key={col.key} data-testid={`cell-${col.key}-${row.id}`}>
                {col.render ? col.render(row) : String(row[col.key] ?? '')}
              </span>
            ))}
          </div>
        ))}
      </div>
    );
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

import AccountsHeaderTable, { filterAccounts } from '@generated/financial-account/custom/AccountsHeaderTable.jsx';
import { AccountTypeFilter } from '@/components/financial-accounts';

const BASE_ACCOUNTS = [
  {
    id: 'acc-1',
    name: 'BBVA Principal',
    type: 'B',
    currentBalance: 1000,
    currencyIso: 'EUR',
    iban: 'ES1212340000000000000001',
    eTGOPendingCount: 3,
    bankConnected: true,
    active: true,
  },
  {
    id: 'acc-2',
    name: 'Caja Tienda',
    type: 'C',
    currentBalance: 50,
    currencyIso: 'EUR',
    eTGOPendingCount: 0,
    active: true,
  },
  {
    id: 'acc-3',
    name: 'Visa Corporate',
    type: 'CA',
    currentBalance: -120,
    currencyIso: 'USD',
    maskedPan: '**** 4321',
    eTGOPendingCount: 1,
    bankConnected: false,
    active: true,
  },
];

// A mix that includes archived (inactive) accounts of different types.
const MIXED_ACCOUNTS = [
  ...BASE_ACCOUNTS,
  { id: 'acc-4', name: 'Santander Cerrada', type: 'B', currentBalance: 0, currencyIso: 'EUR', eTGOPendingCount: 0, active: false },
  { id: 'acc-5', name: 'Caja Antigua', type: 'C', currentBalance: 0, currencyIso: 'EUR', eTGOPendingCount: 0, active: false },
];

const SUMMARY = {
  totalBalance: 930,
  byCurrency: [
    { currencyIso: 'EUR', total: 1050 },
    { currencyIso: 'USD', total: -120 },
  ],
  pending: { accountsWithPending: 2, suggestionsReady: 0, byRule: 0 },
};

function renderTable({ data = BASE_ACCOUNTS, meta = { summary: SUMMARY }, ...rest } = {}) {
  return render(<AccountsHeaderTable data={data} meta={meta} {...rest} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  tableProps = null;
});

describe('AccountsHeaderTable — layout', () => {
  it('renders the toolbar, the KPI sidebar and the grid inside the card container', () => {
    renderTable();

    expect(screen.getByTestId('cuentas-card')).toBeInTheDocument();
    expect(screen.getByTestId('cuentas-toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('cuentas-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('data-table')).toBeInTheDocument();
  });

  it('renders one grid row per visible account using DataTable\'s generic row testid', () => {
    renderTable();

    expect(screen.getByTestId('row-acc-1')).toBeInTheDocument();
    expect(screen.getByTestId('row-acc-2')).toBeInTheDocument();
    expect(screen.getByTestId('row-acc-3')).toBeInTheDocument();
  });

  // ETP-4656 regression guard. Only ONE suppression is left as a DataTable prop, and it
  // is load-bearing: totalling `amount` columns would sum balances across currencies
  // without conversion. `selectable` must NOT be suppressed — DataTable defaults it to
  // true, and that default is what renders the checkbox column and makes ListView's
  // standardized selection bar ("Eliminar seleccionados") reachable. A hardcoded
  // `selectable={false}` here is exactly what dropped grid multi-select delete from
  // this window; the story's scope table requires it (Cuentas financieras: GM ✅).
  it('leaves the checkbox column reachable and suppresses only footer totals', () => {
    renderTable();

    expect(tableProps.selectable).not.toBe(false);
    expect(tableProps.showFooterTotals).toBe(false);
  });

  // Selection STATE belongs to ListView/DataTable. `selectedRows` is ListView's own prop
  // name for the authoritative selection, but DataTable calls its LOCAL state the same
  // thing and has no such prop — letting it ride the `{...props}` spread would read as a
  // controlled-selection API that does not exist. The slot must consume it, not relay it.
  it('consumes ListView\'s selectedRows instead of relaying it to DataTable', () => {
    renderTable({ selectedRows: [BASE_ACCOUNTS[0]] });

    expect(tableProps.selectedRows).toBeUndefined();
  });

  // `filters={[]}` was inert (ListView supplies `onFilterChange`, which wins), and
  // `rowQuickActions` / `hoverRowActions` are now declarative or already the default.
  // Passing them anyway hid where the real switch lives.
  // The retired page lifted the hovered row with a drop shadow instead of tinting it
  // (`hover:z-10 hover:shadow-lg` on AccountRow's <tr>). Moving onto the generic DataTable
  // lost that reading, so it is now an opt-in prop — behaviour covered by
  // tools/app-shell/src/components/contract-ui/__tests__/DataTable.rowHoverStyle.vitest.jsx
  it('asks DataTable for the elevated (card-like) row hover', () => {
    renderTable();

    expect(tableProps.rowHoverStyle).toBe('elevated');
  });

  it('passes no inert filter / quick-action overrides to the grid', () => {
    renderTable();

    expect(tableProps.filters).toBeUndefined();
    expect(tableProps.rowQuickActions).toBeUndefined();
    expect(tableProps.hoverRowActions).toBeUndefined();
  });

  it('forwards onDataMutated so the modals can refresh the list', () => {
    const onDataMutated = vi.fn();
    renderTable({ onDataMutated });

    expect(tableProps.onDataMutated).toBe(onDataMutated);
  });

  it('renders with no rows and no crash when data is null', () => {
    renderTable({ data: null });

    expect(screen.getByTestId('data-table')).toBeInTheDocument();
    expect(screen.queryByTestId('row-acc-1')).not.toBeInTheDocument();
  });

  it('renders with no rows and no crash when neither data nor meta are supplied', () => {
    render(<AccountsHeaderTable data-testid="bare" />);

    expect(screen.getByTestId('cuentas-card')).toBeInTheDocument();
    expect(screen.getByTestId('data-table')).toBeInTheDocument();
  });
});

/**
 * ETP-4656 unmounted this slot's own toolbar while a selection was active, so ListView's
 * selection bar read as its replacement. ETP-5111 REVERSES that: once the bar became a floating
 * pill (ETP-4972) the swap no longer replaced anything — it merely took "Nueva cuenta", the
 * filters, "Reglas de conciliación" and the "Ordenar por" control away from a user who had just
 * ticked one checkbox.
 *
 * So the toolbar is now permanently mounted, at every selection size. `selectedRows` is still
 * destructured in the slot (it must never reach DataTable, where the name means internal
 * selection state) but no longer gates anything — the structural half of that is pinned in
 * `artifacts/financial-account/custom/__tests__/AccountsHeaderTable.test.js`.
 */
describe('AccountsHeaderTable — toolbar stays mounted across selection changes', () => {
  it('keeps the toolbar mounted while nothing is selected', () => {
    renderTable({ selectedRows: [] });

    expect(screen.getByTestId('cuentas-toolbar')).toBeInTheDocument();
  });

  it('treats a missing selectedRows prop as an empty selection', () => {
    renderTable();

    expect(screen.getByTestId('cuentas-toolbar')).toBeInTheDocument();
  });

  it('keeps its own toolbar mounted while a selection is active', () => {
    renderTable({ selectedRows: [BASE_ACCOUNTS[0]] });

    expect(screen.getByTestId('cuentas-toolbar')).toBeInTheDocument();
    // …alongside everything that was already staying put.
    expect(screen.getByTestId('data-table')).toBeInTheDocument();
    expect(screen.getByTestId('cuentas-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('row-acc-1')).toBeInTheDocument();
  });

  // The actions a user reaches for WITH rows selected are exactly the ones the swap used to hide.
  it('keeps the toolbar actions reachable while a selection is active', () => {
    renderTable({ selectedRows: [BASE_ACCOUNTS[0]] });

    expect(screen.getByTestId('cuentas-new-account-button')).toBeInTheDocument();
    expect(screen.getByTestId('cuentas-matching-rules-button')).toBeInTheDocument();
    expect(screen.getByTestId('cuentas-search-input')).toBeInTheDocument();
  });

  it('keeps the toolbar mounted across a selection that fills and then empties', () => {
    const { rerender } = render(
      <AccountsHeaderTable data={BASE_ACCOUNTS} meta={{ summary: SUMMARY }} selectedRows={[BASE_ACCOUNTS[0]]} />,
    );
    expect(screen.getByTestId('cuentas-toolbar')).toBeInTheDocument();

    rerender(
      <AccountsHeaderTable data={BASE_ACCOUNTS} meta={{ summary: SUMMARY }} selectedRows={[]} />,
    );

    expect(screen.getByTestId('cuentas-toolbar')).toBeInTheDocument();
  });

  // The type filter and the search term live in this component's state. They had to survive the
  // old unmount; they must equally survive never unmounting — the grid stays filtered while rows
  // are selected (the user only ever bulk-deletes what they can see) and the input keeps its text.
  it('preserves the search term, and the toolbar itself, across a selection change', () => {
    const { rerender } = render(
      <AccountsHeaderTable data={BASE_ACCOUNTS} meta={{ summary: SUMMARY }} selectedRows={[]} />,
    );
    fireEvent.change(screen.getByTestId('cuentas-search-input'), { target: { value: 'visa' } });
    expect(screen.getByTestId('row-acc-3')).toBeInTheDocument();
    expect(screen.queryByTestId('row-acc-1')).not.toBeInTheDocument();

    rerender(
      <AccountsHeaderTable data={BASE_ACCOUNTS} meta={{ summary: SUMMARY }} selectedRows={[BASE_ACCOUNTS[2]]} />,
    );
    // Still filtered, and now the toolbar showing that filter is still on screen too.
    expect(screen.getByTestId('cuentas-toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('cuentas-search-input')).toHaveValue('visa');
    expect(screen.getByTestId('row-acc-3')).toBeInTheDocument();
    expect(screen.queryByTestId('row-acc-1')).not.toBeInTheDocument();

    rerender(
      <AccountsHeaderTable data={BASE_ACCOUNTS} meta={{ summary: SUMMARY }} selectedRows={[]} />,
    );

    expect(screen.getByTestId('cuentas-search-input')).toHaveValue('visa');
    expect(screen.queryByTestId('row-acc-1')).not.toBeInTheDocument();
  });
});

describe('AccountsHeaderTable — columns', () => {
  it('takes the data columns from the contract grid definition, in gridOrder', () => {
    renderTable();

    // contract.json → entities.account: name(1), type(2), country(3, ETP-4896),
    // currentBalance(4) and the stored computed column eTGOPendingCount(5).
    const dataKeys = tableProps.columns.map((c) => c.key).slice(0, 5);
    expect(dataKeys).toEqual(['name', 'type', 'country', 'currentBalance', 'eTGOPendingCount']);
  });

  it('appends exactly one synthetic column after the contract ones', () => {
    renderTable();

    // Only `_rowActions` is hand-written: its declarative equivalent
    // (`window.rowQuickActions`) renders an absolute hover overlay, not a column.
    expect(tableProps.columns.map((c) => c.key)).toEqual([
      'name', 'type', 'country', 'currentBalance', 'eTGOPendingCount', '_rowActions',
    ]);
  });

  it('carries the contract AD column name through to DataTable', () => {
    renderTable();

    const byKey = Object.fromEntries(tableProps.columns.map((c) => [c.key, c]));
    // `column` is what resolveColumnLabel feeds the AD dictionary and what
    // ListView's ReportDrawer maps on; it used to arrive undefined.
    expect(byKey.name.column).toBe('Name');
    expect(byKey.type.column).toBe('Type');
    expect(byKey.currentBalance.column).toBe('Currentbalance');
  });

  // Labels come off the contract (`gridLabelKey`), not from a hardcoded map: relabelling
  // a header is a decisions.json edit + regen. `labels[locale]` is resolveColumnLabel's
  // top-priority branch, so a declared key wins over the AD dictionary.
  it('labels the columns that declare a gridLabelKey through i18n for the active locale', () => {
    renderTable();

    const byKey = Object.fromEntries(tableProps.columns.map((c) => [c.key, c]));
    expect(byKey.name.labels).toEqual({ es_ES: 'financeAccountsColAccount' });
    expect(byKey.type.labels).toEqual({ es_ES: 'financeAccountsColType' });
    expect(byKey.currentBalance.labels).toEqual({ es_ES: 'financeAccountsColBalance' });
    // The actions column is deliberately unlabelled.
    expect(byKey._rowActions.labels).toEqual({ es_ES: '' });
  });

  // The pending column is the one that used to take the other branch. As a virtual field it
  // could not declare `gridLabelKey` (appendVirtualFields copies a closed whitelist), so it
  // got no `labels` override and its header had to be forced through
  // `window.labelOverrides`. Now that it is the EM_ETGO_Pending_Count stored computed column
  // it declares the key like every other field, and that override is gone.
  it('labels the pending column from its declared gridLabelKey, not an override', () => {
    renderTable();

    const pending = tableProps.columns.find((c) => c.key === 'eTGOPendingCount');
    expect(pending.labels).toEqual({ es_ES: 'financeAccountsColPending' });
    expect(pending.column).toBe('EM_ETGO_Pending_Count');
  });

  // The `labels` object only exists when a column declares a gridLabelKey. An empty one
  // would blank the header instead of falling back to `label` / `column` (the AD
  // dictionary), so the builder must omit the key rather than emit `{}`.
  it('omits labels entirely for a column with no gridLabelKey', () => {
    renderTable();

    const actions = tableProps.columns.find((c) => c.key === '_rowActions');
    // The actions column is the deliberate exception: it declares an EMPTY label on purpose.
    expect(actions.labels).toEqual({ es_ES: '' });
    expect(
      tableProps.columns.every((c) => c.labels === undefined || typeof c.labels === 'object'),
    ).toBe(true);
  });

  // The binding column → renderer is what `cellType` makes declarative; the cell
  // components themselves stay hand-written. Unit coverage for the registry itself:
  // tools/app-shell/src/components/financial-accounts/__tests__/accountCellTypes.vitest.jsx
  it('binds a renderer to every contract column through the cellType registry', () => {
    renderTable();

    for (const col of tableProps.columns) {
      expect(typeof col.render, `${col.key} must resolve a cell renderer`).toBe('function');
    }
  });

  // ETP-4921 inverted this: the list used to hardcode `sortable: false` on every column.
  // Sorting is server-side (ListView owns the state, useEntity turns it into NEO's `_sortBy`),
  // which is why "Por conciliar" first had to become a real AD column — a value injected in
  // afterHandle can only be reordered inside the page the SQL already picked.
  it('marks every data column sortable, and only the actions column not', () => {
    renderTable();

    for (const col of tableProps.columns) {
      if (col.key === '_rowActions') {
        expect(col.sortable, 'the actions column must never sort').toBe(false);
      } else {
        expect(col.sortable, `${col.key} must be sortable`).toBe(true);
      }
    }
  });

  // The Tipo cell shows TWO values (account type, and the IBAN under it), so one header could
  // only ever sort by one of them. The multiField decorator in decisions.json splits it into
  // two independently sortable segments — the same mechanism the Product list uses for
  // "Identificador & Nombre". `part.key` is the contract field name, so each segment's
  // `_sortBy` orders the whole dataset, not the loaded page.
  it('splits the Tipo header into independently sortable type and IBAN segments', () => {
    renderTable();

    const byKey = Object.fromEntries(tableProps.columns.map((c) => [c.key, c]));
    expect(byKey.type.parts).toEqual([
      { key: 'type', labels: { es_ES: 'financeAccountsColType' } },
      { key: 'iBAN', labels: { es_ES: 'financeAccountsColIban' } },
    ]);
    // The cell body is untouched: DataTable's `col.render` wins over the multiField cell
    // renderer, so TypeCell still draws the type label plus the chunked IBAN.
    expect(typeof byKey.type.render).toBe('function');
  });

  // Only Tipo carries a multiField decorator; a stray `parts` on any other column would
  // silently replace its header with segments.
  it('leaves every other column with a single-label header', () => {
    renderTable();

    for (const col of tableProps.columns) {
      if (col.key === 'type') continue;
      expect(col.parts, `${col.key} must not declare header parts`).toBeUndefined();
    }
  });

  it('pins the Figma column widths through headClass / cellClass', () => {
    renderTable();

    const byKey = Object.fromEntries(tableProps.columns.map((c) => [c.key, c]));
    expect(byKey.name.headClass).toContain('w-[480px]');
    // 40px, not the old 84px: NameCell's 44px drag-grip slot was removed in ETP-4921 and
    // this padding mirrors that cell's leading offset.
    expect(byKey.name.headClass).toContain('pl-[40px]');
    expect(byKey.name.cellClass).toContain('w-[480px]');
    expect(byKey.type.headClass).toContain('w-[340px]');
    expect(byKey.currentBalance.headClass).toContain('w-[200px]');
    expect(byKey.currentBalance.cellClass).toContain('w-[200px]');
    expect(byKey.eTGOPendingCount.headClass).toContain('w-[280px]');
    expect(byKey.eTGOPendingCount.cellClass).toContain('w-[280px]');
    expect(byKey._rowActions.cellClass).toContain('min-w-[90px]');
  });

  // DataTable already appends `text-right tabular-nums` for every numeric column type
  // (DataTable.jsx:1423, covered by DataTable.columnChrome.vitest.jsx). Repeating it in
  // the chrome duplicated the class, so the chrome now carries widths only and the
  // alignment rides on the contract `type: 'amount'` reaching DataTable.
  it('leaves numeric alignment to DataTable instead of restating it in the chrome', () => {
    renderTable();

    const byKey = Object.fromEntries(tableProps.columns.map((c) => [c.key, c]));
    expect(byKey.currentBalance.type).toBe('amount');
    expect(byKey.currentBalance.cellClass).not.toContain('text-right');
    expect(byKey.currentBalance.headClass).not.toContain('text-right');
  });

  it('renders the rich cell bodies for the three contract columns', () => {
    renderTable();

    // NameCell — account name + the "offline" badge for a non-connected card account.
    expect(screen.getByTestId('cell-name-acc-1')).toHaveTextContent('BBVA Principal');
    expect(screen.getByTestId('cell-name-acc-3')).toHaveTextContent('financeAccountsBadgeOffline');
    // TypeCell — translated type label + the chunked IBAN.
    expect(screen.getByTestId('cell-type-acc-2')).toHaveTextContent('financeAccountsTypeCash');
    expect(screen.getByTestId('cell-type-acc-1')).toHaveTextContent('ES12 1234 0000 0000 0000 0001');
    // BalanceCell — currency-formatted amount.
    expect(screen.getByTestId('cell-currentBalance-acc-1')).toHaveTextContent('1.000,00');
  });
});

describe('AccountsHeaderTable — "Por conciliar" pill column', () => {
  it('renders the pending pill with the count and the reconciled pill at zero', () => {
    renderTable();

    const pending = screen.getByTestId('cell-eTGOPendingCount-acc-1');
    expect(pending).toHaveTextContent('Conciliar (3)');
    expect(screen.getByTestId('cell-eTGOPendingCount-acc-2'))
      .toContainElement(screen.getByTestId('reconcile-status-reconciled'));
  });

  it('navigates to the reconciliation tab with autoMatch when the pill is clicked', () => {
    renderTable();

    fireEvent.click(
      screen.getByTestId('cell-eTGOPendingCount-acc-1').querySelector('[data-testid="reconcile-status-pending"]'),
    );

    expect(mockNavigate).toHaveBeenCalledWith(
      '/financial-account/acc-1?tab=reconciliation&autoMatch=true',
    );
  });

  it('swallows the pill click so the row does not also navigate to the detail', () => {
    renderTable();

    fireEvent.click(
      screen.getByTestId('cell-eTGOPendingCount-acc-1').querySelector('[data-testid="reconcile-status-pending"]'),
    );

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalledWith('/financial-account/acc-1');
  });
});

describe('AccountsHeaderTable — row actions column', () => {
  it('renders the hover actions with their stable per-row testids', () => {
    renderTable();

    expect(screen.getByTestId('account-row-edit-acc-1')).toBeInTheDocument();
    expect(screen.getByTestId('account-row-menu-trigger-acc-1')).toBeInTheDocument();
  });

  it('shows the sync button only for bank-connected accounts', () => {
    renderTable();

    expect(screen.getByTestId('account-row-refresh-acc-1')).toBeInTheDocument();
    expect(screen.queryByTestId('account-row-refresh-acc-3')).not.toBeInTheDocument();
  });

  it('swallows action clicks so the row does not navigate underneath them', () => {
    renderTable();

    fireEvent.click(screen.getByTestId('account-row-edit-acc-1'));

    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('AccountsHeaderTable — row navigation', () => {
  it('overrides ListView\'s handler with its own row-click navigation', () => {
    renderTable();

    expect(typeof tableProps.onNavigate).toBe('function');
  });

  // Regression guard: DataTable invokes `onNavigate` with the WHOLE ROW, not an id
  // (`else if (onNavigate) onNavigate(row);`, DataTable.jsx ~1902). The handler first
  // named its argument `id`, so a row click landed on `/financial-account/[object Object]`.
  // Covered end-to-end too — `e2e/tests/flows/financial-accounts-page.mocked.spec.js`.
  it('navigates to the detail route when a row is clicked', () => {
    renderTable();

    fireEvent.click(screen.getByTestId('row-acc-1'));

    expect(mockNavigate).toHaveBeenCalledWith('/financial-account/acc-1');
  });

  it('never stringifies the row object into the route', () => {
    renderTable();

    fireEvent.click(screen.getByTestId('row-acc-1'));

    expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringContaining('[object Object]'));
  });
});

describe('AccountsHeaderTable — sidebar aggregates', () => {
  it('feeds the sidebar from meta.summary (the sibling of response.data)', () => {
    renderTable();

    expect(screen.getByTestId('balance-card')).toHaveTextContent('930,00');
    expect(screen.getByTestId('balance-by-currency-EUR')).toBeInTheDocument();
    expect(screen.getByTestId('balance-by-currency-USD')).toBeInTheDocument();
    expect(screen.getByTestId('pending-reconcile-card')).toBeInTheDocument();
  });

  it('renders the sidebar without aggregates when the response carried no meta', () => {
    renderTable({ meta: null });

    expect(screen.getByTestId('cuentas-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('balance-card')).toBeInTheDocument();
  });

  it('renders the sidebar when meta exists but has no summary sibling', () => {
    renderTable({ meta: { totalRows: 3 } });

    expect(screen.getByTestId('cuentas-sidebar')).toBeInTheDocument();
  });
});

describe('AccountsHeaderTable — toolbar filtering', () => {
  it('filters the grid by the selected account type', () => {
    renderTable();

    fireEvent.click(screen.getByTestId('account-type-filter-trigger'));
    fireEvent.click(screen.getByTestId('account-type-filter-option-c'));

    expect(screen.queryByTestId('row-acc-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('row-acc-2')).toBeInTheDocument();
    expect(screen.queryByTestId('row-acc-3')).not.toBeInTheDocument();
  });

  it('filters the grid by the search term against the account name', () => {
    renderTable();

    fireEvent.change(screen.getByTestId('cuentas-search-input'), { target: { value: 'visa' } });

    expect(screen.queryByTestId('row-acc-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('row-acc-2')).not.toBeInTheDocument();
    expect(screen.getByTestId('row-acc-3')).toBeInTheDocument();
  });

  it('hides archived (inactive) accounts in the default view', () => {
    renderTable({ data: MIXED_ACCOUNTS });

    expect(screen.getByTestId('row-acc-1')).toBeInTheDocument();
    expect(screen.getByTestId('row-acc-2')).toBeInTheDocument();
    expect(screen.getByTestId('row-acc-3')).toBeInTheDocument();
    expect(screen.queryByTestId('row-acc-4')).not.toBeInTheDocument();
    expect(screen.queryByTestId('row-acc-5')).not.toBeInTheDocument();
  });

  it('shows only archived accounts, regardless of type, in the Inactivas view', () => {
    renderTable({ data: MIXED_ACCOUNTS });

    fireEvent.click(screen.getByTestId('account-type-filter-trigger'));
    fireEvent.click(screen.getByTestId('account-type-filter-option-inactive'));

    expect(screen.queryByTestId('row-acc-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('row-acc-2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('row-acc-3')).not.toBeInTheDocument();
    expect(screen.getByTestId('row-acc-4')).toBeInTheDocument();
    expect(screen.getByTestId('row-acc-5')).toBeInTheDocument();
  });

  it('still applies the search term inside the Inactivas view', () => {
    renderTable({ data: MIXED_ACCOUNTS });

    fireEvent.click(screen.getByTestId('account-type-filter-trigger'));
    fireEvent.click(screen.getByTestId('account-type-filter-option-inactive'));
    fireEvent.change(screen.getByTestId('cuentas-search-input'), { target: { value: 'antigua' } });

    expect(screen.queryByTestId('row-acc-4')).not.toBeInTheDocument();
    expect(screen.getByTestId('row-acc-5')).toBeInTheDocument();
  });

  it('treats an account with no active flag as active', () => {
    renderTable({
      data: [{ id: 'acc-x', name: 'Sin Flag', type: 'B', currentBalance: 10, currencyIso: 'EUR', eTGOPendingCount: 0 }],
    });

    expect(screen.getByTestId('row-acc-x')).toBeInTheDocument();
  });

  it('opens the New Account wizard from the toolbar without navigating', () => {
    renderTable();

    const button = screen.getByTestId('cuentas-new-account-button');
    expect(button).toBeEnabled();
    fireEvent.click(button);

    expect(screen.getByTestId('wizard')).toHaveAttribute('data-open', 'true');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('navigates to the match-rule window from the matching-rules button', () => {
    renderTable();

    fireEvent.click(screen.getByTestId('cuentas-matching-rules-button'));

    expect(mockNavigate).toHaveBeenCalledWith('/match-rule');
  });
});

describe('filterAccounts', () => {
  it('returns an empty array for a non-array input', () => {
    expect(filterAccounts(null, null, '')).toEqual([]);
    expect(filterAccounts(undefined, null, '')).toEqual([]);
    expect(filterAccounts({}, null, '')).toEqual([]);
  });

  it('keeps every active account when no type and no search are set', () => {
    expect(filterAccounts(MIXED_ACCOUNTS, null, '').map((a) => a.id))
      .toEqual(['acc-1', 'acc-2', 'acc-3']);
  });

  it('filters by type inside the active views', () => {
    expect(filterAccounts(MIXED_ACCOUNTS, 'B', '').map((a) => a.id)).toEqual(['acc-1']);
  });

  it('returns only archived accounts for the INACTIVE view, ignoring the type', () => {
    expect(filterAccounts(MIXED_ACCOUNTS, AccountTypeFilter.INACTIVE, '').map((a) => a.id))
      .toEqual(['acc-4', 'acc-5']);
  });

  it('matches the search term against name, iban and currency ISO', () => {
    expect(filterAccounts(BASE_ACCOUNTS, null, 'bbva').map((a) => a.id)).toEqual(['acc-1']);
    expect(filterAccounts(BASE_ACCOUNTS, null, '0000000001').map((a) => a.id)).toEqual(['acc-1']);
    expect(filterAccounts(BASE_ACCOUNTS, null, 'usd').map((a) => a.id)).toEqual(['acc-3']);
  });

  it('is case-insensitive and trims the search term', () => {
    expect(filterAccounts(BASE_ACCOUNTS, null, '  ViSa  ').map((a) => a.id)).toEqual(['acc-3']);
  });

  it('treats a nullish search term as no search', () => {
    expect(filterAccounts(BASE_ACCOUNTS, null, undefined)).toHaveLength(3);
    expect(filterAccounts(BASE_ACCOUNTS, null, null)).toHaveLength(3);
  });

  it('returns nothing when the type and the search term disagree', () => {
    expect(filterAccounts(BASE_ACCOUNTS, 'C', 'visa')).toEqual([]);
  });

  it('ignores rows whose searchable fields are all missing', () => {
    const bare = [{ id: 'acc-bare', type: 'B' }];
    expect(filterAccounts(bare, null, 'anything')).toEqual([]);
    expect(filterAccounts(bare, null, '')).toHaveLength(1);
  });
});

describe('AccountsHeaderTable — "Ordenar por" control (ETP-4921)', () => {
  // This window sets `hideListBar: true` and draws its own toolbar, which silently took
  // ListView's sort popover away — clickable headers were the only sort affordance left. The
  // control is the SAME component ListView renders, driven by the handlers ListView forwards.
  it('renders the shared sort popover inside its own toolbar', () => {
    renderTable();

    const toolbar = screen.getByTestId('cuentas-toolbar');
    expect(toolbar).toContainElement(screen.getByTestId('list-sort-toggle'));
  });

  it('lists every sortable column, and not the actions column', () => {
    renderTable();

    fireEvent.click(screen.getByTestId('list-sort-toggle'));

    for (const key of ['name', 'type', 'country', 'currentBalance', 'eTGOPendingCount']) {
      expect(screen.getByTestId(`list-sort-option-${key}`), key).toBeInTheDocument();
    }
    expect(screen.queryByTestId('list-sort-option-_rowActions')).not.toBeInTheDocument();
  });

  // The popover must NOT reuse the header's none→asc→desc→default cycle: a menu entry that can
  // silently clear the sort reads as a no-op. ListView hands it a separate `onSortSelect`.
  it('reports a pick through onSortSelect, not through the header cycle', () => {
    const onSortSelect = vi.fn();
    const onSort = vi.fn();
    renderTable({ onSortSelect, onSort });

    fireEvent.click(screen.getByTestId('list-sort-toggle'));
    fireEvent.click(screen.getByTestId('list-sort-option-type'));

    expect(onSortSelect).toHaveBeenCalledWith('type');
    expect(onSort).not.toHaveBeenCalled();
  });

  // ETP-5111 — it used to disappear along with the toolbar while rows were selected. Since the
  // toolbar no longer unmounts on selection, sorting stays available: ticking a checkbox is not a
  // reason to lose the only sort affordance this window has (it sets `hideListBar: true`).
  it('stays available while rows are selected', () => {
    renderTable({ selectedRows: [{ id: 'acc-1' }] });

    const toolbar = screen.getByTestId('cuentas-toolbar');
    expect(toolbar).toContainElement(screen.getByTestId('list-sort-toggle'));
  });
});
