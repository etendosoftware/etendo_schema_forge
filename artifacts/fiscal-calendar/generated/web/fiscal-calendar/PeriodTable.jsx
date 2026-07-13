import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:period
const columns = [
  { key: 'periodNo', column: 'PeriodNo', type: 'number', label: 'Period No.', required: true },
  { key: 'name', column: 'Name', type: 'string', label: 'Name', required: true },
  { key: 'startingDate', column: 'StartDate', type: 'date', label: 'Starting Date', required: true },
  { key: 'endingDate', column: 'EndDate', type: 'date', label: 'Ending Date' },
  { key: 'status', column: 'Status', type: 'enum', label: 'Status', enumLabels: { 'C': 'All Closed', 'N': 'All Never Opened', 'O': 'All Opened', 'P': 'All Permanently Closed', 'M': 'Mixed' }, enumVariants: {"O":"green","N":"neutral","C":"neutral","P":"red"}, badge: true },
];
// @sf-generated-end columns:period

const filters = [];

// @sf-generated-start component:PeriodTable
const PeriodTable = forwardRef(function PeriodTable(props, ref) {
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

export default PeriodTable;
// @sf-generated-end component:PeriodTable
