// Mocks must come before imports (Vitest hoisting).
//
// ETP-4603: the sale/purchase/stock columns of the product custom table now
// carry server-side sort + numeric filter metadata because the values arrive
// materialized on the list row (row.eTGOSalePrice / eTGOPurchasePrice /
// eTGOStock). These tests pin that column config so a regeneration or refactor
// cannot silently drop the sortable / filterMode / backendSortKey mapping.

// Capture the `columns` prop forwarded to the generic DataTable.
let capturedColumns = null;
vi.mock('@/components/contract-ui', () => ({
  DataTable: (props) => {
    capturedColumns = props.columns;
    return null;
  },
}));

// The custom cells are irrelevant to the metadata assertions — stub them.
vi.mock('../ProductListCells', () => ({
  ProductSalePriceCell: () => null,
  ProductPurchasePriceCell: () => null,
  ProductStockCell: () => null,
}));

import { render } from '@testing-library/react';
import ProductCustomTable from '../ProductCustomTable.jsx';

function getColumns() {
  render(<ProductCustomTable />);
  return capturedColumns;
}

describe('ProductCustomTable — stored computed column config (ETP-4603)', () => {
  const cases = [
    { key: 'sale', backendKey: 'eTGOSalePrice' },
    { key: 'purchase', backendKey: 'eTGOPurchasePrice' },
    { key: 'stock', backendKey: 'eTGOStock' },
  ];

  for (const { key, backendKey } of cases) {
    describe(`${key} column`, () => {
      it('is server-side sortable', () => {
        const col = getColumns().find((c) => c.key === key);
        expect(col).toBeTruthy();
        expect(col.sortable).toBe(true);
      });

      it('uses the numeric filter mode', () => {
        const col = getColumns().find((c) => c.key === key);
        expect(col.filterMode).toBe('numeric');
      });

      it(`maps the display key to the materialized property "${backendKey}"`, () => {
        const col = getColumns().find((c) => c.key === key);
        expect(col.backendSortKey).toBe(backendKey);
        expect(col.backendFilterKey).toBe(backendKey);
      });

      it('keeps the display key stable (React key stays the short name)', () => {
        const col = getColumns().find((c) => c.key === key);
        expect(col.key).toBe(key);
        // The backend property must NOT leak into the display key.
        expect(col.key).not.toBe(backendKey);
      });
    });
  }

  it('the stock column retains its stored-computed metadata', () => {
    const col = getColumns().find((c) => c.key === 'stock');
    expect(col.computed).toEqual({ mode: 'stored', refresh: 'queued' });
  });

  it('the sale and purchase columns do NOT carry computed metadata', () => {
    const cols = getColumns();
    expect(cols.find((c) => c.key === 'sale').computed).toBeUndefined();
    expect(cols.find((c) => c.key === 'purchase').computed).toBeUndefined();
  });

  it('exposes per-locale labels for the numeric columns (filter picker localization)', () => {
    const cols = getColumns();
    expect(cols.find((c) => c.key === 'sale').labels).toEqual({ en_US: 'Sales', es_ES: 'Venta' });
    expect(cols.find((c) => c.key === 'purchase').labels).toEqual({ en_US: 'Purchase', es_ES: 'Compra' });
    expect(cols.find((c) => c.key === 'stock').labels).toEqual({ en_US: 'Stock', es_ES: 'Stock' });
  });
});
