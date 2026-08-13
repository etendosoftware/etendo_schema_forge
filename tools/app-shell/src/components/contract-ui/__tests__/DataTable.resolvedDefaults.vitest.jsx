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
// Serve options straight off the field (`field.testOptions`) instead of a real catalog —
// mirrors DataTable.selectorOutsideClick.vitest.jsx. A non-empty options array is required
// for renderSelectorCell to render InlineSearchCombo at all (it short-circuits to an empty
// cell when both options and selectorUrl are falsy).
vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: (catalogs, entity, field) => field?.testOptions || [] }));
vi.mock('@/lib/statusBadge.js', () => ({
  getStatusDotColor: () => 'bg-gray-400',
  getStatusGridPillClass: () => '',
  getStatusPillClass: () => '',
  getStatusTone: () => 'neutral',
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
vi.mock('../ProductStockSearchDrawer.jsx', () => ({ default: () => null }));
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

// Regression for the Contacts "+ Add Bank Account" bug: a selector/search field
// resolved from resolvedDefaults (e.g. country: "106") rendered a chip with a
// working Clear (x) button but a BLANK label, because the backend's companion
// `country$_identifier` key has no entry in fieldMap and was silently dropped.
// A dummy non-matching catalog option: the resolved id ('106'/'9') is never present in
// the local catalog (mirrors the live bug — country's catalog isn't preloaded), forcing
// InlineSearchCombo to fall back to the `displayLabel` prop instead of an options lookup.
const DUMMY_OPTIONS = [{ id: 'unrelated-id', name: 'Unrelated' }];

const SELECTOR_FIELDS = [
  { key: 'lineNo', label: 'Line', type: 'number' },
  { key: 'country', label: 'Country', type: 'selector', testOptions: DUMMY_OPTIONS },
  // Non-macro literal default on a selector field (e.g. a static "priority" FK) — must
  // keep working exactly as before; an unrelated resolvedDefaults identifier for the
  // same key must never attach to a value that didn't come from resolvedDefaults.
  { key: 'priority', label: 'Priority', type: 'selector', defaultValue: '5', testOptions: DUMMY_OPTIONS },
];

describe('DataTable inline add-row — resolvedDefaults identifier passthrough (selector fields)', () => {
  it('seeds both the id and the display label for a selector field resolved from resolvedDefaults', () => {
    renderAddRow(SELECTOR_FIELDS, { country: '106', 'country$_identifier': 'Spain' });
    const chip = screen.getByTestId('inline-add-field-country-chip');
    expect(chip.textContent).toContain('Spain');
  });

  it('does NOT seed a stray identifier when its base field has no matching resolvedDefaults entry', () => {
    // country never resolved (absent) — the identifier must not be attached to it either,
    // so the cell stays a plain empty search input (no chip).
    renderAddRow(SELECTOR_FIELDS, { 'country$_identifier': 'Spain' });
    expect(screen.queryByTestId('inline-add-field-country-chip')).not.toBeInTheDocument();
  });

  it('does NOT attach a resolvedDefaults identifier to a field seeded by its OWN literal defaultValue', () => {
    // priority's value came from its literal defaultValue ('5'), not from resolvedDefaults
    // (which resolved a DIFFERENT id, '9') — the mismatched identifier must be ignored, so
    // the chip shows no borrowed label for a value it doesn't actually describe.
    renderAddRow(SELECTOR_FIELDS, { priority: '9', 'priority$_identifier': 'High' });
    const chip = screen.getByTestId('inline-add-field-priority-chip');
    expect(chip.textContent).not.toContain('High');
  });
});
