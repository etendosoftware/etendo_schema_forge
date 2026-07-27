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

  // ETP-4609 — regression: ListView.jsx declares its own `hiddenColumns = []`
  // default prop and forwards it to whatever custom Table component the window
  // wires in (here, ProductCustomTable — see ListView.jsx ~line 238 / ~line 930).
  // ProductCustomTable spreads `{...props}` AFTER its own local
  // `hiddenColumns={hiddenColumns}`, so ListView's empty-array default silently
  // overwrites the intended `['name', 'searchKey']` override — the split
  // name/searchKey filter columns end up rendered as visible grid columns,
  // duplicating what the `nameAndSearchKey` avatar cell already shows.
  it('keeps its own hiddenColumns override even when the parent (ListView) '
    + 'forwards its own conflicting hiddenColumns prop', () => {
    // Mimics exactly what ListView.jsx spreads into the Table component: an
    // explicit (default) empty array, not an absent prop.
    render(<ProductCustomTable data={[]} hiddenColumns={[]} />);
    expect(capturedProps.hiddenColumns).toEqual(expect.arrayContaining(['name', 'searchKey']));
  });

  it('unions a non-empty incoming hiddenColumns with its own local override '
    + '(nothing dropped from either side, deduped)', () => {
    // A parent forwarding a real, DIFFERENT hiddenColumns array (not just the
    // empty-array bug-reproduction case) must still get BOTH sets merged —
    // ProductCustomTable.jsx's own ['name', 'searchKey'] plus whatever the
    // parent additionally asks to hide.
    render(<ProductCustomTable data={[]} hiddenColumns={['someOtherColumn']} />);
    expect(capturedProps.hiddenColumns).toEqual(
      expect.arrayContaining(['name', 'searchKey', 'someOtherColumn']),
    );
    // Exactly 3 entries — proves no duplication and nothing extra sneaked in.
    expect(capturedProps.hiddenColumns).toHaveLength(3);
  });
});
