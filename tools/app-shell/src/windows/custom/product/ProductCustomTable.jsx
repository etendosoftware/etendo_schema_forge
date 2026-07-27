import { forwardRef } from 'react';
import { DataTable } from '@/components/contract-ui';
import { ProductNameCell, ProductSalePriceCell, ProductPurchasePriceCell, ProductStockCell } from './ProductListCells';

/* eslint-disable react/prop-types */

const columns = [
  {
    key: 'nameAndSearchKey',
    labels: { en_US: 'Identifier & Name', es_ES: 'Identificador & Nombre' },
    type: 'custom',
    sortable: false,
    render: (row, { token, apiBaseUrl }) => (
      <ProductNameCell
        row={row}
        token={token}
        apiBaseUrl={apiBaseUrl}
        data-testid="ProductNameCell__f45e24" />
    ),
  },
  // `name` and `searchKey` are real backend fields (AD columns Name / Value)
  // already rendered inside the nameAndSearchKey cell above. They are added
  // here — hidden from the grid via `hiddenColumns` below — purely so the
  // Advanced Filter panel can offer them as separate, correctly labeled,
  // working filter fields instead of the synthetic combined column (ETP-4609).
  { key: 'name', column: 'Name', type: 'string' },
  { key: 'searchKey', column: 'Value', type: 'string' },
  { key: 'productCategory', column: 'M_Product_Category_ID', type: 'selector', label: 'Product Category', required: true },
  { key: 'uOM',             column: 'C_UOM_ID',              type: 'selector', label: 'UOM',              required: true },
  {
    key: 'productType',
    column: 'ProductType',
    type: 'enum',
    label: 'Product Type',
    enumLabels: { E: 'Expense type', I: 'Item', R: 'Resource', S: 'Service' },
    enumVariants: { I: 'blue', S: 'purple', R: 'teal', E: 'orange' },
    required: true,
  },
  {
    key: 'sale',
    labels: { en_US: 'Sales', es_ES: 'Venta' },
    type: 'custom',
    sortable: false,
    render: (row, { token, apiBaseUrl }) => (
      <ProductSalePriceCell
        row={row}
        token={token}
        apiBaseUrl={apiBaseUrl}
        data-testid="ProductSalePriceCell__f45e24" />
    ),
  },
  {
    key: 'purchase',
    labels: { en_US: 'Purchase', es_ES: 'Compra' },
    type: 'custom',
    sortable: false,
    render: (row, { token, apiBaseUrl }) => (
      <ProductPurchasePriceCell
        row={row}
        token={token}
        apiBaseUrl={apiBaseUrl}
        data-testid="ProductPurchasePriceCell__f45e24" />
    ),
  },
  {
    key: 'stock',
    labels: { en_US: 'Stock', es_ES: 'Stock' },
    type: 'custom',
    sortable: false,
    render: (row, { token, apiBaseUrl }) => (
      <ProductStockCell
        row={row}
        token={token}
        apiBaseUrl={apiBaseUrl}
        data-testid="ProductStockCell__f45e24" />
    ),
  },
];

const filters = ['searchKey', 'name', 'productCategory', 'productType'];

// `name` / `searchKey` carry the Advanced Filter entries (see columns above)
// but must not render as their own grid columns — they're already shown
// together inside the nameAndSearchKey cell.
const hiddenColumns = ['name', 'searchKey'];

const ProductCustomTable = forwardRef(function ProductCustomTable(props, ref) {
  // ListView.jsx always forwards its own `hiddenColumns` prop (default `[]`)
  // to whatever Table component the window wires in. Spreading `{...props}`
  // after the local `hiddenColumns={hiddenColumns}` would let that incoming
  // value silently clobber this module's intentional override, so pull it
  // out of the spread and merge instead — union of the local intentional
  // list with whatever the parent additionally asks to hide (ETP-4609).
  const { hiddenColumns: incomingHiddenColumns, ...rest } = props;
  const mergedHiddenColumns = incomingHiddenColumns?.length
    ? [...new Set([...hiddenColumns, ...incomingHiddenColumns])]
    : hiddenColumns;
  return (
    <DataTable
      ref={ref}
      columns={columns}
      filters={filters}
      {...rest}
      hiddenColumns={mergedHiddenColumns}
      data-testid="DataTable__f45e24" />
  );
});

export default ProductCustomTable;
