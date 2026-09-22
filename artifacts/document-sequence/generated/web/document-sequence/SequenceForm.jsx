import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:sequence
const fields = [
  { key: 'name', column: 'Name', type: 'select', label: 'Name', required: true, readOnly: true, section: 'principal', options: [{ value: 'Purchase Order', label: 'documentSequencePurchaseOrder' }, { value: 'Standard Order', label: 'documentSequenceSalesOrder' }, { value: 'AR Invoice', label: 'documentSequenceSalesInvoice' }, { value: 'Factura Rectificativa (Ventas)', label: 'documentSequenceSalesCorrectiveInvoice' }, { value: 'AP Invoice', label: 'documentSequencePurchaseInvoice' }, { value: 'Factura Rectificativa (Compras)', label: 'documentSequencePurchaseCorrectiveInvoice' }] },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'principal', maxLength: 255 },
  { key: 'nextAssignedNumber', column: 'CurrentNext', type: 'number', label: 'Next Assigned Number', required: true, section: 'principal', defaultValue: '1000000', integer: true },
  { key: 'startingNo', column: 'StartNo', type: 'number', label: 'Starting No.', required: true, section: 'principal', defaultValue: '1000000', integer: true },
  { key: 'prefix', column: 'Prefix', type: 'text', label: 'Prefix', section: 'principal', maxLength: 10 },
];
// @sf-generated-end fields:sequence

// @sf-generated-start component:SequenceForm
export default function SequenceForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
SequenceForm.fields = fields;

// @sf-generated-end component:SequenceForm
