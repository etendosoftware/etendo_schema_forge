import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:siiData
const fields = [
  { key: 'conexinSII', column: 'Aeatsii_Conexion_ID', type: 'selector', label: 'SII Connection', section: 'principal', reference: 'Aeatsii_Conexion', inputMode: 'selector' },
  { key: 'cdigoCSV', column: 'Codigo_Csv', type: 'text', label: 'CSV code', section: 'principal' },
  { key: 'estadoRegistro', column: 'Estado', type: 'select', label: 'SII Registration Status', required: true, section: 'principal', options: [{ value: 'AE', label: 'Accepted with errors' }, { value: 'AN', label: 'Annulled' }, { value: 'IN', label: 'Incorrect' }, { value: 'NR', label: 'Not Registrable to SII' }, { value: 'PE', label: 'Pending to send to SII' }, { value: 'CO', label: 'Right' }, { value: 'EE', label: 'Sending error' }, { value: 'BA', label: 'Unsubscribed' }] },
  { key: 'comunicacion', column: 'Comunicacion', type: 'select', label: 'Communication type', section: 'principal', options: [{ value: 'A0', label: 'Alta en SII (A0)' }, { value: 'A1', label: 'Modification to SII (A1)' }, { value: 'Q', label: 'SII Query' }] },
  { key: 'motivo', column: 'Motivo', type: 'text', label: 'SII error reason', section: 'other' },
  { key: 'estadoCuadre', column: 'Estado_Cuadre', type: 'select', label: 'SII assort status', section: 'other', options: [{ value: '1', label: '1 - Not contrastable' }, { value: '2', label: '2 - In contrasting process' }, { value: '3', label: '3 - Not contrasted' }, { value: '4', label: '4 - Partially contrasted' }, { value: '5', label: '5 - Contrasted' }] },
  { key: 'fechaCuadre', column: 'Fecha_Cuadre', type: 'date', label: 'SII assort date', section: 'other' },
  { key: 'fechaltimaModificacinSII', column: 'Fecha_Ultima_Modif_Sii', type: 'date', label: 'SII last modification date', section: 'other' },
];
// @sf-generated-end fields:siiData

// @sf-generated-start component:SiiDataForm
export default function SiiDataForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:SiiDataForm
