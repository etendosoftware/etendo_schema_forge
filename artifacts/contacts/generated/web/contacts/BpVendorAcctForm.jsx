import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:bpVendorAcct
const fields = [
  { key: 'accountingSchema', column: 'C_AcctSchema_ID', type: 'selector', label: 'General Ledger', required: true, readOnly: true, section: 'other', reference: 'AcctSchema', inputMode: 'selector' },
  { key: 'vendorLiability', column: 'V_Liability_Acct', type: 'selector', label: 'Vendor Liability', required: true, section: 'principal', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'vendorPrepayment', column: 'V_Prepayment_Acct', type: 'selector', label: 'Vendor Prepayment', section: 'principal', reference: 'ValidCombination', inputMode: 'selector' },
];
// @sf-generated-end fields:bpVendorAcct

// @sf-generated-start component:BpVendorAcctForm
export default function BpVendorAcctForm(props) {
  // @sf-custom-slot hooks:BpVendorAcctForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:BpVendorAcctForm

// @sf-custom-slot section:BpVendorAcctForm-custom
