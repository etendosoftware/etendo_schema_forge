import { useMemo, useState } from 'react';
import { DataTable } from '@/components/contract-ui';
import { useUI, useLocaleSwitch } from '@/i18n';
import RoleChipsCell, { resolveDefaultRoleId, resolveUserId, useUserRoleGridData } from './RoleChipsCell.jsx';
import { RoleFilterControl } from './RoleFilterControl.jsx';

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
 * columns:user` block) for every column except `defaultRole` — same `key`/`column`/
 * `type`/`required`, so headers, AD-dictionary label resolution and the
 * advanced-filter builder behave identically. No `label:` literal is declared here —
 * `DataTable`'s own header resolution (`t(col.column) ?? col.label ?? col.key`) always
 * resolves these 4 columns through the native AD dictionary lookup (`t(col.column)`)
 * before ever falling back to `col.label`, so a hardcoded literal here would be dead
 * fallback text that the `sfqg` i18n check flags regardless of whether it renders.
 * Re-verify this list against that file whenever `artifacts/user/decisions.json`'s
 * `user` entity's grid fields change.
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

  const tableColumns = useMemo(() => [...columns, roleColumn], [roleColumn]);

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
