import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:transactions
const columns = [
  { key: 'organization', column: 'AD_Org_ID', type: 'selector', label: 'Organization', required: true },
  { key: 'storageBin', column: 'M_Locator_ID', type: 'selector', label: 'Storage Bin', required: true },
  { key: 'movementQuantity', column: 'MovementQty', type: 'number', label: 'Movement Quantity', required: true },
  { key: 'movementDate', column: 'MovementDate', type: 'date', label: 'Movement Date', required: true },
  { key: 'movementType', column: 'MovementType', type: 'enum', label: 'Movement Type', enumLabels: { 'V+': 'movementTypeVPlus', 'I+': 'movementTypeIPlus', 'M-': 'movementTypeMMinus', 'M+': 'movementTypeMPlus', 'I-': 'movementTypeIMinus', 'P-': 'movementTypePMinus', 'P+': 'movementTypePPlus', 'C-': 'movementTypeCMinus', 'D-': 'movementTypeDMinus', 'D+': 'movementTypeDPlus' }, required: true },
  { key: 'totalCost', column: 'TotalCost', type: 'amount', label: 'Total Cost' },
];
// @sf-generated-end columns:transactions

const filters = [];

// @sf-generated-start component:TransactionsTable
const TransactionsTable = forwardRef(function TransactionsTable(props, ref) {
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

export default TransactionsTable;
// @sf-generated-end component:TransactionsTable
