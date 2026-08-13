import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:issuedInvoicesSiiData
const fields = [
  { key: 'invoice', column: 'C_Invoice_ID', type: 'selector', label: 'Invoice', required: true, readOnly: true, section: 'other', reference: 'Invoice', inputMode: 'selector' },
  { key: 'conexinSII', column: 'Aeatsii_Conexion_ID', type: 'selector', label: 'SII Connection', section: 'principal', reference: 'Aeatsii_Conexion', inputMode: 'selector' },
  { key: 'cdigoCSV', column: 'Codigo_Csv', type: 'text', label: 'CSV code', section: 'principal' },
  { key: 'estadoRegistro', column: 'Estado', type: 'select', label: 'SII Registration Status', required: true, section: 'principal', options: [{ value: 'AE', label: 'Accepted with errors', labels: {"es_ES":"Aceptado con errores"} }, { value: 'AN', label: 'Annulled', labels: {"es_ES":"Anulado"} }, { value: 'IN', label: 'Incorrect', labels: {"es_ES":"Incorrecto"} }, { value: 'NR', label: 'Not Registrable to SII', labels: {"es_ES":"No Declarable en SII"} }, { value: 'PE', label: 'Pending to send to SII', labels: {"es_ES":"Pendiente de enviar a SII"} }, { value: 'CO', label: 'Right', labels: {"es_ES":"Correcto"} }, { value: 'EE', label: 'Sending error', labels: {"es_ES":"Error al enviar"} }, { value: 'BA', label: 'Unsubscribed', labels: {"es_ES":"Baja"} }] },
  { key: 'comunicacion', column: 'Comunicacion', type: 'select', label: 'Communication type', section: 'principal', options: [{ value: 'A0', label: 'Alta en SII (A0)', labels: {"es_ES":"Alta en SII (A0)"} }, { value: 'A1', label: 'Modification to SII (A1)', labels: {"es_ES":"Modificación a SII (A1)"} }, { value: 'Q', label: 'SII Query', labels: {"es_ES":"Consulta SII"} }] },
  { key: 'motivo', column: 'Motivo', type: 'text', label: 'SII error reason', section: 'other' },
  { key: 'estadoCuadre', column: 'Estado_Cuadre', type: 'select', label: 'SII assort status', section: 'other', options: [{ value: '1', label: '1 - Not contrastable', labels: {"es_ES":"1 - No contrastable"} }, { value: '2', label: '2 - In contrasting process', labels: {"es_ES":"2 - En proceso de contraste"} }, { value: '3', label: '3 - Not contrasted', labels: {"es_ES":"3 - No contrastada"} }, { value: '4', label: '4 - Partially contrasted', labels: {"es_ES":"4 - Parcialmente constrastada"} }, { value: '5', label: '5 - Contrasted', labels: {"es_ES":"5 - Contrastada"} }] },
  { key: 'fechaCuadre', column: 'Fecha_Cuadre', type: 'date', label: 'SII assort date', section: 'other' },
  { key: 'fechaltimaModificacinSII', column: 'Fecha_Ultima_Modif_Sii', type: 'date', label: 'SII last modification date', section: 'other' },
];
// @sf-generated-end fields:issuedInvoicesSiiData

// @sf-generated-start component:IssuedInvoicesSiiDataForm
export default function IssuedInvoicesSiiDataForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:IssuedInvoicesSiiDataForm
