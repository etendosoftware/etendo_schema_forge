import { EntityForm } from '@/components/contract-ui';
import AccountCodeField from '../../../custom/AccountCodeField';

// @sf-generated-start fields:elementValue
const fields = [
  { key: 'searchKey', column: 'Value', type: 'text', label: 'Search Key', required: true, section: 'principal', readOnlyLogic: (record) => record['protectedParentLikeSubaccount'] === 'Y', customRenderer: AccountCodeField },
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'principal', readOnlyLogic: (record) => record['protectedParentLikeSubaccount'] === 'Y' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'principal', readOnlyLogic: (record) => record['protectedParentLikeSubaccount'] === 'Y' },
  { key: 'accountType', column: 'AccountType', type: 'select', label: 'Account Type', required: true, section: 'principal', options: [{ value: 'A', label: 'Asset', labels: {"es_ES":"Activo"} }, { value: 'E', label: 'Expense', labels: {"es_ES":"Gasto"} }, { value: 'L', label: 'Liability', labels: {"es_ES":"Pasivo"} }, { value: 'M', label: 'Memo', labels: {"es_ES":"Memorandum"} }, { value: 'O', label: 'Owner\'s Equity', labels: {"es_ES":"Sindicato propietarios"} }, { value: 'R', label: 'Revenue', labels: {"es_ES":"Ingreso"} }], defaultValue: 'E', readOnlyLogic: (record) => record['protectedParentLikeSubaccount'] === 'Y' },
  { key: 'active', column: 'IsActive', type: 'checkbox', label: 'Active', required: true, readOnly: true, section: 'other', defaultValue: 'Y' },
];
// @sf-generated-end fields:elementValue

// @sf-generated-start component:ElementValueForm
export default function ElementValueForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:ElementValueForm
