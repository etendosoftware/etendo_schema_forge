import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:businessPartnerCategory
const columns = [
  { key: 'name', column: 'Name', type: 'string', label: 'Name', required: true, maxLength: 60 },
  { key: 'etgoIscustomer', column: 'EM_Etgo_Iscustomer', type: 'boolean', label: 'Customer', badge: true, badgeLabels: {"true":{"es_ES":"Sí","en_US":"Yes"},"false":{"es_ES":"No","en_US":"No"}}, badgeVariants: {"true":"green","false":"neutral"}, required: true },
  { key: 'etgoIsvendor', column: 'EM_Etgo_Isvendor', type: 'boolean', label: 'Vendor/Creditor', badge: true, badgeLabels: {"true":{"es_ES":"Sí","en_US":"Yes"},"false":{"es_ES":"No","en_US":"No"}}, badgeVariants: {"true":"green","false":"neutral"}, required: true },
  { key: 'default', column: 'IsDefault', type: 'boolean', label: 'Default', badge: true, badgeLabels: {"true":{"es_ES":"Sí","en_US":"Yes"},"false":{"es_ES":"No","en_US":"No"}}, badgeVariants: {"true":"green","false":"neutral"}, required: true },
];
// @sf-generated-end columns:businessPartnerCategory

const filters = ['searchKey', 'name'];

// @sf-generated-start component:BusinessPartnerCategoryTable
const BusinessPartnerCategoryTable = forwardRef(function BusinessPartnerCategoryTable(props, ref) {
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

export default BusinessPartnerCategoryTable;
// @sf-generated-end component:BusinessPartnerCategoryTable
