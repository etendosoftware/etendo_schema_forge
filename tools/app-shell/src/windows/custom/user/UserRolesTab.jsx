import { useEffect, useMemo, useState, Fragment } from 'react';
import { useUI, useMenuLabel } from '@/i18n';
import { fetchRolesOverview, fetchTemplateRoles } from '@/lib/rolesApi.js';
import { fetchMenuTree } from '@/lib/menuTree.js';
import { resolveRoleDisplayName } from '@/lib/roleNameI18n.js';
import { useRoleSelection } from './roleSelectionContext.js';

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

  // Never render (nor even show the tab strip entry for) an in-progress user creation —
  // SFAssignUserRoles requires an existing AD_User_ID (see the plan's Global Constraints:
  // "Never attempt SFAssignUserRoles before an AD_User_ID exists"). DetailView defaults every
  // tab-placement custom component to visible until it explicitly reports otherwise.
  useEffect(() => {
    onVisibilityChange?.(!isNew);
  }, [isNew, onVisibilityChange]);

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

  if (isNew) {
    return null;
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

  const cellValue = (row, role) => {
    const windowEntry = (role.windows ?? []).find((w) => String(w.id) === row.windowId);
    if (!windowEntry) return '—';
    return windowEntry.tier === 'full' ? '✓' : ui('accessTierReadOnly');
  };

  return (
    <div className="overflow-x-auto" data-testid="UserRolesTab">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/50">
            <th className="text-left text-sm font-semibold text-foreground py-2.5 pr-4">
              {ui('userRolesTabWindowColumn')}
            </th>
            {columns.map((role) => (
              <th key={role.id} className="text-center text-sm font-semibold text-foreground py-2.5 px-3">
                {resolveRoleDisplayName(ui, role.name)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          <Fragment key="general">
            <tr className="bg-muted/30">
              <th
                colSpan={columns.length + 1}
                className="text-left text-xs font-semibold uppercase text-muted-foreground py-1.5 pr-4"
              >
                {ui('userRolesTabGeneralCategory')}
              </th>
            </tr>
            {GENERAL_ROWS.map((row) => (
              <tr key={row.key} data-testid={`UserRolesTab__row-${row.key}`}>
                <td className="py-2.5 pr-4 text-foreground">{ui(row.labelKey)}</td>
                {columns.map((role) => (
                  <td key={role.id} className="py-2.5 px-3 text-center text-foreground">
                    {'✓'}
                  </td>
                ))}
              </tr>
            ))}
          </Fragment>
          {categoryGroups.map((group) => (
            <Fragment key={group.category}>
              <tr className="bg-muted/30">
                <th
                  colSpan={columns.length + 1}
                  className="text-left text-xs font-semibold uppercase text-muted-foreground py-1.5 pr-4"
                >
                  {tMenu(group.category)}
                </th>
              </tr>
              {group.rows.map((row) => (
                <tr key={row.windowId} data-testid={`UserRolesTab__row-${row.windowId}`}>
                  <td className="py-2.5 pr-4 text-foreground">{tMenu(row.name)}</td>
                  {columns.map((role) => (
                    <td key={role.id} className="py-2.5 px-3 text-center text-foreground">
                      {cellValue(row, role)}
                    </td>
                  ))}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
