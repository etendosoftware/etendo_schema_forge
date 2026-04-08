import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:productCharacteristic
const fields = [
  { key: 'sequenceNumber', column: 'Seqno', type: 'number', required: true, section: 'principal', defaultValue: '@SQL=SELECT COALESCE(MAX(SEQNO),0)+10 AS DefaultValue FROM M_PRODUCT_CH WHERE m_product_id=@m_product_id@' },
  // @sf-custom-slot callout:SL_ProductCh_Characteristic
  { key: 'characteristic', column: 'M_Characteristic_ID', type: 'selector', required: true, section: 'principal', reference: 'Characteristic', inputMode: 'selector' },
  { key: 'variant', column: 'Isvariant', type: 'checkbox', required: true, section: 'principal', defaultValue: 'N' },
  { key: 'explodeConfigurationTab', column: 'IsExplodeConf', type: 'checkbox', required: true, section: 'principal', defaultValue: 'Y' },
  { key: 'definesPrice', column: 'Define_Price', type: 'checkbox', required: true, section: 'other', defaultValue: 'N' },
  { key: 'priceListType', column: 'Pricelist_Type', type: 'select', required: true, section: 'other', options: [{ value: 'PURCHASE', label: 'Purchase Price List' }, { value: 'SALES', label: 'Sales Price List' }], defaultValue: 'SALES' },
  { key: 'definesImage', column: 'Define_Image', type: 'checkbox', required: true, section: 'other', defaultValue: 'N' },
  { key: 'characteristicSubset', column: 'M_Ch_Subset_ID', type: 'selector', section: 'other', reference: 'CharacteristicSubset', inputMode: 'selector' },
  { key: 'active', column: 'Isactive', type: 'checkbox', required: true, section: 'other', defaultValue: 'Y' },
];
// @sf-generated-end fields:productCharacteristic

// @sf-generated-start component:ProductCharacteristicForm
export default function ProductCharacteristicForm(props) {
  // @sf-custom-slot hooks:ProductCharacteristicForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:ProductCharacteristicForm

// @sf-custom-slot section:ProductCharacteristicForm-custom
