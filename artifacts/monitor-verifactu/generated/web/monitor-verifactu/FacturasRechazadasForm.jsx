import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:facturasRechazadas
const fields = [
  { key: 'issuerTaxID', column: 'Legal_Entity_Nif', type: 'text', label: 'NIF de Entidad Legal', section: 'principal' },
  { key: 'active', column: 'Isactive', type: 'checkbox', label: 'Activo', section: 'principal' },
  { key: 'sentToVerifactu', column: 'EM_Etvfac_Senttoverifac', type: 'checkbox', label: 'Enviado a Verifactu', section: 'principal' },
  { key: 'errorReason', column: 'Error_Reason', type: 'text', label: 'Descripción Error Registro', section: 'principal' },
  { key: 'cSV', column: 'Csv', type: 'text', label: 'CSV', section: 'other' },
  { key: 'typeOperation', column: 'Type_Operation', type: 'select', label: 'Tipo de Operación', section: 'other', options: [{ value: 'AL', label: 'ALTA' }, { value: 'BA', label: 'BAJA' }] },
  { key: 'codeError', column: 'Code_Error', type: 'text', label: 'Código de Error', section: 'other' },
  { key: 'isSubsanation', column: 'Issubsanation', type: 'checkbox', label: 'Es Subsanación', section: 'other' },
  { key: 'invoice', column: 'C_Invoice_ID', type: 'selector', label: 'Factura', section: 'other', reference: 'Invoice', inputMode: 'selector' },
  { key: 'verifactuSendingStatus', column: 'EM_Etvfac_Invoice_Status', type: 'select', label: 'Estado de Envío a Verifactu', section: 'other', options: [{ value: 'AC', label: 'Aceptada' }, { value: 'AE', label: 'Aceptada con Errores' }, { value: 'IN', label: 'Inválida' }, { value: 'PE', label: 'Pendiente' }, { value: 'ER', label: 'Rechazada' }] },
];
// @sf-generated-end fields:facturasRechazadas

// @sf-generated-start component:FacturasRechazadasForm
export default function FacturasRechazadasForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
FacturasRechazadasForm.fields = fields;

// @sf-generated-end component:FacturasRechazadasForm
