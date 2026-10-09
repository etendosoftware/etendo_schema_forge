// @covers tools/app-shell/src/windows/custom/warehouse/index.jsx
const toastWarning = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    warning: (...args) => toastWarning(...args),
  },
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
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

  it('passes custom table, sidebar, and tab wiring (no custom icons) into WarehousePage', () => {
    render(<WarehouseWindow token="tkn" apiBaseUrl="/api" extraProp="kept" />);

    expect(screen.getByTestId('warehouse-page')).toBeInTheDocument();
    expect(screen.getByTestId('warehouse-summary')).toHaveAttribute('data-token', 'tkn');
    expect(screen.getByTestId('warehouse-custom-table')).toBeInTheDocument();
    // Default list icons are used: the wrapper no longer injects custom ones.
    expect(lastWarehousePageProps.SortIconComponent).toBeUndefined();
    expect(lastWarehousePageProps.RefreshIconComponent).toBeUndefined();
    expect(screen.queryByTestId('sort-icon')).not.toBeInTheDocument();
    expect(screen.queryByTestId('refresh-icon')).not.toBeInTheDocument();
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

  // ETP-5513 — the sidebar is a fixed 320 px column, not a share of the viewport
  // (w-[30%]), so the form keeps its width at 1280x720.
  it('renders the sidebar as a fixed 320 px, non-shrinking column', () => {
    render(<WarehouseWindow token="tkn" apiBaseUrl="/api" />);

    const classes = lastWarehousePageProps.sidebarClassName.split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(['w-[320px]', 'shrink-0']));
    expect(classes.some((c) => /^w-\[\d+%\]$/.test(c))).toBe(false);
  });

  it('creates a default storage bin after creating a warehouse', async () => {
    render(<WarehouseWindow token="tkn" apiBaseUrl="/api" />);

    await lastWarehousePageProps.onAfterCreate(
      { id: 'wh-1', organization: 'org-1', searchKey: 'MAIN' },
      { token: 'ctx-token', apiBaseUrl: '/ctx-api' },
    );

    expect(fetch).toHaveBeenCalledWith('/ctx-api/storageBin', {
      method: 'POST',
      credentials: 'include',
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
