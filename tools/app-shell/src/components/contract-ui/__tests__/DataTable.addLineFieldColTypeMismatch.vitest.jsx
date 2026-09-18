// ETP-5107 §14 — regression for the add-line thousands-grouping bug found by the
// human AFTER the initial QA matrix passed (docs/plans/2026-09-08-etp5107-price-input-locale-fix.md §14).
//
// Root cause: `renderNumericInputCell`'s `isTwoDecimal` used to be computed ONLY
// from `field.type` (sourced from `addLineFields.entry`) — but EVERY window
// declares its add-line price field (`listPrice`) as `type: 'number'` there,
// while the SAME field's `columns`-list entry (used by InlineLinesPanel for
// existing-line editing) correctly declares `type: 'amount'`. So a brand-new
// add-line row's Precio field never got live thousands-grouping while typing
// (typing "12345" stayed "12345"), even though the exact same field on an
// already-existing line grouped correctly. Fixed to also consult `col?.type` —
// the matching `columns` entry, already available as a parameter — mirroring
// the pattern `renderDerivedAddCell` (same file) already uses.
//
// This test reproduces the bug's exact precondition (field.type: 'number',
// col.type: 'amount', for the SAME key) so it would have failed against the
// pre-fix `TWO_DECIMAL_FIELD_TYPES.has(field.type)`-only check.

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

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable } from '../DataTable.jsx';

// Mirrors a real window's decisions.json exactly: `columns` (InlineLinesPanel's
// existing-line list) correctly says 'amount'; `addLineFields.entry` (the
// add-line field list) says the generic 'number' for the SAME field.
const COLUMNS = [{ key: 'listPrice', label: 'Precio', type: 'amount' }];
const FIELDS = [{ key: 'listPrice', label: 'Precio', type: 'number' }];

function renderAddRow({ columns = COLUMNS, fields = FIELDS } = {}) {
  return render(
    <DataTable
      columns={columns}
      data={[]}
      addRow={{ active: true, fields, onAdd: vi.fn(), onCancel: vi.fn(), catalogs: {} }}
      selectable={false}
    />,
  );
}

describe('DataTable add-line — field.type/col.type grouping mismatch (ETP-5107 §14 regression)', () => {
  it('groups a 5-digit price live while typing, even though field.type is the generic "number" (col.type "amount" wins the OR)', async () => {
    const user = userEvent.setup();
    renderAddRow();
    const input = screen.getByTestId('inline-add-field-listPrice');
    await user.click(input);
    await user.keyboard('12345');
    // This is the exact live-reproduced symptom from plan §14: pre-fix, this
    // stayed "12345" (no grouping) on the add-line path specifically, while the
    // same field already grouped correctly for an EXISTING line (InlineLinesPanel,
    // whose col.type was always correct). Post-fix: "12.344"-style live grouping.
    expect(input).toHaveValue('12.345');
  });

  it('control: with NO matching columns entry at all (col undefined) and field.type "number", grouping stays OFF — the fix is not "always group", it specifically consults col.type', async () => {
    const user = userEvent.setup();
    // A column list that does not even declare this field — col resolves to
    // undefined for it, so only field.type (plain 'number') can gate grouping.
    renderAddRow({ columns: [{ key: 'listPrice', label: 'Precio', type: 'number' }] });
    const input = screen.getByTestId('inline-add-field-listPrice');
    await user.click(input);
    await user.keyboard('12345');
    expect(input).toHaveValue('12345');
  });

  it('a genuinely non-price numeric field (discount/percent) is NOT accidentally grouped by the new OR, even when both lists agree on "number"', async () => {
    const user = userEvent.setup();
    renderAddRow({
      columns: [{ key: 'discount', label: 'Descuento', type: 'number' }],
      fields: [{ key: 'discount', label: 'Descuento', type: 'number' }],
    });
    const input = screen.getByTestId('inline-add-field-discount');
    await user.click(input);
    await user.keyboard('12345');
    expect(input).toHaveValue('12345');
  });

  it('the commit-time value is unaffected either way — grouping is purely a display concern', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn(async (v) => v);
    render(
      <DataTable
        columns={COLUMNS}
        data={[]}
        addRow={{ active: true, fields: FIELDS, onAdd, onCancel: vi.fn(), catalogs: {} }}
        selectable={false}
      />,
    );
    const input = screen.getByTestId('inline-add-field-listPrice');
    await user.click(input);
    await user.keyboard('12345');
    expect(input).toHaveValue('12.345');
    await user.keyboard('{Enter}');
    await vi.waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(onAdd.mock.calls[0][0]).toEqual(expect.objectContaining({ listPrice: 12345 }));
  });
});
