/**
 * ETP-4520 — `visibleWhenCapability`-gated grid columns.
 *
 * A column carrying `visibleWhenCapability` (e.g. the `posted` column on
 * sales-invoice/purchase-invoice, restricted to "showAccountingFields") must
 * be dropped from `visibleColumns` when the current role's capability map
 * doesn't resolve it `true` — and kept when it does. Columns without the
 * prop are unaffected (opt-in, no behavior change).
 *
 * `@/hooks/useCapabilitiesSafe.js` is mocked so the test controls the
 * capability map directly, while the real `isCapabilityVisible`
 * (`@/lib/capabilityVisibility.js`) is used so the actual gating logic runs.
 */
import { render, screen } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => ({ genericLabels: {}, statuses: {} }),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));
vi.mock('@/lib/buildUrlWithParams.js', () => ({ buildUrlWithParams: (url) => url }));
vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));
vi.mock('@/lib/statusBadge.js', () => ({
  getStatusDotColor: () => 'dot',
  getStatusTone: () => 'neutral',
  statusLabel: (raw) => `lbl-${raw}`,
}));
vi.mock('@/components/ui/status-tag', () => ({
  StatusTag: ({ status, label }) => <span data-testid="status-tag">{label || status}</span>,
}));
vi.mock('@/components/ui/tag', () => ({
  Tag: ({ label, variant }) => <span data-testid="tag" data-variant={variant}>{label}</span>,
}));
vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (row, key) => row?.[key + '$_identifier'] ?? row?.[key] ?? '',
}));
vi.mock('@/lib/resolveColumnLabel.js', () => ({
  resolveColumnLabel: (col) => col.label ?? col.key,
}));
vi.mock('@/lib/formatAmount.js', () => ({
  formatAmount: (val, cur) => (val != null ? `${Number(val).toFixed(2)}${cur ? ` ${cur}` : ''}` : ''),
}));
vi.mock('@/lib/applyCalloutUpdates.js', () => ({
  applyCalloutUpdates: (prev, updates) => ({ ...prev, ...updates }),
}));
vi.mock('@/lib/linesColumnWidth.js', () => ({
  columnFlex: () => '1 0 100px',
  columnMinWidthPx: () => 100,
}));
vi.mock('../ProductSearchDrawer.jsx', () => ({ default: () => null }));
vi.mock('../ProductStockSearchDrawer.jsx', () => ({ default: () => null }));
vi.mock('../SelectorInput.jsx', () => ({ SelectorInput: () => <div data-testid="selector-input" /> }));
vi.mock('../InlineSearchCombo.jsx', () => ({
  InlineSearchCombo: ({ field }) => <span data-testid={`inline-combo-${field?.key}`} />,
}));
vi.mock('../RowQuickActions.jsx', () => ({ default: ({ row }) => <span data-testid={`rqa-${row?.id}`} /> }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const mockUseCapabilitiesSafe = vi.fn();
vi.mock('@/hooks/useCapabilitiesSafe.js', () => ({
  useCapabilitiesSafe: () => mockUseCapabilitiesSafe(),
}));

import { DataTable } from '../DataTable.jsx';

const COLUMNS = [
  { key: 'docNo', label: 'Doc No', type: 'string' },
  { key: 'posted', label: 'Posted', type: 'boolean', visibleWhenCapability: 'showAccountingFields' },
];

const DATA = [
  { id: 'r1', docNo: 'INV-001', posted: true },
];

describe('DataTable — visibleWhenCapability column gating', () => {
  it('hides the gated column when the capability map has not loaded (fail closed)', () => {
    mockUseCapabilitiesSafe.mockReturnValue({});
    render(<DataTable columns={COLUMNS} data={DATA} />);
    expect(screen.getByText('Doc No')).toBeInTheDocument();
    expect(screen.queryByText('Posted')).not.toBeInTheDocument();
  });

  it('hides the gated column when the capability resolves false', () => {
    mockUseCapabilitiesSafe.mockReturnValue({ showAccountingFields: false });
    render(<DataTable columns={COLUMNS} data={DATA} />);
    expect(screen.queryByText('Posted')).not.toBeInTheDocument();
  });

  it('shows the gated column when the capability resolves true', () => {
    mockUseCapabilitiesSafe.mockReturnValue({ showAccountingFields: true });
    render(<DataTable columns={COLUMNS} data={DATA} />);
    expect(screen.getByText('Doc No')).toBeInTheDocument();
    expect(screen.getByText('Posted')).toBeInTheDocument();
  });

  it('never gates a column without visibleWhenCapability, regardless of the map', () => {
    mockUseCapabilitiesSafe.mockReturnValue({});
    render(<DataTable columns={[{ key: 'docNo', label: 'Doc No', type: 'string' }]} data={DATA} />);
    expect(screen.getByText('Doc No')).toBeInTheDocument();
  });
});
