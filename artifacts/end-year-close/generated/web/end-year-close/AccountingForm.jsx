import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:accounting
const fields = [
  { key: 'type', column: 'Factaccttype', type: 'select', label: 'Type', readOnly: true, section: 'other', options: [{ value: 'C', label: 'Closing Entry', labels: {"es_ES":"Asiento de cierre"} }, { value: 'D', label: 'Divide Up', labels: {"es_ES":"Reparto de reservas"} }, { value: 'R', label: 'Income Statement', labels: {"es_ES":"Entrada de regularización"} }, { value: 'O', label: 'Opening Entry', labels: {"es_ES":"Asiento de apertura"} }, { value: 'N', label: 'Regular Entry', labels: {"es_ES":"Asiento normal"} }] },
  { key: 'account', column: 'Account_ID', type: 'text', label: 'Account', readOnly: true, section: 'other' },
  { key: 'debit', column: 'Debit', type: 'number', label: 'Debit', readOnly: true, section: 'other' },
  { key: 'credit', column: 'Credit', type: 'number', label: 'Credit', readOnly: true, section: 'other' },
  { key: 'description', column: 'description', type: 'textarea', label: 'Description', readOnly: true, section: 'other' },
];
// @sf-generated-end fields:accounting

// @sf-generated-start component:AccountingForm
export default function AccountingForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
AccountingForm.fields = fields;

// @sf-generated-end component:AccountingForm
