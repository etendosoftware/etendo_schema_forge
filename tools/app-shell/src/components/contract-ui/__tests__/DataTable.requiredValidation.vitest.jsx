import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Behavioral regression spec for the inline add-row required-field validation.
// Mirrors DataTable.inlineAdd.vitest.jsx's mock/render setup and drives the
// submit path (Enter → submitLine) so the executed handlers count toward
// coverage. Proves two fixes to isMissingRequired:
//   1. A required checkbox/boolean left unchecked is NOT "missing".
//   2. clearsField forms a mutually-exclusive one-of group: filling either
//      member satisfies both; filling neither flags both.
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

describe('DataTable inline add-row — required checkbox/boolean is never missing', () => {
  beforeEach(() => {
    toast.error.mockClear();
    toast.success.mockClear();
  });

  it('does NOT block submit when a required checkbox is left unchecked', async () => {
    const onAdd = vi.fn(() => Promise.resolve(true));
    const fields = [
      { key: 'name', label: 'Name', type: 'string', required: true },
      { key: 'flag', label: 'Open Items', type: 'checkbox', required: true },
    ];
    renderAddRow(fields, onAdd);
    // Fill only the non-checkbox required field; leave `flag` empty/unchecked.
    fireEvent.change(screen.getByTestId('inline-add-field-name'), { target: { value: 'Widget' } });
    fireEvent.keyDown(screen.getByTestId('inline-add-field-name'), { key: 'Enter' });
    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(toast.error).not.toHaveBeenCalledWith('requiredFieldsMissing');
  });

  it('does NOT block submit when a required boolean field is left unchecked', async () => {
    const onAdd = vi.fn(() => Promise.resolve(true));
    const fields = [
      { key: 'name', label: 'Name', type: 'string', required: true },
      { key: 'active', label: 'Active', type: 'boolean', required: true },
    ];
    renderAddRow(fields, onAdd);
    fireEvent.change(screen.getByTestId('inline-add-field-name'), { target: { value: 'Widget' } });
    fireEvent.keyDown(screen.getByTestId('inline-add-field-name'), { key: 'Enter' });
    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(toast.error).not.toHaveBeenCalledWith('requiredFieldsMissing');
  });
});

describe('DataTable inline add-row — clearsField mutually-exclusive group', () => {
  // A journal line is a debit OR a credit: foreignCurrencyDebit clears
  // foreignCurrencyCredit and vice versa, and both are required. The
  // requirement is "one of the pair".
  const pairFields = () => [
    {
      key: 'foreignCurrencyDebit',
      label: 'Debit',
      type: 'number',
      required: true,
      clearsField: 'foreignCurrencyCredit',
    },
    {
      key: 'foreignCurrencyCredit',
      label: 'Credit',
      type: 'number',
      required: true,
      clearsField: 'foreignCurrencyDebit',
    },
  ];

  beforeEach(() => {
    toast.error.mockClear();
    toast.success.mockClear();
  });

  it('submits when only the debit member of the pair is filled', async () => {
    const onAdd = vi.fn(() => Promise.resolve(true));
    renderAddRow(pairFields(), onAdd);
    fireEvent.change(screen.getByTestId('inline-add-field-foreignCurrencyDebit'), {
      target: { value: '100' },
    });
    fireEvent.keyDown(screen.getByTestId('inline-add-field-foreignCurrencyDebit'), { key: 'Enter' });
    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(toast.error).not.toHaveBeenCalledWith('requiredFieldsMissing');
    expect(onAdd.mock.calls[0][0].foreignCurrencyDebit).toBe(100);
  });

  it('submits when only the credit member of the pair is filled', async () => {
    const onAdd = vi.fn(() => Promise.resolve(true));
    renderAddRow(pairFields(), onAdd);
    fireEvent.change(screen.getByTestId('inline-add-field-foreignCurrencyCredit'), {
      target: { value: '250' },
    });
    fireEvent.keyDown(screen.getByTestId('inline-add-field-foreignCurrencyCredit'), { key: 'Enter' });
    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(toast.error).not.toHaveBeenCalledWith('requiredFieldsMissing');
    expect(onAdd.mock.calls[0][0].foreignCurrencyCredit).toBe(250);
  });

  it('blocks submit and toasts when NEITHER member of the pair is filled', async () => {
    const onAdd = vi.fn(() => Promise.resolve(true));
    renderAddRow(pairFields(), onAdd);
    fireEvent.keyDown(screen.getByTestId('inline-add-field-foreignCurrencyDebit'), { key: 'Enter' });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('requiredFieldsMissing'));
    expect(onAdd).not.toHaveBeenCalled();
  });
});
