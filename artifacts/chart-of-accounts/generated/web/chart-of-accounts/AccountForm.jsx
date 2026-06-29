import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:account
const fields = [
  { key: 'code', column: 'Code', type: 'text', required: true, section: 'principal' },
  { key: 'name', column: 'Name', type: 'text', required: true, section: 'principal' },
  { key: 'accountType', column: 'AccountType', type: 'text', required: true, section: 'principal' },
  { key: 'parentAccount', column: 'Parent_ID', type: 'search', section: 'principal', reference: 'Account', inputMode: 'search' },
  { key: 'isActive', column: 'IsActive', type: 'checkbox', required: true, readOnly: true, section: 'other' },
];
// @sf-generated-end fields:account

// @sf-generated-start component:AccountForm
export default function AccountForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:AccountForm
