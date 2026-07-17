import { render, screen, within } from '@testing-library/react';

// Mock i18n hooks — every label hook returns the key verbatim (no hardcoded English).
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
  getStatusTone: () => 'neutral',
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
  formatAmount: (val) => val != null ? String(val) : '',
}));
vi.mock('@/lib/applyCalloutUpdates.js', () => ({
  applyCalloutUpdates: (prev, updates) => ({ ...prev, ...updates }),
}));
vi.mock('../ProductSearchDrawer.jsx', () => ({
  default: () => null,
}));
vi.mock('../ProductStockSearchDrawer.jsx', () => ({
  default: () => null,
}));
vi.mock('../SelectorInput.jsx', () => ({
  SelectorInput: () => <div data-testid="selector-input" />,
}));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { DataTable } from '../DataTable.jsx';

// The em-dash the component renders for empty display cells (see displayOrDash).
const DASH = '—';

// Columns: one editable amount column (in `fields`) plus a non-editable display
// column `currency` (NOT in `fields`) that must be filled from the seed.
const COLUMNS = [
  { key: 'rate', label: 'Rate', type: 'amount' },
  { key: 'currency', label: 'Currency', type: 'string' },
];

// addLineFields includes ONLY the editable column — `currency` is display-only.
const FIELDS = [
  { key: 'rate', label: 'Rate', type: 'amount' },
];

function renderAddRow(seedValues) {
  const addRow = {
    active: true,
    fields: FIELDS,
    onAdd: vi.fn(),
    onCancel: vi.fn(),
    catalogs: {},
  };
  if (seedValues !== undefined) addRow.seedValues = seedValues;
  return render(
    <DataTable
      columns={COLUMNS}
      data={[]}
      addRow={addRow}
      selectable={false}
    />
  );
}

describe('DataTable — seeded inline add-row column', () => {
  it('renders the seeded $_identifier label in the non-editable display cell', () => {
    renderAddRow({ currency: 'id-eur', 'currency$_identifier': 'EUR' });
    const cell = screen.getByTestId('inline-add-cell-currency');
    expect(cell).toHaveTextContent('EUR');
    expect(cell).not.toHaveTextContent(DASH);
  });

  it('renders the dash in the same cell when no seed is provided (control)', () => {
    renderAddRow(undefined);
    const cell = screen.getByTestId('inline-add-cell-currency');
    expect(cell).toHaveTextContent(DASH);
    expect(cell).not.toHaveTextContent('EUR');
  });

  it('renders the dash when the seed omits the currency key (control)', () => {
    renderAddRow({ someOtherKey: 'X', 'someOtherKey$_identifier': 'Y' });
    const cell = screen.getByTestId('inline-add-cell-currency');
    expect(cell).toHaveTextContent(DASH);
    expect(cell).not.toHaveTextContent('EUR');
  });

  it('keeps the editable field as an input and does not seed-overwrite it', () => {
    // The editable `rate` column renders an input field, not a seeded display cell.
    // Even if the seed carries a `rate` key, the editable field wins (seed only
    // fills keys with no input field).
    renderAddRow({ rate: '999', currency: 'id-eur', 'currency$_identifier': 'EUR' });
    const rateInput = screen.getByTestId('inline-add-field-rate');
    expect(rateInput).toBeInTheDocument();
    // Editable field starts empty (its own default), not the seeded '999'.
    expect(rateInput).toHaveValue('');
    // The display column still shows the seeded label.
    expect(screen.getByTestId('inline-add-cell-currency')).toHaveTextContent('EUR');
  });
});
