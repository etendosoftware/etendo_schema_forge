import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:vendorAccounting
const columns = [
  { key: 'vendorLiability', column: 'V_Liability_Acct', type: 'selector', labels: {"en_US":"Liability Account","es_ES":"Cuenta a Pagar"}, label: 'Vendor Liability', required: true },
  { key: 'vendorPrepayment', column: 'V_Prepayment_Acct', type: 'selector', labels: {"en_US":"Prepayment Account","es_ES":"Cuenta de Anticipos"}, label: 'Vendor Prepayment' },
];
// @sf-generated-end columns:vendorAccounting

const filters = [];

// @sf-generated-start component:VendorAccountingTable
const VendorAccountingTable = forwardRef(function VendorAccountingTable(props, ref) {
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

export default VendorAccountingTable;
// @sf-generated-end component:VendorAccountingTable
