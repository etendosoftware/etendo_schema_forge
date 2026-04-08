import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:invoiceDiscount
const fields = [
  { key: 'lineNo', column: 'Line', type: 'number', label: 'Line No.', required: true, section: 'principal' },
  { key: 'discount', column: 'C_Discount_ID', type: 'selector', label: 'Basic Discount', required: true, section: 'principal', reference: 'Discount', inputMode: 'selector' },
  { key: 'cascade', column: 'Cascade', type: 'checkbox', label: 'Cascade', required: true, section: 'principal' },
];
// @sf-generated-end fields:invoiceDiscount

// @sf-generated-start component:InvoiceDiscountForm
export default function InvoiceDiscountForm(props) {
  // @sf-custom-slot hooks:InvoiceDiscountForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:InvoiceDiscountForm

// @sf-custom-slot section:InvoiceDiscountForm-custom
