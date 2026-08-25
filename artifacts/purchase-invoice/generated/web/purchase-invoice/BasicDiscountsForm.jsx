import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:basicDiscounts
const fields = [
  { key: 'lineNo', column: 'Line', type: 'number', label: 'Line No.', required: true, section: 'principal', defaultValue: '@SQL=SELECT COALESCE(MAX(LINE),0)+10 AS DefaultValue FROM C_INVOICE_DISCOUNT WHERE C_INVOICE_ID=@C_INVOICE_ID@', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'discount', column: 'C_Discount_ID', type: 'selector', label: 'Basic Discount', required: true, section: 'principal', reference: 'Discount', inputMode: 'selector', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'cascade', column: 'Cascade', type: 'checkbox', label: 'Cascade', required: true, section: 'principal' },
];
// @sf-generated-end fields:basicDiscounts

// @sf-generated-start component:BasicDiscountsForm
export default function BasicDiscountsForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
BasicDiscountsForm.fields = fields;

// @sf-generated-end component:BasicDiscountsForm
