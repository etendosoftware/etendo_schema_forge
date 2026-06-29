import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mirrors the DataTable.clearsField.vitest.jsx mock setup. This spec drives the
// inline add-row submit path (Enter key → submitLine), covering the
// required/min validation guards and coerceFieldValues on a successful add.
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

import { toast } from 'sonner';
import { DataTable } from '../DataTable.jsx';

function renderAddRow(fields, onAdd) {
  const columns = fields.map((f) => ({ key: f.key, label: f.label ?? f.key, type: f.type }));
  return render(
    <DataTable
      columns={columns}
      data={[]}
      addRow={{ active: true, fields, onAdd, onCancel: vi.fn(), catalogs: {} }}
      selectable={false}
    />,
  );
}

describe('DataTable inline add-row — submit validation and coercion', () => {
  beforeEach(() => {
    toast.error.mockClear();
    toast.success.mockClear();
  });

  it('blocks submit and toasts when a required field is empty', async () => {
    const onAdd = vi.fn(() => Promise.resolve(true));
    const fields = [{ key: 'name', label: 'Name', type: 'string', required: true }];
    renderAddRow(fields, onAdd);
    const input = screen.getByTestId('inline-add-field-name');
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('requiredFieldsMissing'));
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('blocks submit and toasts when a numeric field is below its min', async () => {
    const onAdd = vi.fn(() => Promise.resolve(true));
    const fields = [{ key: 'qty', label: 'Qty', type: 'number', min: 1 }];
    renderAddRow(fields, onAdd);
    const input = screen.getByTestId('inline-add-field-qty');
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('fieldMinValueError'));
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('submits and coerces numeric strings to numbers on a valid add', async () => {
    const onAdd = vi.fn(() => Promise.resolve(true));
    const fields = [
      { key: 'name', label: 'Name', type: 'string', required: true },
      { key: 'qty', label: 'Qty', type: 'number' },
    ];
    renderAddRow(fields, onAdd);
    fireEvent.change(screen.getByTestId('inline-add-field-name'), { target: { value: 'Widget' } });
    fireEvent.change(screen.getByTestId('inline-add-field-qty'), { target: { value: '5.5' } });
    fireEvent.keyDown(screen.getByTestId('inline-add-field-qty'), { key: 'Enter' });
    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    const payload = onAdd.mock.calls[0][0];
    expect(payload.name).toBe('Widget');
    expect(payload.qty).toBe(5.5);
  });

  it('substitutes defaultValue for an empty numeric field on submit (ETP-4277)', async () => {
    // When the user clears a numeric field with a defaultValue (e.g. discount), the
    // POST payload must include the defaultValue (0), not omit the field entirely.
    // Without this, the backend applies its own implicit default which can be wrong.
    const onAdd = vi.fn(() => Promise.resolve(true));
    const fields = [
      { key: 'product', label: 'Product', type: 'string', required: true },
      { key: 'discount', label: 'Discount', type: 'number', min: 0, max: 100, defaultValue: 0 },
    ];
    renderAddRow(fields, onAdd);
    fireEvent.change(screen.getByTestId('inline-add-field-product'), { target: { value: 'Agua' } });
    // Leave discount empty (simulates the user clearing the default "0")
    fireEvent.keyDown(screen.getByTestId('inline-add-field-discount'), { key: 'Enter' });
    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    const payload = onAdd.mock.calls[0][0];
    expect(payload.product).toBe('Agua');
    // Empty discount → coerceFieldValues must substitute defaultValue 0, not leave ''.
    expect(payload.discount).toBe(0);
  });

  it('cancels the add-row on Escape', () => {
    const onCancel = vi.fn();
    const fields = [{ key: 'name', label: 'Name', type: 'string' }];
    render(
      <DataTable
        columns={[{ key: 'name', label: 'Name', type: 'string' }]}
        data={[]}
        addRow={{ active: true, fields, onAdd: vi.fn(), onCancel, catalogs: {} }}
        selectable={false}
      />,
    );
    fireEvent.keyDown(screen.getByTestId('inline-add-field-name'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });
});
