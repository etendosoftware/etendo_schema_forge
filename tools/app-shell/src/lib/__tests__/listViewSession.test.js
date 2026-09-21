/**
 * ETP-4994 — listViewSession: the sessionStorage-backed grid snapshot.
 *
 * This file covers the module in isolation (every storage failure mode, the
 * default-equality invariant, the index sanitizers). The ListView wiring that
 * consumes it — seeding the real state on remount — is covered by
 * `components/contract-ui/__tests__/ListView.sessionState.vitest.jsx`.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStorage } from '../../test/localStorage.js';
import {
  listStateKey,
  readListState,
  persistListState,
  isDefaultListState,
  clearListState,
  resolveDefaultSubsetIndex,
  resolveDefaultQuickFilterIndices,
  sanitizeFilterIndices,
} from '../listViewSession.js';

const SCOPE = 'sales-order';

/** Installs a storage object (or a throwing accessor) as globalThis.sessionStorage. */
function installStorage(descriptor) {
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    ...descriptor,
  });
}

function installMemory() {
  const store = createMemoryStorage();
  installStorage({ writable: true, value: store });
  return store;
}

function uninstall() {
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    writable: true,
    value: undefined,
  });
}

/** The snapshot a window with no declared defaults would produce untouched. */
const EMPTY_DEFAULTS = {
  columnFilters: {},
  advancedFilter: null,
  subsetIndex: null,
  quickFilterIndices: [],
  sortColumn: null,
  sortDirection: null,
};

const FILTERED = {
  ...EMPTY_DEFAULTS,
  columnFilters: { country: { operator: 'equals', value: 'ES' } },
};

let storage;

beforeEach(() => {
  storage = installMemory();
});

afterEach(() => {
  uninstall();
});

describe('listStateKey', () => {
  it('namespaces the scope so two windows never collide', () => {
    assert.equal(listStateKey('sales-order'), 'listState:sales-order');
    assert.notEqual(listStateKey('sales-order'), listStateKey('purchase-order'));
  });
});

describe('persistListState / readListState round trip', () => {
  it('stores and restores a column filter (acceptance case 1)', () => {
    persistListState(SCOPE, FILTERED, EMPTY_DEFAULTS);

    const restored = readListState(SCOPE);
    assert.deepEqual(restored.columnFilters, { country: { operator: 'equals', value: 'ES' } });
    assert.equal(restored.v, 1);
  });

  it('stores and restores column filters, advanced filter and sort together (acceptance case 3)', () => {
    persistListState(SCOPE, {
      columnFilters: {
        country: { operator: 'equals', value: 'ES' },
        documentNo: { operator: 'contains', value: 'INV' },
      },
      advancedFilter: { conditions: [{ field: 'amount', operator: 'greater', value: 100 }] },
      subsetIndex: 1,
      quickFilterIndices: [2, 0],
      sortColumn: 'documentNo',
      sortDirection: 'desc',
    }, EMPTY_DEFAULTS);

    const restored = readListState(SCOPE);
    assert.deepEqual(restored.columnFilters, {
      country: { operator: 'equals', value: 'ES' },
      documentNo: { operator: 'contains', value: 'INV' },
    });
    assert.deepEqual(restored.advancedFilter, {
      conditions: [{ field: 'amount', operator: 'greater', value: 100 }],
    });
    assert.equal(restored.subsetIndex, 1);
    assert.equal(restored.sortColumn, 'documentNo');
    assert.equal(restored.sortDirection, 'desc');
  });

  it('normalizes quickFilterIndices to a sorted array so key order never matters', () => {
    persistListState(SCOPE, { ...EMPTY_DEFAULTS, quickFilterIndices: [3, 1, 2] }, EMPTY_DEFAULTS);
    assert.deepEqual(readListState(SCOPE).quickFilterIndices, [1, 2, 3]);
  });

  it('keeps two scopes independent', () => {
    persistListState('sales-order', FILTERED, EMPTY_DEFAULTS);
    persistListState('purchase-order', {
      ...EMPTY_DEFAULTS,
      sortColumn: 'orderDate',
      sortDirection: 'asc',
    }, EMPTY_DEFAULTS);

    assert.deepEqual(readListState('sales-order').columnFilters, FILTERED.columnFilters);
    assert.deepEqual(readListState('purchase-order').columnFilters, {});
    assert.equal(readListState('purchase-order').sortColumn, 'orderDate');
    assert.equal(readListState('sales-order').sortColumn, null);
  });

  it('round-trips unknown extra state without corrupting the known fields', () => {
    // NOTE (acceptance case 2 — "column order"): the app has NO user-facing column
    // reorder feature today (`onColumnsReady` merely echoes the columns prop; no drag
    // handlers on the headers), so there is no column order to persist. This test pins
    // the property that matters the day one is added: an unrecognised key in the
    // snapshot is inert — it neither throws nor damages the fields ListView does read.
    const store = storage;
    store.setItem(listStateKey(SCOPE), JSON.stringify({
      v: 1,
      columnFilters: { country: { value: 'ES' } },
      columnOrder: ['documentNo', 'country'],
      sortColumn: 'country',
      sortDirection: 'asc',
    }));

    const restored = readListState(SCOPE);
    assert.deepEqual(restored.columnFilters, { country: { value: 'ES' } });
    assert.equal(restored.sortColumn, 'country');
    // Unknown keys survive the read untouched — a future consumer can pick them up.
    assert.deepEqual(restored.columnOrder, ['documentNo', 'country']);
  });
});

describe('persistListState — the default-state invariant (acceptance case 4)', () => {
  it('writes NOTHING when the snapshot equals the defaults', () => {
    persistListState(SCOPE, EMPTY_DEFAULTS, EMPTY_DEFAULTS);

    assert.equal(storage.getItem(listStateKey(SCOPE)), null);
    assert.equal(storage.length, 0);
    assert.equal(readListState(SCOPE), null);
  });

  it('writes nothing when the snapshot equals a window that declares non-empty defaults', () => {
    const defaults = {
      columnFilters: { status: { value: 'DR' } },
      advancedFilter: null,
      subsetIndex: 0,
      quickFilterIndices: [1],
      sortColumn: 'creationDate',
      sortDirection: 'desc',
    };
    persistListState(SCOPE, { ...defaults }, defaults);

    assert.equal(storage.length, 0);
  });

  it('removes a previously stored key once the user returns to the defaults', () => {
    persistListState(SCOPE, FILTERED, EMPTY_DEFAULTS);
    assert.notEqual(storage.getItem(listStateKey(SCOPE)), null);

    persistListState(SCOPE, EMPTY_DEFAULTS, EMPTY_DEFAULTS);

    assert.equal(storage.getItem(listStateKey(SCOPE)), null);
    assert.equal(readListState(SCOPE), null);
  });

  it('does not touch storage at all without a scope', () => {
    persistListState(null, FILTERED, EMPTY_DEFAULTS);
    persistListState(undefined, FILTERED, EMPTY_DEFAULTS);
    persistListState('', FILTERED, EMPTY_DEFAULTS);

    assert.equal(storage.length, 0);
  });
});

describe('isDefaultListState', () => {
  it('treats a reordered quick-filter selection as the same state', () => {
    assert.equal(
      isDefaultListState(
        { ...EMPTY_DEFAULTS, quickFilterIndices: [2, 0] },
        { ...EMPTY_DEFAULTS, quickFilterIndices: [0, 2] },
      ),
      true,
    );
  });

  it('treats undefined and the canonical empty value as equal', () => {
    assert.equal(isDefaultListState({}, EMPTY_DEFAULTS), true);
    assert.equal(isDefaultListState(undefined, EMPTY_DEFAULTS), true);
    assert.equal(isDefaultListState(null, null), true);
  });

  it('detects a difference in any single field', () => {
    assert.equal(isDefaultListState(FILTERED, EMPTY_DEFAULTS), false);
    assert.equal(
      isDefaultListState({ ...EMPTY_DEFAULTS, sortDirection: 'asc' }, EMPTY_DEFAULTS),
      false,
    );
    assert.equal(
      isDefaultListState({ ...EMPTY_DEFAULTS, subsetIndex: 1 }, { ...EMPTY_DEFAULTS, subsetIndex: 0 }),
      false,
    );
    assert.equal(
      isDefaultListState({ ...EMPTY_DEFAULTS, advancedFilter: { a: 1 } }, EMPTY_DEFAULTS),
      false,
    );
  });
});

describe('readListState — untrustworthy stored payloads', () => {
  it('returns null when the key is absent', () => {
    assert.equal(readListState(SCOPE), null);
  });

  it('returns null without a scope', () => {
    assert.equal(readListState(null), null);
    assert.equal(readListState(''), null);
  });

  it('treats corrupt JSON as no saved state', () => {
    storage.setItem(listStateKey(SCOPE), '{not json at all');
    assert.equal(readListState(SCOPE), null);
  });

  it('ignores a snapshot with a missing or wrong version', () => {
    storage.setItem(listStateKey(SCOPE), JSON.stringify({ columnFilters: { a: 1 } }));
    assert.equal(readListState(SCOPE), null);

    storage.setItem(listStateKey(SCOPE), JSON.stringify({ v: 2, columnFilters: { a: 1 } }));
    assert.equal(readListState(SCOPE), null);

    storage.setItem(listStateKey(SCOPE), JSON.stringify({ v: '1', columnFilters: { a: 1 } }));
    assert.equal(readListState(SCOPE), null);
  });

  it('ignores a payload that is valid JSON but not an object', () => {
    storage.setItem(listStateKey(SCOPE), JSON.stringify('nope'));
    assert.equal(readListState(SCOPE), null);

    storage.setItem(listStateKey(SCOPE), JSON.stringify(null));
    assert.equal(readListState(SCOPE), null);
  });
});

describe('storage that is missing or hostile', () => {
  it('degrades to no saved state when sessionStorage is absent', () => {
    uninstall();

    assert.equal(readListState(SCOPE), null);
    assert.doesNotThrow(() => persistListState(SCOPE, FILTERED, EMPTY_DEFAULTS));
    assert.doesNotThrow(() => clearListState(SCOPE));
  });

  it('degrades gracefully when the sessionStorage accessor itself throws (site data blocked)', () => {
    installStorage({ get() { throw new Error('site data blocked'); } });

    assert.equal(readListState(SCOPE), null);
    assert.doesNotThrow(() => persistListState(SCOPE, FILTERED, EMPTY_DEFAULTS));
    assert.doesNotThrow(() => clearListState(SCOPE));
  });

  it('degrades gracefully when getItem throws', () => {
    installStorage({
      writable: true,
      value: { getItem() { throw new Error('denied'); }, setItem() {}, removeItem() {} },
    });

    assert.equal(readListState(SCOPE), null);
  });

  it('swallows a setItem quota error instead of breaking the render', () => {
    let removed = false;
    installStorage({
      writable: true,
      value: {
        getItem: () => null,
        setItem() { throw new Error('QuotaExceededError'); },
        removeItem() { removed = true; },
      },
    });

    assert.doesNotThrow(() => persistListState(SCOPE, FILTERED, EMPTY_DEFAULTS));
    assert.equal(removed, false, 'the default branch must not have been taken');
  });

  it('swallows a removeItem error', () => {
    installStorage({
      writable: true,
      value: {
        getItem: () => null,
        setItem() {},
        removeItem() { throw new Error('denied'); },
      },
    });

    assert.doesNotThrow(() => clearListState(SCOPE));
    assert.doesNotThrow(() => persistListState(SCOPE, EMPTY_DEFAULTS, EMPTY_DEFAULTS));
  });
});

describe('clearListState', () => {
  it('removes only the requested scope', () => {
    persistListState('sales-order', FILTERED, EMPTY_DEFAULTS);
    persistListState('purchase-order', FILTERED, EMPTY_DEFAULTS);

    clearListState('sales-order');

    assert.equal(readListState('sales-order'), null);
    assert.notEqual(readListState('purchase-order'), null);
  });

  it('is a no-op without a scope', () => {
    persistListState(SCOPE, FILTERED, EMPTY_DEFAULTS);
    clearListState(null);
    assert.notEqual(readListState(SCOPE), null);
  });
});

describe('resolveDefaultSubsetIndex', () => {
  const subsets = [{ key: 'all' }, { key: 'open' }];

  it('returns null when the window declares no subsets', () => {
    assert.equal(resolveDefaultSubsetIndex(undefined, 1), null);
    assert.equal(resolveDefaultSubsetIndex([], 1), null);
  });

  it('honours a valid declared initial index', () => {
    assert.equal(resolveDefaultSubsetIndex(subsets, 1), 1);
    assert.equal(resolveDefaultSubsetIndex(subsets, 0), 0);
  });

  it('falls back to the first subset when the declared index does not exist', () => {
    assert.equal(resolveDefaultSubsetIndex(subsets, 9), 0);
    assert.equal(resolveDefaultSubsetIndex(subsets, null), 0);
    assert.equal(resolveDefaultSubsetIndex(subsets, undefined), 0);
  });
});

describe('resolveDefaultQuickFilterIndices', () => {
  const quick = [{ key: 'overdue' }, { key: 'mine' }];

  it('selects nothing by default', () => {
    assert.deepEqual(resolveDefaultQuickFilterIndices(quick, null), []);
    assert.deepEqual(resolveDefaultQuickFilterIndices(undefined, undefined), []);
  });

  it('selects the declared initial filter when it exists', () => {
    assert.deepEqual(resolveDefaultQuickFilterIndices(quick, 1), [1]);
  });

  it('selects nothing when the declared index points nowhere', () => {
    assert.deepEqual(resolveDefaultQuickFilterIndices(quick, 5), []);
  });
});

describe('sanitizeFilterIndices', () => {
  const quick = [{ key: 'overdue' }, { key: 'mine' }];

  it('returns null when there is nothing to sanitize', () => {
    assert.equal(sanitizeFilterIndices(undefined, quick), null);
    assert.equal(sanitizeFilterIndices(null, quick), null);
    assert.equal(sanitizeFilterIndices('0,1', quick), null);
  });

  it('drops indices that no longer point at a live filter (snapshot outlived the props)', () => {
    assert.deepEqual(sanitizeFilterIndices([0, 7], quick), [0]);
    assert.deepEqual(sanitizeFilterIndices([5, 9], quick), []);
    assert.deepEqual(sanitizeFilterIndices([0, 1], quick), [0, 1]);
  });

  it('drops non-integer entries', () => {
    assert.deepEqual(sanitizeFilterIndices([0, '1', 1.5, null], quick), [0]);
  });

  it('drops everything when the window no longer declares quick filters', () => {
    assert.deepEqual(sanitizeFilterIndices([0, 1], undefined), []);
    assert.deepEqual(sanitizeFilterIndices([0, 1], []), []);
  });
});
