import { vi, describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => ({}),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/lib/buildUrlWithParams.js', () => ({
  buildUrlWithParams: (url) => url,
}));

vi.mock('@/lib/selectorCatalog.js', () => ({
  getCatalogOptions: () => [],
}));

vi.mock('@/lib/statusBadge.js', () => ({
  getStatusDotColor: () => 'bg-gray-400',
  getStatusGridPillClass: () => '',
  getStatusPillClass: () => '',
  statusLabel: (raw) => raw,
}));

vi.mock('@/components/ui/status-tag', () => ({
  StatusTag: ({ status, label }) => <span data-testid="status-tag">{label || status}</span>,
}));

vi.mock('@/components/ui/tag', () => ({
  Tag: ({ label }) => <span>{label}</span>,
}));

vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (row, key) => row?.[key + '$_identifier'] ?? row?.[key] ?? '',
}));

vi.mock('@/lib/resolveColumnLabel.js', () => ({
  resolveColumnLabel: (col) => col.label ?? col.key,
}));

vi.mock('@/lib/formatAmount.js', () => ({
  formatAmount: (val) => (val != null ? String(val) : ''),
}));

vi.mock('@/lib/applyCalloutUpdates.js', () => ({
  applyCalloutUpdates: (prev, updates) => ({ ...prev, ...updates }),
}));

vi.mock('../ProductSearchDrawer.jsx', () => ({
  default: () => null,
}));

vi.mock('../InternalConsumptionProductSearchDrawer.jsx', () => ({
  default: () => null,
}));

vi.mock('../SelectorInput.jsx', () => ({
  SelectorInput: () => <div data-testid="selector-input" />,
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { DataTable } from '../DataTable.jsx';

const COLUMNS = [
  { key: 'debit', label: 'Debit', type: 'amount' },
  { key: 'credit', label: 'Credit', type: 'amount' },
];

const FIELDS = [
  { key: 'debit', label: 'Debit', type: 'amount', clearsField: 'credit' },
  { key: 'credit', label: 'Credit', type: 'amount', clearsField: 'debit' },
];

function renderTable() {
  return render(
    <DataTable
      columns={COLUMNS}
      data={[]}
      addRow={{
        active: true,
        fields: FIELDS,
        onAdd: vi.fn(),
        onCancel: vi.fn(),
        catalogs: {},
      }}
      selectable={false}
    />
  );
}

describe('DataTable — clearsField mutual exclusion in inline add-row', () => {
  it('zeroes the paired field when a non-zero value is entered', () => {
    renderTable();
    const debitInput = screen.getByTestId('inline-add-field-debit');
    const creditInput = screen.getByTestId('inline-add-field-credit');
    fireEvent.change(debitInput, { target: { value: '100' } });
    expect(creditInput).toHaveValue('0.00');
  });

  it('does not zero the paired field when an empty string is entered', () => {
    renderTable();
    const debitInput = screen.getByTestId('inline-add-field-debit');
    const creditInput = screen.getByTestId('inline-add-field-credit');
    // First enter a non-zero value so credit becomes 0.00
    fireEvent.change(debitInput, { target: { value: '50' } });
    // Clear the debit field — paired field must not be reset again
    fireEvent.change(debitInput, { target: { value: '' } });
    // Credit should still hold its last value (0.00), not re-zeroed
    expect(creditInput).toHaveValue('0.00');
  });

  it('does not zero the paired field when a zero is entered', () => {
    renderTable();
    const debitInput = screen.getByTestId('inline-add-field-debit');
    // Enter zero — the guard (Number(val) !== 0) must prevent the clear
    fireEvent.change(debitInput, { target: { value: '0' } });
    const creditInput = screen.getByTestId('inline-add-field-credit');
    // Credit should still be empty (never set to 0.00 by the guard)
    expect(creditInput).toHaveValue('');
  });

  it('does not zero the paired field for partial numeric input (Number → NaN)', () => {
    // renderInputCell permits intermediate values like '-', '.', '-.' while
    // typing; Number(val) is NaN for these. The finite-value guard must keep
    // the paired field untouched instead of clearing it mid-typing.
    for (const partial of ['-', '.', '-.']) {
      const { unmount } = renderTable();
      const debitInput = screen.getByTestId('inline-add-field-debit');
      const creditInput = screen.getByTestId('inline-add-field-credit');
      fireEvent.change(debitInput, { target: { value: partial } });
      expect(creditInput).toHaveValue('');
      unmount();
    }
  });
});
