import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const telemetryMocks = vi.hoisted(() => ({
  trackSearchResultSelected: vi.fn(),
}));

vi.mock('@/lib/productUsageTelemetry.js', () => ({
  trackSearchResultSelected: telemetryMocks.trackSearchResultSelected,
}));

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
  resolveIdentifier: (row, key) => row?.[`${key}$_identifier`] ?? row?.[key] ?? '',
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

describe('DataTable product usage telemetry', () => {
  beforeEach(() => {
    telemetryMocks.trackSearchResultSelected.mockReset();
  });

  it('tracks row activation when a column filter is active', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    render(
      <DataTable
        entity="salesOrder"
        specName="sales-order"
        columns={[{ key: 'name', label: 'Name', type: 'string' }]}
        data={[
          { id: 'a', name: 'Order A' },
          { id: 'b', name: 'Order B' },
        ]}
        columnFilters={{ documentStatus: { value: ['DR'] } }}
        onNavigate={onNavigate}
      />,
    );

    await user.click(screen.getByTestId('row-b'));

    expect(telemetryMocks.trackSearchResultSelected).toHaveBeenCalledWith({
      entity: 'salesOrder',
      specName: 'sales-order',
      source: 'table_filter',
      type: 'filter',
      position: 2,
    });
    expect(onNavigate).toHaveBeenCalledWith({ id: 'b', name: 'Order B' });
  });

  it('does not track ordinary row activation without active filters', async () => {
    const user = userEvent.setup();

    render(
      <DataTable
        entity="salesOrder"
        specName="sales-order"
        columns={[{ key: 'name', label: 'Name', type: 'string' }]}
        data={[{ id: 'a', name: 'Order A' }]}
        onNavigate={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('row-a'));

    expect(telemetryMocks.trackSearchResultSelected).not.toHaveBeenCalled();
  });
});
