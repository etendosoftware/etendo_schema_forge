/**
 * Tests for UserRolesTab — ETP-4906 "Roles del usuario" live permission-preview
 * matrix. See the component's own doc comment for the cross-task coupling with
 * AssignTemplateRolesControl (shared `useRoleSelection()` context).
 *
 * ETP-5485 — rows now come from the backend `matrix`/`reportsMatrix` (built by the same
 * `RoleAccessMatrix` class as "Configuración > Roles"), adapted by the same
 * `adaptMatrix`/`adaptReportsMatrix` the Roles page uses. Fixtures below are therefore
 * backend matrix payloads, not per-role `windows[]` arrays plus an AD menu tree.
 */
import { render, screen, waitFor, within, cleanup } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
}));

vi.mock('@/lib/rolesApi.js', () => ({
  fetchRolesOverview: vi.fn(),
  fetchTemplateRoles: vi.fn(),
}));

// ETP-4999 item 5 — render the Radix tooltip pieces inline so the winner tooltip's
// content is synchronously in the DOM (no portal / hover / act warnings), same
// pattern as ComputedFreshnessHint.vitest.jsx.
vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }) => <>{children}</>,
  Tooltip: ({ children }) => <>{children}</>,
  TooltipTrigger: ({ children }) => <>{children}</>,
  TooltipContent: (props) => <div data-testid={props['data-testid']}>{props.children}</div>,
}));

// Synthetic menu.json (same convention as `useRolesOverviewData.vitest.js`): the adapter
// resolves category/label/order against it. `w1`/`w2`/`w3` are deliberately absent, so they
// keep the backend's own category/name — the "window without a menu.json entry" path.
vi.mock('../../../../menu.json', () => ({
  default: {
    menu: [
      // groupOrder 0 — declared BEFORE 'Alpha' (reverse-alphabetical) so a groupOrder
      // assertion can't pass by coincidence.
      { group: 'Zeta', items: [{ name: 'zeta-window', label: 'Zeta Window', windowId: 'm-zeta' }] },
      { group: 'Alpha', items: [{ name: 'alpha-window', label: 'Alpha Window', windowId: 'm-alpha' }] },
      {
        group: 'RowOrderGroup',
        items: [
          { name: 'row-b', label: 'Row B (itemOrder 0)', windowId: 'm-row-b' },
          { name: 'row-a', label: 'Row A (itemOrder 1)', windowId: 'm-row-a' },
        ],
      },
      // Only a hidden entry, no visible alternative (the real Match Rule/Periods shape).
      { group: 'HiddenOnlyGroup', items: [{ name: 'hidden-only', label: 'Hidden Only', windowId: 'm-hidden', hidden: true }] },
      { group: 'DualMappedGroup', items: [{ name: 'dual-via-menu', label: 'Dual (menu.json label)', windowId: 'm-dual' }] },
      // Report entries are always hidden in the real menu.json; must still render.
      { group: 'ReportsGroup', items: [{ name: 'tax-report', label: 'Tax Report', reportId: 'tax-report', hidden: true }] },
      // ETP-5485 — the 2 ETP-5071 proxy rows the tab used to miss, keyed like the real
      // menu.json (`windowId` for Modelos Fiscales, `obuiappProcessId` for Documentos no
      // contabilizados).
      {
        group: 'Finance',
        items: [
          { name: 'fiscal-models', label: 'Fiscal Models', windowId: '3E8FEA1EA7404D979306C9EE7FD2E7E8' },
          { name: 'not-posted-documents', label: 'Not Posted Documents', obuiappProcessId: 'D6AB95CE52D34E1599590526115E26C6' },
        ],
      },
    ],
  },
}));

import { fetchRolesOverview, fetchTemplateRoles } from '@/lib/rolesApi.js';
import { adaptMatrix, adaptReportsMatrix } from '@/pages/roles/useRolesOverviewData.js';
import RolesAccessMatrix from '@/pages/roles/RolesAccessMatrix.jsx';
import UserRolesTab from '../UserRolesTab.jsx';
import { RoleSelectionProvider } from '../roleSelectionContext.js';

const TAX_MODELS_PROXY_ID = '3E8FEA1EA7404D979306C9EE7FD2E7E8';
const NOT_POSTED_DOCS_PROXY_ID = 'D6AB95CE52D34E1599590526115E26C6';

/**
 * Builds a backend `{categories: [{name, windows|reports: [{id, name, access}]}]}` payload
 * from flat `[{category, id, name, access}]` rows, keeping first-appearance order.
 */
function backendMatrix(rows, itemsKey = 'windows') {
  const byCategory = new Map();
  for (const { category, id, name, access } of rows) {
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push({ id, name, access });
  }
  return {
    categories: [...byCategory.entries()].map(([name, items]) => ({ name, [itemsKey]: items })),
  };
}

const TEMPLATE_ROLE_LIST = [
  { id: 'role-fin', name: 'Finance' },
  { id: 'role-sales', name: 'Sales' },
];

// w1: both full; w2: Finance none, Sales read-only; w3: nobody.
const TEMPLATE_MATRIX_ROWS = [
  { category: 'Comercial', id: 'w1', name: 'Ventas', access: { 'role-fin': 'full', 'role-sales': 'full' } },
  { category: 'Comercial', id: 'w2', name: 'Clientes', access: { 'role-fin': 'none', 'role-sales': 'read-only' } },
  { category: 'Compras', id: 'w3', name: 'Proveedores', access: { 'role-fin': 'none', 'role-sales': 'none' } },
];

function templatesPayload(rows = TEMPLATE_MATRIX_ROWS, { roles = TEMPLATE_ROLE_LIST, reportRows = [] } = {}) {
  return {
    roles,
    matrix: backendMatrix(rows),
    reportsMatrix: backendMatrix(reportRows, 'reports'),
  };
}

const TEMPLATE_ROLES = templatesPayload();

// The tenant overview: needed for admin-holder detection and, for an admin holder, as the
// row/cell source (its matrix has an admin column).
const ROLES_OVERVIEW = {
  roles: [
    { id: 'role-fin', name: 'Finance' },
    { id: 'role-sales', name: 'Sales' },
    { id: 'role-admin', name: 'GOClient Admin', isClientAdmin: true },
  ],
  matrix: backendMatrix(TEMPLATE_MATRIX_ROWS.map((row) => ({
    ...row,
    access: { ...row.access, 'role-admin': 'full' },
  }))),
  reportsMatrix: backendMatrix([], 'reports'),
};

function renderTab({ isNew = false, onVisibilityChange = vi.fn(), selectedRoleIds = [], data } = {}) {
  return render(
    <RoleSelectionProvider value={{ selectedRoleIds, setSelectedRoleIds: vi.fn() }}>
      <UserRolesTab isNew={isNew} onVisibilityChange={onVisibilityChange} data={data} />
    </RoleSelectionProvider>,
  );
}

// `TierPill` only renders a `span.rounded-full` when the cell has access; a no-access
// ('—') cell renders plain text.
function pillSpanIn(cell) {
  return cell.querySelector('span.rounded-full');
}

describe('UserRolesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('new (not-yet-persisted) user', () => {
    it('renders the same empty-state placeholder as an existing user with zero roles selected', () => {
      renderTab({ isNew: true });
      expect(screen.getByTestId('UserRolesTab__empty')).toHaveTextContent('userRolesTabEmptyState');
    });

    it('reports itself as visible via onVisibilityChange(true) when isNew', () => {
      const onVisibilityChange = vi.fn();
      renderTab({ isNew: true, onVisibilityChange });
      expect(onVisibilityChange).toHaveBeenCalledWith(true);
    });

    it('never fetches the roles overview or template roles when isNew', () => {
      renderTab({ isNew: true });
      expect(fetchRolesOverview).not.toHaveBeenCalled();
      expect(fetchTemplateRoles).not.toHaveBeenCalled();
    });
  });

  describe('existing user', () => {
    beforeEach(() => {
      fetchRolesOverview.mockResolvedValue(ROLES_OVERVIEW);
      fetchTemplateRoles.mockResolvedValue(TEMPLATE_ROLES);
    });

    it('reports itself as visible via onVisibilityChange(true)', () => {
      const onVisibilityChange = vi.fn();
      renderTab({ isNew: false, onVisibilityChange });
      expect(onVisibilityChange).toHaveBeenCalledWith(true);
    });

    it('requests the templates WITH the shared matrix (ETP-5485)', async () => {
      renderTab({ selectedRoleIds: ['role-fin'] });

      await screen.findByTestId('UserRolesTab');
      expect(fetchTemplateRoles).toHaveBeenCalledWith({ includeMatrix: true });
    });

    it('renders the empty state when zero roles are currently selected', async () => {
      renderTab({ selectedRoleIds: [] });

      expect(await screen.findByTestId('UserRolesTab__empty')).toBeInTheDocument();
      expect(screen.queryByTestId('UserRolesTab')).not.toBeInTheDocument();
    });

    // Regression coverage (ETP-4906 F9 Findings): loading/error must be checked before the
    // "no roles selected" empty state, since `columns` stays empty while fetching.
    it('shows a loading indicator (not the empty state) while the fetches are in flight, with roles selected', async () => {
      let resolveTemplates;
      fetchTemplateRoles.mockReturnValue(new Promise((resolve) => { resolveTemplates = resolve; }));
      renderTab({ selectedRoleIds: ['role-fin'] });

      expect(screen.getByTestId('UserRolesTab__loading')).toBeInTheDocument();
      expect(screen.queryByTestId('UserRolesTab__empty')).not.toBeInTheDocument();
      resolveTemplates(TEMPLATE_ROLES);
      await waitFor(() => expect(screen.getByTestId('UserRolesTab')).toBeInTheDocument());
    });

    it('shows an error message (not the empty state) when a fetch rejects, with roles selected', async () => {
      fetchTemplateRoles.mockRejectedValue(new Error('network down'));
      renderTab({ selectedRoleIds: ['role-fin'] });

      expect(await screen.findByTestId('UserRolesTab__error')).toBeInTheDocument();
      expect(screen.queryByTestId('UserRolesTab__empty')).not.toBeInTheDocument();
    });

    // ETP-5485 — an older backend ignores `includeMatrix` and returns roles only. The tab
    // has no second row source anymore, so it shows the error state instead of crashing or
    // rendering an empty table.
    it('shows the error state (no crash) when the templates payload carries no matrix (older backend)', async () => {
      fetchTemplateRoles.mockResolvedValue({ roles: TEMPLATE_ROLE_LIST });
      renderTab({ selectedRoleIds: ['role-fin'] });

      expect(await screen.findByTestId('UserRolesTab__error')).toBeInTheDocument();
      expect(screen.queryByTestId('UserRolesTab')).not.toBeInTheDocument();
    });

    it('does not update state after unmount while fetches are still in flight', async () => {
      let resolveTemplates;
      fetchTemplateRoles.mockReturnValue(new Promise((resolve) => { resolveTemplates = resolve; }));
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { unmount } = renderTab({ selectedRoleIds: ['role-fin'] });
      unmount();
      resolveTemplates(TEMPLATE_ROLES);
      await new Promise((r) => setTimeout(r, 0));

      expect(consoleErrorSpy).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('the rendered matrix', () => {
    beforeEach(() => {
      fetchTemplateRoles.mockResolvedValue(TEMPLATE_ROLES);
      fetchRolesOverview.mockResolvedValue(ROLES_OVERVIEW);
    });

    it('renders one column per currently-selected (non-admin) role', async () => {
      renderTab({ selectedRoleIds: ['role-fin', 'role-sales'] });

      const table = await screen.findByTestId('UserRolesTab');
      // Scope to the <thead> — the category divider rows inside <tbody> also use <th>.
      const headerRow = table.querySelector('thead tr');
      const headers = within(headerRow).getAllByRole('columnheader');
      expect(headers).toHaveLength(3);
      expect(headers[1]).toHaveTextContent('Finance');
      expect(headers[2]).toHaveTextContent('Sales');
    });

    it('never renders the Admin role as a column, even if selectedRoleIds erroneously includes it', async () => {
      renderTab({ selectedRoleIds: ['role-fin', 'role-admin'] });

      const table = await screen.findByTestId('UserRolesTab');
      const headerRow = table.querySelector('thead tr');
      expect(within(headerRow).queryByText('GOClient Admin')).not.toBeInTheDocument();
      expect(within(headerRow).getAllByRole('columnheader')).toHaveLength(2);
    });

    it('never renders the old hardcoded General category header or its 3 rows', async () => {
      renderTab({ selectedRoleIds: ['role-fin', 'role-sales'] });

      await screen.findByTestId('UserRolesTab');
      expect(screen.queryByTestId('UserRolesTab__category-general')).not.toBeInTheDocument();
      for (const key of ['dashboard', 'favorites', 'copilot']) {
        expect(screen.queryByTestId(`UserRolesTab__row-${key}`)).not.toBeInTheDocument();
      }
    });

    it('groups rows by the backend category when the window has no menu.json entry', async () => {
      renderTab({ selectedRoleIds: ['role-fin', 'role-sales'] });

      const table = await screen.findByTestId('UserRolesTab');
      const categoryHeaders = within(table).getAllByText(/^(Comercial|Compras)$/);
      expect(categoryHeaders.map((el) => el.textContent)).toEqual(['Comercial', 'Compras']);
      expect(screen.getByTestId('UserRolesTab__category-Comercial')).toBeInTheDocument();
    });

    it('renders exactly the backend matrix rows — nothing more, nothing less', async () => {
      renderTab({ selectedRoleIds: ['role-fin'] });

      const table = await screen.findByTestId('UserRolesTab');
      const rowIds = [...table.querySelectorAll('[data-testid^="UserRolesTab__row-"]')]
        .map((el) => el.getAttribute('data-testid').replace('UserRolesTab__row-', ''));
      // Order is the adapter's (menu.json, else alphabetical by name) — only the set matters.
      expect([...rowIds].sort()).toEqual(['w1', 'w2', 'w3']);
    });

    it('full access renders ✓', async () => {
      renderTab({ selectedRoleIds: ['role-fin', 'role-sales'] });

      const row = await screen.findByTestId('UserRolesTab__row-w1');
      const cells = within(row).getAllByRole('cell');
      expect(cells[0]).toHaveTextContent('Ventas');
      expect(cells[1]).toHaveTextContent('✓');
      expect(cells[2]).toHaveTextContent('✓');
    });

    it('resolves a read-only tier through the accessTierReadOnly i18n key', async () => {
      renderTab({ selectedRoleIds: ['role-fin', 'role-sales'] });

      const row = await screen.findByTestId('UserRolesTab__row-w2');
      const cells = within(row).getAllByRole('cell');
      expect(cells[0]).toHaveTextContent('Clientes');
      expect(cells[1]).toHaveTextContent('—');
      expect(cells[2]).toHaveTextContent('accessTierReadOnly');
    });

    // ETP-5485 — a window granted to NONE of the selected templates is still a row (the
    // backend matrix lists every GO window), rendered with "—".
    it('renders a window granted to no selected template as a row of "—"', async () => {
      renderTab({ selectedRoleIds: ['role-fin', 'role-sales'] });

      const row = await screen.findByTestId('UserRolesTab__row-w3');
      const cells = within(row).getAllByRole('cell');
      expect(cells[0]).toHaveTextContent('Proveedores');
      expect(cells[1]).toHaveTextContent('—');
      expect(cells[2]).toHaveTextContent('—');
    });

    it('renders "—" for a role id missing from a row\'s access map', async () => {
      fetchTemplateRoles.mockResolvedValue(templatesPayload([
        { category: 'Comercial', id: 'w1', name: 'Ventas', access: { 'role-fin': 'full' } },
      ]));
      renderTab({ selectedRoleIds: ['role-fin', 'role-sales'] });

      const row = await screen.findByTestId('UserRolesTab__row-w1');
      expect(within(row).getAllByRole('cell')[2]).toHaveTextContent('—');
    });

    it('marks the <thead> sticky with an opaque background so it can pin while the body scrolls', async () => {
      renderTab({ selectedRoleIds: ['role-fin', 'role-sales'] });

      const table = await screen.findByTestId('UserRolesTab');
      const thead = table.querySelector('thead');
      expect(thead.className).toContain('sticky');
      expect(thead.className).toContain('top-0');
      expect(thead.className).toContain('bg-card');
    });

    // ETP-4999 item 5 regression guard — a local bounding wrapper reintroduces a
    // live-confirmed bottom-gap bug (see git history of this test for the full story).
    it('does NOT bound the wrapper with a local max-h/overflow — that previously caused a live-confirmed bottom-gap bug', async () => {
      renderTab({ selectedRoleIds: ['role-fin', 'role-sales'] });

      const wrapper = await screen.findByTestId('UserRolesTab');
      expect(wrapper.className).not.toContain('max-h-[60vh]');
      expect(wrapper.className).not.toContain('overflow-auto');
    });
  });

  // ETP-5485 — the bug this ticket closes: the ETP-5071 proxy rows ("Modelos Fiscales",
  // "Documentos no contabilizados") come from the shared backend matrix and resolve through
  // menu.json exactly like the Roles page, with each template's real tier.
  describe('ETP-5071 proxy rows (ETP-5485)', () => {
    beforeEach(() => {
      fetchRolesOverview.mockResolvedValue(ROLES_OVERVIEW);
      fetchTemplateRoles.mockResolvedValue(templatesPayload([
        ...TEMPLATE_MATRIX_ROWS,
        { category: 'Other', id: NOT_POSTED_DOCS_PROXY_ID, name: 'Not Posted Documents', access: { 'role-fin': 'full', 'role-sales': 'none' } },
        { category: 'Fiscal Reports', id: TAX_MODELS_PROXY_ID, name: 'Fiscal Models', access: { 'role-fin': 'full', 'role-sales': 'read-only' } },
      ]));
    });

    it('renders both proxy rows under their menu.json category with each template\'s real tier', async () => {
      renderTab({ selectedRoleIds: ['role-fin', 'role-sales'] });

      const taxModels = await screen.findByTestId(`UserRolesTab__row-${TAX_MODELS_PROXY_ID}`);
      const taxCells = within(taxModels).getAllByRole('cell');
      expect(taxCells[0]).toHaveTextContent('Fiscal Models');
      expect(taxCells[1]).toHaveTextContent('✓');
      expect(taxCells[2]).toHaveTextContent('accessTierReadOnly');

      const notPosted = screen.getByTestId(`UserRolesTab__row-${NOT_POSTED_DOCS_PROXY_ID}`);
      const notPostedCells = within(notPosted).getAllByRole('cell');
      expect(notPostedCells[0]).toHaveTextContent('Not Posted Documents');
      expect(notPostedCells[1]).toHaveTextContent('✓');
      expect(notPostedCells[2]).toHaveTextContent('—');

      // Both land under menu.json's 'Finance' group, not the backend's raw categories.
      expect(screen.getByTestId('UserRolesTab__category-Finance')).toBeInTheDocument();
      expect(screen.queryByTestId('UserRolesTab__category-Other')).not.toBeInTheDocument();
      expect(screen.queryByTestId('UserRolesTab__category-Fiscal Reports')).not.toBeInTheDocument();
    });

    it('lists the same row ids as RolesAccessMatrix for the same backend matrix (parity)', async () => {
      const payload = templatesPayload([
        ...TEMPLATE_MATRIX_ROWS,
        { category: 'Other', id: NOT_POSTED_DOCS_PROXY_ID, name: 'Not Posted Documents', access: { 'role-fin': 'full', 'role-sales': 'none' } },
        { category: 'Fiscal Reports', id: TAX_MODELS_PROXY_ID, name: 'Fiscal Models', access: { 'role-fin': 'full', 'role-sales': 'read-only' } },
        { category: 'Hidden', id: 'm-hidden', name: 'Hidden', access: { 'role-fin': 'full', 'role-sales': 'full' } },
      ], { reportRows: [{ category: 'Finance', id: 'tax-report', name: 'Tax Report', access: { 'role-fin': 'full', 'role-sales': 'none' } }] });
      fetchTemplateRoles.mockResolvedValue(payload);

      renderTab({ selectedRoleIds: ['role-fin', 'role-sales'] });
      const table = await screen.findByTestId('UserRolesTab');
      const tabIds = [...table.querySelectorAll('[data-testid^="UserRolesTab__row-"]')]
        .map((el) => el.getAttribute('data-testid').replace('UserRolesTab__row-', ''))
        .sort();
      cleanup();

      render(
        <RolesAccessMatrix
          cards={TEMPLATE_ROLE_LIST}
          matrix={adaptMatrix(payload.matrix)}
          reportsMatrix={adaptReportsMatrix(payload.reportsMatrix)}
          iconFor={() => null}
        />,
      );
      const pageIds = [...document.querySelectorAll('[data-testid^="RolesAccessMatrix__row-"]')]
        .map((el) => el.getAttribute('data-testid')
          .replace('RolesAccessMatrix__row-', '')
          .replace(/--informes$/, '')
          .split('::')[1])
        .sort();

      expect(tabIds).toEqual(pageIds);
      expect(tabIds).toContain(TAX_MODELS_PROXY_ID);
      expect(tabIds).toContain(NOT_POSTED_DOCS_PROXY_ID);
      expect(tabIds).not.toContain('m-hidden');
    });
  });

  // ETP-4999 item 5 — when a row's roles disagree, only the left-most highest-ranked cell is
  // marked (bold pill + info tooltip); losing cells render plainly.
  describe('winner/loser indicator (ETP-4999 item 5)', () => {
    beforeEach(() => {
      fetchTemplateRoles.mockResolvedValue(TEMPLATE_ROLES);
      fetchRolesOverview.mockResolvedValue(ROLES_OVERVIEW);
    });

    it('marks the higher tier as winner with a bold pill + tooltip, and renders the lower tier plainly (read-only vs no access, w2)', async () => {
      renderTab({ selectedRoleIds: ['role-fin', 'role-sales'] });

      const row = await screen.findByTestId('UserRolesTab__row-w2');
      const winnerBadge = screen.getByTestId('WinnerBadge__w2-role-sales');
      expect(winnerBadge).toBeInTheDocument();
      expect(screen.queryByTestId('WinnerBadge__w2-role-fin')).not.toBeInTheDocument();

      const cells = within(row).getAllByRole('cell');
      expect(pillSpanIn(cells[1])).toBeNull();
      expect(pillSpanIn(cells[2]).className).toContain('font-bold');
      expect(pillSpanIn(cells[2]).className).not.toContain('font-medium');

      const tooltipContent = screen.getByTestId('WinnerTooltipContent__w2-role-sales');
      expect(tooltipContent).toHaveTextContent('userRolesTabWinnerTooltipTitle');
      expect(tooltipContent).toHaveTextContent('userRolesTabWinnerTooltipDescription');
      expect(winnerBadge).toHaveAttribute('aria-label', 'userRolesTabWinnerTooltipTitle');
    });

    it('renders no winner badge or bold pill when both roles have no access at all (— / — tie, w3)', async () => {
      renderTab({ selectedRoleIds: ['role-fin', 'role-sales'] });

      const row = await screen.findByTestId('UserRolesTab__row-w3');
      expect(within(row).queryByTestId(/^WinnerBadge__w3-/)).not.toBeInTheDocument();
      const cells = within(row).getAllByRole('cell');
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

    it('marks a real full grant as winner over no access (full vs none, w1)', async () => {
      fetchTemplateRoles.mockResolvedValue(templatesPayload([
        { category: 'Comercial', id: 'w1', name: 'Ventas', access: { 'role-fin': 'full', 'role-sales': 'none' } },
      ]));
      renderTab({ selectedRoleIds: ['role-fin', 'role-sales'] });

      const row = await screen.findByTestId('UserRolesTab__row-w1');
      expect(screen.getByTestId('WinnerBadge__w1-role-fin')).toBeInTheDocument();
      expect(screen.queryByTestId('WinnerBadge__w1-role-sales')).not.toBeInTheDocument();
      const cells = within(row).getAllByRole('cell');
      expect(pillSpanIn(cells[1]).className).toContain('font-bold');
      expect(pillSpanIn(cells[2])).toBeNull();
    });

    it('marks only the left-most column tied at the top rank as winner when two roles share the highest tier and a third trails', async () => {
      fetchTemplateRoles.mockResolvedValue(templatesPayload(
        [{ category: 'Comercial', id: 'w1', name: 'Ventas', access: { 'role-fin': 'full', 'role-sales': 'full', 'role-purchasing': 'read-only' } }],
        { roles: [...TEMPLATE_ROLE_LIST, { id: 'role-purchasing', name: 'Purchasing' }] },
      ));
      renderTab({ selectedRoleIds: ['role-fin', 'role-sales', 'role-purchasing'] });

      const row = await screen.findByTestId('UserRolesTab__row-w1');
      expect(screen.getByTestId('WinnerBadge__w1-role-fin')).toBeInTheDocument();
      expect(screen.queryByTestId('WinnerBadge__w1-role-sales')).not.toBeInTheDocument();
      expect(screen.queryByTestId('WinnerBadge__w1-role-purchasing')).not.toBeInTheDocument();
      const cells = within(row).getAllByRole('cell');
      expect(pillSpanIn(cells[1]).className).toContain('font-bold');
      expect(pillSpanIn(cells[2]).className).toContain('font-medium');
      expect(pillSpanIn(cells[3]).className).toContain('font-medium');
    });
  });

  // ETP-5071/5196 — a user promoted to the client's Admin role sees a single admin column.
  // ETP-5485: its rows and cells come from the OVERVIEW matrix (the only one with an admin
  // column), built by the same backend class, so the row set is unchanged.
  describe('admin role holder (ETP-5071)', () => {
    beforeEach(() => {
      fetchTemplateRoles.mockResolvedValue(TEMPLATE_ROLES);
      fetchRolesOverview.mockResolvedValue(ROLES_OVERVIEW);
    });

    it('shows the full-access message alongside a single admin-only column sourced from the overview matrix', async () => {
      renderTab({ selectedRoleIds: ['role-fin'], data: { defaultRole: 'role-admin' } });

      expect(await screen.findByTestId('UserRolesTab__admin-full-access')).toHaveTextContent(
        'userRolesTabAdminFullAccessMessage',
      );
      expect(screen.queryByTestId('UserRolesTab__loading')).not.toBeInTheDocument();
      expect(screen.queryByTestId('UserRolesTab__error')).not.toBeInTheDocument();
      expect(screen.queryByTestId('UserRolesTab__empty')).not.toBeInTheDocument();

      const table = await screen.findByTestId('UserRolesTab');
      const headerRow = table.querySelector('thead tr');
      const headers = within(headerRow).getAllByRole('columnheader');
      expect(headers).toHaveLength(2);
      expect(headers[1]).toHaveTextContent('roleNameAdmin');
      expect(within(headerRow).queryByText('Finance')).not.toBeInTheDocument();
      expect(within(headers[1]).getByTestId('RoleIcon__role-admin')).toBeInTheDocument();

      // Every row is ✓ for the admin column, including w3 which no template grants.
      for (const windowId of ['w1', 'w2', 'w3']) {
        const row = screen.getByTestId(`UserRolesTab__row-${windowId}`);
        expect(within(row).getAllByRole('cell')[1]).toHaveTextContent('✓');
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

    it('does NOT prematurely show the admin message while rolesOverview is still loading', async () => {
      let resolveOverview;
      fetchRolesOverview.mockReturnValue(new Promise((resolve) => { resolveOverview = resolve; }));
      renderTab({ selectedRoleIds: ['role-fin'], data: { defaultRole: 'role-admin' } });

      expect(screen.getByTestId('UserRolesTab__loading')).toBeInTheDocument();
      expect(screen.queryByTestId('UserRolesTab__admin-full-access')).not.toBeInTheDocument();

      resolveOverview(ROLES_OVERVIEW);
      expect(await screen.findByTestId('UserRolesTab__admin-full-access')).toBeInTheDocument();
    });

    it('never shows the admin message for a new (not-yet-persisted) user, even if `data` already carries the admin role id', () => {
      renderTab({ isNew: true, data: { defaultRole: 'role-admin' } });

      expect(screen.getByTestId('UserRolesTab__empty')).toBeInTheDocument();
      expect(screen.queryByTestId('UserRolesTab__admin-full-access')).not.toBeInTheDocument();
      expect(fetchRolesOverview).not.toHaveBeenCalled();
    });

    it('renders a sparse but valid admin column (all "—") when the admin role has no grants in the overview matrix', async () => {
      fetchRolesOverview.mockResolvedValue({
        ...ROLES_OVERVIEW,
        matrix: backendMatrix(TEMPLATE_MATRIX_ROWS.map((row) => ({
          ...row,
          access: { ...row.access, 'role-admin': 'none' },
        }))),
      });

      renderTab({ selectedRoleIds: ['role-fin'], data: { defaultRole: 'role-admin' } });

      expect(await screen.findByTestId('UserRolesTab__admin-full-access')).toBeInTheDocument();
      expect(screen.queryByTestId('UserRolesTab__empty')).not.toBeInTheDocument();
      for (const windowId of ['w1', 'w2', 'w3']) {
        const row = screen.getByTestId(`UserRolesTab__row-${windowId}`);
        expect(within(row).getAllByRole('cell')[1]).toHaveTextContent('—');
      }
    });

    it('lists the same rows as a standard user — only the columns change', async () => {
      renderTab({ selectedRoleIds: ['role-fin'], data: { defaultRole: 'role-admin' } });

      const table = await screen.findByTestId('UserRolesTab');
      const rowIds = [...table.querySelectorAll('[data-testid^="UserRolesTab__row-"]')]
        .map((el) => el.getAttribute('data-testid').replace('UserRolesTab__row-', ''));
      // Order is the adapter's (menu.json, else alphabetical by name) — only the set matters.
      expect([...rowIds].sort()).toEqual(['w1', 'w2', 'w3']);
    });
  });

  // menu.json category/name/order resolution — delegated to the Roles page's own adapter
  // since ETP-5485, pinned here at the tab level.
  describe('menu.json category grouping (ETP-5196, via the shared adapter)', () => {
    beforeEach(() => {
      fetchRolesOverview.mockResolvedValue(ROLES_OVERVIEW);
    });

    it('resolves category/name from menu.json, overriding the backend category/name, when the id is indexed', async () => {
      fetchTemplateRoles.mockResolvedValue(templatesPayload([
        { category: 'WrongClassicCategory', id: 'm-dual', name: 'Wrong AD Name', access: { 'role-fin': 'full' } },
      ]));
      renderTab({ selectedRoleIds: ['role-fin'] });

      const table = await screen.findByTestId('UserRolesTab');
      expect(within(table).getByText('DualMappedGroup')).toBeInTheDocument();
      expect(within(table).getByText('Dual (menu.json label)')).toBeInTheDocument();
      expect(within(table).queryByText('WrongClassicCategory')).not.toBeInTheDocument();
      expect(within(table).queryByText('Wrong AD Name')).not.toBeInTheDocument();
    });

    it('excludes a row entirely (and its now-empty category) when its only menu.json entry is hidden', async () => {
      fetchTemplateRoles.mockResolvedValue(templatesPayload([
        { category: 'Somewhere', id: 'm-hidden', name: 'Hidden Window (AD name)', access: { 'role-fin': 'full' } },
      ]));
      renderTab({ selectedRoleIds: ['role-fin'] });

      const table = await screen.findByTestId('UserRolesTab');
      expect(within(table).queryByText('HiddenOnlyGroup')).not.toBeInTheDocument();
      expect(within(table).queryByText('Hidden Window (AD name)')).not.toBeInTheDocument();
      expect(screen.queryByTestId('UserRolesTab__row-m-hidden')).not.toBeInTheDocument();
    });

    it('orders menu.json-resolved categories by groupOrder, not alphabetically (Zeta before Alpha)', async () => {
      fetchTemplateRoles.mockResolvedValue(templatesPayload([
        { category: 'X', id: 'm-alpha', name: 'raw alpha', access: { 'role-fin': 'full' } },
        { category: 'X', id: 'm-zeta', name: 'raw zeta', access: { 'role-fin': 'full' } },
      ]));
      renderTab({ selectedRoleIds: ['role-fin'] });

      const table = await screen.findByTestId('UserRolesTab');
      const categoryHeaders = within(table).getAllByText(/^(Zeta|Alpha)$/);
      expect(categoryHeaders.map((el) => el.textContent)).toEqual(['Zeta', 'Alpha']);
    });

    it('orders rows within a menu.json category by itemOrder, not by feed order or alphabetically', async () => {
      fetchTemplateRoles.mockResolvedValue(templatesPayload([
        { category: 'X', id: 'm-row-a', name: 'raw row a', access: { 'role-fin': 'full' } },
        { category: 'X', id: 'm-row-b', name: 'raw row b', access: { 'role-fin': 'full' } },
      ]));
      renderTab({ selectedRoleIds: ['role-fin'] });

      const table = await screen.findByTestId('UserRolesTab');
      const rowLabels = within(table).getAllByText(/^Row [AB] \(itemOrder \d\)$/);
      expect(rowLabels.map((el) => el.textContent)).toEqual(['Row B (itemOrder 0)', 'Row A (itemOrder 1)']);
    });
  });

  // ETP-5402 — the Informes rows come from `reportsMatrix` and render in their own
  // sub-block, even though every report's menu.json entry is `hidden: true`.
  describe('Informes subsection (ETP-5402)', () => {
    beforeEach(() => {
      fetchRolesOverview.mockResolvedValue(ROLES_OVERVIEW);
      fetchTemplateRoles.mockResolvedValue(templatesPayload([], {
        reportRows: [{ category: 'Finance', id: 'tax-report', name: 'Tax Report', access: { 'role-fin': 'full', 'role-sales': 'none' } }],
      }));
    });

    it('renders a report row (resolved via its menu.json reportId entry) under the Informes sub-header', async () => {
      renderTab({ selectedRoleIds: ['role-fin'] });

      const row = await screen.findByTestId('UserRolesTab__row-tax-report');
      expect(row).toHaveTextContent('Tax Report');
      expect(screen.getByText('ReportsGroup')).toBeInTheDocument();
      expect(screen.getByTestId('UserRolesTab__informesHeader-ReportsGroup')).toBeInTheDocument();
    });

    it('resolves a report tier from the reportsMatrix access map', async () => {
      renderTab({ selectedRoleIds: ['role-fin', 'role-sales'] });

      const row = await screen.findByTestId('UserRolesTab__row-tax-report');
      const cells = within(row).getAllByRole('cell');
      expect(cells[1]).toHaveTextContent('✓');
      expect(cells[2]).toHaveTextContent('—');
    });
  });
});
