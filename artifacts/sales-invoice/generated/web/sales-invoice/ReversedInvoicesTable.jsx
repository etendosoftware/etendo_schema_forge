import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:reversedInvoices
const columns = [
  { key: 'reversedInvoice', column: 'Reversed_C_Invoice_ID', type: 'selector', label: 'Reversed Invoice', required: true, lookup: true },
  { key: 'aEAT349IsCorrective', column: 'EM_AEAT349_IsCorrective', type: 'boolean', label: 'Correctiva del 349' },
  { key: 'aEAT349CYear', column: 'EM_AEAT349_C_Year_ID', type: 'selector', label: 'Año' },
  { key: 'aEAT349Period', column: 'EM_AEAT349_Period', type: 'enum', label: 'Periodo', enumLabels: { '0A': 'emAeat349Period0A', '1T': 'emAeat349Period1T', '2T': 'emAeat349Period2T', '3T': 'emAeat349Period3T', '4T': 'emAeat349Period4T', '01': 'emAeat349Period01', '02': 'emAeat349Period02', '03': 'emAeat349Period03', '04': 'emAeat349Period04', '05': 'emAeat349Period05', '06': 'emAeat349Period06', '07': 'emAeat349Period07', '08': 'emAeat349Period08', '09': 'emAeat349Period09', '10': 'emAeat349Period10', '11': 'emAeat349Period11', '12': 'emAeat349Period12' } },
  { key: 'aEAT349BPBaseAmount', column: 'EM_AEAT349_BP_BaseAmount', type: 'amount', label: 'Base Imponible del 349 Productos' },
  { key: 'aEAT349BPBaseAmountS', column: 'EM_AEAT349_BP_BaseAmount_S', type: 'amount', label: 'Base Imponible del 349 Servicios' },
];
// @sf-generated-end columns:reversedInvoices

const filters = [];

// @sf-generated-start component:ReversedInvoicesTable
const ReversedInvoicesTable = forwardRef(function ReversedInvoicesTable(props, ref) {
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

export default ReversedInvoicesTable;
// @sf-generated-end component:ReversedInvoicesTable
