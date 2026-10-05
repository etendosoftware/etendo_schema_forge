// @vitest-environment jsdom
// @covers artifacts/chart-of-accounts/custom/AccountTreeView.jsx
// @covers artifacts/chart-of-accounts/custom/ChartOfAccountsToolbarSlot.jsx
// @covers artifacts/chart-of-accounts/custom/NewSubAccountCreateModal.jsx
// @covers artifacts/chart-of-accounts/custom/chartOfAccountsTreeStore.js
// @covers artifacts/chart-of-accounts/custom/chartOfAccountsFilters.js

// --- Mocks (before imports) ---

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

// The three icons below carry testids this file asserts on; every other export falls back
// to an inert stub so a growing import graph cannot fail the whole file to load.
import { allIconsAs } from '@/test/lucideIconMock.js';
vi.mock('lucide-react', async (importOriginal) => allIconsAs(() => null, importOriginal, {
  ChevronRight: (props) => <span data-testid="chevron-right" {...props} />,
  ChevronDown: (props) => <span data-testid="chevron-down" {...props} />,
  Lock: (props) => <span data-testid="lock-icon" {...props} />,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Stub NewAccountModal — AccountTreeView.jsx's own tree logic is what this
// suite targets; NewAccountModal has its own dedicated test file.
vi.mock('@generated/chart-of-accounts/custom/NewAccountModal', () => ({
  default: ({ isOpen, onClose, onSaved, currentRecord }) =>
    isOpen ? (
      <div data-testid="new-account-modal-stub">
        <span data-testid="modal-current-record-id">{currentRecord?.id ?? 'none'}</span>
        {/* ETP-5399: exposes currentRecord.children.length so tests can prove the
            modal receives the UNFILTERED node (real children) rather than a
            filterTree-pruned clone — see `currentRecordForModal` in AccountTreeView. */}
        <span data-testid="modal-current-record-children-count">
          {Array.isArray(currentRecord?.children) ? currentRecord.children.length : 'n/a'}
        </span>
        <button type="button" data-testid="modal-close" onClick={onClose}>close</button>
        <button type="button" data-testid="modal-save" onClick={onSaved}>save</button>
      </div>
    ) : null,
}));

// --- Import under test ---

import { useState } from 'react';
import { render, screen, within, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toast } from 'sonner';
import AccountTreeView from '@generated/chart-of-accounts/custom/AccountTreeView.jsx';
import NewSubAccountCreateModal from '@generated/chart-of-accounts/custom/NewSubAccountCreateModal.jsx';
import { resetChartOfAccountsTreeStore } from '@generated/chart-of-accounts/custom/chartOfAccountsTreeStore.js';
import { SEARCH_DEBOUNCE_MS } from '@generated/chart-of-accounts/custom/ChartOfAccountsToolbarSlot.jsx';
import { ELEMENT_LEVEL_UI_KEYS } from '@generated/chart-of-accounts/custom/accountTypeLabels';

// --- Harness ---
//
// ETP-5593: the tree's controls moved into ListView's toolbar row
// (`AccountTreeView.ToolbarQuickFilter`) and "Nueva subcuenta" became ListView's New
// button (`newRecordComponent: NewSubAccountCreateModal`). The harness mounts those
// three siblings the way ListView + the generated page do — under one Router, sharing
// the window-local store — with a plain button standing in for ListView's New.
function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location-search">{location.search}</span>;
}

function TreeHarness({ children }) {
  const [creating, setCreating] = useState(false);
  const Slot = AccountTreeView.ToolbarQuickFilter;
  return (
    <>
      <Slot />
      <button type="button" data-testid="open-create" onClick={() => setCreating(true)}>new</button>
      {children}
      {creating && (
        <NewSubAccountCreateModal token="test-token" apiBaseUrl={TEST_API_BASE_URL} onClose={() => setCreating(false)} />
      )}
      <LocationProbe />
    </>
  );
}

function renderTree(ui, { entry = '/chart-of-accounts' } = {}) {
  const wrap = (node) => (
    <MemoryRouter initialEntries={[entry]}>
      <TreeHarness>{node}</TreeHarness>
    </MemoryRouter>
  );
  const utils = render(wrap(ui));
  return { ...utils, rerender: (next) => utils.rerender(wrap(next)) };
}

// The search box writes the URL after a pause (SEARCH_DEBOUNCE_MS); type, then let the
// pause elapse, so the tree has re-filtered when the helper returns.
function typeIntoSearch(value) {
  vi.useFakeTimers();
  try {
    fireEvent.change(screen.getByTestId('coa-search-input'), { target: { value } });
    act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS); });
  } finally {
    vi.useRealTimers();
  }
}

// --- Fixtures ---

// All API records are leaves; the hierarchy is derived from parentCode4.
const DATA = [
  {
    id: 'acc-40000001',
    searchKey: '40000002',
    name: 'Sales EU',
    accountType: 'R',
    parentCode4: '4000',
    parentCode4Name: 'Sales',
    summaryLevel: 'N',
    hasChildren: false,
  },
  {
    id: 'acc-40000000',
    searchKey: '40000001',
    name: 'Sales US',
    accountType: 'R',
    parentCode4: '4000',
    parentCode4Name: 'Sales',
    summaryLevel: 'N',
    hasChildren: false,
  },
  {
    id: 'acc-50000001',
    searchKey: '50000001',
    name: 'Purchases US',
    accountType: 'E',
    parentCode4: '5000',
    parentCode4Name: 'Purchases',
    summaryLevel: 'N',
    hasChildren: false,
  },
];

// Most tests don't need a self-fetch in flight (`apiBaseUrl` absent skips it
// entirely — see the component docblock). Only the self-fetch and
// active/inactive-toggle describe blocks below pass this explicitly.
const TEST_API_BASE_URL = '/sws/neo/chart-of-accounts';

const defaultProps = {
  data: DATA,
  onNavigate: vi.fn(),
  onDataMutated: vi.fn(),
  token: 'test-token',
};

// Full 6-level PGC hierarchy, matching the live example from the CoA investigation:
// A (Heading: ACTIVO) → A.A (Heading) → A.A.I (Heading) → 200 (Account) →
// 2000 (Breakdown) → 20000000 (Subaccount, protected placeholder — ends in "0000").
// A second leaf, 20000001, shares the same ancestor chain and must reuse the same
// folder nodes instead of duplicating them. It does NOT end in "0000" and stays editable.
const ANCESTORS_20000000 = [
  { value: 'A', name: 'ACTIVO', elementLevel: 'E' },
  { value: 'A.A', name: 'A) ACTIVO NO CORRIENTE', elementLevel: 'E' },
  { value: 'A.A.I', name: 'I. Inmovilizado intangible.', elementLevel: 'E' },
  { value: '200', name: 'Investigación.', elementLevel: 'C' },
  { value: '2000', name: 'Investigación.', elementLevel: 'D' },
];

const HIERARCHY_DATA = [
  {
    id: 'acc-20000000',
    searchKey: '20000000',
    name: 'Investigación.',
    accountType: 'A',
    summaryLevel: 'N',
    elementLevel: 'S',
    protectedParentLikeSubaccount: 'Y',
    ancestors: ANCESTORS_20000000,
    hasChildren: false,
  },
  {
    id: 'acc-20000001',
    searchKey: '20000001',
    name: 'Investigación aplicada.',
    accountType: 'A',
    summaryLevel: 'N',
    elementLevel: 'S',
    protectedParentLikeSubaccount: 'N',
    ancestors: ANCESTORS_20000000,
    hasChildren: false,
  },
];

describe('AccountTreeView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    resetChartOfAccountsTreeStore();
  });

  afterEach(() => {
    delete globalThis.fetch;
  });

  it('shows the empty state when there are no accounts', () => {
    renderTree(<AccountTreeView {...defaultProps} data={[]} />);
    expect(screen.getByText('accountTreeNoAccounts')).toBeInTheDocument();
    // Toolbar still renders, but no group rows
    expect(screen.queryByTestId('account-tree-row-group-4000')).not.toBeInTheDocument();
  });

  it('groups accounts by parentCode4, collapsed by default', () => {
    renderTree(<AccountTreeView {...defaultProps} />);
    // Group headers are visible…
    expect(screen.getByTestId('account-tree-row-group-4000')).toBeInTheDocument();
    expect(screen.getByTestId('account-tree-row-group-5000')).toBeInTheDocument();
    // …but their children are not, until the user expands a group.
    expect(screen.queryByTestId('account-tree-row-acc-40000001')).not.toBeInTheDocument();
    expect(screen.queryByTestId('account-tree-row-acc-40000000')).not.toBeInTheDocument();
    expect(screen.queryByTestId('account-tree-row-acc-50000001')).not.toBeInTheDocument();
  });

  it('expanding a group reveals its children', () => {
    renderTree(<AccountTreeView {...defaultProps} />);
    fireEvent.click(screen.getByTestId('account-tree-toggle-group-4000'));

    expect(screen.getByTestId('account-tree-row-acc-40000001')).toBeInTheDocument();
    expect(screen.getByTestId('account-tree-row-acc-40000000')).toBeInTheDocument();
    // Sibling group stays collapsed — expanding one group doesn't affect others.
    expect(screen.queryByTestId('account-tree-row-acc-50000001')).not.toBeInTheDocument();
  });

  it('sorts children within a group by searchKey', () => {
    renderTree(<AccountTreeView {...defaultProps} />);
    fireEvent.click(screen.getByTestId('account-tree-toggle-group-4000'));
    const rows = screen.getAllByRole('row').map((r) => r.getAttribute('data-testid'));
    const idxUS = rows.indexOf('account-tree-row-acc-40000000'); // 40000001
    const idxEU = rows.indexOf('account-tree-row-acc-40000001'); // 40000002
    expect(idxUS).toBeLessThan(idxEU);
  });

  it('shows only SearchKey, Name and Account Type — no Debit/Credit/Balance', () => {
    renderTree(<AccountTreeView {...defaultProps} />);
    fireEvent.click(screen.getByTestId('account-tree-toggle-group-4000'));
    const row = screen.getByTestId('account-tree-row-acc-40000001');
    expect(row.textContent).toContain('40000002');
    expect(row.textContent).toContain('Sales EU');
    expect(row.textContent).toContain('accountTypeRevenue');
    expect(screen.queryByText('accountTreeDebit')).not.toBeInTheDocument();
    expect(screen.queryByText('accountTreeCredit')).not.toBeInTheDocument();
    expect(screen.queryByText('accountTreeBalance')).not.toBeInTheDocument();
  });

  it('renders the Account Type label for each leaf row', () => {
    renderTree(<AccountTreeView {...defaultProps} />);
    fireEvent.click(screen.getByTestId('account-tree-toggle-group-4000'));
    fireEvent.click(screen.getByTestId('account-tree-toggle-group-5000'));
    const revenueRow = screen.getByTestId('account-tree-row-acc-40000000');
    expect(within(revenueRow).getByText('accountTypeRevenue')).toBeInTheDocument();

    const expenseRow = screen.getByTestId('account-tree-row-acc-50000001');
    expect(within(expenseRow).getByText('accountTypeExpense')).toBeInTheDocument();
  });

  it('collapsing an already-expanded group hides its children without affecting other groups', () => {
    renderTree(<AccountTreeView {...defaultProps} />);
    fireEvent.click(screen.getByTestId('account-tree-toggle-group-4000'));
    fireEvent.click(screen.getByTestId('account-tree-toggle-group-5000'));
    fireEvent.click(screen.getByTestId('account-tree-toggle-group-4000'));

    expect(screen.queryByTestId('account-tree-row-acc-40000000')).not.toBeInTheDocument();
    expect(screen.queryByTestId('account-tree-row-acc-40000001')).not.toBeInTheDocument();
    expect(screen.getByTestId('account-tree-row-acc-50000001')).toBeInTheDocument();
  });

  it('toggling a group chevron does not select the row or call onNavigate', () => {
    const onNavigate = vi.fn();
    renderTree(<AccountTreeView {...defaultProps} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByTestId('account-tree-toggle-group-4000'));

    expect(onNavigate).not.toHaveBeenCalled();
    expect(screen.getByTestId('account-tree-row-group-4000')).toHaveAttribute('aria-selected', 'false');
  });

  it('clicking a leaf row selects it and calls onNavigate with the item', () => {
    const onNavigate = vi.fn();
    renderTree(<AccountTreeView {...defaultProps} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByTestId('account-tree-toggle-group-4000'));
    fireEvent.click(screen.getByTestId('account-tree-row-acc-40000000'));

    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ id: 'acc-40000000' }));
    expect(screen.getByTestId('account-tree-row-acc-40000000')).toHaveAttribute('aria-selected', 'true');
  });

  it('clicking a virtual group row selects it but does not call onNavigate', () => {
    const onNavigate = vi.fn();
    renderTree(<AccountTreeView {...defaultProps} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByTestId('account-tree-row-group-4000'));

    expect(onNavigate).not.toHaveBeenCalled();
    expect(screen.getByTestId('account-tree-row-group-4000')).toHaveAttribute('aria-selected', 'true');
  });

  it('is collapsed by default on first-ever load (no persisted state)', () => {
    renderTree(<AccountTreeView {...defaultProps} />);
    expect(screen.queryByTestId('account-tree-row-acc-40000000')).not.toBeInTheDocument();
    expect(screen.queryByTestId('account-tree-row-acc-50000001')).not.toBeInTheDocument();
  });

  it('"Contraer" (collapse all) hides every group\'s children', () => {
    renderTree(<AccountTreeView {...defaultProps} />);
    fireEvent.click(screen.getByTestId('coa-toggle-expand-all'));
    fireEvent.click(screen.getByTestId('coa-toggle-expand-all'));

    expect(screen.queryByTestId('account-tree-row-acc-40000000')).not.toBeInTheDocument();
    expect(screen.queryByTestId('account-tree-row-acc-50000001')).not.toBeInTheDocument();
    expect(screen.getByTestId('account-tree-row-group-4000')).toBeInTheDocument();
  });

  it('"Expandir" (expand all) reveals every group\'s children', () => {
    renderTree(<AccountTreeView {...defaultProps} />);
    fireEvent.click(screen.getByTestId('coa-toggle-expand-all'));

    expect(screen.getByTestId('account-tree-row-acc-40000000')).toBeInTheDocument();
    expect(screen.getByTestId('account-tree-row-acc-50000001')).toBeInTheDocument();
  });

  describe('expand/collapse persistence across remounts', () => {
    it('restores previously expanded folders after unmount + remount (navigate away and back)', () => {
      const { unmount } = renderTree(<AccountTreeView {...defaultProps} />);
      fireEvent.click(screen.getByTestId('account-tree-toggle-group-4000'));
      expect(screen.getByTestId('account-tree-row-acc-40000000')).toBeInTheDocument();
      unmount();

      renderTree(<AccountTreeView {...defaultProps} />);
      expect(screen.getByTestId('account-tree-row-acc-40000000')).toBeInTheDocument();
      // The group that was never expanded stays collapsed.
      expect(screen.queryByTestId('account-tree-row-acc-50000001')).not.toBeInTheDocument();
    });

    it('restores a fully collapsed state after unmount + remount', () => {
      const { unmount } = renderTree(<AccountTreeView {...defaultProps} />);
      fireEvent.click(screen.getByTestId('account-tree-toggle-group-4000'));
      fireEvent.click(screen.getByTestId('account-tree-toggle-group-4000')); // re-collapse
      unmount();

      renderTree(<AccountTreeView {...defaultProps} />);
      expect(screen.queryByTestId('account-tree-row-acc-40000000')).not.toBeInTheDocument();
    });

    it('ignores corrupt persisted state and falls back to collapsed', () => {
      localStorage.setItem('sf.chartOfAccounts.expandedFolderIds', 'not valid json');
      renderTree(<AccountTreeView {...defaultProps} />);
      expect(screen.queryByTestId('account-tree-row-acc-40000000')).not.toBeInTheDocument();
    });
  });

  it('renders an unmapped or missing account type without crashing', () => {
    const data = [
      {
        id: 'acc-x',
        searchKey: '99000001',
        name: 'No type',
        parentCode4: '9900',
        parentCode4Name: 'Otros',
        summaryLevel: 'N',
      },
    ];
    renderTree(<AccountTreeView {...defaultProps} data={data} />);
    fireEvent.click(screen.getByTestId('account-tree-toggle-group-9900'));
    expect(screen.getByTestId('account-tree-row-acc-x')).toBeInTheDocument();
  });

  it('calls onColumnsReady with the tree column definitions', () => {
    const onColumnsReady = vi.fn();
    renderTree(<AccountTreeView {...defaultProps} onColumnsReady={onColumnsReady} />);
    expect(onColumnsReady).toHaveBeenCalled();
    const cols = onColumnsReady.mock.calls.at(-1)[0];
    expect(cols.map((c) => c.key)).toEqual([
      'searchKey',
      'name',
      'elementLevel',
      'accountType',
      'active',
    ]);
    // ETP-5593 — only Código and Nombre are offered by the toolbar's Sort popover.
    expect(cols.filter((c) => c.sortable !== false).map((c) => c.key)).toEqual(['searchKey', 'name']);
  });

  it('opens the New Sub-account modal with no current record when nothing is selected', () => {
    renderTree(<AccountTreeView {...defaultProps} />);
    fireEvent.click(screen.getByTestId('open-create'));

    expect(screen.getByTestId('new-account-modal-stub')).toBeInTheDocument();
    expect(screen.getByTestId('modal-current-record-id')).toHaveTextContent('none');
  });

  it('opens the modal with the selected row as the current record', () => {
    renderTree(<AccountTreeView {...defaultProps} />);
    fireEvent.click(screen.getByTestId('account-tree-toggle-group-4000'));
    fireEvent.click(screen.getByTestId('account-tree-row-acc-40000000'));
    fireEvent.click(screen.getByTestId('open-create'));

    expect(screen.getByTestId('modal-current-record-id')).toHaveTextContent('acc-40000000');
  });

  it('closes the modal via onClose without side effects', () => {
    renderTree(<AccountTreeView {...defaultProps} />);
    fireEvent.click(screen.getByTestId('open-create'));
    fireEvent.click(screen.getByTestId('modal-close'));

    expect(screen.queryByTestId('new-account-modal-stub')).not.toBeInTheDocument();
  });

  it('closes the modal and calls onDataMutated when a new account is saved', () => {
    const onDataMutated = vi.fn();
    renderTree(<AccountTreeView {...defaultProps} onDataMutated={onDataMutated} />);
    fireEvent.click(screen.getByTestId('open-create'));
    fireEvent.click(screen.getByTestId('modal-save'));

    expect(screen.queryByTestId('new-account-modal-stub')).not.toBeInTheDocument();
    expect(onDataMutated).toHaveBeenCalled();
  });

  // ── Full N-level hierarchy (ancestors-driven tree) ──────────────────────────

  describe('full ancestor-chain hierarchy', () => {
    it('builds one nested folder per ancestor level instead of a flat 4-digit group', () => {
      renderTree(<AccountTreeView {...defaultProps} data={HIERARCHY_DATA} />);

      // Root folder "A" is a real group node (top-level, visible but collapsed)…
      expect(screen.getByTestId('account-tree-row-group-A')).toBeInTheDocument();
      // …and there is NO flat 4-digit "2000" group at the root — it must be nested
      // under A > A.A > A.A.I > 200, not a top-level sibling of "A".
      expect(screen.queryByTestId('account-tree-row-group-2000')).not.toBeInTheDocument();
    });

    it('expanding the full ancestor chain reveals both leaves sharing that path', () => {
      renderTree(<AccountTreeView {...defaultProps} data={HIERARCHY_DATA} />);

      // Walk down every level, expanding each as we go — nothing is auto-expanded.
      fireEvent.click(screen.getByTestId('account-tree-toggle-group-A'));
      fireEvent.click(screen.getByTestId('account-tree-toggle-group-A|A.A'));
      fireEvent.click(screen.getByTestId('account-tree-toggle-group-A|A.A|A.A.I'));
      fireEvent.click(screen.getByTestId('account-tree-toggle-group-A|A.A|A.A.I|200'));
      fireEvent.click(screen.getByTestId('account-tree-toggle-group-A|A.A|A.A.I|200|2000'));

      // Both leaves share the same ancestor chain and must both appear as children
      // of the same innermost "2000" folder — not duplicated folders.
      expect(screen.getByTestId('account-tree-row-acc-20000000')).toBeInTheDocument();
      expect(screen.getByTestId('account-tree-row-acc-20000001')).toBeInTheDocument();
      expect(screen.getAllByText('2000')).toHaveLength(1);
    });

    it('"Expandir" (expand all) reveals every nested level, not just the first two', () => {
      renderTree(<AccountTreeView {...defaultProps} data={HIERARCHY_DATA} />);
      fireEvent.click(screen.getByTestId('coa-toggle-expand-all'));

      // Every intermediate folder down the full A → A.A → A.A.I → 200 → 2000 chain
      // must be expanded, not just the root "A" and its immediate child "A.A".
      expect(screen.getByTestId('account-tree-row-group-A|A.A')).toBeInTheDocument();
      expect(screen.getByTestId('account-tree-row-group-A|A.A|A.A.I')).toBeInTheDocument();
      expect(screen.getByTestId('account-tree-row-group-A|A.A|A.A.I|200')).toBeInTheDocument();
      expect(screen.getByTestId('account-tree-row-group-A|A.A|A.A.I|200|2000')).toBeInTheDocument();
      expect(screen.getByTestId('account-tree-row-acc-20000000')).toBeInTheDocument();
      expect(screen.getByTestId('account-tree-row-acc-20000001')).toBeInTheDocument();
    });

    it('collapsing an intermediate folder hides deeper levels', () => {
      renderTree(<AccountTreeView {...defaultProps} data={HIERARCHY_DATA} />);
      fireEvent.click(screen.getByTestId('account-tree-toggle-group-A'));
      fireEvent.click(screen.getByTestId('account-tree-toggle-group-A|A.A'));

      // A.A.I is now visible but collapsed — its descendants (200, 2000, leaves) are hidden.
      expect(screen.getByTestId('account-tree-row-group-A|A.A|A.A.I')).toBeInTheDocument();
      expect(screen.queryByTestId('account-tree-row-acc-20000000')).not.toBeInTheDocument();
    });
  });

  // ── Element Level column (ETP-5399) ─────────────────────────────────────────

  describe('Element Level column (ETP-5399)', () => {
    it('shows the Element Level header in the column header row', () => {
      renderTree(<AccountTreeView {...defaultProps} />);
      expect(screen.getByText('accountTreeFilterElementLevel')).toBeInTheDocument();
    });

    it('renders the Element Level label for a leaf row', () => {
      renderTree(<AccountTreeView {...defaultProps} data={HIERARCHY_DATA} />);
      expandFullAncestorChain();
      // acc-20000000 has elementLevel: 'S' → elementLevelSubaccount.
      const row = screen.getByTestId('account-tree-row-acc-20000000');
      expect(within(row).getByText('elementLevelSubaccount')).toBeInTheDocument();
    });

    it('renders the Element Level label for a virtual folder/heading row', () => {
      renderTree(<AccountTreeView {...defaultProps} data={HIERARCHY_DATA} />);
      // Root folder "A" is visible without expanding; its ancestor entry carries elementLevel: 'E'.
      const row = screen.getByTestId('account-tree-row-group-A');
      expect(within(row).getByText('elementLevelHeading')).toBeInTheDocument();
    });

    it('keeps folder rows on the same column grid as leaf rows (empty active cell)', () => {
      renderTree(<AccountTreeView {...defaultProps} data={HIERARCHY_DATA} />);
      expandFullAncestorChain();
      const folder = screen.getByTestId('account-tree-row-group-A');
      const leaf = screen.getByTestId('account-tree-row-acc-20000000');
      // Without the placeholder the folder row had one cell fewer, so its flex-1 name cell
      // grew and pushed Element Level / Account Type right (QA: "Epígrafe" looked right-aligned).
      expect(within(folder).getByTestId('account-tree-active-placeholder-group-A')).toHaveAttribute('aria-hidden', 'true');
      expect(within(leaf).queryByTestId(/account-tree-active-placeholder-/)).toBeNull();
      // Same number of cells once the depth-dependent indent spacer is set aside.
      const cells = (row) => [...row.children].filter((el) => !el.style.minWidth);
      expect(cells(folder)).toHaveLength(cells(leaf).length);
    });

    it('falls back to the raw code when elementLevel has no mapped label', () => {
      const data = [{ ...DATA[0], elementLevel: 'Z' }];
      renderTree(<AccountTreeView {...defaultProps} data={data} />);
      fireEvent.click(screen.getByTestId('account-tree-toggle-group-4000'));
      const row = screen.getByTestId('account-tree-row-acc-40000001');
      expect(within(row).getByText('Z')).toBeInTheDocument();
    });

    it('renders without crashing and shows no mapped label when elementLevel is missing', () => {
      const data = [{ ...DATA[0], elementLevel: undefined }];
      renderTree(<AccountTreeView {...defaultProps} data={data} />);
      fireEvent.click(screen.getByTestId('account-tree-toggle-group-4000'));
      const row = screen.getByTestId('account-tree-row-acc-40000001');
      expect(row).toBeInTheDocument();
      for (const uiKey of Object.values(ELEMENT_LEVEL_UI_KEYS)) {
        expect(within(row).queryByText(uiKey)).not.toBeInTheDocument();
      }
    });
  });

  // ── Tree-native filter (code/name/type/active) ─────────────────────────────

  describe('tree-native filter', () => {
    it('shows a virtual folder when its code matches, including its descendant leaf', () => {
      const data = [
        ...HIERARCHY_DATA,
        {
          id: 'acc-43000001',
          searchKey: '43000001',
          name: 'Long-term provisions',
          accountType: 'A',
          summaryLevel: 'N',
          ancestors: [
            { value: '430A', name: 'Provisions', elementLevel: 'C' },
            { value: '4300A', name: 'Long-term provisions', elementLevel: 'D' },
          ],
          hasChildren: false,
        },
      ];

      renderTree(<AccountTreeView {...defaultProps} apiBaseUrl={undefined} data={data} />);

      typeIntoSearch('430A');

      const matchingFolder = screen.getByTestId('account-tree-row-group-430A');
      expect(within(matchingFolder).getByText('430A')).toBeInTheDocument();
      expect(screen.getByTestId('account-tree-row-acc-43000001')).toBeInTheDocument();
      expect(screen.queryByTestId('account-tree-row-group-A')).not.toBeInTheDocument();
      expect(screen.queryByTestId('account-tree-row-acc-20000000')).not.toBeInTheDocument();
    });

    it('filters leaves by code or name and auto-expands their ancestors', () => {
      renderTree(<AccountTreeView {...defaultProps} data={HIERARCHY_DATA} />);

      typeIntoSearch('aplicada');

      // The match (20000001, "Investigación aplicada.") is visible without any
      // manual expand click — every ancestor folder auto-expanded.
      expect(screen.getByTestId('account-tree-row-acc-20000001')).toBeInTheDocument();
      // The non-matching sibling leaf is hidden.
      expect(screen.queryByTestId('account-tree-row-acc-20000000')).not.toBeInTheDocument();
    });

    it('hides branches with no matching descendant at any depth', () => {
      renderTree(<AccountTreeView {...defaultProps} data={HIERARCHY_DATA} />);

      typeIntoSearch('no-such-account');

      expect(screen.queryByTestId('account-tree-row-group-A')).not.toBeInTheDocument();
      expect(screen.getByText('noResultsFound')).toBeInTheDocument();
    });

    it('filters by account type independently of the text filter', () => {
      renderTree(<AccountTreeView {...defaultProps} data={DATA} />, { entry: '/chart-of-accounts?accountType=E' });

      // "Purchases US" (accountType 'E') matches; the two 'R' (Revenue) leaves
      // under 4000 do not, so that whole branch disappears.
      expect(screen.getByTestId('account-tree-row-acc-50000001')).toBeInTheDocument();
      expect(screen.queryByTestId('account-tree-row-group-4000')).not.toBeInTheDocument();
    });

    it('clearing the filter reverts to the manual expand/collapse state, not the auto-expanded one', () => {
      renderTree(<AccountTreeView {...defaultProps} data={HIERARCHY_DATA} />);
      // No manual expansion at all — tree is fully collapsed.
      typeIntoSearch('aplicada');
      expect(screen.getByTestId('account-tree-row-acc-20000001')).toBeInTheDocument();

      typeIntoSearch('');

      // Back to fully collapsed — the filter's auto-expand must not leak into
      // the persisted manual `expanded` state.
      expect(screen.queryByTestId('account-tree-row-acc-20000001')).not.toBeInTheDocument();
      expect(screen.getByTestId('account-tree-row-group-A')).toBeInTheDocument();
    });
  });

  // ── currentRecordForModal resolves against the UNFILTERED tree (ETP-5399) ──
  //
  // `filterTree` clones every surviving virtual folder node with a pruned
  // `children` array (only the matching descendants survive). Before ETP-5399,
  // `selectedRecord` (looked up from `visibleRows`, itself derived from the
  // FILTERED tree) was handed straight to NewAccountModal — so selecting a
  // folder while a filter was active fed the modal's parent/prefix resolution
  // a node whose `children` did not reflect reality. `currentRecordForModal`
  // now re-resolves the selected id against `indexById`, which is built from
  // the unfiltered tree and (since this same commit) also indexes virtual
  // folder nodes, not just leaves.
  describe('currentRecordForModal resolves against the unfiltered tree (ETP-5399)', () => {
    it('hands the modal the real (unfiltered) children of a selected folder while a filter is active', () => {
      renderTree(<AccountTreeView {...defaultProps} data={HIERARCHY_DATA} />);

      // Matches only "20000001" ("Investigación aplicada.") — filterTree prunes
      // the innermost "2000" folder's children down to that single leaf, while
      // auto-expanding every ancestor folder (including "2000" itself) so it is
      // visible and selectable without any manual toggle.
      typeIntoSearch('aplicada');
      fireEvent.click(screen.getByTestId('account-tree-row-group-A|A.A|A.A.I|200|2000'));
      fireEvent.click(screen.getByTestId('open-create'));

      expect(screen.getByTestId('modal-current-record-id'))
        .toHaveTextContent('group-A|A.A|A.A.I|200|2000');
      // The filtered clone would only carry 1 child (the matching leaf) — proving
      // the modal actually received the UNFILTERED node, which carries both.
      expect(screen.getByTestId('modal-current-record-children-count')).toHaveTextContent('2');
    });

    it('still resolves the correct node with no filter active (baseline, no regression)', () => {
      renderTree(<AccountTreeView {...defaultProps} data={HIERARCHY_DATA} />);

      fireEvent.click(screen.getByTestId('account-tree-toggle-group-A'));
      fireEvent.click(screen.getByTestId('account-tree-toggle-group-A|A.A'));
      fireEvent.click(screen.getByTestId('account-tree-toggle-group-A|A.A|A.A.I'));
      fireEvent.click(screen.getByTestId('account-tree-toggle-group-A|A.A|A.A.I|200'));
      fireEvent.click(screen.getByTestId('account-tree-row-group-A|A.A|A.A.I|200|2000'));
      fireEvent.click(screen.getByTestId('open-create'));

      expect(screen.getByTestId('modal-current-record-id'))
        .toHaveTextContent('group-A|A.A|A.A.I|200|2000');
      expect(screen.getByTestId('modal-current-record-children-count')).toHaveTextContent('2');
    });

    it('selecting a real leaf row while filtered still resolves that same leaf (leaves are never cloned)', () => {
      renderTree(<AccountTreeView {...defaultProps} data={HIERARCHY_DATA} />);

      typeIntoSearch('aplicada');
      fireEvent.click(screen.getByTestId('account-tree-row-acc-20000001'));
      fireEvent.click(screen.getByTestId('open-create'));

      expect(screen.getByTestId('modal-current-record-id')).toHaveTextContent('acc-20000001');
    });
  });

  // ── Deactivate/activate toggle (ETP-4884 item 5) ────────────────────────────

  describe('active/inactive toggle', () => {
    function mockFetchPatch({ ok = true } = {}) {
      globalThis.fetch = vi.fn(async () => ({ ok, status: ok ? 200 : 500, text: async () => '' }));
    }

    beforeEach(() => {
      mockFetchPatch();
    });

    it('renders checked for an active leaf and unchecked for an inactive one', async () => {
      const data = [
        { ...DATA[0], active: true },
        { ...DATA[1], active: false },
      ];
      renderTree(<AccountTreeView {...defaultProps} apiBaseUrl={TEST_API_BASE_URL} data={data} />);
      await waitFor(() => expect(screen.getByTestId('account-tree-row-group-4000')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('account-tree-toggle-group-4000'));

      expect(screen.getByTestId('account-tree-active-toggle-acc-40000001')).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByTestId('account-tree-active-toggle-acc-40000000')).toHaveAttribute('aria-checked', 'false');
    });

    // ETP-4884 bugfix — NEO can return `active` as the raw AD string 'Y'/'N'
    // rather than a JS boolean. A strict `=== true` check rendered a genuinely
    // active account ('Y') as OFF; the toggle must accept 'Y'/'N' too.
    it('renders checked for an active leaf and unchecked for an inactive one when active is a string', async () => {
      const data = [
        { ...DATA[0], active: 'Y' },
        { ...DATA[1], active: 'N' },
      ];
      renderTree(<AccountTreeView {...defaultProps} apiBaseUrl={TEST_API_BASE_URL} data={data} />);
      await waitFor(() => expect(screen.getByTestId('account-tree-row-group-4000')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('account-tree-toggle-group-4000'));

      expect(screen.getByTestId('account-tree-active-toggle-acc-40000001')).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByTestId('account-tree-active-toggle-acc-40000000')).toHaveAttribute('aria-checked', 'false');
    });

    it('PATCHes elementValue/{id} with { active: checked } on toggle', async () => {
      const data = [{ ...DATA[0], active: true }];
      renderTree(<AccountTreeView {...defaultProps} apiBaseUrl={TEST_API_BASE_URL} data={data} />);
      await waitFor(() => expect(screen.getByTestId('account-tree-row-group-4000')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('account-tree-toggle-group-4000'));

      fireEvent.click(screen.getByTestId('account-tree-active-toggle-acc-40000001'));

      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
        `${TEST_API_BASE_URL}/elementValue/acc-40000001`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ active: false }),
        }),
      ));
    });

    it('rolls back the toggle and shows an error toast when the PATCH fails', async () => {
      mockFetchPatch({ ok: false });
      const data = [{ ...DATA[0], active: true }];
      renderTree(<AccountTreeView {...defaultProps} apiBaseUrl={TEST_API_BASE_URL} data={data} />);
      await waitFor(() => expect(screen.getByTestId('account-tree-row-group-4000')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('account-tree-toggle-group-4000'));

      fireEvent.click(screen.getByTestId('account-tree-active-toggle-acc-40000001'));

      await waitFor(() => expect(screen.getByTestId('account-tree-active-toggle-acc-40000001'))
        .toHaveAttribute('aria-checked', 'true'));
      expect(toast.error).toHaveBeenCalled();
    });

    // ETP-5593 QA — a read-only user must not be able to flip a sub-account's status.
    it('disables every status toggle and sends no PATCH when the window is read-only', async () => {
      const data = [{ ...DATA[0], active: true }, { ...DATA[1], active: false }];
      renderTree(<AccountTreeView {...defaultProps} apiBaseUrl={TEST_API_BASE_URL} data={data} windowReadOnly />);
      await waitFor(() => expect(screen.getByTestId('account-tree-row-group-4000')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('account-tree-toggle-group-4000'));

      const on = screen.getByTestId('account-tree-active-toggle-acc-40000001');
      const off = screen.getByTestId('account-tree-active-toggle-acc-40000000');
      expect(on).toBeDisabled();
      expect(off).toBeDisabled();
      // The state is still shown.
      expect(on).toHaveAttribute('aria-checked', 'true');
      expect(off).toHaveAttribute('aria-checked', 'false');

      fireEvent.click(on);
      expect(globalThis.fetch).not.toHaveBeenCalledWith(
        expect.stringContaining('/elementValue/acc-40000001'),
        expect.objectContaining({ method: 'PATCH' }),
      );
    });

    it('disables the toggle for a protected 0000-suffixed placeholder leaf', async () => {
      renderTree(<AccountTreeView {...defaultProps} apiBaseUrl={TEST_API_BASE_URL} data={HIERARCHY_DATA} />);
      await waitFor(() => expect(screen.getByTestId('account-tree-row-group-A')).toBeInTheDocument());
      expandFullAncestorChain();

      expect(screen.getByTestId('account-tree-active-toggle-acc-20000000')).toBeDisabled();
    });

    it('never renders a toggle on a virtual folder row', async () => {
      renderTree(<AccountTreeView {...defaultProps} apiBaseUrl={TEST_API_BASE_URL} data={DATA} />);
      await waitFor(() => expect(screen.getByTestId('account-tree-row-group-4000')).toBeInTheDocument());
      expect(screen.queryByTestId('account-tree-active-toggle-group-4000')).not.toBeInTheDocument();
    });
  });

  // ── Shared table/button styling (ETP-4884 item 3, token-alignment slice) ──

  describe('shared table/button styling', () => {
    it('renders no toolbar of its own — its controls are the ListView toolbar slot (ETP-5593)', () => {
      renderTree(<AccountTreeView {...defaultProps} />);
      const tree = screen.getByTestId('account-tree');

      expect(within(tree).queryByTestId('coa-toolbar')).not.toBeInTheDocument();
      expect(within(tree).queryByRole('textbox')).not.toBeInTheDocument();
      expect(within(tree).queryByRole('searchbox')).not.toBeInTheDocument();
      expect(screen.getByTestId('coa-toolbar')).toBeInTheDocument();
    });

    it('renders column headers in the standard sentence-case style, not an uppercase shaded band', () => {
      renderTree(<AccountTreeView {...defaultProps} />);
      const codeHeader = screen.getByText('accountTreeCode');

      expect(codeHeader.className).toContain('text-sm');
      expect(codeHeader.className).not.toContain('uppercase');
      expect(codeHeader.className).not.toContain('tracking-wide');
    });

    it('uses the standard muted/50 hover on tree rows, not a full-opacity hover', () => {
      renderTree(<AccountTreeView {...defaultProps} />);
      const row = screen.getByTestId('account-tree-row-group-4000');

      // The shared ui/table row (same as DataTable).
      expect(row.tagName).toBe('TR');
      expect(row.className).toContain('hover:bg-muted/50');
    });

    it('uses the standard plain muted selected-row color, not the info-blue tint', () => {
      renderTree(<AccountTreeView {...defaultProps} />);
      fireEvent.click(screen.getByTestId('account-tree-row-group-4000'));
      const row = screen.getByTestId('account-tree-row-group-4000');

      expect(row).toHaveAttribute('data-state', 'selected');
      expect(row.className).toContain('data-[state=selected]:bg-muted');
      expect(row.className).not.toContain('--status-info-bg');
    });
  });

  // ── Editability: leaf codes ending in "0000" are protected placeholders ────

  // Nothing auto-expands — walk down every nested level to reach the leaves.
  function expandFullAncestorChain() {
    fireEvent.click(screen.getByTestId('account-tree-toggle-group-A'));
    fireEvent.click(screen.getByTestId('account-tree-toggle-group-A|A.A'));
    fireEvent.click(screen.getByTestId('account-tree-toggle-group-A|A.A|A.A.I'));
    fireEvent.click(screen.getByTestId('account-tree-toggle-group-A|A.A|A.A.I|200'));
    fireEvent.click(screen.getByTestId('account-tree-toggle-group-A|A.A|A.A.I|200|2000'));
  }

  describe('protected 0000-suffixed leaves are not editable', () => {
    it('shows a lock icon on the leaf whose code ends in 0000', () => {
      renderTree(<AccountTreeView {...defaultProps} data={HIERARCHY_DATA} />);
      expandFullAncestorChain();
      expect(screen.getByTestId('account-tree-locked-acc-20000000')).toBeInTheDocument();
    });

    it('does not show a lock icon on a real subaccount not ending in 0000', () => {
      renderTree(<AccountTreeView {...defaultProps} data={HIERARCHY_DATA} />);
      expandFullAncestorChain();
      expect(screen.getByTestId('account-tree-row-acc-20000001')).toBeInTheDocument();
      expect(screen.queryByTestId('account-tree-locked-acc-20000001')).not.toBeInTheDocument();
    });

    it('never shows a lock icon on a virtual folder node', () => {
      renderTree(<AccountTreeView {...defaultProps} data={HIERARCHY_DATA} />);
      expect(screen.queryByTestId('account-tree-locked-group-A')).not.toBeInTheDocument();
    });

    it('falls back to the searchKey suffix when protectedParentLikeSubaccount is absent', () => {
      // Backend field omitted — the frontend must still infer protection from the code.
      const data = [
        { ...HIERARCHY_DATA[0], protectedParentLikeSubaccount: undefined },
      ];
      renderTree(<AccountTreeView {...defaultProps} data={data} />);
      expandFullAncestorChain();
      expect(screen.getByTestId('account-tree-locked-acc-20000000')).toBeInTheDocument();
    });

    it('a protected leaf remains clickable/navigable — only editing is blocked server-side', () => {
      const onNavigate = vi.fn();
      renderTree(<AccountTreeView {...defaultProps} data={HIERARCHY_DATA} onNavigate={onNavigate} />);
      expandFullAncestorChain();
      fireEvent.click(screen.getByTestId('account-tree-row-acc-20000000'));
      expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ id: 'acc-20000000' }));
    });
  });

  // ── Self-fetch: full leaf dataset, bypassing ListView's paginated `data` prop ──

  describe('self-fetch of the complete leaf dataset', () => {
    // One leaf per root heading — mirrors the live GOClient regression where only
    // 2 of 4 roots (A, P) appeared because ListView's first page never included a
    // leaf under PYG or O.
    const rootFixture = (rootCode, rootName, id) => ({
      id,
      searchKey: `${rootCode}-LEAF`,
      name: `${rootName} leaf`,
      accountType: 'A',
      summaryLevel: 'N',
      ancestors: [{ value: rootCode, name: rootName, elementLevel: 'E' }],
      hasChildren: false,
    });

    const FULL_DATASET = [
      rootFixture('A', 'ACTIVO', 'acc-a'),
      rootFixture('P', 'PASIVO', 'acc-p'),
      rootFixture('PYG', 'PÉRDIDAS Y GANANCIAS', 'acc-pyg'),
      rootFixture('O', 'CUENTAS ESPECIALES', 'acc-o'),
    ];

    function mockFetchOnce(payload, { ok = true } = {}) {
      globalThis.fetch = vi.fn(() =>
        Promise.resolve({ ok, json: async () => payload }),
      );
    }

    it('fetches the complete dataset from apiBaseUrl/token on mount', async () => {
      mockFetchOnce({ response: { data: FULL_DATASET } });

      renderTree(<AccountTreeView {...defaultProps} apiBaseUrl={TEST_API_BASE_URL} data={[]} />);

      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
        `${TEST_API_BASE_URL}/elementValue?_startRow=0&_endRow=9999`,
        expect.objectContaining({ headers: { Authorization: `Bearer ${defaultProps.token}`, 'Accept-Language': 'es_ES' } }),
      ));
    });

    it('renders every root heading from the fetched full dataset, not just the ones in the paginated data prop', async () => {
      mockFetchOnce({ response: { data: FULL_DATASET } });

      // `data` (ListView's first page) only carries 2 of the 4 roots.
      renderTree(<AccountTreeView {...defaultProps} apiBaseUrl={TEST_API_BASE_URL} data={[FULL_DATASET[0], FULL_DATASET[1]]} />);

      await waitFor(() => {
        expect(screen.getByTestId('account-tree-row-group-A')).toBeInTheDocument();
        expect(screen.getByTestId('account-tree-row-group-P')).toBeInTheDocument();
        expect(screen.getByTestId('account-tree-row-group-PYG')).toBeInTheDocument();
        expect(screen.getByTestId('account-tree-row-group-O')).toBeInTheDocument();
      });
    });

    it('does not attempt to self-fetch when apiBaseUrl is absent, and renders the data prop as-is', () => {
      globalThis.fetch = vi.fn();

      renderTree(<AccountTreeView {...defaultProps} apiBaseUrl={undefined} />);

      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect(screen.getByTestId('account-tree-row-group-4000')).toBeInTheDocument();
      expect(screen.getByTestId('account-tree-row-group-5000')).toBeInTheDocument();
    });

    it('shows the skeleton (no partial data, no empty-state message) while the initial fetch is in flight', () => {
      // Never resolves within this test — we only care about the synchronous
      // render right after mount, before the fetch has settled.
      globalThis.fetch = vi.fn(() => new Promise(() => {}));

      renderTree(<AccountTreeView {...defaultProps} apiBaseUrl={TEST_API_BASE_URL} data={[]} />);

      expect(screen.getByTestId('account-tree-skeleton')).toBeInTheDocument();
      expect(screen.queryByTestId('account-tree-row-group-4000')).not.toBeInTheDocument();
      expect(screen.queryByText('accountTreeNoAccounts')).not.toBeInTheDocument();
    });

    it('shows the skeleton even when the paginated data prop already has rows', () => {
      globalThis.fetch = vi.fn(() => new Promise(() => {}));

      renderTree(<AccountTreeView {...defaultProps} apiBaseUrl={TEST_API_BASE_URL} data={DATA} />);

      expect(screen.getByTestId('account-tree-skeleton')).toBeInTheDocument();
      expect(screen.queryByTestId('account-tree-row-group-4000')).not.toBeInTheDocument();
    });

    it('replaces the skeleton with the full tree in one shot once the fetch resolves — no partial-tree frame', async () => {
      mockFetchOnce({ response: { data: FULL_DATASET } });

      renderTree(<AccountTreeView {...defaultProps} apiBaseUrl={TEST_API_BASE_URL} data={[FULL_DATASET[0], FULL_DATASET[1]]} />);

      expect(screen.getByTestId('account-tree-skeleton')).toBeInTheDocument();

      await waitFor(() => expect(screen.queryByTestId('account-tree-skeleton')).not.toBeInTheDocument());
      // All 4 roots present the moment the skeleton is gone — not just the 2
      // from the paginated `data` prop.
      expect(screen.getByTestId('account-tree-row-group-A')).toBeInTheDocument();
      expect(screen.getByTestId('account-tree-row-group-P')).toBeInTheDocument();
      expect(screen.getByTestId('account-tree-row-group-PYG')).toBeInTheDocument();
      expect(screen.getByTestId('account-tree-row-group-O')).toBeInTheDocument();
    });

    it('when apiBaseUrl is absent, no skeleton ever appears', () => {
      globalThis.fetch = vi.fn();

      renderTree(<AccountTreeView {...defaultProps} apiBaseUrl={undefined} />);

      expect(screen.queryByTestId('account-tree-skeleton')).not.toBeInTheDocument();
      expect(screen.getByTestId('account-tree-row-group-4000')).toBeInTheDocument();
    });

    it('falls back to the data prop and shows an error toast when the full fetch fails', async () => {
      globalThis.fetch = vi.fn(() => Promise.reject(new Error('network down')));

      renderTree(<AccountTreeView {...defaultProps} apiBaseUrl={TEST_API_BASE_URL} />);

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('accountTreeFetchError'));
      // Original paginated data prop still renders — the tree didn't crash or go blank.
      expect(screen.getByTestId('account-tree-row-group-4000')).toBeInTheDocument();
      expect(screen.getByTestId('account-tree-row-group-5000')).toBeInTheDocument();
    });

    it('refetches the full dataset after a new sub-account is saved, without re-showing the skeleton', async () => {
      mockFetchOnce({ response: { data: DATA } });
      renderTree(<AccountTreeView {...defaultProps} apiBaseUrl={TEST_API_BASE_URL} />);
      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.queryByTestId('account-tree-skeleton')).not.toBeInTheDocument());
      expect(screen.getByTestId('account-tree-row-group-4000')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('open-create'));
      fireEvent.click(screen.getByTestId('modal-save'));

      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
      // The background refetch never re-shows the full-page skeleton — the
      // already-rendered tree (from the `data` prop fallback) stays visible.
      expect(screen.queryByTestId('account-tree-skeleton')).not.toBeInTheDocument();
      expect(screen.getByTestId('account-tree-row-group-4000')).toBeInTheDocument();
    });

    it('when the FIRST fetch fails and a LATER refetch is triggered, the skeleton does not come back', async () => {
      globalThis.fetch = vi.fn(() => Promise.reject(new Error('network down')));
      renderTree(<AccountTreeView {...defaultProps} apiBaseUrl={TEST_API_BASE_URL} />);

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('accountTreeFetchError'));
      // Fallback tree from the `data` prop is showing, not the skeleton.
      expect(screen.queryByTestId('account-tree-skeleton')).not.toBeInTheDocument();
      expect(screen.getByTestId('account-tree-row-group-4000')).toBeInTheDocument();

      // Trigger a retry (save flow bumps fetchGeneration); still fails.
      fireEvent.click(screen.getByTestId('open-create'));
      fireEvent.click(screen.getByTestId('modal-save'));

      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
      // Naive `fetchedData === null` gate would flip the skeleton back on here —
      // this is the regression test for that.
      expect(screen.queryByTestId('account-tree-skeleton')).not.toBeInTheDocument();
      expect(screen.getByTestId('account-tree-row-group-4000')).toBeInTheDocument();
    });

    // ── ETP-5387 QA: the toolbar Refresh button (ListView → userRefreshTrigger) ──

    function deferredFetch() {
      const pending = [];
      globalThis.fetch = vi.fn(() => new Promise((resolve, reject) => pending.push({ resolve, reject })));
      return {
        resolveLast: (rows) => pending.at(-1).resolve({ ok: true, json: async () => ({ response: { data: rows } }) }),
        rejectLast: () => pending.at(-1).reject(new Error('network down')),
      };
    }

    async function renderLoaded(fetchCtl, props = {}) {
      const utils = renderTree(<AccountTreeView {...defaultProps} apiBaseUrl={TEST_API_BASE_URL} userRefreshTrigger={0} {...props} />);
      await act(async () => fetchCtl.resolveLast(FULL_DATASET));
      await waitFor(() => expect(screen.queryByTestId('account-tree-skeleton')).not.toBeInTheDocument());
      return utils;
    }

    it('does not refetch on mount just because a userRefreshTrigger value is present', async () => {
      const fetchCtl = deferredFetch();
      await renderLoaded(fetchCtl, { userRefreshTrigger: 3 });
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('a Refresh press refetches and shows the skeleton until the full chart arrives', async () => {
      const fetchCtl = deferredFetch();
      const { rerender } = await renderLoaded(fetchCtl);
      expect(screen.getByTestId('account-tree-row-group-PYG')).toBeInTheDocument();

      rerender(<AccountTreeView {...defaultProps} apiBaseUrl={TEST_API_BASE_URL} userRefreshTrigger={1} />);

      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
      expect(screen.getByTestId('account-tree-skeleton')).toBeInTheDocument();
      expect(screen.queryByTestId('account-tree-row-group-PYG')).not.toBeInTheDocument();

      await act(async () => fetchCtl.resolveLast([...FULL_DATASET, rootFixture('N', 'NUEVA', 'acc-n')]));
      await waitFor(() => expect(screen.queryByTestId('account-tree-skeleton')).not.toBeInTheDocument());
      // The refreshed data is what renders — a record added elsewhere shows up.
      expect(screen.getByTestId('account-tree-row-group-N')).toBeInTheDocument();
    });

    it('a failed Refresh brings the previous tree back with the error toast (no stuck skeleton)', async () => {
      const fetchCtl = deferredFetch();
      const { rerender } = await renderLoaded(fetchCtl);

      rerender(<AccountTreeView {...defaultProps} apiBaseUrl={TEST_API_BASE_URL} userRefreshTrigger={1} />);
      await waitFor(() => expect(screen.getByTestId('account-tree-skeleton')).toBeInTheDocument());

      await act(async () => fetchCtl.rejectLast());
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('accountTreeFetchError'));
      expect(screen.queryByTestId('account-tree-skeleton')).not.toBeInTheDocument();
      expect(screen.getByTestId('account-tree-row-group-PYG')).toBeInTheDocument();
    });

    it('ignores a Refresh press when there is no apiBaseUrl (nothing to refetch, no stuck skeleton)', () => {
      globalThis.fetch = vi.fn();
      const { rerender } = renderTree(<AccountTreeView {...defaultProps} apiBaseUrl={undefined} userRefreshTrigger={0} />);
      rerender(<AccountTreeView {...defaultProps} apiBaseUrl={undefined} userRefreshTrigger={1} />);

      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect(screen.queryByTestId('account-tree-skeleton')).not.toBeInTheDocument();
      expect(screen.getByTestId('account-tree-row-group-4000')).toBeInTheDocument();
    });

    it('never forwards userRefreshTrigger to the DOM', async () => {
      const fetchCtl = deferredFetch();
      await renderLoaded(fetchCtl, { userRefreshTrigger: 2 });
      expect(screen.getByTestId('account-tree')).not.toHaveAttribute('userrefreshtrigger');
      expect(screen.getByTestId('account-tree')).not.toHaveAttribute('userRefreshTrigger');
    });
  });

  // ── ETP-5593: unified toolbar, sort, root count, filter × expansion ─────────

  describe('ETP-5593 unified toolbar', () => {
    // Two roots (4000 → 2 leaves, 5000 → 1 leaf) from DATA, plus a nested hierarchy.
    const rowIds = () => screen.getAllByRole('row')
      .map((r) => r.getAttribute('data-testid'))
      .filter((id) => id?.startsWith('account-tree-row-'));

    it('exposes the toolbar slot as a static ToolbarQuickFilter (ETP-5188 convention)', () => {
      expect(typeof AccountTreeView.ToolbarQuickFilter).toBe('function');
    });

    it('the expand button reads expandAll until any shown folder opens, then collapseAll', () => {
      renderTree(<AccountTreeView {...defaultProps} />);
      const button = screen.getByTestId('coa-toggle-expand-all');
      expect(button).toHaveTextContent('expandAll');

      // Opening one folder by its own chevron also flips the label.
      fireEvent.click(screen.getByTestId('account-tree-toggle-group-4000'));
      expect(button).toHaveTextContent('collapseAll');

      fireEvent.click(button); // collapse all
      expect(button).toHaveTextContent('expandAll');
      expect(screen.queryByTestId('account-tree-row-acc-40000000')).not.toBeInTheDocument();
    });

    it('ignores persisted ids of folders that no longer exist when choosing the label', () => {
      localStorage.setItem('sf.chartOfAccounts.expandedFolderIds', JSON.stringify(['group-gone']));
      renderTree(<AccountTreeView {...defaultProps} />);
      expect(screen.getByTestId('coa-toggle-expand-all')).toHaveTextContent('expandAll');
    });

    it('reports the number of ROOT folders through onRecordCountChange, unaffected by filters', () => {
      const onRecordCountChange = vi.fn();
      renderTree(
        <AccountTreeView {...defaultProps} onRecordCountChange={onRecordCountChange} />,
        { entry: '/chart-of-accounts?accountType=E' },
      );
      // Only 5000 survives the filter, but the badge counts both roots.
      expect(screen.queryByTestId('account-tree-row-group-4000')).not.toBeInTheDocument();
      expect(onRecordCountChange).toHaveBeenLastCalledWith(2);
    });

    it('sorts siblings at every level by name when ListView sorts by name', () => {
      renderTree(<AccountTreeView {...defaultProps} sortColumn="name" sortDirection="asc" />);
      fireEvent.click(screen.getByTestId('coa-toggle-expand-all'));
      // Roots by name: "Purchases" (5000) before "Sales" (4000); inside 4000, "Sales EU"
      // (40000002) before "Sales US" (40000001) — the opposite of code order.
      expect(rowIds()).toEqual([
        'account-tree-row-group-5000',
        'account-tree-row-acc-50000001',
        'account-tree-row-group-4000',
        'account-tree-row-acc-40000001',
        'account-tree-row-acc-40000000',
      ]);
    });

    it('sorts by code descending at every level', () => {
      renderTree(<AccountTreeView {...defaultProps} sortColumn="searchKey" sortDirection="desc" />);
      fireEvent.click(screen.getByTestId('coa-toggle-expand-all'));
      expect(rowIds()).toEqual([
        'account-tree-row-group-5000',
        'account-tree-row-acc-50000001',
        'account-tree-row-group-4000',
        'account-tree-row-acc-40000001',
        'account-tree-row-acc-40000000',
      ]);
    });

    it('keeps code order for a sort column the tree does not offer (ListView default)', () => {
      renderTree(<AccountTreeView {...defaultProps} sortColumn="creationDate" sortDirection="desc" />);
      fireEvent.click(screen.getByTestId('coa-toggle-expand-all'));
      expect(rowIds()).toEqual([
        'account-tree-row-group-4000',
        'account-tree-row-acc-40000000',
        'account-tree-row-acc-40000001',
        'account-tree-row-group-5000',
        'account-tree-row-acc-50000001',
      ]);
    });

    it('a search seeds the expansion, but the user can still collapse a folder', () => {
      renderTree(<AccountTreeView {...defaultProps} data={HIERARCHY_DATA} />);
      typeIntoSearch('aplicada');
      expect(screen.getByTestId('account-tree-row-acc-20000001')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('account-tree-toggle-group-A'));
      expect(screen.queryByTestId('account-tree-row-acc-20000001')).not.toBeInTheDocument();
      expect(screen.getByTestId('account-tree-row-group-A')).toBeInTheDocument();
    });

    it('"Contraer todo" works while a filter is active', () => {
      renderTree(<AccountTreeView {...defaultProps} data={HIERARCHY_DATA} />);
      typeIntoSearch('aplicada');
      expect(screen.getByTestId('coa-toggle-expand-all')).toHaveTextContent('collapseAll');

      fireEvent.click(screen.getByTestId('coa-toggle-expand-all'));
      expect(screen.queryByTestId('account-tree-row-acc-20000001')).not.toBeInTheDocument();
    });

    it('does not persist the expansion a filter seeds', () => {
      renderTree(<AccountTreeView {...defaultProps} data={HIERARCHY_DATA} />);
      fireEvent.click(screen.getByTestId('account-tree-toggle-group-A'));
      const persisted = localStorage.getItem('sf.chartOfAccounts.expandedFolderIds');

      typeIntoSearch('aplicada');
      expect(localStorage.getItem('sf.chartOfAccounts.expandedFolderIds')).toBe(persisted);
    });

    it('restores the pre-filter expansion when the search is cleared', () => {
      renderTree(<AccountTreeView {...defaultProps} />);
      fireEvent.click(screen.getByTestId('account-tree-toggle-group-5000'));
      typeIntoSearch('Sales');
      expect(screen.getByTestId('account-tree-row-acc-40000000')).toBeInTheDocument();

      typeIntoSearch('');
      expect(screen.getByTestId('account-tree-row-acc-50000001')).toBeInTheDocument(); // 5000 still open
      expect(screen.queryByTestId('account-tree-row-acc-40000000')).not.toBeInTheDocument(); // 4000 closed again
    });

    it('debounces the search: the box updates at once, the URL and the tree after a pause', () => {
      renderTree(<AccountTreeView {...defaultProps} />);
      vi.useFakeTimers();
      try {
        const input = screen.getByTestId('coa-search-input');
        fireEvent.change(input, { target: { value: 'Sal' } });
        fireEvent.change(input, { target: { value: 'Sales' } });
        expect(input).toHaveValue('Sales');
        expect(screen.getByTestId('location-search')).toHaveTextContent('');
        expect(screen.queryByTestId('account-tree-row-acc-40000000')).not.toBeInTheDocument();

        act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1); });
        expect(screen.getByTestId('location-search')).toHaveTextContent('');

        act(() => { vi.advanceTimersByTime(1); });
        // Only the last value is written, once.
        expect(screen.getByTestId('location-search')).toHaveTextContent('?q=Sales');
        expect(screen.getByTestId('account-tree-row-acc-40000000')).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    // QA BUG-1 — the timer's write used the params of the render where the user typed and
    // wiped an account type picked during the pause.
    it('a pending search write keeps an account type picked during the pause', () => {
      renderTree(<AccountTreeView {...defaultProps} />);
      vi.useFakeTimers();
      try {
        fireEvent.change(screen.getByTestId('coa-search-input'), { target: { value: 'Sales' } });
        fireEvent.click(screen.getByTestId('coa-filter-account-type'));
        fireEvent.click(within(screen.getByTestId('PopoverContent__cd3aa9')).getByText('accountTypeRevenue'));
        act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS); });

        const search = screen.getByTestId('location-search').textContent;
        expect(search).toContain('q=Sales');
        expect(search).toContain('accountType=R');
      } finally {
        vi.useRealTimers();
      }
    });

    // QA BUG-2 — leaving the box (to press Share, open the type picker…) writes at once.
    it('leaving the search box writes the pending search immediately', () => {
      renderTree(<AccountTreeView {...defaultProps} />);
      vi.useFakeTimers();
      try {
        const input = screen.getByTestId('coa-search-input');
        fireEvent.change(input, { target: { value: 'Sales' } });
        fireEvent.blur(input);
        expect(screen.getByTestId('location-search')).toHaveTextContent('?q=Sales');

        // The flushed timer must not write again later.
        fireEvent.click(screen.getByTestId('coa-filter-account-type'));
        fireEvent.click(within(screen.getByTestId('PopoverContent__cd3aa9')).getByText('accountTypeRevenue'));
        act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS); });
        expect(screen.getByTestId('location-search').textContent).toContain('accountType=R');
      } finally {
        vi.useRealTimers();
      }
    });

    it('drops a pending search write when the toolbar unmounts', () => {
      const { unmount } = renderTree(<AccountTreeView {...defaultProps} />);
      vi.useFakeTimers();
      try {
        fireEvent.change(screen.getByTestId('coa-search-input'), { target: { value: 'Sales' } });
        unmount();
        expect(() => act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS); })).not.toThrow();
      } finally {
        vi.useRealTimers();
      }
    });

    it('keeps the search and the account type in the URL (shareable)', () => {
      renderTree(<AccountTreeView {...defaultProps} />);
      typeIntoSearch('Sales');
      expect(screen.getByTestId('location-search')).toHaveTextContent('q=Sales');

      fireEvent.click(screen.getByTestId('coa-filter-account-type'));
      fireEvent.click(screen.getByText('accountTypeExpense'));
      expect(screen.getByTestId('location-search')).toHaveTextContent('accountType=E');
      // Text "Sales" AND type Expense → nothing matches.
      expect(screen.getByText('noResultsFound')).toBeInTheDocument();
    });

    it('a filter that arrives in the URL before the accounts seeds the expansion once they load', async () => {
      globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ response: { data: HIERARCHY_DATA } }) }));
      renderTree(
        <AccountTreeView {...defaultProps} apiBaseUrl={TEST_API_BASE_URL} data={[]} />,
        { entry: '/chart-of-accounts?q=aplicada' },
      );
      await waitFor(() => expect(screen.getByTestId('account-tree-row-acc-20000001')).toBeInTheDocument());
      expect(screen.getByTestId('coa-search-input')).toHaveValue('aplicada');
    });

    // Review W1 — ListView's partial page can arrive before the full self-fetch.
    it('a URL filter re-seeds once the full dataset replaces the partial first page', async () => {
      let resolveFetch;
      globalThis.fetch = vi.fn(() => new Promise((resolve) => { resolveFetch = resolve; }));
      const partial = [HIERARCHY_DATA[0]]; // only 20000000 — its match is not on this page
      const full = [
        ...HIERARCHY_DATA,
        {
          id: 'acc-57000001', searchKey: '57000001', name: 'Caja aplicada', accountType: 'A',
          summaryLevel: 'N', ancestors: [{ value: 'B', name: 'OTROS', elementLevel: 'E' }], hasChildren: false,
        },
      ];
      renderTree(
        <AccountTreeView {...defaultProps} apiBaseUrl={TEST_API_BASE_URL} data={partial} />,
        { entry: '/chart-of-accounts?q=aplicada' },
      );
      await act(async () => resolveFetch({ ok: true, json: async () => ({ response: { data: full } }) }));

      await waitFor(() => expect(screen.getByTestId('account-tree-row-acc-20000001')).toBeInTheDocument());
      expect(screen.getByTestId('account-tree-row-acc-57000001')).toBeInTheDocument();
    });

    // Review W2 — the store outlives the tree; a filter's temporary expansion must not.
    it('a remount without a filter shows the persisted expansion, not the last filter\'s', () => {
      const { unmount } = renderTree(<AccountTreeView {...defaultProps} data={HIERARCHY_DATA} />);
      typeIntoSearch('aplicada');
      expect(screen.getByTestId('account-tree-row-acc-20000001')).toBeInTheDocument();
      unmount();

      renderTree(<AccountTreeView {...defaultProps} data={HIERARCHY_DATA} />);
      expect(screen.queryByTestId('account-tree-row-acc-20000001')).not.toBeInTheDocument();
      expect(screen.getByTestId('coa-toggle-expand-all')).toHaveTextContent('expandAll');
    });

    it('clearing a filter that came back with the URL restores the persisted expansion', () => {
      const { unmount } = renderTree(<AccountTreeView {...defaultProps} />);
      fireEvent.click(screen.getByTestId('account-tree-toggle-group-5000')); // persisted: {5000}
      typeIntoSearch('Sales'); // seeds 4000, not persisted
      unmount();

      // Back to the list with the filter still in the URL, then clear it.
      renderTree(<AccountTreeView {...defaultProps} />, { entry: '/chart-of-accounts?q=Sales' });
      typeIntoSearch('');
      expect(screen.getByTestId('account-tree-row-acc-50000001')).toBeInTheDocument();
      expect(screen.queryByTestId('account-tree-row-acc-40000000')).not.toBeInTheDocument();
      expect(JSON.parse(localStorage.getItem('sf.chartOfAccounts.expandedFolderIds'))).toEqual(['group-5000']);
    });

    it('ignores an unknown account type in the URL (shows every type)', () => {
      renderTree(<AccountTreeView {...defaultProps} />, { entry: '/chart-of-accounts?accountType=ZZ' });
      expect(screen.getByTestId('account-tree-row-group-4000')).toBeInTheDocument();
      expect(screen.getByTestId('account-tree-row-group-5000')).toBeInTheDocument();
      expect(screen.getByTestId('coa-filter-account-type')).toHaveTextContent('allAccountTypes');
    });

    it('lists the account types after "all", sorted by their translated label', () => {
      renderTree(<AccountTreeView {...defaultProps} />);
      fireEvent.click(screen.getByTestId('coa-filter-account-type'));
      const popover = screen.getByTestId('PopoverContent__cd3aa9');
      const options = within(popover).getAllByRole('button').map((o) => o.textContent.trim());
      expect(options).toEqual([
        'allAccountTypes',
        'accountTypeAsset',
        'accountTypeExpense',
        'accountTypeLiability',
        'accountTypeMemo',
        'accountTypeOwnersEquity',
        'accountTypeRevenue',
      ]);
      expect(within(popover).getByText('accountTreeFilterType')).toBeInTheDocument(); // heading
    });

    it('renders codes in the dedicated code font (Space Mono, font-code)', () => {
      renderTree(<AccountTreeView {...defaultProps} />);
      expect(within(screen.getByTestId('account-tree-row-group-4000')).getByText('4000'))
        .toHaveClass('font-code');
    });
  });
});
