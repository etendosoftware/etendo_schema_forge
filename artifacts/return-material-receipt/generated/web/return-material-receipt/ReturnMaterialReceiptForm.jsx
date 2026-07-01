import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:returnMaterialReceipt
const fields = [
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'search', label: 'Business Partner', required: true, section: 'principal', reference: 'BusinessPartner', inputMode: 'search', readOnlySource: 'server', readOnlyLogicReason: 'session-variable' },
  { key: 'documentNo', column: 'DocumentNo', type: 'text', label: 'Document No.', required: true, readOnly: true, section: 'principal', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'movementDate', column: 'MovementDate', type: 'date', label: 'Movement Date', required: true, section: 'principal', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'warehouse', column: 'M_Warehouse_ID', type: 'search', label: 'Warehouse', required: true, section: 'principal', reference: 'Warehouse', inputMode: 'search', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'partnerAddress', column: 'C_BPartner_Location_ID', type: 'dependent', label: 'Partner Address', required: true, section: 'principal', reference: 'BusinessPartnerLocation', inputMode: 'dependent', dependsOn: { field: 'businessPartner', filterKey: 'C_BPartner_ID' }, readOnlyLogic: (record) => record['processed'] === true },
  { key: 'sourceShipmentDocNo', column: 'sourceShipmentDocNo', type: 'text', label: 'Source Shipment', readOnly: true, section: 'principal' },
  { key: 'etblkpAccountingstatus', column: 'EM_Etblkp_Accountingstatus', type: 'select', label: 'Accounting Status', required: true, readOnly: true, section: 'other', options: [{ value: 'NC', label: 'Cost Not Calculated' }, { value: 'd', label: 'Disabled For Background' }, { value: 'D', label: 'Document Disabled' }, { value: 'L', label: 'Document Locked' }, { value: 'E', label: 'Error' }, { value: 'C', label: 'Error, No cost' }, { value: 'i', label: 'Invalid Account' }, { value: 'AD', label: 'No Accounting Date' }, { value: 'DT', label: 'No Document Type' }, { value: 'NO', label: 'No Related PO' }, { value: 'b', label: 'Not Balanced' }, { value: 'c', label: 'Not Convertible (no rate)' }, { value: 'l', label: 'Pending Refresh' }, { value: 'p', label: 'Period Closed' }, { value: 'y', label: 'Post Prepared' }, { value: 'Y', label: 'Posted' }, { value: 'T', label: 'Table Disabled' }, { value: 'N', label: 'Unposted' }], defaultValue: 'N' },
];
// @sf-generated-end fields:returnMaterialReceipt

// @sf-generated-start component:ReturnMaterialReceiptForm
export default function ReturnMaterialReceiptForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:ReturnMaterialReceiptForm
