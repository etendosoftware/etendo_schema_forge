import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:taxCategory
const fields = [
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'principal' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'principal' },
  { key: 'default', column: 'IsDefault', type: 'checkbox', label: 'Default', required: true, section: 'principal' },
  { key: 'asbom', column: 'Asbom', type: 'checkbox', label: 'As per BOM', required: true, section: 'principal' },
  { key: 'obsptiTaxtype', column: 'EM_Obspti_Taxtype', type: 'select', label: 'Tax type', section: 'principal', options: [{ value: 'IGIC', label: 'IGIC', labels: {"es_ES":"IGIC"} }, { value: 'IPSI', label: 'IPSI', labels: {"es_ES":"IPSI"} }, { value: 'IVA', label: 'IVA', labels: {"es_ES":"IVA"} }, { value: 'VAT', label: 'VAT', labels: {"es_ES":"IVA"} }] },
  { key: 'obsptiTransactiontype', column: 'EM_Obspti_Transactiontype', type: 'select', label: 'Transaction type', section: 'principal', options: [{ value: 'BI', label: 'Entrega/Adquisición de bienes', labels: {"es_ES":"Entrega/Adquisición de bienes"} }, { value: 'SE', label: 'Prestación de Servicios', labels: {"es_ES":"Prestación de Servicios"} }, { value: 'IN', label: 'Transmisión/Adquisición B.Inmuebles', labels: {"es_ES":"Transmisión/Adquisición B.Inmuebles"} }] },
  { key: 'obsptiRatetype', column: 'EM_Obspti_Ratetype', type: 'select', label: 'Rate type', section: 'principal', options: [{ value: 'CE', label: 'Cero', labels: {"es_ES":"Cero"} }, { value: 'EX', label: 'Exento', labels: {"es_ES":"Exento"} }, { value: 'GE', label: 'General', labels: {"es_ES":"General"} }, { value: 'I1', label: 'Incrementado 1', labels: {"es_ES":"Incrementado 1"} }, { value: 'I2', label: 'Incrementado 2', labels: {"es_ES":"Incrementado 2"} }, { value: 'NS', label: 'No sujeto', labels: {"es_ES":"No sujeto"} }, { value: 'NO', label: 'Normal', labels: {"es_ES":"Normal"} }, { value: 'RE', label: 'Reducido', labels: {"es_ES":"Reducido"} }, { value: 'SR', label: 'Super reducido', labels: {"es_ES":"Super reducido"} }] },
  { key: 'aeatsiiDeclarable', column: 'EM_Aeatsii_Declarable', type: 'checkbox', label: 'SII declarable', required: true, section: 'principal', defaultValue: 'Y' },
];
// @sf-generated-end fields:taxCategory

// @sf-generated-start component:TaxCategoryForm
export default function TaxCategoryForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:TaxCategoryForm
