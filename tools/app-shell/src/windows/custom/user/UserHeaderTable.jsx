import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DataTable } from '@/components/contract-ui';
import { useUI, useLocaleSwitch } from '@/i18n';
import RoleChipsCell, {
  NO_ROLE_FILTER_VALUE, buildRoleEnumLabels, buildRoleFilterQueryParams,
  hasNoRole, resolveDefaultRoleId, resolveUserId, useUserRoleGridData,
} from './RoleChipsCell.jsx';
import { RoleQuickFilterToolbarSlot } from './RoleQuickFilterToolbarSlot.jsx';
import { useUserDebugMode } from './useUserDebugMode.js';
import UserDebugPanel from './UserDebugPanel.jsx';
import PendingInvitationPill from './PendingInvitationPill.jsx';

/* eslint-disable react/prop-types */

/**
 * ETP-4906 — Users LIST GRID `headerTable` override (`window.customComponents.headerTable`
 * in `artifacts/user/decisions.json`).
 *
 * **Why this file exists at all.** The generated `UserTable.jsx` renders every grid
 * column straight off the resolved contract (`type: 'selector'` for `defaultRole`,
 * resolved via `resolveIdentifier()`), and the standard `DataTable` never reads a
 * per-field `cellType` for the plain generated-table path (see
 * `docs/decisions-reference.md` → "Cell renderers (`cellType`) — three paths, not
 * one": only a `customComponents.headerTable` slot or a `list-modal` layout can resolve
 * a named custom cell against a window-scoped registry). Swapping in `RoleChipsCell`
 * for the "Rol" column therefore requires taking over the master list table entirely —
 * this component does that, following the exact precedent of `sales-invoice`'s
 * `InvoiceHeaderTable` / `purchase-invoice`'s `PurchaseInvoiceHeaderTable`: declare the
 * full column list by hand (unchanged for every column except `defaultRole`) and hand
 * it to the same generic `DataTable`, spreading every other prop straight through so
 * pagination/sort/selection/bulk-delete/etc. behave exactly as before.
 *
 * The `defaultRole` field's DETAIL FORM read-only badge (`AssignTemplateRolesControl`'s
 * sibling surface) is untouched by this file — see that component's own decisions.json
 * note on the two being separate surfaces on the same underlying field.
 *
 * **Column list mirrors the generated `UserTable.jsx` verbatim** (see
 * `artifacts/user/generated/web/user/UserTable.jsx`'s `@sf-generated-start
 * columns:user` block) for every column except `defaultRole` and `invitationStatus`
 * (see below) — same `key`/`column`/`type`/`required`, so headers, AD-dictionary
 * label resolution and the advanced-filter builder behave identically. No `label:`
 * literal is declared here for those columns — `DataTable`'s own header resolution
 * (`t(col.column) ?? col.label ?? col.key`) always resolves them through the native AD
 * dictionary lookup (`t(col.column)`) before ever falling back to `col.label`, so a
 * hardcoded literal here would be dead fallback text that the `sfqg` i18n check flags
 * regardless of whether it renders. Re-verify this list against that file whenever
 * `artifacts/user/decisions.json`'s `user` entity's grid fields change.
 *
 * **ETP-5198 — `businessPartner` ("Contacto") and `locked` ("Bloqueado") removed.**
 * Neither field is editable from the grid, so both were dropped from `decisions.json`
 * (`grid: false`) — but since this window's grid is fully taken over by this hand-written
 * component, the generated `UserTable.jsx`'s own column list is NOT what actually renders
 * (or feeds `DataTable`'s `onColumnsReady` → `ListView`'s advanced-filter column list) —
 * this file's own `columns` array had to be hand-synced to drop the same two entries,
 * same precedent as the DEV wave 12 `firstName`/`lastName` re-sync documented in
 * `docs/generated-custom-windows/user.md`. Both fields remain on the detail form.
 *
 * **`invitationStatus` (ETP-4830 scope addition) has no generated-table equivalent at
 * all** — it is not an `AD_User` column, just a backend-contract-only field NEO adds
 * to every `user` GET response (list rows included), so there is nothing for
 * `generate-frontend.js` to ever emit for it. It renders the exact same
 * `PendingInvitationPill` (`./PendingInvitationPill.jsx`) already shown in the detail
 * form's toolbar — extracted into its own file specifically so this grid column and
 * that toolbar pill share ONE status→style mapping instead of two. Declared via
 * `invitationColumn` below (not the static `columns` array), because building its
 * `label` needs the `ui()` hook, which — unlike the columns above, which never call
 * `ui()` for their headers — is only available inside the component render, not at
 * module scope.
 *
 * **`isOwner` (ETP-4830 item #4) is NOT a grid column at all** — human call, after first
 * shipping one: at most ONE user per client is ever flagged owner, so a whole column was
 * disproportionate space for something that rare. Instead it renders as a small inline pill
 * on the `name` cell, via `renderDefaultCell`'s existing `col.pill` mechanism
 * (`DataTable.cellRenderers.jsx` — `{ when(row), label, className? }`, already built and
 * tested for exactly "badge on the first visible string column", so no new render function
 * was needed). See `nameColumnWithOwnerPill` below. The detail header keeps its own separate
 * `OwnerBadge` (`./OwnerBadge.jsx`) — that surface has room for a real pill, unlike a grid row.
 */
const columns = [
  { key: 'name', column: 'Name', type: 'string', required: true },
  { key: 'email', column: 'Email', type: 'string', required: true },
  // ETP-4830 — 'Activo' column (reference screenshot). `toggle: true` mirrors what
  // generate-frontend.js emits for `inlineToggle: true` on this field in
  // decisions.json (see artifacts/user/generated/web/user/UserTable.jsx's own
  // `active` column, which this custom headerTable would otherwise shadow) — the
  // generic `DataTable`/`renderBooleanCell` picks up `col.toggle` and renders an
  // inline `Switch` that PATCHes `user/{id}` with `{ active: checked }` on change,
  // no custom render function needed here.
  { key: 'active', column: 'IsActive', type: 'boolean', toggle: true, required: true },
];

const filters = ['name', 'email'];

export default function UserHeaderTable(props) {
  const { rolesById, adminRoleId, assignments, loading } = useUserRoleGridData();
  const [searchParams] = useSearchParams();
  // ETP-4999 / ETP-5188 — a role summary card on the Roles overview page
  // (`RoleSummaryCard.jsx`) links here as `/user?role=<id>`, and the quick-filter
  // dropdown itself now lives in `ListView`'s own toolbar row (rendered separately, via
  // `UserHeaderTable.ToolbarQuickFilter` — see `RoleQuickFilterToolbarSlot.jsx`), not in
  // this component's own markup any more. The `role` URL param is the single shared
  // source of truth between the two component instances — read LIVE here (not just as a
  // one-time mount initializer), so a change made in the toolbar slot is reflected in
  // this filter on the very next render.
  const roleFilter = searchParams.get('role');
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  // ETP-4830 (item #4) — dev/QA-only debug panel, activated by typing `debuguser` anywhere in
  // the app. Mounted on the Users LIST page specifically (not the detail page alone) so it's
  // reachable without already knowing a specific user's route — see useUserDebugMode.js/
  // UserDebugPanel.jsx for the full mechanism.
  const userDebugModeActive = useUserDebugMode();

  // ETP-4906 Round 4 — `t('Default_Ad_Role_ID')` (the shared native AD dictionary
  // entry) always wins over this column's own `label` in `DataTable`'s header
  // resolution (`t(col.column) ?? col.label ?? col.key`), so the grid header still
  // read "Default Role"/"Rol por Defecto" even after the chip-render swap above.
  // Do NOT edit the shared dictionary entry — other windows/contexts reference that
  // same native column. Scope the override to just THIS grid via `labelOverrides`
  // instead, merging with anything the generated page already passes down.
  const labelOverrides = useMemo(() => {
    const incoming = props.labelOverrides ?? {};
    return {
      ...incoming,
      [locale]: {
        ...incoming[locale],
        Default_Ad_Role_ID: ui('usersGridRolesColumn'),
      },
    };
  }, [props.labelOverrides, locale, ui]);

  const roleColumn = useMemo(() => ({
    key: 'defaultRole',
    column: 'Default_Ad_Role_ID',
    type: 'custom',
    // ETP-5188 (Point 3) — per explicit user instruction, "Rol por Defecto" must NOT
    // appear in "Filtros avanzados"' field list any more (straight removal, no
    // replacement field there). ETP-4906 had added `filterMode: 'identifier'` here
    // specifically to restore that picker; this reverts just that one addition.
    // `filterable: false` is the actual opt-out `isFilterableColumn()`
    // (`@etendosoftware/app-shell-core`'s `AdvancedFilterBuilder.jsx`) checks FIRST,
    // before its own `_ID$`-suffix inference on `column` — which would otherwise still
    // classify `Default_Ad_Role_ID` as filterable even with no `filterMode` set at all.
    // The now-correctly-positioned quick filter (`RoleQuickFilterToolbarSlot`, via
    // `ToolbarQuickFilter` below) is the one supported way to filter by role.
    filterable: false,
    render: (row) => (
      <RoleChipsCell
        row={row}
        rolesById={rolesById}
        adminRoleId={adminRoleId}
        assignments={assignments}
        loading={loading}
        data-testid="RoleChipsCell__cell" />
    ),
  }), [rolesById, adminRoleId, assignments, loading]);

  // ETP-5188 (Item 3) — dedicated "Rol" ADVANCED-FILTER field, replacing the removed
  // "Rol por Defecto" entry above (`roleColumn`, now `filterable: false`): a closed,
  // preloaded catalog of the system role templates + the tenant's admin role + "Sin
  // rol", multi-selectable ("filtrar por uno o multiples roles a la vez" per the
  // ticket). Deliberately separate from `roleColumn`:
  //   - No `column:` — this field has no backing `AD_User` property at all (a user's
  //     roles live in the N:M `SFUserRoleAssignments` composition), so there is
  //     nothing for `labelOf(col.column)` to resolve; `label: ui('role')` is used
  //     directly instead of `labelOverrides` (which only matters for overriding a
  //     REAL AD dictionary entry — there is none here to override).
  //   - `filterable: true` — REQUIRED, not cosmetic: `isFilterableColumn()`
  //     (`@etendosoftware/app-shell-core`'s `AdvancedFilterBuilder.jsx`) silently
  //     drops any `type: 'custom'` column with no `column`/`backendFilterKey` UNLESS
  //     `filterable === true` is set explicitly — exactly the "list column silently
  //     unfilterable" trap this repo's own CLAUDE.md warns about, just for an
  //     advanced-filter field instead of a grid column.
  //   - `filterOnly: true` — this field must NEVER render as a 7th grid column (it
  //     has no `render`/real data on the row); `isLineGridColumn()`
  //     (`linesColumnWidth.js`) excludes any `filterOnly` column from `DataTable`'s
  //     actual rendered `visibleColumns` while still letting it flow through the raw
  //     `columns` prop into `onColumnsReady` → `ListView`'s `filterColumns`, which is
  //     the only place this field needs to exist.
  //   - `toQueryParams: buildRoleFilterQueryParams` — this field's condition must
  //     never reach the generic `criteria=` builder (a naive HQL criteria against the
  //     role-assignment collection 500s — confirmed live, see
  //     `docs/plans/2026-09-11-etp-5188-role-filter-open-questions.md`).
  //     `ListView.jsx`'s `extractQueryParamConditions` strips it out unconditionally
  //     and turns the selection into the backend's dedicated `RoleIds=`/`NoRole=`
  //     params instead (see that function's own docstring, `gridQuery.js`).
  //   - `enumLabels` reuses the SAME merged `rolesById` index (`useUserRoleGridData()`
  //     above) the grid chips and the quick filter already read — one role catalog,
  //     one id space, three surfaces. Since it's a closed, declared catalog,
  //     `DistinctEnumPicker`'s `hasDeclaredLabels` branch seeds the option list (and
  //     the partial-search box, CP-2) entirely client-side from `enumLabels` — it
  //     still attempts a live `_distinct=roleFilter` backend call when the popover
  //     opens (no per-column way to suppress that in the published
  //     `AdvancedFilterBuilder`, only a single window-wide `entity`/`apiBaseUrl` pair
  //     — investigated, not changed this round), but that call fails as a clean
  //     `400 Bad Request` ("Unknown field") from `NeoCrudHandler`, is swallowed
  //     silently by `useDistinctValues`' own try/catch, and is never surfaced in the
  //     UI (`DistinctValuesList` never reads `distinct.error`) — so the picker still
  //     renders and searches correctly from the declared catalog regardless.
  const roleFilterColumn = useMemo(() => ({
    key: 'roleFilter',
    type: 'custom',
    filterMode: 'enumLabel',
    filterable: true,
    filterOnly: true,
    label: ui('role'),
    enumLabels: buildRoleEnumLabels(rolesById, ui),
    toQueryParams: buildRoleFilterQueryParams,
  }), [rolesById, ui]);

  // ETP-4830 scope addition — "Invitation" column, placed immediately before the
  // "Rol" column: both are administrative/onboarding-state indicators about the
  // user's account, a sensible visual grouping at the end of the row (same rationale
  // `roleColumn` above already established for putting role state last). No AD
  // `column:` value exists for this field (see the file's own doc comment above), so
  // the header label comes from `labelOverrides`-free direct `ui()` translation —
  // unlike `roleColumn`'s `Default_Ad_Role_ID` override, there is no shared native
  // dictionary entry this could collide with.
  const invitationColumn = useMemo(() => ({
    key: 'invitationStatus',
    type: 'custom',
    label: ui('usersGridInvitationColumn'),
    render: (row) => (
      <PendingInvitationPill
        status={row?.invitationStatus}
        compact
        data-testid="PendingInvitationPill__grid" />
    ),
  }), [ui]);

  // ETP-4830 item #4 — human call, after first shipping a dedicated "Owner" grid column:
  // there is at most ONE owner per client, so a whole column was disproportionate real estate
  // for something that rare. Reworked into a small inline pill on the "name" cell instead —
  // `renderDefaultCell`'s existing `col.pill` mechanism (`{ when, label, className? }`,
  // `DataTable.cellRenderers.jsx`), already built and tested for exactly this "badge attached to
  // the first visible string column" shape, so no new render function or column is needed here.
  // `name` stays `type: 'string'` (unchanged) — `col.pill` is additive, it doesn't touch
  // filtering/sorting/label resolution.
  const nameColumnWithOwnerPill = useMemo(() => ({
    ...columns[0],
    pill: { when: (row) => Boolean(row?.isOwner), label: ui('ownerBadge') },
  }), [ui]);

  const baseColumns = useMemo(
    () => [nameColumnWithOwnerPill, ...columns.slice(1)],
    [nameColumnWithOwnerPill],
  );

  const tableColumns = useMemo(
    () => [...baseColumns, invitationColumn, roleColumn, roleFilterColumn],
    [baseColumns, invitationColumn, roleColumn, roleFilterColumn],
  );

  // Client-side role filter, applied over the rows already loaded for this page —
  // there is no backend query param for "has this composed template role" today
  // (it's derived from the bulk assignments map, not a queryable AD_User column), so
  // this mirrors `subsetFilters`/`quickFilters`'s own `rowFilter` semantics by hand
  // instead of round-tripping through `criteria=...`.
  const filteredData = useMemo(() => {
    const rows = props.data ?? [];
    if (!roleFilter) return rows;
    // ETP-5188 (Point 5) — "Sin rol": NOT the client-admin AND zero entries in the bulk
    // assignments map. See `hasNoRole()` in `RoleChipsCell.jsx` for the shared predicate.
    if (roleFilter === NO_ROLE_FILTER_VALUE) {
      return rows.filter((row) => hasNoRole(row, { adminRoleId, assignments }));
    }
    if (roleFilter === adminRoleId) {
      return rows.filter((row) => resolveDefaultRoleId(row) === adminRoleId);
    }
    return rows.filter((row) => {
      const userId = resolveUserId(row);
      const applied = userId ? assignments?.[userId] : null;
      return Array.isArray(applied) && applied.includes(roleFilter);
    });
  }, [props.data, roleFilter, adminRoleId, assignments]);

  // Bug fix (reported live on app.etendo.software, post-ETP-5188) — `ListView` only
  // forwards its own `loading` to `Table` for the TRUE initial fetch (see
  // `ListTableRegion` in `ListView.jsx`: once `hook.items.length > 0`, it renders
  // `<Table {...tableProps} />` with no `loading` prop at all). That's fine for the
  // unfiltered grid, but `filteredData` above ALSO depends on `assignments` from
  // `useUserRoleGridData()` — a second, independent fetch `ListView` knows nothing
  // about. When arriving via a role card (`/user?role=<id>`), the base list can
  // resolve before `assignments` does (routine on a slow connection): `filteredData`
  // then filters against an empty/stale `assignments` map, `DataTable` renders its
  // real "Sin registros aún" empty state, and the correct rows pop in ~1s later once
  // `assignments` catches up — no skeleton at any point, since nothing told `DataTable`
  // a fetch was still in flight. Direct entry (no `role` param) never hits this: line
  // 262 returns `rows` unfiltered without ever touching `assignments`. Forcing
  // `DataTable`'s own `loading` (skeleton) exactly while a role filter is waiting on
  // `assignments` closes that gap without touching `ListView`.
  const showRoleFilterLoading = Boolean(roleFilter) && loading;

  return (
    <>
      {userDebugModeActive && (
        <UserDebugPanel
          users={props.data ?? []}
          onDataMutated={props.onDataMutated}
          data-testid="UserDebugPanel__grid" />
      )}
      {/* ETP-5188 — the role quick-filter no longer renders in its own wrapper div here;
          it moved to `ListView`'s own toolbar row via `ToolbarQuickFilter` below, so it
          lands in the same toolbar row as "Filtros" instead of a separate region above
          the table. */}
      <DataTable
        columns={tableColumns}
        filters={filters}
        {...props}
        data={filteredData}
        loading={props.loading || showRoleFilterLoading}
        labelOverrides={labelOverrides}
        data-testid="DataTable__UserHeaderTable" />
    </>
  );
}

// ETP-5188 (Points 2 + 4) — companion toolbar-slot component, read by `ListView.jsx` via
// `Table?.ToolbarQuickFilter` and rendered in its OWN toolbar row (immediately left of
// "Filtros"), not by this component's own markup. See `RoleQuickFilterToolbarSlot.jsx`'s
// docstring for the full rationale and the `role` URL-param state-sharing mechanism.
UserHeaderTable.ToolbarQuickFilter = RoleQuickFilterToolbarSlot;
