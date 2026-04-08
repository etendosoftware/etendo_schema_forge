import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:header
const columns = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string', label: 'Document No.' },
  { key: 'invoiceDate', column: 'DateInvoiced', type: 'date', label: 'Invoice Date' },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'string', label: 'Business Partner' },
  { key: 'documentStatus', column: 'DocStatus', type: 'status', label: 'Document Status', display: 'dot' },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount', label: 'Total Gross Amount' },
  { key: 'paymentComplete', column: 'Ispaid', type: 'boolean', label: 'Payment Complete' },
];
// @sf-generated-end columns:header

const filters = ['documentNo', 'invoiceDate', 'businessPartner', 'documentStatus'];

// @sf-generated-start component:HeaderTable
export default function HeaderTable(props) {
  // @sf-custom-slot hooks:HeaderTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:HeaderTable

// @sf-custom-slot section:HeaderTable-custom
