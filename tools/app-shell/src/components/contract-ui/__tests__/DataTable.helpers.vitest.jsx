/**
 * Tests for pure exported helpers in DataTable.jsx.
 */
import { applyOnSelectMappings, buildDisplayCatalogMaps } from '../DataTable.jsx';

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
  statusLabel: (s) => s,
}));
vi.mock('@/lib/resolveIdentifier.js', () => ({ resolveIdentifier: (d, f) => d?.[f] }));
vi.mock('@/lib/resolveColumnLabel.js', () => ({ resolveColumnLabel: (c) => c.label }));
vi.mock('@/lib/formatAmount.js', () => ({ formatAmount: (v) => String(v) }));
vi.mock('@/lib/applyCalloutUpdates.js', () => ({ applyCalloutUpdates: vi.fn() }));
vi.mock('@/lib/linesColumnWidth.js', () => ({
  columnMinWidthPx: () => 100,
  columnFlex: () => '1 0 100px',
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
});
