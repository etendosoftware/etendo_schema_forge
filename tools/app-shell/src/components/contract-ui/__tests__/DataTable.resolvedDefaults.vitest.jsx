import { render, screen } from '@testing-library/react';

// Mirrors DataTable.inlineAdd.vitest.jsx mock setup. This spec verifies the
// HandleDefaults seeding in InlineAddRow.buildEmpty: backend-resolved defaults
// fill EMPTY editable fields only, never overriding literal defaults, the client
// lineNo, or a skipDefault field.
vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => ({}),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));
vi.mock('@/lib/buildUrlWithParams.js', () => ({ buildUrlWithParams: (url) => url }));
vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));
vi.mock('@/lib/statusBadge.js', () => ({
  getStatusDotColor: () => 'bg-gray-400',
  getStatusGridPillClass: () => '',
  getStatusPillClass: () => '',
  statusLabel: (raw) => raw,
}));
vi.mock('@/components/ui/status-tag', () => ({
  StatusTag: ({ status, label }) => <span data-testid="status-tag">{label || status}</span>,
}));
vi.mock('@/components/ui/tag', () => ({ Tag: ({ label }) => <span>{label}</span> }));
vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (row, key) => row?.[key + '$_identifier'] ?? row?.[key] ?? '',
}));
vi.mock('@/lib/resolveColumnLabel.js', () => ({ resolveColumnLabel: (col) => col.label ?? col.key }));
vi.mock('@/lib/formatAmount.js', () => ({ formatAmount: (val) => (val != null ? String(val) : '') }));
vi.mock('@/lib/applyCalloutUpdates.js', () => ({
  applyCalloutUpdates: (prev, updates) => ({ ...prev, ...updates }),
}));
vi.mock('../ProductSearchDrawer.jsx', () => ({ default: () => null }));
vi.mock('../InternalConsumptionProductSearchDrawer.jsx', () => ({ default: () => null }));
vi.mock('../SelectorInput.jsx', () => ({ SelectorInput: () => <div data-testid="selector-input" /> }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { DataTable } from '../DataTable.jsx';

function renderAddRow(fields, resolvedDefaults) {
  const columns = fields.map((f) => ({ key: f.key, label: f.label ?? f.key, type: f.type }));
  return render(
    <DataTable
      columns={columns}
      data={[]}
      addRow={{ active: true, fields, onAdd: vi.fn(() => Promise.resolve(true)), onCancel: vi.fn(), catalogs: {}, resolvedDefaults }}
      selectable={false}
    />,
  );
}

const FIELDS = [
  { key: 'lineNo', label: 'Line', type: 'number' },
  { key: 'description', label: 'Description', type: 'string' },
  { key: 'quantity', label: 'Qty', type: 'number', defaultValue: 1 },
  { key: 'note', label: 'Note', type: 'string', skipDefault: true },
];

describe('DataTable inline add-row — resolvedDefaults (HandleDefaults)', () => {
  it('fills an empty editable field from resolvedDefaults', () => {
    renderAddRow(FIELDS, { description: 'Header desc' });
    expect(screen.getByTestId('inline-add-field-description').value).toBe('Header desc');
  });

  it('does NOT override a literal default (quantity stays 1)', () => {
    renderAddRow(FIELDS, { quantity: 99 });
    expect(screen.getByTestId('inline-add-field-quantity').value).toBe('1');
  });

  it('does NOT fill a skipDefault field', () => {
    renderAddRow(FIELDS, { note: 'should-not-apply' });
    expect(screen.getByTestId('inline-add-field-note').value).toBe('');
  });

  it('does NOT override the client-computed lineNo', () => {
    // No data rows → defaultLineNo = 10; resolvedDefaults.lineNo must not win.
    renderAddRow(FIELDS, { lineNo: 5 });
    expect(screen.getByTestId('inline-add-field-lineNo').value).toBe('10');
  });

  it('leaves fields empty when resolvedDefaults is absent', () => {
    renderAddRow(FIELDS, undefined);
    expect(screen.getByTestId('inline-add-field-description').value).toBe('');
  });
});
