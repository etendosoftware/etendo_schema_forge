import { useMemo, useState } from 'react';
import { DataTable } from '@/components/contract-ui';
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
 * `type`/`label`/`required`, so headers, AD-dictionary label resolution and the
 * advanced-filter builder behave identically. Re-verify this list against that file
 * whenever `artifacts/user/decisions.json`'s `user` entity's grid fields change.
 */
const columns = [
  { key: 'name', column: 'Name', type: 'string', label: 'Name', required: true },
  { key: 'firstName', column: 'Firstname', type: 'string', label: 'First Name' },
  { key: 'lastName', column: 'Lastname', type: 'string', label: 'Last Name' },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'selector', label: 'Business Partner' },
  { key: 'email', column: 'Email', type: 'string', label: 'Email', required: true },
  { key: 'locked', column: 'IsLocked', type: 'boolean', label: 'Locked', required: true },
];

const filters = ['name', 'email'];

export default function UserHeaderTable(props) {
  const { roles, rolesById, adminRoleId, assignments, loading } = useUserRoleGridData();
  const [roleFilter, setRoleFilter] = useState(null);

  const roleColumn = useMemo(() => ({
    key: 'defaultRole',
    column: 'Default_Ad_Role_ID',
    type: 'custom',
    label: 'Default Role',
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
        data-testid="DataTable__UserHeaderTable" />
    </>
  );
}
