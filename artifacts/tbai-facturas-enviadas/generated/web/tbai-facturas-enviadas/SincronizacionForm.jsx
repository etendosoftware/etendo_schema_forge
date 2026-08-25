import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:sincronización
const fields = [
  { key: 'active', column: 'Isactive', type: 'checkbox', label: 'Activo', required: true, section: 'principal', defaultValue: 'Y' },
  { key: 'estado', column: 'Estado', type: 'text', label: 'Estado', readOnly: true, section: 'other' },
  { key: 'descripcion', column: 'Descripcion', type: 'text', label: 'Descripción', readOnly: true, section: 'other' },
  { key: 'invoice', column: 'C_Invoice_ID', type: 'selector', label: 'Factura', required: true, readOnly: true, section: 'other', reference: 'Invoice', inputMode: 'selector' },
];
// @sf-generated-end fields:sincronización

// @sf-generated-start component:SincronizacionForm
export default function SincronizacionForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
SincronizacionForm.fields = fields;

// @sf-generated-end component:SincronizacionForm
