import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:bpartner
const fields = [
  { key: 'name', column: 'Name', type: 'text', label: 'Commercial Name', required: true, section: 'principal' },
  { key: 'searchKey', column: 'Value', type: 'text', label: 'Search Key', required: true, section: 'principal' },
  { key: 'active', column: 'IsActive', type: 'checkbox', label: 'Active', required: true, readOnly: true, section: 'other', defaultValue: 'Y' },
  { key: 'businessPartnerCategory', column: 'C_BP_Group_ID', type: 'selector', label: 'Business Partner Category', required: true, section: 'principal', reference: 'BusinessPartnerCategory', inputMode: 'selector', defaultValue: '@SQL=SELECT MAX(C_BP_GROUP_ID) FROM C_BP_GROUP WHERE AD_ISORGINCLUDED(@AD_ORG_ID@, AD_ORG_ID, @#AD_CLIENT_ID@) <> -1 AND ISDEFAULT = \'Y\' AND AD_CLIENT_ID = @#AD_CLIENT_ID@' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'principal' },
  { key: 'creditLimit', column: 'SO_CreditLimit', type: 'number', label: 'Credit Limit', required: true, section: 'other' },
  { key: 'creditUsed', column: 'SO_CreditUsed', type: 'number', label: 'Credit Used', required: true, readOnly: true, section: 'other' },
  { key: 'taxID', column: 'TaxID', type: 'text', label: 'TaxID', section: 'other' },
];
// @sf-generated-end fields:bpartner

// @sf-generated-start component:BpartnerForm
export default function BpartnerForm(props) {
  // @sf-custom-slot hooks:BpartnerForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:BpartnerForm

// @sf-custom-slot section:BpartnerForm-custom
