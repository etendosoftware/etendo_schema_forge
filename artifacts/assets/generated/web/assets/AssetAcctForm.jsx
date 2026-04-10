import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:assetAcct
const fields = [
  { key: 'accountingSchema', column: 'C_AcctSchema_ID', type: 'selector', label: 'General Ledger', required: true, readOnly: true, section: 'other', reference: 'AcctSchema', inputMode: 'selector' },
  { key: 'accumulatedDepreciation', column: 'A_Accumdepreciation_Acct', type: 'selector', label: 'Accumulated Depreciation', required: true, section: 'principal', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'depreciation', column: 'A_Depreciation_Acct', type: 'selector', label: 'Depreciation', required: true, section: 'principal', reference: 'ValidCombination', inputMode: 'selector' },
];
// @sf-generated-end fields:assetAcct

// @sf-generated-start component:AssetAcctForm
export default function AssetAcctForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
AssetAcctForm.hasCollapsedFields = false;
// @sf-generated-end component:AssetAcctForm
