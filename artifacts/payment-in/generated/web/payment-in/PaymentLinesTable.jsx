import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:paymentLines
const columns = [
  { key: 'dueDate', column: 'DueDate', type: 'date' },
  { key: 'invoiceAmount', column: 'InvoiceAmount', type: 'amount' },
  { key: 'expected', column: 'ExpectedAmount', type: 'amount' },
  { key: 'amount', column: 'Amount', type: 'amount' },
  { key: 'writeoffAmount', column: 'Writeoffamt', type: 'amount' },
  { key: 'businessPartner', column: 'C_Bpartner_ID', type: 'string' },
  { key: 'canceled', column: 'Iscanceled', type: 'boolean' },
];
// @sf-generated-end columns:paymentLines

const filters = [];

// @sf-generated-start component:PaymentLinesTable
export default function PaymentLinesTable(props) {
  // @sf-custom-slot hooks:PaymentLinesTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:PaymentLinesTable

// @sf-custom-slot section:PaymentLinesTable-custom
