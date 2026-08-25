import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:header
const fields = [
  { key: 'etsgSifTerritory', column: 'ETSG_SIF_Territory', type: 'select', label: 'Territorio SIF', readOnly: true, section: 'other', options: [{ value: 'AEAT', label: 'AEAT (Agencia Estatal de Administración Tributaria)' }, { value: 'ARABA', label: 'Araba/Álava (Hacienda Foral de Álava)' }, { value: 'BIZKAIA', label: 'Bizkaia (Hacienda Foral de Bizkaia)' }, { value: 'GIPUZKOA', label: 'Gipuzkoa (Hacienda Foral de Gipuzkoa)' }, { value: 'IGIC', label: 'IGIC (Islas Canarias)' }, { value: 'NAVARRA', label: 'Navarra (Hacienda Foral de Navarra)' }] },
  { key: 'tbaisystemdate', column: 'Tbaisystemdate', type: 'date', label: 'Fecha Acogida TBAI', required: true, section: 'principal' },
  { key: 'productionEnv', column: 'Production_Env', type: 'checkbox', label: 'Entorno de Producción', required: true, section: 'principal', defaultValue: 'Y' },
  { key: 'invoiceDescription', column: 'Invoice_Description', type: 'textarea', label: 'Descripción de Facturas', required: true, section: 'principal', defaultValue: 'Descripcion Factura' },
  { key: 'uSEAsproductDesc', column: 'USE_Asproduct_Desc', type: 'checkbox', label: 'Utilizar descripción también para nombre producto', required: true, section: 'principal' },
  { key: 'autoSendInvoices', column: 'Auto_Send_Invoices', type: 'checkbox', label: 'Auto enviar facturas al completarse', required: true, section: 'other' },
  { key: 'jasperreportPath', column: 'Jasperreport_Path', type: 'text', label: 'Ruta de Reporte Jasper', section: 'other' },
  { key: 'validatePreviousInvoice', column: 'Validate_Previous_Invoice', type: 'checkbox', label: 'Validar factura anterior', required: true, section: 'other' },
];
// @sf-generated-end fields:header

// @sf-generated-start component:HeaderForm
export default function HeaderForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
HeaderForm.fields = fields;

// @sf-generated-end component:HeaderForm
