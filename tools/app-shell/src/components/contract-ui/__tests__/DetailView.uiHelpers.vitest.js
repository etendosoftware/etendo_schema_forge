import { describe, it, expect, vi } from 'vitest';

// Importing DetailView.jsx pulls in the whole component tree (router, i18n,
// hooks, sub-components, lib helpers). Mirror the mocks used by
// DetailView.extractedHelpers.vitest.js so the module loads in isolation and we
// can import the extracted pure UI helpers directly.
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
  getSaveButtonLabel,
  getChildSaveButtonLabel,
  getSelectedLinesTotalLabel,
  getAddLineWrapperClassName,
  getAddLineWrapperStyle,
  resolveCanAddLines,
  parseBackendErrorMessage,
  getDocumentIds,
  resolveSidebarContent,
  renderSidePanel,
  getNotesRowClassName,
  getDocsRowClassName,
  getAddLineMenuActions,
  getInlineEditableShrinkClassName,
  getOthersTabClassName,
  getCustomLinesTabClassName,
} from '../DetailView.jsx';

const ui = (key) => key;

describe('getSaveButtonLabel', () => {
  it('returns the loading label while saving', () => {
    expect(getSaveButtonLabel(true, ui)).toBe('loading');
  });

  it('returns the save label when not saving', () => {
    expect(getSaveButtonLabel(false, ui)).toBe('save');
  });
});

describe('getChildSaveButtonLabel', () => {
  it('returns the loading label while saving the child', () => {
    expect(getChildSaveButtonLabel(true, ui)).toBe('loading');
  });

  it('returns the save label when not saving the child', () => {
    expect(getChildSaveButtonLabel(false, ui)).toBe('save');
  });
});

describe('getSelectedLinesTotalLabel', () => {
  const lineConfig = { grossField: 'lineGross' };
  // Format the expected number the same way the helper does, so assertions are
  // independent of the runner's default locale decimal separator.
  const fmt = (n) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  it('sums the gross field across rows and formats with 2 decimals', () => {
    const rows = [{ lineGross: 10 }, { lineGross: 5.5 }];
    const result = getSelectedLinesTotalLabel({}, rows, lineConfig, {});
    expect(result).toBe(fmt(15.5));
    // Always rendered with exactly two fraction digits regardless of locale.
    expect(result).toMatch(/[.,]50$/);
  });

  it('falls back to lineGrossAmount and treats missing/non-numeric values as 0', () => {
    const rows = [
      { lineGrossAmount: 4 }, // no grossField -> falls back
      { lineGross: 'not-a-number' }, // non-numeric -> 0
      {}, // missing both -> 0
    ];
    expect(getSelectedLinesTotalLabel({}, rows, lineConfig, {})).toBe(fmt(4));
  });

  it('appends the currency identifier when present', () => {
    const rows = [{ lineGross: 100 }];
    const data = { 'currency$_identifier': 'EUR' };
    expect(getSelectedLinesTotalLabel({}, rows, lineConfig, data)).toBe(`${fmt(100)} EUR`);
  });

  it('omits the currency suffix when not present', () => {
    const rows = [{ lineGross: 100 }];
    expect(getSelectedLinesTotalLabel({}, rows, lineConfig, {})).toBe(fmt(100));
  });

  it('returns null when showLineTotals is false', () => {
    const rows = [{ lineGross: 100 }];
    expect(getSelectedLinesTotalLabel({ showLineTotals: false }, rows, lineConfig, {})).toBeNull();
  });
});

describe('getAddLineWrapperClassName', () => {
  it('returns the sticky class for inlineEditable layout', () => {
    expect(getAddLineWrapperClassName('inlineEditable')).toBe('sticky bottom-0 bg-white z-10');
  });

  it('returns the relative class for other layouts', () => {
    expect(getAddLineWrapperClassName('table')).toBe('relative');
  });
});

describe('getAddLineWrapperStyle', () => {
  it('uses numeric padding for inlineEditable layout', () => {
    expect(getAddLineWrapperStyle('inlineEditable')).toMatchObject({
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      padding: 8,
    });
  });

  it('uses string padding for other layouts', () => {
    expect(getAddLineWrapperStyle('table')).toMatchObject({ padding: '10px 16px' });
  });
});

describe('resolveCanAddLines', () => {
  it('delegates to the guard when one is provided, forwarding children', () => {
    const guard = vi.fn(() => false);
    const data = { a: 1 };
    const children = [{ id: 'c1' }];
    expect(resolveCanAddLines(guard, data, ['x'], children)).toBe(false);
    expect(guard).toHaveBeenCalledWith(data, children);
  });

  it('passes an empty children array to the guard by default', () => {
    const guard = vi.fn(() => true);
    resolveCanAddLines(guard, { a: 1 }, ['x']);
    expect(guard).toHaveBeenCalledWith({ a: 1 }, []);
  });

  it('returns true when all required header fields have non-empty values', () => {
    const data = { a: 'x', b: 1 };
    expect(resolveCanAddLines(null, data, ['a', 'b'])).toBe(true);
  });

  it('returns false when a required field is null', () => {
    expect(resolveCanAddLines(null, { a: 'x', b: null }, ['a', 'b'])).toBe(false);
  });

  it('returns false when a required field is an empty string', () => {
    expect(resolveCanAddLines(null, { a: '' }, ['a'])).toBe(false);
  });

  it('returns false when a required field is whitespace only', () => {
    expect(resolveCanAddLines(null, { a: '   ' }, ['a'])).toBe(false);
  });

  it('returns false when a required field is missing entirely', () => {
    expect(resolveCanAddLines(null, {}, ['a'])).toBe(false);
  });

  it('returns true when there is no guard and no required fields', () => {
    expect(resolveCanAddLines(null, {}, [])).toBe(true);
    expect(resolveCanAddLines(null, {}, undefined)).toBe(true);
  });
});

describe('parseBackendErrorMessage', () => {
  const fakeRes = (payload) => ({ json: async () => payload });

  it('reads the NEO Headless top-level error.message', async () => {
    const res = fakeRes({ error: { message: 'neo error' } });
    await expect(parseBackendErrorMessage(res)).resolves.toBe('neo error');
  });

  it('reads the JsonDataService response.error.message', async () => {
    const res = fakeRes({ response: { error: { message: 'service error' } } });
    await expect(parseBackendErrorMessage(res)).resolves.toBe('service error');
  });

  it('reads response.error when it is a plain string', async () => {
    const res = fakeRes({ response: { error: 'string error' } });
    await expect(parseBackendErrorMessage(res)).resolves.toBe('string error');
  });

  it('reads top-level message as a last resort', async () => {
    const res = fakeRes({ message: 'top message' });
    await expect(parseBackendErrorMessage(res)).resolves.toBe('top message');
  });

  it('returns undefined when no known shape matches', async () => {
    const res = fakeRes({ something: 'else' });
    await expect(parseBackendErrorMessage(res)).resolves.toBeUndefined();
  });

  it('returns undefined when json() throws (non-JSON body)', async () => {
    const res = { json: async () => { throw new Error('not json'); } };
    await expect(parseBackendErrorMessage(res)).resolves.toBeUndefined();
  });
});

describe('getDocumentIds', () => {
  it('wraps a present record id in an array', () => {
    expect(getDocumentIds('rec-1')).toEqual(['rec-1']);
  });

  it('returns an empty array when there is no record id', () => {
    expect(getDocumentIds(null)).toEqual([]);
    expect(getDocumentIds(undefined)).toEqual([]);
  });
});

describe('resolveSidebarContent', () => {
  it('invokes the content function with data', () => {
    const fn = vi.fn(() => 'resolved');
    const data = { a: 1 };
    expect(resolveSidebarContent(fn, data)).toBe('resolved');
    expect(fn).toHaveBeenCalledWith(data);
  });

  it('returns the value as-is when not a function', () => {
    expect(resolveSidebarContent('static', { a: 1 })).toBe('static');
  });
});

describe('renderSidePanel', () => {
  it('returns a React element when sidePanel is a component function', () => {
    const Panel = () => null;
    const data = { id: 'data-id' };
    const el = renderSidePanel(Panel, data, 'rec-id', 'tok', 'http://api', { get: 1 }, false);
    expect(el.type).toBe(Panel);
    expect(el.props).toMatchObject({
      recordId: 'data-id',
      data,
      token: 'tok',
      apiBaseUrl: 'http://api',
      api: { get: 1 },
      isNew: false,
    });
  });

  it('falls back to the recordId when data has no id', () => {
    const Panel = () => null;
    const el = renderSidePanel(Panel, {}, 'rec-id', 't', 'u', {}, true);
    expect(el.props.recordId).toBe('rec-id');
  });

  it('returns the raw value when sidePanel is not a function', () => {
    expect(renderSidePanel('static-node', {}, 'r', 't', 'u', {}, false)).toBe('static-node');
  });
});

describe('getNotesRowClassName', () => {
  it('adds the pointer-events-none suffix when embedded', () => {
    expect(getNotesRowClassName(true)).toBe('flex items-start gap-3 px-4 py-2.5 pointer-events-none');
  });

  it('omits the suffix when not embedded', () => {
    expect(getNotesRowClassName(false)).toBe('flex items-start gap-3 px-4 py-2.5');
  });
});

describe('getDocsRowClassName', () => {
  it('adds the pointer-events-none suffix when embedded', () => {
    expect(getDocsRowClassName(true)).toBe('flex items-start gap-3 px-4 py-2.5 border-b border-border/30 pointer-events-none');
  });

  it('omits the suffix when not embedded', () => {
    expect(getDocsRowClassName(false)).toBe('flex items-start gap-3 px-4 py-2.5 border-b border-border/30');
  });
});

describe('getAddLineMenuActions', () => {
  it('returns undefined when there is no getter', () => {
    expect(getAddLineMenuActions(null, {}, {}, ui)).toBeUndefined();
  });

  it('translates a string label and spreads other action props', () => {
    const getter = vi.fn(() => [{ label: 'import.label', icon: 'plus', onClick: 'fn' }]);
    const data = { a: 1 };
    const ref = { current: null };
    const translate = (k) => (k === 'import.label' ? 'Import' : k);
    const result = getAddLineMenuActions(getter, data, ref, translate);
    expect(getter).toHaveBeenCalledWith({ data, importRef: ref });
    expect(result).toEqual([{ label: 'Import', icon: 'plus', onClick: 'fn' }]);
  });

  it('passes a non-string label through untouched', () => {
    const labelNode = { custom: true };
    const getter = () => [{ label: labelNode }];
    const result = getAddLineMenuActions(getter, {}, {}, ui);
    expect(result[0].label).toBe(labelNode);
  });
});

describe('getInlineEditableShrinkClassName', () => {
  it('returns shrink-0 for inlineEditable layout', () => {
    expect(getInlineEditableShrinkClassName('inlineEditable')).toBe('shrink-0');
  });

  it('returns an empty string for other layouts', () => {
    expect(getInlineEditableShrinkClassName('table')).toBe('');
  });
});

describe('getOthersTabClassName', () => {
  it('adds the pointer-events-none suffix when embedded', () => {
    expect(getOthersTabClassName(true)).toBe('pt-5 pointer-events-none');
  });

  it('omits the suffix when not embedded', () => {
    expect(getOthersTabClassName(false)).toBe('pt-5');
  });
});

describe('getCustomLinesTabClassName', () => {
  it('adds the pointer-events-none suffix when embedded', () => {
    expect(getCustomLinesTabClassName(true)).toBe('pt-3 pointer-events-none');
  });

  it('omits the suffix when not embedded', () => {
    expect(getCustomLinesTabClassName(false)).toBe('pt-3');
  });
});
