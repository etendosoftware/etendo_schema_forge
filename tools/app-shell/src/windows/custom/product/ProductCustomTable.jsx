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

const ProductCustomTable = forwardRef(function ProductCustomTable(props, ref) {
  return (
    <DataTable
      ref={ref}
      columns={columns}
      filters={filters}
      {...props}
      data-testid="DataTable__f45e24" />
  );
});

export default ProductCustomTable;
