import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createElement as h } from 'react';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams()],
  useLocation: () => ({ pathname: '/test/123', search: '', hash: '' }),
}));
vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => ({}),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));
vi.mock('@/hooks/useEntity', () => ({ useEntity: () => ({ handleChange: vi.fn() }) }));
vi.mock('@/hooks/useCatalogs', () => ({ useCatalogs: () => ({ catalogs: {}, catalogsLoaded: true }) }));
vi.mock('@/hooks/useDisplayLogic', () => ({ useDisplayLogic: () => ({}) }));
vi.mock('@/hooks/useCallout', () => ({ useCallout: () => ({ calloutResult: null, calloutLoading: false, executeCallout: vi.fn() }) }));
vi.mock('@/hooks/useLineGrossAmount', () => ({
  useLineGrossAmount: () => ({ grossAmount: 0, computeGrossAmount: vi.fn() }),
  ORDER_LINE_CONFIG: { quantityField: 'orderedQuantity', priceField: 'unitPrice' },
}));
vi.mock('@/hooks/useDocumentAction', () => ({ useDocumentAction: () => ({ execute: vi.fn(), loading: false }) }));
vi.mock('@/components/layout/PageMetaContext', () => ({ useSetPageMeta: () => vi.fn() }));
vi.mock('@/components/layout/FavoritesContext', () => ({ useFavorites: () => ({ isFavorite: () => false, toggleFavorite: vi.fn() }) }));
vi.mock('../SummaryBar.jsx', () => ({ SummaryBar: () => null }));
vi.mock('../DocumentTotalsPanel.jsx', () => ({ default: () => null }));
vi.mock('../DocumentStatusPill.jsx', () => ({ default: () => null }));
vi.mock('../DocumentPrintDrawer.jsx', () => ({ default: () => null }));
vi.mock('@/lib/resolveIdentifier.js', () => ({ resolveIdentifier: (data, key) => data?.[key + '$_identifier'] ?? data?.[key] ?? '' }));
vi.mock('@/lib/lineFieldChange.js', () => ({
  buildCalloutFormState: vi.fn(() => ({})),
  extractAuxValues: vi.fn(() => ({})),
  normalizeCalloutQty: vi.fn(),
  normalizeCalloutResponse: vi.fn(() => ({})),
  applyQtyZeroGuard: vi.fn(),
  roundAmounts: vi.fn((v) => v),
  resolveSnapshotIdentifiers: vi.fn(() => ({})),
}));
vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));
vi.mock('@/lib/formatAmount.js', () => ({ formatAmount: (val) => (val != null ? String(val) : '') }));
vi.mock('@/lib/utils.js', () => ({ cn: (...args) => args.filter(Boolean).join(' ') }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

import { getSecondaryRowUpdateHandler, SecondaryFormTab, SecondaryPanelTab, SecondaryTableTab } from '../DetailView.jsx';
import { toast } from 'sonner';

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// 1. getSecondaryRowUpdateHandler — factory + handler (success / network-error / http-error)
// ---------------------------------------------------------------------------
describe('getSecondaryRowUpdateHandler', () => {
  const baseCtx = () => ({
    api: { crud: {} },
    apiBaseUrl: '/api',
    secondaryHooks: [{ handleUpdateChild: vi.fn() }],
    stIdx: 0,
    token: 'tok',
    ui: (key) => key,
    extractErrorMessage: vi.fn(async () => 'server-error'),
  });

  it('returns undefined when st.customAddModal is truthy', () => {
    const result = getSecondaryRowUpdateHandler({ key: 'line', customAddModal: true }, 'inlineEditable', baseCtx());
    expect(result).toBeUndefined();
  });

  it('returns undefined when linesLayout is not inlineEditable', () => {
    const result = getSecondaryRowUpdateHandler({ key: 'line', customAddModal: false }, 'table', baseCtx());
    expect(result).toBeUndefined();
  });

  it('returns an async handler when editable inline and no custom modal', () => {
    const result = getSecondaryRowUpdateHandler({ key: 'line' }, 'inlineEditable', baseCtx());
    expect(typeof result).toBe('function');
  });

  it('handler success path: optimistic update then server-wins update', async () => {
    const ctx = baseCtx();
    const updatedRow = { id: 'r1', qty: 5, qty$_identifier: 'five' };
    // NEO wraps the saved record in {response:{data:[...]}}; the handler unwraps it.
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ response: { data: [updatedRow] } }) }));

    const handler = getSecondaryRowUpdateHandler({ key: 'line' }, 'inlineEditable', ctx);
    await handler({ id: 'r1', qty: 1 }, 'qty', 5, { identifier: 'five' });

    const hk = ctx.secondaryHooks[0].handleUpdateChild;
    // optimistic call (with identifier) then server-wins call
    expect(hk).toHaveBeenCalledTimes(2);
    expect(hk).toHaveBeenNthCalledWith(1, 'r1', { qty: 5, 'qty$_identifier': 'five' });
    expect(hk).toHaveBeenNthCalledWith(2, 'r1', updatedRow);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('handler success path without identifier: optimistic payload omits $_identifier', async () => {
    const ctx = baseCtx();
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => null }));

    const handler = getSecondaryRowUpdateHandler({ key: 'line' }, 'inlineEditable', ctx);
    await handler({ id: 'r1', qty: 1 }, 'qty', 5, undefined);

    const hk = ctx.secondaryHooks[0].handleUpdateChild;
    // null server json => no server-wins call, only optimistic
    expect(hk).toHaveBeenCalledTimes(1);
    expect(hk).toHaveBeenNthCalledWith(1, 'r1', { qty: 5 });
  });

  it('handler uses api.crud detailUrl when present', async () => {
    const ctx = baseCtx();
    ctx.api.crud.line = { detailUrl: '/custom/{id}/edit' };
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => null }));

    const handler = getSecondaryRowUpdateHandler({ key: 'line' }, 'inlineEditable', ctx);
    await handler({ id: 'r9' }, 'qty', 2, undefined);

    expect(global.fetch).toHaveBeenCalledWith('/custom/r9/edit', expect.objectContaining({ method: 'PATCH' }));
  });

  it('handler falls back to apiBaseUrl/key/id when no detailUrl', async () => {
    const ctx = baseCtx();
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => null }));

    const handler = getSecondaryRowUpdateHandler({ key: 'line' }, 'inlineEditable', ctx);
    await handler({ id: 'r9' }, 'qty', 2, undefined);

    expect(global.fetch).toHaveBeenCalledWith('/api/line/r9', expect.objectContaining({ method: 'PATCH' }));
  });

  it('handler network-error path: reverts, toasts networkError and rethrows', async () => {
    const ctx = baseCtx();
    const boom = new Error('');
    global.fetch = vi.fn(async () => { throw boom; });

    const handler = getSecondaryRowUpdateHandler({ key: 'line' }, 'inlineEditable', ctx);
    const row = { id: 'r1', qty: 1, qty$_identifier: 'one' };

    await expect(handler(row, 'qty', 5, { identifier: 'five' })).rejects.toBe(boom);

    const hk = ctx.secondaryHooks[0].handleUpdateChild;
    // optimistic then revert
    expect(hk).toHaveBeenNthCalledWith(1, 'r1', { qty: 5, 'qty$_identifier': 'five' });
    expect(hk).toHaveBeenNthCalledWith(2, 'r1', { qty: 1, 'qty$_identifier': 'one' });
    expect(toast.error).toHaveBeenCalledWith('networkError');
  });

  it('handler http-error path: reverts, toasts extractErrorMessage and throws', async () => {
    const ctx = baseCtx();
    global.fetch = vi.fn(async () => ({ ok: false, json: async () => ({}) }));

    const handler = getSecondaryRowUpdateHandler({ key: 'line' }, 'inlineEditable', ctx);
    const row = { id: 'r1', qty: 1 };

    await expect(handler(row, 'qty', 5, undefined)).rejects.toThrow('server-error');

    const hk = ctx.secondaryHooks[0].handleUpdateChild;
    expect(hk).toHaveBeenNthCalledWith(1, 'r1', { qty: 5 });
    expect(hk).toHaveBeenNthCalledWith(2, 'r1', { qty: 1 }); // revert with previous
    expect(ctx.extractErrorMessage).toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('server-error');
  });
});

// ---------------------------------------------------------------------------
// 2. SecondaryFormTab
// ---------------------------------------------------------------------------
describe('SecondaryFormTab', () => {
  const makeForm = () => vi.fn((p) => h('div', { 'data-testid': 'form', 'data-entity': p.entity }));

  it('renders st.Form and forwards the expected props', () => {
    const Form = makeForm();
    const selectorCtx = { abc: 1 };
    const props = {
      st: { key: 'line', Form },
      data: { id: 'd1' },
      hook: { editing: true },
      onChange: vi.fn(),
      catalogs: { x: 1 },
      token: 'tok',
      apiBaseUrl: '/api',
      selectorContextByEntity: { line: selectorCtx },
      labelOverrides: { a: 'b' },
    };
    render(SecondaryFormTab(props));

    expect(screen.getByTestId('form')).toBeTruthy();
    const received = Form.mock.calls[0][0];
    expect(received.data).toEqual({ id: 'd1' });
    expect(received.readOnly).toBe(false); // !editing
    expect(received.onChange).toBe(props.onChange);
    expect(received.entity).toBe('line');
    expect(received.catalogs).toBe(props.catalogs);
    expect(received.token).toBe('tok');
    expect(received.apiBaseUrl).toBe('/api');
    expect(received.selectorContext).toBe(selectorCtx);
    expect(received.labelOverrides).toBe(props.labelOverrides);
  });

  it('defaults data to {} when nullish and readOnly when not editing', () => {
    const Form = makeForm();
    const props = {
      st: { key: 'line', Form },
      data: null,
      hook: { editing: false },
      onChange: vi.fn(),
      catalogs: {},
      token: 't',
      apiBaseUrl: '/api',
      selectorContextByEntity: {},
      labelOverrides: {},
    };
    render(SecondaryFormTab(props));
    const received = Form.mock.calls[0][0];
    expect(received.data).toEqual({});
    expect(received.readOnly).toBe(true);
    expect(received.selectorContext).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. SecondaryPanelTab
// ---------------------------------------------------------------------------
describe('SecondaryPanelTab', () => {
  it('renders st.Panel with parentId from data.id, token, apiBaseUrl, onCount', () => {
    const Panel = vi.fn(() => h('div', { 'data-testid': 'panel' }));
    const onCount = vi.fn();
    const props = {
      st: { key: 'p', Panel },
      data: { id: 'parent-1' },
      token: 'tok',
      apiBaseUrl: '/api',
      onCount,
    };
    render(SecondaryPanelTab(props));

    expect(screen.getByTestId('panel')).toBeTruthy();
    const received = Panel.mock.calls[0][0];
    expect(received.parentId).toBe('parent-1');
    expect(received.token).toBe('tok');
    expect(received.apiBaseUrl).toBe('/api');
    expect(received.onCount).toBe(onCount);
  });

  it('passes undefined parentId when data is nullish', () => {
    const Panel = vi.fn(() => h('div', { 'data-testid': 'panel' }));
    const props = { st: { key: 'p', Panel }, data: null, token: 't', apiBaseUrl: '/api', onCount: vi.fn() };
    render(SecondaryPanelTab(props));
    expect(Panel.mock.calls[0][0].parentId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 4. SecondaryTableTab
// ---------------------------------------------------------------------------
describe('SecondaryTableTab', () => {
  const makeTable = () => vi.fn(() => h('div', { 'data-testid': 'table' }));
  const makeForm = () => vi.fn(() => h('div', { 'data-testid': 'detail-form' }));

  // Shared defaults — only what the component reads.
  const baseProps = (overrides = {}) => ({
    st: { key: 'line', Table: makeTable() },
    linesLayout: 'table',
    // For inlineEditable layouts the source calls this as a getter: fn(st.key).
    secondaryInlineLinesRef: vi.fn(() => ({ current: null })),
    secondaryHooks: [{ children: [] }],
    stIdx: 0,
    token: 'tok',
    apiBaseUrl: '/api',
    selectorContextByEntity: {},
    openCustomModal: vi.fn(),
    openSecondaryLine: vi.fn(),
    setCustomModalState: vi.fn(),
    selectedSecondaryLine: null,
    setSecondarySelectedRows: vi.fn(),
    enableSecondaryRowDelete: false,
    crud: {},
    onDeleteRow: vi.fn(),
    api: { crud: {} },
    ui: (k) => k,
    extractErrorMessage: vi.fn(),
    secondaryAddRowRef: { current: null },
    addingSecondaryLine: {},
    onAdd: vi.fn(),
    onCancel: vi.fn(),
    catalogs: {},
    hook: { editing: false },
    closingSecondaryLine: false,
    detailPanelTitle: 'Detail',
    onCloseDetailPanel: vi.fn(),
    secondaryLineEdits: null,
    onChange: vi.fn(),
    labelOverrides: {},
    savingLine: false,
    onSaveLine: vi.fn(),
    onDiscardLine: vi.fn(),
    onDeleteLine: vi.fn(),
    loadingLabel: 'Loading',
    saveLabel: 'Save',
    discardLabel: 'Discard',
    deleteLabel: 'Delete',
    onAddLineClick: vi.fn(),
    addLineLabel: 'Add line',
    hideChevron: false,
    secondaryAddLineWrapperRef: { current: null },
    secondaryBarVisible: {},
    secondaryBarClosing: {},
    secondaryBarRects: {},
    secondarySelectedRows: {},
    selectedLabel: 'selected',
    secondaryDeleting: {},
    closeTitle: 'close',
    onDelete: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  });

  it('renders st.Table with children data, entity, linesLayout', () => {
    const Table = makeTable();
    const children = [{ id: 'a' }, { id: 'b' }];
    const props = baseProps({
      st: { key: 'line', Table },
      secondaryHooks: [{ children }],
    });
    render(SecondaryTableTab(props));

    expect(screen.getByTestId('table')).toBeTruthy();
    const received = Table.mock.calls[0][0];
    expect(received.data).toBe(children);
    expect(received.entity).toBe('line');
    expect(received.linesLayout).toBe('table');
  });

  it('defaults Table data to [] when secondaryHooks entry has no children', () => {
    const Table = makeTable();
    const props = baseProps({ st: { key: 'line', Table }, secondaryHooks: [{}] });
    render(SecondaryTableTab(props));
    expect(Table.mock.calls[0][0].data).toEqual([]);
  });

  it('onDeleteRow is undefined when row delete is disabled', () => {
    const Table = makeTable();
    const props = baseProps({ st: { key: 'line', Table }, enableSecondaryRowDelete: false });
    render(SecondaryTableTab(props));
    expect(Table.mock.calls[0][0].onDeleteRow).toBeUndefined();
  });

  it('onDeleteRow is props.onDeleteRow when enabled and crud delete allowed', () => {
    const Table = makeTable();
    const onDeleteRow = vi.fn();
    const props = baseProps({
      st: { key: 'line', Table },
      enableSecondaryRowDelete: true,
      crud: { line: { delete: true } },
      onDeleteRow,
    });
    render(SecondaryTableTab(props));
    expect(Table.mock.calls[0][0].onDeleteRow).toBe(onDeleteRow);
  });

  it('onDeleteRow is undefined when enabled but crud delete is false', () => {
    const Table = makeTable();
    const props = baseProps({
      st: { key: 'line', Table },
      enableSecondaryRowDelete: true,
      crud: { line: { delete: false } },
    });
    render(SecondaryTableTab(props));
    expect(Table.mock.calls[0][0].onDeleteRow).toBeUndefined();
  });

  it('renders side detail panel and wires Save/Discard/Delete buttons', () => {
    const Table = makeTable();
    const Form = makeForm();
    const onSaveLine = vi.fn();
    const onDiscardLine = vi.fn();
    const onDeleteLine = vi.fn();
    const props = baseProps({
      st: { key: 'line', Table, Form }, // Form set, no Panel
      selectedSecondaryLine: { id: 'sel-1', _tabKey: 'line' },
      secondaryLineEdits: { id: 'sel-1', qty: 2 },
      hook: { editing: true },
      crud: { line: { delete: true } },
      onSaveLine,
      onDiscardLine,
      onDeleteLine,
    });
    render(SecondaryTableTab(props));

    // detail form rendered (Form is rendered in the side panel)
    expect(screen.getByTestId('detail-form')).toBeTruthy();

    fireEvent.click(screen.getByText('Save'));
    expect(onSaveLine).toHaveBeenCalled();

    fireEvent.click(screen.getByText('Discard'));
    expect(onDiscardLine).toHaveBeenCalled();

    fireEvent.click(screen.getByText('Delete'));
    expect(onDeleteLine).toHaveBeenCalled();
  });

  it('does not render side detail panel when selected tabKey does not match', () => {
    const Table = makeTable();
    const Form = makeForm();
    const props = baseProps({
      st: { key: 'line', Table, Form },
      selectedSecondaryLine: { id: 'sel-1', _tabKey: 'other' },
      hook: { editing: true },
    });
    render(SecondaryTableTab(props));
    expect(screen.queryByTestId('detail-form')).toBeNull();
  });

  it('renders the add-line bar and wires onAddLineClick / addLineLabel', () => {
    const Table = makeTable();
    const onAddLineClick = vi.fn();
    const props = baseProps({
      st: { key: 'line', Table, addLineFields: { entry: [{ name: 'qty' }] } },
      hook: { editing: true },
      linesLayout: 'inlineEditable',
      addLineLabel: 'Add a line',
      onAddLineClick,
    });
    render(SecondaryTableTab(props));

    const addBtn = screen.getByText('Add a line');
    expect(addBtn).toBeTruthy();
    fireEvent.click(addBtn);
    expect(onAddLineClick).toHaveBeenCalled();
  });

  it('does not render the add-line bar when not editing', () => {
    const Table = makeTable();
    const props = baseProps({
      st: { key: 'line', Table, addLineFields: { entry: [{ name: 'qty' }] } },
      hook: { editing: false },
      addLineLabel: 'Add a line',
    });
    render(SecondaryTableTab(props));
    expect(screen.queryByText('Add a line')).toBeNull();
  });
});
