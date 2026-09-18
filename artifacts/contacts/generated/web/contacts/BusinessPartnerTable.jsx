import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:businessPartner
const columns = [
  { key: 'name', column: 'Name', type: 'string', label: 'Commercial Name', required: true, maxLength: 60 },
  { key: 'etgoWeb', column: 'EM_Etgo_Web', type: 'string', label: 'Web', maxLength: 60 },
  { key: 'etgoEmail', column: 'EM_Etgo_Email', type: 'string', label: 'Email', maxLength: 60 },
  { key: 'etgoPhone', column: 'EM_Etgo_Phone', type: 'string', label: 'Phone', maxLength: 60 },
  { key: 'customer', column: 'IsCustomer', type: 'boolean', label: 'Customer', required: true },
  { key: 'vendor', column: 'IsVendor', type: 'boolean', label: 'Vendor', required: true },
];
// @sf-generated-end columns:businessPartner

const filters = ['name'];

// @sf-generated-start component:BusinessPartnerTable
const BusinessPartnerTable = forwardRef(function BusinessPartnerTable(props, ref) {
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

export default BusinessPartnerTable;
// @sf-generated-end component:BusinessPartnerTable
