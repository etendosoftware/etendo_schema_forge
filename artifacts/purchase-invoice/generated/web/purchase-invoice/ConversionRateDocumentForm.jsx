import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:conversionRateDocument
const fields = [
  { key: 'active', column: 'Isactive', type: 'checkbox', label: 'Active', required: true, section: 'principal' },
  { key: 'currency', column: 'C_Currency_ID', type: 'selector', label: 'Currency', required: true, readOnly: true, section: 'other', reference: 'Currency', inputMode: 'selector' },
  { key: 'toCurrency', column: 'C_Currency_Id_To', type: 'search', label: 'To Currency', required: true, section: 'principal', reference: 'Currency', inputMode: 'search' },
  // @sf-custom-slot callout:SE_CalculateExchangeRate
  { key: 'rate', column: 'Rate', type: 'text', label: 'Rate', section: 'principal' },
  // @sf-custom-slot callout:SE_CalculateExchangeRate
  { key: 'foreignAmount', column: 'Foreign_Amount', type: 'number', label: 'Foreign  Amount', required: true, section: 'principal' },
];
// @sf-generated-end fields:conversionRateDocument

// @sf-generated-start component:ConversionRateDocumentForm
export default function ConversionRateDocumentForm(props) {
  // @sf-custom-slot hooks:ConversionRateDocumentForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:ConversionRateDocumentForm

// @sf-custom-slot section:ConversionRateDocumentForm-custom
