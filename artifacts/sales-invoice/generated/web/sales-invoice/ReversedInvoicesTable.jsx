import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:reversedInvoices
const columns = [
  { key: 'reversedInvoice', column: 'Reversed_C_Invoice_ID', type: 'selector', label: 'Reversed Invoice', required: true, lookup: true },
  { key: 'aEAT349IsCorrective', column: 'EM_AEAT349_IsCorrective', type: 'boolean', label: 'Correctiva del 349' },
  { key: 'aEAT349CYear', column: 'EM_AEAT349_C_Year_ID', type: 'selector', label: 'Año' },
  { key: 'aEAT349Period', column: 'EM_AEAT349_Period', type: 'enum', label: 'Periodo', enumLabels: { '0A': '0A - Anual', '1T': '1T - Primer Trimestre', '2T': '2T - Segundo Trimestre', '3T': '3T - Tercer Trimestre', '4T': '4T - Cuarto Trimestre', '01': '01 - Enero', '02': '02 - Febrero', '03': '03 - Marzo', '04': '04 - Abril', '05': '05 - Mayo', '06': '06 - Junio', '07': '07 - Julio', '08': '08 - Agosto', '09': '09 - Septiembre', '10': '10 - Octubre', '11': '11 - Noviembre', '12': '12 - Diciembre' } },
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
