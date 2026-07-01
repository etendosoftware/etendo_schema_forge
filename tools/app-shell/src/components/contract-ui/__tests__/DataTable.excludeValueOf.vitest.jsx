/**
 * Tests the generic `excludeValueOf` selector exclusion in the DataTable inline
 * add-row (renderSelectorCell). A selector field with excludeValueOf hides the
 * option whose id equals the current value of a sibling field on the same row
 * (e.g. newStorageBin excludeValueOf storageBin — can't move stock to the same bin).
 *
 * Covers BOTH render paths of renderSelectorCell:
 *  - preloaded-catalog dropdown (filters options by o.id !== excludeId)
 *  - URL-backed InlineSearchCombo (receives excludeId as a prop)
 * Plus the opt-in no-op guarantee (no excludeValueOf → excludeId null → no filtering).
 */
import { render, screen } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => ({}),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/lib/buildUrlWithParams.js', () => ({ buildUrlWithParams: (url) => url }));

// Render the native dropdown options eagerly so the filtered SelectItems are in
// the DOM without having to open a Radix popover (flaky in jsdom).
vi.mock('@/components/ui/select', () => ({
  Select: ({ children }) => <div data-testid="select">{children}</div>,
  SelectTrigger: ({ children }) => <div>{children}</div>,
  SelectValue: ({ placeholder }) => <span>{placeholder}</span>,
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children, value }) => <option value={value}>{children}</option>,
}));

// Inject catalog options per field. Returns options only for the field whose
// `optionsByField` entry exists; default empty otherwise.
const catalogOptions = { value: [] };
vi.mock('@/lib/selectorCatalog.js', () => ({
  getCatalogOptions: (_catalogs, _entity, field) => catalogOptions[field.key] ?? [],
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

// Capture the props InlineSearchCombo receives so we can assert excludeId.
const comboProps = [];
vi.mock('../InlineSearchCombo.jsx', () => ({
  InlineSearchCombo: (props) => {
    comboProps.push(props);
    return (
      <div data-testid="inline-search-combo" data-exclude-id={props.excludeId == null ? '' : String(props.excludeId)} />
    );
  },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { DataTable } from '../DataTable.jsx';

const BIN_OPTIONS = [
  { id: 'LOC-AG', name: 'Aisle G' },
  { id: 'LOC-BH', name: 'Aisle H' },
  { id: 'LOC-CI', name: 'Aisle I' },
];

function renderAddRow(fields, { withCatalog = false, entity = 'movementLine', apiBaseUrl = null } = {}) {
  catalogOptions.newStorageBin = withCatalog ? BIN_OPTIONS : [];
  const columns = fields.map((f) => ({ key: f.key, label: f.label ?? f.key, type: f.type }));
  return render(
    <DataTable
      columns={columns}
      data={[]}
      entity={entity}
      apiBaseUrl={apiBaseUrl}
      addRow={{ active: true, fields, onAdd: vi.fn(), onCancel: vi.fn(), catalogs: {} }}
      selectable={false}
    />,
  );
}

// storageBin carries a literal defaultValue so the add-row seeds values.storageBin
// to the sibling value the exclusion should hide.
function fieldsWith(excludeValueOf, originBinValue = 'LOC-AG') {
  return [
    { key: 'storageBin', label: 'Origin Bin', type: 'string', defaultValue: originBinValue },
    {
      key: 'newStorageBin', label: 'Destination Bin', type: 'selector',
      column: 'M_LocatorTo_ID', id: 'newStorageBin',
      ...(excludeValueOf ? { excludeValueOf } : {}),
    },
  ];
}

describe('DataTable add-row — excludeValueOf', () => {
  beforeEach(() => {
    comboProps.length = 0;
    catalogOptions.newStorageBin = [];
  });

  it('filters the preloaded-catalog dropdown to drop the sibling value option', () => {
    renderAddRow(fieldsWith('storageBin', 'LOC-AG'), { withCatalog: true });
    // The excluded option (LOC-AG / "Aisle G") must NOT be rendered.
    expect(screen.queryByText('Aisle G')).toBeNull();
    // The other options remain.
    expect(screen.getByText('Aisle H')).toBeInTheDocument();
    expect(screen.getByText('Aisle I')).toBeInTheDocument();
  });

  it('shows all options when the sibling field is empty (excludeId null)', () => {
    renderAddRow(fieldsWith('storageBin', ''), { withCatalog: true });
    expect(screen.getByText('Aisle G')).toBeInTheDocument();
    expect(screen.getByText('Aisle H')).toBeInTheDocument();
    expect(screen.getByText('Aisle I')).toBeInTheDocument();
  });

  it('opt-in no-op: without excludeValueOf, no option is filtered', () => {
    renderAddRow(fieldsWith(null, 'LOC-AG'), { withCatalog: true });
    // All three options render — nothing is excluded.
    expect(screen.getByText('Aisle G')).toBeInTheDocument();
    expect(screen.getByText('Aisle H')).toBeInTheDocument();
    expect(screen.getByText('Aisle I')).toBeInTheDocument();
  });

  it('passes excludeId to the URL-backed InlineSearchCombo when catalog is empty', () => {
    renderAddRow(fieldsWith('storageBin', 'LOC-AG'), { withCatalog: false, apiBaseUrl: '/api' });
    expect(screen.getByTestId('inline-search-combo')).toBeInTheDocument();
    const propsForCombo = comboProps.find((p) => p.field?.key === 'newStorageBin');
    expect(propsForCombo).toBeTruthy();
    expect(propsForCombo.excludeId).toBe('LOC-AG');
  });

  it('passes excludeId=null to InlineSearchCombo when excludeValueOf is absent', () => {
    renderAddRow(fieldsWith(null, 'LOC-AG'), { withCatalog: false, apiBaseUrl: '/api' });
    const propsForCombo = comboProps.find((p) => p.field?.key === 'newStorageBin');
    expect(propsForCombo).toBeTruthy();
    expect(propsForCombo.excludeId).toBeNull();
  });
});
