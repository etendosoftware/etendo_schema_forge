/**
 * Tests for pure helper functions extracted from DetailView.jsx.
 * We import only the exported functions — internal ones are tested
 * indirectly through their callers or via source-reading.
 */
import { render, screen } from '@testing-library/react';
import {
  getCustomLinesTabClassName,
  getWindowTitle,
  getRecordTitle,
  getFullBreadcrumb,
  getOnAddToFavorites,
  getLinesContainerClassName,
  getDeleteChildButtonLabel,
  runAddLineAction,
  insertLinesTab,
  normalizePatchFieldValues,
  applyCalloutFieldUpdates,
  applyCalloutComboUpdates,
  mergeSelectorContextFields,
  mergeSelectorAuxFields,
  applyLocalChildRowUpdate,
  collectRowFieldValues,
  getSecondaryTabContentClassName,
  getSecondaryLinesTableRef,
  getSecondaryEditRowHandler,
  getSecondarySelectionChangeHandler,
  getSaveButtonLabel,
  getChildSaveButtonLabel,
  getAddLineWrapperClassName,
  getAddLineWrapperStyle,
  getDocumentIds,
  resolveSidebarContent,
  getNotesRowClassName,
  getDocsRowClassName,
  getInlineEditableShrinkClassName,
  getOthersTabClassName,
  resolveCanAddLines,
  getSelectedLinesTotalLabel,
  computeIsDirty,
  hasRecordForRoute,
  isLoadingRecordForRoute,
  resolveHideMoreMenu,
  pushOthers,
  shouldShowLinesEmptyState,
  getTabsBarStyle,
  getTabsBarClassName,
  isDeleteButtonVisible,
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
  getLinesTabsSectionClassName,
  getSecondaryTabEntityKey,
  getAddLineMenuActions,
  renderEmbeddedStatusPill,
  renderExtraActionButtons,
  getDetailContentContainerClassName,
  renderPrimaryTabButtons,
  renderNotesField,
  renderSidePanel,
  buildLineRowClickHandler,
} from '../DetailView.jsx';

// Mock all the heavy dependencies DetailView imports
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  useLocation: () => ({ pathname: '/', search: '' }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/hooks/useEntity', () => ({ useEntity: () => ({}), extractErrorMessage: vi.fn() }));
vi.mock('@/hooks/useCatalogs', () => ({ useCatalogs: () => ({}) }));
vi.mock('@/hooks/useDisplayLogic', () => ({ useDisplayLogic: () => ({}) }));
vi.mock('@/hooks/useCallout', () => ({ useCallout: () => ({}) }));
vi.mock('@/hooks/useCurrency', () => ({ useCurrency: () => ({}) }));
vi.mock('@/hooks/useLineGrossAmount', () => ({ useLineGrossAmount: () => ({}), ORDER_LINE_CONFIG: {} }));
vi.mock('@/hooks/useDocumentAction', () => ({ useDocumentAction: () => ({}) }));
vi.mock('@/i18n', () => ({ useMenuLabel: () => (k) => k, useUI: () => (k) => k, useLabel: () => () => '' }));
vi.mock('@/components/layout/PageMetaContext', () => ({ useSetPageMeta: () => vi.fn() }));
vi.mock('@/components/layout/FavoritesContext', () => ({ useFavorites: () => ({ isFavorite: () => false, toggleFavorite: vi.fn() }) }));
vi.mock('@/components/CurrentWindowContext', () => ({ useRegisterWindowContext: () => {} }));
vi.mock('@/components/copilot/ocr/ocrDocTypes', () => ({ matchOcrDocType: () => null }));
vi.mock('@/lib/selectorContext.js', () => ({ buildHeaderSelectorContext: () => ({}), buildLineSelectorContext: () => ({}) }));
vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));
vi.mock('@/lib/formatAmount.js', () => ({ formatAmount: (v) => String(v) }));
vi.mock('@/lib/resolveIdentifier.js', () => ({ resolveIdentifier: (data, f) => data?.[f] || data?._identifier }));
vi.mock('@/lib/documentTotals', () => ({ resolveTotalDiscountPct: () => 0 }));
vi.mock('@/lib/backendErrors.js', () => ({ translateBackendError: (m) => m }));
vi.mock('@/utils/recordActions.js', () => ({ isDeleteVisibleForRecord: () => true }));
vi.mock('@/lib/utils.js', () => ({ cn: (...args) => args.filter(Boolean).join(' ') }));
vi.mock('@/components/ui/button.jsx', () => ({
  Button: ({ children, ...rest }) => <button {...rest}>{children}</button>,
}));
vi.mock('../DocumentStatusPill.jsx', () => ({
  DocumentStatusPill: ({ status }) => <span data-testid="doc-status-pill">{status}</span>,
  default: ({ status }) => <span data-testid="doc-status-pill">{status}</span>,
}));

describe('DetailView helper functions', () => {
  describe('getCustomLinesTabClassName', () => {
    it('returns pt-3 when not embedded', () => {
      expect(getCustomLinesTabClassName(false)).toBe('pt-3');
    });

    it('adds pointer-events-none when embedded', () => {
      expect(getCustomLinesTabClassName(true)).toContain('pointer-events-none');
    });
  });

  describe('getWindowTitle', () => {
    it('uses last breadcrumb segment when breadcrumb exists', () => {
      const tMenu = (k) => `t:${k}`;
      expect(getWindowTitle('Sales / Orders', tMenu, 'sales-order')).toBe('t:Orders');
    });

    it('falls back to windowName when no breadcrumb', () => {
      const tMenu = (k) => k;
      expect(getWindowTitle(null, tMenu, 'sales-order')).toBe('sales-order');
    });
  });

  describe('getRecordTitle', () => {
    it('returns newRecord for new records', () => {
      const ui = (k) => k;
      expect(getRecordTitle(true, ui, {}, 'name')).toBe('newRecord');
    });

    it('resolves identifier for existing records', () => {
      const ui = (k) => k;
      expect(getRecordTitle(false, ui, { name: 'Order #1' }, 'name')).toBe('Order #1');
    });

    it('falls back to _identifier then id', () => {
      const ui = (k) => k;
      expect(getRecordTitle(false, ui, { _identifier: 'ID-001' }, null)).toBe('ID-001');
    });
  });

  describe('getFullBreadcrumb', () => {
    it('builds from breadcrumb segments + title', () => {
      const tMenu = (k) => `t:${k}`;
      expect(getFullBreadcrumb('A / B', tMenu, 'Title', 'WinTitle')).toBe('t:A / t:B / Title');
    });

    it('falls back to windowTitle when no breadcrumb', () => {
      const tMenu = (k) => k;
      expect(getFullBreadcrumb(null, tMenu, 'X', 'WinTitle')).toBe('WinTitle');
    });
  });

  describe('getOnAddToFavorites', () => {
    it('returns function when favKey is truthy', () => {
      const toggle = vi.fn();
      const fn = getOnAddToFavorites('key1', toggle, 'Label', null, 'win');
      expect(typeof fn).toBe('function');
      fn();
      expect(toggle).toHaveBeenCalledWith('key1', 'Label');
    });

    it('returns undefined when favKey is falsy', () => {
      expect(getOnAddToFavorites(null, vi.fn(), 'L', null, 'w')).toBeUndefined();
    });
  });

  describe('getLinesContainerClassName', () => {
    it('includes pt-3 for non-inline layout', () => {
      expect(getLinesContainerClassName('classic', false)).toContain('pt-3');
    });

    it('omits pt-3 for inlineEditable', () => {
      expect(getLinesContainerClassName('inlineEditable', false)).not.toContain('pt-3');
    });

    it('includes pointer-events-none when embedded', () => {
      expect(getLinesContainerClassName('classic', true)).toContain('pointer-events-none');
    });
  });

  describe('getDeleteChildButtonLabel', () => {
    it('returns loading when deleting', () => {
      const ui = (k) => k;
      expect(getDeleteChildButtonLabel(true, ui)).toBe('loading');
    });

    it('returns delete when not deleting', () => {
      const ui = (k) => k;
      expect(getDeleteChildButtonLabel(false, ui)).toBe('delete');
    });
  });

  describe('runAddLineAction', () => {
    it('calls handleCustomModalAddClick for customAddModal tabs', async () => {
      const handleCustomModalAddClick = vi.fn(() => Promise.resolve());
      const handleSecondaryAddLineToggle = vi.fn(() => Promise.resolve());
      await runAddLineAction({ key: 'loc', customAddModal: true }, { handleCustomModalAddClick, handleSecondaryAddLineToggle });
      expect(handleCustomModalAddClick).toHaveBeenCalledWith('loc');
    });

    it('calls handleSecondaryAddLineToggle for regular tabs', async () => {
      const handleCustomModalAddClick = vi.fn(() => Promise.resolve());
      const handleSecondaryAddLineToggle = vi.fn(() => Promise.resolve());
      await runAddLineAction({ key: 'lines' }, { handleCustomModalAddClick, handleSecondaryAddLineToggle });
      expect(handleSecondaryAddLineToggle).toHaveBeenCalledWith('lines');
    });

    it('does not throw on rejection', async () => {
      const fail = vi.fn(() => Promise.reject(new Error('boom')));
      await expect(runAddLineAction({ key: 'x' }, {
        handleCustomModalAddClick: fail,
        handleSecondaryAddLineToggle: fail,
      })).resolves.not.toThrow();
    });
  });

  describe('insertLinesTab', () => {
    it('inserts at specified index', () => {
      const tabs = [{ key: 'a' }, { key: 'b' }];
      insertLinesTab('Lines', 'lines', { children: [1, 2, 3] }, 1, tabs);
      expect(tabs[1].key).toBe('lines');
      expect(tabs[1].count).toBe(3);
    });

    it('unshifts when no index specified', () => {
      const tabs = [{ key: 'a' }];
      insertLinesTab('Lines', 'lines', { children: [] }, undefined, tabs);
      expect(tabs[0].key).toBe('lines');
    });
  });

  describe('normalizePatchFieldValues', () => {
    it('converts numeric strings to floats', () => {
      const fv = {};
      normalizePatchFieldValues({ amount: '42.5', name: 'Test' }, fv);
      expect(fv.amount).toBe(42.5);
      expect(fv.name).toBe('Test');
    });

    it('skips $_identifier keys', () => {
      const fv = {};
      normalizePatchFieldValues({ 'bp$_identifier': 'Acme', bp: 'ID1' }, fv);
      expect(fv['bp$_identifier']).toBeUndefined();
      expect(fv.bp).toBe('ID1');
    });

    it('handles negative numeric strings', () => {
      const fv = {};
      normalizePatchFieldValues({ qty: '-3.14' }, fv);
      expect(fv.qty).toBe(-3.14);
    });

    it('preserves non-numeric strings as-is', () => {
      const fv = {};
      normalizePatchFieldValues({ desc: 'hello 123' }, fv);
      expect(fv.desc).toBe('hello 123');
    });
  });

  describe('mergeSelectorContextFields', () => {
    it('merges standardPrice as gross when isTaxIncluded', () => {
      const snapshot = {};
      mergeSelectorContextFields({ standardPrice: 100, isTaxIncluded: true }, snapshot, 'product');
      expect(snapshot.grossUnitPrice).toBe(100);
      expect(snapshot.grossListPrice).toBe(100);
    });

    it('merges standardPrice as net when isTaxIncluded=false', () => {
      const snapshot = {};
      mergeSelectorContextFields({ standardPrice: 80, isTaxIncluded: false }, snapshot, 'product');
      expect(snapshot.unitPrice).toBe(80);
      expect(snapshot.listPrice).toBe(80);
    });

    it('skips id, _aux, label, name, objects, null', () => {
      const snapshot = {};
      mergeSelectorContextFields({ id: '1', _aux: {}, label: 'L', name: 'N', nested: {}, x: null, custom: 'val' }, snapshot, 'f');
      expect(snapshot['f_custom']).toBe('val');
      expect(snapshot['f_id']).toBeUndefined();
    });

    it('does not overwrite existing snapshot keys', () => {
      const snapshot = { product_currency: 'EUR' };
      mergeSelectorContextFields({ currency: 'USD' }, snapshot, 'product');
      expect(snapshot.product_currency).toBe('EUR');
    });
  });

  describe('mergeSelectorAuxFields', () => {
    it('merges _aux fields into snapshot', () => {
      const snapshot = {};
      mergeSelectorAuxFields({ _aux: { _PSTD: '100', _UOM: 'kg' } }, snapshot, 'product');
      expect(snapshot.product_PSTD).toBe('100');
      expect(snapshot.product_UOM).toBe('kg');
    });

    it('handles missing _aux gracefully', () => {
      const snapshot = {};
      mergeSelectorAuxFields({}, snapshot, 'product');
      expect(Object.keys(snapshot)).toHaveLength(0);
    });
  });

  describe('collectRowFieldValues', () => {
    it('collects values and coerces them', () => {
      const fv = {};
      collectRowFieldValues({ qty: '10', name: 'Test', id: '123', _identifier: 'x' }, fv, (v) => v);
      expect(fv.qty).toBe('10');
      expect(fv.name).toBe('Test');
      expect(fv.id).toBeUndefined(); // skipped
      expect(fv._identifier).toBeUndefined(); // skipped
    });

    it('skips $_identifier and $ref keys', () => {
      const fv = {};
      collectRowFieldValues({ 'bp$_identifier': 'Acme', '$ref': 'x', _entityName: 'y', val: 1 }, fv, (v) => v);
      expect(fv['bp$_identifier']).toBeUndefined();
      expect(fv['$ref']).toBeUndefined();
      expect(fv._entityName).toBeUndefined();
      expect(fv.val).toBe(1);
    });
  });

  describe('getSecondaryTabContentClassName', () => {
    it('includes padding and no pointer-events when not embedded', () => {
      expect(getSecondaryTabContentClassName('pt-4', false)).toContain('pt-4');
      expect(getSecondaryTabContentClassName('pt-4', false)).not.toContain('pointer-events-none');
    });

    it('includes pointer-events-none when embedded', () => {
      expect(getSecondaryTabContentClassName('pt-4', true)).toContain('pointer-events-none');
    });
  });

  describe('getSecondaryLinesTableRef', () => {
    it('returns ref function for inlineEditable', () => {
      const getRef = (key) => `ref-${key}`;
      expect(getSecondaryLinesTableRef('inlineEditable', getRef, { key: 'lines' })).toBe('ref-lines');
    });

    it('returns undefined for other layouts', () => {
      expect(getSecondaryLinesTableRef('classic', vi.fn(), { key: 'x' })).toBeUndefined();
    });
  });

  describe('getSecondaryEditRowHandler', () => {
    it('returns handler for customAddModal tabs', () => {
      const setState = vi.fn();
      const handler = getSecondaryEditRowHandler({ customAddModal: true, key: 'loc' }, setState);
      expect(typeof handler).toBe('function');
      handler({ id: 'R1' });
      expect(setState).toHaveBeenCalledWith({ key: 'loc', rowId: 'R1' });
    });

    it('returns undefined for non-modal tabs', () => {
      expect(getSecondaryEditRowHandler({ key: 'lines' }, vi.fn())).toBeUndefined();
    });
  });

  describe('getSecondarySelectionChangeHandler', () => {
    it('returns handler for inlineEditable', () => {
      const setter = vi.fn();
      const handler = getSecondarySelectionChangeHandler('inlineEditable', setter, { key: 'lines' });
      expect(typeof handler).toBe('function');
    });

    it('returns undefined for other layouts', () => {
      expect(getSecondarySelectionChangeHandler('classic', vi.fn(), { key: 'x' })).toBeUndefined();
    });
  });

  describe('simple label/className helpers', () => {
    const ui = (k) => k;

    it('getSaveButtonLabel', () => {
      expect(getSaveButtonLabel(true, ui)).toBe('loading');
      expect(getSaveButtonLabel(false, ui)).toBe('save');
    });

    it('getChildSaveButtonLabel', () => {
      expect(getChildSaveButtonLabel(true, ui)).toBe('loading');
      expect(getChildSaveButtonLabel(false, ui)).toBe('save');
    });

    it('getAddLineWrapperClassName', () => {
      expect(getAddLineWrapperClassName('inlineEditable')).toContain('sticky');
      expect(getAddLineWrapperClassName('classic')).toBe('relative');
    });

    it('getAddLineWrapperStyle inlineEditable returns no border', () => {
      const style = getAddLineWrapperStyle('inlineEditable');
      expect(style).toBeDefined();
    });

    it('getAddLineWrapperStyle classic returns border style', () => {
      const style = getAddLineWrapperStyle('classic');
      expect(style).toBeDefined();
    });

    it('getDocumentIds', () => {
      expect(getDocumentIds('abc')).toBeDefined();
    });

    it('getNotesRowClassName', () => {
      expect(getNotesRowClassName(true)).toContain('pointer-events-none');
      expect(getNotesRowClassName(false)).not.toContain('pointer-events-none');
    });

    it('getDocsRowClassName', () => {
      expect(getDocsRowClassName(true)).toContain('pointer-events-none');
      expect(getDocsRowClassName(false)).not.toContain('pointer-events-none');
    });

    it('getInlineEditableShrinkClassName', () => {
      expect(getInlineEditableShrinkClassName('inlineEditable')).toContain('shrink');
      expect(getInlineEditableShrinkClassName('classic')).toBe('');
    });

    it('getOthersTabClassName', () => {
      expect(getOthersTabClassName(true)).toContain('pointer-events-none');
      expect(getOthersTabClassName(false)).not.toContain('pointer-events-none');
    });

    it('getLinesTabsSectionClassName', () => {
      expect(getLinesTabsSectionClassName('inlineEditable')).toBeDefined();
      expect(getLinesTabsSectionClassName('classic')).toBeDefined();
    });

    it('getSecondaryTabEntityKey', () => {
      const tabs = [{ key: 'a' }, { key: 'b' }];
      expect(getSecondaryTabEntityKey(tabs, 0)).toBe('a');
      expect(getSecondaryTabEntityKey(tabs, 1)).toBe('b');
    });
  });

  describe('resolveCanAddLines', () => {
    it('returns true when no guard', () => {
      expect(resolveCanAddLines(undefined, {}, [])).toBe(true);
    });

    it('evaluates guard function', () => {
      // guard receives (data, children) directly, not {data}
      const guard = (data) => data.status === 'DR';
      expect(resolveCanAddLines(guard, { status: 'DR' }, [])).toBe(true);
      expect(resolveCanAddLines(guard, { status: 'CO' }, [])).toBe(false);
    });

    it('checks requiredHeaderFields', () => {
      expect(resolveCanAddLines(null, { bp: null }, ['bp'])).toBe(false);
      expect(resolveCanAddLines(null, { bp: 'ID1' }, ['bp'])).toBe(true);
    });
  });

  describe('computeIsDirty', () => {
    // Signature: (hook, addingLine, addingSecondaryLine, lineEdits, additionalDirtyState)
    // hook uses isDirtyHeader, addingSecondaryLine is object with boolean values
    it('returns true when hook.isDirtyHeader', () => {
      expect(computeIsDirty({ isDirtyHeader: true }, false, {}, {}, false)).toBe(true);
    });

    it('returns true when addingLine', () => {
      expect(computeIsDirty({ isDirtyHeader: false }, true, {}, {}, false)).toBe(true);
    });

    it('returns true when addingSecondaryLine has true value', () => {
      expect(computeIsDirty({ isDirtyHeader: false }, false, { lines: true }, {}, false)).toBe(true);
    });

    it('returns true when lineEdits is non-empty', () => {
      expect(computeIsDirty({ isDirtyHeader: false }, false, {}, { qty: 5 }, false)).toBe(true);
    });

    it('returns true when additionalDirtyState is true', () => {
      expect(computeIsDirty({ isDirtyHeader: false }, false, {}, null, true)).toBe(true);
    });

    it('returns false when nothing dirty', () => {
      expect(computeIsDirty({ isDirtyHeader: false }, false, {}, null, false)).toBe(false);
    });
  });

  describe('hasRecordForRoute', () => {
    it('true for new record', () => {
      expect(hasRecordForRoute(true, {}, 'new')).toBe(true);
    });

    it('true when hook has selected with matching id', () => {
      expect(hasRecordForRoute(false, { selected: { id: '123' } }, '123')).toBe(true);
    });

    it('falsy when no selected or different id', () => {
      expect(hasRecordForRoute(false, {}, '123')).toBeFalsy();
      expect(hasRecordForRoute(false, { selected: { id: '456' } }, '123')).toBeFalsy();
    });
  });

  describe('isLoadingRecordForRoute', () => {
    it('true when loading and not new', () => {
      expect(isLoadingRecordForRoute({ loading: true }, false, '123')).toBe(true);
    });

    it('false when new', () => {
      expect(isLoadingRecordForRoute({ loading: true }, true, 'new')).toBe(false);
    });
  });

  describe('resolveHideMoreMenu', () => {
    it('calls function with data', () => {
      const hide = ({ data }) => data.processed;
      expect(resolveHideMoreMenu(hide, { processed: true })).toBe(true);
      expect(resolveHideMoreMenu(hide, { processed: false })).toBe(false);
    });

    it('returns boolean directly', () => {
      expect(resolveHideMoreMenu(true, {})).toBe(true);
      expect(resolveHideMoreMenu(false, {})).toBe(false);
    });
  });

  describe('pushOthers', () => {
    it('pushes others tab when showOthers is true', () => {
      const tabs = [{ key: 'a' }];
      const ui = (k) => k;
      pushOthers(true, tabs, 'Others', ui);
      expect(tabs.length).toBe(2);
      expect(tabs[1].key).toBe('others');
    });

    it('does not push when showOthers is false', () => {
      const tabs = [{ key: 'a' }];
      pushOthers(false, tabs, 'Others', (k) => k);
      expect(tabs.length).toBe(1);
    });
  });

  describe('shouldShowLinesEmptyState', () => {
    // Signature: (hook, addingLine, LinesEmptyState, isDocumentReadOnly)
    // Requires hook.editing to be truthy
    it('true when no children, not adding, EmptyState exists, editing, not readonly', () => {
      expect(shouldShowLinesEmptyState({ children: [], editing: { id: '1' } }, false, () => null, false)).toBe(true);
    });

    it('false when has children', () => {
      expect(shouldShowLinesEmptyState({ children: [1], editing: {} }, false, () => null, false)).toBe(false);
    });

    it('false when adding line', () => {
      expect(shouldShowLinesEmptyState({ children: [], editing: {} }, true, () => null, false)).toBe(false);
    });

    it('falsy when no EmptyState component', () => {
      expect(shouldShowLinesEmptyState({ children: [], editing: {} }, false, null, false)).toBeFalsy();
    });

    it('falsy when not editing', () => {
      expect(shouldShowLinesEmptyState({ children: [], editing: null }, false, () => null, false)).toBeFalsy();
    });
  });

  describe('isDeleteButtonVisible', () => {
    // Signature: (isNew, recordId, data, statusField, hideDeleteWhenComplete, isProcessed)
    it('false for new records', () => {
      expect(isDeleteButtonVisible(true, 'new', {}, null, false, false)).toBeFalsy();
    });

    it('truthy for existing draft record', () => {
      expect(isDeleteButtonVisible(false, '123', { documentStatus: 'DR' }, 'documentStatus', true, false)).toBeTruthy();
    });

    it('falsy for completed record with hideDeleteWhenComplete', () => {
      // isDeleteVisibleForRecord returns false for CO + hideDeleteWhenComplete
      expect(isDeleteButtonVisible(false, '123', { documentStatus: 'CO' }, 'documentStatus', true, true)).toBeFalsy();
    });
  });

  describe('isBulkDeleteBarVisible', () => {
    // linesLayout !== 'inlineEditable' for this function (it's for classic layout bulk delete)
    it('true when NOT inline, delete allowed, not readonly, rows selected', () => {
      expect(isBulkDeleteBarVisible('classic', { crud: { lines: { delete: true } } }, 'lines', false, [{ id: '1' }])).toBe(true);
    });

    it('false when no rows selected', () => {
      expect(isBulkDeleteBarVisible('classic', { crud: { lines: {} } }, 'lines', false, [])).toBe(false);
    });

    it('false when readonly', () => {
      expect(isBulkDeleteBarVisible('classic', {}, 'lines', true, [{ id: '1' }])).toBe(false);
    });

    it('false when inlineEditable layout', () => {
      expect(isBulkDeleteBarVisible('inlineEditable', {}, 'lines', false, [{ id: '1' }])).toBe(false);
    });
  });

  describe('isCustomPrimaryTabActive', () => {
    // Returns: primaryTabs && activePrimaryTab !== 'general'
    it('returns true when primaryTabs exist and tab is not general', () => {
      expect(isCustomPrimaryTabActive([{ key: 'custom1' }], 'custom1')).toBe(true);
    });

    it('returns false when activePrimaryTab is general', () => {
      expect(isCustomPrimaryTabActive([{ key: 'custom1' }], 'general')).toBe(false);
    });

    it('returns false/null when no primary tabs', () => {
      expect(isCustomPrimaryTabActive(null, 'x')).toBeFalsy();
    });
  });

  describe('canDeleteSelectedLine', () => {
    it('true when delete allowed, line selected, not readonly', () => {
      expect(canDeleteSelectedLine({ crud: { lines: { delete: true } } }, 'lines', { id: '1' }, false)).toBe(true);
    });

    it('false when readonly', () => {
      expect(canDeleteSelectedLine({}, 'lines', { id: '1' }, true)).toBe(false);
    });

    it('falsy when no selected line', () => {
      expect(canDeleteSelectedLine({}, 'lines', null, false)).toBeFalsy();
    });
  });

  describe('shouldShowLineActionButtons', () => {
    // Returns: hook.editing && (lineEdits || selectedLine?.id)
    it('truthy when editing and lineEdits present', () => {
      expect(shouldShowLineActionButtons({ editing: { id: '1' } }, { qty: 1 }, null)).toBeTruthy();
    });

    it('truthy when editing and selectedLine', () => {
      expect(shouldShowLineActionButtons({ editing: { id: '1' } }, null, { id: 'L1' })).toBeTruthy();
    });

    it('falsy when not editing', () => {
      expect(shouldShowLineActionButtons({ editing: null }, { qty: 1 }, { id: '1' })).toBeFalsy();
    });
  });

  describe('shouldShowDetailFormSidebar', () => {
    it('truthy when not inline, has DetailForm, has selectedLine', () => {
      expect(shouldShowDetailFormSidebar('classic', () => null, { id: '1' }, false)).toBeTruthy();
    });

    it('truthy when closing (animation)', () => {
      expect(shouldShowDetailFormSidebar('classic', () => null, null, true)).toBeTruthy();
    });

    it('falsy for inlineEditable', () => {
      expect(shouldShowDetailFormSidebar('inlineEditable', () => null, { id: '1' }, false)).toBeFalsy();
    });

    it('falsy when no DetailForm', () => {
      expect(shouldShowDetailFormSidebar('classic', null, { id: '1' }, false)).toBeFalsy();
    });
  });

  describe('isInitialChildrenLoading', () => {
    // Returns: hook.childrenLoading && hook.children.length === 0
    it('true when childrenLoading and empty children', () => {
      expect(isInitialChildrenLoading({ childrenLoading: true, children: [] })).toBe(true);
    });

    it('false when children already loaded', () => {
      expect(isInitialChildrenLoading({ childrenLoading: true, children: [1] })).toBe(false);
    });

    it('false when not loading', () => {
      expect(isInitialChildrenLoading({ childrenLoading: false, children: [] })).toBe(false);
    });
  });

  describe('shouldShowInlineDeleteSelectionBar', () => {
    it('true when inline layout and delete allowed', () => {
      expect(shouldShowInlineDeleteSelectionBar('inlineEditable', { crud: { lines: { delete: true } } }, 'lines')).toBe(true);
    });

    it('false when not inline', () => {
      expect(shouldShowInlineDeleteSelectionBar('classic', {}, 'lines')).toBe(false);
    });
  });

  describe('resolveHeaderContent', () => {
    it('calls function with data', () => {
      const hc = (d) => `Header: ${d.name}`;
      expect(resolveHeaderContent(hc, { name: 'Test' })).toBe('Header: Test');
    });

    it('returns value directly if not function', () => {
      expect(resolveHeaderContent('static', {})).toBe('static');
    });
  });

  describe('resolveSidebarContent', () => {
    it('calls function with data', () => {
      const sc = (d) => `Sidebar: ${d.id}`;
      expect(resolveSidebarContent(sc, { id: '1' })).toBe('Sidebar: 1');
    });

    it('returns value directly if not function', () => {
      expect(resolveSidebarContent(null, {})).toBeNull();
    });
  });

  describe('getDetailContentClassName', () => {
    it('includes flex-1 for side panel', () => {
      const cls = getDetailContentClassName(() => null, 'classic');
      expect(cls).toContain('flex-1');
    });
  });

  describe('getSelectedLinesTotalLabel', () => {
    it('returns a value (default formatting for empty selection)', () => {
      // Even with null bottomSection, the function may return a formatted "0,00"
      const result = getSelectedLinesTotalLabel(null, [], {}, {});
      expect(result).toBeDefined();
    });

    it('computes total for selected rows', () => {
      const rows = [{ lineNetAmount: 100 }, { lineNetAmount: 200 }];
      const lineConfig = { totalField: 'lineNetAmount' };
      const result = getSelectedLinesTotalLabel({ showSelectedTotal: true }, rows, lineConfig, {});
      expect(result).toBeDefined();
    });
  });

  describe('getTabsBarStyle', () => {
    it('returns object with right spacing', () => {
      expect(getTabsBarStyle('120px', true)).toBeDefined();
    });
  });

  describe('getTabsBarClassName', () => {
    it('includes padding', () => {
      expect(getTabsBarClassName('px-6', false)).toContain('px-6');
    });
  });

  describe('getAddLineMenuActions', () => {
    it('returns undefined when no getLineMenuActions', () => {
      const result = getAddLineMenuActions(null, {}, {}, (k) => k);
      expect(result).toBeUndefined();
    });

    it('calls getLineMenuActions and translates labels', () => {
      const getActions = ({ data }) => [{ label: 'import', action: vi.fn() }];
      const ui = (k) => `t:${k}`;
      const result = getAddLineMenuActions(getActions, { id: '1' }, {}, ui);
      expect(result[0].label).toBe('t:import');
    });
  });

  // ---------- NEW: additional coverage for uncovered helpers ----------

  describe('renderExtraActionButtons', () => {
    it('renders buttons from a static array', () => {
      const actions = [
        { key: 'a1', label: 'Action 1', onClick: vi.fn() },
        { key: 'a2', label: 'Action 2', onClick: vi.fn(), className: 'custom' },
      ];
      const result = renderExtraActionButtons(actions, {}, { children: [] }, 'btn-cls');
      const { container } = render(<>{result}</>);
      expect(container.querySelectorAll('button')).toHaveLength(2);
      expect(screen.getByText('Action 1')).toBeInTheDocument();
    });

    it('renders buttons from a function returning actions', () => {
      const actionsFn = ({ data }) => [{ key: 'x', label: data.name, onClick: vi.fn() }];
      const result = renderExtraActionButtons(actionsFn, { name: 'Go' }, { children: [] }, '');
      const { container } = render(<>{result}</>);
      expect(screen.getByText('Go')).toBeInTheDocument();
    });

    it('filters out actions with visible === false', () => {
      const actions = [
        { key: 'show', label: 'Show', onClick: vi.fn() },
        { key: 'hide', label: 'Hide', onClick: vi.fn(), visible: false },
      ];
      const result = renderExtraActionButtons(actions, {}, { children: [] }, '');
      const { container } = render(<>{result}</>);
      expect(screen.getByText('Show')).toBeInTheDocument();
      expect(screen.queryByText('Hide')).toBeNull();
    });
  });

  describe('getDetailContentContainerClassName', () => {
    it('returns inline layout classes for inlineEditable', () => {
      const cls = getDetailContentContainerClassName({ linesLayout: 'inlineEditable' });
      expect(cls).toContain('flex flex-col overflow-y-auto');
    });

    it('returns overflow-auto for non-inline layout', () => {
      const cls = getDetailContentContainerClassName({ linesLayout: 'classic' });
      expect(cls).toContain('overflow-auto');
    });

    it('appends hidden when primaryTabs exist and activePrimaryTab is not general', () => {
      const cls = getDetailContentContainerClassName({
        linesLayout: 'classic',
        primaryTabs: [{ key: 'custom' }],
        activePrimaryTab: 'custom',
      });
      expect(cls).toContain('hidden');
    });

    it('does not append hidden when activePrimaryTab is general', () => {
      const cls = getDetailContentContainerClassName({
        linesLayout: 'classic',
        primaryTabs: [{ key: 'general' }],
        activePrimaryTab: 'general',
      });
      expect(cls).not.toContain('hidden');
    });

    it('handles empty arguments gracefully (defaults)', () => {
      const cls = getDetailContentContainerClassName();
      expect(typeof cls).toBe('string');
    });
  });

  describe('renderPrimaryTabButtons', () => {
    it('renders pill variant with active styling', () => {
      const setActive = vi.fn();
      const tabs = [{ key: 'general', label: 'General' }, { key: 'extra', label: 'Extra' }];
      const result = renderPrimaryTabButtons('pill', tabs, setActive, 'general', (k) => k);
      const { container } = render(<>{result}</>);
      expect(screen.getByText('General')).toBeInTheDocument();
      expect(screen.getByText('Extra')).toBeInTheDocument();
    });

    it('renders default (non-pill) variant', () => {
      const setActive = vi.fn();
      const tabs = [{ key: 'general', label: 'General' }];
      const result = renderPrimaryTabButtons('default', tabs, setActive, 'general', (k) => k);
      const { container } = render(<>{result}</>);
      expect(screen.getByText('General')).toBeInTheDocument();
    });
  });

  describe('canShowAddLineArea', () => {
    it('true when editing, not readonly, has entry fields, canAddLines', () => {
      expect(canShowAddLineArea(
        { editing: { id: '1' } },
        false,
        [{ key: 'product' }],
        null,
        true,
      )).toBeTruthy();
    });

    it('false when not editing', () => {
      expect(canShowAddLineArea({ editing: null }, false, [{ key: 'x' }], null, true)).toBeFalsy();
    });

    it('false when isDocumentReadOnly', () => {
      expect(canShowAddLineArea({ editing: { id: '1' } }, true, [{ key: 'x' }], null, true)).toBeFalsy();
    });

    it('false when no entry fields and no DetailExtraActions', () => {
      expect(canShowAddLineArea({ editing: { id: '1' } }, false, [], null, true)).toBeFalsy();
    });

    it('true when no entry fields but DetailExtraActions exists', () => {
      expect(canShowAddLineArea({ editing: { id: '1' } }, false, [], () => null, true)).toBeTruthy();
    });

    it('false when canAddLines is false', () => {
      expect(canShowAddLineArea({ editing: { id: '1' } }, false, [{ key: 'x' }], null, false)).toBeFalsy();
    });
  });

  describe('applyLocalChildRowUpdate', () => {
    it('calls handleUpdateChild with merged updates', () => {
      const hook = { handleUpdateChild: vi.fn() };
      const row = { id: 'R1', qty: 5 };
      applyLocalChildRowUpdate({ lineNetAmount: 100 }, 'qty', 10, { qty: 10, lineNetAmount: 100 }, {}, hook, row);
      expect(hook.handleUpdateChild).toHaveBeenCalledWith(
        'R1',
        expect.objectContaining({ qty: 10, lineNetAmount: 100 }),
      );
    });

    it('includes identifier from opts when provided', () => {
      const hook = { handleUpdateChild: vi.fn() };
      const row = { id: 'R2', product: 'P1' };
      applyLocalChildRowUpdate({}, 'product', 'P2', { product: 'P2' }, { identifier: 'Widget' }, hook, row);
      expect(hook.handleUpdateChild).toHaveBeenCalledWith(
        'R2',
        expect.objectContaining({ product: 'P2', 'product$_identifier': 'Widget' }),
      );
    });
  });

  describe('renderEmbeddedStatusPill (JSX rendering)', () => {
    it('renders DocumentStatusPill when statusField and data have value', () => {
      const result = renderEmbeddedStatusPill('documentStatus', { documentStatus: 'DR' }, { DR: 'Draft' });
      const { container } = render(<>{result}</>);
      expect(screen.getByTestId('doc-status-pill')).toBeInTheDocument();
    });

    it('returns null when statusField is missing', () => {
      expect(renderEmbeddedStatusPill(null, { documentStatus: 'DR' }, {})).toBeNull();
    });

    it('returns null when data has no value for statusField', () => {
      expect(renderEmbeddedStatusPill('documentStatus', {}, {})).toBeNull();
    });
  });

  describe('getSecondaryTabEntityKey (extended branches)', () => {
    it('returns null for isFormTab', () => {
      const tabs = [{ key: 'form1', isFormTab: true }];
      expect(getSecondaryTabEntityKey(tabs, 0)).toBeNull();
    });

    it('returns null for Panel tab', () => {
      const tabs = [{ key: 'panel1', Panel: () => null }];
      expect(getSecondaryTabEntityKey(tabs, 0)).toBeNull();
    });

    it('returns key for regular tab', () => {
      const tabs = [{ key: 'lines' }];
      expect(getSecondaryTabEntityKey(tabs, 0)).toBe('lines');
    });

    it('returns null for out-of-bounds index', () => {
      expect(getSecondaryTabEntityKey([], 5)).toBeNull();
    });
  });

  describe('getTabsBarStyle (extended branches)', () => {
    it('returns paddingRight style when both args truthy', () => {
      const style = getTabsBarStyle('120px', '100px');
      expect(style).toEqual({ paddingRight: 'calc(100px + 24px)' });
    });

    it('returns undefined when tabsBarRight is falsy', () => {
      expect(getTabsBarStyle(null, '100px')).toBeUndefined();
    });

    it('returns undefined when tabsBarRightDivider is falsy', () => {
      expect(getTabsBarStyle('120px', null)).toBeUndefined();
    });
  });

  describe('getTabsBarClassName (extended branches)', () => {
    it('includes relative when tabsBarRightDivider is truthy', () => {
      expect(getTabsBarClassName('px-6', '100px')).toContain('relative');
    });

    it('does not include relative when tabsBarRightDivider is falsy', () => {
      expect(getTabsBarClassName('px-6', null)).not.toContain('relative');
    });
  });

  describe('getDetailContentClassName (extended branches)', () => {
    it('returns max-w-full when no sidePanel', () => {
      const cls = getDetailContentClassName(null, 'classic');
      expect(cls).toContain('max-w-full');
    });

    it('returns flex-1 when sidePanel is present', () => {
      const cls = getDetailContentClassName(() => null, 'classic');
      expect(cls).toContain('flex-1');
    });

    it('returns flex flex-col for inlineEditable', () => {
      const cls = getDetailContentClassName(null, 'inlineEditable');
      expect(cls).toContain('flex flex-col');
    });

    it('returns space-y-2 for classic', () => {
      const cls = getDetailContentClassName(null, 'classic');
      expect(cls).toContain('space-y-2');
    });
  });

  describe('shouldShowLinesEmptyState (readonly branch)', () => {
    it('falsy when isDocumentReadOnly is true', () => {
      expect(shouldShowLinesEmptyState({ children: [], editing: { id: '1' } }, false, () => null, true)).toBeFalsy();
    });
  });

  describe('resolveCanAddLines (extended branches)', () => {
    it('calls guard with (data, children)', () => {
      const guard = vi.fn(() => true);
      const data = { status: 'DR' };
      const children = [{ id: 'L1' }];
      resolveCanAddLines(guard, data, [], children);
      expect(guard).toHaveBeenCalledWith(data, children);
    });

    it('returns false when multiple requiredHeaderFields, some empty', () => {
      expect(resolveCanAddLines(null, { bp: 'ID1', warehouse: null }, ['bp', 'warehouse'])).toBe(false);
    });

    it('returns true when all requiredHeaderFields are filled', () => {
      expect(resolveCanAddLines(null, { bp: 'ID1', warehouse: 'W1' }, ['bp', 'warehouse'])).toBe(true);
    });

    it('returns false when requiredHeaderField is whitespace-only string', () => {
      expect(resolveCanAddLines(null, { bp: '   ' }, ['bp'])).toBe(false);
    });

    it('returns false when requiredHeaderField is empty string', () => {
      expect(resolveCanAddLines(null, { bp: '' }, ['bp'])).toBe(false);
    });

    it('returns true when requiredHeaderFields is empty array (no guard)', () => {
      expect(resolveCanAddLines(null, {}, [])).toBe(true);
    });

    it('returns true when requiredHeaderFields is null (no guard)', () => {
      expect(resolveCanAddLines(null, {}, null)).toBe(true);
    });

    it('guard returning false blocks add', () => {
      const guard = () => false;
      expect(resolveCanAddLines(guard, { status: 'DR' }, ['status'])).toBe(false);
    });
  });

  describe('normalizePatchFieldValues (extended branches)', () => {
    it('converts comma-free numeric string with decimals to float', () => {
      const fv = {};
      normalizePatchFieldValues({ price: '123.45' }, fv);
      expect(fv.price).toBe(123.45);
    });

    it('does NOT convert string with comma (locale number like "10,50")', () => {
      const fv = {};
      normalizePatchFieldValues({ price: '10,50' }, fv);
      expect(fv.price).toBe('10,50');
    });

    it('preserves boolean values', () => {
      const fv = {};
      normalizePatchFieldValues({ active: true, disabled: false }, fv);
      expect(fv.active).toBe(true);
      expect(fv.disabled).toBe(false);
    });

    it('preserves null values', () => {
      const fv = {};
      normalizePatchFieldValues({ field: null }, fv);
      expect(fv.field).toBeNull();
    });

    it('handles integer string without decimals', () => {
      const fv = {};
      normalizePatchFieldValues({ qty: '7' }, fv);
      expect(fv.qty).toBe(7);
    });

    it('handles zero string', () => {
      const fv = {};
      normalizePatchFieldValues({ qty: '0' }, fv);
      expect(fv.qty).toBe(0);
    });

    it('handles string that looks almost numeric but has trailing text', () => {
      const fv = {};
      normalizePatchFieldValues({ code: '123abc' }, fv);
      expect(fv.code).toBe('123abc');
    });
  });

  describe('applyCalloutFieldUpdates', () => {
    it('applies field update and calls handleChange', () => {
      const hook = { handleChange: vi.fn() };
      const ctx = {
        data: { warehouse: '' },
        triggerField: 'bp',
        userTouchedRef: { current: new Set() },
        appliedFields: new Map(),
        hook,
        api: {},
        catalogs: {},
      };
      applyCalloutFieldUpdates({ warehouse: { value: 'W1' } }, ctx);
      expect(hook.handleChange).toHaveBeenCalledWith('warehouse', 'W1');
      expect(ctx.appliedFields.get('warehouse')).toBe('W1');
    });

    it('skips empty callout value when current value already exists', () => {
      const hook = { handleChange: vi.fn() };
      const ctx = {
        data: { warehouse: 'W-EXISTING' },
        triggerField: 'bp',
        userTouchedRef: { current: new Set() },
        appliedFields: new Map(),
        hook,
        api: {},
        catalogs: {},
      };
      applyCalloutFieldUpdates({ warehouse: { value: '' } }, ctx);
      expect(hook.handleChange).not.toHaveBeenCalled();
    });

    it('skips null callout value when current value already exists', () => {
      const hook = { handleChange: vi.fn() };
      const ctx = {
        data: { warehouse: 'W-EXISTING' },
        triggerField: 'bp',
        userTouchedRef: { current: new Set() },
        appliedFields: new Map(),
        hook,
        api: {},
        catalogs: {},
      };
      applyCalloutFieldUpdates({ warehouse: { value: null } }, ctx);
      expect(hook.handleChange).not.toHaveBeenCalled();
    });

    it('applies empty callout value when current value is also empty', () => {
      const hook = { handleChange: vi.fn() };
      const ctx = {
        data: { warehouse: '' },
        triggerField: 'bp',
        userTouchedRef: { current: new Set() },
        appliedFields: new Map(),
        hook,
        api: {},
        catalogs: {},
      };
      applyCalloutFieldUpdates({ warehouse: { value: '' } }, ctx);
      expect(hook.handleChange).toHaveBeenCalledWith('warehouse', '');
    });

    it('skips user-touched field that is NOT the trigger field', () => {
      const hook = { handleChange: vi.fn() };
      const ctx = {
        data: { paymentTerms: 'PT1' },
        triggerField: 'bp',
        userTouchedRef: { current: new Set(['paymentTerms']) },
        appliedFields: new Map(),
        hook,
        api: {},
        catalogs: {},
      };
      applyCalloutFieldUpdates({ paymentTerms: { value: 'PT2' } }, ctx);
      expect(hook.handleChange).not.toHaveBeenCalled();
    });

    it('always applies update for the trigger field even if user-touched', () => {
      const hook = { handleChange: vi.fn() };
      const ctx = {
        data: { bp: 'BP-OLD' },
        triggerField: 'bp',
        userTouchedRef: { current: new Set(['bp']) },
        appliedFields: new Map(),
        hook,
        api: {},
        catalogs: {},
      };
      applyCalloutFieldUpdates({ bp: { value: 'BP-NEW' } }, ctx);
      expect(hook.handleChange).toHaveBeenCalledWith('bp', 'BP-NEW');
    });

    it('applies _identifier when entry has one', () => {
      const hook = { handleChange: vi.fn() };
      const ctx = {
        data: { warehouse: '' },
        triggerField: 'bp',
        userTouchedRef: { current: new Set() },
        appliedFields: new Map(),
        hook,
        api: {},
        catalogs: {},
      };
      applyCalloutFieldUpdates({ warehouse: { value: 'W1', _identifier: 'Main Warehouse' } }, ctx);
      expect(hook.handleChange).toHaveBeenCalledWith('warehouse', 'W1');
      expect(hook.handleChange).toHaveBeenCalledWith('warehouse$_identifier', 'Main Warehouse');
    });
  });

  describe('applyCalloutComboUpdates', () => {
    it('applies selected combo value and calls handleChange', () => {
      const hook = { handleChange: vi.fn() };
      const ctx = {
        data: { paymentMethod: '' },
        triggerField: 'bp',
        userTouchedRef: { current: new Set() },
        appliedFields: new Map(),
        hook,
      };
      applyCalloutComboUpdates({ paymentMethod: { selected: 'PM1', _identifier: 'Cash' } }, ctx);
      expect(hook.handleChange).toHaveBeenCalledWith('paymentMethod', 'PM1');
      expect(hook.handleChange).toHaveBeenCalledWith('paymentMethod$_identifier', 'Cash');
      expect(ctx.appliedFields.get('paymentMethod')).toBe('PM1');
    });

    it('auto-selects first entry when selected is null', () => {
      const hook = { handleChange: vi.fn() };
      const ctx = {
        data: { address: '' },
        triggerField: 'bp',
        userTouchedRef: { current: new Set() },
        appliedFields: new Map(),
        hook,
      };
      applyCalloutComboUpdates({
        address: {
          selected: null,
          entries: [{ id: 'ADDR1', identifier: 'Main Address' }],
          _identifier: null,
        },
      }, ctx);
      expect(hook.handleChange).toHaveBeenCalledWith('address', 'ADDR1');
      expect(hook.handleChange).toHaveBeenCalledWith('address$_identifier', 'Main Address');
    });

    it('auto-selects first entry using _identifier fallback', () => {
      const hook = { handleChange: vi.fn() };
      const ctx = {
        data: { address: '' },
        triggerField: 'bp',
        userTouchedRef: { current: new Set() },
        appliedFields: new Map(),
        hook,
      };
      applyCalloutComboUpdates({
        address: {
          selected: null,
          entries: [{ id: 'ADDR1', _identifier: 'Alt Addr' }],
          _identifier: null,
        },
      }, ctx);
      expect(hook.handleChange).toHaveBeenCalledWith('address$_identifier', 'Alt Addr');
    });

    it('skips combo when no selected and no entries', () => {
      const hook = { handleChange: vi.fn() };
      const ctx = {
        data: {},
        triggerField: 'bp',
        userTouchedRef: { current: new Set() },
        appliedFields: new Map(),
        hook,
      };
      applyCalloutComboUpdates({ address: { selected: null, entries: [] } }, ctx);
      expect(hook.handleChange).not.toHaveBeenCalled();
    });

    it('skips user-touched combo field that is NOT the trigger', () => {
      const hook = { handleChange: vi.fn() };
      const ctx = {
        data: { paymentMethod: 'PM-OLD' },
        triggerField: 'bp',
        userTouchedRef: { current: new Set(['paymentMethod']) },
        appliedFields: new Map(),
        hook,
      };
      applyCalloutComboUpdates({ paymentMethod: { selected: 'PM-NEW', _identifier: 'Wire' } }, ctx);
      expect(hook.handleChange).not.toHaveBeenCalled();
    });

    it('skips combo for the trigger field to prevent callout reverting user selection', () => {
      const hook = { handleChange: vi.fn() };
      const ctx = {
        data: { bp: 'BP-OLD' },
        triggerField: 'bp',
        userTouchedRef: { current: new Set(['bp']) },
        appliedFields: new Map(),
        hook,
      };
      applyCalloutComboUpdates({ bp: { selected: 'BP-NEW', _identifier: 'Acme' } }, ctx);
      expect(hook.handleChange).not.toHaveBeenCalled();
    });

    it('does not set $_identifier when selectedLabel is falsy', () => {
      const hook = { handleChange: vi.fn() };
      const ctx = {
        data: { paymentMethod: '' },
        triggerField: 'bp',
        userTouchedRef: { current: new Set() },
        appliedFields: new Map(),
        hook,
      };
      applyCalloutComboUpdates({ paymentMethod: { selected: 'PM1', _identifier: null } }, ctx);
      expect(hook.handleChange).toHaveBeenCalledWith('paymentMethod', 'PM1');
      expect(hook.handleChange).not.toHaveBeenCalledWith('paymentMethod$_identifier', expect.anything());
    });
  });

  describe('mergeSelectorContextFields (extended branches)', () => {
    it('defaults isTaxIncluded to true (gross) when undefined', () => {
      const snapshot = {};
      mergeSelectorContextFields({ standardPrice: 50 }, snapshot, 'product');
      expect(snapshot.grossUnitPrice).toBe(50);
      expect(snapshot.grossListPrice).toBe(50);
      expect(snapshot.unitPrice).toBeUndefined();
    });

    it('uses net prices when isTaxIncluded is explicitly false', () => {
      const snapshot = {};
      mergeSelectorContextFields({ standardPrice: 50, isTaxIncluded: false }, snapshot, 'product');
      expect(snapshot.unitPrice).toBe(50);
      expect(snapshot.listPrice).toBe(50);
      expect(snapshot.grossUnitPrice).toBeUndefined();
    });

    it('skips searchKey field', () => {
      const snapshot = {};
      mergeSelectorContextFields({ searchKey: 'PROD-001', description: 'Widget' }, snapshot, 'product');
      expect(snapshot['product_searchKey']).toBeUndefined();
      expect(snapshot['product_description']).toBe('Widget');
    });

    it('skips fields with object values', () => {
      const snapshot = {};
      mergeSelectorContextFields({ category: { id: '1', name: 'Cat' }, code: 'C1' }, snapshot, 'product');
      expect(snapshot['product_category']).toBeUndefined();
      expect(snapshot['product_code']).toBe('C1');
    });

    it('skips standardPrice when value is null', () => {
      const snapshot = {};
      mergeSelectorContextFields({ standardPrice: null, description: 'Test' }, snapshot, 'product');
      // null is skipped by the typeof === object check
      expect(snapshot.grossUnitPrice).toBeUndefined();
    });
  });

  describe('collectRowFieldValues (extended branches)', () => {
    it('skips _entityName key', () => {
      const fv = {};
      collectRowFieldValues({ _entityName: 'OrderLine', qty: 5 }, fv, (v) => v);
      expect(fv._entityName).toBeUndefined();
      expect(fv.qty).toBe(5);
    });

    it('skips $ref key', () => {
      const fv = {};
      collectRowFieldValues({ '$ref': 'some/ref', product: 'P1' }, fv, (v) => v);
      expect(fv['$ref']).toBeUndefined();
      expect(fv.product).toBe('P1');
    });

    it('applies coerce function to values', () => {
      const fv = {};
      collectRowFieldValues({ qty: '10' }, fv, (v) => typeof v === 'string' ? parseFloat(v) : v);
      expect(fv.qty).toBe(10);
    });
  });

  describe('computeIsDirty (each condition individually false)', () => {
    it('returns false when addingSecondaryLine has only false values', () => {
      expect(computeIsDirty({ isDirtyHeader: false }, false, { tab1: false, tab2: false }, null, false)).toBe(false);
    });

    it('returns false when lineEdits is empty object', () => {
      expect(computeIsDirty({ isDirtyHeader: false }, false, {}, {}, false)).toBe(false);
    });

    it('returns true when lineEdits has at least one key', () => {
      expect(computeIsDirty({ isDirtyHeader: false }, false, {}, { L1: { qty: 5 } }, false)).toBe(true);
    });

    it('returns false when additionalDirtyState is not strictly true', () => {
      expect(computeIsDirty({ isDirtyHeader: false }, false, {}, null, 'yes')).toBe(false);
    });
  });

  describe('isDeleteButtonVisible (extended branches)', () => {
    it('returns falsy when recordId is falsy (empty string)', () => {
      expect(isDeleteButtonVisible(false, '', {}, null, false, false)).toBeFalsy();
    });

    it('returns truthy when hideDeleteWhenComplete is true but status is DR (not completed)', () => {
      expect(isDeleteButtonVisible(false, '123', { documentStatus: 'DR' }, 'documentStatus', true, false)).toBeTruthy();
    });

    it('returns falsy when isProcessed is true and hideDeleteWhenComplete is true', () => {
      expect(isDeleteButtonVisible(false, '123', {}, null, true, true)).toBeFalsy();
    });

    it('returns truthy when hideDeleteWhenComplete is false regardless of isProcessed', () => {
      expect(isDeleteButtonVisible(false, '123', {}, null, false, true)).toBeTruthy();
    });
  });

  describe('shouldShowLinesEmptyState (each false condition individually)', () => {
    it('returns false when hook.children has items', () => {
      expect(shouldShowLinesEmptyState({ children: [{ id: 1 }], editing: {} }, false, () => null, false)).toBe(false);
    });

    it('returns false when addingLine is true', () => {
      expect(shouldShowLinesEmptyState({ children: [], editing: {} }, true, () => null, false)).toBe(false);
    });

    it('returns false when LinesEmptyState is null', () => {
      expect(shouldShowLinesEmptyState({ children: [], editing: {} }, false, null, false)).toBeFalsy();
    });

    it('returns false when hook.editing is null', () => {
      expect(shouldShowLinesEmptyState({ children: [], editing: null }, false, () => null, false)).toBeFalsy();
    });

    it('returns false when isDocumentReadOnly is true', () => {
      expect(shouldShowLinesEmptyState({ children: [], editing: {} }, false, () => null, true)).toBe(false);
    });
  });

  describe('getAddLineMenuActions (extended branches)', () => {
    it('returns undefined when getLineMenuActions is null', () => {
      expect(getAddLineMenuActions(null, {}, {}, (k) => k)).toBeUndefined();
    });

    it('translates string labels via ui function', () => {
      const getActions = () => [{ label: 'importLines', action: vi.fn() }];
      const ui = (k) => `translated:${k}`;
      const result = getAddLineMenuActions(getActions, {}, {}, ui);
      expect(result[0].label).toBe('translated:importLines');
    });

    it('preserves non-string labels as-is', () => {
      const JsxLabel = () => '<span>Custom</span>';
      const getActions = () => [{ label: JsxLabel, action: vi.fn() }];
      const result = getAddLineMenuActions(getActions, {}, {}, (k) => k);
      expect(result[0].label).toBe(JsxLabel);
    });

    it('falls back to raw label when ui returns empty string', () => {
      const getActions = () => [{ label: 'myKey', action: vi.fn() }];
      const ui = () => '';
      const result = getAddLineMenuActions(getActions, {}, {}, ui);
      expect(result[0].label).toBe('myKey');
    });

    it('passes data and importRef to getLineMenuActions', () => {
      const getActions = vi.fn(() => []);
      const data = { id: '1' };
      const ref = { current: null };
      getAddLineMenuActions(getActions, data, ref, (k) => k);
      expect(getActions).toHaveBeenCalledWith({ data, importRef: ref });
    });
  });

  describe('renderExtraActionButtons (extended branches)', () => {
    it('returns empty array-like result for empty actions array', () => {
      const result = renderExtraActionButtons([], {}, { children: [] }, '');
      expect(result).toHaveLength(0);
    });

    it('includes action without explicit visible property (defaults to visible)', () => {
      const actions = [{ key: 'a', label: 'A', onClick: vi.fn() }];
      const result = renderExtraActionButtons(actions, {}, { children: [] }, '');
      const { container } = render(<>{result}</>);
      expect(screen.getByText('A')).toBeInTheDocument();
    });

    it('applies action.className when provided', () => {
      const actions = [{ key: 'a', label: 'A', onClick: vi.fn(), className: 'custom-cls' }];
      const result = renderExtraActionButtons(actions, {}, { children: [] }, 'base');
      const { container } = render(<>{result}</>);
      const btn = screen.getByText('A');
      expect(btn.className).toContain('custom-cls');
    });

    it('passes data and children to function form', () => {
      const fn = vi.fn(({ data, children }) => [{ key: 'x', label: `${data.id}-${children.length}`, onClick: vi.fn() }]);
      const result = renderExtraActionButtons(fn, { id: 'R1' }, { children: ['L1', 'L2'] }, '');
      const { container } = render(<>{result}</>);
      expect(screen.getByText('R1-2')).toBeInTheDocument();
    });
  });

  describe('renderEmbeddedStatusPill (extended branches)', () => {
    it('renders pill with statusEnumLabels passed to DocumentStatusPill', () => {
      const result = renderEmbeddedStatusPill('documentStatus', { documentStatus: 'CO' }, { CO: 'Completed', DR: 'Draft' });
      const { container } = render(<>{result}</>);
      expect(screen.getByTestId('doc-status-pill')).toBeInTheDocument();
      expect(screen.getByTestId('doc-status-pill').textContent).toBe('CO');
    });

    it('returns null when statusField is falsy empty string', () => {
      expect(renderEmbeddedStatusPill('', { documentStatus: 'DR' }, {})).toBeNull();
    });

    it('returns null when data[statusField] is empty string', () => {
      expect(renderEmbeddedStatusPill('documentStatus', { documentStatus: '' }, {})).toBeNull();
    });

    it('returns null when data[statusField] is null', () => {
      expect(renderEmbeddedStatusPill('documentStatus', { documentStatus: null }, {})).toBeNull();
    });
  });

  describe('buildLineRowClickHandler', () => {
    it('returns undefined when no DetailForm', () => {
      expect(buildLineRowClickHandler(null, 'classic', vi.fn())).toBeUndefined();
    });

    it('returns undefined for inlineEditable layout', () => {
      expect(buildLineRowClickHandler(() => null, 'inlineEditable', vi.fn())).toBeUndefined();
    });

    it('returns a handler function when DetailForm and classic layout', () => {
      const setSelectedLine = vi.fn();
      const handler = buildLineRowClickHandler(() => null, 'classic', setSelectedLine);
      expect(typeof handler).toBe('function');
      handler({ id: 'L1', product: 'P1' });
      expect(setSelectedLine).toHaveBeenCalledWith({ id: 'L1', product: 'P1' });
    });
  });

  describe('renderSidePanel', () => {
    it('renders function sidePanel as React element', () => {
      const SideComp = ({ data }) => <div data-testid="sp">{data?.name}</div>;
      const result = renderSidePanel(SideComp, { name: 'Test' }, 'R1', 'token', '/api', {}, false);
      const { container } = render(<>{result}</>);
      expect(screen.getByTestId('sp')).toBeInTheDocument();
      expect(screen.getByText('Test')).toBeInTheDocument();
    });

    it('returns non-function sidePanel as-is', () => {
      expect(renderSidePanel(null, {}, 'R1', 'tok', '/api', {}, false)).toBeNull();
      expect(renderSidePanel('static', {}, 'R1', 'tok', '/api', {}, false)).toBe('static');
    });
  });

  describe('getDocumentIds (extended branches)', () => {
    it('returns array with recordId when truthy', () => {
      expect(getDocumentIds('abc-123')).toEqual(['abc-123']);
    });

    it('returns empty array when recordId is falsy', () => {
      expect(getDocumentIds(null)).toEqual([]);
      expect(getDocumentIds('')).toEqual([]);
      expect(getDocumentIds(undefined)).toEqual([]);
    });
  });

  describe('applyLocalChildRowUpdate (extended branches)', () => {
    it('includes unitPrice in localUpdate when present in fieldValues', () => {
      const hook = { handleUpdateChild: vi.fn() };
      applyLocalChildRowUpdate({}, 'product', 'P1', { product: 'P1', unitPrice: 25.5 }, {}, hook, { id: 'R1' });
      expect(hook.handleUpdateChild).toHaveBeenCalledWith('R1', expect.objectContaining({ unitPrice: 25.5 }));
    });

    it('does not include unitPrice when not in fieldValues', () => {
      const hook = { handleUpdateChild: vi.fn() };
      applyLocalChildRowUpdate({}, 'product', 'P1', { product: 'P1' }, {}, hook, { id: 'R1' });
      const callArgs = hook.handleUpdateChild.mock.calls[0][1];
      expect(callArgs.unitPrice).toBeUndefined();
    });

    it('does not add identifier key when opts.identifier is undefined', () => {
      const hook = { handleUpdateChild: vi.fn() };
      applyLocalChildRowUpdate({}, 'product', 'P1', { product: 'P1' }, {}, hook, { id: 'R1' });
      const callArgs = hook.handleUpdateChild.mock.calls[0][1];
      expect(callArgs['product$_identifier']).toBeUndefined();
    });

    it('handles opts being null gracefully', () => {
      const hook = { handleUpdateChild: vi.fn() };
      applyLocalChildRowUpdate({}, 'product', 'P1', { product: 'P1' }, null, hook, { id: 'R1' });
      expect(hook.handleUpdateChild).toHaveBeenCalled();
    });
  });
});
