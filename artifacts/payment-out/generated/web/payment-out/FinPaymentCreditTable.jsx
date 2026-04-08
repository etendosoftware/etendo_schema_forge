import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:finPaymentCredit
const columns = [

];
// @sf-generated-end columns:finPaymentCredit

const filters = [];

// @sf-generated-start component:FinPaymentCreditTable
export default function FinPaymentCreditTable(props) {
  // @sf-custom-slot hooks:FinPaymentCreditTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:FinPaymentCreditTable

// @sf-custom-slot section:FinPaymentCreditTable-custom
