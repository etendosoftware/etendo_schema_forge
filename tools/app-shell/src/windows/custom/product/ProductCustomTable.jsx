import { forwardRef } from 'react';
import { DataTable } from '@/components/contract-ui';
import { ProductSalePriceCell, ProductPurchasePriceCell, ProductStockCell } from './ProductListCells';

/* eslint-disable react/prop-types */

// Identity column now uses the generic `multiField` renderer (ETP-4603) instead
// of the bespoke ProductNameCell: title (name) + subtitle chip (searchKey) +
// authenticated media (image), with per-part sort headers. Mirrors exactly what
// the generator emits for a `multiField` decorator, so it stays pipeline-parity.
const columns = [
  {
    key: 'name',
    column: 'Name',
    type: 'multiField',
    title: 'name',
    subtitle: 'searchKey',
    media: { field: 'image', kind: 'neoImage', fallback: 'box' },
    parts: [
      { key: 'searchKey', column: 'Value', type: 'string', labels: { en_US: 'Identifier', es_ES: 'Identificador' } },
      { key: 'name', column: 'Name', type: 'string', labels: { en_US: 'Name', es_ES: 'Nombre' } },
    ],
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
  // Sales / Purchase / Stock are stored computed columns (EPL-1807) materialized
  // on M_Product and returned inline by the list fetch (`eTGOSalePrice` /
  // `eTGOPurchasePrice` / `eTGOStock`). Because the values now travel with the
  // row, sort and filter run server-side on the real entity property — hence:
  //   - `sortable: true`
  //   - `backendSortKey` / `backendFilterKey` map the display key to that property
  //     (the column `key` stays 'sale'/'purchase'/'stock' for React + render)
  //   - `filterMode: 'numeric'` so the advanced filter offers numeric operators
  //     (greaterThan/between/…) and a number input instead of text `iContains`.
  {
    key: 'sale',
    labels: { en_US: 'Sales', es_ES: 'Venta' },
    type: 'custom',
    sortable: true,
    filterMode: 'numeric',
    backendSortKey: 'eTGOSalePrice',
    backendFilterKey: 'eTGOSalePrice',
    render: (row) => (
      <ProductSalePriceCell row={row} data-testid="ProductSalePriceCell__f45e24" />
    ),
  },
  {
    key: 'purchase',
    labels: { en_US: 'Purchase', es_ES: 'Compra' },
    type: 'custom',
    sortable: true,
    filterMode: 'numeric',
    backendSortKey: 'eTGOPurchasePrice',
    backendFilterKey: 'eTGOPurchasePrice',
    render: (row) => (
      <ProductPurchasePriceCell row={row} data-testid="ProductPurchasePriceCell__f45e24" />
    ),
  },
  {
    key: 'stock',
    labels: { en_US: 'Stock', es_ES: 'Stock' },
    type: 'custom',
    sortable: true,
    filterMode: 'numeric',
    backendSortKey: 'eTGOStock',
    backendFilterKey: 'eTGOStock',
    // Stored computed column (EPL-1807): eTGOStock is refreshed by the async
    // queue drain (~a few minutes), hence the 'queued' freshness wording.
    computed: { mode: 'stored', refresh: 'queued' },
    render: (row) => (
      <ProductStockCell row={row} data-testid="ProductStockCell__f45e24" />
    ),
  },
];

const filters = ['searchKey', 'name', 'productCategory', 'productType'];

// `name` / `searchKey` carry the Advanced Filter entries (see columns above)
// but must not render as their own grid columns — they're already shown
// together inside the nameAndSearchKey cell.
const hiddenColumns = ['name', 'searchKey'];

const ProductCustomTable = forwardRef(function ProductCustomTable(props, ref) {
  return (
    <DataTable
      ref={ref}
      columns={columns}
      filters={filters}
      hiddenColumns={hiddenColumns}
      {...props}
      data-testid="DataTable__f45e24" />
  );
});

export default ProductCustomTable;
