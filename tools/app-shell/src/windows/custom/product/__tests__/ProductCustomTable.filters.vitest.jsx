// ETP-4603 — the Product grid's identity cell (search key + name + image) is now
// rendered by the generic `multiField` decorator instead of the bespoke
// ProductNameCell. Unlike the old synthetic `nameAndSearchKey` cell (which had no
// backend field of its own), the multiField cell is a REAL field mapped to the AD
// column `Name`, with per-part sort/filter, so filtering by name is intended.
//
// This regression-guards:
//   - the identity cell is the generic `multiField` (key `name`, column `Name`),
//     exposing `name`->Name and `searchKey`->Value parts;
//   - the split `name` / `searchKey` filter columns still exist with the correct
//     AD field mapping (ETP-4609) and stay hidden from the rendered grid (already
//     shown inside the combined identity cell);
//   - the obsolete `nameAndSearchKey` column no longer exists.

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

describe('ProductCustomTable — identity cell & Advanced Filter fields (ETP-4603)', () => {
  beforeEach(() => {
    capturedProps = null;
  });

  it('renders the identity cell via the generic `multiField` decorator mapped to '
    + 'the AD field Name', () => {
    render(<ProductCustomTable data={[]} />);
    // First `key === 'name'` match is the multiField identity cell.
    const identityCell = capturedProps.columns.find((c) => c.key === 'name');
    expect(identityCell).toBeDefined();
    expect(identityCell.type).toBe('multiField');
    expect(identityCell.column).toBe('Name');
  });

  it('declares a `name` split filter column mapped to the AD field Name', () => {
    render(<ProductCustomTable data={[]} />);
    // Two columns share key `name`: the multiField cell and the string filter
    // column. The split filter column is the `type: 'string'` one.
    const nameFilterCol = capturedProps.columns.find(
      (c) => c.key === 'name' && c.type === 'string',
    );
    expect(nameFilterCol).toBeDefined();
    expect(nameFilterCol.column).toBe('Name');
  });

  it('declares a `searchKey` filter column mapped to the AD field Value', () => {
    render(<ProductCustomTable data={[]} />);
    const searchKeyCol = capturedProps.columns.find((c) => c.key === 'searchKey');
    expect(searchKeyCol).toBeDefined();
    expect(searchKeyCol.column).toBe('Value');
  });

  it('hides the split name/searchKey columns from the rendered grid', () => {
    render(<ProductCustomTable data={[]} />);
    expect(capturedProps.hiddenColumns).toEqual(
      expect.arrayContaining(['name', 'searchKey']),
    );
  });

  it('exposes both name->Name and searchKey->Value parts on the multiField '
    + 'identity cell (filtering by name IS enabled) and drops the obsolete '
    + 'nameAndSearchKey column', () => {
    render(<ProductCustomTable data={[]} />);

    const identityCell = capturedProps.columns.find((c) => c.key === 'name');
    expect(identityCell.type).toBe('multiField');
    expect(identityCell.column).toBe('Name');
    expect(Array.isArray(identityCell.parts)).toBe(true);

    const namePart = identityCell.parts.find((p) => p.key === 'name');
    expect(namePart).toBeDefined();
    expect(namePart.column).toBe('Name');

    const searchKeyPart = identityCell.parts.find((p) => p.key === 'searchKey');
    expect(searchKeyPart).toBeDefined();
    expect(searchKeyPart.column).toBe('Value');

    // The synthetic combined column is gone — replaced by the multiField cell.
    const combinedCol = capturedProps.columns.find((c) => c.key === 'nameAndSearchKey');
    expect(combinedCol).toBeUndefined();
  });
});
