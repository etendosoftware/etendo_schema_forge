import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:productCharacteristic
const fields = [
  { key: 'sequenceNumber', column: 'Seqno', type: 'number', label: 'Sequence Number', required: true, section: 'principal', defaultValue: '@SQL=SELECT COALESCE(MAX(SEQNO),0)+10 AS DefaultValue FROM M_PRODUCT_CH WHERE m_product_id=@m_product_id@' },
  { key: 'characteristic', column: 'M_Characteristic_ID', type: 'selector', label: 'Characteristic', required: true, section: 'principal', reference: 'Characteristic', inputMode: 'selector' },
  { key: 'variant', column: 'Isvariant', type: 'checkbox', label: 'Variant', required: true, section: 'principal' },
  { key: 'explodeConfigurationTab', column: 'IsExplodeConf', type: 'checkbox', label: 'Explode Configuration Tab', required: true, section: 'principal', defaultValue: 'Y' },
  { key: 'definesPrice', column: 'Define_Price', type: 'checkbox', label: 'Defines Price', required: true, section: 'other' },
  { key: 'priceListType', column: 'Pricelist_Type', type: 'select', label: 'Price List Type', required: true, section: 'other', options: [{ value: 'PURCHASE', label: 'Purchase Price List', labels: {"es_ES":"Tarifa de ventas"} }, { value: 'SALES', label: 'Sales Price List', labels: {"es_ES":"Tarifa de ventas"} }], defaultValue: 'SALES' },
  { key: 'definesImage', column: 'Define_Image', type: 'checkbox', label: 'Defines Image', required: true, section: 'other' },
  { key: 'characteristicSubset', column: 'M_Ch_Subset_ID', type: 'selector', label: 'Characteristic Subset', section: 'other', reference: 'CharacteristicSubset', inputMode: 'selector' },
  { key: 'active', column: 'Isactive', type: 'checkbox', label: 'Active', required: true, section: 'other', defaultValue: 'Y' },
];
// @sf-generated-end fields:productCharacteristic

// @sf-generated-start component:ProductCharacteristicForm
export default function ProductCharacteristicForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:ProductCharacteristicForm
