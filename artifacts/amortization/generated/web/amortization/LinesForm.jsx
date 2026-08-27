import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:lines
const fields = [
  { key: 'asset', column: 'A_Asset_ID', type: 'selector', label: 'Asset', section: 'principal', reference: 'Asset', inputMode: 'selector', readOnlyLogic: (record) => record['posted'] === true },
  { key: 'amortizationPercentage', column: 'Amortization_Percentage', type: 'number', label: 'Amortization Percentage', section: 'principal', readOnlyLogic: (record) => record['processed'] === 'Y' },
  { key: 'amortizationAmount', column: 'Amortizationamt', type: 'number', label: 'Amortization Amount', required: true, section: 'principal', readOnlyLogic: (record) => record['processed'] === 'Y' },
  { key: 'project', column: 'C_Project_ID', type: 'selector', label: 'Project', lookup: true, section: 'principal', reference: 'Project', inputMode: 'selector', visible: null, visibilitySource: 'server', displayLogicReason: 'server-macro', readOnlyLogic: (record) => record['posted'] === true },
  { key: 'costcenter', column: 'C_Costcenter_ID', type: 'selector', label: 'Cost Center', lookup: true, section: 'other', reference: 'Costcenter', inputMode: 'selector', visible: null, visibilitySource: 'server', displayLogicReason: 'server-macro', readOnlyLogic: (record) => record['posted'] === true },
  { key: 'eTADASBpartner', column: 'EM_Etadas_C_Bpartner_ID', type: 'selector', label: 'Business Partner', lookup: true, section: 'other', reference: 'BPartner', inputMode: 'selector', visible: null, visibilitySource: 'server', displayLogicReason: 'accounting-dimension', readOnlyLogic: (record) => record['posted'] === true },
];
// @sf-generated-end fields:lines

// @sf-generated-start component:LinesForm
export default function LinesForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
LinesForm.fields = fields;

// @sf-generated-end component:LinesForm
