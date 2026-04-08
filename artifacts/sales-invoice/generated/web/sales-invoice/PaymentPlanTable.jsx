import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:paymentPlan
const columns = [

];
// @sf-generated-end columns:paymentPlan

const filters = [];

// @sf-generated-start component:PaymentPlanTable
export default function PaymentPlanTable(props) {
  // @sf-custom-slot hooks:PaymentPlanTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:PaymentPlanTable

// @sf-custom-slot section:PaymentPlanTable-custom
