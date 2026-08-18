import { useEffect, useMemo, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useUI } from '@/i18n';
import { fetchRolesOverview, fetchTemplateRoles } from '@/lib/rolesApi.js';
import { fetchUserRoleAssignments } from '@/lib/userRoleAssignmentsApi.js';
import { ADMIN_NAME_I18N_KEY, resolveRoleDisplayName } from '@/lib/roleNameI18n.js';

/**
 * ETP-4906 — Users LIST GRID "Rol" column renderer (a separate surface from the
 * DETAIL FORM's read-only `defaultRole` badge — see `AssignTemplateRolesControl`'s own
 * decisions.json note; don't conflate the two).
 *
 * Resolves each row's composed template roles from the bulk
 * `fetchUserRoleAssignments()` map (ETP-4906, `SFUserRoleAssignments` bulk mode) and
 * renders them as chips, `+N` overflow beyond `MAX_CHIPS` (mirrors
 * `DimensionsPanel.jsx`'s `DimBadge`/`DimSummary` "+N" convention).
 *
 * **Admin branch (read this before touching the render logic below).** A classic-Admin
 * user's `defaultRole` (already a plain field on every grid row) IS the client-admin
 * role itself — NOT a "Personal – X" composition role created by
 * `UserRoleCompositionService`. Such a user therefore has ZERO entries in the bulk
 * `assignments` map: `getAppliedTemplateRoleIdsForClient` only walks
 * `AD_Role_Inheritance` off a user's *personal* role, and an Admin user never has one.
 * Falling straight through to the `assignments` lookup would render an empty/dash cell
 * for every Admin user. The check below runs FIRST, before consulting `assignments` at
 * all, comparing the row's own `defaultRole` id against `SFRolesOverview`'s
 * `roles[].isClientAdmin === true` entry's id (resolved once by `useUserRoleGridData`
 * below, not per row).
 *
 * **Fetch ownership.** `useUserRoleGridData()` is the ONE fetch site for the whole grid
 * page — it is called once by the `headerTable` wrapper (`UserHeaderTable.jsx`), which
 * then hands the resolved `rolesById`/`adminRoleId`/`assignments` down to every
 * `RoleChipsCell` instance as plain props. `RoleChipsCell` itself never calls
 * `fetchUserRoleAssignments`/`fetchRolesOverview` per row — that would refire the
 * bulk webhooks once per visible row, exactly what this task's "ONCE for the whole grid
 * page, not per-row" requirement forbids. Exporting the hook from this file (rather
 * than from `UserHeaderTable.jsx`) keeps the cell renderer and its one data source
 * colocated, while the actual call site stays singular by construction.
 */

const MAX_CHIPS = 2;

/** `row.id` as a plain string, matching the bulk `assignments` map's string keys. */
export function resolveUserId(row) {
  const id = row?.id;
  return id == null || id === '' ? null : String(id);
}

/**
 * `row.defaultRole` as a plain id string. NEO list rows carry FK fields as a raw id
 * plus a `${key}$_identifier` companion (see `resolveIdentifier.js`); mock/legacy data
 * may still hand over `{ id, name }` objects (same shape `AssignRoleControl.jsx`'s own
 * `resolveId` already defends against) — handled here too, defensively.
 */
export function resolveDefaultRoleId(row) {
  const value = row?.defaultRole;
  if (value == null || value === '') return null;
  if (typeof value === 'object') {
    const id = value.id ?? value.value ?? null;
    return id == null || id === '' ? null : String(id);
  }
  return String(value);
}

/**
 * Fetches the roles catalog and the bulk `SFUserRoleAssignments` (applied template roles
 * per user) once, in parallel. Intended to be called exactly once per grid page, by the
 * `headerTable` wrapper.
 *
 * **Two role sources, combined (ETP-4906 Manual QA Feedback Round 2, finding 2).** The
 * catalog needs BOTH: `fetchTemplateRoles()` (`SFSystemRoleTemplates`) for the 4 fixed
 * template names — chips/filter options for NEW compositions carry system-level role ids
 * going forward, and this endpoint is the only one that still resolves those names once a
 * tenant deactivates its own per-client copies — and `fetchRolesOverview()`
 * (`SFRolesOverview`), kept ONLY for its client-admin row: classic Admin is explicitly
 * client-level per this ticket's own architecture (never a system-level template), and this
 * grid's Admin-detection branch (`adminRoleId` below) must stay tenant-scoped. The combined
 * `roles` array is the 4 templates plus (if present) the tenant's own client-admin role.
 *
 * @returns {{
 *   roles: Array<{id: string, name: string, isClientAdmin?: boolean}>,
 *   rolesById: Record<string, object>,
 *   adminRoleId: string|null,
 *   assignments: Record<string, string[]>,
 *   loading: boolean,
 *   error: Error|null,
 * }}
 */
export function useUserRoleGridData() {
  const [state, setState] = useState({ roles: [], assignments: {}, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchTemplateRoles(), fetchRolesOverview(), fetchUserRoleAssignments()])
      .then(([templateRolesResult, overviewResult, assignmentsResult]) => {
        if (cancelled) return;
        const templateRoles = Array.isArray(templateRolesResult?.roles) ? templateRolesResult.roles : [];
        const overviewRoles = Array.isArray(overviewResult?.roles) ? overviewResult.roles : [];
        const adminRole = overviewRoles.find((role) => role?.isClientAdmin === true) ?? null;
        setState({
          roles: adminRole ? [...templateRoles, adminRole] : templateRoles,
          assignments: assignmentsResult?.assignments ?? {},
          loading: false,
          error: null,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setState((prev) => ({ ...prev, loading: false, error }));
      });
    return () => { cancelled = true; };
  }, []);

  const rolesById = useMemo(() => {
    const map = {};
    for (const role of state.roles) {
      if (role?.id != null) map[String(role.id)] = role;
    }
    return map;
  }, [state.roles]);

  const adminRoleId = useMemo(() => {
    const admin = state.roles.find((role) => role?.isClientAdmin);
    return admin?.id != null ? String(admin.id) : null;
  }, [state.roles]);

  return { ...state, rolesById, adminRoleId };
}

function RoleChip({ children, 'data-testid': dataTestId = 'RoleChipsCell__chip' }) {
  return (
    <span
      className="inline-flex items-center px-2 py-1 rounded-lg bg-[hsl(var(--muted))] text-sm leading-5 whitespace-nowrap max-w-full truncate"
      data-testid={dataTestId}>
      {children}
    </span>
  );
}

/**
 * @param {object} props
 * @param {object} props.row - the grid row (a plain `user` record).
 * @param {Record<string, object>} props.rolesById - from `useUserRoleGridData()`.
 * @param {string|null} props.adminRoleId - from `useUserRoleGridData()`.
 * @param {Record<string, string[]>} props.assignments - from `useUserRoleGridData()`.
 * @param {boolean} [props.loading] - from `useUserRoleGridData()`; renders a skeleton
 *   while the bulk fetch is in flight instead of a premature empty/dash cell.
 */
export default function RoleChipsCell({ row, rolesById, adminRoleId, assignments, loading }) {
  const ui = useUI();

  if (loading) {
    return <Skeleton className="h-6 w-20" data-testid="RoleChipsCell__skeleton" />;
  }

  const defaultRoleId = resolveDefaultRoleId(row);

  // Admin branch FIRST — see the file-level docstring above. Never falls through to
  // the assignments lookup for a classic-Admin user, which would otherwise render an
  // empty/dash cell (the bulk map has no entry for them at all).
  if (adminRoleId && defaultRoleId && defaultRoleId === adminRoleId) {
    return (
      <span className="inline-flex items-center gap-1.5" data-testid="RoleChipsCell__admin">
        <RoleChip data-testid="RoleChip__admin-badge">{ui(ADMIN_NAME_I18N_KEY)}</RoleChip>
      </span>
    );
  }

  const userId = resolveUserId(row);
  const appliedIds = userId ? (assignments?.[userId] ?? []) : [];
  const roleChips = appliedIds
    .map((id) => rolesById?.[String(id)])
    .filter(Boolean)
    .map((role) => ({
      id: role.id,
      label: role.isClientAdmin ? ui(ADMIN_NAME_I18N_KEY) : resolveRoleDisplayName(ui, role.name),
    }));

  if (roleChips.length === 0) {
    return <span className="text-muted-foreground" data-testid="RoleChipsCell__empty">—</span>;
  }

  const shown = roleChips.slice(0, MAX_CHIPS);
  const extra = roleChips.length - shown.length;

  return (
    <span className="inline-flex items-center gap-1.5 max-w-full" data-testid="RoleChipsCell__chips">
      {shown.map(({ id, label }) => (
        <RoleChip key={id} data-testid={`RoleChip__${id}`}>{label}</RoleChip>
      ))}
      {extra > 0 && (
        <span
          className="px-2 py-1 rounded-lg bg-[hsl(var(--muted))] text-sm leading-5 font-medium text-[hsl(var(--muted-foreground))]"
          data-testid="RoleChipsCell__overflow">
          +{extra}
        </span>
      )}
    </span>
  );
}
