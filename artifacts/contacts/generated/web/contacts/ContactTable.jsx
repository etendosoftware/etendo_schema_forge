import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:contact
const columns = [
  { key: 'firstName', column: 'Firstname', type: 'string', label: 'First Name' },
  { key: 'lastName', column: 'Lastname', type: 'string', label: 'Last Name' },
  { key: 'email', column: 'Email', type: 'string', label: 'Email' },
  { key: 'phone', column: 'Phone', type: 'string', label: 'Phone' },
  { key: 'position', column: 'Title', type: 'string', label: 'Position' },
];
// @sf-generated-end columns:contact

const filters = ['name', 'email'];

// @sf-generated-start component:ContactTable
const ContactTable = forwardRef(function ContactTable(props, ref) {
  // Inline-editable layout owns rendering of the existing rows. The add-line flow keeps
  // using the proven DataTable inline-add row (callouts, focus management, defaults) —
  // when addRow.active flips on, we hand off to DataTable so the user can fill the new
  // line, then return to InlineLinesPanel once addRow.active flips off again. The ref
  // is forwarded so DetailView can imperatively flush pending edits on global save.
  if (props.linesLayout === 'inlineEditable' && !props.addRow?.active) {
    return <InlineLinesPanel ref={ref} columns={columns} {...props} />;
  }
  return <DataTable columns={columns} filters={filters} {...props} />;
});

export default ContactTable;
// @sf-generated-end component:ContactTable
