// ETP-4609 — "Nombre" filter in the Product grid's Advanced Filter panel was
// mislabeled as the raw internal key `nameAndSearchKey` and never matched any
// row, because the grid column merging searchKey+name into one avatar cell has
// no real backend field of its own. This regression-guards that the split
// `name` / `searchKey` filter columns exist with the correct AD field mapping,
// and that they are hidden from the rendered grid (already shown inside the
// combined avatar cell).

// --- Mocks (before imports) ---

let capturedProps = null;

vi.mock('@/components/contract-ui', () => ({
  DataTable: (props) => {
    capturedProps = props;
    return <div data-testid="DataTable__stub" />;
  },
}));

// --- Imports ---

import { render } from '@testing-library/react';
import ProductCustomTable from '../ProductCustomTable.jsx';

// --- Tests ---

describe('ProductCustomTable — Advanced Filter fields (ETP-4609)', () => {
  beforeEach(() => {
    capturedProps = null;
  });

  it('declares a `name` filter column mapped to the AD field Name', () => {
    render(<ProductCustomTable data={[]} />);
    const nameCol = capturedProps.columns.find((c) => c.key === 'name');
    expect(nameCol).toBeDefined();
    expect(nameCol.column).toBe('Name');
  });

  it('declares a `searchKey` filter column mapped to the AD field Value', () => {
    render(<ProductCustomTable data={[]} />);
    const searchKeyCol = capturedProps.columns.find((c) => c.key === 'searchKey');
    expect(searchKeyCol).toBeDefined();
    expect(searchKeyCol.column).toBe('Value');
  });

  it('hides the split name/searchKey columns from the rendered grid', () => {
    render(<ProductCustomTable data={[]} />);
    expect(capturedProps.hiddenColumns).toEqual(expect.arrayContaining(['name', 'searchKey']));
  });

  it('keeps the combined nameAndSearchKey cell without a backend field (so the '
    + 'generic filter builder excludes it instead of offering a broken filter)', () => {
    render(<ProductCustomTable data={[]} />);
    const combinedCol = capturedProps.columns.find((c) => c.key === 'nameAndSearchKey');
    expect(combinedCol).toBeDefined();
    expect(combinedCol.column).toBeUndefined();
    expect(combinedCol.backendFilterKey).toBeUndefined();
  });
});
