import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:assetCategory
const fields = [
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'principal' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'principal', span: 2, rows: 1 },
  { key: 'depreciate', column: 'IsDepreciated', type: 'checkbox', label: 'Depreciate', required: true, section: 'principal' },
  { key: 'depreciationType', column: 'Amortizationtype', type: 'select', label: 'Depreciation Type', required: true, section: 'principal', options: [{ value: 'LI', label: 'Linear', labels: {"es_ES":"Lineal"} }], displayLogic: (record) => record.depreciate === true || record.depreciate === 'Y' },
  { key: 'calculateType', column: 'Amortizationcalctype', type: 'select', label: 'Calculate Type', required: true, section: 'principal', options: [{ value: 'PE', label: 'Percentage', labels: {"es_ES":"Porcentaje"} }, { value: 'TI', label: 'Time', labels: {"es_ES":"Tiempo"} }], displayLogic: (record) => record.depreciate === true || record.depreciate === 'Y' },
  { key: 'annualDepreciation', column: 'Annualamortizationpercentage', type: 'number', label: 'Annual Depreciation %', section: 'principal', displayLogic: (record) => (record.depreciate === true || record.depreciate === 'Y') && record.calculateType === 'PE' },
  { key: 'amortize', column: 'Assetschedule', type: 'select', label: 'Amortize', required: true, section: 'principal', options: [{ value: 'MO', label: 'Monthly', labels: {"es_ES":"Mensualmente"} }, { value: 'YE', label: 'Yearly', labels: {"es_ES":"Anualmente"} }], displayLogic: (record) => (record.depreciate === true || record.depreciate === 'Y') && record.calculateType === 'TI' },
  { key: 'usableLifeMonths', column: 'UseLifeMonths', type: 'number', label: 'Usable Life - Months', section: 'principal', displayLogic: (record) => (record.depreciate === true || record.depreciate === 'Y') && record.calculateType === 'TI' },
];
// @sf-generated-end fields:assetCategory

// @sf-generated-start component:AssetCategoryForm
export default function AssetCategoryForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:AssetCategoryForm
