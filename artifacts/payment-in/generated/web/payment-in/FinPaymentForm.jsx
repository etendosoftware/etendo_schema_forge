import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:finPayment
const fields = [
  { key: 'etblkpAccountingstatus', column: 'EM_Etblkp_Accountingstatus', type: 'select', label: 'Accounting Status', required: true, readOnly: true, section: 'other', options: [{ value: 'NC', label: 'Cost Not Calculated' }, { value: 'd', label: 'Disabled For Background' }, { value: 'D', label: 'Document Disabled' }, { value: 'L', label: 'Document Locked' }, { value: 'E', label: 'Error' }, { value: 'C', label: 'Error, No cost' }, { value: 'i', label: 'Invalid Account' }, { value: 'AD', label: 'No Accounting Date' }, { value: 'DT', label: 'No Document Type' }, { value: 'NO', label: 'No Related PO' }, { value: 'b', label: 'Not Balanced' }, { value: 'c', label: 'Not Convertible (no rate)' }, { value: 'l', label: 'Pending Refresh' }, { value: 'p', label: 'Period Closed' }, { value: 'y', label: 'Post Prepared' }, { value: 'Y', label: 'Posted' }, { value: 'T', label: 'Table Disabled' }, { value: 'N', label: 'Unposted' }], defaultValue: 'N' },
];
// @sf-generated-end fields:finPayment

// @sf-generated-start component:FinPaymentForm
export default function FinPaymentForm(props) {
  return <EntityForm fields={fields} cols={3} {...props} />;
}

// @sf-generated-end component:FinPaymentForm
