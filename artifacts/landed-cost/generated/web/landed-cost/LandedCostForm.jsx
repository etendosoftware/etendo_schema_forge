import { EntityForm } from '@/components/contract-ui';

const fields = [
  { key: 'organization', label: 'Organization', type: 'selector', required: true, reference: 'Organization', inputMode: 'selector' },
  { key: 'dateAcct', label: 'Date Acct', type: 'date', required: true },
  { key: 'description', label: 'Description', type: 'text' },
  { key: 'isActive', label: 'Is Active', type: 'checkbox', required: true },
];

export default function LandedCostForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
