import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useRolesCatalog } from './RoleChipsCell.jsx';
import { RoleFilterControl } from './RoleFilterControl.jsx';

/**
 * ETP-5188 (Points 2 + 4) — Users LIST toolbar quick-filter slot.
 *
 * Rendered by `ListView.jsx`'s OWN toolbar row (immediately left of the "Filtros"
 * trigger — see `Table?.ToolbarQuickFilter` there), NOT by `UserHeaderTable`'s own
 * markup. This restores the exact toolbar position Purchase/Sales Invoice's "Todos los
 * estados" quick filter already has — without reviving the hardcoded, per-GOClient-tenant
 * `enumValues` map + `type: 'status'` column that ETP-4513 correctly removed (it broke for
 * every other tenant). `RoleFilterControl`'s dynamic, per-tenant role resolution
 * (ETP-4906) is untouched — this is a positioning + state-wiring fix, not a rewrite of the
 * picker. Full history: `docs/plans/2026-09-11-etp-5188-role-filter-open-questions.md`.
 *
 * **Why a static property instead of a decisions.json slot.** `UserHeaderTable` is a
 * plain component reference `ListView` already receives as its `Table` prop — attaching a
 * companion component as `UserHeaderTable.ToolbarQuickFilter` (see the bottom of that
 * file) lets `ListView` introspect and render it with ZERO changes to the generated page,
 * `decisions.json`, or the generator. Same convention `DetailView.jsx` already uses for
 * `formFooter.inlineInHeaderCard` — see `AssignTemplateRolesControl.inlineInHeaderCard`.
 *
 * **Fetch scope — deliberately lighter than `UserHeaderTable`'s own data.** Only
 * `useRolesCatalog()` (the two light catalog webhooks), never the heavier bulk
 * `SFUserRoleAssignments` fetch `useUserRoleGridData()` also does — this component only
 * needs the list of selectable roles to build the dropdown, not per-user assignment data.
 * See `useRolesCatalog()`'s own docstring in `RoleChipsCell.jsx` for why the two light
 * fetches are duplicated across this component and `UserHeaderTable` instead of shared
 * from one call site (no common ancestor to share it from — the page mounting both is a
 * generated file).
 *
 * **State sharing with `UserHeaderTable`.** The selected role id lives in the `role` URL
 * search param, read AND written here via `useSearchParams()` — the SAME source
 * `UserHeaderTable`'s own `filteredData` now reads live (no longer just a one-time mount
 * initializer). Both component instances render under the same Router, so a change here
 * is visible there on the very next render, with no context or prop-drilling needed.
 */
export function RoleQuickFilterToolbarSlot() {
  const { roles, loading, error } = useRolesCatalog();
  const [searchParams, setSearchParams] = useSearchParams();
  const roleFilter = searchParams.get('role');

  const handleChange = useCallback((next) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next) {
        params.set('role', next);
      } else {
        params.delete('role');
      }
      return params;
    }, { replace: true });
  }, [setSearchParams]);

  // Fail-quiet, same convention as `RoleFilterControl`'s own `codes.length === 0` guard:
  // don't show a broken/empty filter control while loading or after a fetch error.
  if (loading || error) return null;

  return (
    <RoleFilterControl
      value={roleFilter}
      onChange={handleChange}
      roles={roles}
      data-testid="RoleFilterControl__toolbar" />
  );
}

export default RoleQuickFilterToolbarSlot;
