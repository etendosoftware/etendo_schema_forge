/**
 * Tests for UserRolesTab — ETP-4906 "Roles del usuario" live permission-preview
 * matrix. See the component's own doc comment for the cross-task coupling with
 * AssignTemplateRolesControl (shared `useRoleSelection()` context) and the
 * hardcoded 3-row "General" category (never derived from SFListMenu).
 */
import { render, screen, waitFor, within } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
}));

vi.mock('@/lib/rolesApi.js', () => ({
  fetchRolesOverview: vi.fn(),
  fetchTemplateRoles: vi.fn(),
}));

vi.mock('@/lib/menuTree.js', () => ({
  fetchMenuTree: vi.fn(),
}));

// ETP-4999 item 5 — render the Radix tooltip pieces inline so the winner tooltip's
// content is synchronously in the DOM (no portal / hover / act warnings), same
// pattern as ComputedFreshnessHint.vitest.jsx. `TooltipTrigger`'s `asChild` child
// (the `<span data-testid="WinnerBadge__...">`) is rendered as-is so existing
// `getByTestId('WinnerBadge__...')` queries keep working unchanged.
vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }) => <>{children}</>,
  Tooltip: ({ children }) => <>{children}</>,
  TooltipTrigger: ({ children }) => <>{children}</>,
  TooltipContent: (props) => <div data-testid={props['data-testid']}>{props.children}</div>,
}));

// ETP-5196 — `UserRolesTab.jsx` now imports `buildMenuWindowIndex()` (from
// `@/pages/roles/useRolesOverviewData.js`), which in turn imports the REAL
// `../../menu.json` at module scope. Mocked here with a small synthetic fixture —
// SAME convention `useRolesOverviewData.vitest.js` already established for its own
// coverage of `buildMenuWindowIndex`/`adaptMatrix` — rather than depending on real,
// currently-live windowIds (real `menu.json` can be edited for unrelated reasons and
// would silently break these assertions). `UserRolesTab.jsx` is at
// `src/windows/custom/user/`, so `@/pages/roles/useRolesOverviewData.js`'s own
// `'../../menu.json'` resolves to `src/menu.json`; from THIS test file (at
// `src/windows/custom/user/__tests__/`), that same file is 4 levels up.
//
// Deliberately uses windowIds that do NOT collide with `w1`/`w2`/`w3`/`w4` (the
// synthetic ids every pre-existing fixture/test in this file uses) — those stay
// absent from this mocked index, so every pre-existing test keeps exercising the
// FALLBACK (AD-tree) path completely unaffected, exactly as before this mock existed.
vi.mock('../../../../menu.json', () => ({
  default: {
    menu: [
      // groupOrder 0 — deliberately declared BEFORE 'Alpha' (reverse-alphabetical),
      // so a test asserting groupOrder-based category order can't accidentally pass
      // because it happens to coincide with alphabetical order.
      { group: 'Zeta', items: [{ name: 'zeta-window', label: 'Zeta Window', windowId: 'm-zeta' }] },
      { group: 'Alpha', items: [{ name: 'alpha-window', label: 'Alpha Window', windowId: 'm-alpha' }] }, // groupOrder 1
      {
        // groupOrder 2 — 'Row B' (itemOrder 0) declared BEFORE 'Row A' (itemOrder 1),
        // likewise reverse-alphabetical at the ROW level, for the same reason.
        group: 'RowOrderGroup',
        items: [
          { name: 'row-b', label: 'Row B (itemOrder 0)', windowId: 'm-row-b' },
          { name: 'row-a', label: 'Row A (itemOrder 1)', windowId: 'm-row-a' },
        ],
      },
      // groupOrder 3 — ONLY a hidden entry, no visible alternative (the real Match
      // Rule/Periods shape) — must be excluded from the matrix entirely.
      { group: 'HiddenOnlyGroup', items: [{ name: 'hidden-only', label: 'Hidden Only', windowId: 'm-hidden', hidden: true }] },
      // groupOrder 4 — this id is ALSO given a (different, wrong) category/name via a
      // per-test AD-tree fixture, to prove menu.json wins over the AD-tree fallback
      // when a window id exists in BOTH sources.
      { group: 'DualMappedGroup', items: [{ name: 'dual-via-menu', label: 'Dual (menu.json label)', windowId: 'm-dual' }] },
    ],
  },
}));

import { fetchRolesOverview, fetchTemplateRoles } from '@/lib/rolesApi.js';
import { fetchMenuTree } from '@/lib/menuTree.js';
import UserRolesTab from '../UserRolesTab.jsx';
import { RoleSelectionProvider } from '../roleSelectionContext.js';

const MENU_TREE = {
  tree: [
    {
      type: 'folder',
      name: 'Comercial',
      children: [
        { name: 'Ventas', windowId: 'w1' },
        { name: 'Clientes', windowId: 'w2' },
      ],
    },
    {
      type: 'folder',
      name: 'Compras',
      children: [
        { name: 'Proveedores', windowId: 'w3' },
      ],
    },
  ],
};

const ROLES_OVERVIEW = {
  roles: [
    { id: 'role-fin', name: 'Finance', windows: [{ id: 'w1', tier: 'full' }] },
    { id: 'role-sales', name: 'Sales', windows: [{ id: 'w1', tier: 'full' }, { id: 'w2', tier: 'readonly' }] },
    { id: 'role-admin', name: 'GOClient Admin', isClientAdmin: true, windows: [{ id: 'w1', tier: 'full' }, { id: 'w2', tier: 'full' }, { id: 'w3', tier: 'full' }] },
  ],
};

// ETP-4906 DEV wave 7 — the matrix's own COLUMNS (which roles, and their per-window tier
// data) now come from `fetchTemplateRoles()` (`SFSystemRoleTemplates`), NOT from
// `fetchRolesOverview()` — see the component's own "Two role sources, two different jobs"
// doc comment. `ROLES_OVERVIEW` above is kept ONLY for `activeWindowIds` (needs the union
// across ALL of the tenant's roles, Admin included). Same fin/sales window data as
// `ROLES_OVERVIEW` (minus admin, which `SFSystemRoleTemplates` never returns) so every
// existing cell-value assertion below continues to hold unchanged.
const TEMPLATE_ROLES = {
  roles: ROLES_OVERVIEW.roles.filter((role) => !role.isClientAdmin),
};

// ETP-4906 DEV wave 6 fix #5 fixture — `MENU_TREE` above has NO classic-only leaf: w1/w2/w3
// all appear in at least one role's `windows[]` (Admin covers all 3), so `activeWindowIds`
// (the union of every role's `windows[].id`, Admin included) never actually excludes
// anything against it — every existing test above passes the filter as a no-op. This
// second tree adds a "Diccionario de la aplicación" category whose only leaf (`w4`) is
// NOT present in ANY role's `windows[]` — not even Admin's — the exact shape of a
// classic-only AD menu node `SFListMenu` returns but Etendo GO never exposes
// (`resolveActiveEtendoGoWindowIds()` server-side). The filter must drop `w4`'s row AND
// the now-empty "Diccionario de la aplicación" category header entirely, not render it
// with all-'—' rows.
const MENU_TREE_WITH_CLASSIC_ONLY_CATEGORY = {
  tree: [
    ...MENU_TREE.tree,
    {
      type: 'folder',
      name: 'Diccionario de la aplicación',
      children: [
        { name: 'Módulo', windowId: 'w4' },
      ],
    },
  ],
};

function renderTab({ isNew = false, onVisibilityChange = vi.fn(), selectedRoleIds = [], data } = {}) {
  return render(
    <RoleSelectionProvider value={{ selectedRoleIds, setSelectedRoleIds: vi.fn() }}>
      <UserRolesTab isNew={isNew} onVisibilityChange={onVisibilityChange} data={data} />
    </RoleSelectionProvider>,
  );
}

// ETP-4999 item 5 — `TierPill` only renders an actual `<span>` (class `rounded-full`,
// among others) when `tier` is non-null; a `tier === null` ('—', no access) cell
// renders plain text with no pill span at all. The cell's own outer wrapper `<span>`
// (`inline-flex items-center justify-center gap-1`, always present) never carries
// `rounded-full`, so this selector reaches the pill specifically, not the wrapper.
function pillSpanIn(cell) {
  return cell.querySelector('span.rounded-full');
}

describe('UserRolesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('new (not-yet-persisted) user', () => {
    // ETP-4999 — the tab used to hide itself entirely (and render nothing) for a
    // brand-new, unsaved user; it now stays visible and shows the SAME empty-state
    // placeholder an existing user with zero roles selected sees (a new user can
    // never have any roles selected pre-save either, so the outcome is identical).
    it('renders the same empty-state placeholder as an existing user with zero roles selected', () => {
      renderTab({ isNew: true });
      expect(screen.getByTestId('UserRolesTab__empty')).toHaveTextContent('userRolesTabEmptyState');
    });

    it('reports itself as visible via onVisibilityChange(true) when isNew', () => {
      const onVisibilityChange = vi.fn();
      renderTab({ isNew: true, onVisibilityChange });
      expect(onVisibilityChange).toHaveBeenCalledWith(true);
    });

    it('never fetches the menu tree, roles overview, or template roles when isNew', () => {
      renderTab({ isNew: true });
      expect(fetchMenuTree).not.toHaveBeenCalled();
      expect(fetchRolesOverview).not.toHaveBeenCalled();
      expect(fetchTemplateRoles).not.toHaveBeenCalled();
    });
  });

  describe('existing user', () => {
    it('reports itself as visible via onVisibilityChange(true)', () => {
      fetchMenuTree.mockResolvedValue(MENU_TREE);
      fetchRolesOverview.mockResolvedValue(ROLES_OVERVIEW);
      fetchTemplateRoles.mockResolvedValue(TEMPLATE_ROLES);
      const onVisibilityChange = vi.fn();
      renderTab({ isNew: false, onVisibilityChange });
      expect(onVisibilityChange).toHaveBeenCalledWith(true);
    });

    it('renders the empty state when zero roles are currently selected', async () => {
      fetchMenuTree.mockResolvedValue(MENU_TREE);
      fetchRolesOverview.mockResolvedValue(ROLES_OVERVIEW);
      fetchTemplateRoles.mockResolvedValue(TEMPLATE_ROLES);
      renderTab({ selectedRoleIds: [] });

      expect(await screen.findByTestId('UserRolesTab__empty')).toBeInTheDocument();
      expect(screen.queryByTestId('UserRolesTab')).not.toBeInTheDocument();
    });

    // Regression coverage for a since-fixed bug (ETP-4906 F9 Findings): the render-branch
    // order in UserRolesTab.jsx used to check `columns.length === 0` (the empty state)
    // BEFORE checking `loading`/`error`. `columns` is derived from `templateRoles`
    // (`useMemo` over `templateRoles?.roles`, DEV wave 7 — the column source moved from
    // `rolesOverview` to `fetchTemplateRoles()`), which stays `null` for the entire
    // duration of the in-flight fetch AND forever after a rejected fetch (the `.catch`
    // only sets `error`, never `templateRoles`) — so `columns.length` was 0 in both cases
    // regardless of how many roles were selected, making the empty state always win and
    // the loading/error branches dead code. The branch order has since been fixed
    // (loading/error are now checked first); the two tests below pin that behavior.
    it('shows a loading indicator (not the empty state) while the fetches are in flight, with roles selected', async () => {
      let resolveMenu;
      fetchMenuTree.mockReturnValue(new Promise((resolve) => { resolveMenu = resolve; }));
      fetchRolesOverview.mockResolvedValue(ROLES_OVERVIEW);
      fetchTemplateRoles.mockResolvedValue(TEMPLATE_ROLES);
      renderTab({ selectedRoleIds: ['role-fin'] });

      expect(screen.getByTestId('UserRolesTab__loading')).toBeInTheDocument();
      expect(screen.queryByTestId('UserRolesTab__empty')).not.toBeInTheDocument();
      resolveMenu(MENU_TREE);
      await waitFor(() => expect(screen.getByTestId('UserRolesTab')).toBeInTheDocument());
    });

    it('shows an error message (not the empty state) when a fetch rejects, with roles selected', async () => {
      fetchMenuTree.mockRejectedValue(new Error('network down'));
      fetchRolesOverview.mockResolvedValue(ROLES_OVERVIEW);
      fetchTemplateRoles.mockResolvedValue(TEMPLATE_ROLES);
      renderTab({ selectedRoleIds: ['role-fin'] });

      await waitFor(() => expect(fetchMenuTree).toHaveBeenCalled());
      expect(await screen.findByTestId('UserRolesTab__error')).toBeInTheDocument();
      expect(screen.queryByTestId('UserRolesTab__empty')).not.toBeInTheDocument();
    });

    it('does not update state after unmount while fetches are still in flight', async () => {
      let resolveMenu;
      fetchMenuTree.mockReturnValue(new Promise((resolve) => { resolveMenu = resolve; }));
      fetchRolesOverview.mockResolvedValue(ROLES_OVERVIEW);
      fetchTemplateRoles.mockResolvedValue(TEMPLATE_ROLES);
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { unmount } = renderTab({ selectedRoleIds: ['role-fin'] });
      unmount();
      resolveMenu(MENU_TREE);
      await new Promise((r) => setTimeout(r, 0));

      expect(consoleErrorSpy).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('the rendered matrix', () => {
    beforeEach(() => {
      fetchMenuTree.mockResolvedValue(MENU_TREE);
      fetchTemplateRoles.mockResolvedValue(TEMPLATE_ROLES);
      fetchRolesOverview.mockResolvedValue(ROLES_OVERVIEW);
    });

    it('renders one column per currently-selected (non-admin) role', async () => {
      renderTab({ selectedRoleIds: ['role-fin', 'role-sales'] });

      const table = await screen.findByTestId('UserRolesTab');
      // Scope to the <thead> — the category divider rows inside <tbody> also use <th>
      // (colSpan-ed), which the accessibility tree maps to role=columnheader too.
      const headerRow = table.querySelector('thead tr');
      const headers = within(headerRow).getAllByRole('columnheader');
      // First header is the "Window" column, then one per selected role.
      expect(headers).toHaveLength(3);
      expect(headers[1]).toHaveTextContent('Finance');
      expect(headers[2]).toHaveTextContent('Sales');
    });

    it('never renders the Admin role as a column, even if selectedRoleIds erroneously includes it', async () => {
      renderTab({ selectedRoleIds: ['role-fin', 'role-admin'] });

      const table = await screen.findByTestId('UserRolesTab');
      const headerRow = table.querySelector('thead tr');
      expect(within(headerRow).queryByText('GOClient Admin')).not.toBeInTheDocument();
      expect(within(headerRow).getAllByRole('columnheader')).toHaveLength(2); // Window + Finance only
    });

    it('renders the 3 hardcoded General rows as unconditional ✓ for every column', async () => {
      renderTab({ selectedRoleIds: ['role-fin', 'role-sales'] });

      await screen.findByTestId('UserRolesTab');
      for (const key of ['dashboard', 'favorites', 'copilot']) {
        const row = screen.getByTestId(`UserRolesTab__row-${key}`);
        const cells = within(row).getAllByRole('cell');
        // cells[0] is the window-name cell; cells[1..] are the per-role value cells.
        expect(cells).toHaveLength(3);
        expect(cells[1]).toHaveTextContent('✓');
        expect(cells[2]).toHaveTextContent('✓');
      }
    });

    it('groups window rows by category, in first-appearance order', async () => {
      renderTab({ selectedRoleIds: ['role-fin', 'role-sales'] });

      const table = await screen.findByTestId('UserRolesTab');
      const categoryHeaders = within(table).getAllByText(/^(Comercial|Compras)$/);
      expect(categoryHeaders.map((el) => el.textContent)).toEqual(['Comercial', 'Compras']);
    });

    it('resolves cell values from each role\'s windows[] — full access renders ✓', async () => {
      renderTab({ selectedRoleIds: ['role-fin', 'role-sales'] });

      const row = await screen.findByTestId('UserRolesTab__row-w1');
      const cells = within(row).getAllByRole('cell');
      expect(cells[0]).toHaveTextContent('Ventas');
      expect(cells[1]).toHaveTextContent('✓'); // Finance — full
      expect(cells[2]).toHaveTextContent('✓'); // Sales — full
    });

    it('resolves a read-only tier through the accessTierReadOnly i18n key', async () => {
      renderTab({ selectedRoleIds: ['role-fin', 'role-sales'] });

      const row = await screen.findByTestId('UserRolesTab__row-w2');
      const cells = within(row).getAllByRole('cell');
      expect(cells[0]).toHaveTextContent('Clientes');
      expect(cells[1]).toHaveTextContent('—'); // Finance has no w2 entry at all
      expect(cells[2]).toHaveTextContent('accessTierReadOnly'); // Sales — readonly
    });

    it('renders a dash for a window absent from a role\'s windows[]', async () => {
      renderTab({ selectedRoleIds: ['role-fin', 'role-sales'] });

      const row = await screen.findByTestId('UserRolesTab__row-w3');
      const cells = within(row).getAllByRole('cell');
      expect(cells[0]).toHaveTextContent('Proveedores');
      expect(cells[1]).toHaveTextContent('—');
      expect(cells[2]).toHaveTextContent('—');
    });

    // ETP-4906 DEV wave 6 fix #5 regression: a classic-only category (zero windows in it
    // present in ANY role's windows[], Admin included) must be dropped entirely, not
    // rendered with every row showing '—'.
    it('drops a classic-only category (and its rows) that no role, including Admin, exposes any window for', async () => {
      fetchMenuTree.mockResolvedValue(MENU_TREE_WITH_CLASSIC_ONLY_CATEGORY);
      renderTab({ selectedRoleIds: ['role-fin', 'role-sales'] });

      const table = await screen.findByTestId('UserRolesTab');
      expect(within(table).queryByText('Diccionario de la aplicación')).not.toBeInTheDocument();
      expect(within(table).queryByText('Módulo')).not.toBeInTheDocument();
      expect(screen.queryByTestId('UserRolesTab__row-w4')).not.toBeInTheDocument();

      // The two real categories are unaffected by the classic-only one being dropped.
      const categoryHeaders = within(table).getAllByText(/^(Comercial|Compras)$/);
      expect(categoryHeaders.map((el) => el.textContent)).toEqual(['Comercial', 'Compras']);
    });

    // ETP-4999 item 5 — the table's header row must stay pinned while scrolling through a
    // potentially long list of window rows. The sticky CSS itself is a visual/CSS concern
    // (verified manually via `make dev`, see the task report), so this only pins that the
    // `<thead>` carries the class that makes it possible.
    it('marks the <thead> sticky with an opaque background so it can pin while the body scrolls', async () => {
      renderTab({ selectedRoleIds: ['role-fin', 'role-sales'] });

      const table = await screen.findByTestId('UserRolesTab');
      const thead = table.querySelector('thead');
      expect(thead.className).toContain('sticky');
      expect(thead.className).toContain('top-0');
      expect(thead.className).toContain('bg-card');
    });

    // ETP-4999 item 5 regression guard — an earlier pass wrapped the table in a LOCAL
    // `max-h-[60vh] overflow-auto` div on the (incorrect) assumption that `sticky` needed
    // a locally-owned scroll context. A human live-tested that build and found a real bug:
    // a blank gap at the bottom of the tab whenever the table's content was shorter than
    // the enclosing `DetailView.jsx` panel's full-viewport height, because the local
    // wrapper created a SECOND, artificially short scroll region nested inside the panel's
    // own (always full-height) outer scroll column. Live verification (Playwright) then
    // confirmed the panel's EXISTING outer `overflow-y-auto` column is itself a valid
    // `position: sticky` ancestor, so the local wrapper was unnecessary as well as buggy —
    // it was removed entirely. This test pins that removal: if a local bounding wrapper is
    // ever reintroduced here, it will reintroduce that same live-confirmed bottom-gap bug.
    it('does NOT bound the wrapper with a local max-h/overflow — that previously caused a live-confirmed bottom-gap bug', async () => {
      renderTab({ selectedRoleIds: ['role-fin', 'role-sales'] });

      const wrapper = await screen.findByTestId('UserRolesTab');
      expect(wrapper.className).not.toContain('max-h-[60vh]');
      expect(wrapper.className).not.toContain('overflow-auto');
    });
  });

  // ETP-4999 item 5 — "permission comparison view": when a row's roles disagree on the
  // access level for a window, the highest-ranked tier ('full' > 'readonly' > no access)
  // is the "winner" — its pill text goes bold and an info-icon tooltip (`WinnerBadge__...`)
  // explains why. Per human design feedback (revised from the first pass), losing cells
  // get NO visual marker at all — they render exactly like a cell in a row where every
  // role agrees (plain `TierPill`, `font-medium`, no badge). The earlier strikethrough
  // treatment (`line-through text-muted-foreground/50`) was dropped as too visually harsh.
  // A later design revision (left-most tie-break): when several columns TIE at the
  // highest rank, only the LEFT-MOST tied column (lowest `columns` index) is marked as
  // the winner — every other column tied at that same rank renders exactly like a
  // losing cell (no badge, `font-medium`, not `font-bold`). Only ONE cell per
  // disagreeing row can ever carry the marker now.
  describe('winner/loser indicator (ETP-4999 item 5)', () => {
    beforeEach(() => {
      fetchMenuTree.mockResolvedValue(MENU_TREE);
      fetchTemplateRoles.mockResolvedValue(TEMPLATE_ROLES);
      fetchRolesOverview.mockResolvedValue(ROLES_OVERVIEW);
    });

    it('marks the higher tier as winner with a bold pill + tooltip, and renders the lower tier plainly, when two roles disagree (readonly vs no access, w2)', async () => {
      // w2 (Clientes): Finance has no entry ('—' / null tier), Sales has 'readonly'.
      renderTab({ selectedRoleIds: ['role-fin', 'role-sales'] });

      const row = await screen.findByTestId('UserRolesTab__row-w2');
      // Sales (readonly) outranks Finance (no access) — Sales wins.
      const winnerBadge = screen.getByTestId('WinnerBadge__w2-role-sales');
      expect(winnerBadge).toBeInTheDocument();
      expect(screen.queryByTestId('WinnerBadge__w2-role-fin')).not.toBeInTheDocument();

      const cells = within(row).getAllByRole('cell');
      const financeCell = cells[1];
      const salesCell = cells[2];

      // Finance has no access at all (tier === null) — `TierPill` renders no pill span,
      // just the plain '—' text, identical to any other non-disagreeing '—' cell.
      expect(pillSpanIn(financeCell)).toBeNull();

      // Sales is the winner — its pill text goes bold.
      expect(pillSpanIn(salesCell).className).toContain('font-bold');
      expect(pillSpanIn(salesCell).className).not.toContain('font-medium');

      // The tooltip explains why Sales is marked.
      const tooltipContent = screen.getByTestId('WinnerTooltipContent__w2-role-sales');
      expect(tooltipContent).toHaveTextContent('userRolesTabWinnerTooltipTitle');
      expect(tooltipContent).toHaveTextContent('userRolesTabWinnerTooltipDescription');
      expect(winnerBadge).toHaveAttribute('aria-label', 'userRolesTabWinnerTooltipTitle');
    });

    it('renders no winner badge or bold pill when both roles have no access at all (— / — tie, w3)', async () => {
      // w3 (Proveedores): neither Finance nor Sales has any entry for it — both '—'.
      // Ranks tie at the bottom (0 === 0), so `resolveRowWinner` reports
      // `disagree: false` and no cell is marked winner, same as any other agreeing
      // row. Complements the w1 test below, which pins the full/full tie.
      renderTab({ selectedRoleIds: ['role-fin', 'role-sales'] });

      const row = await screen.findByTestId('UserRolesTab__row-w3');
      expect(within(row).queryByTestId(/^WinnerBadge__w3-/)).not.toBeInTheDocument();
      const cells = within(row).getAllByRole('cell');
      // Both cells are '—' (tier === null) — neither renders a pill span at all.
      expect(pillSpanIn(cells[1])).toBeNull();
      expect(pillSpanIn(cells[2])).toBeNull();
    });

    it('renders no winner badge and font-medium (not bold) pills when every column agrees (w1 — both roles full)', async () => {
      renderTab({ selectedRoleIds: ['role-fin', 'role-sales'] });

      const row = await screen.findByTestId('UserRolesTab__row-w1');
      expect(screen.queryByTestId('WinnerBadge__w1-role-fin')).not.toBeInTheDocument();
      expect(screen.queryByTestId('WinnerBadge__w1-role-sales')).not.toBeInTheDocument();
      const cells = within(row).getAllByRole('cell');
      expect(pillSpanIn(cells[1]).className).toContain('font-medium');
      expect(pillSpanIn(cells[1]).className).not.toContain('font-bold');
      expect(pillSpanIn(cells[2]).className).toContain('font-medium');
      expect(pillSpanIn(cells[2]).className).not.toContain('font-bold');
    });

    it('renders no winner badge for the hardcoded GENERAL_ROWS, which always agree by construction', async () => {
      renderTab({ selectedRoleIds: ['role-fin', 'role-sales'] });

      await screen.findByTestId('UserRolesTab');
      for (const key of ['dashboard', 'favorites', 'copilot']) {
        const row = screen.getByTestId(`UserRolesTab__row-${key}`);
        expect(within(row).queryByTestId(new RegExp(`^WinnerBadge__${key}-`))).not.toBeInTheDocument();
        const cells = within(row).getAllByRole('cell');
        expect(pillSpanIn(cells[1]).className).toContain('font-medium');
        expect(pillSpanIn(cells[2]).className).toContain('font-medium');
      }
    });

    it('marks a role with a real full grant as winner (bold + tooltip) and a role with no access at all plainly (full vs no-access, w1)', async () => {
      // Distinct disagreement shape from the w2 case above (readonly vs no-access): here
      // Sales has NO entry at all for w1 (global TEMPLATE_ROLES fixture always gives it
      // 'full' there), so Finance's real 'full' grant is the row's only real access.
      // Confirms "no-access never wins against a real grant" for the 'full' tier too
      // (the w2 test above already confirms it for 'readonly').
      fetchTemplateRoles.mockResolvedValueOnce({
        roles: [
          { id: 'role-fin', name: 'Finance', windows: [{ id: 'w1', tier: 'full' }] },
          { id: 'role-sales', name: 'Sales', windows: [] },
        ],
      });
      renderTab({ selectedRoleIds: ['role-fin', 'role-sales'] });

      const row = await screen.findByTestId('UserRolesTab__row-w1');
      expect(screen.getByTestId('WinnerBadge__w1-role-fin')).toBeInTheDocument();
      expect(screen.queryByTestId('WinnerBadge__w1-role-sales')).not.toBeInTheDocument();
      const cells = within(row).getAllByRole('cell');
      expect(pillSpanIn(cells[1]).className).toContain('font-bold'); // Finance — full, wins
      expect(pillSpanIn(cells[2])).toBeNull(); // Sales — no access, no pill at all
    });

    it('marks only the left-most column tied at the top rank as winner when two roles share the highest tier and a third trails', async () => {
      // 3-column row: Finance and Sales both 'full' on w1 (tied at the top rank),
      // Purchasing only 'readonly' — `resolveRowWinner` marks only the LEFT-MOST tied
      // column (Finance, `columns` index 0) as the winner (`winnerIndex` via
      // `ranks.indexOf(maxRank)`'s first-match semantics). Sales ties at the same rank
      // but is NOT the left-most, so it renders exactly like a losing cell (no badge,
      // font-medium). Purchasing loses outright (lower rank, rendered plainly too).
      fetchTemplateRoles.mockResolvedValueOnce({
        roles: [
          { id: 'role-fin', name: 'Finance', windows: [{ id: 'w1', tier: 'full' }] },
          { id: 'role-sales', name: 'Sales', windows: [{ id: 'w1', tier: 'full' }] },
          { id: 'role-purchasing', name: 'Purchasing', windows: [{ id: 'w1', tier: 'readonly' }] },
        ],
      });
      renderTab({ selectedRoleIds: ['role-fin', 'role-sales', 'role-purchasing'] });

      const row = await screen.findByTestId('UserRolesTab__row-w1');
      expect(screen.getByTestId('WinnerBadge__w1-role-fin')).toBeInTheDocument();
      expect(screen.queryByTestId('WinnerBadge__w1-role-sales')).not.toBeInTheDocument();
      expect(screen.queryByTestId('WinnerBadge__w1-role-purchasing')).not.toBeInTheDocument();
      const cells = within(row).getAllByRole('cell');
      expect(pillSpanIn(cells[1]).className).toContain('font-bold'); // Finance — left-most tied, wins
      expect(pillSpanIn(cells[1]).className).not.toContain('font-medium');
      expect(pillSpanIn(cells[2]).className).toContain('font-medium'); // Sales — tied but not left-most, loses
      expect(pillSpanIn(cells[2]).className).not.toContain('font-bold');
      expect(pillSpanIn(cells[3]).className).toContain('font-medium'); // Purchasing — lower rank, loses, plain
      expect(pillSpanIn(cells[3]).className).not.toContain('font-bold');
    });
  });

  // ETP-5071 — once a user is promoted to the client's Admin role, this tab's
  // composed-roles matrix (driven by the PRE-promotion `selectedRoleIds`) is stale — the
  // user actually has full access to everything now. Detected the same way
  // `AssignTemplateRolesControl.jsx`/`RoleChipsCell.jsx` do: `resolveDefaultRoleId(data)`
  // compared against `overviewRoles`'s `isClientAdmin` row id — reusing the SAME
  // `ROLES_OVERVIEW` fixture this file already declares (`role-admin`, `isClientAdmin: true`).
  describe('admin role holder (ETP-5071)', () => {
    beforeEach(() => {
      fetchMenuTree.mockResolvedValue(MENU_TREE);
      fetchTemplateRoles.mockResolvedValue(TEMPLATE_ROLES);
      fetchRolesOverview.mockResolvedValue(ROLES_OVERVIEW);
    });

    // ETP-5196 — revised from the ETP-5071 behavior this described (which hid the matrix
    // entirely for a confirmed admin holder). The full-access message now renders as a
    // SIBLING above the matrix, and the matrix itself shows a single column built from
    // `adminRole` (id `role-admin`, `isClientAdmin: true`, `windows: [w1, w2, w3]` all
    // 'full' per the shared `ROLES_OVERVIEW` fixture) — not the stale pre-promotion
    // `selectedRoleIds` (here `['role-fin']`, deliberately non-empty to prove the
    // composed selection is ignored once admin-holder is detected).
    it('shows the full-access message alongside a single admin-only column in the matrix when data.defaultRole matches the resolved admin role id', async () => {
      renderTab({ selectedRoleIds: ['role-fin'], data: { defaultRole: 'role-admin' } });

      expect(await screen.findByTestId('UserRolesTab__admin-full-access')).toHaveTextContent(
        'userRolesTabAdminFullAccessMessage',
      );
      expect(screen.queryByTestId('UserRolesTab__loading')).not.toBeInTheDocument();
      expect(screen.queryByTestId('UserRolesTab__error')).not.toBeInTheDocument();
      expect(screen.queryByTestId('UserRolesTab__empty')).not.toBeInTheDocument();

      // The matrix now DOES render (flipped from the old "hides the matrix" behavior).
      const table = await screen.findByTestId('UserRolesTab');

      // Exactly one role column — the admin column — no Finance/Sales header, even
      // though 'role-fin' is in selectedRoleIds.
      const headerRow = table.querySelector('thead tr');
      const headers = within(headerRow).getAllByRole('columnheader');
      expect(headers).toHaveLength(2); // Window + Admin only
      expect(headers[1]).toHaveTextContent('roleNameAdmin'); // ADMIN_NAME_I18N_KEY, via the identity useUI mock
      expect(within(headerRow).queryByText('Finance')).not.toBeInTheDocument();
      expect(within(headerRow).queryByText('Sales')).not.toBeInTheDocument();
      // Admin column header uses the Settings icon (gated by role.isClientAdmin), not
      // one of the ROLE_ICONS keyed by role.name.
      expect(within(headers[1]).getByTestId('RoleIcon__role-admin')).toBeInTheDocument();

      // w1/w2/w3 (Ventas/Clientes/Proveedores) all render full-tier ✓ for the admin
      // column, per ROLES_OVERVIEW's role-admin windows fixture — same cell-assertion
      // pattern ("resolves cell values from each role's windows[]" test above) used
      // elsewhere in this file.
      for (const windowId of ['w1', 'w2', 'w3']) {
        const row = screen.getByTestId(`UserRolesTab__row-${windowId}`);
        const cells = within(row).getAllByRole('cell');
        expect(cells[1]).toHaveTextContent('✓');
      }
    });

    it('accepts a `defaultRole` given as an {id, name} object (defensive shape, same as RoleChipsCell/AssignRoleControl)', async () => {
      renderTab({ selectedRoleIds: ['role-fin'], data: { defaultRole: { id: 'role-admin', name: 'GOClient Admin' } } });

      expect(await screen.findByTestId('UserRolesTab__admin-full-access')).toBeInTheDocument();
    });

    it('renders the composed-roles matrix normally when data.defaultRole is a non-admin template role', async () => {
      renderTab({ selectedRoleIds: ['role-fin', 'role-sales'], data: { defaultRole: 'role-fin' } });

      expect(await screen.findByTestId('UserRolesTab')).toBeInTheDocument();
      expect(screen.queryByTestId('UserRolesTab__admin-full-access')).not.toBeInTheDocument();
    });

    it('falls through to the normal empty/matrix handling when data has no defaultRole at all (null/undefined)', async () => {
      renderTab({ selectedRoleIds: [], data: {} });

      expect(await screen.findByTestId('UserRolesTab__empty')).toBeInTheDocument();
      expect(screen.queryByTestId('UserRolesTab__admin-full-access')).not.toBeInTheDocument();
    });

    it('falls through to the normal empty/matrix handling when no `data` prop is passed at all', async () => {
      renderTab({ selectedRoleIds: [] });

      expect(await screen.findByTestId('UserRolesTab__empty')).toBeInTheDocument();
      expect(screen.queryByTestId('UserRolesTab__admin-full-access')).not.toBeInTheDocument();
    });

    it('does NOT prematurely show the admin message while rolesOverview (and thus adminRoleId) is still loading, even though data will resolve to admin once it lands', async () => {
      let resolveOverview;
      fetchRolesOverview.mockReturnValue(new Promise((resolve) => { resolveOverview = resolve; }));
      renderTab({ selectedRoleIds: ['role-fin'], data: { defaultRole: 'role-admin' } });

      // Still in-flight: adminRoleId can't be resolved yet (overviewRoles is still []),
      // so isAdminRoleHolder is false and the loading branch is what renders.
      expect(screen.getByTestId('UserRolesTab__loading')).toBeInTheDocument();
      expect(screen.queryByTestId('UserRolesTab__admin-full-access')).not.toBeInTheDocument();

      resolveOverview(ROLES_OVERVIEW);
      expect(await screen.findByTestId('UserRolesTab__admin-full-access')).toBeInTheDocument();
    });

    it('never shows the admin message for a new (not-yet-persisted) user, even if `data` already carries the admin role id', () => {
      renderTab({ isNew: true, data: { defaultRole: 'role-admin' } });

      expect(screen.getByTestId('UserRolesTab__empty')).toBeInTheDocument();
      expect(screen.queryByTestId('UserRolesTab__admin-full-access')).not.toBeInTheDocument();
      // isNew short-circuits before any fetch — including the one the admin check relies on.
      expect(fetchRolesOverview).not.toHaveBeenCalled();
    });

    // ETP-5196 QA edge case — the design-tension REVIEW flagged: `activeWindowIds` (the
    // rows) comes from the UNION of every role's `windows[]` (Admin included), while the
    // admin COLUMN's own cell values come only from `adminRole.windows[]`. If the backend
    // ever returns an admin row with an empty `windows[]` (e.g. a provisioning gap), the
    // row set is still derived from the OTHER roles' windows (w1/w2/w3 below, via
    // `role-fin`/`role-sales`), so the matrix is not empty — it renders a real, if fully
    // sparse, single admin column with '—' in every cell. This must not be confused with
    // the `columns.length === 0` empty state: `columns` is `[adminRole]`, length 1, so
    // that branch is never reached — `adminRole` existing (even windowless) is what keeps
    // the table rendering rather than falling back to the "select a role" placeholder.
    it('renders a sparse but valid single admin column (all "—") when adminRole.windows is an empty array', async () => {
      const rolesOverviewWithWindowlessAdmin = {
        roles: [
          ...ROLES_OVERVIEW.roles.filter((role) => !role.isClientAdmin),
          { id: 'role-admin', name: 'GOClient Admin', isClientAdmin: true, windows: [] },
        ],
      };
      fetchRolesOverview.mockResolvedValue(rolesOverviewWithWindowlessAdmin);

      renderTab({ selectedRoleIds: ['role-fin'], data: { defaultRole: 'role-admin' } });

      expect(await screen.findByTestId('UserRolesTab__admin-full-access')).toBeInTheDocument();
      expect(screen.queryByTestId('UserRolesTab__empty')).not.toBeInTheDocument();

      const table = await screen.findByTestId('UserRolesTab');
      const headerRow = table.querySelector('thead tr');
      const headers = within(headerRow).getAllByRole('columnheader');
      expect(headers).toHaveLength(2); // Window + Admin only, same as the populated case

      // Rows still come from the OTHER roles' windows (role-fin/role-sales cover
      // w1/w2), not from the (empty) admin windows list — so the matrix body is not
      // empty even though every admin cell is '—'.
      for (const windowId of ['w1', 'w2']) {
        const row = screen.getByTestId(`UserRolesTab__row-${windowId}`);
        const cells = within(row).getAllByRole('cell');
        expect(cells[1]).toHaveTextContent('—');
      }
    });
  });

  // ETP-5196 — coverage for `resolveCategoryRow()`/`groupResolvedRows()`: the new
  // `menu.json`-primary category resolution, its fallbacks (AD-tree, then the new
  // "Other" catch-all), hidden-window exclusion, and `groupOrder`/`itemOrder`
  // ordering. Uses the module-level `menu.json` mock declared at the top of this
  // file (Zeta/Alpha/RowOrderGroup/HiddenOnlyGroup/DualMappedGroup, groupOrder
  // 0..4) — none of its windowIds collide with `w1`/`w2`/`w3`/`w4`, so every test
  // above this block is unaffected and keeps exercising the AD-tree fallback path
  // exactly as before this mock existed (per the developer's own report: all 32
  // pre-existing tests only ever exercised the fallback path).
  describe('menu.json category grouping (ETP-5196)', () => {
    beforeEach(() => {
      fetchTemplateRoles.mockResolvedValue(TEMPLATE_ROLES);
    });

    it('resolves category/name from menu.json, overriding the AD-tree category/name, for a window id present in BOTH sources', async () => {
      // 'm-dual' is BOTH a leaf in this AD tree (wrong category/name) AND indexed by
      // the mocked menu.json under 'DualMappedGroup' (correct category/name) — the
      // menu.json-resolved values must win.
      fetchMenuTree.mockResolvedValue({
        tree: [
          {
            type: 'folder',
            name: 'WrongClassicCategory',
            children: [{ name: 'Wrong AD Name', windowId: 'm-dual' }],
          },
        ],
      });
      fetchRolesOverview.mockResolvedValue({
        roles: [
          { id: 'role-fin', name: 'Finance', windows: [{ id: 'm-dual', name: 'Wrong AD Name', tier: 'full' }] },
        ],
      });
      renderTab({ selectedRoleIds: ['role-fin'] });

      const table = await screen.findByTestId('UserRolesTab');
      expect(within(table).getByText('DualMappedGroup')).toBeInTheDocument();
      expect(within(table).getByText('Dual (menu.json label)')).toBeInTheDocument();
      expect(within(table).queryByText('WrongClassicCategory')).not.toBeInTheDocument();
      expect(within(table).queryByText('Wrong AD Name')).not.toBeInTheDocument();
    });

    it('falls back to the AD-tree category/name for a window id present in the AD tree but absent from menu.json (old behavior preserved)', async () => {
      // w2 (Clientes/Comercial, from the shared MENU_TREE fixture) is not indexed by
      // the mocked menu.json at all.
      fetchMenuTree.mockResolvedValue(MENU_TREE);
      fetchRolesOverview.mockResolvedValue(ROLES_OVERVIEW);
      renderTab({ selectedRoleIds: ['role-fin', 'role-sales'] });

      const row = await screen.findByTestId('UserRolesTab__row-w2');
      expect(within(row).getByText('Clientes')).toBeInTheDocument();
      expect(screen.getByTestId('UserRolesTab__category-Comercial')).toBeInTheDocument();
    });

    it('renders a window id absent from BOTH menu.json and the AD tree under the "Other" catch-all category instead of vanishing', async () => {
      fetchMenuTree.mockResolvedValue(MENU_TREE);
      fetchRolesOverview.mockResolvedValue({
        roles: [
          { id: 'role-fin', name: 'Finance', windows: [{ id: 'x-mystery', name: 'Mystery Window', tier: 'full' }] },
        ],
      });
      renderTab({ selectedRoleIds: ['role-fin'] });

      const table = await screen.findByTestId('UserRolesTab');
      // Identity `useUI()` mock returns the raw i18n key — 'Other' at runtime, per the
      // en_US/es_ES `userRolesTabUncategorizedCategory` entries this fix added.
      expect(within(table).getByText('userRolesTabUncategorizedCategory')).toBeInTheDocument();
      expect(within(table).getByText('Mystery Window')).toBeInTheDocument();
    });

    it('excludes a row entirely (and its now-empty category) when its only menu.json entry is hidden, even though the window is active', async () => {
      fetchMenuTree.mockResolvedValue(MENU_TREE);
      fetchRolesOverview.mockResolvedValue({
        roles: [
          { id: 'role-fin', name: 'Finance', windows: [{ id: 'm-hidden', name: 'Hidden Window (AD name)', tier: 'full' }] },
        ],
      });
      renderTab({ selectedRoleIds: ['role-fin'] });

      const table = await screen.findByTestId('UserRolesTab');
      expect(within(table).queryByText('HiddenOnlyGroup')).not.toBeInTheDocument();
      expect(within(table).queryByText('Hidden Only')).not.toBeInTheDocument();
      expect(within(table).queryByText('Hidden Window (AD name)')).not.toBeInTheDocument();
      expect(screen.queryByTestId('UserRolesTab__row-m-hidden')).not.toBeInTheDocument();
    });

    it('orders menu.json-resolved categories by groupOrder, not alphabetically (Zeta before Alpha)', async () => {
      fetchMenuTree.mockResolvedValue({ tree: [] });
      fetchRolesOverview.mockResolvedValue({
        roles: [
          {
            id: 'role-fin',
            name: 'Finance',
            // Fed Alpha BEFORE Zeta — alphabetical order would put Alpha first too, so
            // this alone wouldn't prove groupOrder is what's driving the sort; the
            // assertion below only holds because groupOrder(Zeta)=0 < groupOrder(Alpha)=1.
            windows: [
              { id: 'm-alpha', name: 'raw alpha', tier: 'full' },
              { id: 'm-zeta', name: 'raw zeta', tier: 'full' },
            ],
          },
        ],
      });
      renderTab({ selectedRoleIds: ['role-fin'] });

      const table = await screen.findByTestId('UserRolesTab');
      const categoryHeaders = within(table).getAllByText(/^(Zeta|Alpha)$/);
      expect(categoryHeaders.map((el) => el.textContent)).toEqual(['Zeta', 'Alpha']);
    });

    it('orders rows within a menu.json category by itemOrder, not by feed order or alphabetically', async () => {
      fetchMenuTree.mockResolvedValue({ tree: [] });
      fetchRolesOverview.mockResolvedValue({
        roles: [
          {
            id: 'role-fin',
            name: 'Finance',
            // Fed 'm-row-a' (itemOrder 1) BEFORE 'm-row-b' (itemOrder 0) — the output
            // must still put Row B first. Labels are reverse-alphabetical too ("Row A"
            // < "Row B"), so this can't accidentally pass via alphabetical sorting.
            windows: [
              { id: 'm-row-a', name: 'raw row a', tier: 'full' },
              { id: 'm-row-b', name: 'raw row b', tier: 'full' },
            ],
          },
        ],
      });
      renderTab({ selectedRoleIds: ['role-fin'] });

      const table = await screen.findByTestId('UserRolesTab');
      const rowLabels = within(table).getAllByText(/^Row [AB] \(itemOrder \d\)$/);
      expect(rowLabels.map((el) => el.textContent)).toEqual(['Row B (itemOrder 0)', 'Row A (itemOrder 1)']);
    });
  });
});
