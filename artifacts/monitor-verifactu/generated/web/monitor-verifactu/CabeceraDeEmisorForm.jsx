import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:cabeceraDeEmisor
const fields = [
  { key: 'active', column: 'Isactive', type: 'checkbox', label: 'Activo', required: true, section: 'principal', defaultValue: 'Y' },
  { key: 'tAXType', column: 'TAX_Type', type: 'select', label: 'Impuesto de Aplicación', required: true, section: 'principal', options: [{ value: '03', label: 'IGIC' }, { value: '02', label: 'IPSI' }, { value: '01', label: 'IVA' }], readOnlyLogic: (record) => record['isReady'] === 'Y' },
  { key: 'issuerNIF', column: 'Issuer_Nif', type: 'text', label: 'NIF de Emisor', readOnly: true, section: 'other' },
  { key: 'nextSendWaitTime', column: 'Next_Send_Wait_Time', type: 'number', label: 'Tiempo de Espera para el Siguiente Envío', required: true, section: 'principal', defaultValue: '60' },
];
// @sf-generated-end fields:cabeceraDeEmisor

// @sf-generated-start component:CabeceraDeEmisorForm
export default function CabeceraDeEmisorForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
CabeceraDeEmisorForm.fields = fields;

// @sf-generated-end component:CabeceraDeEmisorForm
