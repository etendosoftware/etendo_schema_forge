import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:customerReturn
const fields = [
  { key: 'documentNo', column: 'DocumentNo', type: 'text', required: true, readOnly: true, section: 'principal' },
  { key: 'cReturnReasonID', column: 'C_Return_Reason_ID', type: 'search', label: 'Return Reason', section: 'principal', reference: 'ReturnReason', inputMode: 'search' },
  { key: 'orderDate', column: 'DateOrdered', type: 'date', required: true, section: 'principal' },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'search', required: true, section: 'principal', reference: 'BPartner', inputMode: 'search' },
  { key: 'partnerAddress', column: 'C_BPartner_Location_ID', type: 'dependent', label: 'Partner Address', required: true, section: 'principal', reference: 'BusinessPartnerLocation', inputMode: 'dependent', dependsOn: { field: 'businessPartner', filterKey: 'C_BPartner_ID' } },
  { key: 'warehouse', column: 'M_Warehouse_ID', type: 'search', required: true, section: 'principal', reference: 'Warehouse', inputMode: 'search' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'collapsed' },
  { key: 'salesRepresentative', column: 'SalesRep_ID', type: 'search', label: 'Sales Representative', section: 'collapsed', reference: 'User', inputMode: 'search' },
  { key: 'summedLineAmount', column: 'TotalLines', type: 'number', required: true, readOnly: true, section: 'summary' },
];
// @sf-generated-end fields:customerReturn

// @sf-generated-start component:CustomerReturnForm
export default function CustomerReturnForm(props) {
  // @sf-custom-slot hooks:CustomerReturnForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:CustomerReturnForm

// @sf-custom-slot section:CustomerReturnForm-custom
