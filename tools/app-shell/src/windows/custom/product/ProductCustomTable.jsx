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
