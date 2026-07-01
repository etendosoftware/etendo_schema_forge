import { describe, it, expect, vi, afterEach } from 'vitest';

// Importing DetailView.jsx pulls in the whole component tree (router, i18n,
// hooks, sub-components, lib helpers). Mirror the mocks used by
// DetailView.vitest.jsx so the module loads in isolation and we can import the
// three exported pure helpers directly.
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
  normalizePatchFieldValues,
  applyCalloutFieldUpdates,
  applyCalloutComboUpdates,
  runAddLineAction,
} from '../DetailView.jsx';

describe('normalizePatchFieldValues', () => {
  it('skips keys ending in $_identifier', () => {
    const fieldValues = {};
    normalizePatchFieldValues({ 'businessPartner$_identifier': 'ACME' }, fieldValues);
    expect(fieldValues).toEqual({});
  });

  it('converts integer numeric strings to numbers', () => {
    const fieldValues = {};
    normalizePatchFieldValues({ qty: '10' }, fieldValues);
    expect(fieldValues.qty).toBe(10);
    expect(typeof fieldValues.qty).toBe('number');
  });

  it('converts negative decimal numeric strings to numbers', () => {
    const fieldValues = {};
    normalizePatchFieldValues({ adjustment: '-3.5' }, fieldValues);
    expect(fieldValues.adjustment).toBe(-3.5);
  });

  it('leaves non-numeric strings as-is', () => {
    const fieldValues = {};
    normalizePatchFieldValues({ name: 'hello' }, fieldValues);
    expect(fieldValues.name).toBe('hello');
  });

  it('does not convert Spanish-locale comma strings', () => {
    const fieldValues = {};
    normalizePatchFieldValues({ price: '10,50' }, fieldValues);
    expect(fieldValues.price).toBe('10,50');
    expect(typeof fieldValues.price).toBe('string');
  });

  it('leaves number values untouched', () => {
    const fieldValues = {};
    normalizePatchFieldValues({ qty: 42 }, fieldValues);
    expect(fieldValues.qty).toBe(42);
  });

  it('leaves boolean values untouched', () => {
    const fieldValues = {};
    normalizePatchFieldValues({ active: true, closed: false }, fieldValues);
    expect(fieldValues.active).toBe(true);
    expect(fieldValues.closed).toBe(false);
  });

  it('leaves null values untouched', () => {
    const fieldValues = {};
    normalizePatchFieldValues({ ref: null }, fieldValues);
    expect(fieldValues.ref).toBeNull();
  });

  it('mutates the passed fieldValues object in place and returns undefined', () => {
    const fieldValues = { existing: 'keep' };
    const result = normalizePatchFieldValues({ qty: '5' }, fieldValues);
    expect(result).toBeUndefined();
    expect(fieldValues).toEqual({ existing: 'keep', qty: 5 });
  });
});

describe('applyCalloutFieldUpdates', () => {
  function makeArgs(overrides = {}) {
    return {
      data: {},
      triggerField: 'trigger',
      userTouchedRef: { current: new Set() },
      appliedFields: new Map(),
      hook: { handleChange: vi.fn() },
      api: {},
      catalogs: {},
      ...overrides,
    };
  }

  it('applies entry.value via hook.handleChange and appliedFields.set', () => {
    const a = makeArgs();
    applyCalloutFieldUpdates(
      { warehouse: { value: 'WH1' } },
      a,
    );
    expect(a.appliedFields.get('warehouse')).toBe('WH1');
    expect(a.hook.handleChange).toHaveBeenCalledWith('warehouse', 'WH1');
  });

  it('skips an empty callout value when the field already has a user value', () => {
    const a = makeArgs({ data: { warehouse: 'EXISTING' } });
    applyCalloutFieldUpdates(
      { warehouse: { value: '' } },
      a,
    );
    expect(a.appliedFields.has('warehouse')).toBe(false);
    expect(a.hook.handleChange).not.toHaveBeenCalled();
  });

  it('applies an empty callout value when the field has no user value', () => {
    const a = makeArgs({ data: { warehouse: '' } });
    applyCalloutFieldUpdates(
      { warehouse: { value: 'WH1' } },
      a,
    );
    expect(a.appliedFields.get('warehouse')).toBe('WH1');
  });

  it('skips a user-touched non-trigger field that already has a value', () => {
    const a = makeArgs({
      data: { warehouse: 'USER' },
      userTouchedRef: { current: new Set(['warehouse']) },
    });
    applyCalloutFieldUpdates(
      { warehouse: { value: 'WH1' } },
      a,
    );
    expect(a.appliedFields.has('warehouse')).toBe(false);
    expect(a.hook.handleChange).not.toHaveBeenCalled();
  });

  it('lets the trigger field win even when it is user-touched', () => {
    const a = makeArgs({
      triggerField: 'warehouse',
      data: { warehouse: 'USER' },
      userTouchedRef: { current: new Set(['warehouse']) },
    });
    applyCalloutFieldUpdates(
      { warehouse: { value: 'WH1' } },
      a,
    );
    expect(a.appliedFields.get('warehouse')).toBe('WH1');
    expect(a.hook.handleChange).toHaveBeenCalledWith('warehouse', 'WH1');
  });

  it('emits key$_identifier when entry._identifier is present', () => {
    const a = makeArgs();
    applyCalloutFieldUpdates(
      { warehouse: { value: 'WH1', _identifier: 'Main Warehouse' } },
      a,
    );
    expect(a.hook.handleChange).toHaveBeenCalledWith('warehouse', 'WH1');
    expect(a.hook.handleChange).toHaveBeenCalledWith('warehouse$_identifier', 'Main Warehouse');
  });

  it('does not emit key$_identifier when entry has no _identifier and api is empty', () => {
    const a = makeArgs();
    applyCalloutFieldUpdates(
      { warehouse: { value: 'WH1' } },
      a,
    );
    expect(a.hook.handleChange).toHaveBeenCalledTimes(1);
    expect(a.hook.handleChange).toHaveBeenCalledWith('warehouse', 'WH1');
  });
});

describe('applyCalloutComboUpdates', () => {
  function makeArgs(overrides = {}) {
    return {
      data: {},
      triggerField: 'trigger',
      userTouchedRef: { current: new Set() },
      appliedFields: new Map(),
      hook: { handleChange: vi.fn() },
      ...overrides,
    };
  }

  it('uses combo.selected and emits label via key$_identifier', () => {
    const a = makeArgs();
    applyCalloutComboUpdates(
      { address: { selected: 'A1', _identifier: 'Street 1' } },
      a,
    );
    expect(a.appliedFields.get('address')).toBe('A1');
    expect(a.hook.handleChange).toHaveBeenCalledWith('address', 'A1');
    expect(a.hook.handleChange).toHaveBeenCalledWith('address$_identifier', 'Street 1');
  });

  it('auto-selects the first entry when selected is null', () => {
    const a = makeArgs();
    applyCalloutComboUpdates(
      {
        address: {
          selected: null,
          entries: [{ id: 'A1', identifier: 'First Addr' }, { id: 'A2', identifier: 'Second' }],
        },
      },
      a,
    );
    expect(a.appliedFields.get('address')).toBe('A1');
    expect(a.hook.handleChange).toHaveBeenCalledWith('address', 'A1');
    expect(a.hook.handleChange).toHaveBeenCalledWith('address$_identifier', 'First Addr');
  });

  it('falls back to entry._identifier when auto-selecting without identifier', () => {
    const a = makeArgs();
    applyCalloutComboUpdates(
      { address: { selected: null, entries: [{ id: 'A1', _identifier: 'Fallback Addr' }] } },
      a,
    );
    expect(a.hook.handleChange).toHaveBeenCalledWith('address$_identifier', 'Fallback Addr');
  });

  it('does nothing when selected is null and there are no entries', () => {
    const a = makeArgs();
    applyCalloutComboUpdates(
      { address: { selected: null, entries: [] } },
      a,
    );
    expect(a.appliedFields.size).toBe(0);
    expect(a.hook.handleChange).not.toHaveBeenCalled();
  });

  it('does not emit identifier when no label is available', () => {
    const a = makeArgs();
    applyCalloutComboUpdates(
      { address: { selected: 'A1' } },
      a,
    );
    expect(a.hook.handleChange).toHaveBeenCalledTimes(1);
    expect(a.hook.handleChange).toHaveBeenCalledWith('address', 'A1');
  });

  it('skips a user-touched non-trigger combo that already has a value', () => {
    const a = makeArgs({
      data: { address: 'USER' },
      userTouchedRef: { current: new Set(['address']) },
    });
    applyCalloutComboUpdates(
      { address: { selected: 'A1', _identifier: 'Street 1' } },
      a,
    );
    expect(a.appliedFields.has('address')).toBe(false);
    expect(a.hook.handleChange).not.toHaveBeenCalled();
  });

  it('skips combo for the trigger field to prevent callout reverting user selection', () => {
    const a = makeArgs({
      triggerField: 'address',
      data: { address: 'USER' },
      userTouchedRef: { current: new Set(['address']) },
    });
    applyCalloutComboUpdates(
      { address: { selected: 'A1', _identifier: 'Street 1' } },
      a,
    );
    expect(a.appliedFields.has('address')).toBe(false);
    expect(a.hook.handleChange).not.toHaveBeenCalled();
  });
});

describe('runAddLineAction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs an error when the secondary add-line handler rejects', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = new Error('toggle failed');
    const handlers = {
      handleCustomModalAddClick: vi.fn(),
      handleSecondaryAddLineToggle: vi.fn().mockRejectedValue(boom),
    };

    await runAddLineAction({ key: 'lines' }, handlers);

    expect(handlers.handleSecondaryAddLineToggle).toHaveBeenCalledWith('lines');
    expect(handlers.handleCustomModalAddClick).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalledWith(
      "Add line action failed for tab 'lines':",
      boom,
    );
  });

  it('logs an error when the customAddModal handler rejects', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = new Error('modal failed');
    const handlers = {
      handleCustomModalAddClick: vi.fn().mockRejectedValue(boom),
      handleSecondaryAddLineToggle: vi.fn(),
    };

    await runAddLineAction({ key: 'address', customAddModal: () => null }, handlers);

    expect(handlers.handleCustomModalAddClick).toHaveBeenCalledWith('address');
    expect(handlers.handleSecondaryAddLineToggle).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledWith(
      "Add line action failed for tab 'address':",
      boom,
    );
  });

  it('does not log when the secondary add-line handler resolves', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handlers = {
      handleCustomModalAddClick: vi.fn(),
      handleSecondaryAddLineToggle: vi.fn().mockResolvedValue(undefined),
    };

    await runAddLineAction({ key: 'lines' }, handlers);

    expect(handlers.handleSecondaryAddLineToggle).toHaveBeenCalledWith('lines');
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('does not log when the customAddModal handler resolves', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handlers = {
      handleCustomModalAddClick: vi.fn().mockResolvedValue(undefined),
      handleSecondaryAddLineToggle: vi.fn(),
    };

    await runAddLineAction({ key: 'address', customAddModal: () => null }, handlers);

    expect(handlers.handleCustomModalAddClick).toHaveBeenCalledWith('address');
    expect(errSpy).not.toHaveBeenCalled();
  });
});
