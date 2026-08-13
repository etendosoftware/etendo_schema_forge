import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ETP-4600 regression: after DataTable.jsx's renderSelectorCell was switched from a plain
// Radix <Select> to the searchable InlineSearchCombo for `type: 'selector'` add-row cells,
// setting a `type: 'selector'` field (e.g. Tax) and then clicking outside the row must still
// run the full required-field validation before saving — it must NOT silently save a line
// that is missing an unrelated required field (e.g. Product). Reproduces the exact bug: only
// the tax selector is filled, the row is closed via an outside pointerdown (not Enter), and
// the required `product` field is left empty.
vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => ({}),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/lib/buildUrlWithParams.js', () => ({ buildUrlWithParams: (url) => url }));
// Serve options straight off the field (`field.testOptions`) instead of a real catalog lookup —
// keeps this spec independent of selectorCatalog.js's real shape.
vi.mock('@/lib/selectorCatalog.js', () => ({
  getCatalogOptions: (catalogs, entity, field) => field?.testOptions || [],
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

import { toast } from 'sonner';
import { DataTable } from '../DataTable.jsx';

const TAX_OPTIONS = [{ id: 'tax-21', name: 'IVA 21%' }];

function renderAddRow(fields, onAdd, onCancel = vi.fn()) {
  const columns = fields.map((f) => ({ key: f.key, label: f.label ?? f.key, type: f.type }));
  render(
    <DataTable
      columns={columns}
      data={[]}
      addRow={{ active: true, fields, onAdd, onCancel, catalogs: {} }}
      selectable={false}
    />,
  );
  return { onCancel };
}

describe('DataTable inline add-row — selector cell + outside click still validates required fields', () => {
  beforeEach(() => {
    toast.error.mockClear();
    toast.success.mockClear();
  });

  it('does NOT save on outside click when only the selector (tax) field is set and product is required+empty', async () => {
    const onAdd = vi.fn(() => Promise.resolve(true));
    const fields = [
      { key: 'product', label: 'Product', type: 'string', required: true },
      { key: 'tax', label: 'Tax', type: 'selector', testOptions: TAX_OPTIONS },
    ];
    renderAddRow(fields, onAdd);

    // Open the tax combo and pick the only option — mirrors the InlineSearchCombo
    // onMouseDown->handleSelect path (preventDefault keeps focus on the input).
    const taxInput = screen.getByTestId('inline-add-field-tax');
    fireEvent.focus(taxInput);
    const option = await screen.findByTestId('inline-add-option-tax-tax-21');
    fireEvent.mouseDown(option);

    // Now simulate a genuine outside click: pointerdown on an element outside the row,
    // outside every ignored portal selector (dialog / inline-add-portal / listbox / popper).
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    fireEvent.pointerDown(outside);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('requiredFieldsMissing'));
    expect(onAdd).not.toHaveBeenCalled();

    document.body.removeChild(outside);
  });

  it('DOES save on outside click once both product and tax are set', async () => {
    const onAdd = vi.fn(() => Promise.resolve(true));
    const fields = [
      { key: 'product', label: 'Product', type: 'string', required: true },
      { key: 'tax', label: 'Tax', type: 'selector', testOptions: TAX_OPTIONS },
    ];
    renderAddRow(fields, onAdd);

    fireEvent.change(screen.getByTestId('inline-add-field-product'), { target: { value: 'Widget' } });

    const taxInput = screen.getByTestId('inline-add-field-tax');
    fireEvent.focus(taxInput);
    const option = await screen.findByTestId('inline-add-option-tax-tax-21');
    fireEvent.mouseDown(option);

    const outside = document.createElement('div');
    document.body.appendChild(outside);
    fireEvent.pointerDown(outside);

    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(toast.error).not.toHaveBeenCalledWith('requiredFieldsMissing');
    const payload = onAdd.mock.calls[0][0];
    expect(payload.product).toBe('Widget');
    expect(payload.tax).toBe('tax-21');

    document.body.removeChild(outside);
  });

  it('renders an empty placeholder cell (no combobox) when a selector field has no catalog options and no selectorUrl', () => {
    // Target: DataTable.jsx renderSelectorCell's `options.length === 0 && !selectorUrl` branch.
    // No apiBaseUrl is passed to DataTable, so buildSelectorUrl() resolves selectorUrl to null;
    // testOptions is intentionally omitted so getCatalogOptions() returns [].
    const fields = [{ key: 'tax', label: 'Tax', type: 'selector' }];
    renderAddRow(fields, vi.fn());

    expect(screen.queryByTestId('inline-add-field-tax')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
