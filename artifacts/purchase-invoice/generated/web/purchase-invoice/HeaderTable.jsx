import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:header
const columns = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string', label: 'Document No.' },
  { key: 'invoiceDate', column: 'DateInvoiced', type: 'date', label: 'Invoice Date' },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'string', label: 'Business Partner' },
  { key: 'paymentTerms', column: 'C_PaymentTerm_ID', type: 'string', label: 'Payment Terms' },
  { key: 'documentStatus', column: 'DocStatus', type: 'status', label: 'Document Status' },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount', label: 'Total Gross Amount' },
  { key: 'summedLineAmount', column: 'TotalLines', type: 'amount', label: 'Total Net Amount' },
  { key: 'currency', column: 'C_Currency_ID', type: 'string', label: 'Currency' },
  { key: 'paymentComplete', column: 'Ispaid', type: 'boolean', label: 'Payment Complete' },
  { key: 'totalPaid', column: 'Totalpaid', type: 'amount', label: 'Total Paid' },
  { key: 'outstandingAmount', column: 'OutstandingAmt', type: 'amount', label: 'Total Outstanding' },
  { key: 'dueAmount', column: 'DueAmt', type: 'amount', label: 'Amount Currently Due' },
];
// @sf-generated-end columns:header

const filters = ['documentNo', 'invoiceDate', 'businessPartner', 'orderReference', 'documentStatus'];

// @sf-generated-start component:HeaderTable
export default function HeaderTable(props) {
  // @sf-custom-slot hooks:HeaderTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:HeaderTable

// @sf-custom-slot section:HeaderTable-custom
