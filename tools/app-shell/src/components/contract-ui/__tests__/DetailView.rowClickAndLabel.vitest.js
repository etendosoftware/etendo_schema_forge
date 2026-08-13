import { describe, it, expect, vi } from 'vitest';

// Importing DetailView.jsx pulls in the whole component tree (router, i18n,
// hooks, sub-components, lib helpers). Mirror the mocks used by
// DetailView.extractedHelpers.vitest.js so the module loads in isolation and
// we can import the extracted pure helpers directly.
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

import { getDeleteChildButtonLabel, buildLineRowClickHandler } from '../DetailView.jsx';
import { roundAmounts } from '@/lib/lineFieldChange.js';

describe('getDeleteChildButtonLabel', () => {
  it('returns the loading label when deletingChildren is truthy', () => {
    const ui = vi.fn((k) => k);
    expect(getDeleteChildButtonLabel(true, ui)).toBe('loading');
    expect(ui).toHaveBeenCalledWith('loading');
  });

  it('returns the delete label when deletingChildren is falsy', () => {
    const ui = vi.fn((k) => k);
    expect(getDeleteChildButtonLabel(false, ui)).toBe('delete');
    expect(ui).toHaveBeenCalledWith('delete');
  });
});

describe('buildLineRowClickHandler', () => {
  it('returns undefined when DetailForm is null', () => {
    expect(buildLineRowClickHandler(null, 'readOnly', vi.fn())).toBeUndefined();
  });

  it('returns undefined when linesLayout is inlineEditable', () => {
    const DetailForm = () => null;
    expect(buildLineRowClickHandler(DetailForm, 'inlineEditable', vi.fn())).toBeUndefined();
  });

  it('returns a function when DetailForm is set and layout is not inlineEditable', () => {
    const DetailForm = () => null;
    expect(typeof buildLineRowClickHandler(DetailForm, 'readOnly', vi.fn())).toBe('function');
  });

  it('handler copies the row, rounds it, and passes a new object to setSelectedLine', () => {
    roundAmounts.mockClear();
    const DetailForm = () => null;
    const setSelectedLine = vi.fn();
    const handler = buildLineRowClickHandler(DetailForm, 'readOnly', setSelectedLine);

    const row = { id: 'row-1', qty: 3, price: 10 };
    handler(row);

    expect(setSelectedLine).toHaveBeenCalledTimes(1);
    const passed = setSelectedLine.mock.calls[0][0];
    expect(passed).toEqual(row);
    expect(passed).not.toBe(row);
    expect(roundAmounts).toHaveBeenCalledTimes(1);
    expect(roundAmounts).toHaveBeenCalledWith(passed);
  });
});
