import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:user
const columns = [
  { key: 'name', column: 'Name', type: 'string', label: 'Name', required: true },
  { key: 'username', column: 'UserName', type: 'string', label: 'Username', required: true },
  { key: 'firstName', column: 'Firstname', type: 'string', label: 'First Name' },
  { key: 'lastName', column: 'Lastname', type: 'string', label: 'Last Name' },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'selector', label: 'Business Partner' },
  { key: 'email', column: 'Email', type: 'string', label: 'Email' },
  { key: 'locked', column: 'IsLocked', type: 'boolean', label: 'Locked', required: true },
  { key: 'defaultRole', column: 'Default_Ad_Role_ID', type: 'selector', label: 'Default Role' },
];
// @sf-generated-end columns:user

const filters = ['name', 'username', 'email'];

// @sf-generated-start component:UserTable
const UserTable = forwardRef(function UserTable(props, ref) {
  // Inline-editable layout always uses InlineLinesPanel for existing rows so column
  // widths (flex layout) never shift when the add-row form opens. When addRow is
  // active we render a header-hidden, data-hidden DataTable below for just the
  // add-row form — it owns callouts, selectors, validation and the imperative flush
  // ref. The ref is forwarded to InlineLinesPanel so DetailView can flush pending
  // inline edits on global save.
  if (props.linesLayout === 'inlineEditable') {
    if (props.addRow?.active) {
      return (
        <>
          <InlineLinesPanel ref={ref} columns={columns} {...props} addRow={undefined} />
          <DataTable columns={columns} filters={filters} {...props} hideHeader hideDataRows />
        </>
      );
    }
    return <InlineLinesPanel ref={ref} columns={columns} {...props} />;
  }
  return <DataTable columns={columns} filters={filters} {...props} />;
});

export default UserTable;
// @sf-generated-end component:UserTable
