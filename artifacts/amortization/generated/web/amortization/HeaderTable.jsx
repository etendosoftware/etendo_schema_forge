import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:header
const columns = [
  { key: 'name', column: 'Name', type: 'string', label: 'Name', required: true },
  { key: 'accountingDate', column: 'DateAcct', type: 'date', label: 'Accounting Date', required: true, dot: false },
  { key: 'startingDate', column: 'StartDate', type: 'date', label: 'Starting Date', dot: false },
  { key: 'totalAmortization', column: 'Totalamortization', type: 'amount', label: 'Total Amortization', summable: true },
  { key: 'processed', column: 'Processed', type: 'status', label: 'Post Amortization', enumLabels: { 'N': 'statusDraft', 'Y': 'statusProcessed' }, required: true, filterable: false },
  { key: 'posted', column: 'Posted', type: 'boolean', label: 'Posted', badge: true, badgeLabels: {"true":{"en_US":"Posted","es_ES":"Contabilizado"},"false":{"en_US":"Not posted","es_ES":"Sin contabilizar"}}, badgeVariants: {"true":"green","false":"orange"}, required: true },
];
// @sf-generated-end columns:header

const filters = ['name', 'accountingDate', 'startingDate'];

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
