import { describe, it, expect, vi } from 'vitest';

// Importing DetailView.jsx pulls in the whole component tree (router, i18n,
// hooks, sub-components, lib helpers). Mirror the mocks used by
// DetailView.extractedHelpers.vitest.js so the module loads in isolation and we
// can import the extracted pure title/breadcrumb helpers directly.
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
  getWindowTitle,
  getRecordTitle,
  getFullBreadcrumb,
  getOnAddToFavorites,
  getLinesContainerClassName,
} from '../DetailView.jsx';

// Helper translators used across cases.
const identityT = (key) => key;
const upperT = (key) => (key ? `T(${key})` : key);
const falsyT = () => '';

describe('getWindowTitle', () => {
  it('uses the translated last breadcrumb segment when breadcrumb is present', () => {
    expect(getWindowTitle('Sales / Orders / Sales Order', upperT, 'ignored')).toBe(
      'T(Sales Order)',
    );
  });

  it('falls back to the raw last segment when tMenu returns falsy', () => {
    expect(getWindowTitle('Sales / Orders / Sales Order', falsyT, 'ignored')).toBe(
      'Sales Order',
    );
  });

  it('trims whitespace around the last breadcrumb segment', () => {
    expect(getWindowTitle('Sales /   Sales Order   ', identityT, 'ignored')).toBe(
      'Sales Order',
    );
  });

  it('translates the windowName when there is no breadcrumb', () => {
    expect(getWindowTitle('', upperT, 'Sales Order')).toBe('T(Sales Order)');
  });

  it('falls back to windowName when there is no breadcrumb and tMenu is falsy', () => {
    expect(getWindowTitle(undefined, falsyT, 'Sales Order')).toBe('Sales Order');
  });

  it('returns empty string when nothing is provided', () => {
    expect(getWindowTitle('', falsyT, '')).toBe('');
    expect(getWindowTitle(undefined, falsyT, undefined)).toBe('');
  });
});

describe('getRecordTitle', () => {
  const ui = (key) => key;

  it('returns the localized newRecord label when isNew', () => {
    expect(getRecordTitle(true, ui, { _identifier: 'X', id: '1' }, 'name')).toBe('newRecord');
  });

  it('uses resolveIdentifier value when it resolves to a real value', () => {
    // mocked resolveIdentifier reads `${titleField}$_identifier` first.
    expect(getRecordTitle(false, ui, { 'name$_identifier': 'Widget A' }, 'name')).toBe(
      'Widget A',
    );
  });

  it('falls back to _identifier when resolveIdentifier is falsy', () => {
    // titleField 'missing' resolves to falsy, so _identifier wins.
    expect(getRecordTitle(false, ui, { _identifier: 'INV-001' }, 'missing')).toBe('INV-001');
  });

  it('falls back to id when only id is present', () => {
    expect(getRecordTitle(false, ui, { id: 'rec-42' }, 'missing')).toBe('rec-42');
  });

  it('returns empty string when nothing resolves', () => {
    expect(getRecordTitle(false, ui, {}, 'missing')).toBe('');
  });
});

describe('getFullBreadcrumb', () => {
  it('translates and joins each segment with " / " and appends the title', () => {
    expect(getFullBreadcrumb('Sales / Orders', upperT, 'Order 123', 'wt')).toBe(
      'T(Sales) / T(Orders) / Order 123',
    );
  });

  it('trims each segment before translating', () => {
    expect(getFullBreadcrumb('  Sales  /  Orders ', identityT, '', 'wt')).toBe(
      'Sales / Orders',
    );
  });

  it('omits the trailing " / title" when title is empty', () => {
    expect(getFullBreadcrumb('Sales / Orders', upperT, '', 'wt')).toBe('T(Sales) / T(Orders)');
  });

  it('returns the windowTitle when there is no breadcrumb', () => {
    expect(getFullBreadcrumb('', upperT, 'Order 123', 'Window Title')).toBe('Window Title');
    expect(getFullBreadcrumb(undefined, upperT, 'Order 123', 'Window Title')).toBe(
      'Window Title',
    );
  });
});

describe('getOnAddToFavorites', () => {
  it('returns undefined when there is no favKey', () => {
    expect(getOnAddToFavorites('', vi.fn(), 'Label', 'Sales / Orders', 'Win')).toBeUndefined();
    expect(
      getOnAddToFavorites(undefined, vi.fn(), 'Label', 'Sales / Orders', 'Win'),
    ).toBeUndefined();
  });

  it('returns a function that calls toggleFavorite with (favKey, entityLabel) when entityLabel is set', () => {
    const toggleFavorite = vi.fn();
    const handler = getOnAddToFavorites('fav-1', toggleFavorite, 'My Label', 'Sales / Orders', 'Win');
    expect(typeof handler).toBe('function');
    handler();
    expect(toggleFavorite).toHaveBeenCalledWith('fav-1', 'My Label');
  });

  it('uses the trimmed last breadcrumb segment when entityLabel is falsy', () => {
    const toggleFavorite = vi.fn();
    const handler = getOnAddToFavorites('fav-2', toggleFavorite, '', 'Sales /  Orders  ', 'Win');
    handler();
    expect(toggleFavorite).toHaveBeenCalledWith('fav-2', 'Orders');
  });

  it('falls back to windowName when both entityLabel and breadcrumb are falsy', () => {
    const toggleFavorite = vi.fn();
    const handler = getOnAddToFavorites('fav-3', toggleFavorite, '', '', 'Win');
    handler();
    expect(toggleFavorite).toHaveBeenCalledWith('fav-3', 'Win');
  });
});

describe('getLinesContainerClassName', () => {
  it.each([
    ['inlineEditable', false, 'flex items-start gap-4'],
    ['inlineEditable', true, 'flex items-start gap-4 pointer-events-none'],
    ['readOnly', false, 'pt-3 flex items-start gap-4'],
    ['readOnly', true, 'pt-3 flex items-start gap-4 pointer-events-none'],
  ])('linesLayout=%s embedded=%s => %s', (linesLayout, embedded, expected) => {
    expect(getLinesContainerClassName(linesLayout, embedded)).toBe(expected);
  });
});
