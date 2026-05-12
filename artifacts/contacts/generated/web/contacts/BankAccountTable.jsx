import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:bankAccount
const columns = [
  { key: 'bankName', column: 'Bank_Name', type: 'string', label: 'Bank Name' },
  { key: 'country', column: 'C_Country_ID', type: 'selector', label: 'Country' },
  { key: 'bankFormat', column: 'BankFormat', type: 'enum', label: 'Bank Account Format', enumLabels: { 'GENERIC': 'Use Generic Account No.', 'IBAN': 'Use IBAN', 'SWIFT': 'Use SWIFT + Generic Account No.', 'SPANISH': 'Use Spanish' }, required: true },
  { key: 'accountNo', column: 'AccountNo', type: 'string', label: 'Generic Account No.' },
  { key: 'iBAN', column: 'Iban', type: 'string', label: 'IBAN' },
];
// @sf-generated-end columns:bankAccount

const filters = [];

// @sf-generated-start component:BankAccountTable
const BankAccountTable = forwardRef(function BankAccountTable(props, ref) {
  // Inline-editable layout owns rendering of the existing rows. The add-line flow keeps
  // using the proven DataTable inline-add row (callouts, focus management, defaults) —
  // when addRow.active flips on, we hand off to DataTable so the user can fill the new
  // line, then return to InlineLinesPanel once addRow.active flips off again. The ref
  // is forwarded so DetailView can imperatively flush pending edits on global save.
  if (props.linesLayout === 'inlineEditable' && !props.addRow?.active) {
    return <InlineLinesPanel ref={ref} columns={columns} {...props} />;
  }
  return <DataTable columns={columns} filters={filters} {...props} />;
});

export default BankAccountTable;
// @sf-generated-end component:BankAccountTable
