/**
 * ETP-5323 — DataTable's add-row `renderInputCell` text `<input>` must apply the
 * field's `maxLength` (mirrors InlineLinesPanel.maxLength.vitest.jsx's edit-mode
 * coverage for the SAME regression: a brand-new line's Description must not be
 * typeable past its AD column length either, e.g. C_OrderLine/C_InvoiceLine's
 * 2000-char limit).
 *
 * Mirrors the DataTable.inlineAdd.vitest.jsx mock setup.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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

import { DataTable } from '../DataTable.jsx';

function renderAddRow(fields) {
  const columns = fields.map((f) => ({ key: f.key, label: f.label ?? f.key, type: f.type }));
  return render(
    <DataTable
      columns={columns}
      data={[]}
      addRow={{ active: true, fields, onAdd: vi.fn(), onCancel: vi.fn(), catalogs: {} }}
      selectable={false}
    />,
  );
}

describe('DataTable inline add-row — text maxLength (ETP-5323)', () => {
  it('applies the field maxLength as the HTML attribute on the add-row text input', () => {
    renderAddRow([
      { key: 'description', label: 'Description', type: 'string', maxLength: 2000 },
    ]);
    const input = screen.getByTestId('inline-add-field-description');
    expect(input).toHaveAttribute('maxlength', '2000');
  });

  it('does not add a maxlength attribute when the field declares none (regression guard)', () => {
    renderAddRow([
      { key: 'description', label: 'Description', type: 'string' },
    ]);
    const input = screen.getByTestId('inline-add-field-description');
    expect(input).not.toHaveAttribute('maxlength');
  });

  it('prevents typing past the configured maxLength on the add-row input', async () => {
    renderAddRow([
      { key: 'description', label: 'Description', type: 'string', maxLength: 10 },
    ]);
    const input = screen.getByTestId('inline-add-field-description');
    await userEvent.type(input, 'This description is way longer than ten characters');

    expect(input.value.length).toBeLessThanOrEqual(10);
    expect(input.value).toBe('This descr');
  });
});
