const toastWarning = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    warning: (...args) => toastWarning(...args),
  },
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/components/ui/custom-icons', () => ({
  SortIcon: (props) => <span data-testid="sort-icon" {...props} />,
  RefreshIcon: (props) => <span data-testid="refresh-icon" {...props} />,
}));

vi.mock('../WarehouseSummary', () => ({
  default: ({ data, token, apiBaseUrl }) => (
    <div data-testid="warehouse-summary" data-id={data.id} data-token={token} data-api-base-url={apiBaseUrl} />
  ),
}));

vi.mock('../WarehouseProductsTab', () => ({
  default: () => <div data-testid="warehouse-products-tab" />,
}));

vi.mock('../WarehouseTransactionsTable', () => ({
  default: () => <div data-testid="warehouse-transactions-tab" />,
}));

vi.mock('../WarehouseCustomTable', () => ({
  default: () => <div data-testid="warehouse-custom-table" />,
}));

vi.mock('@generated/warehouse/generated/web/warehouse/AccountingTable', () => ({
  default: () => <div data-testid="accounting-table" />,
}));

vi.mock('@generated/warehouse/generated/web/warehouse/AccountingForm', () => ({
  default: () => <div data-testid="accounting-form" />,
}));

let lastWarehousePageProps;
vi.mock('@generated/warehouse/generated/web/warehouse/WarehousePage', () => ({
  default: (props) => {
    lastWarehousePageProps = props;
    return (
      <div data-testid="warehouse-page">
        {props.sidebarContent?.({ id: 'wh-1' })}
        {props.Table ? <props.Table /> : null}
        {props.SortIconComponent ? <props.SortIconComponent /> : null}
        {props.RefreshIconComponent ? <props.RefreshIconComponent /> : null}
      </div>
    );
  },
}));

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WarehouseWindow from '../index.jsx';

describe('WarehouseWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastWarehousePageProps = null;
    globalThis.fetch = vi.fn(async () => ({ ok: true }));
  });

  it('passes custom table, sidebar, icon, and tab wiring into WarehousePage', () => {
    render(<WarehouseWindow token="tkn" apiBaseUrl="/api" extraProp="kept" />);

    expect(screen.getByTestId('warehouse-page')).toBeInTheDocument();
    expect(screen.getByTestId('warehouse-summary')).toHaveAttribute('data-token', 'tkn');
    expect(screen.getByTestId('warehouse-custom-table')).toBeInTheDocument();
    expect(screen.getByTestId('sort-icon')).toBeInTheDocument();
    expect(screen.getByTestId('refresh-icon')).toBeInTheDocument();
    expect(lastWarehousePageProps.extraProp).toBe('kept');
    expect(lastWarehousePageProps.secondaryTabs.map((tab) => tab.key)).toEqual([
      'products',
      'productTransactions',
      'accounting',
    ]);
    expect(lastWarehousePageProps.secondaryTabs.map((tab) => tab.label)).toEqual([
      'warehouseProductsTab',
      'warehouseTransactionsTab',
      'warehouseAccountingTab',
    ]);
    expect(lastWarehousePageProps.secondaryTabs[2]).toMatchObject({
      key: 'accounting',
      Table: expect.any(Function),
      Form: expect.any(Function),
    });
    expect(lastWarehousePageProps.secondaryTabs[2].Panel).toBeUndefined();
    expect(lastWarehousePageProps).toMatchObject({
      sidebarAboveTabsOnly: true,
      hidePrint: true,
      hideLink: true,
      toolbarBorderBottom: true,
      tabsSeparator: true,
      compactSidebarPadding: true,
      noHeaderBorder: true,
    });
  });

  it('creates a default storage bin after creating a warehouse', async () => {
    render(<WarehouseWindow token="tkn" apiBaseUrl="/api" />);

    await lastWarehousePageProps.onAfterCreate(
      { id: 'wh-1', organization: 'org-1', searchKey: 'MAIN' },
      { token: 'ctx-token', apiBaseUrl: '/ctx-api' },
    );

    expect(fetch).toHaveBeenCalledWith('/ctx-api/storageBin', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ctx-token', 'Accept-Language': 'es_ES',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        warehouse: 'wh-1',
        organization: 'org-1',
        searchKey: 'MAIN-0-0-0',
        rowX: '0',
        stackY: '0',
        levelZ: '0',
        relativePriority: 50,
        default: true,
        inventoryStatus: '2',
      }),
    });
    expect(toastWarning).not.toHaveBeenCalled();
  });

  it('sets inventoryStatus to "2" (Available) on the default storage bin', async () => {
    render(<WarehouseWindow token="tkn" apiBaseUrl="/api" />);

    await lastWarehousePageProps.onAfterCreate(
      { id: 'wh-1', organization: 'org-1', searchKey: 'MAIN' },
      { token: 'ctx-token', apiBaseUrl: '/ctx-api' },
    );

    const [, requestInit] = fetch.mock.calls[0];
    const body = JSON.parse(requestInit.body);
    expect(body.inventoryStatus).toBe('2');
  });

  it('shows a warning when default storage bin creation fails', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      text: async () => 'backend rejected storage bin',
      statusText: 'Bad Request',
    }));
    render(<WarehouseWindow token="tkn" apiBaseUrl="/api" />);

    await lastWarehousePageProps.onAfterCreate(
      { id: 'wh-1', organization: 'org-1', searchKey: 'MAIN' },
      { token: 'ctx-token', apiBaseUrl: '/ctx-api' },
    );

    expect(toastWarning).toHaveBeenCalledWith(
      'Warehouse created, but default storage bin could not be created automatically.',
      {
        description: 'backend rejected storage bin',
        duration: 6000,
      },
    );
  });
});
