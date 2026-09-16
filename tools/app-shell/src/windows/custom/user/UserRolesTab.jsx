import { useEffect, useMemo, useState, Fragment } from 'react';
import { TrendingUp, Package, Landmark, FileText, Info, Settings } from 'lucide-react';
import { useUI, useMenuLabel } from '@/i18n';
import { fetchRolesOverview, fetchTemplateRoles } from '@/lib/rolesApi.js';
import { fetchMenuTree } from '@/lib/menuTree.js';
import { buildMenuWindowIndex } from '@/pages/roles/useRolesOverviewData.js';
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

/**
 * ETP-5196 fallback data source only (see `resolveCategoryRow` below for the primary
 * source, `menu.json`'s own index). Walks the role-filtered raw `SFListMenu` AD_Menu
 * tree and collects one row per leaf window, with the category taken from the raw
 * classic-AD folder nesting — the SAME mechanism that caused this bug (e.g. "Product"
 * grouped under "Master Data Management" instead of "Inventory") when it was the
 * PRIMARY source. Kept only for windows `menu.json` doesn't index at all (e.g.
 * "Roles"/"Usuario" — see `resolveCategoryRow`'s JSDoc).
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

/**
 * ETP-5196 — resolves ONE active window id's category/display-name/order, preferring
 * `menu.json`'s own index (`menuIndex`, built by `buildMenuWindowIndex()` — imported
 * verbatim from `pages/roles/useRolesOverviewData.js`, the SAME function ETP-5071 built
 * for the "Configuración > Roles" overview matrix, so both matrices resolve identically
 * rather than re-implementing the logic here) over the raw AD-menu-tree walk above.
 * `menu.json` is this app's real source of truth for category/window display — the same
 * file the sidebar itself renders from.
 *
 * Returns `null` when the row must be excluded entirely: a `menuIndex` match whose own
 * `hidden` flag is `true` means EVERY `menu.json` entry for that window id is hidden
 * (e.g. Match Rule/Periods under Finance) — a window nobody can navigate to from the
 * real sidebar shouldn't appear as a row here either, matching the Roles-overview
 * page's `resolveMatrixRow` behavior exactly.
 *
 * Falls back, in order, to:
 * 1. `adTreeIndex` (this window's row from the raw `SFListMenu` AD-menu-tree walk,
 *    keyed by windowId) — for a window `menu.json` doesn't index at all, e.g. "Roles"/
 *    "Usuario" (`useRolesOverviewData.js`'s own `resolveMatrixRow` JSDoc calls this
 *    exact case out: the `roles` menu.json entry has no `windowId`/`processId`/
 *    `obuiappProcessId`, so it can never be matched by id there either).
 * 2. A generic "uncategorized" bucket, using the window's own name from
 *    `fallbackNameById` (sourced from `overviewRoles[].windows[].name`, the same data
 *    `activeWindowIds` itself is built from, so every active window id is guaranteed a
 *    name here even with zero menu data) — for a window in NEITHER `menu.json` NOR the
 *    AD tree. Must still render rather than silently vanish from the matrix, matching
 *    the "must never disappear" principle `useRolesOverviewData.js` documents for its
 *    own fallback.
 *
 * `groupOrder`/`itemOrder` (menu.json's own declaration order, used by
 * `groupResolvedRows` below) are only ever present for a `menuIndex` match — both
 * fallback paths return `null` for them, sorting after every menu.json-ordered
 * category/row while keeping their OWN relative order (see `groupResolvedRows`).
 */
function resolveCategoryRow(windowId, menuIndex, adTreeIndex, fallbackNameById, uncategorizedLabel) {
  const match = menuIndex.get(windowId);
  if (match?.hidden) return null;
  if (match) {
    return { windowId, name: match.label, category: match.group, groupOrder: match.groupOrder, itemOrder: match.itemOrder };
  }
  const treeRow = adTreeIndex.get(windowId);
  if (treeRow) {
    return { windowId, name: treeRow.name, category: treeRow.category, groupOrder: null, itemOrder: null };
  }
  return {
    windowId,
    name: fallbackNameById.get(windowId) ?? windowId,
    category: uncategorizedLabel,
    groupOrder: null,
    itemOrder: null,
  };
}

/**
 * ETP-5196 — group already-resolved rows (see `resolveCategoryRow`) by category and sort
 * both levels: a category/row carrying a `menu.json` order (`groupOrder`/`itemOrder`)
 * always sorts before one that doesn't; two ordered entries sort numerically between
 * themselves; two unordered entries (AD-tree-fallback or uncategorized) keep their
 * relative INPUT order — `Array.prototype.sort` is stable in every engine this app
 * targets, so returning `0` for that comparison preserves the caller's construction
 * order (tree-walk order for the fallback rows, matching this tab's pre-fix behavior
 * for exactly those windows) rather than reshuffling them.
 */
function groupResolvedRows(rows) {
  const categoryOrder = [];
  const rowsByCategory = new Map();
  const groupOrderByCategory = new Map();
  for (const row of rows) {
    if (!rowsByCategory.has(row.category)) {
      rowsByCategory.set(row.category, []);
      categoryOrder.push(row.category);
    }
    rowsByCategory.get(row.category).push(row);
    if (row.groupOrder != null) {
      const currentBest = groupOrderByCategory.get(row.category);
      if (currentBest == null || row.groupOrder < currentBest) {
        groupOrderByCategory.set(row.category, row.groupOrder);
      }
    }
  }

  const sortedCategories = [...categoryOrder].sort((a, b) => {
    const orderA = groupOrderByCategory.get(a);
    const orderB = groupOrderByCategory.get(b);
    if (orderA != null && orderB != null) return orderA - orderB;
    if (orderA != null) return -1;
    if (orderB != null) return 1;
    return 0;
  });

  return sortedCategories.map((category) => {
    const rowsForCategory = rowsByCategory.get(category);
    const sortedRows = [...rowsForCategory].sort((a, b) => {
      if (a.itemOrder != null && b.itemOrder != null) return a.itemOrder - b.itemOrder;
      if (a.itemOrder != null) return -1;
      if (b.itemOrder != null) return 1;
      return 0;
    });
    return { category, rows: sortedRows };
  });
}

export default function UserRolesTab({ isNew, onVisibilityChange, data }) {
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

  // Tenant-scoped roles (from `fetchRolesOverview()`), used for `activeWindowIds` below
  // AND (ETP-5071) for the admin-holder check right below it — see the file-level
  // JSDoc's "Two role sources" note.
  const overviewRoles = useMemo(
    () => (Array.isArray(rolesOverview?.roles) ? rolesOverview.roles : []),
    [rolesOverview],
  );

  // ETP-5071 — once a user is promoted to the client's Admin role (ETP-5019,
  // `SFPromoteUserRole`), this tab's composed-roles matrix (driven by
  // `selectedRoleIds`, the PRE-promotion template selection) is stale/misleading: the
  // user actually has full access to everything now. Same detection expression
  // `AssignTemplateRolesControl.jsx` already uses (`adminRoleId` from the
  // `isClientAdmin` row vs. `data.defaultRole`) — reused here from the SAME
  // `overviewRoles` this component already fetches for `activeWindowIds` above, so this
  // adds zero new network calls (no need for a second `fetchRolesOverview()` call, the
  // "each consumer fetches it itself" tradeoff `roleSelectionContext.js` documents does
  // not apply when the data is already sitting in this component's own state).
  const adminRole = useMemo(
    () => overviewRoles.find((role) => role?.isClientAdmin === true) ?? null,
    [overviewRoles],
  );
  const adminRoleId = adminRole?.id != null ? String(adminRole.id) : null;
  const currentDefaultRoleId = resolveDefaultRoleId(data);
  const isAdminRoleHolder = !!(adminRoleId && currentDefaultRoleId && currentDefaultRoleId === adminRoleId);

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

  // ETP-5196 — `menu.json`'s own windowId -> {group, label, groupOrder, itemOrder,
  // hidden} index (see `resolveCategoryRow`'s JSDoc above), the SAME function
  // ETP-5071 built for the Roles-overview matrix, imported rather than
  // re-implemented. Static per mount (`menu.json` is a build-time import), so this
  // never needs to recompute on re-render.
  const menuIndex = useMemo(() => buildMenuWindowIndex(), []);

  // ETP-5196 fallback source only — one row per leaf window from the raw
  // `SFListMenu` AD-menu-tree walk, keyed by windowId (first-seen wins on a
  // duplicate id, matching `flattenWindowRows`'s own pre-existing traversal order).
  // Consulted by `resolveCategoryRow` only for a window `menuIndex` doesn't cover.
  const adTreeIndex = useMemo(() => {
    const rows = flattenWindowRows(menuTreeData?.tree, null, []);
    const map = new Map();
    for (const row of rows) {
      if (!map.has(row.windowId)) map.set(row.windowId, row);
    }
    return map;
  }, [menuTreeData]);

  // ETP-5196 last-resort name fallback — every active window id is guaranteed a name
  // here regardless of menu data, since `activeWindowIds` itself is built from this
  // same `overviewRoles[].windows[]` data (see `activeWindowIds` above). Only reached
  // by `resolveCategoryRow` for a window absent from BOTH `menuIndex` and the AD tree.
  const windowNameById = useMemo(() => {
    const map = new Map();
    for (const role of overviewRoles) {
      for (const w of role.windows ?? []) {
        if (w?.id != null && w?.name != null) {
          const id = String(w.id);
          if (!map.has(id)) map.set(id, w.name);
        }
      }
    }
    return map;
  }, [overviewRoles]);

  const categoryGroups = useMemo(() => {
    // Iterate in the AD-tree's OWN traversal order first (filtered to active window
    // ids) so that any row falling back to the tree (no `menuIndex` match) keeps its
    // pre-fix relative order via `groupResolvedRows`'s stable-sort tie-break — then
    // append any active window id absent from the tree entirely (the
    // fully-uncategorized case), in no particular guaranteed order since none existed
    // for them before this fix either.
    const treeOrderedIds = flattenWindowRows(menuTreeData?.tree, null, [])
      .map((row) => row.windowId)
      .filter((windowId) => activeWindowIds.has(windowId));
    const coveredIds = new Set(treeOrderedIds);
    const remainingIds = [...activeWindowIds].filter((windowId) => !coveredIds.has(windowId));

    const uncategorizedLabel = ui('userRolesTabUncategorizedCategory');
    const resolvedRows = [...treeOrderedIds, ...remainingIds]
      .map((windowId) => resolveCategoryRow(windowId, menuIndex, adTreeIndex, windowNameById, uncategorizedLabel))
      .filter((row) => row !== null);

    // Drop any category left with zero surviving rows — must not render an empty
    // category header with nothing under it.
    return groupResolvedRows(resolvedRows).filter((group) => group.rows.length > 0);
  }, [menuTreeData, activeWindowIds, menuIndex, adTreeIndex, windowNameById, ui]);

  // ETP-5196 — for a confirmed admin holder, the matrix's sole column is the admin role
  // itself (`adminRole` already has the exact shape a column needs: `{ id, name,
  // isClientAdmin: true, windows }`), not the composed template-role selection — that
  // selection reflects the PRE-promotion state and is not what the admin actually has
  // access to. See `isAdminRoleHolder` above for why this is `false` (falls through,
  // unaffected) for the entire loading window and after a failed fetch.
  const columns = useMemo(() => {
    if (isAdminRoleHolder) return adminRole ? [adminRole] : [];
    const selected = new Set((selectedRoleIds ?? []).map(String));
    // SFSystemRoleTemplates never returns a client-admin row (there is none at system
    // level), so no `!role.isClientAdmin` guard is needed here anymore — every entry in
    // `allTemplateRoles` is already a composable template by construction.
    return allTemplateRoles.filter((role) => selected.has(String(role.id)));
  }, [isAdminRoleHolder, adminRole, allTemplateRoles, selectedRoleIds]);

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

  // ETP-5071 (revised ETP-5196) — computed right after `isNew` and before `loading`/`error`
  // below: unlike `columns` (derived from `templateRoles`, gated by the fetch),
  // `isAdminRoleHolder` only ever flips from `false` to `true` as `overviewRoles` fills in —
  // it is `false` (falls through, unaffected) for the entire in-flight fetch AND on a failed
  // one (`overviewRoles` stays `[]` forever after a rejected fetch, same as `templateRoles`
  // staying `null`), so computing it here never masks the loading/error branches the way
  // checking `columns.length === 0` first would (see that comment below). ETP-5196: once the
  // user IS a confirmed admin holder, this no longer short-circuits the render — the matrix
  // itself now shows a single admin column (via `columns` above) built from `adminRole`
  // rather than the stale pre-promotion `selectedRoleIds`, so it is safe to show alongside
  // this informative message rather than hiding it. `adminFullAccessMessage` is rendered as
  // a sibling above the table further down, after falling through the loading/error/empty
  // checks below exactly like a standard user's render path.
  const adminFullAccessMessage = isAdminRoleHolder ? (
    <div
      className="flex items-center justify-center py-12 text-center text-sm text-muted-foreground"
      data-testid="UserRolesTab__admin-full-access"
    >
      {ui('userRolesTabAdminFullAccessMessage')}
    </div>
  ) : null;

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
                      <td className="py-2.5 pr-4 text-foreground">{tMenu(row.name)}</td>
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
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
