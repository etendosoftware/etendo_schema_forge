import { describe, it, expect, vi } from 'vitest';

// Importing DetailView.jsx pulls in the whole component tree (router, i18n,
// hooks, sub-components, lib helpers). Mirror the mocks used by
// DetailView.vitest.jsx so the module loads in isolation and we can import the
// exported pure helpers directly.
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
} from '../DetailView.jsx';

describe('mergeSelectorContextFields', () => {
  it('treats standardPrice as gross when isTaxIncluded is undefined (default)', () => {
    const snapshot = {};
    const selectedItem = { id: '1', standardPrice: 100 };
    const result = mergeSelectorContextFields(selectedItem, snapshot, 'product');
    expect(snapshot.grossUnitPrice).toBe(100);
    expect(snapshot.grossListPrice).toBe(100);
    expect(snapshot.unitPrice).toBeUndefined();
    expect(snapshot.listPrice).toBeUndefined();
    expect(result).toBeUndefined();
  });

  it('treats standardPrice as gross when isTaxIncluded is true', () => {
    const snapshot = {};
    const selectedItem = { id: '1', standardPrice: 50, isTaxIncluded: true };
    mergeSelectorContextFields(selectedItem, snapshot, 'product');
    expect(snapshot.grossUnitPrice).toBe(50);
    expect(snapshot.grossListPrice).toBe(50);
    expect(snapshot.unitPrice).toBeUndefined();
    expect(snapshot.listPrice).toBeUndefined();
  });

  it('treats standardPrice as net when isTaxIncluded is false', () => {
    const snapshot = {};
    const selectedItem = { id: '1', standardPrice: 75, isTaxIncluded: false };
    mergeSelectorContextFields(selectedItem, snapshot, 'product');
    expect(snapshot.unitPrice).toBe(75);
    expect(snapshot.listPrice).toBe(75);
    expect(snapshot.grossUnitPrice).toBeUndefined();
    expect(snapshot.grossListPrice).toBeUndefined();
  });

  it('does not treat null standardPrice as a price (skipped by null guard)', () => {
    const snapshot = {};
    const selectedItem = { id: '1', standardPrice: null };
    mergeSelectorContextFields(selectedItem, snapshot, 'product');
    // null values are skipped entirely by the `topVal === null` continue,
    // so no price keys and no ctxKey are written.
    expect(snapshot).toEqual({});
    expect('product_standardPrice' in snapshot).toBe(false);
    expect(snapshot.grossUnitPrice).toBeUndefined();
    expect(snapshot.unitPrice).toBeUndefined();
  });

  it('skips reserved keys, object values, and null values', () => {
    const snapshot = {};
    const selectedItem = {
      id: 'x',
      _aux: { foo: 1 },
      label: 'L',
      name: 'N',
      searchKey: 'SK',
      nested: { a: 1 },
      missing: null,
    };
    mergeSelectorContextFields(selectedItem, snapshot, 'product');
    expect(snapshot).toEqual({});
  });

  it('writes a plain scalar field as `${fieldKey}_${topField}`', () => {
    const snapshot = {};
    const selectedItem = { id: '1', uom: 'EA' };
    mergeSelectorContextFields(selectedItem, snapshot, 'product');
    expect(snapshot.product_uom).toBe('EA');
  });

  it('does not overwrite a pre-existing ctxKey in snapshot', () => {
    const snapshot = { product_uom: 'KEEP' };
    const selectedItem = { id: '1', uom: 'NEW' };
    mergeSelectorContextFields(selectedItem, snapshot, 'product');
    expect(snapshot.product_uom).toBe('KEEP');
  });

  it('mutates the snapshot in place and returns undefined', () => {
    const snapshot = {};
    const result = mergeSelectorContextFields({ id: '1', code: 'C1' }, snapshot, 'product');
    expect(result).toBeUndefined();
    expect(snapshot.product_code).toBe('C1');
  });
});

describe('mergeSelectorAuxFields', () => {
  it('folds each _aux entry as `${fieldKey}${suffix}`', () => {
    const snapshot = {};
    const selectedItem = { _aux: { '$_identifier': 'ACME', '_uom': 'EA' } };
    const result = mergeSelectorAuxFields(selectedItem, snapshot, 'product');
    expect(snapshot['product$_identifier']).toBe('ACME');
    expect(snapshot['product_uom']).toBe('EA');
    expect(result).toBeUndefined();
  });

  it('is a no-op when _aux is absent', () => {
    const snapshot = {};
    mergeSelectorAuxFields({ id: '1' }, snapshot, 'product');
    expect(snapshot).toEqual({});
  });

  it('mutates in place and returns undefined', () => {
    const snapshot = { existing: 1 };
    const result = mergeSelectorAuxFields({ _aux: { '_x': 9 } }, snapshot, 'product');
    expect(result).toBeUndefined();
    expect(snapshot).toEqual({ existing: 1, 'product_x': 9 });
  });
});

describe('applyLocalChildRowUpdate', () => {
  it('calls handleUpdateChild with row.id and merged derivedUpdates + fieldKey', () => {
    const handleUpdateChild = vi.fn();
    applyLocalChildRowUpdate(
      { a: 1 },
      'product',
      'PROD123',
      {},
      undefined,
      { handleUpdateChild },
      { id: 'row-1' }
    );
    expect(handleUpdateChild).toHaveBeenCalledTimes(1);
    expect(handleUpdateChild).toHaveBeenCalledWith('row-1', { a: 1, product: 'PROD123' });
  });

  it('includes unitPrice only when fieldValues.unitPrice is defined', () => {
    const handleUpdateChild = vi.fn();
    applyLocalChildRowUpdate(
      {},
      'product',
      'PROD123',
      { unitPrice: 42 },
      undefined,
      { handleUpdateChild },
      { id: 'row-1' }
    );
    expect(handleUpdateChild).toHaveBeenCalledWith('row-1', { product: 'PROD123', unitPrice: 42 });
  });

  it('omits unitPrice when fieldValues.unitPrice is undefined', () => {
    const handleUpdateChild = vi.fn();
    applyLocalChildRowUpdate({}, 'product', 'PROD123', {}, undefined, { handleUpdateChild }, { id: 'row-1' });
    const arg = handleUpdateChild.mock.calls[0][1];
    expect('unitPrice' in arg).toBe(false);
  });

  it('adds `${fieldKey}$_identifier` only when opts.identifier is defined', () => {
    const handleUpdateChild = vi.fn();
    applyLocalChildRowUpdate(
      {},
      'product',
      'PROD123',
      {},
      { identifier: 'My Product' },
      { handleUpdateChild },
      { id: 'row-1' }
    );
    expect(handleUpdateChild).toHaveBeenCalledWith('row-1', {
      product: 'PROD123',
      'product$_identifier': 'My Product',
    });
  });

  it('omits the identifier key when opts is undefined', () => {
    const handleUpdateChild = vi.fn();
    applyLocalChildRowUpdate({}, 'product', 'PROD123', {}, undefined, { handleUpdateChild }, { id: 'row-1' });
    const arg = handleUpdateChild.mock.calls[0][1];
    expect('product$_identifier' in arg).toBe(false);
  });

  it('does not throw when handleUpdateChild is undefined (optional chaining)', () => {
    expect(() =>
      applyLocalChildRowUpdate({}, 'product', 'PROD123', {}, undefined, {}, { id: 'row-1' })
    ).not.toThrow();
  });
});

describe('collectRowFieldValues', () => {
  it('copies normal keys through the coerce function', () => {
    const fieldValues = {};
    const result = collectRowFieldValues({ qty: '3', note: 'hello' }, fieldValues, (v) => `c:${v}`);
    expect(fieldValues).toEqual({ qty: 'c:3', note: 'c:hello' });
    expect(result).toBeUndefined();
  });

  it('skips keys ending in $_identifier', () => {
    const fieldValues = {};
    collectRowFieldValues({ 'product$_identifier': 'ACME', qty: '2' }, fieldValues, (v) => v);
    expect('product$_identifier' in fieldValues).toBe(false);
    expect(fieldValues.qty).toBe('2');
  });

  it('skips the _identifier, _entityName, $ref, and id markers', () => {
    const fieldValues = {};
    collectRowFieldValues(
      {
        _identifier: 'x',
        _entityName: 'OrderLine',
        $ref: 'ref',
        id: 'row-1',
        keep: 'yes',
      },
      fieldValues,
      (v) => v
    );
    expect(fieldValues).toEqual({ keep: 'yes' });
  });

  it('mutates fieldValues in place and returns undefined', () => {
    const fieldValues = { existing: 1 };
    const result = collectRowFieldValues({ extra: 'v' }, fieldValues, (v) => v);
    expect(result).toBeUndefined();
    expect(fieldValues).toEqual({ existing: 1, extra: 'v' });
  });
});
