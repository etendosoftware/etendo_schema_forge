import { useMemo } from 'react';
import { useUI } from '@/i18n';
import { DistinctValuesFilter } from '@/components/ui/distinct-values-filter';
import { ADMIN_NAME_I18N_KEY, resolveRoleDisplayName } from '@/lib/roleNameI18n.js';

/**
 * ETP-4906 — Users LIST GRID toolbar dropdown: filters the grid by applied template
 * role, client-side, over the rows already loaded on the current page (same convention
 * as `financial-account`'s `StatementStatusFilter.jsx` → `DistinctValuesFilter`, which
 * this component wraps directly — see that file for the precedent this mirrors).
 *
 * Options = the combined roles array `useUserRoleGridData()` (`RoleChipsCell.jsx`) builds
 * from BOTH `SFSystemRoleTemplates` (the 4 composable templates, ETP-4906 Manual QA
 * Feedback Round 2 finding 2) and `SFRolesOverview` (the tenant's own client-admin row) —
 * Admin is a valid FILTER value here even though it is never a selectable template in
 * `AssignTemplateRolesControl` (see this ticket's Global Constraints: Admin is out of
 * scope for composition, but a user can still carry the classic Admin role directly and
 * admins must be findable via this filter, per `Filtro Usuarios Admin.png`).
 *
 * This component does not decide HOW a role id filters the row set — that's
 * `UserHeaderTable.jsx`'s job (it owns the selected value and applies it to `data`
 * before handing rows to `DataTable`). This is purely the dropdown UI + label
 * resolution, kept separate so it stays trivially testable.
 *
 * @param {object} props
 * @param {string|null} props.value - currently selected role id, or `null` for "all".
 * @param {(next: string|null) => void} props.onChange
 * @param {Array<{id: string, name: string, isClientAdmin?: boolean}>} props.roles -
 *   the combined template + client-admin roles array (already fetched once for the grid —
 *   see `RoleChipsCell.jsx`'s `useUserRoleGridData`, shared with the chips column so this
 *   filter never triggers its own fetch).
 * @param {string} [props['data-testid']] - caller-supplied id for the whole-control
 *   wrapper. Distinct from — and additional to — the internal, hardcoded
 *   `RoleFilterControl__filter` on the underlying `DistinctValuesFilter`, which stays
 *   unchanged. Defaults to `RoleFilterControl__toolbar` so any un-audited call site
 *   still gets a stable selector even without passing the prop.
 */
export function RoleFilterControl({ value, onChange, roles, 'data-testid': dataTestId = 'RoleFilterControl__toolbar' }) {
  const ui = useUI();

  const codes = useMemo(
    () => (roles ?? []).filter((role) => role?.id != null).map((role) => String(role.id)),
    [roles],
  );

  const labelFor = useMemo(() => {
    const byId = {};
    for (const role of roles ?? []) {
      if (role?.id == null) continue;
      byId[String(role.id)] = role.isClientAdmin
        ? ui(ADMIN_NAME_I18N_KEY)
        : resolveRoleDisplayName(ui, role.name);
    }
    return (code) => byId[code] ?? code;
  }, [roles, ui]);

  if (codes.length === 0) return null;

  return (
    <span data-testid={dataTestId}>
      <DistinctValuesFilter
        value={value}
        onChange={onChange}
        codes={codes}
        labelFor={labelFor}
        allLabel={ui('roleFilterAllRoles')}
        searchPlaceholder={ui('roleFilterSearchPlaceholder')}
        data-testid="RoleFilterControl__filter" />
    </span>
  );
}

export default RoleFilterControl;
