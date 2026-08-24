import { useMemo, useState } from 'react';
import { DataTable } from '@/components/contract-ui';
import { useUI, useLocaleSwitch } from '@/i18n';
import RoleChipsCell, { resolveDefaultRoleId, resolveUserId, useUserRoleGridData } from './RoleChipsCell.jsx';
import { RoleFilterControl } from './RoleFilterControl.jsx';
import { useUserDebugMode } from './useUserDebugMode.js';
import UserDebugPanel from './UserDebugPanel.jsx';
import PendingInvitationPill from './PendingInvitationPill.jsx';
import OwnerBadge from './OwnerBadge.jsx';

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
 * literal is declared here for those 4 columns — `DataTable`'s own header resolution
 * (`t(col.column) ?? col.label ?? col.key`) always resolves them through the native AD
 * dictionary lookup (`t(col.column)`) before ever falling back to `col.label`, so a
 * hardcoded literal here would be dead fallback text that the `sfqg` i18n check flags
 * regardless of whether it renders. Re-verify this list against that file whenever
 * `artifacts/user/decisions.json`'s `user` entity's grid fields change.
 *
 * **`invitationStatus` (ETP-4830 scope addition) has no generated-table equivalent at
 * all** — it is not an `AD_User` column, just a backend-contract-only field NEO adds
 * to every `user` GET response (list rows included), so there is nothing for
 * `generate-frontend.js` to ever emit for it. It renders the exact same
 * `PendingInvitationPill` (`./PendingInvitationPill.jsx`) already shown in the detail
 * form's toolbar — extracted into its own file specifically so this grid column and
 * that toolbar pill share ONE status→style mapping instead of two. Declared via
 * `invitationColumn` below (not the static `columns` array), because building its
 * `label` needs the `ui()` hook, which — unlike the 5 columns above, which never call
 * `ui()` for their headers — is only available inside the component render, not at
 * module scope.
 */
const columns = [
  { key: 'name', column: 'Name', type: 'string', required: true },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'selector' },
  { key: 'email', column: 'Email', type: 'string', required: true },
  { key: 'locked', column: 'IsLocked', type: 'boolean', required: true },
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
  const { roles, rolesById, adminRoleId, assignments, loading } = useUserRoleGridData();
  const [roleFilter, setRoleFilter] = useState(null);
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
    // `type: 'custom'` drives the chip render, but the underlying column is still a
    // plain FK (`_ID` suffix) — `filterMode` restores the identifier picker in the
    // advanced filter without touching the grid cell (same rationale as
    // `PurchaseInvoiceHeaderTable.jsx`'s `transactionDocument`/`outstandingAmount`).
    filterMode: 'identifier',
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
        data-testid="PendingInvitationPill__grid" />
    ),
  }), [ui]);

  // ETP-4830 item #4 — "Owner" column, next to the invitation column: same "administrative/
  // onboarding-state indicator" grouping rationale invitationColumn's own comment documents.
  // `isOwner` (like `invitationStatus`) has no AD `column:` value — it's a backend-contract-only
  // boolean the `user` NeoHandler attaches to every GET response, never a real `AD_User` field —
  // so there is nothing for the pipeline to emit here either.
  const ownerColumn = useMemo(() => ({
    key: 'isOwner',
    type: 'custom',
    label: ui('usersGridOwnerColumn'),
    render: (row) => (
      <OwnerBadge
        isOwner={row?.isOwner}
        data-testid="OwnerBadge__grid" />
    ),
  }), [ui]);

  const tableColumns = useMemo(
    () => [...columns, invitationColumn, ownerColumn, roleColumn],
    [invitationColumn, ownerColumn, roleColumn],
  );

  // Client-side role filter, applied over the rows already loaded for this page —
  // there is no backend query param for "has this composed template role" today
  // (it's derived from the bulk assignments map, not a queryable AD_User column), so
  // this mirrors `subsetFilters`/`quickFilters`'s own `rowFilter` semantics by hand
  // instead of round-tripping through `criteria=...`.
  const filteredData = useMemo(() => {
    const rows = props.data ?? [];
    if (!roleFilter) return rows;
    if (roleFilter === adminRoleId) {
      return rows.filter((row) => resolveDefaultRoleId(row) === adminRoleId);
    }
    return rows.filter((row) => {
      const userId = resolveUserId(row);
      const applied = userId ? assignments?.[userId] : null;
      return Array.isArray(applied) && applied.includes(roleFilter);
    });
  }, [props.data, roleFilter, adminRoleId, assignments]);

  return (
    <>
      {userDebugModeActive && (
        <UserDebugPanel
          users={props.data ?? []}
          onDataMutated={props.onDataMutated}
          data-testid="UserDebugPanel__grid" />
      )}
      <div className="flex items-center gap-2 px-6 pb-2 pt-3" data-testid="UserHeaderTable__toolbar">
        <RoleFilterControl
          value={roleFilter}
          onChange={setRoleFilter}
          roles={roles}
          data-testid="RoleFilterControl__toolbar" />
      </div>
      <DataTable
        columns={tableColumns}
        filters={filters}
        {...props}
        data={filteredData}
        labelOverrides={labelOverrides}
        data-testid="DataTable__UserHeaderTable" />
    </>
  );
}
