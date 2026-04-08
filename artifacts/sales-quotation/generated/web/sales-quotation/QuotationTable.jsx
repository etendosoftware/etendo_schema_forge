import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:quotation
const columns = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
  { key: 'orderDate', column: 'DateOrdered', type: 'date' },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'string' },
  { key: 'validUntil', column: 'validuntil', type: 'date' },
  { key: 'documentStatus', column: 'DocStatus', type: 'status', display: 'dot' },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount' },
];
// @sf-generated-end columns:quotation

const filters = ['documentNo', 'orderDate', 'businessPartner', 'validUntil', 'documentStatus'];

// @sf-generated-start component:QuotationTable
export default function QuotationTable(props) {
  // @sf-custom-slot hooks:QuotationTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:QuotationTable

// @sf-custom-slot section:QuotationTable-custom
