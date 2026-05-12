import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:businessPartner
const columns = [
  { key: 'name', column: 'Name', type: 'string', label: 'Commercial Name', required: true },
  { key: 'etgoWeb', column: 'EM_Etgo_Web', type: 'string', label: 'Web' },
  { key: 'etgoEmail', column: 'EM_Etgo_Email', type: 'string', label: 'Email' },
  { key: 'etgoPhone', column: 'EM_Etgo_Phone', type: 'string', label: 'Phone' },
  { key: 'customer', column: 'IsCustomer', type: 'boolean', label: 'Customer', required: true },
  { key: 'vendor', column: 'IsVendor', type: 'boolean', label: 'Vendor', required: true },
];
// @sf-generated-end columns:businessPartner

const filters = ['name'];

// @sf-generated-start component:BusinessPartnerTable
const BusinessPartnerTable = forwardRef(function BusinessPartnerTable(props, ref) {
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

export default BusinessPartnerTable;
// @sf-generated-end component:BusinessPartnerTable
