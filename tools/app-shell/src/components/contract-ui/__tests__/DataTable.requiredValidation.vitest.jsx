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

describe('DataTable inline add-row — email-format validation', () => {
  beforeEach(() => {
    toast.error.mockClear();
    toast.success.mockClear();
  });

  const emailFields = () => [
    { key: 'name', label: 'Name', type: 'string' },
    { key: 'email', column: 'Email', label: 'Email', type: 'string' },
  ];

  it('blocks submit and toasts for a non-empty malformed email', async () => {
    const onAdd = vi.fn(() => Promise.resolve(true));
    renderAddRow(emailFields(), onAdd);
    fireEvent.change(screen.getByTestId('inline-add-field-email'), { target: { value: 'not-an-email' } });
    fireEvent.keyDown(screen.getByTestId('inline-add-field-email'), { key: 'Enter' });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('sendModalInvalidEmail'));
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('does NOT block when the email is empty (optional field)', async () => {
    const onAdd = vi.fn(() => Promise.resolve(true));
    renderAddRow(emailFields(), onAdd);
    fireEvent.change(screen.getByTestId('inline-add-field-name'), { target: { value: 'Jane' } });
    fireEvent.keyDown(screen.getByTestId('inline-add-field-name'), { key: 'Enter' });
    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(toast.error).not.toHaveBeenCalledWith('sendModalInvalidEmail');
  });

  it('submits a well-formed email', async () => {
    const onAdd = vi.fn(() => Promise.resolve(true));
    renderAddRow(emailFields(), onAdd);
    fireEvent.change(screen.getByTestId('inline-add-field-email'), { target: { value: 'jane@example.com' } });
    fireEvent.keyDown(screen.getByTestId('inline-add-field-email'), { key: 'Enter' });
    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(onAdd.mock.calls[0][0].email).toBe('jane@example.com');
    expect(toast.error).not.toHaveBeenCalledWith('sendModalInvalidEmail');
  });

  it('never treats a non-email column as an email (regression)', async () => {
    const onAdd = vi.fn(() => Promise.resolve(true));
    // 'name' holds an email-shaped-invalid string but must NOT be email-validated.
    renderAddRow([{ key: 'name', column: 'Name', label: 'Name', type: 'string' }], onAdd);
    fireEvent.change(screen.getByTestId('inline-add-field-name'), { target: { value: 'not-an-email' } });
    fireEvent.keyDown(screen.getByTestId('inline-add-field-name'), { key: 'Enter' });
    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(toast.error).not.toHaveBeenCalledWith('sendModalInvalidEmail');
  });
});

describe('DataTable inline add-row — phone-format validation', () => {
  beforeEach(() => {
    toast.error.mockClear();
    toast.success.mockClear();
  });

  const phoneFields = () => [
    { key: 'name', label: 'Name', type: 'string' },
    { key: 'phone', column: 'Phone', label: 'Phone', type: 'string' },
  ];

  it('blocks submit and toasts for an invalid phone', async () => {
    const onAdd = vi.fn(() => Promise.resolve(true));
    renderAddRow(phoneFields(), onAdd);
    fireEvent.change(screen.getByTestId('inline-add-field-phone'), { target: { value: '600abc' } });
    fireEvent.keyDown(screen.getByTestId('inline-add-field-phone'), { key: 'Enter' });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('phoneInvalidChars'));
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('does NOT block when the phone is empty (optional field)', async () => {
    const onAdd = vi.fn(() => Promise.resolve(true));
    renderAddRow(phoneFields(), onAdd);
    fireEvent.change(screen.getByTestId('inline-add-field-name'), { target: { value: 'Jane' } });
    fireEvent.keyDown(screen.getByTestId('inline-add-field-name'), { key: 'Enter' });
    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(toast.error).not.toHaveBeenCalledWith('phoneInvalidChars');
  });

  it('submits a valid phone number', async () => {
    const onAdd = vi.fn(() => Promise.resolve(true));
    renderAddRow(phoneFields(), onAdd);
    fireEvent.change(screen.getByTestId('inline-add-field-phone'), { target: { value: '+34 600 123 456' } });
    fireEvent.keyDown(screen.getByTestId('inline-add-field-phone'), { key: 'Enter' });
    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(onAdd.mock.calls[0][0].phone).toBe('+34 600 123 456');
    expect(toast.error).not.toHaveBeenCalledWith('phoneInvalidChars');
  });

  it('never treats a non-phone column as a phone (regression)', async () => {
    const onAdd = vi.fn(() => Promise.resolve(true));
    renderAddRow([{ key: 'name', column: 'Name', label: 'Name', type: 'string' }], onAdd);
    fireEvent.change(screen.getByTestId('inline-add-field-name'), { target: { value: 'abc def' } });
    fireEvent.keyDown(screen.getByTestId('inline-add-field-name'), { key: 'Enter' });
    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(toast.error).not.toHaveBeenCalledWith('phoneInvalidChars');
  });
});
