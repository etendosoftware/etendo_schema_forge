import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:gLJournalLine
const fields = [
  { key: 'lineNo', column: 'Line', type: 'number', label: 'LineNo', required: true, readOnly: true, section: 'other', defaultValue: '@SQL=SELECT COALESCE(MAX(Line),0)+10 AS DefaultValue FROM GL_JournalLine WHERE GL_Journal_ID=@GL_Journal_ID@', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'accountingCombination', column: 'C_ValidCombination_ID', type: 'selector', label: 'Account', lookup: true, section: 'principal', reference: 'ValidCombination', inputMode: 'selector', readOnlyLogic: (record) => record['processed'] === true || record['multigeneralLedger'] === true },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'principal', defaultValue: '@DESCRIPTION1@', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'foreignCurrencyDebit', column: 'AmtSourceDr', type: 'number', label: 'Debit', required: true, section: 'principal', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'foreignCurrencyCredit', column: 'AmtSourceCr', type: 'number', label: 'Credit', required: true, section: 'principal', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'openItems', column: 'Open_Items', type: 'checkbox', label: 'Open Items', required: true, section: 'other' },
  { key: 'businessPartner', column: 'C_Bpartner_ID', type: 'search', label: 'Business Partner', section: 'other', reference: 'BPartner', inputMode: 'search', displayLogic: (record) => record['openItems'] === true, readOnlySource: 'server', readOnlyLogicReason: 'untranslatable-token' },
  { key: 'product', column: 'M_Product_ID', type: 'selector', label: 'Product', section: 'other', reference: 'Product', inputMode: 'selector', displayLogic: (record) => record['openItems'] === true, readOnlyLogic: (record) => record['posted'] === true },
  { key: 'project', column: 'C_Project_ID', type: 'search', label: 'Project', section: 'other', reference: 'Project', inputMode: 'search', displayLogic: (record) => record['openItems'] === true, readOnlyLogic: (record) => record['posted'] === true },
  { key: 'asset', column: 'A_Asset_ID', type: 'selector', label: 'Asset', section: 'other', reference: 'Asset', inputMode: 'selector', displayLogic: (record) => record['openItems'] === true, readOnlyLogic: (record) => record['posted'] === true },
  { key: 'costCenter', column: 'C_Costcenter_ID', type: 'selector', label: 'Cost Center', section: 'other', reference: 'Costcenter', inputMode: 'selector', displayLogic: (record) => record['openItems'] === true, readOnlyLogic: (record) => record['posted'] === true },
];
// @sf-generated-end fields:gLJournalLine

// @sf-generated-start component:GLJournalLineForm
export default function GLJournalLineForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:GLJournalLineForm
