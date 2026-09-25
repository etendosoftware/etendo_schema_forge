import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:internalConsumption
const columns = [
  { key: 'movementDate', column: 'MovementDate', type: 'date', label: 'Movement Date', required: true, dot: false },
  { key: 'name', column: 'Name', type: 'string', label: 'Name', required: true, maxLength: 60 },
  { key: 'status', column: 'Status', type: 'status', label: 'Status', enumLabels: { 'DR': 'statusDr', 'CO': 'statusCo', 'VO': 'statusVo' }, required: true },
  { key: 'posted', column: 'Posted', type: 'boolean', label: 'Posted', badge: true, badgeLabels: {"true":{"en_US":"Posted","es_ES":"Contabilizado"},"false":{"en_US":"Not posted","es_ES":"Sin contabilizar"}}, badgeVariants: {"true":"green","false":"orange"}, required: true },
];
// @sf-generated-end columns:internalConsumption

const filters = ['name'];

// @sf-generated-start component:InternalConsumptionTable
const InternalConsumptionTable = forwardRef(function InternalConsumptionTable(props, ref) {
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

export default InternalConsumptionTable;
// @sf-generated-end component:InternalConsumptionTable
