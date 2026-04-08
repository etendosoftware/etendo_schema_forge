import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:finPaymentScheduleDetail
const fields = [
  { key: 'dueDate', column: 'DueDate', type: 'date', readOnly: true, section: 'other' },
  { key: 'invoiceAmount', column: 'InvoiceAmount', type: 'number', readOnly: true, section: 'other' },
  { key: 'expected', column: 'ExpectedAmount', type: 'number', readOnly: true, section: 'other' },
  { key: 'amount', column: 'Amount', type: 'number', required: true, section: 'principal' },
  { key: 'orderPaymentSchedule', column: 'FIN_Payment_Schedule_Order', type: 'search', section: 'principal', reference: 'Payment_Schedule', inputMode: 'search' },
  { key: 'invoicePaymentSchedule', column: 'FIN_Payment_Schedule_Invoice', type: 'search', section: 'principal', reference: 'Payment_Schedule', inputMode: 'search' },
  { key: 'gLItem', column: 'C_Glitem_ID', type: 'selector', section: 'principal', reference: 'Glitem', inputMode: 'selector' },
  { key: 'canceled', column: 'Iscanceled', type: 'checkbox', required: true, section: 'other' },
  { key: 'businessPartner', column: 'C_Bpartner_ID', type: 'search', section: 'other', reference: 'BPartner', inputMode: 'search', visible: null, visibilitySource: 'server', displayLogicReason: 'server-macro' },
  { key: 'activity', column: 'C_Activity_ID', type: 'selector', section: 'other', reference: 'Activity', inputMode: 'selector', visible: null, visibilitySource: 'server', displayLogicReason: 'accounting-dimension' },
  { key: 'product', column: 'M_Product_ID', type: 'search', section: 'other', reference: 'Product', inputMode: 'search', visible: null, visibilitySource: 'server', displayLogicReason: 'server-macro' },
  { key: 'salesCampaign', column: 'C_Campaign_ID', type: 'selector', section: 'other', reference: 'Campaign', inputMode: 'selector', visible: null, visibilitySource: 'server', displayLogicReason: 'accounting-dimension' },
  { key: 'project', column: 'C_Project_ID', type: 'search', section: 'other', reference: 'Project', inputMode: 'search', visible: null, visibilitySource: 'server', displayLogicReason: 'server-macro' },
  { key: 'salesRegion', column: 'C_Salesregion_ID', type: 'selector', section: 'other', reference: 'SalesRegion', inputMode: 'selector', visible: null, visibilitySource: 'server', displayLogicReason: 'accounting-dimension' },
  { key: 'costCenter', column: 'C_Costcenter_ID', type: 'selector', section: 'other', reference: 'Costcenter', inputMode: 'selector', visible: null, visibilitySource: 'server', displayLogicReason: 'server-macro' },
  { key: 'stDimension', column: 'User1_ID', type: 'selector', section: 'other', reference: 'User1', inputMode: 'selector', visible: null, visibilitySource: 'server', displayLogicReason: 'server-macro' },
  { key: 'ndDimension', column: 'User2_ID', type: 'selector', section: 'other', reference: 'User2', inputMode: 'selector', visible: null, visibilitySource: 'server', displayLogicReason: 'server-macro' },
];
// @sf-generated-end fields:finPaymentScheduleDetail

// @sf-generated-start component:FinPaymentScheduleDetailForm
export default function FinPaymentScheduleDetailForm(props) {
  // @sf-custom-slot hooks:FinPaymentScheduleDetailForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:FinPaymentScheduleDetailForm

// @sf-custom-slot section:FinPaymentScheduleDetailForm-custom
