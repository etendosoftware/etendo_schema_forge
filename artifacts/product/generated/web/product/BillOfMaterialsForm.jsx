import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:billOfMaterials
const fields = [
  { key: 'lineNo', column: 'Line', type: 'number', label: 'Line No.', required: true, section: 'principal', defaultValue: '@SQL=SELECT COALESCE(MAX(Line),0)+10 AS DefaultValue FROM M_Product_BOM WHERE M_Product_ID=@M_Product_ID@' },
  { key: 'bOMProduct', column: 'M_ProductBOM_ID', type: 'search', label: 'BOM Product', required: true, section: 'principal', reference: 'Product', inputMode: 'search' },
  { key: 'bOMQuantity', column: 'BOMQty', type: 'number', label: 'BOM Quantity', required: true, section: 'principal', defaultValue: '1' },
  { key: 'bomprice', column: 'Bomprice', type: 'number', label: 'BOM Price', section: 'principal' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'other' },
];
// @sf-generated-end fields:billOfMaterials

// @sf-generated-start component:BillOfMaterialsForm
export default function BillOfMaterialsForm(props) {
  // @sf-custom-slot hooks:BillOfMaterialsForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:BillOfMaterialsForm

// @sf-custom-slot section:BillOfMaterialsForm-custom
