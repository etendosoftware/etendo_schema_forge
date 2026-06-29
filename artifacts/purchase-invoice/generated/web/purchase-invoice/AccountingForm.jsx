import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:accounting
const fields = [
  { key: 'accountingSchema', column: 'C_AcctSchema_ID', type: 'selector', label: 'General Ledger', required: true, readOnly: true, section: 'other', reference: 'AcctSchema', inputMode: 'selector' },
  { key: 'currency', column: 'C_Currency_ID', type: 'selector', label: 'Currency', required: true, readOnly: true, section: 'other', reference: 'Currency', inputMode: 'selector' },
  { key: 'period', column: 'C_Period_ID', type: 'selector', label: 'Period', required: true, readOnly: true, section: 'other', reference: 'Period', inputMode: 'selector' },
  { key: 'accountingDate', column: 'DateAcct', type: 'date', label: 'Accounting Date', required: true, readOnly: true, section: 'other' },
  { key: 'account', column: 'Account_ID', type: 'search', label: 'Account', required: true, readOnly: true, section: 'other' },
  { key: 'debit', column: 'AmtAcctDr', type: 'number', label: 'Debit', required: true, readOnly: true, section: 'other' },
  { key: 'credit', column: 'AmtAcctCr', type: 'number', label: 'Credit', required: true, readOnly: true, section: 'other' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', readOnly: true, section: 'other' },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'search', label: 'Business Partner', readOnly: true, section: 'other', reference: 'BPartner', inputMode: 'search' },
  { key: 'product', column: 'M_Product_ID', type: 'search', label: 'Product', readOnly: true, section: 'other', reference: 'Product', inputMode: 'search' },
  { key: 'project', column: 'C_Project_ID', type: 'selector', label: 'Project', readOnly: true, section: 'other', reference: 'Project', inputMode: 'selector' },
  { key: 'costcenter', column: 'C_Costcenter_ID', type: 'selector', label: 'Cost Center', readOnly: true, section: 'other', reference: 'Costcenter', inputMode: 'selector' },
  { key: 'asset', column: 'A_Asset_ID', type: 'selector', label: 'Asset', readOnly: true, section: 'other', reference: 'Asset', inputMode: 'selector' },
  { key: 'stDimension', column: 'User1_ID', type: 'selector', label: '1st Dimension', readOnly: true, section: 'other', reference: 'User1', inputMode: 'selector' },
  { key: 'ndDimension', column: 'User2_ID', type: 'selector', label: '2nd Dimension', readOnly: true, section: 'other', reference: 'User2', inputMode: 'selector' },
  { key: 'postingType', column: 'PostingType', type: 'select', label: 'Posting Type', required: true, readOnly: true, section: 'other', options: [{ value: 'A', label: 'Actual', labels: {"es_ES":"Real"} }, { value: 'B', label: 'Budget', labels: {"es_ES":"Presupuesto"} }, { value: 'E', label: 'Encumbrance', labels: {"es_ES":"Gravamen"} }, { value: 'S', label: 'Statistical', labels: {"es_ES":"Estadística"} }] },
];
// @sf-generated-end fields:accounting

// @sf-generated-start component:AccountingForm
export default function AccountingForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:AccountingForm
