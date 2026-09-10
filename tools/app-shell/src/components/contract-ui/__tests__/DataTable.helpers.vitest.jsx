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
  describe('getTableContainerStyle', () => {
    it('sets table-layout: fixed in hideHeader (add-row-only) mode', () => {
      expect(getTableContainerStyle(true)).toEqual({ tableLayout: 'fixed', width: '100%' });
    });

    it('also sets table-layout: fixed in normal list-header mode (ETP-5182 fix)', () => {
      expect(getTableContainerStyle(false)).toEqual({ tableLayout: 'fixed', width: '100%' });
    });

    it('returns the same style object shape regardless of hideHeader', () => {
      expect(getTableContainerStyle(true)).toEqual(getTableContainerStyle(false));
    });
  });
});
