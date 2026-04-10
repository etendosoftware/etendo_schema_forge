import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:lines
const fields = [
  { key: 'lineNo', column: 'Line', type: 'number', label: 'Line No.', required: true, section: 'principal', defaultValue: '@SQL=SELECT COALESCE(MAX(LINE),0)+10 AS DefaultValue FROM C_PAYMENTTERMLINE WHERE C_PAYMENTTERM_ID=@C_PAYMENTTERM_ID@' },
  { key: 'percentageDue', column: 'Percentage', type: 'number', label: 'Percentage Due', required: true, section: 'principal', defaultValue: '100' },
  { key: 'overduePaymentDaysRule', column: 'NetDays', type: 'number', label: 'Overdue Payment Days Rule', required: true, section: 'principal' },
  { key: 'offsetMonthDue', column: 'FixMonthOffset', type: 'number', label: 'Offset Month Due', section: 'principal' },
  { key: 'fixedDueDate', column: 'IsDueFixed', type: 'checkbox', label: 'Fixed Due Date', required: true, section: 'principal', defaultValue: 'N' },
  { key: 'maturityDate1', column: 'FixMonthDay', type: 'number', label: 'Maturity Date 1', section: 'principal' },
  { key: 'maturityDate2', column: 'FixMonthDay2', type: 'number', label: 'Maturity Date 2', section: 'principal' },
  { key: 'maturityDate3', column: 'Fixmonthday3', type: 'number', label: 'Maturity Date 3', section: 'principal' },
  { key: 'paymentMethod', column: 'FIN_Paymentmethod_ID', type: 'selector', label: 'Payment Method', section: 'principal', reference: 'Paymentmethod', inputMode: 'selector' },
  { key: 'rest', column: 'Onremainder', type: 'checkbox', label: 'Rest', required: true, section: 'principal', defaultValue: 'Y' },
  { key: 'excludeTax', column: 'Excludetax', type: 'checkbox', label: 'Exclude Tax', required: true, section: 'principal', defaultValue: 'N' },
  { key: 'overduePaymentDayRule', column: 'NetDay', type: 'select', label: 'Fixed Week Day', section: 'principal', options: [{ value: '1', label: 'Monday' }, { value: '2', label: 'Tuesday' }, { value: '3', label: 'Wednesday' }, { value: '4', label: 'Thursday' }, { value: '5', label: 'Friday' }, { value: '6', label: 'Saturday' }, { value: '7', label: 'Sunday' }] },
  { key: 'nextBusinessDay', column: 'IsNextBusinessDay', type: 'checkbox', label: 'Next Business Day', section: 'principal', defaultValue: 'Y' },
];
// @sf-generated-end fields:lines

// @sf-generated-start component:LinesForm
export default function LinesForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:LinesForm
