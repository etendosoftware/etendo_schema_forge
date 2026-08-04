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
    required: true,
    title: 'name',
    subtitle: 'searchKey',
    media: { field: 'image', kind: 'neoImage', fallback: 'box' },
    parts: [
      { key: 'searchKey', column: 'Value', type: 'string', labels: { en_US: 'Identifier', es_ES: 'Identificador' } },
      { key: 'name', column: 'Name', type: 'string', labels: { en_US: 'Name', es_ES: 'Nombre' } },
    ],
  },
  // NOTE: no split `name` / `searchKey` filter columns here. ETP-4609 needed them
  // because the old identity cell was the synthetic `nameAndSearchKey` column,
  // which had no backend field the Advanced Filter could target. The `multiField`
  // above (ETP-4603) supersedes them: `expandMultiFieldColumns` turns each entry
  // of `parts` into its own filterable pseudo-column, so re-adding them here
  // duplicates every entry in the field picker (and in the grid header).
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

// Quick-search keys, matched against the row via `resolveIdentifier` — these are
// row fields, not grid columns, so they need no column declaration above.
const filters = ['searchKey', 'name', 'productCategory', 'productType'];

const ProductCustomTable = forwardRef(function ProductCustomTable(props, ref) {
  return (
    <DataTable
      ref={ref}
      // `{...props}` FIRST, so this table's own column set always wins: ListView
      // passes its generic table props (including `hiddenColumns`) down here, and
      // spreading them last would silently override the definitions below.
      {...props}
      columns={columns}
      filters={filters}
      data-testid="DataTable__f45e24" />
  );
});

export default ProductCustomTable;
