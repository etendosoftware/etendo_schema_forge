import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:bankStatementLines
const fields = [
  { key: 'active', column: 'Isactive', type: 'checkbox', label: 'Active', section: 'principal', defaultValue: 'Y', readOnlySource: 'server', readOnlyLogicReason: 'session-variable' },
  { key: 'transactionDate', column: 'Datetrx', type: 'date', label: 'Transaction Date', required: true, readOnly: true, section: 'other', readOnlySource: 'server', readOnlyLogicReason: 'session-variable' },
  { key: 'referenceNo', column: 'Referenceno', type: 'text', label: 'Reference No.', required: true, section: 'principal', readOnlySource: 'server', readOnlyLogicReason: 'session-variable' },
  { key: 'bpartnername', column: 'Bpartnername', type: 'text', label: 'Business Partner Name', section: 'principal', readOnlySource: 'server', readOnlyLogicReason: 'session-variable' },
  { key: 'businessPartner', column: 'C_Bpartner_ID', type: 'selector', label: 'Business Partner', section: 'principal', reference: 'BPartner', inputMode: 'selector' },
  { key: 'gLItem', column: 'C_Glitem_ID', type: 'selector', label: 'G/L Item', section: 'other', reference: 'Glitem', inputMode: 'selector' },
  { key: 'dramount', column: 'Dramount', type: 'number', label: 'Amount OUT', required: true, section: 'other', defaultValue: '0', readOnlySource: 'server', readOnlyLogicReason: 'session-variable' },
  { key: 'cramount', column: 'Cramount', type: 'number', label: 'Amount IN', required: true, section: 'other', defaultValue: '0', readOnlySource: 'server', readOnlyLogicReason: 'session-variable' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'other' },
];
// @sf-generated-end fields:bankStatementLines

// @sf-generated-start component:BankStatementLinesForm
export default function BankStatementLinesForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:BankStatementLinesForm
