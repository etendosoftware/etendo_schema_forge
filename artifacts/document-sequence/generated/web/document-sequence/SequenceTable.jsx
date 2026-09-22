import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:sequence
const columns = [
  { key: 'name', column: 'Name', type: 'enum', label: 'Name', enumLabels: { 'Purchase Order': 'documentSequencePurchaseOrder', 'Standard Order': 'documentSequenceSalesOrder', 'AR Invoice': 'documentSequenceSalesInvoice', 'Factura Rectificativa (Ventas)': 'documentSequenceSalesCorrectiveInvoice', 'AP Invoice': 'documentSequencePurchaseInvoice', 'Factura Rectificativa (Compras)': 'documentSequencePurchaseCorrectiveInvoice' }, required: true },
  { key: 'description', column: 'Description', type: 'string', label: 'Description', maxLength: 255 },
  { key: 'prefix', column: 'Prefix', type: 'string', label: 'Prefix', maxLength: 10 },
  { key: 'startingNo', column: 'StartNo', type: 'number', label: 'Starting No.', required: true },
  { key: 'nextAssignedNumber', column: 'CurrentNext', type: 'number', label: 'Next Assigned Number', required: true },
];
// @sf-generated-end columns:sequence

const filters = [];

// @sf-generated-start component:SequenceTable
const SequenceTable = forwardRef(function SequenceTable(props, ref) {
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

export default SequenceTable;
// @sf-generated-end component:SequenceTable
