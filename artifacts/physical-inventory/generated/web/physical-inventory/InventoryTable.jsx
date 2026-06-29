import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:inventory
const columns = [
  { key: 'movementDate', column: 'MovementDate', type: 'date', label: 'Movement Date', required: true },
  { key: 'name', column: 'Name', type: 'string', label: 'Name', required: true },
  { key: 'warehouse', column: 'M_Warehouse_ID', type: 'selector', label: 'Warehouse', required: true },
  { key: 'posted', column: 'Posted', type: 'boolean', label: 'Posted', badge: true, badgeLabels: {"true":{"en_US":"Posted","es_ES":"Contabilizado"},"false":{"en_US":"Not posted","es_ES":"Sin contabilizar"}}, badgeVariants: {"true":"green","false":"orange"}, required: true },
  { key: 'processed', column: 'Processed', type: 'status', label: 'Status', enumLabels: { 'true': 'statusProcessed', 'false': 'statusDraft' }, required: true },
];
// @sf-generated-end columns:inventory

const filters = ['movementDate', 'warehouse'];

// @sf-generated-start component:InventoryTable
const InventoryTable = forwardRef(function InventoryTable(props, ref) {
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

export default InventoryTable;
// @sf-generated-end component:InventoryTable
