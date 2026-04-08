import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:product
const fields = [
  { key: 'searchKey', column: 'Value', type: 'text', label: 'Search Key', required: true, section: 'principal' },
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'principal' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'principal' },
  // @sf-custom-slot callout:SL_Product_Type
  { key: 'productType', column: 'ProductType', type: 'select', label: 'Product Type', required: true, section: 'principal', options: [{ value: 'E', label: 'Expense type' }, { value: 'I', label: 'Item' }, { value: 'R', label: 'Resource' }, { value: 'S', label: 'Service' }], defaultValue: 'I' },
  { key: 'productCategory', column: 'M_Product_Category_ID', type: 'selector', label: 'Product Category', required: true, section: 'principal', reference: 'ProductCategory', inputMode: 'selector', defaultValue: '@SQL=SELECT MAX(M_PRODUCT_CATEGORY_ID) FROM M_PRODUCT_CATEGORY WHERE AD_ISORGINCLUDED(@AD_ORG_ID@, AD_ORG_ID, @#AD_CLIENT_ID@) <> -1 AND ISDEFAULT = \'Y\' AND AD_CLIENT_ID = @#AD_CLIENT_ID@ AND ISSUMMARY=\'N\'' },
  { key: 'uOM', column: 'C_UOM_ID', type: 'selector', label: 'UOM', required: true, section: 'principal', reference: 'UOM', inputMode: 'selector' },
  { key: 'image', column: 'AD_Image_ID', type: 'image', label: 'Image', section: 'principal' },
  { key: 'taxCategory', column: 'C_TaxCategory_ID', type: 'selector', label: 'Tax Category', required: true, section: 'other', reference: 'TaxCategory', inputMode: 'selector' },
  { key: 'purchase', column: 'IsPurchased', type: 'checkbox', label: 'Purchase', required: true, section: 'other', defaultValue: 'Y' },
  { key: 'sale', column: 'IsSold', type: 'checkbox', label: 'Sale', required: true, section: 'other', defaultValue: 'Y' },
  { key: 'stocked', column: 'IsStocked', type: 'checkbox', label: 'Stocked', required: true, section: 'other', defaultValue: 'Y' },
  { key: 'weight', column: 'Weight', type: 'number', label: 'Weight', section: 'other' },
  { key: 'uOMForWeight', column: 'C_Uom_Weight_ID', type: 'selector', label: 'UOM for Weight', section: 'other', reference: 'UOM', inputMode: 'selector' },
  { key: 'attributeSet', column: 'M_AttributeSet_ID', type: 'selector', label: 'Attribute Set', section: 'other', reference: 'AttributeSet', inputMode: 'selector' },
  { key: 'uPCEAN', column: 'UPC', type: 'text', label: 'UPC/EAN', section: 'other' },
  { key: 'brand', column: 'M_Brand_ID', type: 'selector', label: 'Brand', section: 'other', reference: 'Brand', inputMode: 'selector' },
  { key: 'returnable', column: 'Returnable', type: 'checkbox', label: 'Returnable', required: true, section: 'other', defaultValue: 'Y' },
  { key: 'mProductStatusID', column: 'M_Product_Status_ID', type: 'selector', label: 'Lifecycle Status', section: 'other', reference: 'ProductStatus', inputMode: 'selector' },
];
// @sf-generated-end fields:product

// @sf-generated-start component:ProductForm
export default function ProductForm(props) {
  // @sf-custom-slot hooks:ProductForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:ProductForm

// @sf-custom-slot section:ProductForm-custom
