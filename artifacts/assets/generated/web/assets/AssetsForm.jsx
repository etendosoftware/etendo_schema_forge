import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:assets
const fields = [
  { key: 'searchKey', column: 'Value', type: 'text', label: 'Search Key', required: true, section: 'principal' },
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'principal' },
  // @sf-custom-slot callout:SL_Depreciate
  { key: 'assetCategory', column: 'A_Asset_Group_ID', type: 'selector', label: 'Asset Category', required: true, section: 'principal', reference: 'AssetGroup', inputMode: 'selector' },
  { key: 'documentNo', column: 'DocumentNo', type: 'text', label: 'Document No.', readOnly: true, section: 'other' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'principal' },
  { key: 'currency', column: 'C_Currency_ID', type: 'selector', label: 'Currency', section: 'other', reference: 'Currency', inputMode: 'selector', defaultValue: '@C_Currency_ID@' },
  // @sf-custom-slot callout:SL_Asset_Product
  { key: 'product', column: 'M_Product_ID', type: 'search', label: 'Product', section: 'other', reference: 'Product', inputMode: 'search' },
  { key: 'depreciate', column: 'IsDepreciated', type: 'checkbox', label: 'Depreciate', required: true, section: 'other' },
  { key: 'depreciationType', column: 'Amortizationtype', type: 'select', label: 'Depreciation Type', required: true, section: 'other', options: [{ value: 'LI', label: 'Linear' }], displayLogic: (record) => record.depreciate === true || record.depreciate === 'Y' },
  { key: 'calculateType', column: 'Amortizationcalctype', type: 'select', label: 'Calculate Type', required: true, section: 'other', options: [{ value: 'PE', label: 'Percentage' }, { value: 'TI', label: 'Time' }], displayLogic: (record) => record.depreciate === true || record.depreciate === 'Y' },
  { key: 'annualDepreciation', column: 'Annualamortizationpercentage', type: 'number', label: 'Annual Depreciation %', section: 'other', displayLogic: (record) => (record.depreciate === true || record.depreciate === 'Y') && record.calculateType !== 'TI' },
  { key: 'amortize', column: 'Assetschedule', type: 'select', label: 'Amortize', required: true, section: 'other', options: [{ value: 'MO', label: 'Monthly' }, { value: 'YE', label: 'Yearly' }], displayLogic: (record) => (record.depreciate === true || record.depreciate === 'Y') && record.calculateType === 'TI' },
  { key: 'usableLifeYears', column: 'UseLifeYears', type: 'number', label: 'Usable Life - Years', section: 'other', displayLogic: (record) => (record.depreciate === true || record.depreciate === 'Y') && record.calculateType === 'TI' && record.amortize === 'YE' },
  { key: 'usableLifeMonths', column: 'UseLifeMonths', type: 'number', label: 'Usable Life - Months', section: 'other', displayLogic: (record) => (record.depreciate === true || record.depreciate === 'Y') && record.calculateType === 'TI' && record.amortize !== 'YE' },
  { key: 'everyMonthIs30Days', column: 'Is30DayMonth', type: 'checkbox', label: 'Every Month is 30 Days', required: true, section: 'other', defaultValue: 'Y', displayLogic: (record) => (record.depreciate === true || record.depreciate === 'Y') && record.calculateType === 'TI' },
  { key: 'purchaseDate', column: 'Datepurchased', type: 'date', label: 'Purchase Date', section: 'other', displayLogic: (record) => record.depreciate === true || record.depreciate === 'Y' },
  { key: 'cancellationDate', column: 'Datecancelled', type: 'date', label: 'Cancellation Date', section: 'other', displayLogic: (record) => record.depreciate === true || record.depreciate === 'Y' },
  { key: 'depreciationStartDate', column: 'Amortizationstartdate', type: 'date', label: 'Depreciation Start Date', section: 'other', displayLogic: (record) => record.depreciate === true || record.depreciate === 'Y' },
  { key: 'depreciationEndDate', column: 'Amortizationenddate', type: 'date', label: 'Depreciation End Date', section: 'other', displayLogic: (record) => record.depreciate === true || record.depreciate === 'Y' },
  // @sf-custom-slot callout:SL_Assets
  { key: 'assetValue', column: 'AssetValueAmt', type: 'number', label: 'Asset Value', section: 'other', displayLogic: (record) => record.depreciate === true || record.depreciate === 'Y' },
  // @sf-custom-slot callout:SL_Assets
  { key: 'residualAssetValue', column: 'Residualassetvalueamt', type: 'number', label: 'Residual Asset Value', section: 'other', displayLogic: (record) => record.depreciate === true || record.depreciate === 'Y' },
  // @sf-custom-slot callout:SL_Assets
  { key: 'depreciationAmt', column: 'Amortizationvalueamt', type: 'number', label: 'Depreciation Amt.', section: 'other', displayLogic: (record) => record.depreciate === true || record.depreciate === 'Y' },
  { key: 'previouslyDepreciatedAmt', column: 'Depreciatedpreviousamt', type: 'number', label: 'Previously Depreciated Amt.', section: 'other', defaultValue: '0', displayLogic: (record) => record.depreciate === true || record.depreciate === 'Y' },
  { key: 'project', column: 'C_Project_ID', type: 'search', label: 'Project', section: 'other', reference: 'Project', inputMode: 'search', displayLogic: (record) => record.depreciate === true || record.depreciate === 'Y' },
];
// @sf-generated-end fields:assets

// @sf-generated-start component:AssetsForm
export default function AssetsForm(props) {
  // @sf-custom-slot hooks:AssetsForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:AssetsForm

// @sf-custom-slot section:AssetsForm-custom
