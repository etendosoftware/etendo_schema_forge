// ETP-4603 — the Product grid's identity cell (search key + name + image) is now
// rendered by the generic `multiField` decorator instead of the bespoke
// ProductNameCell. Unlike the old synthetic `nameAndSearchKey` cell (which had no
// backend field of its own), the multiField cell is a REAL field mapped to the AD
// column `Name`, with per-part sort/filter, so filtering by name is intended.
//
// This regression-guards:
//   - the identity cell is the generic `multiField` (key `name`, column `Name`),
//     exposing `name`->Name and `searchKey`->Value parts;
//   - there is exactly ONE column per key: the split `name` / `searchKey` filter
//     columns added by ETP-4609 are gone, because `expandMultiFieldColumns` now
//     derives a filterable pseudo-column from each `part`. Re-adding them made
//     "Nombre"/"Identificador" appear twice in the Advanced Filter field picker
//     and rendered two extra grid columns;
//   - the obsolete `nameAndSearchKey` column no longer exists;
//   - `{...props}` is spread BEFORE the local column set, so ListView's generic
//     table props (notably `hiddenColumns`) cannot override this table's columns.

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
    const identityCell = capturedProps.columns.find((c) => c.key === 'name');
    expect(identityCell).toBeDefined();
    expect(identityCell.type).toBe('multiField');
    expect(identityCell.column).toBe('Name');
  });

  it('exposes both name->Name and searchKey->Value parts on the multiField '
    + 'identity cell (filtering by name IS enabled) and drops the obsolete '
    + 'nameAndSearchKey column', () => {
    render(<ProductCustomTable data={[]} />);

    const identityCell = capturedProps.columns.find((c) => c.key === 'name');
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

  it('declares no standalone `searchKey` column — the multiField part supplies it', () => {
    render(<ProductCustomTable data={[]} />);
    const searchKeyCol = capturedProps.columns.find((c) => c.key === 'searchKey');
    expect(searchKeyCol).toBeUndefined();
  });

  it('declares each column key exactly once, so the Advanced Filter field picker '
    + 'lists no duplicate entry', () => {
    render(<ProductCustomTable data={[]} />);
    const keys = capturedProps.columns.map((c) => c.key);
    expect(keys).toEqual([...new Set(keys)]);
  });

  it('keeps searchKey and name as quick-search keys', () => {
    render(<ProductCustomTable data={[]} />);
    expect(capturedProps.filters).toEqual(
      expect.arrayContaining(['searchKey', 'name']),
    );
  });

  it('lets its own columns win over any `columns` / `hiddenColumns` passed in by '
    + 'ListView', () => {
    render(<ProductCustomTable data={[]} columns={[{ key: 'injected' }]} hiddenColumns={['name']} />);
    expect(capturedProps.columns.map((c) => c.key)).not.toContain('injected');
    expect(capturedProps.columns.find((c) => c.key === 'name')).toBeDefined();
  });
});
