import { describe, it, expect, vi } from 'vitest';

// Mocks required by DataTable.jsx at import time. The helpers under test
// (`applyOnSelectMappings`, `buildDisplayCatalogMaps`) do not invoke React,
// so we stub the heavy dependencies and exercise the pure functions directly.
vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => ({}),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));
vi.mock('@/lib/buildUrlWithParams.js', () => ({ buildUrlWithParams: (u) => u }));
vi.mock('@/lib/selectorCatalog.js', () => ({
  getCatalogOptions: (catalogs, entity, field) => {
    const key = `${entity}:${field.key || field.column || ''}`;
    return catalogs?.[key] || [];
  },
}));
vi.mock('@/lib/statusBadge.js', () => ({
  getStatusDotColor: () => '',
  getStatusGridPillClass: () => '',
  getStatusPillClass: () => '',
  statusLabel: (r) => r,
}));
vi.mock('@/components/ui/status-tag', () => ({ StatusTag: () => null }));
vi.mock('@/components/ui/tag', () => ({ Tag: () => null }));
vi.mock('@/lib/resolveIdentifier.js', () => ({ resolveIdentifier: () => '' }));
vi.mock('@/lib/resolveColumnLabel.js', () => ({ resolveColumnLabel: (c) => c.key }));
vi.mock('@/lib/formatAmount.js', () => ({ formatAmount: (v) => String(v) }));
vi.mock('@/lib/applyCalloutUpdates.js', () => ({ applyCalloutUpdates: () => ({}) }));
vi.mock('@/lib/linesColumnWidth.js', () => ({
  columnMinWidthPx: () => 80,
  isLineGridColumn: (col) => col?.type !== 'dimensionsPanel',
}));
vi.mock('./ProductSearchDrawer.jsx', () => ({ default: () => null }));
vi.mock('./ProductStockSearchDrawer.jsx', () => ({ default: () => null }));
vi.mock('./SelectorInput.jsx', () => ({ SelectorInput: () => null }));
vi.mock('./RowQuickActions.jsx', () => ({ default: () => null }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
const Stub = () => null;
vi.mock('lucide-react', () => ({
  Search: Stub, Inbox: Stub, X: Stub, ChevronDown: Stub, Trash2: Stub,
  Copy: Stub, Loader2: Stub, Pencil: Stub, Check: Stub,
}));
vi.mock('@/components/ui/table', () => ({
  Table: Stub, TableBody: Stub, TableCell: Stub, TableHead: Stub,
  TableHeader: Stub, TableRow: Stub, TableFooter: Stub,
}));
vi.mock('@/components/ui/checkbox', () => ({ Checkbox: () => null }));
vi.mock('@/components/ui/input', () => ({ Input: () => null }));
vi.mock('@/components/ui/badge', () => ({ Badge: () => null }));
vi.mock('@/components/ui/skeleton', () => ({ Skeleton: () => null }));
vi.mock('@/components/ui/switch', () => ({ Switch: () => null }));

const { applyOnSelectMappings, buildDisplayCatalogMaps } = await import('../DataTable.jsx');

describe('applyOnSelectMappings', () => {
  it('is a no-op when field has no onSelectMappings', () => {
    const handleChange = vi.fn();
    applyOnSelectMappings({ key: 'product' }, { id: 'X' }, handleChange);
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('copies a value from a dotted path and writes both id and identifier', () => {
    const handleChange = vi.fn();
    const field = {
      key: 'product',
      onSelectMappings: [{ from: '_aux._LOC', to: 'storageBin', labelFrom: 'warehouse' }],
    };
    const item = { id: 'P1', _aux: { _LOC: 'LOC-42' }, warehouse: 'Main WH' };
    applyOnSelectMappings(field, item, handleChange);
    expect(handleChange).toHaveBeenCalledWith('storageBin$_identifier', 'Main WH');
    expect(handleChange).toHaveBeenCalledWith('storageBin', 'LOC-42');
  });

  it('falls back through labelFrom array in order, skipping empty values', () => {
    const handleChange = vi.fn();
    const field = {
      onSelectMappings: [{
        from: '_aux._LOC',
        to: 'storageBin',
        labelFrom: ['warehouse', 'warehouse$_identifier', 'storageBin'],
      }],
    };
    const item = { _aux: { _LOC: 'L' }, warehouse: '', 'warehouse$_identifier': 'Backup Label', storageBin: 'BIN' };
    applyOnSelectMappings(field, item, handleChange);
    expect(handleChange).toHaveBeenCalledWith('storageBin$_identifier', 'Backup Label');
  });

  it('uses the raw id as label when all labelFrom keys are missing', () => {
    const handleChange = vi.fn();
    const field = { onSelectMappings: [{ from: 'id', to: 'storageBin', labelFrom: ['warehouse'] }] };
    applyOnSelectMappings(field, { id: 'L1' }, handleChange);
    expect(handleChange).toHaveBeenCalledWith('storageBin$_identifier', 'L1');
    expect(handleChange).toHaveBeenCalledWith('storageBin', 'L1');
  });

  it('skips mappings whose source value is null/undefined', () => {
    const handleChange = vi.fn();
    const field = { onSelectMappings: [{ from: '_aux._LOC', to: 'storageBin' }] };
    applyOnSelectMappings(field, { id: 'P1', _aux: {} }, handleChange);
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('processes multiple mappings independently', () => {
    const handleChange = vi.fn();
    const field = {
      onSelectMappings: [
        { from: 'a', to: 'X' },
        { from: 'b', to: 'Y' },
      ],
    };
    applyOnSelectMappings(field, { a: 1, b: 2 }, handleChange);
    expect(handleChange).toHaveBeenCalledWith('X', 1);
    expect(handleChange).toHaveBeenCalledWith('Y', 2);
  });

  it('ignores malformed mappings without from or to', () => {
    const handleChange = vi.fn();
    applyOnSelectMappings({ onSelectMappings: [{ to: 'X' }, { from: 'a' }, null] }, { a: 1 }, handleChange);
    expect(handleChange).not.toHaveBeenCalled();
  });

  // ETP-5039 — markTouched reports mapped targets so applyCalloutUpdates can
  // protect the label/value the user picked from a parallel callout race.
  it('calls markTouched once per mapping target, not for the $_identifier key', () => {
    const handleChange = vi.fn();
    const markTouched = vi.fn();
    const field = {
      onSelectMappings: [
        { from: 'a', to: 'X' },
        { from: 'b', to: 'Y' },
      ],
    };
    applyOnSelectMappings(field, { a: 1, b: 2 }, handleChange, markTouched);
    expect(markTouched).toHaveBeenCalledTimes(2);
    expect(markTouched).toHaveBeenCalledWith('X');
    expect(markTouched).toHaveBeenCalledWith('Y');
    expect(markTouched).not.toHaveBeenCalledWith('X$_identifier');
    expect(markTouched).not.toHaveBeenCalledWith('Y$_identifier');
  });

  it('does not throw when markTouched is omitted (backwards compatible 3-arg call)', () => {
    const handleChange = vi.fn();
    const field = { onSelectMappings: [{ from: 'a', to: 'X' }] };
    expect(() => applyOnSelectMappings(field, { a: 1 }, handleChange)).not.toThrow();
    expect(handleChange).toHaveBeenCalledWith('X', 1);
  });

  it('does not call markTouched for a mapping that is skipped', () => {
    const handleChange = vi.fn();
    const markTouched = vi.fn();
    const field = {
      onSelectMappings: [
        { to: 'X' },                          // missing from
        { from: 'a' },                        // missing to
        null,                                 // malformed
        { from: 'missing', to: 'Y' },         // resolves to null
      ],
    };
    applyOnSelectMappings(field, { a: 1 }, handleChange, markTouched);
    expect(markTouched).not.toHaveBeenCalled();
  });
});

describe('buildDisplayCatalogMaps', () => {
  it('returns an empty map when no entity is provided', () => {
    const out = buildDisplayCatalogMaps([{ key: 'storageBin' }], { fields: [], catalogs: {} }, null);
    expect(out.size).toBe(0);
  });

  it('only builds maps for columns whose field declares displayFromCatalog', () => {
    const visibleColumns = [{ key: 'storageBin' }, { key: 'product' }];
    const addRow = {
      fields: [
        { key: 'storageBin', displayFromCatalog: true },
        { key: 'product' },
      ],
      catalogs: {
        'icLine:storageBin': [{ id: 'LOC-1', name: 'Warehouse A' }],
        'icLine:product': [{ id: 'P-1', name: 'Widget' }],
      },
    };
    const out = buildDisplayCatalogMaps(visibleColumns, addRow, 'icLine');
    expect(out.size).toBe(1);
    expect(out.get('storageBin').get('LOC-1')).toBe('Warehouse A');
    expect(out.has('product')).toBe(false);
  });

  it('skips columns when the matching field has empty catalog options', () => {
    const out = buildDisplayCatalogMaps(
      [{ key: 'storageBin' }],
      { fields: [{ key: 'storageBin', displayFromCatalog: true }], catalogs: {} },
      'icLine',
    );
    expect(out.size).toBe(0);
  });

  it('prefers name, then label, then _identifier when building the label', () => {
    const addRow = {
      fields: [{ key: 'storageBin', displayFromCatalog: true }],
      catalogs: {
        'icLine:storageBin': [
          { id: '1', name: 'N', label: 'L', _identifier: 'I' },
          { id: '2', label: 'L', _identifier: 'I' },
          { id: '3', _identifier: 'I' },
          { id: '4' },
        ],
      },
    };
    const out = buildDisplayCatalogMaps([{ key: 'storageBin' }], addRow, 'icLine');
    const map = out.get('storageBin');
    expect(map.get('1')).toBe('N');
    expect(map.get('2')).toBe('L');
    expect(map.get('3')).toBe('I');
    expect(map.get('4')).toBe('4');
  });

  it('ignores catalog options without an id', () => {
    const addRow = {
      fields: [{ key: 'storageBin', displayFromCatalog: true }],
      catalogs: { 'icLine:storageBin': [{ name: 'Orphan' }, { id: 'L', name: 'Real' }] },
    };
    const out = buildDisplayCatalogMaps([{ key: 'storageBin' }], addRow, 'icLine');
    expect(out.get('storageBin').size).toBe(1);
    expect(out.get('storageBin').get('L')).toBe('Real');
  });
});
