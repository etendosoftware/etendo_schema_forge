import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:header
const fields = [
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, readOnly: true, section: 'principal', readOnlyLogic: (record) => record['processed'] === 'Y' },
  { key: 'accountingDate', column: 'DateAcct', type: 'date', label: 'Accounting Date', required: true, readOnly: true, section: 'principal', readOnlyLogic: (record) => record['processed'] === 'Y' },
  { key: 'startingDate', column: 'StartDate', type: 'date', label: 'Starting Date', readOnly: true, section: 'principal', readOnlyLogic: (record) => record['processed'] === 'Y' },
  { key: 'currency', column: 'C_Currency_ID', type: 'selector', label: 'Currency', required: true, readOnly: true, section: 'principal', reference: 'Currency', inputMode: 'selector', readOnlyLogic: (record) => record['processed'] === 'Y' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'principal', readOnlyLogic: (record) => record['processed'] === 'Y' },
  { key: 'project', column: 'C_Project_ID', type: 'selector', label: 'Project', section: 'principal', reference: 'Project', inputMode: 'selector', visible: null, visibilitySource: 'server', displayLogicReason: 'server-macro', readOnlyLogic: (record) => record['posted'] === true },
];
// @sf-generated-end fields:header

// @sf-generated-start component:HeaderForm
export default function HeaderForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
HeaderForm.fields = fields;

// @sf-generated-end component:HeaderForm
