import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:quotation
const columns = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string', label: 'Document No.' },
  { key: 'orderDate', column: 'DateOrdered', type: 'date', label: 'Quotation Date' },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'string', label: 'Business Partner' },
  { key: 'validUntil', column: 'validuntil', type: 'date', label: 'Valid Until' },
  { key: 'documentStatus', column: 'DocStatus', type: 'status', label: 'Document Status', display: 'dot' },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount', label: 'Total Gross Amount' },
];
// @sf-generated-end columns:quotation

const filters = ['documentNo', 'orderDate', 'businessPartner', 'validUntil', 'documentStatus'];

// @sf-generated-start component:QuotationTable
export default function QuotationTable(props) {
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:QuotationTable
