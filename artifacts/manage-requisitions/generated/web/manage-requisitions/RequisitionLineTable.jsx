import { DataTable } from '@/components/contract-ui';

const columns = [
  { key: 'lineNo', label: 'Line No', type: 'number' },
  { key: 'product', label: 'Product', type: 'string' },
  { key: 'quantity', label: 'Quantity', type: 'number' },
  { key: 'unitPrice', label: 'Unit Price', type: 'amount' },
  { key: 'lineNetAmount', label: 'Line Net Amount', type: 'amount' },
  { key: 'needByDate', label: 'Need By Date', type: 'date' },
  { key: 'businessPartner', label: 'Business Partner', type: 'string' },
  { key: 'uom', label: 'Uom', type: 'string' },
  { key: 'matchedPOQty', label: 'Matched P O Qty', type: 'number' },
  { key: 'requisitionOrder', label: 'Requisition Order', type: 'string' },
];

const filters = ['product'];

export default function RequisitionLineTable(props) {
  return <DataTable columns={columns} filters={filters} {...props} />;
}
