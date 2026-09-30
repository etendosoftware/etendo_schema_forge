import { useEffect, useMemo, useState, Fragment } from 'react';
import { TrendingUp, Package, Landmark, FileText, Info, Settings } from 'lucide-react';
import { useUI, useMenuLabel } from '@/i18n';
import { fetchRolesOverview, fetchTemplateRoles } from '@/lib/rolesApi.js';
import { adaptMatrix, adaptReportsMatrix } from '@/pages/roles/useRolesOverviewData.js';
import { resolveRoleDisplayName, ADMIN_NAME_I18N_KEY } from '@/lib/roleNameI18n.js';
import { resolveDefaultRoleId } from './RoleChipsCell.jsx';
import { useRoleSelection } from './roleSelectionContext.js';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

/**
 * ETP-4906 Manual QA Feedback Round 6 (DEV wave 11) — one small semantic icon per role
 * column, rendered inline before the role's display name. Keyed by the raw AD_Role.name
 * (Finance/Sales/Purchasing/Inventory) — the SAME 4 literal keys `roleNameI18n.js`'s
 * `ROLE_NAME_I18N_KEYS` map uses, deliberately not a new naming scheme, so a role name
 * that resolves a display-name translation also resolves an icon here. Any role name not
 * in this map (there shouldn't be one among `columns`, since `AssignTemplateRolesControl`
 * only ever offers these 4) renders with no icon rather than guessing one. The admin
 * column (ETP-5196) is NOT keyed into this map — a tenant's Admin role name varies per
 * tenant, so it is instead gated on `role.isClientAdmin` at the call site, which always
 * resolves to the `Settings` icon regardless of the role's actual name.
 */
const ROLE_ICONS = {
  Sales: TrendingUp,
  Inventory: Package,
  Finance: Landmark,
  Purchasing: FileText,
};

/**
 * ETP-4906 Manual QA Feedback Round 6 (DEV wave 11) — colored pill/badge for a cell's
 * access tier, reusing the same `status-success`/`status-warning` semantic Tailwind
 * utilities (backed by `--status-success-*`/`--status-warning-*` CSS custom properties,
 * both with dark-mode variants) that `getStatusBadgeProps()` (`lib/statusBadge.js`) and
 * `FiscalStatusBadge.jsx` already use elsewhere in this app — not a new ad-hoc raw-green
 * Tailwind color, since a closer-matching dark-mode-aware convention already exists.
 * `tier === null` (no access, '—') intentionally renders as plain text, no pill.
 *
 * `...rest` (e.g. `data-testid`) is spread onto the rendered `<span>` — every call site
 * passes `data-testid`, and without forwarding it here it was silently dropped (PR
 * 1211 review finding), so `TierPill__...` never actually reached the DOM despite
 * every caller setting it.
 */
function TierPill({ tier, bold, children, ...rest }) {
  if (!tier) return children;
  const toneClass =
    tier === 'full'
      ? 'border-status-success-border bg-status-success text-status-success-foreground'
      : 'border-status-warning-border bg-status-warning text-status-warning-foreground';
  const weightClass = bold ? 'font-bold' : 'font-medium';
  return (
    <span {...rest} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${weightClass} ${toneClass}`}>
      {children}
    </span>
  );
}

/**
 * ETP-4999 item 5 — tier ranking for the winner/loser comparison below: no access
 * ('—', `tier === null`) is lowest, `'readOnly'` is middle, `'full'` is highest (the
 * adapter's normalized spellings, see `useRolesOverviewData.js`'s `normalizeTier`).
 * The winner logic is self-contained to this file by design (`RolesAccessMatrix.jsx`
 * has no winner marker); only the row DATA is shared with that page (ETP-5485).
 */
const TIER_RANK = { full: 2, readOnly: 1 };
function tierRank(tier) {
  return TIER_RANK[tier] ?? 0;
}

/**
 * Given one row's per-column `{ tier }` values, decides whether the row's roles
 * disagree on the access level for this window (ETP-4999 item 5 — the ticket's
 * "permission comparison view" ask: a user with multiple roles that grant
 * different access levels for the same window).
 *
 * When several columns tie at the highest rank, only the LEFT-MOST one is the
 * "winner" (`winnerIndex`, via `Array.indexOf`'s first-match semantics) — a
 * later human design revision of the original "mark every tied column" pass,
 * to keep exactly one marker per disagreeing row instead of one per tied column.
 */
function resolveRowWinner(cellsForRow) {
  const ranks = cellsForRow.map((cell) => tierRank(cell.tier));
  const maxRank = Math.max(...ranks);
  const minRank = Math.min(...ranks);
  const disagree = maxRank !== minRank;
  return { disagree, winnerIndex: disagree ? ranks.indexOf(maxRank) : -1 };
}

/**
 * One `<td>` in the matrix body, rendering `TierPill` plus (ETP-4999 item 5, revised
 * per human design feedback) an "effective permission" marker when this cell holds
 * the row's highest-ranked tier while the row's columns disagree: the pill text goes
 * bold and an info (`Info`) icon with a tooltip explains why. Deliberately NOT a
 * strikethrough on the losing cells (the first-pass design) — the human flagged that
 * as visually too harsh; a losing cell now renders exactly like a row with no
 * disagreement at all, and only the winner is called out.
 */
function MatrixRoleCell({ role, tier, text, isWinner, testIdKey, winnerTooltipTitle, winnerTooltipDescription }) {
  return (
    <td className="py-2.5 px-3 text-center text-foreground">
      <span className="inline-flex items-center justify-center gap-1">
        <TierPill tier={tier} bold={isWinner} data-testid={`TierPill__${testIdKey}-${role.id}`}>{text}</TierPill>
        {isWinner && (
          <TooltipProvider data-testid={`WinnerTooltipProvider__${testIdKey}-${role.id}`}>
            <Tooltip delayDuration={150} data-testid={`WinnerTooltip__${testIdKey}-${role.id}`}>
              <TooltipTrigger asChild data-testid={`WinnerBadgeTrigger__${testIdKey}-${role.id}`}>
                <span
                  tabIndex={0}
                  aria-label={winnerTooltipTitle}
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground cursor-help"
                  data-testid={`WinnerBadge__${testIdKey}-${role.id}`}
                >
                  <Info className="h-4 w-4" aria-hidden="true" data-testid={`WinnerBadgeIcon__${testIdKey}-${role.id}`} />
                </span>
              </TooltipTrigger>
              <TooltipContent data-testid={`WinnerTooltipContent__${testIdKey}-${role.id}`}>
                <p className="font-semibold">{winnerTooltipTitle}</p>
                <p>{winnerTooltipDescription}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </span>
    </td>
  );
}

/**
 * ETP-4906 — "Roles del usuario" tab: a live per-role permission-preview matrix, one column
 * per currently-selected template role (Finance/Sales/Purchasing/Inventory), one row per
 * Etendo GO window (grouped by menu category), rendered only for an EXISTING user.
 *
 * **The cross-task coupling point with Task F3.** The column set is the role picker's
 * (`AssignTemplateRolesControl.jsx`) CURRENTLY locally-selected set, not the saved one —
 * toggling a chip must update this matrix instantly with zero extra network calls (the
 * fetches below run once on mount; every re-render after that is pure local recomputation
 * over already-fetched data). Read via `useRoleSelection()` (`./roleSelectionContext.js`):
 * `UserRolesTab` (a `window.customPanelTabs` entry) and `AssignTemplateRolesControl` (a
 * `window.headerExtra`/`formFooter` entry) are two independent custom-component slots on
 * the same generated `UserPage`, so React Context (`windows/custom/user/index.jsx`) is the
 * channel between them.
 *
 * **Rows come from the shared backend matrix (ETP-5485).** Rows, categories and per-role
 * tiers are the backend `matrix` + `reportsMatrix`, built by `com.etendoerp.go`'s
 * `RoleAccessMatrix` — the SAME class that builds "Configuración > Roles"' matrix — and
 * adapted by the SAME `adaptMatrix`/`adaptReportsMatrix` that page uses (menu.json
 * category/label/order, hidden-window exclusion). So both screens list the same rows by
 * construction. Before ETP-5485 this tab rebuilt its rows itself (AD menu tree ∩ the union
 * of every role's `windows[]`), and every rule added to the Roles page had to be copied
 * here by hand — the ETP-5071 proxy rows ("Modelos Fiscales", "Documentos no
 * contabilizados") never were, which is the bug ETP-5485 fixes.
 *
 * **Two payloads, one builder.**
 * - `fetchTemplateRoles({ includeMatrix: true })` (`SFSystemRoleTemplates`): the 4
 *   system-level templates — the COLUMNS a standard user composes from — plus the matrix
 *   with one `access` entry per template id. This is the normal row source.
 * - `fetchRolesOverview()` (`SFRolesOverview`): the tenant's roles, needed to detect an
 *   admin holder (ETP-5071) and, for one, as the row source — its matrix is the only one
 *   with the tenant admin role as a column. Same backend builder over the same window set,
 *   so the ROWS are identical either way; only the column changes.
 *
 * Cells can still legitimately differ from the Roles page on a hybrid-state tenant: that
 * page shows the tenant's own active copy of a role, while this tab shows the system
 * template the user actually composes.
 */
export default function UserRolesTab({ isNew, onVisibilityChange, data }) {
  const ui = useUI();
  const tMenu = useMenuLabel();
  const { selectedRoleIds } = useRoleSelection();
  const [rolesOverview, setRolesOverview] = useState(null);
  const [templateRoles, setTemplateRoles] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // ETP-4999 — the tab stays visible even for an in-progress user creation (see the `isNew`
  // render branch below); only the live fetches are gated on an existing `AD_User_ID`.
  useEffect(() => {
    onVisibilityChange?.(true);
  }, [onVisibilityChange]);

  useEffect(() => {
    if (isNew) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(false);
    // Not shared with AssignTemplateRolesControl — an accepted duplicate fetch (Task F5).
    Promise.all([fetchRolesOverview(), fetchTemplateRoles({ includeMatrix: true })])
      .then(([overview, templates]) => {
        if (cancelled) return;
        setRolesOverview(overview);
        setTemplateRoles(templates);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [isNew]);

  const overviewRoles = useMemo(
    () => (Array.isArray(rolesOverview?.roles) ? rolesOverview.roles : []),
    [rolesOverview],
  );

  // ETP-5071 — once a user is promoted to the client's Admin role (ETP-5019), the
  // composed-roles selection is stale: the user has full access now. Same detection as
  // `AssignTemplateRolesControl.jsx` (`isClientAdmin` row vs. `data.defaultRole`).
  const adminRole = useMemo(
    () => overviewRoles.find((role) => role?.isClientAdmin === true) ?? null,
    [overviewRoles],
  );
  const adminRoleId = adminRole?.id != null ? String(adminRole.id) : null;
  const currentDefaultRoleId = resolveDefaultRoleId(data);
  const isAdminRoleHolder = !!(adminRoleId && currentDefaultRoleId && currentDefaultRoleId === adminRoleId);

  // The 4 system-level templates — the column source for a standard user.
  const allTemplateRoles = useMemo(
    () => (Array.isArray(templateRoles?.roles) ? templateRoles.roles : []),
    [templateRoles],
  );

  // ETP-5485 — the payload whose matrix feeds the rows: the overview for an admin holder
  // (it has the admin column), the templates otherwise. `null` matrix = an older backend
  // that ignored `includeMatrix` (rendered as the error state below).
  const matrixSource = isAdminRoleHolder ? rolesOverview : templateRoles;
  const hasMatrix = !!matrixSource?.matrix;

  // Each category: `{ category, rows, reportRows }`, in `adaptMatrix`'s menu.json order,
  // then any category only `reportsMatrix` introduces — same merge `RolesAccessMatrix.jsx`
  // does, so the Informes sub-block nests under its category identically.
  const categoryGroups = useMemo(() => {
    if (!hasMatrix) return [];
    const windowGroups = adaptMatrix(matrixSource.matrix);
    const reportGroups = adaptReportsMatrix(matrixSource.reportsMatrix);
    const reportRowsByCategory = new Map(reportGroups.map((g) => [g.category, g.rows]));
    const windowCategories = new Set(windowGroups.map((g) => g.category));
    return [
      ...windowGroups.map((g) => ({
        category: g.category,
        rows: g.rows,
        reportRows: reportRowsByCategory.get(g.category) ?? [],
      })),
      ...reportGroups
        .filter((g) => !windowCategories.has(g.category))
        .map((g) => ({ category: g.category, rows: [], reportRows: g.rows })),
    ].filter((group) => group.rows.length > 0 || group.reportRows.length > 0);
  }, [hasMatrix, matrixSource]);

  // ETP-5196 — for a confirmed admin holder the sole column is the admin role itself, not
  // the pre-promotion template selection.
  const columns = useMemo(() => {
    if (isAdminRoleHolder) return adminRole ? [adminRole] : [];
    const selected = new Set((selectedRoleIds ?? []).map(String));
    // SFSystemRoleTemplates never returns a client-admin row, so every entry is composable.
    return allTemplateRoles.filter((role) => selected.has(String(role.id)));
  }, [isAdminRoleHolder, adminRole, allTemplateRoles, selectedRoleIds]);

  // ETP-4999 — a brand-new, not-yet-saved user can never have roles selected yet, so this is
  // always the "zero roles selected" empty state; nothing to fetch.
  if (isNew) {
    return (
      <div
        className="flex items-center justify-center py-12 text-center text-sm text-muted-foreground"
        data-testid="UserRolesTab__empty"
      >
        {ui('userRolesTabEmptyState')}
      </div>
    );
  }

  // ETP-5071 (revised ETP-5196) — `isAdminRoleHolder` is `false` for the entire in-flight
  // fetch and after a failed one, so computing this before loading/error never masks them.
  // The message renders as a sibling above the single-admin-column table.
  const adminFullAccessMessage = isAdminRoleHolder ? (
    <div
      className="flex items-center justify-center py-12 text-center text-sm text-muted-foreground"
      data-testid="UserRolesTab__admin-full-access"
    >
      {ui('userRolesTabAdminFullAccessMessage')}
    </div>
  ) : null;

  // loading/error MUST be checked before the "no roles selected" empty state below:
  // `columns` stays empty during the fetch and after a failure (ETP-4906 F9 Findings).
  if (loading) {
    return (
      <div className="py-8 text-center text-xs text-muted-foreground" data-testid="UserRolesTab__loading">
        {ui('loading')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground" data-testid="UserRolesTab__error">
        {ui('rolesLoadError')}
      </div>
    );
  }

  if (columns.length === 0) {
    return (
      <div
        className="flex items-center justify-center py-12 text-center text-sm text-muted-foreground"
        data-testid="UserRolesTab__empty"
      >
        {ui('userRolesTabEmptyState')}
      </div>
    );
  }

  // ETP-5485 — no matrix in the payload means a backend older than this frontend (deploy
  // order: backend first). There is no second row source to fall back to, so say so.
  if (!hasMatrix) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground" data-testid="UserRolesTab__error">
        {ui('rolesLoadError')}
      </div>
    );
  }

  // The display text AND the tier ('full' | 'readOnly' | null for no access), so the caller
  // can wrap it in a colored `TierPill` — `null` renders plain text, no pill.
  const cellValue = (row, role) => {
    const tier = row.access?.[String(role.id)] ?? 'none';
    if (tier === 'full') return { tier: 'full', text: '✓' };
    if (tier === 'readOnly') return { tier: 'readOnly', text: ui('accessTierReadOnly') };
    return { tier: null, text: '—' };
  };

  const winnerTooltipTitle = ui('userRolesTabWinnerTooltipTitle');
  const winnerTooltipDescription = ui('userRolesTabWinnerTooltipDescription');

  return (
    // ETP-5196 — `adminFullAccessMessage` (non-null only for a confirmed admin holder)
    // renders as a sibling ABOVE the table, not instead of it: the fragment wrapper
    // below is the only change from the pre-ETP-5196 single-`<div>` return.
    <>
      {adminFullAccessMessage}
      {/* ETP-4999 item 5 — NO local `overflow-auto`/`max-h-[...]` wrapper here (an earlier
          pass added one, on the assumption `sticky` needed a locally-owned scroll context —
          live-verified false: the enclosing `DetailView.jsx` custom-tab panel's own outer
          column (`overflow-y-auto`, the single scroll context for the whole detail form) IS
          a valid sticky ancestor, and `sticky top-0` below pins correctly against it). A
          local wrapper here instead created a SECOND, artificially short scroll region
          inside the (always full-viewport-height) outer panel — the empty space between
          where this region's content ended and the panel's own bottom edge is exactly what
          a human caught live: comparing against a pre-item-5 build showed no such gap. */}
      <div data-testid="UserRolesTab">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b border-border/50">
              <th className="text-left text-sm font-semibold text-foreground py-2.5 pr-4">
                {ui('userRolesTabWindowColumn')}
              </th>
              {columns.map((role) => {
                const RoleIcon = role.isClientAdmin ? Settings : ROLE_ICONS[role.name];
                return (
                  <th key={role.id} className="text-center text-sm font-semibold text-foreground py-2.5 px-3">
                    <span className="inline-flex items-center justify-center gap-1">
                      {RoleIcon && <RoleIcon className="h-3.5 w-3.5" aria-hidden="true" data-testid={`RoleIcon__${role.id}`} />}
                      {role.isClientAdmin ? ui(ADMIN_NAME_I18N_KEY) : resolveRoleDisplayName(ui, role.name)}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {categoryGroups.map((group) => (
              <Fragment key={group.category}>
                <tr className="bg-muted/30" data-testid={`UserRolesTab__category-${group.category}`}>
                  <th
                    colSpan={columns.length + 1}
                    /* scope="row", not the spec-textbook "rowgroup": "rowgroup" only labels
                       correctly when paired with one <tbody> per group, per the WHATWG HTML
                       spec's own worked example. Here ALL categories share a single <tbody>
                       (see the `<Fragment key={group.category}>` wrapping below, not a
                       per-category <tbody>), so under the spec's rule ("applies to all the
                       remaining cells in the row group") a "rowgroup" scope would associate
                       this header with every row of every LATER category too, not just its
                       own — worse than the ARIA-role bug it would fix. "row" is safe: this
                       <th> is alone in its own <tr> (colSpan spans the whole row), so it
                       creates no cell association at all, but it still flips the implicit
                       ARIA role from columnheader to rowheader (both "row" and "rowgroup" map
                       to rowheader per HTML-AAM), which is what resolves the Playwright
                       role-collision this was added for. */
                    scope="row"
                    className="text-left text-xs font-medium text-muted-foreground py-1.5 pr-4"
                  >
                    {tMenu(group.category)}
                  </th>
                </tr>
                {group.rows.map((row) => {
                  const cellsForRow = columns.map((role) => cellValue(row, role));
                  const { winnerIndex } = resolveRowWinner(cellsForRow);
                  return (
                    <tr key={row.windowId} data-testid={`UserRolesTab__row-${row.windowId}`}>
                      <td className="py-2.5 pr-4 text-foreground">{tMenu(row.windowName)}</td>
                      {columns.map((role, i) => {
                        const { tier, text } = cellsForRow[i];
                        const isWinner = i === winnerIndex;
                        return (
                          <MatrixRoleCell
                            key={role.id}
                            role={role}
                            tier={tier}
                            text={text}
                            isWinner={isWinner}
                            testIdKey={row.windowId}
                            winnerTooltipTitle={winnerTooltipTitle}
                            winnerTooltipDescription={winnerTooltipDescription}
                            data-testid="MatrixRoleCell__71bdc9" />
                        );
                      })}
                    </tr>
                  );
                })}
                {/* ETP-5402 QA follow-up — "Informes" subsection, same sub-header pattern as
                    RolesAccessMatrix.jsx's own `RolesAccessMatrix__informesHeader` row: nested
                    inside this category block, right after its real window rows, only when
                    this category actually has report rows. */}
                {group.reportRows.length > 0 && (
                  <tr className="bg-muted/10" data-testid={`UserRolesTab__informesHeader-${group.category}`}>
                    <th
                      colSpan={columns.length + 1}
                      scope="row"
                      className="text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70 py-1 pr-4 pl-3"
                    >
                      {ui('rolesMatrixInformesHeader')}
                    </th>
                  </tr>
                )}
                {group.reportRows.map((row) => {
                  const cellsForRow = columns.map((role) => cellValue(row, role));
                  const { winnerIndex } = resolveRowWinner(cellsForRow);
                  return (
                    <tr key={row.windowId} data-testid={`UserRolesTab__row-${row.windowId}`}>
                      <td className="py-2.5 pr-4 pl-3 text-foreground">{tMenu(row.windowName)}</td>
                      {columns.map((role, i) => {
                        const { tier, text } = cellsForRow[i];
                        const isWinner = i === winnerIndex;
                        return (
                          <MatrixRoleCell
                            key={role.id}
                            role={role}
                            tier={tier}
                            text={text}
                            isWinner={isWinner}
                            testIdKey={row.windowId}
                            winnerTooltipTitle={winnerTooltipTitle}
                            winnerTooltipDescription={winnerTooltipDescription}
                            data-testid="MatrixRoleCell__informes-71bdc9" />
                        );
                      })}
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
