import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:productBom
const fields = [
  { key: 'lineNo', column: 'Line', type: 'number', required: true, section: 'principal', defaultValue: '@SQL=SELECT COALESCE(MAX(Line),0)+10 AS DefaultValue FROM M_Product_BOM WHERE M_Product_ID=@M_Product_ID@' },
  { key: 'bOMProduct', column: 'M_ProductBOM_ID', type: 'search', required: true, section: 'principal', reference: 'Product', inputMode: 'search' },
  { key: 'bOMQuantity', column: 'BOMQty', type: 'text', required: true, section: 'principal', defaultValue: '1' },
  { key: 'bomprice', column: 'Bomprice', type: 'text', section: 'principal' },
  { key: 'description', column: 'Description', type: 'textarea', section: 'other' },
];
// @sf-generated-end fields:productBom

// @sf-generated-start component:ProductBomForm
export default function ProductBomForm(props) {
  // @sf-custom-slot hooks:ProductBomForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:ProductBomForm

// @sf-custom-slot section:ProductBomForm-custom
