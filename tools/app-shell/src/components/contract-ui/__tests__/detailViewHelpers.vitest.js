// Direct unit tests for the helper module extracted from DetailView (ETP-4730).
//
// The pre-existing DetailView.*Helpers suites reach these same functions through
// DetailView.jsx, which re-exports them so that extraction did not have to touch
// any test. This suite deliberately imports ONLY detailViewHelpers.jsx: pulling
// DetailView.jsx in here would put it back into this file's dependency closure,
// which is exactly the coupling ETP-4730 set out to remove.

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (data, field) => (field ? data?.[field] : undefined),
}));

import {
  evalDisplayLogicRaw,
  deriveTaxRateFromGross,
  normalizePatchFieldValues,
  collectRowFieldValues,
  resolveCanAddLines,
  parseBackendErrorMessage,
  getDocumentIds,
  resolveSidebarContent,
  getWindowTitle,
  getRecordTitle,
  getFullBreadcrumb,
  getOnAddToFavorites,
  getSaveButtonLabel,
  getChildSaveButtonLabel,
  getAddLineWrapperClassName,
  getSecondaryTabContentClassName,
  getSecondaryLinesTableRef,
  getSecondaryEditRowHandler,
  getLinesToolbarClassName,
  getLineMenuActionsRef,
  getAddLineMenuActions,
  getSidebarSlideClassName,
  getNotesRowClassName,
  getDocsRowClassName,
  getOthersTabClassName,
  getCustomLinesTabClassName,
  getInlineEditableShrinkClassName,
  sidePanelWrapperCls,
  runAddLineAction,
  buildInitialTabs,
} from '../detailViewHelpers.jsx';

describe('evalDisplayLogicRaw', () => {
  it('defaults to visible when there is no expression or no parseable clause', () => {
    expect(evalDisplayLogicRaw('', {})).toBe(true);
    expect(evalDisplayLogicRaw(null, {})).toBe(true);
    expect(evalDisplayLogicRaw('nothing to parse here', { a: 1 })).toBe(true);
  });

  it('lowercases the first letter of the field reference to match the API key', () => {
    expect(evalDisplayLogicRaw("@DocStatus@='CO'", { docStatus: 'CO' })).toBe(true);
    expect(evalDisplayLogicRaw("@DocStatus@='CO'", { docStatus: 'DR' })).toBe(false);
  });

  it('defaults to visible when the referenced field is absent from the record', () => {
    expect(evalDisplayLogicRaw("@DocStatus@='CO'", {})).toBe(true);
  });

  it('normalizes booleans to Etendo Y/N before comparing', () => {
    expect(evalDisplayLogicRaw("@Processed@='Y'", { processed: true })).toBe(true);
    expect(evalDisplayLogicRaw("@Processed@='Y'", { processed: false })).toBe(false);
    expect(evalDisplayLogicRaw("@Processed@='N'", { processed: false })).toBe(true);
  });

  it('supports the != operator', () => {
    expect(evalDisplayLogicRaw("@DocStatus@!='CO'", { docStatus: 'DR' })).toBe(true);
    expect(evalDisplayLogicRaw("@DocStatus@!='CO'", { docStatus: 'CO' })).toBe(false);
  });

  it('requires every clause to hold', () => {
    const expr = "@DocStatus@='CO' & @Processed@='Y'";
    expect(evalDisplayLogicRaw(expr, { docStatus: 'CO', processed: true })).toBe(true);
    expect(evalDisplayLogicRaw(expr, { docStatus: 'CO', processed: false })).toBe(false);
  });
});

describe('deriveTaxRateFromGross', () => {
  const cfg = { qtyField: 'qty', priceField: 'price', discountField: 'discount' };

  it('returns null for a non-positive gross', () => {
    expect(deriveTaxRateFromGross(0, cfg, { lineNetAmount: '100' })).toBeNull();
    expect(deriveTaxRateFromGross(-5, cfg, { lineNetAmount: '100' })).toBeNull();
  });

  it('derives the rate from lineNetAmount when present', () => {
    expect(deriveTaxRateFromGross(121, cfg, { lineNetAmount: '100' })).toBeCloseTo(21, 6);
  });

  it('adjusts the taxable base by the discount, since LINENETAMT is pre-discount', () => {
    // net 100 with a 10% discount => taxable base 90 => 121/90 - 1
    expect(deriveTaxRateFromGross(121, cfg, { lineNetAmount: '100', discount: '10' }))
      .toBeCloseTo(34.4444, 3);
  });

  it('falls back to qty x price when there is no lineNetAmount', () => {
    expect(deriveTaxRateFromGross(121, cfg, { qty: '2', price: '50' })).toBeCloseTo(21, 6);
  });

  it('returns null when neither path yields a positive base', () => {
    expect(deriveTaxRateFromGross(121, cfg, { qty: '0', price: '0' })).toBeNull();
  });
});

describe('normalizePatchFieldValues', () => {
  it('skips $_identifier companions', () => {
    const out = {};
    normalizePatchFieldValues({ 'businessPartner$_identifier': 'ACME' }, out);
    expect(out).toEqual({});
  });

  it('converts plain numeric strings to numbers for BigDecimal compatibility', () => {
    const out = {};
    normalizePatchFieldValues({ qty: '10', rate: '-3.5' }, out);
    expect(out).toEqual({ qty: 10, rate: -3.5 });
  });

  it('leaves comma decimals as strings so a Spanish 10,50 is not corrupted', () => {
    const out = {};
    normalizePatchFieldValues({ amount: '10,50' }, out);
    expect(out).toEqual({ amount: '10,50' });
  });

  it('passes non-string values through untouched', () => {
    const out = {};
    normalizePatchFieldValues({ flag: true, n: 7, nil: null }, out);
    expect(out).toEqual({ flag: true, n: 7, nil: null });
  });
});

describe('collectRowFieldValues', () => {
  it('drops identifiers, internal markers and the id, and coerces the rest', () => {
    const out = {};
    collectRowFieldValues(
      {
        id: 'row-1',
        _identifier: 'ACME',
        _entityName: 'OrderLine',
        $ref: 'x',
        'product$_identifier': 'Widget',
        qty: '2',
      },
      out,
      (v) => `<${v}>`,
    );
    expect(out).toEqual({ qty: '<2>' });
  });
});

describe('resolveCanAddLines', () => {
  it('delegates to the guard when one is supplied', () => {
    const guard = vi.fn(() => false);
    expect(resolveCanAddLines(guard, { a: 1 }, ['a'], ['child'])).toBe(false);
    expect(guard).toHaveBeenCalledWith({ a: 1 }, ['child']);
  });

  it('requires every required header field to be filled', () => {
    expect(resolveCanAddLines(null, { a: 'x', b: 1 }, ['a', 'b'])).toBe(true);
    expect(resolveCanAddLines(null, { a: 'x' }, ['a', 'b'])).toBe(false);
    expect(resolveCanAddLines(null, { a: '' }, ['a'])).toBe(false);
    expect(resolveCanAddLines(null, { a: '   ' }, ['a'])).toBe(false);
  });

  it('allows adding lines when nothing is configured', () => {
    expect(resolveCanAddLines(null, {}, [])).toBe(true);
    expect(resolveCanAddLines(null, {}, undefined)).toBe(true);
  });
});

describe('parseBackendErrorMessage', () => {
  const res = (body) => ({ json: async () => body });

  it('reads the NEO Headless envelope', async () => {
    await expect(parseBackendErrorMessage(res({ error: { message: 'neo boom' } })))
      .resolves.toBe('neo boom');
  });

  it('reads the Etendo JsonDataService envelope, object or string', async () => {
    await expect(parseBackendErrorMessage(res({ response: { error: { message: 'obj boom' } } })))
      .resolves.toBe('obj boom');
    await expect(parseBackendErrorMessage(res({ response: { error: 'str boom' } })))
      .resolves.toBe('str boom');
  });

  it('falls back to a top-level message', async () => {
    await expect(parseBackendErrorMessage(res({ message: 'plain boom' })))
      .resolves.toBe('plain boom');
  });

  it('returns undefined for a non-JSON body instead of throwing', async () => {
    const bad = { json: async () => { throw new Error('not json'); } };
    await expect(parseBackendErrorMessage(bad)).resolves.toBeUndefined();
  });
});

describe('title and breadcrumb helpers', () => {
  const tMenu = (s) => s;

  it('takes the window title from the last breadcrumb segment', () => {
    expect(getWindowTitle('Sales / Sales Order', tMenu, 'sales-order')).toBe('Sales Order');
  });

  it('falls back to the raw segment when the translation is empty', () => {
    expect(getWindowTitle('Sales / Sales Order', () => '', 'sales-order')).toBe('Sales Order');
  });

  it('falls back to the window name when there is no breadcrumb', () => {
    expect(getWindowTitle('', tMenu, 'sales-order')).toBe('sales-order');
    expect(getWindowTitle('', () => '', '')).toBe('');
  });

  it('labels a new record and otherwise resolves the identifier', () => {
    expect(getRecordTitle(true, () => 'New record', {}, 'documentNo')).toBe('New record');
    expect(getRecordTitle(false, () => '', { documentNo: 'SO-1' }, 'documentNo')).toBe('SO-1');
  });

  it('falls back through _identifier and id when the title field resolves to nothing', () => {
    expect(getRecordTitle(false, () => '', { _identifier: 'ACME', id: 'x' })).toBe('ACME');
    expect(getRecordTitle(false, () => '', { id: 'x' })).toBe('x');
    expect(getRecordTitle(false, () => '', {})).toBe('');
  });

  it('translates each breadcrumb segment and appends the record title', () => {
    expect(getFullBreadcrumb('Sales / Sales Order', tMenu, 'SO-1', 'ignored'))
      .toBe('Sales / Sales Order / SO-1');
    expect(getFullBreadcrumb('Sales / Sales Order', tMenu, '', 'ignored'))
      .toBe('Sales / Sales Order');
    expect(getFullBreadcrumb('', tMenu, 'SO-1', 'Window Title')).toBe('Window Title');
  });
});

describe('getOnAddToFavorites', () => {
  it('returns undefined without a favourite key', () => {
    expect(getOnAddToFavorites('', vi.fn(), 'Label', 'Sales / Sales Order', 'w')).toBeUndefined();
  });

  it('prefers the entity label, then the last breadcrumb segment, then the window name', () => {
    const toggle = vi.fn();
    getOnAddToFavorites('k', toggle, 'Label', 'Sales / Sales Order', 'w')();
    expect(toggle).toHaveBeenCalledWith('k', 'Label');

    toggle.mockClear();
    getOnAddToFavorites('k', toggle, '', 'Sales / Sales Order', 'w')();
    expect(toggle).toHaveBeenCalledWith('k', 'Sales Order');

    toggle.mockClear();
    getOnAddToFavorites('k', toggle, '', '', 'w')();
    expect(toggle).toHaveBeenCalledWith('k', 'w');
  });
});

describe('class-name and small value helpers', () => {
  it('marks embedded views as pointer-events-none', () => {
    expect(getNotesRowClassName(true)).toContain('pointer-events-none');
    expect(getNotesRowClassName(false)).not.toContain('pointer-events-none');
    expect(getDocsRowClassName(true)).toContain('pointer-events-none');
    expect(getOthersTabClassName(true)).toBe('pt-5 pointer-events-none');
    expect(getCustomLinesTabClassName(false)).toBe('pt-3');
    expect(getSecondaryTabContentClassName('pt-4', true))
      .toBe('pt-4 flex flex-col gap-3 pointer-events-none');
  });

  it('varies the lines chrome with the inlineEditable layout', () => {
    expect(getAddLineWrapperClassName('inlineEditable')).toBe('sticky bottom-0 bg-card z-10');
    expect(getAddLineWrapperClassName('table')).toBe('relative');
    expect(getInlineEditableShrinkClassName('inlineEditable')).toBe('shrink-0');
    expect(getInlineEditableShrinkClassName('table')).toBe('');
    expect(getLinesToolbarClassName('inlineEditable', 'px-4', false)).toContain('p-2');
    expect(getLinesToolbarClassName('inlineEditable', 'px-4', false)).toContain('border-b');
    expect(getLinesToolbarClassName('table', 'px-4', false)).toContain('px-4 py-2');
    expect(getLinesToolbarClassName('table', 'px-4', false)).not.toContain('border-b');
    expect(getLinesToolbarClassName('table', 'px-4', true)).toContain('border-b');
  });

  it('stacks the side panel below the content until lg', () => {
    expect(sidePanelWrapperCls(true, 'table')).toBe('flex flex-col lg:flex-row items-stretch gap-0 min-h-full');
    expect(sidePanelWrapperCls(false, 'inlineEditable')).toBe('flex flex-col');
    expect(sidePanelWrapperCls(false, 'table')).toBe('');
  });

  it('picks the slide direction from the closing flag', () => {
    expect(getSidebarSlideClassName(true)).toBe('sidebar-slide-out');
    expect(getSidebarSlideClassName(false)).toBe('sidebar-slide-in');
  });

  it('shows a loading label while saving', () => {
    const ui = (k) => k;
    expect(getSaveButtonLabel(true, ui)).toBe('loading');
    expect(getSaveButtonLabel(false, ui)).toBe('save');
    expect(getChildSaveButtonLabel(true, ui)).toBe('loading');
    expect(getChildSaveButtonLabel(false, ui)).toBe('save');
  });

  it('wraps a single record id and yields an empty list otherwise', () => {
    expect(getDocumentIds('rec-1')).toEqual(['rec-1']);
    expect(getDocumentIds(null)).toEqual([]);
    expect(getDocumentIds('')).toEqual([]);
  });

  it('calls a functional sidebarContent with the record', () => {
    expect(resolveSidebarContent('static', { id: 1 })).toBe('static');
    expect(resolveSidebarContent((d) => `for ${d.id}`, { id: 1 })).toBe('for 1');
  });
});

describe('secondary tab wiring', () => {
  it('only wires the inline-lines ref for the inlineEditable layout', () => {
    const getRef = vi.fn(() => 'the-ref');
    expect(getSecondaryLinesTableRef('inlineEditable', getRef, { key: 'k' })).toBe('the-ref');
    expect(getSecondaryLinesTableRef('table', getRef, { key: 'k' })).toBeUndefined();
  });

  it('only gives tabs with a custom modal an onEditRow handler', () => {
    const setState = vi.fn();
    expect(getSecondaryEditRowHandler({ key: 'k', customAddModal: false }, setState)).toBeUndefined();

    const handler = getSecondaryEditRowHandler({ key: 'k', customAddModal: true }, setState);
    handler({ id: 'row-9' });
    expect(setState).toHaveBeenCalledWith({ key: 'k', rowId: 'row-9' });
  });

  it('routes the add-line action by customAddModal and swallows rejections', async () => {
    const custom = vi.fn(() => Promise.resolve());
    const toggle = vi.fn(() => Promise.resolve());

    await runAddLineAction({ key: 'k', customAddModal: true }, {
      handleCustomModalAddClick: custom, handleSecondaryAddLineToggle: toggle,
    });
    expect(custom).toHaveBeenCalledWith('k');
    expect(toggle).not.toHaveBeenCalled();

    await runAddLineAction({ key: 'k', customAddModal: false }, {
      handleCustomModalAddClick: custom, handleSecondaryAddLineToggle: toggle,
    });
    expect(toggle).toHaveBeenCalledWith('k');

    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(runAddLineAction({ key: 'boom', customAddModal: false }, {
      handleCustomModalAddClick: custom,
      handleSecondaryAddLineToggle: () => Promise.reject(new Error('nope')),
    })).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe('getAddLineMenuActions', () => {
  it('returns undefined when the window supplies no line menu actions', () => {
    expect(getAddLineMenuActions(null, {}, { current: null }, (k) => k)).toBeUndefined();
    expect(getLineMenuActionsRef(null, { current: 'ref' })).toBeUndefined();
    expect(getLineMenuActionsRef(() => [], { current: 'ref' })).toEqual({ current: 'ref' });
  });

  it('translates string labels and leaves node labels alone', () => {
    const node = { not: 'a string' };
    const get = vi.fn(() => [{ label: 'importLines' }, { label: node }]);
    const ref = { current: 'r' };

    const actions = getAddLineMenuActions(get, { id: 1 }, ref, (k) => `t:${k}`);

    expect(get).toHaveBeenCalledWith({ data: { id: 1 }, importRef: ref });
    expect(actions[0].label).toBe('t:importLines');
    expect(actions[1].label).toBe(node);
  });

  it('keeps the raw label when the translation comes back empty', () => {
    const get = () => [{ label: 'importLines' }];
    expect(getAddLineMenuActions(get, {}, { current: null }, () => '')[0].label).toBe('importLines');
  });
});

describe('buildInitialTabs (ETP-4415 — cross-group tabOrder sort)', () => {
  const baseUi = (key) => key;
  const basePanelCounts = {};
  const baseHook = { children: [] };

  function makeProps(overrides = {}) {
    return {
      secondaryTabs: [],
      secondaryHooks: [],
      panelCounts: basePanelCounts,
      ui: baseUi,
      DetailTable: null,
      detailLabel: 'Lines',
      detailEntity: 'orderLine',
      hook: baseHook,
      detailTabIndex: undefined,
      detailTabOrder: undefined,
      CustomLines: null,
      customLinesLabel: 'Invoices',
      customLinesCount: null,
      customTabsAfterBottom: false,
      tabCustomTabs: [],
      customTabCounts: {},
      customTabVisibility: {},
      ...overrides,
    };
  }

  it("reproduces today's default order when nothing declares tabOrder: secondaryTabs, then customs (no lines)", () => {
    const tabs = buildInitialTabs(makeProps({
      secondaryTabs: [{ key: 'accounting', label: 'Accounting' }],
      tabCustomTabs: [{ key: 'pricing', label: 'Price', placement: 'tab' }],
    }));
    expect(tabs.map(t => t.key)).toEqual(['accounting', 'custom:pricing']);
  });

  it('a higher secondaryTabs tabOrder sorts it after a default-weight custom tab', () => {
    const tabs = buildInitialTabs(makeProps({
      secondaryTabs: [{ key: 'accounting', label: 'Accounting', tabOrder: 1000 }],
      tabCustomTabs: [{ key: 'pricing', label: 'Price', placement: 'tab' }],
    }));
    expect(tabs.map(t => t.key)).toEqual(['custom:pricing', 'accounting']);
  });

  it('a lower custom-tab tabOrder sorts it before a default-weight secondaryTab', () => {
    const tabs = buildInitialTabs(makeProps({
      secondaryTabs: [{ key: 'accounting', label: 'Accounting' }],
      tabCustomTabs: [{ key: 'pricing', label: 'Price', placement: 'tab', tabOrder: 1 }],
    }));
    expect(tabs.map(t => t.key)).toEqual(['custom:pricing', 'accounting']);
  });

  it('ties keep insertion order among secondaryTabs (stable sort)', () => {
    const tabs = buildInitialTabs(makeProps({
      secondaryTabs: [
        { key: 'accounting', label: 'Accounting' },
        { key: 'tax', label: 'Tax' },
      ],
    }));
    expect(tabs.map(t => t.key)).toEqual(['accounting', 'tax']);
  });

  it('a custom tab hidden via customTabVisibility is excluded before the sort runs', () => {
    const tabs = buildInitialTabs(makeProps({
      secondaryTabs: [{ key: 'accounting', label: 'Accounting', tabOrder: 1000 }],
      tabCustomTabs: [{ key: 'pricing', label: 'Price', placement: 'tab' }],
      customTabVisibility: { pricing: false },
    }));
    expect(tabs.map(t => t.key)).toEqual(['accounting']);
  });

  it('customTabsAfterBottom suppresses custom tabs from the sorted list entirely', () => {
    const tabs = buildInitialTabs(makeProps({
      secondaryTabs: [{ key: 'accounting', label: 'Accounting' }],
      tabCustomTabs: [{ key: 'pricing', label: 'Price', placement: 'tab', tabOrder: -50 }],
      customTabsAfterBottom: true,
    }));
    expect(tabs.map(t => t.key)).toEqual(['accounting']);
  });

  it("lines tab defaults to first when neither detailTabIndex nor detailTabOrder is set (matches today's unshift)", () => {
    const tabs = buildInitialTabs(makeProps({
      DetailTable: true,
      secondaryTabs: [{ key: 'accounting', label: 'Accounting' }],
    }));
    expect(tabs.map(t => t.key)).toEqual(['lines', 'accounting']);
  });

  it('detailTabIndex splices the lines tab at the same position as the old array-splice behavior', () => {
    const tabs = buildInitialTabs(makeProps({
      DetailTable: true,
      secondaryTabs: [
        { key: 'accounting', label: 'Accounting' },
        { key: 'tax', label: 'Tax' },
      ],
      detailTabIndex: 1,
    }));
    expect(tabs.map(t => t.key)).toEqual(['accounting', 'lines', 'tax']);
  });

  it('an out-of-range detailTabIndex falls back to first, matching the old unshift fallback', () => {
    const tabs = buildInitialTabs(makeProps({
      DetailTable: true,
      secondaryTabs: [{ key: 'accounting', label: 'Accounting' }],
      detailTabIndex: 99,
    }));
    expect(tabs.map(t => t.key)).toEqual(['lines', 'accounting']);
  });

  it('detailTabOrder takes precedence over detailTabIndex and places the lines tab by weight', () => {
    const tabs = buildInitialTabs(makeProps({
      DetailTable: true,
      secondaryTabs: [{ key: 'accounting', label: 'Accounting' }],
      tabCustomTabs: [{ key: 'pricing', label: 'Price', placement: 'tab' }],
      detailTabIndex: 0,
      detailTabOrder: 500,
    }));
    expect(tabs.map(t => t.key)).toEqual(['accounting', 'lines', 'custom:pricing']);
  });

  it('Producto acceptance case: Contabilidad sorts after Precio and Attachments', () => {
    const tabs = buildInitialTabs(makeProps({
      secondaryTabs: [{ key: 'accounting', label: 'Accounting', tabOrder: 1000 }],
      tabCustomTabs: [
        { key: 'pricing', label: 'Price', placement: 'tab' },
        { key: 'attachments', labelKey: 'attachments', placement: 'tab' },
      ],
    }));
    expect(tabs.map(t => t.key)).toEqual(['custom:pricing', 'custom:attachments', 'accounting']);
  });
});
