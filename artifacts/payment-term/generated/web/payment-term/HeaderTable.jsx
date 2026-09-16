import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:header
const columns = [
  { key: 'searchKey', column: 'Value', type: 'string', label: 'Search Key', required: true, maxLength: 40 },
  { key: 'name', column: 'Name', type: 'string', label: 'Name', required: true, maxLength: 60 },
  { key: 'overduePaymentDaysRule', column: 'NetDays', type: 'number', label: 'Overdue Payment Days Rule', required: true },
  { key: 'default', column: 'IsDefault', type: 'boolean', labels: {"es_ES":"Por defecto","en_US":"Default"}, label: 'Default', badge: true, badgeLabels: {"true":{"es_ES":"Sí","en_US":"Yes"},"false":{"es_ES":"No","en_US":"No"}} },
];
// @sf-generated-end columns:header

const filters = ['searchKey', 'name'];

// @sf-generated-start component:HeaderTable
const HeaderTable = forwardRef(function HeaderTable(props, ref) {
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

export default HeaderTable;
// @sf-generated-end component:HeaderTable
