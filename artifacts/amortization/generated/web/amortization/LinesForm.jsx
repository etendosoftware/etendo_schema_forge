import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:lines
const fields = [
  { key: 'asset', column: 'A_Asset_ID', type: 'selector', label: 'Asset', section: 'principal', reference: 'Asset', inputMode: 'selector', readOnlyLogic: (record) => record['posted'] === true },
  { key: 'amortizationPercentage', column: 'Amortization_Percentage', type: 'number', label: 'Amortization Percentage', section: 'principal', readOnlyLogic: (record) => record['processed'] === 'Y' },
  { key: 'amortizationAmount', column: 'Amortizationamt', type: 'number', label: 'Amortization Amount', required: true, section: 'principal', readOnlyLogic: (record) => record['processed'] === 'Y' },
  { key: 'project', column: 'C_Project_ID', type: 'selector', label: 'Project', lookup: true, section: 'principal', reference: 'Project', inputMode: 'selector', visible: null, visibilitySource: 'server', displayLogicReason: 'server-macro', readOnlyLogic: (record) => record['posted'] === true },
  { key: 'costcenter', column: 'C_Costcenter_ID', type: 'selector', label: 'Cost Center', lookup: true, section: 'other', reference: 'Costcenter', inputMode: 'selector', readOnlyLogic: (record) => record['posted'] === true },
  { key: 'stDimension', column: 'User1_ID', type: 'selector', label: '1st Dimension', lookup: true, section: 'other', reference: 'User1', inputMode: 'selector', readOnlyLogic: (record) => record['posted'] === true },
  { key: 'ndDimension', column: 'User2_ID', type: 'selector', label: '2nd Dimension', lookup: true, section: 'other', reference: 'User2', inputMode: 'selector', readOnlyLogic: (record) => record['posted'] === true },
  { key: 'eTADASActivity', column: 'EM_Etadas_C_Activity_ID', type: 'selector', label: 'Activity', lookup: true, section: 'other', reference: 'Activity', inputMode: 'selector', readOnlyLogic: (record) => record['posted'] === true },
  { key: 'eTADASBpartner', column: 'EM_Etadas_C_Bpartner_ID', type: 'selector', label: 'Business Partner', lookup: true, section: 'other', reference: 'BPartner', inputMode: 'selector', readOnlyLogic: (record) => record['posted'] === true },
  { key: 'eTADASSalesCampaign', column: 'EM_Etadas_Campaign_ID', type: 'selector', label: 'Sales Campaign', lookup: true, section: 'other', reference: 'Campaign', inputMode: 'selector', readOnlyLogic: (record) => record['posted'] === true },
  { key: 'eTADASSalesRegion', column: 'EM_Etadas_Salesregion_ID', type: 'selector', label: 'Sales Region', lookup: true, section: 'other', reference: 'SalesRegion', inputMode: 'selector', readOnlyLogic: (record) => record['posted'] === true },
];
// @sf-generated-end fields:lines

// @sf-generated-start component:LinesForm
export default function LinesForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:LinesForm
