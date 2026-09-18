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
  getCatalogOptions: vi.fn(() => []),
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

import { getCatalogOptions } from '@/lib/selectorCatalog.js';
import {
  normalizePatchFieldValues,
  applyCalloutFieldUpdates,
  applyCalloutComboUpdates,
  runAddLineAction,
} from '../DetailView.jsx';
// applyOneComboEntry (the per-combo worker behind applyCalloutComboUpdates) is
// not re-exported from DetailView.jsx — it's only importable from its
// definition site. This is the function ETP-4772's stale-response guard
// actually runs for combos; applyCalloutComboUpdates unconditionally skips
// the trigger field before ever reaching it, so the trigger-field staleness
// path can only be exercised by calling applyOneComboEntry directly.
import { applyOneComboEntry } from '../detailViewHelpers.jsx';

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

  // handleEntryIdentifierChange's `entry.value && api?.selectors` branch (ETP-4706):
  // callout returned an id without _identifier — resolve the display label from an
  // already-loaded catalog instead of leaving the field's identifier blank.
  describe('resolving a missing identifier from loaded catalogs', () => {
    afterEach(() => {
      vi.mocked(getCatalogOptions).mockReset().mockReturnValue([]);
    });

    it('emits key$_identifier from a matching catalog option (label field)', () => {
      vi.mocked(getCatalogOptions).mockReturnValue([{ id: 'WH1', label: 'Main Warehouse' }]);
      const a = makeArgs({ api: { selectors: [{ field: 'warehouse', entity: 'lines' }] } });
      applyCalloutFieldUpdates(
        { warehouse: { value: 'WH1' } },
        a,
      );
      expect(a.hook.handleChange).toHaveBeenCalledWith('warehouse$_identifier', 'Main Warehouse');
    });

    it('falls back to name, then _identifier, when the option has no label', () => {
      vi.mocked(getCatalogOptions).mockReturnValue([{ id: 'WH1', name: 'Main Warehouse (name)' }]);
      const a = makeArgs({ api: { selectors: [{ field: 'warehouse', entity: 'lines' }] } });
      applyCalloutFieldUpdates(
        { warehouse: { value: 'WH1' } },
        a,
      );
      expect(a.hook.handleChange).toHaveBeenCalledWith('warehouse$_identifier', 'Main Warehouse (name)');
    });

    it('does not emit an identifier when no selector matches the field', () => {
      vi.mocked(getCatalogOptions).mockReturnValue([{ id: 'WH1', label: 'Main Warehouse' }]);
      const a = makeArgs({ api: { selectors: [{ field: 'otherField', entity: 'lines' }] } });
      applyCalloutFieldUpdates(
        { warehouse: { value: 'WH1' } },
        a,
      );
      expect(a.hook.handleChange).toHaveBeenCalledTimes(1);
      expect(a.hook.handleChange).toHaveBeenCalledWith('warehouse', 'WH1');
    });

    it('does not emit an identifier when the selector matches but no catalog option has that id', () => {
      vi.mocked(getCatalogOptions).mockReturnValue([{ id: 'OTHER_ID', label: 'Not This One' }]);
      const a = makeArgs({ api: { selectors: [{ field: 'warehouse', entity: 'lines' }] } });
      applyCalloutFieldUpdates(
        { warehouse: { value: 'WH1' } },
        a,
      );
      expect(a.hook.handleChange).toHaveBeenCalledTimes(1);
      expect(a.hook.handleChange).toHaveBeenCalledWith('warehouse', 'WH1');
    });
  });
});

// ETP-4772: opening a new Purchase/Sales Order auto-fires a callout for the
// default warehouse. If the user changes warehouse before that default
// callout's response arrives, the OLD (stale) response used to win
// unconditionally via the "trigger field always wins" rule — reverting the
// user's choice back to the default. These tests exercise the generation
// guard (dispatchSnapshot vs fieldGenerationRef) that fixes it.
describe('applyCalloutFieldUpdates — ETP-4772 stale response guard', () => {
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

  it('discards a stale response for the trigger field itself when a newer edit happened since dispatch', () => {
    const fieldGenerationRef = { current: {} };
    // Simulate the race: the default auto-callout dispatched at generation 1,
    // then the user edits warehouse again before its response comes back,
    // bumping the field to generation 2.
    fieldGenerationRef.current.warehouse = 2;
    const staleDispatchSnapshot = { warehouse: 1 };

    const a = makeArgs({
      triggerField: 'warehouse',
      data: { warehouse: 'USER_CHOSEN' },
      userTouchedRef: { current: new Set(['warehouse']) },
      dispatchSnapshot: staleDispatchSnapshot,
      fieldGenerationRef,
    });
    applyCalloutFieldUpdates(
      { warehouse: { value: 'DEFAULT_WH' } },
      a,
    );

    expect(a.appliedFields.has('warehouse')).toBe(false);
    expect(a.hook.handleChange).not.toHaveBeenCalled();
    // The stale response must not have bumped generation further.
    expect(fieldGenerationRef.current.warehouse).toBe(2);
  });

  it('applies a fresh (non-stale) response for the trigger field and bumps its generation', () => {
    const fieldGenerationRef = { current: { warehouse: 1 } };
    const freshDispatchSnapshot = { warehouse: 1 };

    const a = makeArgs({
      triggerField: 'warehouse',
      data: { warehouse: 'USER_CHOSEN' },
      userTouchedRef: { current: new Set(['warehouse']) },
      dispatchSnapshot: freshDispatchSnapshot,
      fieldGenerationRef,
    });
    applyCalloutFieldUpdates(
      { warehouse: { value: 'DEFAULT_WH' } },
      a,
    );

    expect(a.appliedFields.get('warehouse')).toBe('DEFAULT_WH');
    expect(a.hook.handleChange).toHaveBeenCalledWith('warehouse', 'DEFAULT_WH');
    expect(fieldGenerationRef.current.warehouse).toBe(2);
  });

  it('discards a stale collateral update the same way as a stale trigger-field update', () => {
    const fieldGenerationRef = { current: { priceList: 3 } };
    const staleDispatchSnapshot = { priceList: 1 };

    const a = makeArgs({
      triggerField: 'businessPartner',
      data: { priceList: 'USER_CHOSEN' },
      userTouchedRef: { current: new Set() },
      dispatchSnapshot: staleDispatchSnapshot,
      fieldGenerationRef,
    });
    applyCalloutFieldUpdates(
      { priceList: { value: 'DEFAULT_PL' } },
      a,
    );

    expect(a.appliedFields.has('priceList')).toBe(false);
    expect(a.hook.handleChange).not.toHaveBeenCalled();
  });

  it('still applies when no generation tracking is wired (backwards compatible with hand-built ctx)', () => {
    const a = makeArgs({ triggerField: 'warehouse' });
    applyCalloutFieldUpdates(
      { warehouse: { value: 'WH1' } },
      a,
    );
    expect(a.appliedFields.get('warehouse')).toBe('WH1');
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

// ETP-4772 (combo path): the actual bug that motivated the guard was the
// warehouse selector arriving through `combos.warehouse: { selected, entries }`
// on a fresh-record callout, not through the plain `updates` map exercised by
// the `applyCalloutFieldUpdates` suite above. Every combo update funnels
// through `applyOneComboEntry`, which carries the same isStaleCalloutResponse
// check — these tests exercise that path directly.
describe('applyOneComboEntry — ETP-4772 stale response guard (combos)', () => {
  function makeArgs(overrides = {}) {
    return {
      data: {},
      userTouchedRef: { current: new Set() },
      appliedFields: new Map(),
      hook: { handleChange: vi.fn() },
      ...overrides,
    };
  }

  it('discards a stale combo response when a newer edit happened since dispatch', () => {
    const fieldGenerationRef = { current: { warehouse: 2 } };
    const staleDispatchSnapshot = { warehouse: 1 };

    const a = makeArgs({
      data: { warehouse: 'USER_CHOSEN' },
      userTouchedRef: { current: new Set(['warehouse']) },
      dispatchSnapshot: staleDispatchSnapshot,
      fieldGenerationRef,
    });

    applyOneComboEntry(
      'warehouse',
      { selected: 'DEFAULT_WH', _identifier: 'Default Warehouse' },
      a,
    );

    expect(a.appliedFields.has('warehouse')).toBe(false);
    expect(a.hook.handleChange).not.toHaveBeenCalled();
    // The stale response must not have bumped generation further.
    expect(fieldGenerationRef.current.warehouse).toBe(2);
  });

  it('applies a fresh (non-stale) combo response and bumps its generation', () => {
    const fieldGenerationRef = { current: { warehouse: 1 } };
    const freshDispatchSnapshot = { warehouse: 1 };

    const a = makeArgs({
      data: { warehouse: '' },
      dispatchSnapshot: freshDispatchSnapshot,
      fieldGenerationRef,
    });

    applyOneComboEntry(
      'warehouse',
      { selected: 'DEFAULT_WH', _identifier: 'Default Warehouse' },
      a,
    );

    expect(a.appliedFields.get('warehouse')).toBe('DEFAULT_WH');
    expect(a.hook.handleChange).toHaveBeenCalledWith('warehouse', 'DEFAULT_WH');
    expect(a.hook.handleChange).toHaveBeenCalledWith('warehouse$_identifier', 'Default Warehouse');
    expect(fieldGenerationRef.current.warehouse).toBe(2);
  });

  it('applies an up-to-date collateral combo normally (legitimate case not broken by the guard)', () => {
    // Collateral field (e.g. address) whose combo response is not stale —
    // dispatch generation matches current generation, so it must still apply
    // like it always did before ETP-4772.
    const fieldGenerationRef = { current: { address: 1 } };
    const currentDispatchSnapshot = { address: 1 };

    const a = makeArgs({
      data: { address: '' },
      dispatchSnapshot: currentDispatchSnapshot,
      fieldGenerationRef,
    });

    applyOneComboEntry(
      'address',
      { selected: 'A1', _identifier: 'Street 1' },
      a,
    );

    expect(a.appliedFields.get('address')).toBe('A1');
    expect(a.hook.handleChange).toHaveBeenCalledWith('address', 'A1');
    expect(a.hook.handleChange).toHaveBeenCalledWith('address$_identifier', 'Street 1');
    expect(fieldGenerationRef.current.address).toBe(2);
  });

  it('still applies when no generation tracking is wired (backwards compatible with hand-built ctx)', () => {
    const a = makeArgs();

    applyOneComboEntry(
      'warehouse',
      { selected: 'WH1', _identifier: 'Main Warehouse' },
      a,
    );

    expect(a.appliedFields.get('warehouse')).toBe('WH1');
    expect(a.hook.handleChange).toHaveBeenCalledWith('warehouse', 'WH1');
    expect(a.hook.handleChange).toHaveBeenCalledWith('warehouse$_identifier', 'Main Warehouse');
  });
});

// ETP-5190: ETP-4772's generation counter was bumped by EVERY applied callout
// write, including a write of an EMPTY value onto a field that was ALSO still
// empty. That write changes nothing on the form, but the bump made every OLDER
// in-flight response for that same field look stale — and nothing ever retries
// a dropped callout response, so the field stayed empty forever. Selecting a
// business partner fires ~7 header callouts in ~1.6s, so `partnerAddress` /
// `warehouse` came back permanently blank and Guardar stayed disabled.
//
// The fix only bumps the generation for a genuinely non-empty write. These
// tests pin BOTH halves: the empty write must still reach the form (an
// intentional clear is a legitimate callout answer) while leaving the
// generation alone, and a real non-empty write must STILL bump it so
// ETP-4772's protection of a user edit is not weakened.
describe('applyCalloutFieldUpdates / applyOneComboEntry — ETP-5190 empty write must not advance the generation', () => {
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

  // A ctx whose handleChange writes back into `data`, the way useEntity does in
  // the real component. Needed for the ordered sequence tests below, where the
  // second response must observe the field state left by the first one.
  function makeLiveArgs(data, dispatchSnapshot, fieldGenerationRef, overrides = {}) {
    return makeArgs({
      data,
      dispatchSnapshot,
      fieldGenerationRef,
      hook: { handleChange: vi.fn((k, v) => { data[k] = v; }) },
      ...overrides,
    });
  }

  describe('an empty answer for a still-empty field applies but does not bump', () => {
    for (const [label, emptyValue] of [
      ["the empty string", ''],
      ['null', null],
      ['undefined', undefined],
    ]) {
      it(`applies ${label} to a still-empty field without advancing its generation`, () => {
        const fieldGenerationRef = { current: { warehouse: 0 } };
        const a = makeArgs({
          data: { warehouse: '' },
          dispatchSnapshot: { warehouse: 0 },
          fieldGenerationRef,
        });

        applyCalloutFieldUpdates({ warehouse: { value: emptyValue } }, a);

        // The write itself still happens — the empty-skip guard deliberately
        // lets an intentional clear through when there is nothing to protect.
        expect(a.appliedFields.has('warehouse')).toBe(true);
        expect(a.appliedFields.get('warehouse')).toBe(emptyValue);
        expect(a.hook.handleChange).toHaveBeenCalledWith('warehouse', emptyValue);
        // ...but the generation must stand still, or every older in-flight
        // response for this field is silently dropped as stale (ETP-5190).
        expect(fieldGenerationRef.current.warehouse).toBe(0);
      });
    }

    it('does not create a generation entry for a field that had none when the answer is empty', () => {
      const fieldGenerationRef = { current: {} };
      const a = makeArgs({
        data: { partnerAddress: '' },
        dispatchSnapshot: {},
        fieldGenerationRef,
      });

      applyCalloutFieldUpdates({ partnerAddress: { value: '' } }, a);

      expect(a.hook.handleChange).toHaveBeenCalledWith('partnerAddress', '');
      expect(fieldGenerationRef.current.partnerAddress).toBeUndefined();
    });
  });

  // The exact ordered sequence observed in ETP-5190: two callouts dispatched
  // from the same business-partner change, the one answering EMPTY lands
  // first, the one carrying the REAL value lands second and must win.
  describe('out-of-order responses: the empty one lands first, the real value still wins', () => {
    it('keeps the real warehouse arriving via combos after an earlier empty updates write', () => {
      const data = { warehouse: '' };
      const fieldGenerationRef = { current: { warehouse: 0 } };
      // Callout A (the one that will answer with the real warehouse) is
      // dispatched first and snapshots generation 0.
      const snapshotA = { ...fieldGenerationRef.current };
      // Callout B is dispatched right after, still at generation 0.
      const snapshotB = { ...fieldGenerationRef.current };

      // B's response arrives FIRST, answering empty for a still-empty field.
      const b = makeLiveArgs(data, snapshotB, fieldGenerationRef, { triggerField: 'businessPartner' });
      applyCalloutFieldUpdates({ warehouse: { value: '' } }, b);
      expect(data.warehouse).toBe('');

      // A's response arrives second with the REAL value through the combo
      // path, which reads the very generation B would have bumped.
      const a = makeLiveArgs(data, snapshotA, fieldGenerationRef, { triggerField: 'businessPartner' });
      applyOneComboEntry('warehouse', { selected: 'WH_REAL', _identifier: 'Real Warehouse' }, a);

      // Before the fix this was discarded as stale and warehouse stayed ''
      // forever, leaving Guardar permanently disabled.
      expect(data.warehouse).toBe('WH_REAL');
      expect(a.appliedFields.get('warehouse')).toBe('WH_REAL');
      expect(a.hook.handleChange).toHaveBeenCalledWith('warehouse', 'WH_REAL');
      expect(data['warehouse$_identifier']).toBe('Real Warehouse');
      // The real write is the one that legitimately advances the generation.
      expect(fieldGenerationRef.current.warehouse).toBe(1);
    });

    it('keeps the real value arriving via updates after an earlier empty updates write', () => {
      const data = { partnerAddress: '' };
      const fieldGenerationRef = { current: { partnerAddress: 0 } };
      const snapshotA = { ...fieldGenerationRef.current };
      const snapshotB = { ...fieldGenerationRef.current };

      const b = makeLiveArgs(data, snapshotB, fieldGenerationRef, { triggerField: 'businessPartner' });
      applyCalloutFieldUpdates({ partnerAddress: { value: null } }, b);
      expect(data.partnerAddress).toBeNull();

      const a = makeLiveArgs(data, snapshotA, fieldGenerationRef, { triggerField: 'businessPartner' });
      applyCalloutFieldUpdates({ partnerAddress: { value: 'ADDR_REAL' } }, a);

      expect(data.partnerAddress).toBe('ADDR_REAL');
      expect(a.appliedFields.get('partnerAddress')).toBe('ADDR_REAL');
      expect(fieldGenerationRef.current.partnerAddress).toBe(1);
    });

    it('survives several consecutive empty answers before the real value lands', () => {
      // The BP change fires ~7 callouts; more than one can answer empty for
      // the same field. N empty writes must still leave the generation at 0.
      const data = { warehouse: '' };
      const fieldGenerationRef = { current: { warehouse: 0 } };
      const snapshotA = { ...fieldGenerationRef.current };

      for (const emptyValue of ['', null, undefined, '']) {
        const stale = makeLiveArgs(data, { ...fieldGenerationRef.current }, fieldGenerationRef, {
          triggerField: 'businessPartner',
        });
        applyCalloutFieldUpdates({ warehouse: { value: emptyValue } }, stale);
      }
      expect(fieldGenerationRef.current.warehouse).toBe(0);

      const a = makeLiveArgs(data, snapshotA, fieldGenerationRef, { triggerField: 'businessPartner' });
      applyOneComboEntry('warehouse', { selected: 'WH_REAL' }, a);

      expect(data.warehouse).toBe('WH_REAL');
      expect(fieldGenerationRef.current.warehouse).toBe(1);
    });
  });

  // ETP-4772 must remain fully in force: a NON-empty write still advances the
  // generation, so a response dispatched before it is still discarded.
  describe('ETP-4772 is not weakened by the ETP-5190 narrowing', () => {
    it('discards a response dispatched before a non-empty write, on the updates path', () => {
      const data = { warehouse: '' };
      const fieldGenerationRef = { current: { warehouse: 0 } };
      const olderSnapshot = { ...fieldGenerationRef.current };

      // A genuine non-empty write lands and bumps the generation to 1.
      const fresh = makeLiveArgs(data, { ...fieldGenerationRef.current }, fieldGenerationRef);
      applyCalloutFieldUpdates({ warehouse: { value: 'WH_CHOSEN' } }, fresh);
      expect(fieldGenerationRef.current.warehouse).toBe(1);

      // A response dispatched BEFORE that write now arrives — still stale.
      const older = makeLiveArgs(data, olderSnapshot, fieldGenerationRef);
      applyCalloutFieldUpdates({ warehouse: { value: 'WH_DEFAULT' } }, older);

      expect(older.appliedFields.has('warehouse')).toBe(false);
      expect(older.hook.handleChange).not.toHaveBeenCalled();
      expect(data.warehouse).toBe('WH_CHOSEN');
      expect(fieldGenerationRef.current.warehouse).toBe(1);
    });

    it('discards a combo response dispatched before a non-empty write, on the combo path', () => {
      const data = { warehouse: '' };
      const fieldGenerationRef = { current: { warehouse: 0 } };
      const olderSnapshot = { ...fieldGenerationRef.current };

      const fresh = makeLiveArgs(data, { ...fieldGenerationRef.current }, fieldGenerationRef);
      applyCalloutFieldUpdates({ warehouse: { value: 'WH_CHOSEN' } }, fresh);

      const older = makeLiveArgs(data, olderSnapshot, fieldGenerationRef);
      applyOneComboEntry('warehouse', { selected: 'WH_DEFAULT' }, older);

      expect(older.appliedFields.has('warehouse')).toBe(false);
      expect(older.hook.handleChange).not.toHaveBeenCalled();
      expect(data.warehouse).toBe('WH_CHOSEN');
    });
  });

  // Boundary: the empty-skip guard and the empty-no-bump rule are two
  // different things. Nobody should "simplify" ETP-5190 by skipping empty
  // writes altogether — an intentional clear from a callout must still reach
  // the form when the field is empty, and must still be ignored when the
  // field holds a value worth protecting.
  describe('intentional-clear boundary', () => {
    it('skips the empty answer entirely when the field already holds a value', () => {
      const fieldGenerationRef = { current: { warehouse: 0 } };
      const a = makeArgs({
        data: { warehouse: 'EXISTING' },
        dispatchSnapshot: { warehouse: 0 },
        fieldGenerationRef,
      });

      applyCalloutFieldUpdates({ warehouse: { value: '' } }, a);

      expect(a.appliedFields.has('warehouse')).toBe(false);
      expect(a.hook.handleChange).not.toHaveBeenCalled();
      expect(fieldGenerationRef.current.warehouse).toBe(0);
    });

    it('still forwards the empty answer to the form when the field is empty', () => {
      const fieldGenerationRef = { current: { warehouse: 0 } };
      const a = makeArgs({
        data: { warehouse: '' },
        dispatchSnapshot: { warehouse: 0 },
        fieldGenerationRef,
      });

      applyCalloutFieldUpdates({ warehouse: { value: '' } }, a);

      expect(a.hook.handleChange).toHaveBeenCalledWith('warehouse', '');
    });

    it('does not bump the generation for an empty answer even without generation tracking wired', () => {
      // Backwards-compatible ctx (no dispatchSnapshot/fieldGenerationRef):
      // must not throw and must still apply the empty write.
      const a = makeArgs({ data: { warehouse: '' } });
      applyCalloutFieldUpdates({ warehouse: { value: '' } }, a);
      expect(a.hook.handleChange).toHaveBeenCalledWith('warehouse', '');
    });
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
