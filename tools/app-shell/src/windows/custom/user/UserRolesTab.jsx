import { useEffect, useMemo, useState, Fragment } from 'react';
import { TrendingUp, Package, Landmark, FileText, Info } from 'lucide-react';
import { useUI, useMenuLabel } from '@/i18n';
import { fetchRolesOverview, fetchTemplateRoles } from '@/lib/rolesApi.js';
import { fetchMenuTree } from '@/lib/menuTree.js';
import { resolveRoleDisplayName } from '@/lib/roleNameI18n.js';
import { useRoleSelection } from './roleSelectionContext.js';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

/**
 * ETP-4906 Manual QA Feedback Round 6 (DEV wave 11) — one small semantic icon per role
 * column, rendered inline before the role's display name. Keyed by the raw AD_Role.name
 * (Finance/Sales/Purchasing/Inventory) — the SAME 4 literal keys `roleNameI18n.js`'s
 * `ROLE_NAME_I18N_KEYS` map uses, deliberately not a new naming scheme, so a role name
 * that resolves a display-name translation also resolves an icon here. Any role name not
 * in this map (there shouldn't be one among `columns`, since `AssignTemplateRolesControl`
 * only ever offers these 4) renders with no icon rather than guessing one.
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
 */
function TierPill({ tier, bold, children }) {
  if (!tier) return children;
  const toneClass =
    tier === 'full'
      ? 'border-status-success-border bg-status-success text-status-success-foreground'
      : 'border-status-warning-border bg-status-warning text-status-warning-foreground';
  const weightClass = bold ? 'font-bold' : 'font-medium';
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${weightClass} ${toneClass}`}>
      {children}
    </span>
  );
}

/**
 * ETP-4999 item 5 — tier ranking for the winner/loser comparison below: no access
 * ('—', `tier === null`) is lowest, `'readonly'` is middle, `'full'` is highest.
 * Self-contained to this file by design — do NOT import from `pages/roles/`
 * (`RolesAccessMatrix.jsx`'s own winner logic there is a separate, unrelated
 * feature that is being reverted in parallel; the two must not share code).
 */
const TIER_RANK = { full: 2, readonly: 1 };
function tierRank(tier) {
  return TIER_RANK[tier] ?? 0;
}

/**
 * Given one row's per-column `{ tier }` values, decides whether the row's roles
 * disagree on the access level for this window (ETP-4999 item 5 — the ticket's
 * "permission comparison view" ask: a user with multiple roles that grant
 * different access levels for the same window). `GENERAL_ROWS` below always
 * passes every column the same `tier: 'full'`, so `disagree` is always `false`
 * for those rows by construction — they render exactly as before, unaffected.
 */
function resolveRowWinner(cellsForRow) {
  const ranks = cellsForRow.map((cell) => tierRank(cell.tier));
  const maxRank = Math.max(...ranks);
  const minRank = Math.min(...ranks);
  return { disagree: maxRank !== minRank, maxRank };
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
 * toggling a chip must update this matrix instantly with zero extra network calls (the three
 * fetches below run once on mount; every re-render after that is pure local recomputation
 * over already-fetched data). Read via `useRoleSelection()` (`./roleSelectionContext.js`,
 * built by Task F3/developer-2): `UserRolesTab` (a `window.customPanelTabs` entry) and
 * `AssignTemplateRolesControl` (a `window.headerExtra`/`formFooter` entry) are two
 * independent custom-component slots on the same generated `UserPage`, each instantiated by
 * `DetailView` with its own fixed prop list — neither can pass a project-specific prop
 * straight to the other, and no generated layer in between can inject one either. React
 * Context is the channel `windows/custom/user/index.jsx` uses instead, reaching every
 * descendant regardless of how many generated prop-forwarding layers sit in between. This
 * component was originally written against a plain `selectedRoleIds` prop before F3's
 * concrete mechanism landed; it now consumes the same context F3 built rather than that prop
 * shape, so both slots read one shared source of truth.
 *
 * **Two role sources, two different jobs (ETP-4906 Manual QA Feedback Round 2, finding 2).**
 * The matrix's own COLUMNS (which roles, and their per-window tier data) come from
 * `fetchTemplateRoles()` (`SFSystemRoleTemplates`) — the 4 fixed templates at the SYSTEM
 * client, matching what `AssignTemplateRolesControl` now offers and what `selectedRoleIds`
 * will hold going forward. `fetchRolesOverview()` (`SFRolesOverview`) is kept ONLY for
 * `activeWindowIds` below — the Etendo-GO-window-exposure filter (fix #5, DEV wave 6) needs
 * the union across ALL of the CALLING TENANT's roles INCLUDING its client-admin row, since a
 * few real windows (e.g. "Roles", "Usuario") are deliberately granted to none of the 4
 * templates but must still appear as `—` rows (see `com.etendoerp.go`'s ETP-4878 docs) —
 * `fetchTemplateRoles()`'s response has no client-admin row at all, so it can't serve that
 * union on its own.
 */
function flattenWindowRows(nodes, category, out) {
  for (const node of nodes ?? []) {
    if (node.type === 'folder') {
      // Only the FIRST folder ancestor in the chain sets the category — deeper subfolders
      // don't override it, so every leaf collapses under its top-level category regardless
      // of how many nesting levels the real menu tree turns out to have.
      flattenWindowRows(node.children, category ?? node.name, out);
    } else if (node.windowId) {
      out.push({ windowId: String(node.windowId), name: node.name, category: category ?? node.name });
      if (node.children) flattenWindowRows(node.children, category, out);
    } else if (node.children) {
      flattenWindowRows(node.children, category, out);
    }
  }
  return out;
}

function groupRowsByCategory(rows) {
  const categoryOrder = [];
  const rowsByCategory = new Map();
  for (const row of rows) {
    if (!rowsByCategory.has(row.category)) {
      rowsByCategory.set(row.category, []);
      categoryOrder.push(row.category);
    }
    rowsByCategory.get(row.category).push(row);
  }
  return categoryOrder.map((category) => ({ category, rows: rowsByCategory.get(category) }));
}

/**
 * The 3 hardcoded General rows (ETP-4906 human decision, session 2026-08-14, made from a
 * static Figma screenshot — flagged for Alex/REVIEW to re-verify against the live Figma file
 * before merge, see the plan's Global Constraints). None of the three has an `AD_Window_ID`
 * at all, so none can ever be derived from `SFListMenu`'s tree — they are always rendered as
 * full access ('✓') for every role column, unconditionally. The other 9 windowless rows
 * documented in com.etendoerp.go's `TemplateRoleWindowAccess` javadoc (Monitor fiscal,
 * Informes financieros, both Informe Antigüedad reports, etc.) are intentionally omitted —
 * they must never appear, not even as a '—' row.
 */
const GENERAL_ROWS = [
  { key: 'dashboard', labelKey: 'userRolesTabDashboardRow' },
  { key: 'favorites', labelKey: 'userRolesTabFavoritesRow' },
  { key: 'copilot', labelKey: 'userRolesTabCopilotRow' },
];

export default function UserRolesTab({ isNew, onVisibilityChange }) {
  const ui = useUI();
  const tMenu = useMenuLabel();
  const { selectedRoleIds } = useRoleSelection();
  const [menuTreeData, setMenuTreeData] = useState(null);
  const [rolesOverview, setRolesOverview] = useState(null);
  const [templateRoles, setTemplateRoles] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // ETP-4999 — the tab itself now stays visible even for an in-progress user creation
  // (see the `isNew` render branch below, which shows the same empty-state placeholder
  // as an existing user with zero roles selected); only the LIVE fetches + network-backed
  // matrix are still gated on an existing `AD_User_ID` (SFAssignUserRoles/SFSystemRoleTemplates
  // still require one — see the plan's Global Constraints: "Never attempt SFAssignUserRoles
  // before an AD_User_ID exists"). Previously this hid the tab strip entry entirely while
  // isNew, which made the placeholder inconsistent between the pre-save and post-save empty
  // states for no functional reason — the placeholder text is identical either way.
  useEffect(() => {
    onVisibilityChange?.(true);
  }, [onVisibilityChange]);

  useEffect(() => {
    if (isNew) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(false);
    // Three independent fetches, not shared with AssignTemplateRolesControl (see file-level
    // JSDoc) — an accepted duplicate-fetch fallback per the plan (Task F5), not a blocker.
    // `fetchRolesOverview()` + `fetchTemplateRoles()` serve two different jobs — see the
    // file-level JSDoc's "Two role sources" note.
    Promise.all([fetchMenuTree(), fetchRolesOverview(), fetchTemplateRoles()])
      .then(([tree, overview, templates]) => {
        if (cancelled) return;
        setMenuTreeData(tree);
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

  // Tenant-scoped roles (from `fetchRolesOverview()`), used ONLY for `activeWindowIds`
  // below — see the file-level JSDoc's "Two role sources" note.
  const overviewRoles = useMemo(
    () => (Array.isArray(rolesOverview?.roles) ? rolesOverview.roles : []),
    [rolesOverview],
  );

  // The 4 system-level templates (from `fetchTemplateRoles()`) — the matrix's actual
  // column source, matching what `AssignTemplateRolesControl` offers and what
  // `selectedRoleIds` holds going forward.
  const allTemplateRoles = useMemo(
    () => (Array.isArray(templateRoles?.roles) ? templateRoles.roles : []),
    [templateRoles],
  );

  // Union of every windowId across ALL of the tenant's own roles (Admin included) — each
  // role's `windows[]` is already server-side intersected against Etendo GO's own active
  // spec set (`resolveActiveEtendoGoWindowIds()` in `SFRolesOverview.java`), so this union IS
  // exactly "every window Etendo GO actually exposes". `SFListMenu`'s tree (walked by
  // `flattenWindowRows` below) has no such filter — it returns every native AD menu
  // node, including classic-only entries (e.g. Application Dictionary) Etendo GO never
  // surfaces at all (ETP-4906 manual QA finding). Filtering against this set removes
  // those classic-only rows without a new backend call. Deliberately still sourced from
  // `overviewRoles`, not `allTemplateRoles` — the client-admin row it carries is what makes
  // this union cover windows granted to none of the 4 templates (e.g. "Roles", "Usuario").
  const activeWindowIds = useMemo(() => {
    const ids = new Set();
    for (const role of overviewRoles) {
      for (const w of role.windows ?? []) {
        if (w?.id != null) ids.add(String(w.id));
      }
    }
    return ids;
  }, [overviewRoles]);

  const categoryGroups = useMemo(() => {
    const treeRows = flattenWindowRows(menuTreeData?.tree, null, [])
      .filter((row) => activeWindowIds.has(row.windowId));
    // Drop any category left with zero surviving rows — must not render an empty
    // category header with nothing under it.
    return groupRowsByCategory(treeRows).filter((group) => group.rows.length > 0);
  }, [menuTreeData, activeWindowIds]);

  const columns = useMemo(() => {
    const selected = new Set((selectedRoleIds ?? []).map(String));
    // SFSystemRoleTemplates never returns a client-admin row (there is none at system
    // level), so no `!role.isClientAdmin` guard is needed here anymore — every entry in
    // `allTemplateRoles` is already a composable template by construction.
    return allTemplateRoles.filter((role) => selected.has(String(role.id)));
  }, [allTemplateRoles, selectedRoleIds]);

  // ETP-4999 — a brand-new, not-yet-saved user can never have any roles selected yet
  // (`AssignTemplateRolesControl` only renders its interactive chip editor once
  // `data?.id` exists — see that component's own save-first placeholder), so the
  // outcome is always "zero roles selected", i.e. exactly the same empty state an
  // EXISTING user with zero roles sees below. Render it directly here — no need to
  // reach the loading/error/fetch machinery at all, since there is nothing to fetch:
  // `selectedRoleIds` is guaranteed empty and the matrix would have zero columns
  // regardless of what the fetches returned.
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

  // loading/error MUST be checked before the "no roles selected" empty state below:
  // `columns` is derived from `templateRoles`, which stays `null` for the entire in-flight
  // fetch AND forever after a rejected fetch (the .catch above only sets `error`, never
  // `templateRoles`). Checking columns.length === 0 first would make it always win during a
  // fetch or after a failure, regardless of how many roles are actually selected, leaving the
  // loading/error branches permanently unreachable (ETP-4906 F9 Findings — dead-code bug).
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

  // Returns both the display text AND the tier ('full' | 'readonly' | null for no access)
  // so the caller can wrap it in a colored `TierPill` — 'null' means render plain text,
  // no pill (ETP-4906 Manual QA Feedback Round 6, DEV wave 11).
  const cellValue = (row, role) => {
    const windowEntry = (role.windows ?? []).find((w) => String(w.id) === row.windowId);
    if (!windowEntry) return { tier: null, text: '—' };
    return windowEntry.tier === 'full'
      ? { tier: 'full', text: '✓' }
      : { tier: 'readonly', text: ui('accessTierReadOnly') };
  };

  const winnerTooltipTitle = ui('userRolesTabWinnerTooltipTitle');
  const winnerTooltipDescription = ui('userRolesTabWinnerTooltipDescription');

  return (
    // ETP-4999 item 5 — bounded to `max-h-[60vh]` (matching this app's own convention
    // for a scrollable region nested inside a `bg-card` detail-form card, e.g.
    // `financial-account/ReconciledTxnsModal.jsx`'s `max-h-[56vh]`) so `<thead>`'s
    // `sticky top-0` below has a genuinely scrollable ancestor to stick within. The
    // enclosing `DetailView.jsx` custom-tab panel itself has no bounded height/overflow
    // of its own — its doc comment confirms the WHOLE document scrolls as one single
    // outer column — so without this local wrapper `sticky` here would be a no-op.
    <div className="overflow-auto max-h-[60vh]" data-testid="UserRolesTab">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-card">
          <tr className="border-b border-border/50">
            <th className="text-left text-sm font-semibold text-foreground py-2.5 pr-4">
              {ui('userRolesTabWindowColumn')}
            </th>
            {columns.map((role) => {
              const RoleIcon = ROLE_ICONS[role.name];
              return (
                <th key={role.id} className="text-center text-sm font-semibold text-foreground py-2.5 px-3">
                  <span className="inline-flex items-center justify-center gap-1">
                    {RoleIcon && <RoleIcon className="h-3.5 w-3.5" aria-hidden="true" data-testid={`RoleIcon__${role.id}`} />}
                    {resolveRoleDisplayName(ui, role.name)}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          <Fragment key="general">
            <tr className="bg-muted/30" data-testid="UserRolesTab__category-general">
              <th
                colSpan={columns.length + 1}
                className="text-left text-xs font-medium text-muted-foreground py-1.5 pr-4"
              >
                {ui('userRolesTabGeneralCategory')}
              </th>
            </tr>
            {GENERAL_ROWS.map((row) => {
              // Always 'full' for every column by construction — `resolveRowWinner`
              // always returns `disagree: false` here, so this row renders exactly
              // as it did before item 5 (no tooltip marker).
              const cellsForRow = columns.map(() => ({ tier: 'full', text: '✓' }));
              const { disagree, maxRank } = resolveRowWinner(cellsForRow);
              return (
                <tr key={row.key} data-testid={`UserRolesTab__row-${row.key}`}>
                  <td className="py-2.5 pr-4 text-foreground">{ui(row.labelKey)}</td>
                  {columns.map((role, i) => {
                    const { tier, text } = cellsForRow[i];
                    const isWinner = disagree && tierRank(tier) === maxRank;
                    return (
                      <MatrixRoleCell
                        key={role.id}
                        role={role}
                        tier={tier}
                        text={text}
                        isWinner={isWinner}
                        testIdKey={row.key}
                        winnerTooltipTitle={winnerTooltipTitle}
                        winnerTooltipDescription={winnerTooltipDescription}
                      />
                    );
                  })}
                </tr>
              );
            })}
          </Fragment>
          {categoryGroups.map((group) => (
            <Fragment key={group.category}>
              <tr className="bg-muted/30" data-testid={`UserRolesTab__category-${group.category}`}>
                <th
                  colSpan={columns.length + 1}
                  className="text-left text-xs font-medium text-muted-foreground py-1.5 pr-4"
                >
                  {tMenu(group.category)}
                </th>
              </tr>
              {group.rows.map((row) => {
                const cellsForRow = columns.map((role) => cellValue(row, role));
                const { disagree, maxRank } = resolveRowWinner(cellsForRow);
                return (
                  <tr key={row.windowId} data-testid={`UserRolesTab__row-${row.windowId}`}>
                    <td className="py-2.5 pr-4 text-foreground">{tMenu(row.name)}</td>
                    {columns.map((role, i) => {
                      const { tier, text } = cellsForRow[i];
                      const isWinner = disagree && tierRank(tier) === maxRank;
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
                        />
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
  );
}
