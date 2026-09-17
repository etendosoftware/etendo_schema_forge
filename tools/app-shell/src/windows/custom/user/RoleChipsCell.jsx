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

/**
 * ETP-5188 (Point 5) — sentinel value for the "Sin rol" quick-filter option. Not a real
 * role id (never sent to the backend as one) — only ever produced by
 * `RoleQuickFilterToolbarSlot.jsx`'s option list and interpreted by
 * `UserHeaderTable.jsx`'s `filteredData` via `hasNoRole()` below.
 */
export const NO_ROLE_FILTER_VALUE = '__no_role__';

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
 * ETP-5188 (Point 5) — true when `row` counts as "Sin rol": NOT the client-admin AND zero
 * entries in the bulk `assignments` map for its user id. Mirrors, in a reusable predicate,
 * the exact same two branches `RoleChipsCell`'s own render below already checks (admin
 * branch first, then the assignments lookup) — kept in sync deliberately, since both read
 * the same underlying "does this user have a role" concept.
 *
 * @param {object} row
 * @param {{adminRoleId: string|null, assignments: Record<string, string[]>}} ctx
 */
export function hasNoRole(row, { adminRoleId, assignments }) {
  const defaultRoleId = resolveDefaultRoleId(row);
  if (adminRoleId && defaultRoleId === adminRoleId) return false;
  const userId = resolveUserId(row);
  const applied = userId ? assignments?.[userId] : null;
  return !Array.isArray(applied) || applied.length === 0;
}

/**
 * ETP-5188 (Item 3) — builds the `enumLabels` catalog for the advanced-filter "Rol"
 * field (`UserHeaderTable.jsx`'s `roleFilterColumn`) from the SAME merged roles index
 * (`rolesById`, from `useUserRoleGridData()`/`useRolesCatalog()`'s `buildRolesIndex()`
 * below) the grid's own chip renderer and the quick-filter dropdown already use — one
 * role catalog, one id space, three surfaces (grid chips, quick filter, advanced
 * filter). `NO_ROLE_FILTER_VALUE` is added first, same ordering rationale as
 * `RoleFilterControl`'s own "Sin rol" placement.
 *
 * @param {Record<string, object>} rolesById
 * @param {(key: string) => string} ui
 * @returns {Record<string, string>}
 */
export function buildRoleEnumLabels(rolesById, ui) {
  const enumLabels = { [NO_ROLE_FILTER_VALUE]: ui('noRole') };
  for (const role of Object.values(rolesById ?? {})) {
    if (role?.id == null) continue;
    enumLabels[String(role.id)] = role.isClientAdmin
      ? ui(ADMIN_NAME_I18N_KEY)
      : resolveRoleDisplayName(ui, role.name);
  }
  return enumLabels;
}

/**
 * ETP-5188 (Item 3) — translates an applied "Rol" advanced-filter condition into
 * the backend's dedicated `RoleIds=`/`NoRole=`/`RoleFilterNegate=` query params
 * instead of a generic `criteria=` entry. Assigned as `roleFilterColumn.
 * toQueryParams` in `UserHeaderTable.jsx`; `ListView.jsx`'s
 * `extractQueryParamConditions` (see `gridQuery.js`) strips this field's
 * condition out of the criteria array UNCONDITIONALLY (regardless of what this
 * function returns), before it can ever reach `buildAdvancedFilterCriteria` — a
 * naive `criteria=` entry against the underlying N:M role-assignment collection
 * 500s (confirmed live against this environment's own NEO Headless; see
 * `docs/plans/2026-09-11-etp-5188-role-filter-open-questions.md`).
 *
 * **All 4 operators offered by `enumLabel` mode are translated** (`equals`,
 * `notEqual`, `isNull`, `isNotNull` — see `OPERATORS_BY_MODE.enumLabel` in the
 * published `AdvancedFilterBuilder.jsx`), all reusing the same two backend
 * predicates plus one boolean negation flag the backend adds:
 *   - `equals` ("Es") — selected ids → `RoleIds=`, the `NO_ROLE_FILTER_VALUE`
 *     sentinel → `NoRole=true`, OR'd (both combinable in one request). No
 *     `RoleFilterNegate`.
 *   - `notEqual` ("No es") — the SAME `RoleIds=`/`NoRole=` construction as
 *     `equals` (same selected ids — `DistinctEnumPicker`'s checkbox popover
 *     produces an array of ticked codes for both operators identically) PLUS
 *     `RoleFilterNegate=true`: "this user has NONE of the selected roles."
 *   - `isNull` ("Está vacío") — equivalent to the existing "Sin rol" case:
 *     `NoRole=true` alone, no `RoleIds=`, no `RoleFilterNegate`. This operator
 *     renders no `ValueInput` at all (`showValue` in `AdvancedFilterBuilder.jsx`
 *     is `false` for any op in `NULLISH_OPS`), and `updateRow` there resets
 *     `row.value` to `null` on switching to it (`emptyValueForShape('nullish')`)
 *     — so this branch MUST NOT (and does not) read `row.value`.
 *   - `isNotNull` ("No está vacío") — `NoRole=true` PLUS `RoleFilterNegate=true`:
 *     "this user has some role, whichever it is."
 *
 * @param {{ operator: string, value: unknown }} row
 * @returns {string|null}
 */
export function buildRoleFilterQueryParams(row) {
  const operator = row?.operator;
  if (operator === 'isNull') return 'NoRole=true';
  if (operator === 'isNotNull') return 'NoRole=true&RoleFilterNegate=true';
  if (operator !== 'equals' && operator !== 'notEqual') return null;

  const raw = Array.isArray(row.value) ? row.value : (row.value ? [row.value] : []);
  const ids = raw.map(String).filter(Boolean);
  if (ids.length === 0) return null;
  const roleIds = ids.filter((id) => id !== NO_ROLE_FILTER_VALUE);
  const noRole = ids.includes(NO_ROLE_FILTER_VALUE);
  const segments = [];
  if (roleIds.length > 0) segments.push(`RoleIds=${encodeURIComponent(roleIds.join(','))}`);
  if (noRole) segments.push('NoRole=true');
  if (operator === 'notEqual') segments.push('RoleFilterNegate=true');
  return segments.length > 0 ? segments.join('&') : null;
}

/**
 * Merges the 4 system-level role templates with the tenant's own client-admin role (if
 * any) into the combined roles array both `useUserRoleGridData()` and `useRolesCatalog()`
 * need — see either hook's own docstring for why both sources are required. Pure, no
 * fetch — extracted so the merge rule has exactly one implementation.
 */
function mergeRolesCatalog(templateRoles, overviewRoles) {
  const adminRole = (overviewRoles ?? []).find((role) => role?.isClientAdmin === true) ?? null;
  return adminRole ? [...(templateRoles ?? []), adminRole] : (templateRoles ?? []);
}

/** `{ rolesById, adminRoleId }` derived from a combined roles array. Pure, no fetch. */
function buildRolesIndex(roles) {
  const rolesById = {};
  for (const role of roles) {
    if (role?.id != null) rolesById[String(role.id)] = role;
  }
  const admin = roles.find((role) => role?.isClientAdmin);
  const adminRoleId = admin?.id != null ? String(admin.id) : null;
  return { rolesById, adminRoleId };
}

/**
 * ETP-5188 — lightweight twin of `useUserRoleGridData()` below, for callers that only
 * need the SELECTABLE roles list (id/name/isClientAdmin) and not the heavier bulk
 * `SFUserRoleAssignments` map. Used by `RoleQuickFilterToolbarSlot.jsx`, which renders in
 * `ListView`'s own toolbar row — a separate component instance from `UserHeaderTable`
 * (which still calls the full `useUserRoleGridData()` for chip rendering / row
 * filtering), with no common ancestor to share one fetch from (the page that mounts both
 * is a generated file — see the Generated Files Policy — so no shared provider can be
 * introduced there this round). This deliberately duplicates only the two LIGHT catalog
 * fetches (`fetchTemplateRoles`/`fetchRolesOverview`), never the heavy bulk assignments
 * fetch, which stays exclusive to `useUserRoleGridData()`.
 *
 * @returns {{
 *   roles: Array<{id: string, name: string, isClientAdmin?: boolean}>,
 *   rolesById: Record<string, object>,
 *   adminRoleId: string|null,
 *   loading: boolean,
 *   error: Error|null,
 * }}
 */
export function useRolesCatalog() {
  const [state, setState] = useState({ roles: [], loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchTemplateRoles(), fetchRolesOverview()])
      .then(([templateRolesResult, overviewResult]) => {
        if (cancelled) return;
        const templateRoles = Array.isArray(templateRolesResult?.roles) ? templateRolesResult.roles : [];
        const overviewRoles = Array.isArray(overviewResult?.roles) ? overviewResult.roles : [];
        setState({ roles: mergeRolesCatalog(templateRoles, overviewRoles), loading: false, error: null });
      })
      .catch((error) => {
        if (cancelled) return;
        setState((prev) => ({ ...prev, loading: false, error }));
      });
    return () => { cancelled = true; };
  }, []);

  const { rolesById, adminRoleId } = useMemo(() => buildRolesIndex(state.roles), [state.roles]);

  return { ...state, rolesById, adminRoleId };
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
        setState({
          roles: mergeRolesCatalog(templateRoles, overviewRoles),
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

  const { rolesById, adminRoleId } = useMemo(() => buildRolesIndex(state.roles), [state.roles]);

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
 * @param {string} [props['data-testid']] - caller-supplied id for the whole-cell
 *   wrapper, stable across every branch below (loading/admin/empty/chips). Distinct
 *   from — and additional to — each branch's own internal, hardcoded testid
 *   (`RoleChipsCell__skeleton`/`__admin`/`__empty`/`__chips`), which stays unchanged so
 *   existing per-state assertions keep working. Defaults to `RoleChipsCell__cell` so any
 *   un-audited call site still gets a stable selector even without passing the prop.
 */
export default function RoleChipsCell({
  row, rolesById, adminRoleId, assignments, loading,
  'data-testid': dataTestId = 'RoleChipsCell__cell',
}) {
  const ui = useUI();

  if (loading) {
    return (
      <span data-testid={dataTestId}>
        <Skeleton className="h-6 w-20" data-testid="RoleChipsCell__skeleton" />
      </span>
    );
  }

  const defaultRoleId = resolveDefaultRoleId(row);

  // Admin branch FIRST — see the file-level docstring above. Never falls through to
  // the assignments lookup for a classic-Admin user, which would otherwise render an
  // empty/dash cell (the bulk map has no entry for them at all).
  if (adminRoleId && defaultRoleId && defaultRoleId === adminRoleId) {
    return (
      <span data-testid={dataTestId}>
        <span className="inline-flex items-center gap-1.5" data-testid="RoleChipsCell__admin">
          <RoleChip data-testid="RoleChip__admin-badge">{ui(ADMIN_NAME_I18N_KEY)}</RoleChip>
        </span>
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
    return (
      <span data-testid={dataTestId}>
        <span className="text-muted-foreground" data-testid="RoleChipsCell__empty">—</span>
      </span>
    );
  }

  const shown = roleChips.slice(0, MAX_CHIPS);
  const extra = roleChips.length - shown.length;

  return (
    <span data-testid={dataTestId}>
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
    </span>
  );
}
