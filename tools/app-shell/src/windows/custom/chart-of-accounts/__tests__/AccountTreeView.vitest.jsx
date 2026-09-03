// @vitest-environment jsdom

// --- Mocks (before imports) ---

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('lucide-react', () => ({
  ChevronRight: (props) => <span data-testid="chevron-right" {...props} />,
  ChevronDown: (props) => <span data-testid="chevron-down" {...props} />,
  Lock: (props) => <span data-testid="lock-icon" {...props} />,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Stub NewAccountModal — AccountTreeView.jsx's own tree logic is what this
// suite targets; NewAccountModal has its own dedicated test file.
vi.mock('../NewAccountModal', () => ({
  default: ({ isOpen, onClose, onSaved, currentRecord }) =>
    isOpen ? (
      <div data-testid="new-account-modal-stub">
        <span data-testid="modal-current-record-id">{currentRecord?.id ?? 'none'}</span>
        <button type="button" data-testid="modal-close" onClick={onClose}>close</button>
        <button type="button" data-testid="modal-save" onClick={onSaved}>save</button>
      </div>
    ) : null,
}));

// --- Import under test ---

import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toast } from 'sonner';
import AccountTreeView from '../AccountTreeView.jsx';

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

const defaultProps = {
  data: DATA,
  onNavigate: vi.fn(),
  onDataMutated: vi.fn(),
  token: 'test-token',
  apiBaseUrl: '/sws/neo/chart-of-accounts',
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
  });

  afterEach(() => {
    delete globalThis.fetch;
  });

  it('shows the empty state when there are no accounts', () => {
    render(<AccountTreeView {...defaultProps} data={[]} />);
    expect(screen.getByText('accountTreeNoAccounts')).toBeInTheDocument();
    // Toolbar still renders, but no group rows
    expect(screen.queryByTestId('account-tree-row-group-4000')).not.toBeInTheDocument();
  });

  it('groups accounts by parentCode4, collapsed by default', () => {
    render(<AccountTreeView {...defaultProps} />);
    // Group headers are visible…
    expect(screen.getByTestId('account-tree-row-group-4000')).toBeInTheDocument();
    expect(screen.getByTestId('account-tree-row-group-5000')).toBeInTheDocument();
    // …but their children are not, until the user expands a group.
    expect(screen.queryByTestId('account-tree-row-acc-40000001')).not.toBeInTheDocument();
    expect(screen.queryByTestId('account-tree-row-acc-40000000')).not.toBeInTheDocument();
    expect(screen.queryByTestId('account-tree-row-acc-50000001')).not.toBeInTheDocument();
  });

  it('expanding a group reveals its children', () => {
    render(<AccountTreeView {...defaultProps} />);
    fireEvent.click(screen.getByTestId('account-tree-toggle-group-4000'));

    expect(screen.getByTestId('account-tree-row-acc-40000001')).toBeInTheDocument();
    expect(screen.getByTestId('account-tree-row-acc-40000000')).toBeInTheDocument();
    // Sibling group stays collapsed — expanding one group doesn't affect others.
    expect(screen.queryByTestId('account-tree-row-acc-50000001')).not.toBeInTheDocument();
  });

  it('sorts children within a group by searchKey', () => {
    render(<AccountTreeView {...defaultProps} />);
    fireEvent.click(screen.getByTestId('account-tree-toggle-group-4000'));
    const rows = screen.getAllByRole('row').map((r) => r.getAttribute('data-testid'));
    const idxUS = rows.indexOf('account-tree-row-acc-40000000'); // 40000001
    const idxEU = rows.indexOf('account-tree-row-acc-40000001'); // 40000002
    expect(idxUS).toBeLessThan(idxEU);
  });

  it('shows only SearchKey, Name and Account Type — no Debit/Credit/Balance', () => {
    render(<AccountTreeView {...defaultProps} />);
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
    render(<AccountTreeView {...defaultProps} />);
    fireEvent.click(screen.getByTestId('account-tree-toggle-group-4000'));
    fireEvent.click(screen.getByTestId('account-tree-toggle-group-5000'));
    const revenueRow = screen.getByTestId('account-tree-row-acc-40000000');
    expect(within(revenueRow).getByText('accountTypeRevenue')).toBeInTheDocument();

    const expenseRow = screen.getByTestId('account-tree-row-acc-50000001');
    expect(within(expenseRow).getByText('accountTypeExpense')).toBeInTheDocument();
  });

  it('collapsing an already-expanded group hides its children without affecting other groups', () => {
    render(<AccountTreeView {...defaultProps} />);
    fireEvent.click(screen.getByTestId('account-tree-toggle-group-4000'));
    fireEvent.click(screen.getByTestId('account-tree-toggle-group-5000'));
    fireEvent.click(screen.getByTestId('account-tree-toggle-group-4000'));

    expect(screen.queryByTestId('account-tree-row-acc-40000000')).not.toBeInTheDocument();
    expect(screen.queryByTestId('account-tree-row-acc-40000001')).not.toBeInTheDocument();
    expect(screen.getByTestId('account-tree-row-acc-50000001')).toBeInTheDocument();
  });

  it('toggling a group chevron does not select the row or call onNavigate', () => {
    const onNavigate = vi.fn();
    render(<AccountTreeView {...defaultProps} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByTestId('account-tree-toggle-group-4000'));

    expect(onNavigate).not.toHaveBeenCalled();
    expect(screen.getByTestId('account-tree-row-group-4000')).toHaveAttribute('aria-selected', 'false');
  });

  it('clicking a leaf row selects it and calls onNavigate with the item', () => {
    const onNavigate = vi.fn();
    render(<AccountTreeView {...defaultProps} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByTestId('account-tree-toggle-group-4000'));
    fireEvent.click(screen.getByTestId('account-tree-row-acc-40000000'));

    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ id: 'acc-40000000' }));
    expect(screen.getByTestId('account-tree-row-acc-40000000')).toHaveAttribute('aria-selected', 'true');
  });

  it('clicking a virtual group row selects it but does not call onNavigate', () => {
    const onNavigate = vi.fn();
    render(<AccountTreeView {...defaultProps} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByTestId('account-tree-row-group-4000'));

    expect(onNavigate).not.toHaveBeenCalled();
    expect(screen.getByTestId('account-tree-row-group-4000')).toHaveAttribute('aria-selected', 'true');
  });

  it('is collapsed by default on first-ever load (no persisted state)', () => {
    render(<AccountTreeView {...defaultProps} />);
    expect(screen.queryByTestId('account-tree-row-acc-40000000')).not.toBeInTheDocument();
    expect(screen.queryByTestId('account-tree-row-acc-50000001')).not.toBeInTheDocument();
  });

  it('"Contraer" (collapse all) hides every group\'s children', () => {
    render(<AccountTreeView {...defaultProps} />);
    fireEvent.click(screen.getByText('expand'));
    fireEvent.click(screen.getByText('collapse'));

    expect(screen.queryByTestId('account-tree-row-acc-40000000')).not.toBeInTheDocument();
    expect(screen.queryByTestId('account-tree-row-acc-50000001')).not.toBeInTheDocument();
    expect(screen.getByTestId('account-tree-row-group-4000')).toBeInTheDocument();
  });

  it('"Expandir" (expand all) reveals every group\'s children', () => {
    render(<AccountTreeView {...defaultProps} />);
    fireEvent.click(screen.getByText('expand'));

    expect(screen.getByTestId('account-tree-row-acc-40000000')).toBeInTheDocument();
    expect(screen.getByTestId('account-tree-row-acc-50000001')).toBeInTheDocument();
  });

  describe('expand/collapse persistence across remounts', () => {
    it('restores previously expanded folders after unmount + remount (navigate away and back)', () => {
      const { unmount } = render(<AccountTreeView {...defaultProps} />);
      fireEvent.click(screen.getByTestId('account-tree-toggle-group-4000'));
      expect(screen.getByTestId('account-tree-row-acc-40000000')).toBeInTheDocument();
      unmount();

      render(<AccountTreeView {...defaultProps} />);
      expect(screen.getByTestId('account-tree-row-acc-40000000')).toBeInTheDocument();
      // The group that was never expanded stays collapsed.
      expect(screen.queryByTestId('account-tree-row-acc-50000001')).not.toBeInTheDocument();
    });

    it('restores a fully collapsed state after unmount + remount', () => {
      const { unmount } = render(<AccountTreeView {...defaultProps} />);
      fireEvent.click(screen.getByTestId('account-tree-toggle-group-4000'));
      fireEvent.click(screen.getByTestId('account-tree-toggle-group-4000')); // re-collapse
      unmount();

      render(<AccountTreeView {...defaultProps} />);
      expect(screen.queryByTestId('account-tree-row-acc-40000000')).not.toBeInTheDocument();
    });

    it('ignores corrupt persisted state and falls back to collapsed', () => {
      localStorage.setItem('sf.chartOfAccounts.expandedFolderIds', 'not valid json');
      render(<AccountTreeView {...defaultProps} />);
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
    render(<AccountTreeView {...defaultProps} data={data} />);
    fireEvent.click(screen.getByTestId('account-tree-toggle-group-9900'));
    expect(screen.getByTestId('account-tree-row-acc-x')).toBeInTheDocument();
  });

  it('calls onColumnsReady with the tree column definitions', () => {
    const onColumnsReady = vi.fn();
    render(<AccountTreeView {...defaultProps} onColumnsReady={onColumnsReady} />);
    expect(onColumnsReady).toHaveBeenCalled();
    const cols = onColumnsReady.mock.calls.at(-1)[0];
    expect(cols.map((c) => c.key)).toEqual([
      'searchKey',
      'name',
      'accountType',
      'active',
      'ytdDebit',
      'ytdCredit',
      'ytdBalance',
    ]);
  });

  it('opens the New Sub-account modal with no current record when nothing is selected', () => {
    render(<AccountTreeView {...defaultProps} />);
    fireEvent.click(screen.getByText('+ newSubAccount'));

    expect(screen.getByTestId('new-account-modal-stub')).toBeInTheDocument();
    expect(screen.getByTestId('modal-current-record-id')).toHaveTextContent('none');
  });

  it('opens the modal with the selected row as the current record', () => {
    render(<AccountTreeView {...defaultProps} />);
    fireEvent.click(screen.getByTestId('account-tree-toggle-group-4000'));
    fireEvent.click(screen.getByTestId('account-tree-row-acc-40000000'));
    fireEvent.click(screen.getByText('+ newSubAccount'));

    expect(screen.getByTestId('modal-current-record-id')).toHaveTextContent('acc-40000000');
  });

  it('closes the modal via onClose without side effects', () => {
    render(<AccountTreeView {...defaultProps} />);
    fireEvent.click(screen.getByText('+ newSubAccount'));
    fireEvent.click(screen.getByTestId('modal-close'));

    expect(screen.queryByTestId('new-account-modal-stub')).not.toBeInTheDocument();
  });

  it('closes the modal and calls onDataMutated when a new account is saved', () => {
    const onDataMutated = vi.fn();
    render(<AccountTreeView {...defaultProps} onDataMutated={onDataMutated} />);
    fireEvent.click(screen.getByText('+ newSubAccount'));
    fireEvent.click(screen.getByTestId('modal-save'));

    expect(screen.queryByTestId('new-account-modal-stub')).not.toBeInTheDocument();
    expect(onDataMutated).toHaveBeenCalled();
  });

  // ── Full N-level hierarchy (ancestors-driven tree) ──────────────────────────

  describe('full ancestor-chain hierarchy', () => {
    it('builds one nested folder per ancestor level instead of a flat 4-digit group', () => {
      render(<AccountTreeView {...defaultProps} data={HIERARCHY_DATA} />);

      // Root folder "A" is a real group node (top-level, visible but collapsed)…
      expect(screen.getByTestId('account-tree-row-group-A')).toBeInTheDocument();
      // …and there is NO flat 4-digit "2000" group at the root — it must be nested
      // under A > A.A > A.A.I > 200, not a top-level sibling of "A".
      expect(screen.queryByTestId('account-tree-row-group-2000')).not.toBeInTheDocument();
    });

    it('expanding the full ancestor chain reveals both leaves sharing that path', () => {
      render(<AccountTreeView {...defaultProps} data={HIERARCHY_DATA} />);

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
      render(<AccountTreeView {...defaultProps} data={HIERARCHY_DATA} />);
      fireEvent.click(screen.getByText('expand'));

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
      render(<AccountTreeView {...defaultProps} data={HIERARCHY_DATA} />);
      fireEvent.click(screen.getByTestId('account-tree-toggle-group-A'));
      fireEvent.click(screen.getByTestId('account-tree-toggle-group-A|A.A'));

      // A.A.I is now visible but collapsed — its descendants (200, 2000, leaves) are hidden.
      expect(screen.getByTestId('account-tree-row-group-A|A.A|A.A.I')).toBeInTheDocument();
      expect(screen.queryByTestId('account-tree-row-acc-20000000')).not.toBeInTheDocument();
    });
  });

  // ── Tree-native filter (code/name/type/active) ─────────────────────────────

  describe('tree-native filter', () => {
    it('filters leaves by code or name and auto-expands their ancestors', () => {
      render(<AccountTreeView {...defaultProps} data={HIERARCHY_DATA} />);

      fireEvent.change(screen.getByTestId('account-tree-filter-text'), {
        target: { value: 'aplicada' },
      });

      // The match (20000001, "Investigación aplicada.") is visible without any
      // manual expand click — every ancestor folder auto-expanded.
      expect(screen.getByTestId('account-tree-row-acc-20000001')).toBeInTheDocument();
      // The non-matching sibling leaf is hidden.
      expect(screen.queryByTestId('account-tree-row-acc-20000000')).not.toBeInTheDocument();
    });

    it('hides branches with no matching descendant at any depth', () => {
      render(<AccountTreeView {...defaultProps} data={HIERARCHY_DATA} />);

      fireEvent.change(screen.getByTestId('account-tree-filter-text'), {
        target: { value: 'no-such-account' },
      });

      expect(screen.queryByTestId('account-tree-row-group-A')).not.toBeInTheDocument();
      expect(screen.getByText('noResultsFound')).toBeInTheDocument();
    });

    it('filters by account type independently of the text filter', () => {
      render(<AccountTreeView {...defaultProps} data={DATA} />);
      fireEvent.click(screen.getByTestId('account-tree-toggle-group-4000'));
      fireEvent.click(screen.getByTestId('account-tree-toggle-group-5000'));

      fireEvent.change(screen.getByTestId('account-tree-filter-type'), {
        target: { value: 'E' },
      });

      // "Purchases US" (accountType 'E') matches; the two 'R' (Revenue) leaves
      // under 4000 do not, so that whole branch disappears.
      expect(screen.getByTestId('account-tree-row-acc-50000001')).toBeInTheDocument();
      expect(screen.queryByTestId('account-tree-row-group-4000')).not.toBeInTheDocument();
    });

    it('clearing the filter reverts to the manual expand/collapse state, not the auto-expanded one', () => {
      render(<AccountTreeView {...defaultProps} data={HIERARCHY_DATA} />);
      // No manual expansion at all — tree is fully collapsed.
      fireEvent.change(screen.getByTestId('account-tree-filter-text'), {
        target: { value: 'aplicada' },
      });
      expect(screen.getByTestId('account-tree-row-acc-20000001')).toBeInTheDocument();

      fireEvent.change(screen.getByTestId('account-tree-filter-text'), {
        target: { value: '' },
      });

      // Back to fully collapsed — the filter's auto-expand must not leak into
      // the persisted manual `expanded` state.
      expect(screen.queryByTestId('account-tree-row-acc-20000001')).not.toBeInTheDocument();
      expect(screen.getByTestId('account-tree-row-group-A')).toBeInTheDocument();
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

    it('renders checked for an active leaf and unchecked for an inactive one', () => {
      const data = [
        { ...DATA[0], active: true },
        { ...DATA[1], active: false },
      ];
      render(<AccountTreeView {...defaultProps} data={data} />);
      fireEvent.click(screen.getByTestId('account-tree-toggle-group-4000'));

      expect(screen.getByTestId('account-tree-active-toggle-acc-40000001')).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByTestId('account-tree-active-toggle-acc-40000000')).toHaveAttribute('aria-checked', 'false');
    });

    // ETP-4884 bugfix — NEO can return `active` as the raw AD string 'Y'/'N'
    // rather than a JS boolean. A strict `=== true` check rendered a genuinely
    // active account ('Y') as OFF; the toggle must accept 'Y'/'N' too.
    it('renders checked for an active leaf and unchecked for an inactive one when active is a string', () => {
      const data = [
        { ...DATA[0], active: 'Y' },
        { ...DATA[1], active: 'N' },
      ];
      render(<AccountTreeView {...defaultProps} data={data} />);
      fireEvent.click(screen.getByTestId('account-tree-toggle-group-4000'));

      expect(screen.getByTestId('account-tree-active-toggle-acc-40000001')).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByTestId('account-tree-active-toggle-acc-40000000')).toHaveAttribute('aria-checked', 'false');
    });

    it('PATCHes elementValue/{id} with { active: checked } on toggle', async () => {
      const data = [{ ...DATA[0], active: true }];
      render(<AccountTreeView {...defaultProps} data={data} />);
      fireEvent.click(screen.getByTestId('account-tree-toggle-group-4000'));

      fireEvent.click(screen.getByTestId('account-tree-active-toggle-acc-40000001'));

      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
        `${defaultProps.apiBaseUrl}/elementValue/acc-40000001`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ active: false }),
        }),
      ));
    });

    it('rolls back the toggle and shows an error toast when the PATCH fails', async () => {
      mockFetchPatch({ ok: false });
      const data = [{ ...DATA[0], active: true }];
      render(<AccountTreeView {...defaultProps} data={data} />);
      fireEvent.click(screen.getByTestId('account-tree-toggle-group-4000'));

      fireEvent.click(screen.getByTestId('account-tree-active-toggle-acc-40000001'));

      await waitFor(() => expect(screen.getByTestId('account-tree-active-toggle-acc-40000001'))
        .toHaveAttribute('aria-checked', 'true'));
      expect(toast.error).toHaveBeenCalled();
    });

    it('disables the toggle for a protected 0000-suffixed placeholder leaf', () => {
      render(<AccountTreeView {...defaultProps} data={HIERARCHY_DATA} />);
      expandFullAncestorChain();

      expect(screen.getByTestId('account-tree-active-toggle-acc-20000000')).toBeDisabled();
    });

    it('never renders a toggle on a virtual folder row', () => {
      render(<AccountTreeView {...defaultProps} data={DATA} />);
      expect(screen.queryByTestId('account-tree-active-toggle-group-4000')).not.toBeInTheDocument();
    });
  });

  // ── Shared table/button styling (ETP-4884 item 3, token-alignment slice) ──

  describe('shared table/button styling', () => {
    it('renders column headers in the standard sentence-case style, not an uppercase shaded band', () => {
      render(<AccountTreeView {...defaultProps} />);
      const codeHeader = screen.getByText('accountTreeCode');

      expect(codeHeader.className).toContain('text-sm');
      expect(codeHeader.className).not.toContain('uppercase');
      expect(codeHeader.className).not.toContain('tracking-wide');
    });

    it('uses the standard muted/50 hover on tree rows, not a full-opacity hover', () => {
      render(<AccountTreeView {...defaultProps} />);
      const row = screen.getByTestId('account-tree-row-group-4000');

      expect(row.className).toContain('hover:bg-[hsl(var(--muted))]/50');
    });

    it('uses the standard plain muted selected-row color, not the info-blue tint', () => {
      render(<AccountTreeView {...defaultProps} />);
      fireEvent.click(screen.getByTestId('account-tree-row-group-4000'));
      const row = screen.getByTestId('account-tree-row-group-4000');

      expect(row.className).toContain('bg-[hsl(var(--muted))]');
      expect(row.className).not.toContain('--status-info-bg');
    });

    it('renders "+ New Sub-account" using the shared Button component (rounded-md), not a hand-rolled pill', () => {
      render(<AccountTreeView {...defaultProps} />);
      const trigger = screen.getByText('+ newSubAccount');

      expect(trigger.className).toContain('rounded-md');
      expect(trigger.className).not.toContain('rounded-full');
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
      render(<AccountTreeView {...defaultProps} data={HIERARCHY_DATA} />);
      expandFullAncestorChain();
      expect(screen.getByTestId('account-tree-locked-acc-20000000')).toBeInTheDocument();
    });

    it('does not show a lock icon on a real subaccount not ending in 0000', () => {
      render(<AccountTreeView {...defaultProps} data={HIERARCHY_DATA} />);
      expandFullAncestorChain();
      expect(screen.getByTestId('account-tree-row-acc-20000001')).toBeInTheDocument();
      expect(screen.queryByTestId('account-tree-locked-acc-20000001')).not.toBeInTheDocument();
    });

    it('never shows a lock icon on a virtual folder node', () => {
      render(<AccountTreeView {...defaultProps} data={HIERARCHY_DATA} />);
      expect(screen.queryByTestId('account-tree-locked-group-A')).not.toBeInTheDocument();
    });

    it('falls back to the searchKey suffix when protectedParentLikeSubaccount is absent', () => {
      // Backend field omitted — the frontend must still infer protection from the code.
      const data = [
        { ...HIERARCHY_DATA[0], protectedParentLikeSubaccount: undefined },
      ];
      render(<AccountTreeView {...defaultProps} data={data} />);
      expandFullAncestorChain();
      expect(screen.getByTestId('account-tree-locked-acc-20000000')).toBeInTheDocument();
    });

    it('a protected leaf remains clickable/navigable — only editing is blocked server-side', () => {
      const onNavigate = vi.fn();
      render(<AccountTreeView {...defaultProps} data={HIERARCHY_DATA} onNavigate={onNavigate} />);
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

      render(<AccountTreeView {...defaultProps} data={[]} />);

      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
        `${defaultProps.apiBaseUrl}/elementValue?_startRow=0&_endRow=9999`,
        expect.objectContaining({ headers: { Authorization: `Bearer ${defaultProps.token}`, 'Accept-Language': 'es_ES' } }),
      ));
    });

    it('renders every root heading from the fetched full dataset, not just the ones in the paginated data prop', async () => {
      mockFetchOnce({ response: { data: FULL_DATASET } });

      // `data` (ListView's first page) only carries 2 of the 4 roots.
      render(<AccountTreeView {...defaultProps} data={[FULL_DATASET[0], FULL_DATASET[1]]} />);

      await waitFor(() => {
        expect(screen.getByTestId('account-tree-row-group-A')).toBeInTheDocument();
        expect(screen.getByTestId('account-tree-row-group-P')).toBeInTheDocument();
        expect(screen.getByTestId('account-tree-row-group-PYG')).toBeInTheDocument();
        expect(screen.getByTestId('account-tree-row-group-O')).toBeInTheDocument();
      });
    });

    it('does not attempt to self-fetch when apiBaseUrl is absent, and renders the data prop as-is', () => {
      globalThis.fetch = vi.fn();

      render(<AccountTreeView {...defaultProps} apiBaseUrl={undefined} />);

      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect(screen.getByTestId('account-tree-row-group-4000')).toBeInTheDocument();
      expect(screen.getByTestId('account-tree-row-group-5000')).toBeInTheDocument();
    });

    it('falls back to the data prop and shows an error toast when the full fetch fails', async () => {
      globalThis.fetch = vi.fn(() => Promise.reject(new Error('network down')));

      render(<AccountTreeView {...defaultProps} />);

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('accountTreeFetchError'));
      // Original paginated data prop still renders — the tree didn't crash or go blank.
      expect(screen.getByTestId('account-tree-row-group-4000')).toBeInTheDocument();
      expect(screen.getByTestId('account-tree-row-group-5000')).toBeInTheDocument();
    });

    it('refetches the full dataset after a new sub-account is saved', async () => {
      mockFetchOnce({ response: { data: [] } });
      render(<AccountTreeView {...defaultProps} />);
      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));

      fireEvent.click(screen.getByText('+ newSubAccount'));
      fireEvent.click(screen.getByTestId('modal-save'));

      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
    });
  });
});
