import { describe, it, expect, vi } from 'vitest';

// Same dependency stubs as DataTable.fieldHelpers.vitest.jsx, EXCEPT
// `@/lib/applyCalloutUpdates.js` is intentionally left unmocked here — this
// suite exercises the real merge logic end-to-end against `applyOnSelectMappings`
// to guard the ETP-5039 race between a lookup-drawer selection and its
// parallel callout.
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

const { applyOnSelectMappings } = await import('../DataTable.jsx');
const { applyCalloutUpdates } = await import('@/lib/applyCalloutUpdates.js');

describe('ETP-5039 regression: drawer selection vs parallel callout race', () => {
  it('a mapped $_identifier label picked from the drawer survives the product callout echo', () => {
    const values = {};
    const touched = new Set();
    const handleChange = (k, v) => { values[k] = v; };
    const markTouched = (k) => touched.add(k);

    const field = {
      key: 'product',
      onSelectMappings: [
        { from: 'locatorId', to: 'storageBin', labelFrom: ['warehouse', 'locatorName'] },
      ],
    };
    const item = { id: 'P1', locatorId: 'BIN1', warehouse: 'Almacén Secundario' };

    // The trigger field itself is marked touched at the real call site
    // (renderInlineAddFieldControl), then the mappings are applied.
    touched.add('product');
    applyOnSelectMappings(field, item, handleChange, markTouched);

    expect(values.storageBin).toBe('BIN1');
    expect(values['storageBin$_identifier']).toBe('Almacén Secundario');
    expect(touched.has('storageBin')).toBe(true);

    // Simulate the product callout resolving in parallel and returning its
    // own (stale/generic) label for the same field.
    const next = applyCalloutUpdates(
      values,
      { storageBin: 'BIN1', 'storageBin$_identifier': 'AS-0-0-0' },
      new Set(),
      'product',
      touched,
    );

    expect(next['storageBin$_identifier']).toBe('Almacén Secundario');
    expect(next.storageBin).toBe('BIN1');
  });
});
