/**
 * Tests for pure exported helpers in DataTable.jsx.
 */
import { applyOnSelectMappings, buildDisplayCatalogMaps, getTableContainerStyle } from '../DataTable.jsx';

// Mock the heavy dependencies
vi.mock('react-dom', () => ({ createPortal: (c) => c }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/i18n', () => ({
  useLabel: () => () => '',
  useUI: () => (k) => k,
  useLocale: () => 'en_US',
  useMenuLabel: () => (k) => k,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));
vi.mock('@/lib/buildUrlWithParams.js', () => ({ buildUrlWithParams: (u) => u }));
vi.mock('@/lib/selectorCatalog.js', () => ({
  getCatalogOptions: (catalogs, entity, field) => catalogs?.[field.key] || [],
}));
vi.mock('@/lib/statusBadge.js', () => ({
  getStatusDotColor: () => 'bg-gray-400',
  getStatusTone: () => 'neutral',
  statusLabel: (s) => s,
}));
vi.mock('@/lib/resolveIdentifier.js', () => ({ resolveIdentifier: (d, f) => d?.[f] }));
vi.mock('@/lib/resolveColumnLabel.js', () => ({ resolveColumnLabel: (c) => c.label }));
vi.mock('@/lib/formatAmount.js', () => ({ formatAmount: (v) => String(v) }));
vi.mock('@/lib/applyCalloutUpdates.js', () => ({ applyCalloutUpdates: vi.fn() }));
vi.mock('@/lib/linesColumnWidth.js', () => ({
  columnMinWidthPx: () => 100,
  columnFlex: () => '1 0 100px',
  isLineGridColumn: (col) => col?.type !== 'dimensionsPanel',
}));

describe('DataTable helpers', () => {
  describe('applyOnSelectMappings', () => {
    it('maps values from item to fields via handleChange', () => {
      const calls = [];
      const handleChange = (k, v) => calls.push([k, v]);
      const field = {
        onSelectMappings: [
          { from: 'uom.id', to: 'unitOfMeasure', labelFrom: 'uom.name' },
        ],
      };
      const item = { uom: { id: 'UOM1', name: 'Kilogram' } };
      applyOnSelectMappings(field, item, handleChange);
      expect(calls).toEqual([
        ['unitOfMeasure$_identifier', 'Kilogram'],
        ['unitOfMeasure', 'UOM1'],
      ]);
    });

    it('handles missing onSelectMappings gracefully', () => {
      const handleChange = vi.fn();
      applyOnSelectMappings({}, {}, handleChange);
      expect(handleChange).not.toHaveBeenCalled();
      applyOnSelectMappings(null, {}, handleChange);
      expect(handleChange).not.toHaveBeenCalled();
    });

    it('skips mappings with no from/to', () => {
      const handleChange = vi.fn();
      applyOnSelectMappings({ onSelectMappings: [{}] }, {}, handleChange);
      expect(handleChange).not.toHaveBeenCalled();
    });

    it('skips when item value is null', () => {
      const handleChange = vi.fn();
      const field = { onSelectMappings: [{ from: 'missing', to: 'target' }] };
      applyOnSelectMappings(field, {}, handleChange);
      expect(handleChange).not.toHaveBeenCalled();
    });

    it('uses value as label when no labelFrom', () => {
      const calls = [];
      const handleChange = (k, v) => calls.push([k, v]);
      const field = { onSelectMappings: [{ from: 'code', to: 'taxCode' }] };
      applyOnSelectMappings(field, { code: 'TX21' }, handleChange);
      expect(calls).toEqual([
        ['taxCode$_identifier', 'TX21'],
        ['taxCode', 'TX21'],
      ]);
    });

    it('handles array labelFrom (first non-empty wins)', () => {
      const calls = [];
      const handleChange = (k, v) => calls.push([k, v]);
      const field = {
        onSelectMappings: [{
          from: 'id',
          to: 'ref',
          labelFrom: ['displayName', 'name'],
        }],
      };
      applyOnSelectMappings(field, { id: '1', name: 'Fallback' }, handleChange);
      expect(calls[0]).toEqual(['ref$_identifier', 'Fallback']);
    });
  });

  describe('buildDisplayCatalogMaps', () => {
    it('returns empty map when no entity', () => {
      const result = buildDisplayCatalogMaps([], {}, null);
      expect(result.size).toBe(0);
    });

    it('returns empty map when no catalogs', () => {
      const result = buildDisplayCatalogMaps([{ key: 'a' }], { fields: [{ key: 'a', displayFromCatalog: true }] }, 'header');
      expect(result.size).toBe(0);
    });

    it('builds map for columns with displayFromCatalog', () => {
      const cols = [{ key: 'warehouse' }, { key: 'name' }];
      const addRow = {
        fields: [
          { key: 'warehouse', displayFromCatalog: true },
          { key: 'name' },
        ],
        catalogs: {
          warehouse: [{ id: 'W1', name: 'Main' }, { id: 'W2', name: 'Secondary' }],
        },
      };
      const result = buildDisplayCatalogMaps(cols, addRow, 'header');
      expect(result.has('warehouse')).toBe(true);
      expect(result.get('warehouse').get('W1')).toBe('Main');
      expect(result.has('name')).toBe(false);
    });
  });

  // ETP-5182 — Bug 1: sorting the Contacts list (or any normal-mode,
  // non-hideHeader list) visibly resized every column. Root cause:
  // `getTableContainerStyle` only set `tableLayout: 'fixed'` in the
  // hideHeader (add-row-only) mode; the normal list-header mode got no style
  // at all, so the browser fell back to `table-layout: auto`, which
  // recomputes each column's width from ALL currently-rendered body-row
  // content on every re-render — and sorting swaps in a different page of
  // rows (see the `onFilterChange`/backend-sort comment above `filteredData`
  // in DataTable.jsx), so the widths visibly jumped. Per the CSS spec,
  // `table-layout: fixed` derives column widths from the first row's cells
  // (here, the header row, since <TableHeader> precedes <TableBody> in the
  // DOM) ONCE, and does not recompute from body content afterward — so
  // applying it unconditionally stops the resize regardless of hideHeader.
  // ETP-5332 — `getTableContainerStyle` gained an optional `minWidthPx = 0` parameter
  // (the sum of every column's own width demand, used to stop a fixed-layout table
  // from squeezing columns below their own colgroup). The old signature took no
  // arguments at all, so passing a boolean here used to be inert; `true > 0` is truthy
  // in JS, so the same call now silently returns `minWidth: true` instead of the plain
  // shape below. Calls are re-expressed against the real contract: no argument (or 0)
  // for the no-budget case, a literal px number for the budget case — never a boolean.
  describe('getTableContainerStyle', () => {
    it('is byte-identical to the pre-ETP-5332 shape when called with no argument (every existing caller outside DataTable relies on this)', () => {
      expect(getTableContainerStyle()).toEqual({ tableLayout: 'fixed', width: '100%' });
      expect(getTableContainerStyle()).not.toHaveProperty('minWidth');
    });

    it('is also the plain shape when explicitly passed 0 (no budget to declare)', () => {
      expect(getTableContainerStyle(0)).toEqual({ tableLayout: 'fixed', width: '100%' });
    });

    it('adds a literal minWidth when a px budget is given', () => {
      expect(getTableContainerStyle(992)).toEqual({
        tableLayout: 'fixed',
        width: '100%',
        minWidth: 992,
      });
    });
  });
});
