import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:tax
const fields = [
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'principal' },
  { key: 'rate', column: 'Rate', type: 'number', label: 'Rate', required: true, section: 'principal' },
  { key: 'applicableTo', column: 'SOPOType', type: 'select', label: 'Sales/Purchase Type', required: true, section: 'principal', options: [{ value: 'B', label: 'Both', labels: {"es_ES":"Ambos"} }, { value: 'P', label: 'Purchase Tax', labels: {"es_ES":"Impuesto compras"} }, { value: 'S', label: 'Sales Tax', labels: {"es_ES":"Impuesto ventas"} }], defaultValue: 'B' },
  { key: 'validFrom', column: 'ValidFrom', type: 'date', label: 'Valid From Date', required: true, section: 'principal' },
  { key: 'docTaxAmount', column: 'DocTaxAmount', type: 'select', label: 'Document Tax Amount Calculation', required: true, section: 'principal', options: [{ value: 'D', label: 'Document based amount by rate', labels: {"es_ES":"Suma de las bases imponibles de las lineas por el porcentaje"} }, { value: 'L', label: 'Line based amount by rate', labels: {"es_ES":"Suma del importe de los impuestos de las lineas"} }], defaultValue: 'D' },
  { key: 'baseAmount', column: 'BaseAmount', type: 'select', label: 'Base Amount', required: true, section: 'principal', options: [{ value: 'TBA', label: 'Alternate Tax Base Amount', labels: {"es_ES":"Base de impuesto alternativa"} }, { value: 'TBATAX', label: 'Alternate Tax Base Amount + Tax Amount', labels: {"es_ES":"Base imponible alternativa + Impuestos"} }, { value: 'LNA', label: 'Line Net Amount', labels: {"es_ES":"Importe neto de línea"} }, { value: 'LNATAX', label: 'Line Net Amount + Tax Amount', labels: {"es_ES":"Importe neto de línea + Importe de impuestos"} }, { value: 'TAX', label: 'Tax Amount', labels: {"es_ES":"Importe de impuestos"} }], defaultValue: 'LNA' },
];
// @sf-generated-end fields:tax

// @sf-generated-start component:TaxForm
export default function TaxForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:TaxForm
