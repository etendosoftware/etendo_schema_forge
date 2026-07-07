import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:vendorAccounting
const fields = [
  { key: 'vendorLiability', column: 'V_Liability_Acct', type: 'selector', label: 'Vendor Liability', required: true, section: 'principal', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'vendorPrepayment', column: 'V_Prepayment_Acct', type: 'selector', label: 'Vendor Prepayment', section: 'principal', reference: 'ValidCombination', inputMode: 'selector' },
];
// @sf-generated-end fields:vendorAccounting

// @sf-generated-start component:VendorAccountingForm
export default function VendorAccountingForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:VendorAccountingForm
