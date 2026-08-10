import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:reversedInvoices
const fields = [
  { key: 'reversedInvoice', column: 'Reversed_C_Invoice_ID', type: 'search', label: 'Reversed Invoice', required: true, lookup: true, section: 'principal', reference: 'Invoice', inputMode: 'search', readOnlyLogic: (record) => record['processed'] === true && record['documentStatus'] !== 'VO' },
  { key: 'aEAT349IsCorrective', column: 'EM_AEAT349_IsCorrective', type: 'checkbox', label: 'Correctiva del 349', section: 'principal', readOnlyLogic: (record) => record['processed'] === true && record['documentStatus'] !== 'VO' },
  { key: 'aEAT349CYear', column: 'EM_AEAT349_C_Year_ID', type: 'search', label: 'Año', section: 'principal', reference: 'Year', inputMode: 'search', readOnlyLogic: (record) => record['processed'] === true && record['documentStatus'] !== 'VO' },
  { key: 'aEAT349Period', column: 'EM_AEAT349_Period', type: 'select', label: 'Periodo', section: 'principal', options: [{ value: '0A', label: '0A - Anual' }, { value: '1T', label: '1T - Primer Trimestre' }, { value: '2T', label: '2T - Segundo Trimestre' }, { value: '3T', label: '3T - Tercer Trimestre' }, { value: '4T', label: '4T - Cuarto Trimestre' }, { value: '01', label: '01 - Enero' }, { value: '02', label: '02 - Febrero' }, { value: '03', label: '03 - Marzo' }, { value: '04', label: '04 - Abril' }, { value: '05', label: '05 - Mayo' }, { value: '06', label: '06 - Junio' }, { value: '07', label: '07 - Julio' }, { value: '08', label: '08 - Agosto' }, { value: '09', label: '09 - Septiembre' }, { value: '10', label: '10 - Octubre' }, { value: '11', label: '11 - Noviembre' }, { value: '12', label: '12 - Diciembre' }], readOnlyLogic: (record) => record['processed'] === true && record['documentStatus'] !== 'VO' },
  { key: 'aEAT349BPBaseAmount', column: 'EM_AEAT349_BP_BaseAmount', type: 'number', label: 'Base Imponible del 349 Productos', section: 'other', readOnlyLogic: (record) => record['processed'] === true && record['documentStatus'] !== 'VO' },
  { key: 'aEAT349BPBaseAmountS', column: 'EM_AEAT349_BP_BaseAmount_S', type: 'number', label: 'Base Imponible del 349 Servicios', section: 'other', readOnlyLogic: (record) => record['processed'] === true && record['documentStatus'] !== 'VO' },
];
// @sf-generated-end fields:reversedInvoices

// @sf-generated-start component:ReversedInvoicesForm
export default function ReversedInvoicesForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:ReversedInvoicesForm
