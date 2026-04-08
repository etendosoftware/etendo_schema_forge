import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:returnMaterialReceipt
const columns = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
  { key: 'movementDate', column: 'MovementDate', type: 'date' },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'string' },
  { key: 'documentStatus', column: 'DocStatus', type: 'status' },
];
// @sf-generated-end columns:returnMaterialReceipt

const filters = ['documentNo', 'movementDate', 'businessPartner', 'documentStatus'];

// @sf-generated-start component:ReturnMaterialReceiptTable
export default function ReturnMaterialReceiptTable(props) {
  // @sf-custom-slot hooks:ReturnMaterialReceiptTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:ReturnMaterialReceiptTable

// @sf-custom-slot section:ReturnMaterialReceiptTable-custom
