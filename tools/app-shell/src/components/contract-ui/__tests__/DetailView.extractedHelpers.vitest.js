import { describe, it, expect, vi } from 'vitest';

// Importing DetailView.jsx pulls in the whole component tree (router, i18n,
// hooks, sub-components, lib helpers). Mirror the mocks used by
// DetailView.calloutHelpers.vitest.js so the module loads in isolation and we
// can import the extracted pure helpers directly.
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

vi.mock('@/hooks/useEntity', () => ({
  useEntity: () => ({ handleChange: vi.fn() }),
}));

vi.mock('@/hooks/useCatalogs', () => ({
  useCatalogs: () => ({ catalogs: {}, catalogsLoaded: true }),
}));

vi.mock('@/hooks/useDisplayLogic', () => ({
  useDisplayLogic: () => ({}),
}));

vi.mock('@/hooks/useCallout', () => ({
  useCallout: () => ({
    calloutResult: null,
    calloutLoading: false,
    executeCallout: vi.fn(),
  }),
}));

vi.mock('@/hooks/useLineGrossAmount', () => ({
  useLineGrossAmount: () => ({ grossAmount: 0, computeGrossAmount: vi.fn() }),
  ORDER_LINE_CONFIG: { quantityField: 'orderedQuantity', priceField: 'unitPrice' },
}));

vi.mock('@/hooks/useDocumentAction', () => ({
  useDocumentAction: () => ({ execute: vi.fn(), loading: false }),
}));

vi.mock('@/components/layout/PageMetaContext', () => ({
  useSetPageMeta: () => vi.fn(),
}));

vi.mock('@/components/layout/FavoritesContext', () => ({
  useFavorites: () => ({ isFavorite: () => false, toggleFavorite: vi.fn() }),
}));

vi.mock('../SummaryBar.jsx', () => ({
  SummaryBar: () => null,
}));

vi.mock('../DocumentTotalsPanel.jsx', () => ({ default: () => null }));
vi.mock('../DocumentStatusPill.jsx', () => ({ default: () => null }));
vi.mock('../DocumentPrintDrawer.jsx', () => ({ default: () => null }));

vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (data, key) => data?.[key + '$_identifier'] ?? data?.[key] ?? '',
}));

vi.mock('@/lib/lineFieldChange.js', () => ({
  buildCalloutFormState: vi.fn(() => ({})),
  extractAuxValues: vi.fn(() => ({})),
  normalizeCalloutQty: vi.fn(),
  normalizeCalloutResponse: vi.fn(() => ({})),
  applyQtyZeroGuard: vi.fn(),
  roundAmounts: vi.fn((v) => v),
  resolveSnapshotIdentifiers: vi.fn(() => ({})),
}));

vi.mock('@/lib/selectorCatalog.js', () => ({
  getCatalogOptions: () => [],
}));

vi.mock('@/lib/formatAmount.js', () => ({
  formatAmount: (val) => (val != null ? String(val) : ''),
}));

vi.mock('@/lib/utils.js', () => ({
  cn: (...args) => args.filter(Boolean).join(' '),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

import {
  mergeSelectorContextFields,
  mergeSelectorAuxFields,
  applyLocalChildRowUpdate,
  collectRowFieldValues,
  getSecondaryTabContentClassName,
  getSecondaryLinesTableRef,
  getSecondaryEditRowHandler,
  getSecondarySelectionChangeHandler,
  insertLinesTab,
  renderExtraActionButtons,
  getDetailContentContainerClassName,
  getLinesTabsSectionClassName,
  getSecondaryTabEntityKey,
  renderNotesField,
  computeIsDirty,
  hasRecordForRoute,
  isLoadingRecordForRoute,
  resolveHideMoreMenu,
  pushOthers,
  renderEmbeddedStatusPill,
  shouldShowLinesEmptyState,
  getTabsBarStyle,
  getTabsBarClassName,
  isDeleteButtonVisible,
  renderPrimaryTabButtons,
  resolveHeaderContent,
  isBulkDeleteBarVisible,
  isCustomPrimaryTabActive,
  getDetailContentClassName,
  canDeleteSelectedLine,
  shouldShowLineActionButtons,
  shouldShowDetailFormSidebar,
  isInitialChildrenLoading,
  canShowAddLineArea,
  shouldShowInlineDeleteSelectionBar,
  getSaveButtonLabel,
  getChildSaveButtonLabel,
  getDeleteChildButtonLabel,
  getAddLineWrapperClassName,
  getAddLineWrapperStyle,
  resolveCanAddLines,
  getDocumentIds,
  resolveSidebarContent,
  renderSidePanel,
  getNotesRowClassName,
  getDocsRowClassName,
  getInlineEditableShrinkClassName,
  getOthersTabClassName,
  getCustomLinesTabClassName,
  getWindowTitle,
  getRecordTitle,
  getFullBreadcrumb,
  getOnAddToFavorites,
  getLinesContainerClassName,
  getSelectedLinesTotalLabel,
  parseBackendErrorMessage,
  getAddLineMenuActions,
  buildLineRowClickHandler,
  mergeLineEdits,
  hasUnsavedEdits,
} from '../DetailView.jsx';

describe('mergeSelectorContextFields', () => {
  it('maps standardPrice to gross keys when isTaxIncluded is undefined', () => {
    const snapshot = {};
    mergeSelectorContextFields({ standardPrice: 10 }, snapshot, 'product');
    expect(snapshot.grossUnitPrice).toBe(10);
    expect(snapshot.grossListPrice).toBe(10);
    expect(snapshot.unitPrice).toBeUndefined();
    expect(snapshot.listPrice).toBeUndefined();
  });

  it('maps standardPrice to gross keys when isTaxIncluded is true', () => {
    const snapshot = {};
    mergeSelectorContextFields({ standardPrice: 25, isTaxIncluded: true }, snapshot, 'product');
    expect(snapshot.grossUnitPrice).toBe(25);
    expect(snapshot.grossListPrice).toBe(25);
  });

  it('maps standardPrice to net keys when isTaxIncluded is false', () => {
    const snapshot = {};
    mergeSelectorContextFields({ standardPrice: 30, isTaxIncluded: false }, snapshot, 'product');
    expect(snapshot.unitPrice).toBe(30);
    expect(snapshot.listPrice).toBe(30);
    expect(snapshot.grossUnitPrice).toBeUndefined();
    expect(snapshot.grossListPrice).toBeUndefined();
  });

  it('does not map standardPrice when it is null', () => {
    const snapshot = {};
    mergeSelectorContextFields({ standardPrice: null }, snapshot, 'product');
    expect(snapshot.grossUnitPrice).toBeUndefined();
    expect(snapshot.unitPrice).toBeUndefined();
    expect('product_standardPrice' in snapshot).toBe(false);
  });

  it('skips reserved keys (id, label, name, searchKey, _aux)', () => {
    const snapshot = {};
    mergeSelectorContextFields(
      { id: 'X1', label: 'L', name: 'N', searchKey: 'SK', _aux: { _UOM: 'EA' } },
      snapshot,
      'product',
    );
    expect(snapshot).toEqual({});
  });

  it('skips object and null values', () => {
    const snapshot = {};
    mergeSelectorContextFields({ nested: { a: 1 }, ref: null }, snapshot, 'product');
    expect(snapshot).toEqual({});
  });

  it('maps a scalar field to `${fieldKey}_${topField}`', () => {
    const snapshot = {};
    mergeSelectorContextFields({ uomCode: 'EA', active: true }, snapshot, 'product');
    expect(snapshot.product_uomCode).toBe('EA');
    expect(snapshot.product_active).toBe(true);
  });

  it('does not overwrite an existing ctxKey', () => {
    const snapshot = { product_uomCode: 'KEEP' };
    mergeSelectorContextFields({ uomCode: 'NEW' }, snapshot, 'product');
    expect(snapshot.product_uomCode).toBe('KEEP');
  });
});

describe('mergeSelectorAuxFields', () => {
  it('folds _aux suffixes with the fieldKey prefix', () => {
    const snapshot = {};
    mergeSelectorAuxFields(
      { _aux: { _PSTD: 5, _PLIM: 8, _UOM: 'EA' } },
      snapshot,
      'product',
    );
    expect(snapshot.product_PSTD).toBe(5);
    expect(snapshot.product_PLIM).toBe(8);
    expect(snapshot.product_UOM).toBe('EA');
  });

  it('is a no-op when _aux is missing', () => {
    const snapshot = { existing: 1 };
    mergeSelectorAuxFields({ standardPrice: 10 }, snapshot, 'product');
    expect(snapshot).toEqual({ existing: 1 });
  });
});

describe('applyLocalChildRowUpdate', () => {
  it('calls hook.handleUpdateChild with row.id and the merged update', () => {
    const hook = { handleUpdateChild: vi.fn() };
    applyLocalChildRowUpdate(
      { tax: 'T1' },
      'product',
      'P1',
      {},
      undefined,
      hook,
      { id: 'row-1' },
    );
    expect(hook.handleUpdateChild).toHaveBeenCalledWith('row-1', {
      tax: 'T1',
      product: 'P1',
    });
  });

  it('includes unitPrice only when fieldValues.unitPrice is defined', () => {
    const hook = { handleUpdateChild: vi.fn() };
    applyLocalChildRowUpdate({}, 'product', 'P1', { unitPrice: 12 }, undefined, hook, { id: 'row-2' });
    expect(hook.handleUpdateChild).toHaveBeenCalledWith('row-2', {
      product: 'P1',
      unitPrice: 12,
    });
  });

  it('omits unitPrice when fieldValues.unitPrice is undefined', () => {
    const hook = { handleUpdateChild: vi.fn() };
    applyLocalChildRowUpdate({}, 'product', 'P1', {}, undefined, hook, { id: 'row-3' });
    const [, update] = hook.handleUpdateChild.mock.calls[0];
    expect('unitPrice' in update).toBe(false);
  });

  it('adds the $_identifier key only when opts.identifier is defined', () => {
    const hook = { handleUpdateChild: vi.fn() };
    applyLocalChildRowUpdate({}, 'product', 'P1', {}, { identifier: 'Widget' }, hook, { id: 'row-4' });
    expect(hook.handleUpdateChild).toHaveBeenCalledWith('row-4', {
      product: 'P1',
      'product$_identifier': 'Widget',
    });
  });

  it('does not add a $_identifier key when opts is undefined', () => {
    const hook = { handleUpdateChild: vi.fn() };
    applyLocalChildRowUpdate({}, 'product', 'P1', {}, undefined, hook, { id: 'row-5' });
    const [, update] = hook.handleUpdateChild.mock.calls[0];
    expect('product$_identifier' in update).toBe(false);
  });

  it('does not throw when the hook has no handleUpdateChild', () => {
    expect(() =>
      applyLocalChildRowUpdate({}, 'product', 'P1', {}, undefined, {}, { id: 'row-6' }),
    ).not.toThrow();
  });
});

describe('collectRowFieldValues', () => {
  it('skips keys ending in $_identifier', () => {
    const fieldValues = {};
    collectRowFieldValues({ 'product$_identifier': 'Widget' }, fieldValues, (v) => v);
    expect(fieldValues).toEqual({});
  });

  it('skips internal markers and metadata keys', () => {
    const fieldValues = {};
    collectRowFieldValues(
      { _identifier: 'x', _entityName: 'OrderLine', $ref: 'r', id: 'row-1', qty: 3 },
      fieldValues,
      (v) => v,
    );
    expect(fieldValues).toEqual({ qty: 3 });
  });

  it('applies coerce to each remaining value', () => {
    const fieldValues = {};
    const coerce = vi.fn((v) => `c:${v}`);
    collectRowFieldValues({ qty: 3, price: 10 }, fieldValues, coerce);
    expect(coerce).toHaveBeenCalledWith(3);
    expect(coerce).toHaveBeenCalledWith(10);
    expect(fieldValues).toEqual({ qty: 'c:3', price: 'c:10' });
  });
});

describe('getSecondaryTabContentClassName', () => {
  it('appends pointer-events-none when embedded is true', () => {
    expect(getSecondaryTabContentClassName('pt-4', true)).toBe(
      'pt-4 flex flex-col gap-3 pointer-events-none',
    );
  });

  it('omits pointer-events-none when embedded is false', () => {
    expect(getSecondaryTabContentClassName('pt-4', false)).toBe('pt-4 flex flex-col gap-3');
  });
});

describe('getSecondaryLinesTableRef', () => {
  it('calls the getter with st.key when layout is inlineEditable', () => {
    const getRef = vi.fn(() => ({ current: null }));
    const result = getSecondaryLinesTableRef('inlineEditable', getRef, { key: 'lines' });
    expect(getRef).toHaveBeenCalledWith('lines');
    expect(result).toEqual({ current: null });
  });

  it('returns undefined for non-inlineEditable layouts', () => {
    const getRef = vi.fn();
    expect(getSecondaryLinesTableRef('readOnly', getRef, { key: 'lines' })).toBeUndefined();
    expect(getRef).not.toHaveBeenCalled();
  });
});

describe('getSecondaryEditRowHandler', () => {
  it('returns a handler that opens the custom modal when customAddModal is set', () => {
    const setCustomModalState = vi.fn();
    const handler = getSecondaryEditRowHandler(
      { key: 'address', customAddModal: () => null },
      setCustomModalState,
    );
    expect(typeof handler).toBe('function');
    handler({ id: 'row-7' });
    expect(setCustomModalState).toHaveBeenCalledWith({ key: 'address', rowId: 'row-7' });
  });

  it('returns undefined when customAddModal is not set', () => {
    expect(getSecondaryEditRowHandler({ key: 'lines' }, vi.fn())).toBeUndefined();
  });
});

describe('getSecondarySelectionChangeHandler', () => {
  it('returns a handler that merges rows under st.key when layout is inlineEditable', () => {
    const setSecondarySelectedRows = vi.fn();
    const handler = getSecondarySelectionChangeHandler(
      'inlineEditable',
      setSecondarySelectedRows,
      { key: 'lines' },
    );
    expect(typeof handler).toBe('function');
    handler(['r1', 'r2']);
    expect(setSecondarySelectedRows).toHaveBeenCalledTimes(1);
    const updater = setSecondarySelectedRows.mock.calls[0][0];
    expect(updater({ other: ['x'] })).toEqual({ other: ['x'], lines: ['r1', 'r2'] });
  });

  it('returns undefined for non-inlineEditable layouts', () => {
    expect(
      getSecondarySelectionChangeHandler('readOnly', vi.fn(), { key: 'lines' }),
    ).toBeUndefined();
  });
});

describe('insertLinesTab', () => {
  it('falls back detailLabel -> detailEntity -> "Lines" for the label', () => {
    const a = [];
    insertLinesTab('My Label', 'Entity', { children: [] }, undefined, a);
    expect(a[0].label).toBe('My Label');

    const b = [];
    insertLinesTab('', 'Entity', { children: [] }, undefined, b);
    expect(b[0].label).toBe('Entity');

    const c = [];
    insertLinesTab(undefined, undefined, { children: [] }, undefined, c);
    expect(c[0].label).toBe('Lines');
  });

  it('sets count to hook.children.length', () => {
    const tabs = [];
    insertLinesTab('L', 'E', { children: [{}, {}, {}] }, undefined, tabs);
    expect(tabs[0].count).toBe(3);
  });

  it('sets count to 0 when children is empty or undefined', () => {
    const tabs = [];
    insertLinesTab('L', 'E', { children: [] }, undefined, tabs);
    expect(tabs[0].count).toBe(0);

    const tabs2 = [];
    insertLinesTab('L', 'E', {}, undefined, tabs2);
    expect(tabs2[0].count).toBe(0);
  });

  it('splices at a valid numeric detailTabIndex within [0, tabs.length]', () => {
    const tabs = [{ key: 'a' }, { key: 'b' }];
    insertLinesTab('L', 'E', { children: [] }, 1, tabs);
    expect(tabs.map((t) => t.key)).toEqual(['a', 'lines', 'b']);

    const atEnd = [{ key: 'a' }, { key: 'b' }];
    insertLinesTab('L', 'E', { children: [] }, 2, atEnd);
    expect(atEnd.map((t) => t.key)).toEqual(['a', 'b', 'lines']);
  });

  it('unshifts to the front for out-of-range or non-number index', () => {
    const negative = [{ key: 'a' }];
    insertLinesTab('L', 'E', { children: [] }, -1, negative);
    expect(negative.map((t) => t.key)).toEqual(['lines', 'a']);

    const tooBig = [{ key: 'a' }];
    insertLinesTab('L', 'E', { children: [] }, 5, tooBig);
    expect(tooBig.map((t) => t.key)).toEqual(['lines', 'a']);

    const nonNumber = [{ key: 'a' }];
    insertLinesTab('L', 'E', { children: [] }, undefined, nonNumber);
    expect(nonNumber.map((t) => t.key)).toEqual(['lines', 'a']);
  });

  it('mutates the tabs array in place (same reference) and returns nothing', () => {
    const tabs = [{ key: 'a' }];
    const result = insertLinesTab('L', 'E', { children: [] }, 0, tabs);
    expect(result).toBeUndefined();
    expect(tabs.length).toBe(2);
    expect(tabs[0].key).toBe('lines');
  });
});

describe('renderExtraActionButtons', () => {
  it('calls extraActions once with { data, children } when it is a function', () => {
    const data = { id: 'rec-1' };
    const hook = { children: [{ id: 'c1' }] };
    const extraActions = vi.fn(() => [{ key: 'x', label: 'X' }]);
    renderExtraActionButtons(extraActions, data, hook, 'save-cls');
    expect(extraActions).toHaveBeenCalledTimes(1);
    expect(extraActions).toHaveBeenCalledWith({ data, children: hook.children });
  });

  it('returns one entry per action', () => {
    const actions = [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }];
    const result = renderExtraActionButtons(actions, {}, { children: [] }, 'save-cls');
    expect(result).toHaveLength(2);
  });

  it('maps an action with visible === false to a falsy entry (not a Button)', () => {
    const actions = [
      { key: 'a', label: 'A' },
      { key: 'b', label: 'B', visible: false },
    ];
    const result = renderExtraActionButtons(actions, {}, { children: [] }, 'save-cls');
    expect(result).toHaveLength(2);
    expect(result[1]).toBe(false);
    expect(result.filter(Boolean)).toHaveLength(1);
  });

  it('result length equals input length (array form)', () => {
    const actions = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];
    const result = renderExtraActionButtons(actions, {}, { children: [] }, 'save-cls');
    expect(result.length).toBe(actions.length);
  });
});

describe('getDetailContentContainerClassName', () => {
  it('always starts with "flex-1 min-h-0 min-w-0 "', () => {
    const cls = getDetailContentContainerClassName({
      linesLayout: 'readOnly', activePrimaryTab: 'general',
    });
    expect(cls.startsWith('flex-1 min-h-0 min-w-0 ')).toBe(true);
  });

  it('includes the inlineEditable layout classes when linesLayout is inlineEditable', () => {
    const cls = getDetailContentContainerClassName({
      linesLayout: 'inlineEditable', activePrimaryTab: 'general',
    });
    expect(cls).toContain('flex flex-col overflow-y-auto');
    expect(cls).not.toContain('overflow-auto pb-6');
  });

  it('includes the default layout classes when linesLayout is not inlineEditable', () => {
    const cls = getDetailContentContainerClassName({
      linesLayout: 'readOnly', activePrimaryTab: 'general',
    });
    expect(cls).toContain('overflow-auto pb-2');
    expect(cls).not.toContain('flex flex-col overflow-y-auto');
  });

  it('appends " hidden" only when primaryTabs is truthy and activePrimaryTab !== "general"', () => {
    const hidden = getDetailContentContainerClassName({
      linesLayout: 'readOnly', primaryTabs: true, activePrimaryTab: 'lines',
    });
    expect(hidden.endsWith(' hidden')).toBe(true);
  });

  it('does not append " hidden" when activePrimaryTab === "general"', () => {
    const cls = getDetailContentContainerClassName({
      linesLayout: 'readOnly', primaryTabs: true, activePrimaryTab: 'general',
    });
    expect(cls).not.toContain(' hidden');
  });

  it('does not append " hidden" when primaryTabs is falsy', () => {
    const cls = getDetailContentContainerClassName({
      linesLayout: 'readOnly', primaryTabs: false, activePrimaryTab: 'lines',
    });
    expect(cls).not.toContain(' hidden');
  });

  it('uses the default px-6 padding when no formScrollPaddingX override is given', () => {
    const cls = getDetailContentContainerClassName({
      linesLayout: 'readOnly', activePrimaryTab: 'general',
    });
    expect(cls).toContain('px-6');
  });

  it('forwards formScrollPaddingX as the horizontal padding override', () => {
    const cls = getDetailContentContainerClassName({
      linesLayout: 'readOnly', activePrimaryTab: 'general', formScrollPaddingX: 'px-10',
    });
    expect(cls).toContain('px-10');
    expect(cls).not.toContain('px-6');
  });
});

describe('getLinesTabsSectionClassName', () => {
  it('returns the inlineEditable layout classes when linesLayout is inlineEditable', () => {
    expect(getLinesTabsSectionClassName('inlineEditable')).toBe('mt-1 flex flex-col relative');
  });

  it('returns the default class for any other layout value', () => {
    expect(getLinesTabsSectionClassName('readOnly')).toBe('mt-2');
    expect(getLinesTabsSectionClassName(undefined)).toBe('mt-2');
    expect(getLinesTabsSectionClassName('')).toBe('mt-2');
  });
});

describe('getSecondaryTabEntityKey', () => {
  it('returns null when the tab is a form tab', () => {
    expect(getSecondaryTabEntityKey([{ isFormTab: true, key: 'address' }], 0)).toBeNull();
  });

  it('returns null when the tab has a truthy Panel', () => {
    expect(getSecondaryTabEntityKey([{ Panel: () => null, key: 'address' }], 0)).toBeNull();
  });

  it('returns the tab key for a regular secondary tab', () => {
    expect(getSecondaryTabEntityKey([{ key: 'lines' }], 0)).toBe('lines');
  });

  it('returns null when the tab has no key (?? null)', () => {
    expect(getSecondaryTabEntityKey([{}], 0)).toBeNull();
  });

  it('returns null for an out-of-range index (undefined tab)', () => {
    expect(getSecondaryTabEntityKey([], 0)).toBeNull();
    expect(getSecondaryTabEntityKey([{ key: 'lines' }], 5)).toBeNull();
  });
});

describe('renderNotesField', () => {
  const ui = (key) => key;

  it('renders a textarea wired to onChange/onBlur when notesFocused is true', () => {
    const handleChangeWithCallout = vi.fn();
    const handleNotesSave = vi.fn();
    const setNotesFocused = vi.fn();
    const el = renderNotesField(
      true,
      { notes: 'hello' },
      'notes',
      handleChangeWithCallout,
      handleNotesSave,
      setNotesFocused,
      ui,
    );
    expect(el.type).toBe('textarea');
    expect(el.props.value).toBe('hello');
    expect(el.props.placeholder).toBe('description');
    expect(el.props.rows).toBe(3);

    // onChange forwards the field name + new value to the callout handler.
    el.props.onChange({ target: { value: 'world' } });
    expect(handleChangeWithCallout).toHaveBeenCalledWith('notes', 'world');

    // onBlur persists the current value and clears the focused flag.
    el.props.onBlur();
    expect(handleNotesSave).toHaveBeenCalledWith('hello');
    expect(setNotesFocused).toHaveBeenCalledWith(false);
  });

  it('defaults the textarea value to empty string when the field is missing', () => {
    const el = renderNotesField(true, {}, 'notes', vi.fn(), vi.fn(), vi.fn(), ui);
    expect(el.props.value).toBe('');
  });

  it('renders a clickable div showing the value when notesFocused is false', () => {
    const setNotesFocused = vi.fn();
    const el = renderNotesField(
      false,
      { notes: 'shown text' },
      'notes',
      vi.fn(),
      vi.fn(),
      setNotesFocused,
      ui,
    );
    expect(el.type).toBe('div');
    expect(el.props.role).toBe('textbox');
    expect(el.props.children).toBe('shown text');

    // Clicking or focusing the div enters edit mode.
    el.props.onClick();
    el.props.onFocus();
    expect(setNotesFocused).toHaveBeenNthCalledWith(1, true);
    expect(setNotesFocused).toHaveBeenNthCalledWith(2, true);
  });

  it('renders a placeholder span inside the div when the value is empty', () => {
    const el = renderNotesField(false, {}, 'notes', vi.fn(), vi.fn(), vi.fn(), ui);
    expect(el.type).toBe('div');
    const child = el.props.children;
    expect(child.type).toBe('span');
    expect(child.props.children).toBe('description');
  });
});

describe('computeIsDirty', () => {
  const clean = {
    hook: { isDirtyHeader: false },
    addingLine: false,
    addingSecondaryLine: {},
    lineEdits: null,
    additionalDirtyState: false,
  };

  it('is not dirty when every source is clean', () => {
    expect(
      computeIsDirty(clean.hook, clean.addingLine, clean.addingSecondaryLine, clean.lineEdits, clean.additionalDirtyState),
    ).toBe(false);
  });

  it('is dirty when hook.isDirtyHeader is true', () => {
    expect(computeIsDirty({ isDirtyHeader: true }, false, {}, null, false)).toBe(true);
  });

  it('returns the addingLine operand when it is truthy (|| short-circuit)', () => {
    // The first truthy operand is returned verbatim, not coerced to boolean.
    expect(computeIsDirty({ isDirtyHeader: false }, 'x', {}, null, false)).toBe('x');
  });

  it('is dirty when any addingSecondaryLine value is true', () => {
    expect(computeIsDirty({ isDirtyHeader: false }, false, { lines: true }, null, false)).toBe(true);
  });

  it('is not dirty when all addingSecondaryLine values are falsy', () => {
    expect(computeIsDirty({ isDirtyHeader: false }, false, { lines: false }, null, false)).toBe(false);
  });

  it('is dirty when lineEdits has at least one key', () => {
    expect(computeIsDirty({ isDirtyHeader: false }, false, {}, { 'row-1': {} }, false)).toBe(true);
  });

  it('is not dirty when lineEdits is null', () => {
    expect(computeIsDirty({ isDirtyHeader: false }, false, {}, null, false)).toBe(false);
  });

  it('is not dirty when lineEdits is an empty object', () => {
    expect(computeIsDirty({ isDirtyHeader: false }, false, {}, {}, false)).toBe(false);
  });

  it('is dirty when additionalDirtyState is strictly true', () => {
    expect(computeIsDirty({ isDirtyHeader: false }, false, {}, null, true)).toBe(true);
  });

  it('is not dirty when additionalDirtyState is truthy but not === true', () => {
    expect(computeIsDirty({ isDirtyHeader: false }, false, {}, null, 'x')).toBe(false);
    expect(computeIsDirty({ isDirtyHeader: false }, false, {}, null, 1)).toBe(false);
  });
});

describe('hasRecordForRoute', () => {
  it('returns true when isNew is true', () => {
    expect(hasRecordForRoute(true, { selected: {} }, '123')).toBe(true);
  });

  it('is truthy when the selected id matches the route record id (string)', () => {
    expect(hasRecordForRoute(false, { selected: { id: '123' } }, '123')).toBeTruthy();
  });

  it('is truthy when the selected id matches the route record id across types', () => {
    expect(hasRecordForRoute(false, { selected: { id: 123 } }, '123')).toBeTruthy();
  });

  it('is falsy when the selected id does not match', () => {
    expect(hasRecordForRoute(false, { selected: { id: '123' } }, '999')).toBeFalsy();
  });

  it('is falsy (undefined) when there is no selected id', () => {
    expect(hasRecordForRoute(false, { selected: {} }, '123')).toBeFalsy();
    expect(hasRecordForRoute(false, {}, '123')).toBeFalsy();
  });
});

describe('isLoadingRecordForRoute', () => {
  it('is true when loading and the route record is not yet present', () => {
    expect(isLoadingRecordForRoute({ loading: true, selected: { id: '1' } }, false, '999')).toBe(true);
  });

  it('is false when loading but the route record matches', () => {
    expect(isLoadingRecordForRoute({ loading: true, selected: { id: '123' } }, false, '123')).toBe(false);
  });

  it('is false when loading a brand-new record (isNew)', () => {
    expect(isLoadingRecordForRoute({ loading: true, selected: {} }, true, '123')).toBe(false);
  });

  it('is false when not loading', () => {
    expect(isLoadingRecordForRoute({ loading: false, selected: {} }, false, '999')).toBe(false);
  });
});

describe('resolveHideMoreMenu', () => {
  it('passes a boolean true through unchanged', () => {
    expect(resolveHideMoreMenu(true, { id: 'x' })).toBe(true);
  });

  it('passes a boolean false through unchanged', () => {
    expect(resolveHideMoreMenu(false, { id: 'x' })).toBe(false);
  });

  it('calls a function predicate with { data } and propagates its return', () => {
    const data = { status: 'CO' };
    const predicate = vi.fn(() => true);
    const result = resolveHideMoreMenu(predicate, data);
    expect(predicate).toHaveBeenCalledWith({ data });
    expect(result).toBe(true);
  });

  it('propagates a falsy return from the function predicate', () => {
    const predicate = vi.fn(() => false);
    expect(resolveHideMoreMenu(predicate, { id: 'x' })).toBe(false);
  });
});

describe('pushOthers', () => {
  const ui = (key) => key;

  it('pushes an "others" tab when showOthers is strictly true', () => {
    const tabs = [{ key: 'a' }];
    pushOthers(true, tabs, 'My Others', ui);
    expect(tabs).toHaveLength(2);
    expect(tabs[1]).toEqual({ key: 'others', label: 'My Others' });
  });

  it('falls back to ui("others") when othersLabel is missing', () => {
    const tabs = [];
    pushOthers(true, tabs, undefined, ui);
    expect(tabs[0]).toEqual({ key: 'others', label: 'others' });
  });

  it('falls back to ui("others") when othersLabel is an empty string', () => {
    const tabs = [];
    pushOthers(true, tabs, '', ui);
    expect(tabs[0].label).toBe('others');
  });

  it('does not push when showOthers is not strictly true', () => {
    const tabs = [{ key: 'a' }];
    pushOthers(1, tabs, 'X', ui);
    pushOthers('true', tabs, 'X', ui);
    pushOthers(false, tabs, 'X', ui);
    pushOthers(undefined, tabs, 'X', ui);
    expect(tabs).toHaveLength(1);
  });

  it('mutates the passed array in place and returns nothing', () => {
    const tabs = [];
    const result = pushOthers(true, tabs, 'L', ui);
    expect(result).toBeUndefined();
    expect(tabs).toHaveLength(1);
  });
});

describe('renderEmbeddedStatusPill', () => {
  it('returns null when statusField is falsy', () => {
    expect(renderEmbeddedStatusPill(null, { documentStatus: 'CO' }, {})).toBeNull();
    expect(renderEmbeddedStatusPill('', { documentStatus: 'CO' }, {})).toBeNull();
  });

  it('returns null when data[statusField] is falsy', () => {
    expect(renderEmbeddedStatusPill('documentStatus', {}, {})).toBeNull();
    expect(renderEmbeddedStatusPill('documentStatus', { documentStatus: '' }, {})).toBeNull();
  });

  it('wraps a DocumentStatusPill in a div, passing status and enumLabels', () => {
    const enumLabels = { CO: 'Completed' };
    const el = renderEmbeddedStatusPill('documentStatus', { documentStatus: 'CO' }, enumLabels);
    expect(el.type).toBe('div');
    const pill = el.props.children;
    expect(pill.props.status).toBe('CO');
    expect(pill.props.enumLabels).toBe(enumLabels);
  });
});

describe('shouldShowLinesEmptyState', () => {
  const EmptyState = () => null;

  it('is truthy when there are no children, editing, not adding, and not read-only', () => {
    expect(
      shouldShowLinesEmptyState({ children: [], editing: true }, false, EmptyState, false),
    ).toBeTruthy();
  });

  it('is falsy when there are children', () => {
    expect(
      shouldShowLinesEmptyState({ children: [{}], editing: true }, false, EmptyState, false),
    ).toBeFalsy();
  });

  it('is falsy when a line is being added', () => {
    expect(
      shouldShowLinesEmptyState({ children: [], editing: true }, true, EmptyState, false),
    ).toBeFalsy();
  });

  it('is falsy when no LinesEmptyState component is provided', () => {
    expect(
      shouldShowLinesEmptyState({ children: [], editing: true }, false, null, false),
    ).toBeFalsy();
  });

  it('is falsy when the hook is not editing', () => {
    expect(
      shouldShowLinesEmptyState({ children: [], editing: false }, false, EmptyState, false),
    ).toBeFalsy();
  });

  it('is falsy when the document is read-only', () => {
    expect(
      shouldShowLinesEmptyState({ children: [], editing: true }, false, EmptyState, true),
    ).toBeFalsy();
  });
});

describe('getTabsBarStyle', () => {
  it('returns a paddingRight calc when both right content and divider exist', () => {
    expect(getTabsBarStyle('content', '120px')).toEqual({ paddingRight: 'calc(120px + 24px)' });
  });

  it('returns undefined when tabsBarRight is falsy', () => {
    expect(getTabsBarStyle(null, '120px')).toBeUndefined();
  });

  it('returns undefined when tabsBarRightDivider is falsy', () => {
    expect(getTabsBarStyle('content', undefined)).toBeUndefined();
  });
});

describe('getTabsBarClassName', () => {
  it('embeds the padding utility and appends " relative" when a divider is present', () => {
    expect(getTabsBarClassName('px-6', '120px')).toBe(
      'flex items-center gap-1 px-6 py-2 shrink-0 relative',
    );
  });

  it('omits " relative" when there is no divider', () => {
    expect(getTabsBarClassName('px-6', undefined)).toBe(
      'flex items-center gap-1 px-6 py-2 shrink-0',
    );
  });
});

describe('isDeleteButtonVisible', () => {
  it('is falsy when the record is new (isNew short-circuits)', () => {
    expect(isDeleteButtonVisible(true, 'rec-1', { documentStatus: 'DR' }, 'documentStatus', true, false)).toBeFalsy();
  });

  it('is falsy when recordId is missing', () => {
    expect(isDeleteButtonVisible(false, undefined, { documentStatus: 'DR' }, 'documentStatus', true, false)).toBeFalsy();
  });

  it('is truthy on the happy path (draft record, not processed)', () => {
    expect(isDeleteButtonVisible(false, 'rec-1', { documentStatus: 'DR' }, 'documentStatus', true, false)).toBeTruthy();
  });

  it('is falsy when the record is completed under hideDeleteWhenComplete', () => {
    expect(isDeleteButtonVisible(false, 'rec-1', { documentStatus: 'CO' }, 'documentStatus', true, false)).toBeFalsy();
  });

  it('is falsy when hideDeleteWhenComplete and the record is processed', () => {
    expect(isDeleteButtonVisible(false, 'rec-1', { documentStatus: 'DR' }, 'documentStatus', true, true)).toBeFalsy();
  });

  it('is truthy when hideDeleteWhenComplete is false regardless of status', () => {
    expect(isDeleteButtonVisible(false, 'rec-1', { documentStatus: 'CO' }, 'documentStatus', false, true)).toBeTruthy();
  });
});

describe('renderPrimaryTabButtons', () => {
  const tMenu = (s) => s;
  const tabs = [{ key: 'general', label: 'General' }, { key: 'lines', label: 'Lines' }];

  it('returns a single wrapping div for the "pill" variant', () => {
    const setActive = vi.fn();
    const el = renderPrimaryTabButtons('pill', tabs, setActive, 'general', tMenu);
    expect(el.type).toBe('div');
    const buttons = el.props.children;
    expect(buttons).toHaveLength(2);
    expect(buttons[0].type).toBe('button');
    expect(buttons[0].props.children).toBe('General');
  });

  it('wires each pill button onClick to setActivePrimaryTab with the tab key', () => {
    const setActive = vi.fn();
    const el = renderPrimaryTabButtons('pill', tabs, setActive, 'general', tMenu);
    el.props.children[1].props.onClick();
    expect(setActive).toHaveBeenCalledWith('lines');
  });

  it('returns an array of buttons for the non-pill variant', () => {
    const setActive = vi.fn();
    const el = renderPrimaryTabButtons('underline', tabs, setActive, 'general', tMenu);
    expect(Array.isArray(el)).toBe(true);
    expect(el).toHaveLength(2);
    expect(el[0].type).toBe('button');
    expect(el[1].props.children).toBe('Lines');
  });

  it('wires each non-pill button onClick to setActivePrimaryTab with the tab key', () => {
    const setActive = vi.fn();
    const el = renderPrimaryTabButtons('underline', tabs, setActive, 'general', tMenu);
    el[1].props.onClick();
    expect(setActive).toHaveBeenCalledWith('lines');
  });

  it('applies tMenu to each tab label', () => {
    const tMenuSpy = vi.fn((s) => `t:${s}`);
    const el = renderPrimaryTabButtons('underline', tabs, vi.fn(), 'general', tMenuSpy);
    expect(el[0].props.children).toBe('t:General');
    expect(tMenuSpy).toHaveBeenCalledWith('General');
    expect(tMenuSpy).toHaveBeenCalledWith('Lines');
  });
});

describe('resolveHeaderContent', () => {
  it('returns a static value unchanged', () => {
    const content = { type: 'node' };
    expect(resolveHeaderContent(content, { id: 'x' })).toBe(content);
  });

  it('invokes a function header with data and returns its result', () => {
    const fn = vi.fn((d) => `header-${d.id}`);
    expect(resolveHeaderContent(fn, { id: '42' })).toBe('header-42');
    expect(fn).toHaveBeenCalledWith({ id: '42' });
  });

  it('passes through null / undefined static content', () => {
    expect(resolveHeaderContent(null, {})).toBeNull();
    expect(resolveHeaderContent(undefined, {})).toBeUndefined();
  });
});

describe('isBulkDeleteBarVisible', () => {
  it('is truthy when delete is allowed, not read-only, and rows are selected', () => {
    const api = { crud: { lines: { delete: true } } };
    expect(isBulkDeleteBarVisible('readOnly', api, 'lines', false, ['r1'])).toBeTruthy();
  });

  it('is falsy for the inlineEditable layout', () => {
    const api = { crud: { lines: { delete: true } } };
    expect(isBulkDeleteBarVisible('inlineEditable', api, 'lines', false, ['r1'])).toBeFalsy();
  });

  it('defaults delete to true when the crud entry is absent (?? true branch)', () => {
    expect(isBulkDeleteBarVisible('readOnly', {}, 'lines', false, ['r1'])).toBeTruthy();
    expect(isBulkDeleteBarVisible('readOnly', undefined, 'lines', false, ['r1'])).toBeTruthy();
  });

  it('is falsy when delete is explicitly disabled', () => {
    const api = { crud: { lines: { delete: false } } };
    expect(isBulkDeleteBarVisible('readOnly', api, 'lines', false, ['r1'])).toBeFalsy();
  });

  it('is falsy when the document is read-only', () => {
    expect(isBulkDeleteBarVisible('readOnly', {}, 'lines', true, ['r1'])).toBeFalsy();
  });

  it('is falsy when no rows are selected', () => {
    expect(isBulkDeleteBarVisible('readOnly', {}, 'lines', false, [])).toBeFalsy();
  });
});

describe('isCustomPrimaryTabActive', () => {
  it('is truthy when primaryTabs is present and the active tab is not "general"', () => {
    expect(isCustomPrimaryTabActive([{ key: 'a' }], 'lines')).toBeTruthy();
  });

  it('is falsy when the active tab is "general"', () => {
    expect(isCustomPrimaryTabActive([{ key: 'a' }], 'general')).toBeFalsy();
  });

  it('is falsy when primaryTabs is falsy (returns the falsy operand)', () => {
    expect(isCustomPrimaryTabActive(null, 'lines')).toBeFalsy();
    expect(isCustomPrimaryTabActive(undefined, 'lines')).toBeFalsy();
    expect(isCustomPrimaryTabActive(0, 'lines')).toBeFalsy();
  });
});

describe('getDetailContentClassName', () => {
  it('returns the side-panel + inlineEditable classes', () => {
    expect(getDetailContentClassName(true, 'inlineEditable')).toBe('flex-1 min-w-0 flex flex-col');
  });

  it('returns the side-panel + default classes', () => {
    expect(getDetailContentClassName(true, 'readOnly')).toBe('flex-1 min-w-0 space-y-2');
  });

  it('returns the no-side-panel + inlineEditable classes', () => {
    expect(getDetailContentClassName(false, 'inlineEditable')).toBe('max-w-full flex flex-col');
  });

  it('returns the no-side-panel + default classes', () => {
    expect(getDetailContentClassName(false, 'readOnly')).toBe('max-w-full space-y-2');
  });
});

describe('canDeleteSelectedLine', () => {
  it('is truthy on the happy path (delete allowed, line selected, not read-only)', () => {
    const api = { crud: { lines: { delete: true } } };
    expect(canDeleteSelectedLine(api, 'lines', { id: 'r1' }, false)).toBeTruthy();
  });

  it('defaults delete to true when the crud entry is absent (?? true branch)', () => {
    expect(canDeleteSelectedLine({}, 'lines', { id: 'r1' }, false)).toBeTruthy();
    expect(canDeleteSelectedLine(undefined, 'lines', { id: 'r1' }, false)).toBeTruthy();
  });

  it('is falsy when delete is explicitly false', () => {
    const api = { crud: { lines: { delete: false } } };
    expect(canDeleteSelectedLine(api, 'lines', { id: 'r1' }, false)).toBeFalsy();
  });

  it('is falsy when there is no selected line id', () => {
    expect(canDeleteSelectedLine({}, 'lines', {}, false)).toBeFalsy();
    expect(canDeleteSelectedLine({}, 'lines', null, false)).toBeFalsy();
  });

  it('is falsy when the document is read-only', () => {
    expect(canDeleteSelectedLine({}, 'lines', { id: 'r1' }, true)).toBeFalsy();
  });
});

describe('shouldShowLineActionButtons', () => {
  it('is truthy when editing and there are line edits', () => {
    expect(shouldShowLineActionButtons({ editing: true }, { 'r1': {} }, null)).toBeTruthy();
  });

  it('is truthy when editing and a line is selected', () => {
    expect(shouldShowLineActionButtons({ editing: true }, null, { id: 'r1' })).toBeTruthy();
  });

  it('is falsy when not editing', () => {
    expect(shouldShowLineActionButtons({ editing: false }, { 'r1': {} }, { id: 'r1' })).toBeFalsy();
  });

  it('is falsy when editing but neither lineEdits nor a selected line id', () => {
    expect(shouldShowLineActionButtons({ editing: true }, null, null)).toBeFalsy();
    expect(shouldShowLineActionButtons({ editing: true }, null, {})).toBeFalsy();
  });
});

describe('shouldShowDetailFormSidebar', () => {
  const DetailForm = () => null;

  it('is truthy when not inlineEditable, a form exists, and a line is selected', () => {
    expect(shouldShowDetailFormSidebar('readOnly', DetailForm, { id: 'r1' }, false)).toBeTruthy();
  });

  it('is truthy when not inlineEditable, a form exists, and a line is closing', () => {
    expect(shouldShowDetailFormSidebar('readOnly', DetailForm, null, true)).toBeTruthy();
  });

  it('is falsy for the inlineEditable layout', () => {
    expect(shouldShowDetailFormSidebar('inlineEditable', DetailForm, { id: 'r1' }, true)).toBeFalsy();
  });

  it('is falsy when there is no DetailForm', () => {
    expect(shouldShowDetailFormSidebar('readOnly', null, { id: 'r1' }, true)).toBeFalsy();
  });

  it('is falsy when neither a selected line nor a closing line', () => {
    expect(shouldShowDetailFormSidebar('readOnly', DetailForm, null, false)).toBeFalsy();
  });
});

describe('isInitialChildrenLoading', () => {
  it('is truthy when loading and there are no children yet', () => {
    expect(isInitialChildrenLoading({ childrenLoading: true, children: [] })).toBeTruthy();
  });

  it('is falsy when loading but children are already present', () => {
    expect(isInitialChildrenLoading({ childrenLoading: true, children: [{}] })).toBeFalsy();
  });

  it('is falsy when not loading', () => {
    expect(isInitialChildrenLoading({ childrenLoading: false, children: [] })).toBeFalsy();
  });
});

describe('canShowAddLineArea', () => {
  const DetailExtraActions = () => null;

  it('is truthy when editing, not read-only, has entry fields, and can add lines', () => {
    expect(canShowAddLineArea({ editing: true }, false, [{}], null, true)).toBeTruthy();
  });

  it('is truthy when there are no entry fields but DetailExtraActions exists', () => {
    expect(canShowAddLineArea({ editing: true }, false, [], DetailExtraActions, true)).toBeTruthy();
  });

  it('is falsy when not editing', () => {
    expect(canShowAddLineArea({ editing: false }, false, [{}], DetailExtraActions, true)).toBeFalsy();
  });

  it('is falsy when the document is read-only', () => {
    expect(canShowAddLineArea({ editing: true }, true, [{}], DetailExtraActions, true)).toBeFalsy();
  });

  it('is falsy when there are no entry fields and no DetailExtraActions', () => {
    expect(canShowAddLineArea({ editing: true }, false, [], null, true)).toBeFalsy();
  });

  it('is falsy when adding lines is not allowed', () => {
    expect(canShowAddLineArea({ editing: true }, false, [{}], DetailExtraActions, false)).toBeFalsy();
  });
});

describe('shouldShowInlineDeleteSelectionBar', () => {
  it('is truthy for inlineEditable when delete is allowed', () => {
    const api = { crud: { lines: { delete: true } } };
    expect(shouldShowInlineDeleteSelectionBar('inlineEditable', api, 'lines')).toBeTruthy();
  });

  it('defaults delete to true when the crud entry is absent (?? true branch)', () => {
    expect(shouldShowInlineDeleteSelectionBar('inlineEditable', {}, 'lines')).toBeTruthy();
    expect(shouldShowInlineDeleteSelectionBar('inlineEditable', undefined, 'lines')).toBeTruthy();
  });

  it('is falsy for non-inlineEditable layouts', () => {
    expect(shouldShowInlineDeleteSelectionBar('readOnly', {}, 'lines')).toBeFalsy();
    expect(shouldShowInlineDeleteSelectionBar(undefined, {}, 'lines')).toBeFalsy();
  });

  it('is falsy when delete is explicitly disabled', () => {
    const api = { crud: { lines: { delete: false } } };
    expect(shouldShowInlineDeleteSelectionBar('inlineEditable', api, 'lines')).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// Save / label helpers
// ---------------------------------------------------------------------------

const ui = (k) => k;

describe('getSaveButtonLabel', () => {
  it('returns loading key while saving', () => {
    expect(getSaveButtonLabel(true, ui)).toBe('loading');
  });
  it('returns save key when idle', () => {
    expect(getSaveButtonLabel(false, ui)).toBe('save');
  });
});

describe('getChildSaveButtonLabel', () => {
  it('returns loading key while saving a child', () => {
    expect(getChildSaveButtonLabel(true, ui)).toBe('loading');
  });
  it('returns save key when idle', () => {
    expect(getChildSaveButtonLabel(false, ui)).toBe('save');
  });
});

describe('getDeleteChildButtonLabel', () => {
  it('returns loading key while deleting', () => {
    expect(getDeleteChildButtonLabel(true, ui)).toBe('loading');
  });
  it('returns delete key when idle', () => {
    expect(getDeleteChildButtonLabel(false, ui)).toBe('delete');
  });
});

describe('getSelectedLinesTotalLabel', () => {
  const lineConfig = { grossField: 'lineGrossAmount' };
  it('returns null when showLineTotals is explicitly false', () => {
    expect(getSelectedLinesTotalLabel({ showLineTotals: false }, [], lineConfig, {})).toBeNull();
  });
  it('sums gross amounts and formats with currency', () => {
    const rows = [{ lineGrossAmount: '100' }, { lineGrossAmount: '50.5' }];
    const label = getSelectedLinesTotalLabel({}, rows, lineConfig, { 'currency$_identifier': 'EUR' });
    expect(label).toContain('EUR');
    // Locale-agnostic: 150 + two fraction digits (separator may be , or .)
    expect(label).toMatch(/150[.,]50/);
  });
  it('formats without currency when none present', () => {
    const label = getSelectedLinesTotalLabel(undefined, [{ lineGrossAmount: '10' }], lineConfig, {});
    expect(label).toMatch(/^10[.,]00$/);
  });
  it('ignores non-finite values in the sum', () => {
    const label = getSelectedLinesTotalLabel({}, [{ lineGrossAmount: 'abc' }], lineConfig, {});
    expect(label).toMatch(/^0[.,]00$/);
  });
});

// ---------------------------------------------------------------------------
// Class-name / style helpers
// ---------------------------------------------------------------------------

describe('add-line wrapper helpers', () => {
  it('getAddLineWrapperClassName returns sticky for inlineEditable', () => {
    expect(getAddLineWrapperClassName('inlineEditable')).toContain('sticky');
    expect(getAddLineWrapperClassName('sidePanel')).toBe('relative');
  });
  it('getAddLineWrapperStyle uses tighter padding for inlineEditable', () => {
    expect(getAddLineWrapperStyle('inlineEditable').padding).toBe(8);
    expect(getAddLineWrapperStyle('sidePanel').padding).toBe('10px 16px');
  });
  it('getInlineEditableShrinkClassName only shrinks for inlineEditable', () => {
    expect(getInlineEditableShrinkClassName('inlineEditable')).toBe('shrink-0');
    expect(getInlineEditableShrinkClassName('sidePanel')).toBe('');
  });
  it('getLinesContainerClassName toggles padding and embedded guard', () => {
    expect(getLinesContainerClassName('inlineEditable', false)).not.toContain('pt-3');
    const cls = getLinesContainerClassName('sidePanel', true);
    expect(cls).toContain('pt-3');
    expect(cls).toContain('pointer-events-none');
  });
});

describe('embedded row class helpers', () => {
  it('getNotesRowClassName adds pointer guard when embedded', () => {
    expect(getNotesRowClassName(true)).toContain('pointer-events-none');
    expect(getNotesRowClassName(false)).not.toContain('pointer-events-none');
  });
  it('getDocsRowClassName adds border and pointer guard', () => {
    expect(getDocsRowClassName(true)).toContain('pointer-events-none');
    expect(getDocsRowClassName(false)).toContain('border-b');
  });
  it('getOthersTabClassName adds pointer guard when embedded', () => {
    expect(getOthersTabClassName(true)).toContain('pointer-events-none');
    expect(getOthersTabClassName(false)).toBe('pt-5');
  });
  it('getCustomLinesTabClassName adds pointer guard when embedded', () => {
    expect(getCustomLinesTabClassName(true)).toContain('pointer-events-none');
    expect(getCustomLinesTabClassName(false)).toBe('pt-3');
  });
});

// ---------------------------------------------------------------------------
// canAddLines / id / sidebar / title helpers
// ---------------------------------------------------------------------------

describe('resolveCanAddLines', () => {
  it('delegates to addLineGuard when provided', () => {
    const guard = vi.fn(() => false);
    expect(resolveCanAddLines(guard, { a: 1 }, null, [])).toBe(false);
    expect(guard).toHaveBeenCalledWith({ a: 1 }, []);
  });
  it('requires all required header fields to be filled', () => {
    expect(resolveCanAddLines(null, { bp: 'x', wh: 'y' }, ['bp', 'wh'])).toBe(true);
    expect(resolveCanAddLines(null, { bp: 'x', wh: '' }, ['bp', 'wh'])).toBe(false);
    expect(resolveCanAddLines(null, { bp: 'x', wh: '  ' }, ['bp', 'wh'])).toBe(false);
  });
  it('returns true when there are no required fields', () => {
    expect(resolveCanAddLines(null, {}, [])).toBe(true);
    expect(resolveCanAddLines(null, {}, undefined)).toBe(true);
  });
});

describe('getDocumentIds', () => {
  it('wraps a record id in an array', () => {
    expect(getDocumentIds('rec-1')).toEqual(['rec-1']);
  });
  it('returns an empty array when no id', () => {
    expect(getDocumentIds(null)).toEqual([]);
  });
});

describe('resolveSidebarContent', () => {
  it('calls a function content with data', () => {
    const fn = vi.fn(() => 'panel');
    expect(resolveSidebarContent(fn, { id: '1' })).toBe('panel');
    expect(fn).toHaveBeenCalledWith({ id: '1' });
  });
  it('passes through a static value', () => {
    expect(resolveSidebarContent('static', {})).toBe('static');
  });
});

describe('renderSidePanel', () => {
  it('passes through a non-function panel value', () => {
    expect(renderSidePanel('node', {}, 'r1', 't', '/api', {}, false)).toBe('node');
  });
  it('creates an element when the panel is a component', () => {
    const Panel = () => null;
    const el = renderSidePanel(Panel, { id: 'd1' }, 'r1', 't', '/api', {}, true);
    expect(el.type).toBe(Panel);
    expect(el.props.recordId).toBe('d1');
    expect(el.props.isNew).toBe(true);
  });
});

describe('title / breadcrumb helpers', () => {
  const tMenu = (k) => k;
  it('getWindowTitle uses last breadcrumb segment when present', () => {
    expect(getWindowTitle('Sales / Orders', tMenu, 'orders')).toBe('Orders');
  });
  it('getWindowTitle falls back to windowName', () => {
    expect(getWindowTitle(null, tMenu, 'orders')).toBe('orders');
  });
  it('getRecordTitle returns the newRecord label when new', () => {
    expect(getRecordTitle(true, ui, {}, 'documentNo')).toBe('newRecord');
  });
  it('getRecordTitle resolves the title field for existing records', () => {
    expect(getRecordTitle(false, ui, { documentNo: 'SO-1' }, 'documentNo')).toBe('SO-1');
  });
  it('getFullBreadcrumb joins translated segments and appends the title', () => {
    expect(getFullBreadcrumb('Sales / Orders', tMenu, 'SO-1', 'win')).toBe('Sales / Orders / SO-1');
  });
  it('getFullBreadcrumb falls back to the window title without a breadcrumb', () => {
    expect(getFullBreadcrumb(null, tMenu, 'SO-1', 'Window Title')).toBe('Window Title');
  });
});

describe('getOnAddToFavorites', () => {
  it('returns undefined without a favKey', () => {
    expect(getOnAddToFavorites(null, vi.fn(), 'L', 'b', 'w')).toBeUndefined();
  });
  it('returns a handler that toggles the favorite with the entity label', () => {
    const toggle = vi.fn();
    const handler = getOnAddToFavorites('fav-1', toggle, 'Orders', 'Sales / Orders', 'orders');
    handler();
    expect(toggle).toHaveBeenCalledWith('fav-1', 'Orders');
  });
});

describe('parseBackendErrorMessage', () => {
  it('reads the NEO Headless top-level error message', async () => {
    const res = { json: async () => ({ error: { message: 'neo boom' } }) };
    expect(await parseBackendErrorMessage(res)).toBe('neo boom');
  });
  it('reads the Etendo JsonDataService nested error message', async () => {
    const res = { json: async () => ({ response: { error: { message: 'svc boom' } } }) };
    expect(await parseBackendErrorMessage(res)).toBe('svc boom');
  });
  it('reads a string error under response', async () => {
    const res = { json: async () => ({ response: { error: 'str boom' } }) };
    expect(await parseBackendErrorMessage(res)).toBe('str boom');
  });
  it('falls back to a top-level message', async () => {
    const res = { json: async () => ({ message: 'top boom' }) };
    expect(await parseBackendErrorMessage(res)).toBe('top boom');
  });
  it('returns undefined for a non-JSON body', async () => {
    const res = { json: async () => { throw new Error('not json'); } };
    expect(await parseBackendErrorMessage(res)).toBeUndefined();
  });
});

describe('getAddLineMenuActions', () => {
  it('returns undefined without a getLineMenuActions provider', () => {
    expect(getAddLineMenuActions(null, {}, { current: null }, ui)).toBeUndefined();
  });
  it('maps provider actions and translates string labels', () => {
    const provider = vi.fn(() => [{ label: 'importLines', onClick: () => {} }]);
    const actions = getAddLineMenuActions(provider, { id: '1' }, { current: 1 }, ui);
    expect(actions[0].label).toBe('importLines');
    expect(provider).toHaveBeenCalled();
  });
});

describe('buildLineRowClickHandler', () => {
  it('returns undefined for inlineEditable layout', () => {
    expect(buildLineRowClickHandler(() => null, 'inlineEditable', vi.fn())).toBeUndefined();
  });
  it('returns undefined without a DetailForm', () => {
    expect(buildLineRowClickHandler(null, 'sidePanel', vi.fn())).toBeUndefined();
  });
  it('selects a copy of the clicked row otherwise', () => {
    const setSelectedLine = vi.fn();
    const handler = buildLineRowClickHandler(() => null, 'sidePanel', setSelectedLine);
    const row = { id: 'l1', qty: 2 };
    handler(row);
    expect(setSelectedLine).toHaveBeenCalledTimes(1);
    const arg = setSelectedLine.mock.calls[0][0];
    expect(arg).toEqual(expect.objectContaining({ id: 'l1' }));
    expect(arg).not.toBe(row);
  });
});

// ---------------------------------------------------------------------------
// mergeLineEdits
// ---------------------------------------------------------------------------

describe('mergeLineEdits', () => {
  it('returns selectedLine unchanged when lineEdits is null', () => {
    const line = { id: 'L1', qty: 3 };
    expect(mergeLineEdits(null, line)).toBe(line);
  });

  it('returns selectedLine unchanged when lineEdits is undefined', () => {
    const line = { id: 'L1', qty: 3 };
    expect(mergeLineEdits(undefined, line)).toBe(line);
  });

  it('returns selectedLine unchanged when selectedLine is null', () => {
    expect(mergeLineEdits({ qty: 5 }, null)).toBeNull();
  });

  it('returns selectedLine unchanged when selectedLine is undefined', () => {
    expect(mergeLineEdits({ qty: 5 }, undefined)).toBeUndefined();
  });

  it('returns null when both lineEdits and selectedLine are null', () => {
    expect(mergeLineEdits(null, null)).toBeNull();
  });

  it('merges lineEdits over selectedLine when both are present', () => {
    const line = { id: 'L1', qty: 3, price: 10 };
    const edits = { qty: 7 };
    const result = mergeLineEdits(edits, line);
    expect(result).toEqual({ id: 'L1', qty: 7, price: 10 });
  });

  it('does not mutate the original selectedLine', () => {
    const line = { id: 'L1', qty: 3 };
    const edits = { qty: 9 };
    mergeLineEdits(edits, line);
    expect(line.qty).toBe(3);
  });

  it('lineEdits keys override all matching selectedLine keys', () => {
    const line = { id: 'L1', qty: 1, price: 5, product: 'P-old' };
    const edits = { qty: 2, price: 8, product: 'P-new' };
    const result = mergeLineEdits(edits, line);
    expect(result).toEqual({ id: 'L1', qty: 2, price: 8, product: 'P-new' });
  });

  it('adds new keys from lineEdits not present in selectedLine', () => {
    const line = { id: 'L1', qty: 1 };
    const edits = { description: 'extra' };
    const result = mergeLineEdits(edits, line);
    expect(result.description).toBe('extra');
    expect(result.qty).toBe(1);
  });

  it('merges with an empty lineEdits object (no-op overlay)', () => {
    const line = { id: 'L1', qty: 3 };
    const result = mergeLineEdits({}, line);
    expect(result).toEqual({ id: 'L1', qty: 3 });
    expect(result).not.toBe(line);
  });
});

// ---------------------------------------------------------------------------
// hasUnsavedEdits
// ---------------------------------------------------------------------------

describe('hasUnsavedEdits', () => {
  it('returns false when editing is null', () => {
    expect(hasUnsavedEdits(null, { id: 'L1', qty: 3 })).toBe(false);
  });

  it('returns false when editing is undefined', () => {
    expect(hasUnsavedEdits(undefined, { id: 'L1', qty: 3 })).toBe(false);
  });

  it('returns false when selected is null', () => {
    expect(hasUnsavedEdits({ qty: 3 }, null)).toBe(false);
  });

  it('returns false when selected is undefined', () => {
    expect(hasUnsavedEdits({ qty: 3 }, undefined)).toBe(false);
  });

  it('returns false when both editing and selected are null', () => {
    expect(hasUnsavedEdits(null, null)).toBe(false);
  });

  it('returns false when editing has only an id key (id is excluded from comparison)', () => {
    expect(hasUnsavedEdits({ id: 'L1' }, { id: 'L1', qty: 3 })).toBe(false);
  });

  it('returns false when every non-id editing value matches selected', () => {
    const editing = { id: 'L1', qty: 3, price: 10 };
    const selected = { id: 'L1', qty: 3, price: 10 };
    expect(hasUnsavedEdits(editing, selected)).toBe(false);
  });

  it('returns true when a non-id editing value differs from selected', () => {
    const editing = { id: 'L1', qty: 5 };
    const selected = { id: 'L1', qty: 3 };
    expect(hasUnsavedEdits(editing, selected)).toBe(true);
  });

  it('returns true when editing has a key absent in selected (undefined !== value)', () => {
    const editing = { id: 'L1', description: 'new text' };
    const selected = { id: 'L1' };
    expect(hasUnsavedEdits(editing, selected)).toBe(true);
  });

  it('returns true when a field changed from a truthy to a falsy value', () => {
    const editing = { id: 'L1', qty: 0 };
    const selected = { id: 'L1', qty: 3 };
    expect(hasUnsavedEdits(editing, selected)).toBe(true);
  });

  it('returns false when editing is an empty object (no keys to compare)', () => {
    expect(hasUnsavedEdits({}, { id: 'L1', qty: 3 })).toBe(false);
  });

  it('ignores the id field even when they differ', () => {
    const editing = { id: 'NEW-ID', qty: 3 };
    const selected = { id: 'L1', qty: 3 };
    expect(hasUnsavedEdits(editing, selected)).toBe(false);
  });
});
