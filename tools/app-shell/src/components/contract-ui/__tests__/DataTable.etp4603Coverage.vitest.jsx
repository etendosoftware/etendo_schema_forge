/**
 * ETP-4603 coverage top-up for DataTable.jsx.
 *
 * Targets branches the existing DataTable.coveragePaths.vitest.jsx suite doesn't
 * reach: flexSpec/growColumnWidth + the hideHeader colgroup, displayIf-hidden
 * add-row cells, the static-select Escape keydown, the checkbox/boolean
 * PillToggle add-row control, the InlineAddRow imperative handle (flush /
 * setFieldValues), the outside-click submit-rejection console.error branch,
 * the gross-price mapping branch of updateSnapshotWithSelectedItem, an empty
 * optional numeric field left untouched at submit (resolveNumericFieldValue),
 * LookupField's keyboard handling, selectedRowId row highlighting, the real
 * (non-mocked) hover-action edit/save/cancel/delete buttons, the legacy
 * delete + clone buttons, toggleAll's deselect-all branch, the
 * handleInlineToggle missing-context guard, resolveCellDisplay's
 * displayCatalogMaps mapped-value branch, and the onColumnsReady effect.
 *
 * Reuses the exact mocking scaffold from DataTable.coveragePaths.vitest.jsx —
 * only the ProductSearchDrawer mock is extended (accepts an `isTaxIncluded`
 * override) to reach the gross-price branch that fixed drawer never triggers.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

// Deliberately NOT mocked here: flexSpec()/growColumnWidth() (native to
// DataTable.jsx) parse this shorthand string to drive the hideHeader colgroup
// under test below — matches the coveragePaths.vitest.jsx convention.
vi.mock('@/lib/linesColumnWidth.js', () => ({
  columnMinWidthPx: () => 96,
  columnFlex: (col) => (col?.flexGrow === 0 ? '0 0 80px' : '1 1 120px'),
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

// Extends the coveragePaths fixture with a configurable `isTaxIncluded` so
// this file can exercise BOTH price-mapping branches of
// updateSnapshotWithSelectedItem (net vs gross), not just the fixed net one.
let lookupIsTaxIncluded = false;
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
            isTaxIncluded: lookupIsTaxIncluded,
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
import { toast } from 'sonner';

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

describe('DataTable — ETP-4603 coverage top-up', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lookupIsTaxIncluded = false;
    globalThis.fetch = vi.fn(async () => ({ ok: true }));
  });

  // ── flexSpec / growColumnWidth / renderLinesColgroup (hideHeader mode) ──
  it('renders a fixed-layout colgroup with calc()-based widths for grow columns when hideHeader is set', () => {
    render(
      <DataTable
        columns={[
          { key: 'name', label: 'Name', type: 'string' },
          { key: 'fixed', label: 'Fixed', type: 'string', flexGrow: 0 },
        ]}
        data={baseRows}
        hideHeader
        linesLayout="inlineEditable"
        selectable={false}
      />,
    );

    const table = screen.getByTestId('Table__eb5261');
    const cols = table.querySelectorAll('colgroup col');
    expect(cols.length).toBeGreaterThan(0);
    // The fixed-basis column keeps its literal 80px width...
    expect(cols[1].style.width).toBe('80px');
    // ...while the grow column gets a calc() expression restoring its own basis.
    expect(cols[0].style.width).toMatch(/^calc\(/);
    // Header row is hidden entirely in this mode.
    expect(screen.getByTestId('TableHeader__eb5261')).toHaveAttribute('aria-hidden', 'true');
  });

  // ── visibleColumns auto-hide/reveal for a displayIf-controlled column ───
  // Note: the entire COLUMN (header + every cell, including the add-row cell)
  // is dropped from `visibleColumns` while its controller is falsy in both
  // existing data rows and the current add-row values — this is the real,
  // reachable displayIf gate. `isColumnHidden`'s own aria-hidden placeholder
  // branch inside renderInlineAddCell can only run once the column is already
  // visible (i.e. the controller is already truthy), making that branch
  // unreachable in practice — it is intentionally not targeted here.
  it('auto-hides a displayIf-controlled column until its controller field goes truthy, then reveals it', async () => {
    const addRow = {
      active: true,
      onAdd: vi.fn(async (v) => v),
      onCancel: vi.fn(),
      fields: [
        { key: 'flag', label: 'Flag', type: 'checkbox' },
        { key: 'conditional', label: 'Conditional', type: 'string', displayIf: 'flag' },
      ],
    };
    render(
      <DataTable
        entity="orderLine"
        columns={[
          { key: 'flag', label: 'Flag', type: 'boolean' },
          { key: 'conditional', label: 'Conditional', type: 'string' },
        ]}
        data={[]}
        addRow={addRow}
      />,
    );

    expect(screen.queryByTestId('column-header-conditional')).not.toBeInTheDocument();
    expect(screen.queryByTestId('inline-add-cell-conditional')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('inline-add-field-flag'));

    expect(screen.getByTestId('column-header-conditional')).toBeInTheDocument();
    expect(screen.getByTestId('inline-add-field-conditional')).toBeInTheDocument();
  });

  // ── static-select Escape keydown ─────────────────────────────────────────
  it('forwards Escape from the static-select trigger to the shared row keydown handler (cancels the row)', () => {
    const onCancel = vi.fn();
    const addRow = {
      active: true,
      onAdd: vi.fn(async (v) => v),
      onCancel,
      fields: [
        { key: 'status', label: 'Status', type: 'select', options: [{ value: 'opt-1', label: 'Open' }] },
      ],
    };
    render(
      <DataTable
        entity="orderLine"
        columns={[{ key: 'status', label: 'Status', type: 'string' }]}
        data={[]}
        addRow={addRow}
      />,
    );

    fireEvent.keyDown(screen.getByTestId('inline-add-field-status'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });

  // ETP-4685 — the generator emits a `labels` object per option (locale -> translated
  // text) alongside the raw AD `label`, same shape the form view already resolves
  // correctly. The add-row static-select never read it, always showing the raw
  // English `label` regardless of locale.
  it('resolves static-select option text through opt.labels[locale], not the raw AD label', async () => {
    const addRow = {
      active: true,
      onAdd: vi.fn(async (v) => v),
      onCancel: vi.fn(),
      fields: [
        {
          key: 'status',
          label: 'Status',
          type: 'select',
          options: [
            { value: 'opt-1', label: 'Open (raw)', labels: { en_US: 'Open (translated)' } },
          ],
        },
      ],
    };
    render(
      <DataTable
        entity="orderLine"
        columns={[{ key: 'status', label: 'Status', type: 'string' }]}
        data={[]}
        addRow={addRow}
      />,
    );

    await userEvent.click(screen.getByTestId('inline-add-field-status'));
    expect(screen.getByText('Open (translated)')).toBeInTheDocument();
    expect(screen.queryByText('Open (raw)')).not.toBeInTheDocument();
  });

  // ── checkbox/boolean PillToggle add-row control ─────────────────────────
  it('toggles a checkbox add-row field via the PillToggle control and reports it through onFieldChange', async () => {
    const onFieldChange = vi.fn();
    const addRow = {
      active: true,
      onAdd: vi.fn(async (v) => v),
      onCancel: vi.fn(),
      onFieldChange,
      fields: [{ key: 'flag', label: 'Flag', type: 'checkbox' }],
    };
    render(
      <DataTable
        entity="orderLine"
        columns={[{ key: 'flag', label: 'Flag', type: 'boolean' }]}
        data={[]}
        addRow={addRow}
      />,
    );

    const toggle = screen.getByTestId('inline-add-field-flag');
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(onFieldChange).toHaveBeenCalledWith('flag', true, expect.objectContaining({ flag: true }), expect.any(Function));
  });

  // ── InlineAddRow imperative handle: flush() + setFieldValues() ──────────
  it('exposes flush() to silently cancel an untouched row and confirm a touched one, plus setFieldValues()', async () => {
    const onAdd = vi.fn(async (v) => v);
    const onCancel = vi.fn();
    const ref = { current: null };
    const addRow = {
      active: true,
      ref,
      onAdd,
      onCancel,
      fields: [{ key: 'qty', label: 'Qty', type: 'integer' }],
    };
    render(
      <DataTable
        entity="orderLine"
        columns={[{ key: 'qty', label: 'Qty', type: 'integer' }]}
        data={[]}
        addRow={addRow}
      />,
    );

    // Untouched row: flush() cancels silently without calling onAdd.
    await waitFor(() => expect(ref.current).toBeTruthy());
    await ref.current.flush();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onAdd).not.toHaveBeenCalled();

    // setFieldValues() writes directly into row state without an onChange event.
    ref.current.setFieldValues({ qty: '7' });
    await waitFor(() => expect(screen.getByTestId('inline-add-field-qty')).toHaveValue('7'));

    // Now the row is touched (via setFieldValues path is not marked touched, but a
    // real user edit is) — simulate a real edit so flush() takes the confirm path.
    fireEvent.change(screen.getByTestId('inline-add-field-qty'), { target: { value: '9' } });
    const ok = await ref.current.flush();
    expect(ok).toBe(true);
    await waitFor(() => expect(onAdd).toHaveBeenCalled());
  });

  // ── outside-click auto-commit rejection → console.error branch ──────────
  it('logs to console.error when an outside-click auto-commit submit rejects', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onAdd = vi.fn(() => Promise.reject(new Error('save failed')));
    const addRow = {
      active: true,
      onAdd,
      onCancel: vi.fn(),
      fields: [{ key: 'qty', label: 'Qty', type: 'integer' }],
    };
    render(
      <DataTable
        entity="orderLine"
        columns={[{ key: 'qty', label: 'Qty', type: 'integer' }]}
        data={[]}
        addRow={addRow}
      />,
    );

    fireEvent.change(screen.getByTestId('inline-add-field-qty'), { target: { value: '3' } });
    fireEvent.pointerDown(document.body);

    await waitFor(() => expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to submit inline line on outside click:',
      expect.any(Error),
    ));
    consoleSpy.mockRestore();
  });

  // ── gross-price branch of updateSnapshotWithSelectedItem ────────────────
  it('maps a gross price list selection to grossUnitPrice/grossListPrice (isTaxIncluded !== false)', async () => {
    lookupIsTaxIncluded = true;
    const onFieldChange = vi.fn();
    const addRow = {
      active: true,
      onAdd: vi.fn(async (v) => v),
      onCancel: vi.fn(),
      onFieldChange,
      fields: [
        { key: 'lookupId', label: 'Lookup', type: 'search', lookup: true, column: 'M_Product_ID' },
      ],
    };
    render(
      <DataTable
        entity="orderLine"
        columns={[{ key: 'lookupId', label: 'Lookup', type: 'string' }]}
        data={[]}
        addRow={addRow}
      />,
    );

    await userEvent.click(screen.getByTestId('inline-add-field-lookupId'));
    await userEvent.click(screen.getByText('choose lookup'));

    expect(onFieldChange).toHaveBeenCalledWith(
      'lookupId',
      'lookup-1',
      expect.objectContaining({ grossUnitPrice: 12, grossListPrice: 12 }),
      expect.any(Function),
    );
  });

  // ── empty optional numeric field left untouched at submit ──────────────
  it('leaves an empty, non-required numeric field as-is through resolveNumericFieldValue (no defaultValue/min to fall back to)', async () => {
    const onAdd = vi.fn(async (v) => v);
    const addRow = {
      active: true,
      onAdd,
      onCancel: vi.fn(),
      fields: [
        { key: 'qty', label: 'Qty', type: 'integer', required: true },
        { key: 'note', label: 'Note', type: 'amount' },
      ],
    };
    render(
      <DataTable
        entity="orderLine"
        columns={[
          { key: 'qty', label: 'Qty', type: 'integer' },
          { key: 'note', label: 'Note', type: 'amount' },
        ]}
        data={[]}
        addRow={addRow}
      />,
    );

    fireEvent.change(screen.getByTestId('inline-add-field-qty'), { target: { value: '5' } });
    fireEvent.keyDown(screen.getByTestId('inline-add-field-qty'), { key: 'Enter' });

    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(onAdd.mock.calls[0][0].note).toBe('');
  });

  // ── LookupField keyboard handling: Space re-opens, Enter-with-value bubbles ─
  it('opens the lookup drawer via Space, and lets Enter bubble to save once a value is selected', async () => {
    const onAdd = vi.fn(async (v) => v);
    const addRow = {
      active: true,
      onAdd,
      onCancel: vi.fn(),
      fields: [{ key: 'lookupId', label: 'Lookup', type: 'search', lookup: true, column: 'M_Product_ID' }],
    };
    render(
      <DataTable
        entity="orderLine"
        columns={[{ key: 'lookupId', label: 'Lookup', type: 'string' }]}
        data={[]}
        addRow={addRow}
      />,
    );

    const lookupBtn = screen.getByTestId('inline-add-field-lookupId');
    fireEvent.keyDown(lookupBtn, { key: ' ' });
    expect(screen.getByTestId('lookup-drawer')).toBeInTheDocument();

    await userEvent.click(screen.getByText('choose lookup'));
    // A value is now selected — Enter should bubble up to the row's own
    // handleKeyDown (confirm) instead of re-opening the picker.
    fireEvent.keyDown(lookupBtn, { key: 'Enter' });
    await waitFor(() => expect(onAdd).toHaveBeenCalled());
  });

  // ── selectedRowId row highlighting ───────────────────────────────────────
  it('applies the selected-line highlight class to the row matching selectedRowId', () => {
    render(<DataTable columns={baseColumns} data={baseRows} selectedRowId="r2" selectable={false} />);
    expect(screen.getByTestId('row-r2').className).toContain('bg-muted');
    expect(screen.getByTestId('row-r1').className).not.toContain('ring-focus-ring');
  });

  // ── real hover-action buttons: edit / save / cancel / delete (with spinner) ─
  it('drives the real (non-mocked) hover edit/save/cancel buttons through onEditRow/onSaveRow/onCancelEdit', async () => {
    const onEditRow = vi.fn();
    const onSaveRow = vi.fn();
    const onCancelEdit = vi.fn();
    const onDeleteRow = vi.fn(async () => {});
    const { rerender } = render(
      <DataTable
        columns={baseColumns}
        data={baseRows}
        selectable={false}
        hoverRowActions
        onEditRow={onEditRow}
        onSaveRow={onSaveRow}
        onCancelEdit={onCancelEdit}
        onDeleteRow={onDeleteRow}
      />,
    );

    await userEvent.click(within(screen.getByTestId('row-r1')).getByLabelText('edit'));
    expect(onEditRow).toHaveBeenCalledWith(baseRows[0]);

    rerender(
      <DataTable
        columns={baseColumns}
        data={baseRows}
        selectable={false}
        hoverRowActions
        onEditRow={onEditRow}
        onSaveRow={onSaveRow}
        onCancelEdit={onCancelEdit}
        onDeleteRow={onDeleteRow}
        editingRowId="r1"
      />,
    );
    await userEvent.click(within(screen.getByTestId('row-r1')).getByLabelText('save'));
    expect(onSaveRow).toHaveBeenCalled();

    await userEvent.click(within(screen.getByTestId('row-r1')).getByLabelText('cancel'));
    expect(onCancelEdit).toHaveBeenCalled();
  });

  it('shows the spinner and disables the button while a hover-actions delete is in flight', async () => {
    let resolveDelete;
    const onDeleteRow = vi.fn(() => new Promise((resolve) => { resolveDelete = resolve; }));
    render(
      <DataTable
        columns={baseColumns}
        data={baseRows}
        selectable={false}
        hoverRowActions
        onDeleteRow={onDeleteRow}
      />,
    );

    const deleteBtn = screen.getByTestId('row-delete-r1');
    fireEvent.click(deleteBtn);
    expect(deleteBtn).toBeDisabled();
    await waitFor(() => expect(deleteBtn.querySelector('svg')).toBeInTheDocument());

    resolveDelete();
    await waitFor(() => expect(deleteBtn).not.toBeDisabled());
  });

  // ── legacy (non-hover) delete + clone buttons ────────────────────────────
  it('drives the legacy (non-hover) delete and clone buttons', async () => {
    const onDeleteRow = vi.fn(async () => {});
    const onCloneRow = vi.fn();
    render(
      <DataTable
        columns={baseColumns}
        data={baseRows}
        selectable={false}
        onDeleteRow={onDeleteRow}
        onCloneRow={onCloneRow}
      />,
    );

    await userEvent.click(screen.getByTestId('row-delete-r1'));
    expect(onDeleteRow).toHaveBeenCalledWith(baseRows[0]);

    const cloneBtns = screen.getAllByLabelText('cloneOrderBtn');
    await userEvent.click(cloneBtns[0]);
    expect(onCloneRow).toHaveBeenCalledWith(baseRows[0]);
  });

  // ── toggleAll: select-all then deselect-all branch ──────────────────────
  it('toggles all rows on, then off again, notifying onSelectionChange both times', async () => {
    const onSelectionChange = vi.fn();
    render(<DataTable columns={baseColumns} data={baseRows} onSelectionChange={onSelectionChange} />);

    const headerCheckbox = screen.getAllByRole('checkbox')[0];
    await userEvent.click(headerCheckbox);
    expect(onSelectionChange).toHaveBeenLastCalledWith(baseRows);

    await userEvent.click(headerCheckbox);
    expect(onSelectionChange).toHaveBeenLastCalledWith([]);
  });

  // ── handleInlineToggle missing-context guard ─────────────────────────────
  it('toasts an error instead of PATCHing when the inline-toggle context (apiBaseUrl/entity/token) is incomplete', () => {
    render(<DataTable columns={baseColumns} data={baseRows} selectable={false} />);
    fireEvent.click(screen.getAllByRole('switch')[0]);
    expect(toast.error).toHaveBeenCalledWith('Inline toggle is not available in this context');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  // ── resolveCellDisplay: displayCatalogMaps mapped-value branch ───────────
  it('swaps a raw FK id for its catalog label when the column field declares displayFromCatalog', () => {
    render(
      <DataTable
        entity="orderLine"
        columns={[{ key: 'locatorId', label: 'Locator', type: 'string' }]}
        data={[{ id: 'r1', locatorId: 'loc-1' }]}
        addRow={{
          fields: [{ key: 'locatorId', displayFromCatalog: true }],
          catalogs: { orderLine: { locatorId: [{ id: 'loc-1', name: 'Main Warehouse' }] } },
        }}
        selectable={false}
      />,
    );
    expect(screen.getByTestId('cell-r1-locatorId')).toHaveTextContent('Main Warehouse');
  });

  // ── onColumnsReady effect ─────────────────────────────────────────────────
  it('reports its columns to the parent via onColumnsReady once columns are non-empty', () => {
    const onColumnsReady = vi.fn();
    render(<DataTable columns={baseColumns} data={baseRows} onColumnsReady={onColumnsReady} selectable={false} />);
    expect(onColumnsReady).toHaveBeenCalledWith(baseColumns);
  });
});
