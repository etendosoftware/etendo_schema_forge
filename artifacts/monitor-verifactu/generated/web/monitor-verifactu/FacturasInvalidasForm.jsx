import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:facturasInválidas
const fields = [
  { key: 'issuerTaxID', column: 'Legal_Entity_Nif', type: 'text', label: 'NIF de Entidad Legal', section: 'principal' },
  { key: 'active', column: 'Isactive', type: 'checkbox', label: 'Activo', section: 'principal' },
  { key: 'errorReason', column: 'Error_Reason', type: 'text', label: 'Descripción Error Registro', section: 'principal' },
  { key: 'typeOperation', column: 'Type_Operation', type: 'select', label: 'Tipo de Operación', section: 'principal', options: [{ value: 'AL', label: 'ALTA' }, { value: 'BA', label: 'BAJA' }] },
  { key: 'isSubsanation', column: 'Issubsanation', type: 'checkbox', label: 'Es Subsanación', section: 'other' },
  { key: 'invoice', column: 'C_Invoice_ID', type: 'selector', label: 'Factura', section: 'other', reference: 'Invoice', inputMode: 'selector' },
  { key: 'verifactuSendingStatus', column: 'EM_Etvfac_Invoice_Status', type: 'select', label: 'Estado de Envío a Verifactu', section: 'other', options: [{ value: 'AC', label: 'Aceptada' }, { value: 'AE', label: 'Aceptada con Errores' }, { value: 'IN', label: 'Inválida' }, { value: 'PE', label: 'Pendiente' }, { value: 'ER', label: 'Rechazada' }] },
];
// @sf-generated-end fields:facturasInválidas

// @sf-generated-start component:FacturasInvalidasForm
export default function FacturasInvalidasForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
FacturasInvalidasForm.fields = fields;

// @sf-generated-end component:FacturasInvalidasForm
