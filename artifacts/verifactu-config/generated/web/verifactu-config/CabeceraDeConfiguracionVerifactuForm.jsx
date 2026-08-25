import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:cabeceraDeConfiguraciónVerifactu
const fields = [
  { key: 'tAXType', column: 'TAX_Type', type: 'select', label: 'Impuesto de Aplicación', required: true, section: 'principal', options: [{ value: '03', label: 'IGIC' }, { value: '02', label: 'IPSI' }, { value: '01', label: 'IVA' }], readOnlyLogic: (record) => record['isReady'] === 'Y' },
  { key: 'defaultQR', column: 'Default_Qr', type: 'checkbox', label: 'QR Por Defecto', required: true, section: 'principal' },
  { key: 'issuerNIF', column: 'Issuer_Nif', type: 'text', label: 'NIF de Emisor', readOnly: true, section: 'other' },
  { key: 'systemStartat', column: 'System_Startat', type: 'text', label: 'Arranque del Sistema', readOnly: true, section: 'other' },
  { key: 'systemStopat', column: 'System_Stopat', type: 'text', label: 'Parada del Sistema', readOnly: true, section: 'other' },
  { key: 'incidentReport', column: 'Incident_Report', type: 'text', label: 'Detalle Incidencia', readOnly: true, section: 'other' },
];
// @sf-generated-end fields:cabeceraDeConfiguraciónVerifactu

// @sf-generated-start component:CabeceraDeConfiguracionVerifactuForm
export default function CabeceraDeConfiguracionVerifactuForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
CabeceraDeConfiguracionVerifactuForm.fields = fields;

// @sf-generated-end component:CabeceraDeConfiguracionVerifactuForm
