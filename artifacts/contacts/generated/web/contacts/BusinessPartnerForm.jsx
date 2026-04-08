import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:businessPartner
const fields = [
  { key: 'name', column: 'Name', type: 'text', required: true, section: 'principal' },
  { key: 'searchKey', column: 'Value', type: 'text', required: true, section: 'principal' },
  { key: 'businessPartnerCategory', column: 'C_BP_Group_ID', type: 'selector', section: 'principal' },
  { key: 'description', column: 'Description', type: 'textarea', section: 'principal' },
  { key: 'customer', column: 'IsCustomer', type: 'checkbox', section: 'principal' },
  { key: 'vendor', column: 'IsVendor', type: 'checkbox', section: 'principal' },
  { key: 'taxID', column: 'TaxID', type: 'text', section: 'other' },
  { key: 'creditLimit', column: 'SO_CreditLimit', type: 'number', section: 'other' },
  { key: 'creditUsed', column: 'SO_CreditUsed', type: 'number', readOnly: true, section: 'other' },
  { key: 'active', column: 'IsActive', type: 'checkbox', required: true, readOnly: true, section: 'other' },
];
// @sf-generated-end fields:businessPartner

// @sf-generated-start component:BusinessPartnerForm
export default function BusinessPartnerForm(props) {
  // @sf-custom-slot hooks:BusinessPartnerForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:BusinessPartnerForm

// @sf-custom-slot section:BusinessPartnerForm-custom
