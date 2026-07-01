import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:bankAccount
const columns = [
  { key: 'bankName', column: 'Bank_Name', type: 'string', label: 'Bank Name' },
  { key: 'country', column: 'C_Country_ID', type: 'selector', label: 'Country' },
  { key: 'bankFormat', column: 'BankFormat', type: 'enum', labels: {"en_US":"Format","es_ES":"Formato"}, label: 'Bank Account Format', enumLabels: { 'GENERIC': 'Use Generic Account No.', 'IBAN': 'Use IBAN', 'SWIFT': 'Use SWIFT + Generic Account No.', 'SPANISH': 'Use Spanish' }, required: true, minWidth: 320 },
  { key: 'accountNo', column: 'AccountNo', type: 'string', label: 'Generic Account No.', minWidth: 360 },
  { key: 'iBAN', column: 'Iban', type: 'string', label: 'IBAN', minWidth: 400 },
  { key: 'swiftCode', column: 'SwiftCode', type: 'string', label: 'SWIFT Code' },
];
// @sf-generated-end columns:bankAccount

const filters = [];

// @sf-generated-start component:BankAccountTable
const BankAccountTable = forwardRef(function BankAccountTable(props, ref) {
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

export default BankAccountTable;
// @sf-generated-end component:BankAccountTable
