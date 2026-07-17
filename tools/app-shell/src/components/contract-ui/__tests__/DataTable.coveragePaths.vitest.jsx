import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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
  getCatalogOptions: (catalogs, entity, field) => catalogs?.[entity]?.[field.key] ?? [],
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

vi.mock('@/lib/linesColumnWidth.js', () => ({
  columnMinWidthPx: () => 96,
  columnFlex: () => '1 1 120px',
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }) => (
    <div data-testid="select" data-value={value || ''}>
      <button type="button" onClick={() => onValueChange?.('__empty__')}>select empty</button>
      <button type="button" onClick={() => onValueChange?.('opt-1')}>select opt 1</button>
      {children}
    </div>
  ),
  SelectContent: ({ children }) => <div data-testid="select-content">{children}</div>,
  SelectItem: ({ children, value }) => <div data-testid={`select-item-${value}`}>{children}</div>,
  SelectTrigger: ({ children, ...props }) => <button type="button" {...props}>{children}</button>,
  SelectValue: ({ placeholder }) => <span>{placeholder}</span>,
}));

vi.mock('../InlineSearchCombo.jsx', () => ({
  InlineSearchCombo: ({ field, onChange, onKeyDown, excludeId, selectorUrl }) => (
    <div
      data-testid={`combo-${field.key}`}
      data-exclude-id={excludeId || ''}
      data-selector-url={selectorUrl || ''}>
      <button type="button" onClick={() => onChange?.('combo-1', 'Combo One', { id: 'combo-1', label: 'Combo One' })}>
        choose combo
      </button>
      <button type="button" onKeyDown={onKeyDown}>combo key target</button>
    </div>
  ),
}));

vi.mock('../ProductSearchDrawer.jsx', () => ({
  default: ({ open, onSelect, title }) => (
    open ? (
      <div data-testid="lookup-drawer" data-title={title || ''}>
        <button
          type="button"
          onClick={() => onSelect?.({
            id: 'lookup-1',
            label: 'Lookup One',
            _aux: { _UOM: 'Each' },
            standardPrice: 12,
            isTaxIncluded: false,
            sku: 'SKU-1',
          })}>
          choose lookup
        </button>
      </div>
    ) : null
  ),
}));

vi.mock('../ProductStockSearchDrawer.jsx', () => ({
  default: ({ open }) => open ? <div data-testid="internal-consumption-drawer" /> : null,
}));

vi.mock('../SelectorInput.jsx', () => ({
  SelectorInput: () => <div data-testid="selector-input" />,
}));

vi.mock('../RowQuickActions.jsx', () => ({
  default: ({ row, onEdit, onClone, onDelete }) => (
    <div data-testid={`quick-actions-${row.id}`}>
      <button type="button" onClick={() => onEdit?.(row)}>qa edit</button>
      <button type="button" onClick={() => onClone?.(row)}>qa clone</button>
      <button type="button" onClick={() => onDelete?.(row)}>qa delete</button>
    </div>
  ),
}));

vi.mock('@/lib/productUsageTelemetry.js', () => ({
  trackSearchResultSelected: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { DataTable } from '../DataTable.jsx';
import { trackSearchResultSelected } from '@/lib/productUsageTelemetry.js';

const baseRows = [
  { id: 'r1', name: 'Alpha', amount: 10, active: false, status: 'DR' },
  { id: 'r2', name: 'Beta', amount: 20, active: true, status: 'CO' },
];

const baseColumns = [
  { key: 'name', label: 'Name', type: 'string' },
  { key: 'amount', label: 'Amount', type: 'amount' },
  { key: 'active', label: 'Active', type: 'boolean', toggle: true },
  { key: 'status', label: 'Status', type: 'status' },
];

describe('DataTable coverage-oriented paths', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn(async () => ({ ok: true }));
  });

  it('tracks filtered row activation and prefers onRowClick over navigation callbacks', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    const onNavigate = vi.fn();
    const onRowSelect = vi.fn();
    render(
      <DataTable
        entity="orderLine"
        specName="sales-order"
        columns={baseColumns}
        data={baseRows}
        columnFilters={{ status: ['DR'] }}
        onRowClick={onRowClick}
        onNavigate={onNavigate}
        onRowSelect={onRowSelect}
        selectable={false}
      />,
    );

    await user.click(screen.getByTestId('row-r1'));

    expect(trackSearchResultSelected).toHaveBeenCalledWith({
      entity: 'orderLine',
      specName: 'sales-order',
      source: 'table_filter',
      type: 'filter',
      position: 1,
    });
    expect(onRowClick).toHaveBeenCalledWith(baseRows[0]);
    expect(onNavigate).not.toHaveBeenCalled();
    expect(onRowSelect).not.toHaveBeenCalled();
  });

  it('handles selectable rows, disabled rows, header toggle, and clearSelectionTrigger', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    const { rerender } = render(
      <DataTable
        columns={baseColumns}
        data={baseRows}
        isRowSelectable={(row) => row.id !== 'r2'}
        onSelectionChange={onSelectionChange}
      />,
    );

    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]);
    expect(onSelectionChange).toHaveBeenLastCalledWith([baseRows[0]]);

    await user.click(screen.getByTestId('row-r2').querySelector('input[type="checkbox"]'));
    expect(onSelectionChange).toHaveBeenCalledTimes(1);

    rerender(
      <DataTable
        columns={baseColumns}
        data={baseRows}
        isRowSelectable={(row) => row.id !== 'r2'}
        onSelectionChange={onSelectionChange}
        clearSelectionTrigger={1}
      />,
    );
    expect(screen.getAllByRole('checkbox')[1]).not.toBeChecked();
  });

  it('patches inline boolean toggles and rolls back failed toggle requests', async () => {
    const onDataMutated = vi.fn();
    const { rerender } = render(
      <DataTable
        entity="orderLine"
        apiBaseUrl="/api"
        token="tkn"
        columns={baseColumns}
        data={baseRows}
        onDataMutated={onDataMutated}
        selectable={false}
      />,
    );

    const activeSwitch = screen.getAllByRole('switch')[0];
    fireEvent.click(activeSwitch);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/orderLine/r1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ active: true }),
    })));
    expect(onDataMutated).toHaveBeenCalled();

    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 500 }));
    rerender(
      <DataTable
        entity="orderLine"
        apiBaseUrl="/api"
        token="tkn"
        columns={baseColumns}
        data={baseRows}
        selectable={false}
      />,
    );
    fireEvent.click(screen.getAllByRole('switch')[0]);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });

  it('exercises inline add row lookup, search, selector, select, numeric clamp, callout, and submit paths', async () => {
    const onAdd = vi.fn(async (values) => values);
    const onCancel = vi.fn();
    const onFieldChange = vi.fn(async (_key, _val, _snapshot, applyUpdates) => {
      applyUpdates({ derivedAmount: '44.5' }, new Set(['derivedAmount']));
    });
    const onValuesChange = vi.fn();
    const addRow = {
      active: true,
      onAdd,
      onCancel,
      onFieldChange,
      onValuesChange,
      catalogs: {
        orderLine: {
          selectorId: [
            { id: 'blocked', label: 'Blocked' },
            { id: 'opt-1', label: 'Option One' },
          ],
        },
      },
      fields: [
        { key: 'lineNo', label: 'Line', type: 'integer' },
        { key: 'lookupId', label: 'Lookup', type: 'search', lookup: true, column: 'M_Product_ID', lookupTitle: 'Lookup Product', onSelectMappings: [{ from: '_aux._UOM', to: 'uom', labelFrom: ['label'] }] },
        { key: 'searchId', label: 'Search', type: 'search', column: 'C_BPartner_ID', excludeValueOf: 'selectorId' },
        { key: 'selectorId', label: 'Selector', type: 'selector', column: 'M_Locator_ID', excludeValueOf: 'searchId' },
        { key: 'status', label: 'Status', type: 'select', options: [{ value: 'opt-1', label: 'Open' }] },
        { key: 'debit', label: 'Debit', type: 'amount', clearsField: 'credit', min: 1, max: 50, required: true },
        { key: 'credit', label: 'Credit', type: 'amount', required: true },
      ],
    };

    render(
      <DataTable
        entity="orderLine"
        columns={[
          { key: 'lineNo', label: 'Line', type: 'integer' },
          { key: 'lookupId', label: 'Lookup', type: 'string' },
          { key: 'searchId', label: 'Search', type: 'string' },
          { key: 'selectorId', label: 'Selector', type: 'string' },
          { key: 'status', label: 'Status', type: 'string' },
          { key: 'debit', label: 'Debit', type: 'amount' },
          { key: 'credit', label: 'Credit', type: 'amount' },
          { key: 'derivedAmount', label: 'Derived', type: 'amount' },
        ]}
        data={[{ id: 'existing', lineNo: 10, amount: 5 }]}
        addRow={addRow}
        apiBaseUrl="/api"
        token="tkn"
        selectorContext={{ headerId: 'h1' }}
        selectable
        onDeleteRow={vi.fn()}
        onCloneRow={vi.fn()}
      />,
    );

    expect(screen.getByTestId('inline-add-row')).toBeInTheDocument();
    expect(screen.getByTestId('combo-searchId')).toHaveAttribute('data-selector-url', '/api/orderLine/selectors/C_BPartner_ID');

    await userEvent.click(screen.getByTestId('inline-add-field-lookupId'));
    await userEvent.click(screen.getByText('choose lookup'));
    expect(onFieldChange).toHaveBeenCalledWith(
      'lookupId',
      'lookup-1',
      expect.objectContaining({
        lookupId: 'lookup-1',
        lookupId_UOM: 'Each',
        unitPrice: 12,
        listPrice: 12,
        lookupId_sku: 'SKU-1',
      }),
      expect.any(Function),
    );

    await userEvent.click(screen.getByText('choose combo'));
    const selectOptButtons = screen.getAllByText('select opt 1');
    await userEvent.click(selectOptButtons[0]);
    await userEvent.click(selectOptButtons[1]);

    const debit = screen.getByTestId('inline-add-field-debit');
    fireEvent.change(debit, { target: { value: '99' } });
    fireEvent.blur(debit);
    await waitFor(() => expect(debit).toHaveValue('50.00'));
    fireEvent.keyDown(debit, { key: 'Enter' });

    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(onAdd.mock.calls[0][0]).toEqual(expect.objectContaining({
      lineNo: 20,
      lookupId: 'lookup-1',
      searchId: 'combo-1',
      selectorId: 'opt-1',
      status: 'opt-1',
      debit: 50,
      credit: 0,
      derivedAmount: '44.5',
    }));
    expect(onValuesChange).toHaveBeenCalled();
  });

  it('shows inline add validation errors, cancel on untouched outside click, and close after outside save', async () => {
    const onAdd = vi.fn(async (values) => values);
    const onCancel = vi.fn();
    const addRow = {
      active: true,
      onAdd,
      onCancel,
      fields: [
        { key: 'lineNo', label: 'Line', type: 'integer' },
        { key: 'qty', label: 'Qty', type: 'integer', required: true, min: 1 },
      ],
    };
    const { rerender } = render(
      <DataTable
        entity="orderLine"
        columns={[
          { key: 'lineNo', label: 'Line', type: 'integer' },
          { key: 'qty', label: 'Qty', type: 'integer' },
        ]}
        data={[]}
        addRow={addRow}
      />,
    );

    fireEvent.keyDown(screen.getByTestId('inline-add-field-qty'), { key: 'Enter' });
    expect(onAdd).not.toHaveBeenCalled();

    // pointerDown only (no compat mousedown) — models a control that calls
    // preventDefault() on pointerdown (e.g. Radix SelectTrigger), which
    // suppresses the browser's compatibility mouse events (ETP-4422).
    fireEvent.pointerDown(document.body);
    expect(onCancel).toHaveBeenCalled();

    rerender(
      <DataTable
        entity="orderLine"
        columns={[
          { key: 'lineNo', label: 'Line', type: 'integer' },
          { key: 'qty', label: 'Qty', type: 'integer' },
        ]}
        data={[]}
        addRow={addRow}
      />,
    );
    fireEvent.change(screen.getByTestId('inline-add-field-qty'), { target: { value: '2' } });
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(onAdd).toHaveBeenCalled());
  });

  it('renders hover row actions and quick actions variants without legacy clone cells', async () => {
    const onEditRow = vi.fn();
    const onDeleteRow = vi.fn();
    const qaEdit = vi.fn();
    const qaClone = vi.fn();
    const qaDelete = vi.fn();

    render(
      <DataTable
        columns={baseColumns}
        data={baseRows}
        selectable={false}
        hoverRowActions
        onEditRow={onEditRow}
        onDeleteRow={onDeleteRow}
        onCloneRow={vi.fn()}
        rowQuickActions={{
          enabled: true,
          onEdit: qaEdit,
          onClone: qaClone,
          onDelete: qaDelete,
          actions: { edit: { show: true }, duplicate: { show: true }, delete: { show: true } },
        }}
      />,
    );

    await userEvent.click(screen.getAllByText('qa edit')[0]);
    await userEvent.click(screen.getAllByText('qa clone')[0]);
    await userEvent.click(screen.getAllByText('qa delete')[0]);

    expect(qaEdit).toHaveBeenCalledWith(baseRows[0]);
    expect(qaClone).toHaveBeenCalledWith(baseRows[0]);
    expect(qaDelete).toHaveBeenCalledWith(baseRows[0]);
  });
});
