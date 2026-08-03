import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:product
const columns = [
  { key: 'name', column: 'Name', type: 'multiField', title: 'name', subtitle: 'searchKey', media: {"field":"image","kind":"neoImage","fallback":"box"}, parts: [{"key":"searchKey","column":"Value","type":"string","labels":{"en_US":"Identifier","es_ES":"Identificador"},"label":"Search Key"},{"key":"name","column":"Name","type":"string","labels":{"en_US":"Name","es_ES":"Nombre"},"label":"Name"}] },
  { key: 'uOM', column: 'C_UOM_ID', type: 'selector', label: 'UOM', required: true },
  { key: 'productCategory', column: 'M_Product_Category_ID', type: 'selector', label: 'Product Category', required: true },
  { key: 'productType', column: 'ProductType', type: 'enum', label: 'Product Type', enumLabels: { 'E': 'Expense type', 'I': 'Item', 'R': 'Resource', 'S': 'Service' }, enumVariants: {"I":"blue","S":"purple","R":"teal","E":"orange"}, required: true },
  { key: 'eTGOPurchasePrice', column: 'EM_ETGO_Purchase_Price', type: 'amount', label: 'EM_ETGO_Purchase_Price', computed: {"mode":"stored","refresh":"synchronous"} },
  { key: 'eTGOSalePrice', column: 'EM_ETGO_Sale_Price', type: 'amount', label: 'EM_ETGO_Sale_Price', computed: {"mode":"stored","refresh":"synchronous"} },
  { key: 'eTGOStock', column: 'EM_ETGO_Stock', type: 'number', label: 'EM_ETGO_Stock', computed: {"mode":"stored","refresh":"queued"} },
];
// @sf-generated-end columns:product

const filters = ['searchKey', 'name', 'productCategory', 'productType', 'uPCEAN'];

// @sf-generated-start component:ProductTable
const ProductTable = forwardRef(function ProductTable(props, ref) {
  // Inline-editable layout always uses InlineLinesPanel for existing rows so column
  // widths (flex layout) never shift when the add-row form opens. When addRow is
  // active we render a header-hidden, data-hidden DataTable below for just the
  // add-row form — it owns callouts, selectors, validation and the imperative flush
  // ref. The ref is forwarded to InlineLinesPanel so DetailView can flush pending
  // inline edits on global save.
  if (props.linesLayout === 'inlineEditable') {
    if (props.addRow?.active) {
      return (
        <>
          <InlineLinesPanel ref={ref} columns={columns} {...props} addRow={undefined} />
          <DataTable columns={columns} filters={filters} {...props} hideHeader hideDataRows />
        </>
      );
    }
    return <InlineLinesPanel ref={ref} columns={columns} {...props} />;
  }
  return <DataTable columns={columns} filters={filters} {...props} />;
});

export default ProductTable;
// @sf-generated-end component:ProductTable
