/**
 * ETP-4994 (follow-up) — the saved grid state lives only while the user stays inside the
 * window it belongs to.
 *
 * "Inside the window" = the list route `/<window>` and every record/form route under it
 * (`/<window>/<id>`, `/<window>/new`). Any navigation whose first path segment differs
 * leaves the window, and the state of the window being left must be dropped — so coming
 * back later (menu, browser back, a dashboard shortcut) lands on the window's default view.
 *
 * Contract under test (pure, in `listViewSession.js`):
 *  - `windowScopeFromPath(pathname)` -> the window segment (the ListView `listStateScope`),
 *    or null for the root.
 *  - `pruneListStateOnNavigation(prevPathname, nextPathname)` -> clears
 *    `listState:<prevScope>` when the window segment changes and returns the cleared scope;
 *    returns null (and touches nothing) when staying in the window or on first load.
 *
 * The router wiring that calls it is covered by
 * `lib/__tests__/ListStateRouteGuard.vitest.jsx`.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStorage } from '../../test/localStorage.js';
import {
  listStateKey,
  persistListState,
  readListState,
  windowScopeFromPath,
  pruneListStateOnNavigation,
} from '../listViewSession.js';

const EMPTY_DEFAULTS = {
  columnFilters: {},
  advancedFilter: null,
  subsetIndex: null,
  quickFilterIndices: [],
  sortColumn: null,
  sortDirection: null,
};

const COMPLETED = {
  ...EMPTY_DEFAULTS,
  columnFilters: { documentStatus: { operator: 'equals', value: 'CO' } },
};

let storage;

beforeEach(() => {
  storage = createMemoryStorage();
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true, writable: true, value: storage,
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true, writable: true, value: undefined,
  });
});

describe('windowScopeFromPath', () => {
  it('returns the window segment of a list route', () => {
    assert.equal(windowScopeFromPath('/sales-invoice'), 'sales-invoice');
  });

  it('returns the same window segment for record and new-record routes', () => {
    assert.equal(windowScopeFromPath('/sales-invoice/ABC123'), 'sales-invoice');
    assert.equal(windowScopeFromPath('/sales-invoice/new'), 'sales-invoice');
  });

  it('ignores trailing slashes', () => {
    assert.equal(windowScopeFromPath('/sales-invoice/'), 'sales-invoice');
  });

  it('returns null for the root and for empty input', () => {
    assert.equal(windowScopeFromPath('/'), null);
    assert.equal(windowScopeFromPath(''), null);
    assert.equal(windowScopeFromPath(null), null);
    assert.equal(windowScopeFromPath(undefined), null);
  });
});

describe('pruneListStateOnNavigation — staying inside the window (case 1 / case 3)', () => {
  it('keeps the state when opening a record from the list', () => {
    persistListState('sales-invoice', COMPLETED, EMPTY_DEFAULTS);
    const cleared = pruneListStateOnNavigation('/sales-invoice', '/sales-invoice/INV-1');
    assert.equal(cleared, null);
    assert.ok(readListState('sales-invoice'), 'state must survive list -> form');
  });

  it('keeps the state when returning from a record to the list', () => {
    persistListState('sales-invoice', COMPLETED, EMPTY_DEFAULTS);
    assert.equal(pruneListStateOnNavigation('/sales-invoice/INV-1', '/sales-invoice'), null);
    assert.ok(readListState('sales-invoice'), 'state must survive form -> list');
  });

  it('keeps the state when moving between records of the same window', () => {
    persistListState('sales-invoice', COMPLETED, EMPTY_DEFAULTS);
    assert.equal(pruneListStateOnNavigation('/sales-invoice/INV-1', '/sales-invoice/new'), null);
    assert.ok(readListState('sales-invoice'));
  });

  it('does nothing on first load / F5 (no previous pathname)', () => {
    persistListState('sales-invoice', COMPLETED, EMPTY_DEFAULTS);
    assert.equal(pruneListStateOnNavigation(null, '/sales-invoice'), null);
    assert.equal(pruneListStateOnNavigation(undefined, '/sales-invoice/INV-1'), null);
    assert.ok(readListState('sales-invoice'), 'a reload inside the window must keep the state');
  });

  it('does nothing when the pathname did not change (query-only navigation)', () => {
    persistListState('sales-invoice', COMPLETED, EMPTY_DEFAULTS);
    assert.equal(pruneListStateOnNavigation('/sales-invoice', '/sales-invoice'), null);
    assert.ok(readListState('sales-invoice'));
  });
});

describe('pruneListStateOnNavigation — leaving the window (case 2 / case 4 / case 5)', () => {
  it('clears the state when navigating from the list to another window', () => {
    persistListState('sales-invoice', COMPLETED, EMPTY_DEFAULTS);
    const cleared = pruneListStateOnNavigation('/sales-invoice', '/business-partner');
    assert.equal(cleared, 'sales-invoice');
    assert.equal(storage.getItem(listStateKey('sales-invoice')), null);
    assert.equal(readListState('sales-invoice'), null);
  });

  it('clears the state when leaving from a record route', () => {
    persistListState('sales-invoice', COMPLETED, EMPTY_DEFAULTS);
    assert.equal(pruneListStateOnNavigation('/sales-invoice/INV-1', '/business-partner'), 'sales-invoice');
    assert.equal(readListState('sales-invoice'), null);
  });

  it('clears the state when going to the dashboard', () => {
    persistListState('sales-invoice', COMPLETED, EMPTY_DEFAULTS);
    assert.equal(pruneListStateOnNavigation('/sales-invoice', '/dashboard'), 'sales-invoice');
    assert.equal(readListState('sales-invoice'), null);
  });

  it('clears the state when going to the root', () => {
    persistListState('sales-invoice', COMPLETED, EMPTY_DEFAULTS);
    assert.equal(pruneListStateOnNavigation('/sales-invoice', '/'), 'sales-invoice');
    assert.equal(readListState('sales-invoice'), null);
  });

  it('only clears the window being left, never the destination', () => {
    persistListState('sales-invoice', COMPLETED, EMPTY_DEFAULTS);
    persistListState('business-partner', COMPLETED, EMPTY_DEFAULTS);
    pruneListStateOnNavigation('/sales-invoice', '/business-partner');
    assert.equal(readListState('sales-invoice'), null);
    assert.ok(readListState('business-partner'), 'the destination window state is not touched');
  });

  it('does not throw when nothing was stored', () => {
    assert.doesNotThrow(() => pruneListStateOnNavigation('/sales-invoice', '/business-partner'));
    assert.equal(readListState('sales-invoice'), null);
  });

  it('does not throw when sessionStorage is unavailable', () => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get() { throw new Error('SecurityError'); },
    });
    assert.doesNotThrow(() => pruneListStateOnNavigation('/sales-invoice', '/business-partner'));
  });
});
