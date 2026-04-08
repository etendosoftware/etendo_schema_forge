import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:relatedProducts
const fields = [
  { key: 'lineNo', column: 'Line', type: 'number', required: true, readOnly: true, section: 'other', defaultValue: '@SQL=SELECT COALESCE(MAX(Line),0)+10 AS DefaultValue FROM C_OrderLine WHERE C_Order_ID=@C_Order_ID@' },
  // @sf-custom-slot callout:SL_Order_Product
  { key: 'product', column: 'M_Product_ID', type: 'search', required: true, readOnly: true, section: 'other', reference: 'Product', inputMode: 'search' },
  // @sf-custom-slot callout:SL_Order_Amt
  { key: 'attributeSetValue', column: 'M_AttributeSetInstance_ID', type: 'text', readOnly: true, section: 'other' },
];
// @sf-generated-end fields:relatedProducts

// @sf-generated-start component:RelatedProductsForm
export default function RelatedProductsForm(props) {
  // @sf-custom-slot hooks:RelatedProductsForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:RelatedProductsForm

// @sf-custom-slot section:RelatedProductsForm-custom
