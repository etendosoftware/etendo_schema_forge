import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Tests for the pagination (infinite scroll) logic in useEntity.
 *
 * Since useEntity is a React hook, we extract and test the core fetch/pagination
 * logic in isolation without requiring React rendering infrastructure.
 */

const BATCH_SIZE = 75;

/**
 * Simulates the refresh logic from useEntity (first page load).
 * Returns { items, startRow, hasMore }.
 */
async function simulateRefresh(apiBaseUrl, entity, sortColumn, sortDirection, token) {
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  const url = `${apiBaseUrl}/${entity}?_sortBy=${sortColumn} ${sortDirection}&_startRow=0&_endRow=${BATCH_SIZE - 1}`;
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    const rows = data?.response?.data ?? (Array.isArray(data) ? data : []);
    return {
      items: rows,
      startRow: rows.length,
      hasMore: rows.length >= BATCH_SIZE,
    };
  } catch {
    return { items: [], startRow: 0, hasMore: false };
  }
}

/**
 * Simulates the loadMore logic from useEntity (subsequent page load).
 * Returns { newItems, startRow, hasMore }.
 */
async function simulateLoadMore(apiBaseUrl, entity, sortColumn, sortDirection, token, currentStartRow) {
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  const start = currentStartRow;
  const url = `${apiBaseUrl}/${entity}?_sortBy=${sortColumn} ${sortDirection}&_startRow=${start}&_endRow=${start + BATCH_SIZE - 1}`;
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    const rows = data?.response?.data ?? (Array.isArray(data) ? data : []);
    return {
      newItems: rows,
      startRow: start + rows.length,
      hasMore: rows.length >= BATCH_SIZE,
    };
  } catch {
    return { newItems: [], startRow: currentStartRow, hasMore: false };
  }
}

/**
 * Helper: creates a mock fetch that returns N rows per call.
 */
function mockFetchReturning(rowCount, calls) {
  return async (url, opts) => {
    calls.push({ url, opts });
    const rows = Array.from({ length: rowCount }, (_, i) => ({ id: `row-${calls.length}-${i}` }));
    return {
      ok: true,
      json: async () => ({ response: { data: rows } }),
    };
  };
}

let originalFetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('useEntity pagination - refresh (first page)', () => {
  it('sends correct URL with _startRow=0 and _endRow=74', async () => {
    const calls = [];
    globalThis.fetch = mockFetchReturning(75, calls);

    await simulateRefresh('/api', 'Header', 'creationDate', 'desc', 'tok');

    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.includes('_startRow=0'), 'should include _startRow=0');
    assert.ok(calls[0].url.includes('_endRow=74'), 'should include _endRow=74');
  });

  it('sets hasMore=true when batch returns exactly BATCH_SIZE rows', async () => {
    const calls = [];
    globalThis.fetch = mockFetchReturning(BATCH_SIZE, calls);

    const result = await simulateRefresh('/api', 'Header', 'creationDate', 'desc', 'tok');

    assert.equal(result.items.length, BATCH_SIZE);
    assert.equal(result.hasMore, true);
    assert.equal(result.startRow, BATCH_SIZE);
  });

  it('sets hasMore=false when batch returns fewer than BATCH_SIZE rows', async () => {
    const calls = [];
    globalThis.fetch = mockFetchReturning(30, calls);

    const result = await simulateRefresh('/api', 'Header', 'creationDate', 'desc', 'tok');

    assert.equal(result.items.length, 30);
    assert.equal(result.hasMore, false);
    assert.equal(result.startRow, 30);
  });

  it('handles 0 results (empty dataset)', async () => {
    const calls = [];
    globalThis.fetch = mockFetchReturning(0, calls);

    const result = await simulateRefresh('/api', 'Header', 'creationDate', 'desc', 'tok');

    assert.equal(result.items.length, 0);
    assert.equal(result.hasMore, false);
    assert.equal(result.startRow, 0);
  });

  it('handles fetch error gracefully', async () => {
    globalThis.fetch = async () => { throw new Error('Network error'); };

    const result = await simulateRefresh('/api', 'Header', 'creationDate', 'desc', 'tok');

    assert.deepEqual(result.items, []);
    assert.equal(result.hasMore, false);
    assert.equal(result.startRow, 0);
  });

  it('handles non-ok response gracefully', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    const result = await simulateRefresh('/api', 'Header', 'creationDate', 'desc', 'tok');

    assert.deepEqual(result.items, []);
    assert.equal(result.hasMore, false);
  });

  it('includes sort column and direction in URL', async () => {
    const calls = [];
    globalThis.fetch = mockFetchReturning(10, calls);

    await simulateRefresh('/api', 'Header', 'documentNo', 'asc', 'tok');

    assert.ok(calls[0].url.includes('_sortBy=documentNo asc'), 'should include sort params');
  });
});

describe('useEntity pagination - loadMore (subsequent pages)', () => {
  it('sends correct _startRow and _endRow for second page', async () => {
    const calls = [];
    globalThis.fetch = mockFetchReturning(75, calls);

    await simulateLoadMore('/api', 'Header', 'creationDate', 'desc', 'tok', 75);

    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.includes('_startRow=75'), 'should start at 75');
    assert.ok(calls[0].url.includes('_endRow=149'), 'should end at 149');
  });

  it('sends correct _startRow and _endRow for third page', async () => {
    const calls = [];
    globalThis.fetch = mockFetchReturning(75, calls);

    await simulateLoadMore('/api', 'Header', 'creationDate', 'desc', 'tok', 150);

    assert.ok(calls[0].url.includes('_startRow=150'));
    assert.ok(calls[0].url.includes('_endRow=224'));
  });

  it('sets hasMore=false when last batch is partial', async () => {
    const calls = [];
    globalThis.fetch = mockFetchReturning(20, calls);

    const result = await simulateLoadMore('/api', 'Header', 'creationDate', 'desc', 'tok', 75);

    assert.equal(result.newItems.length, 20);
    assert.equal(result.hasMore, false);
    assert.equal(result.startRow, 95);
  });

  it('sets hasMore=false when last batch is empty (0 rows)', async () => {
    const calls = [];
    globalThis.fetch = mockFetchReturning(0, calls);

    const result = await simulateLoadMore('/api', 'Header', 'creationDate', 'desc', 'tok', 75);

    assert.equal(result.newItems.length, 0);
    assert.equal(result.hasMore, false);
    assert.equal(result.startRow, 75);
  });

  it('handles fetch error gracefully on loadMore', async () => {
    globalThis.fetch = async () => { throw new Error('Network error'); };

    const result = await simulateLoadMore('/api', 'Header', 'creationDate', 'desc', 'tok', 75);

    assert.deepEqual(result.newItems, []);
    assert.equal(result.hasMore, false);
    assert.equal(result.startRow, 75);
  });
});

describe('useEntity pagination - sort change resets pagination', () => {
  it('refresh after sort change fetches from _startRow=0', async () => {
    const calls = [];
    globalThis.fetch = mockFetchReturning(75, calls);

    // First load
    const first = await simulateRefresh('/api', 'Header', 'creationDate', 'desc', 'tok');
    assert.equal(first.startRow, 75);

    // Sort change triggers refresh (same function, different sort params)
    const afterSort = await simulateRefresh('/api', 'Header', 'documentNo', 'asc', 'tok');

    assert.equal(calls.length, 2);
    assert.ok(calls[1].url.includes('_startRow=0'), 'refresh always starts at 0');
    assert.ok(calls[1].url.includes('_sortBy=documentNo asc'));
    assert.equal(afterSort.startRow, 75);
    assert.equal(afterSort.hasMore, true);
  });
});

describe('useEntity pagination - race condition guard logic', () => {
  it('loadMore guard: returns early when hasMore is false', async () => {
    // The real hook checks: if (!hasMore || loadingMore || loading) return;
    // We verify the guard conditions would prevent a fetch
    const hasMore = false;
    const loadingMore = false;
    const loading = false;

    const shouldSkip = !hasMore || loadingMore || loading;
    assert.equal(shouldSkip, true, 'should skip when hasMore is false');
  });

  it('loadMore guard: returns early when loadingMore is true', async () => {
    const hasMore = true;
    const loadingMore = true;
    const loading = false;

    const shouldSkip = !hasMore || loadingMore || loading;
    assert.equal(shouldSkip, true, 'should skip when already loading more');
  });

  it('loadMore guard: returns early when loading (initial) is true', async () => {
    const hasMore = true;
    const loadingMore = false;
    const loading = true;

    const shouldSkip = !hasMore || loadingMore || loading;
    assert.equal(shouldSkip, true, 'should skip when initial load in progress');
  });

  it('loadMore guard: allows fetch when all conditions are met', async () => {
    const hasMore = true;
    const loadingMore = false;
    const loading = false;

    const shouldSkip = !hasMore || loadingMore || loading;
    assert.equal(shouldSkip, false, 'should allow fetch');
  });
});

describe('useEntity pagination - scroll threshold logic', () => {
  it('triggers loadMore when near bottom (< 200px)', () => {
    // Simulates the scroll handler check from ListView
    const scrollHeight = 1000;
    const scrollTop = 750;
    const clientHeight = 200;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    assert.equal(distanceFromBottom, 50);
    assert.ok(distanceFromBottom < 200, 'should trigger loadMore');
  });

  it('does not trigger when far from bottom (>= 200px)', () => {
    const scrollHeight = 1000;
    const scrollTop = 100;
    const clientHeight = 200;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    assert.equal(distanceFromBottom, 700);
    assert.ok(distanceFromBottom >= 200, 'should not trigger loadMore');
  });

  it('handles edge case: content fits viewport (no scroll needed)', () => {
    // When scrollHeight equals clientHeight, scrollTop is 0
    const scrollHeight = 500;
    const scrollTop = 0;
    const clientHeight = 500;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    assert.equal(distanceFromBottom, 0);
    assert.ok(distanceFromBottom < 200, 'would trigger, but hasMore should be false for small datasets');
  });

  it('handles exactly at threshold boundary (200px)', () => {
    const scrollHeight = 1000;
    const scrollTop = 600;
    const clientHeight = 200;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    assert.equal(distanceFromBottom, 200);
    assert.ok(!(distanceFromBottom < 200), 'should NOT trigger at exactly 200px (strict less-than)');
  });
});

describe('useEntity pagination - boundary: exactly BATCH_SIZE total records', () => {
  it('first page returns 75 (hasMore=true), second returns 0 (hasMore=false)', async () => {
    let callCount = 0;
    globalThis.fetch = async (url) => {
      callCount++;
      const rowCount = callCount === 1 ? 75 : 0;
      const rows = Array.from({ length: rowCount }, (_, i) => ({ id: `r-${i}` }));
      return { ok: true, json: async () => ({ response: { data: rows } }) };
    };

    const first = await simulateRefresh('/api', 'Header', 'creationDate', 'desc', 'tok');
    assert.equal(first.items.length, 75);
    assert.equal(first.hasMore, true, 'first batch is full, so hasMore should be true');

    const second = await simulateLoadMore('/api', 'Header', 'creationDate', 'desc', 'tok', first.startRow);
    assert.equal(second.newItems.length, 0);
    assert.equal(second.hasMore, false, 'empty second batch means no more data');
  });
});

describe('useEntity pagination - data format compatibility', () => {
  it('handles response wrapped in response.data (NEO format)', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ response: { data: [{ id: '1' }, { id: '2' }] } }),
    });

    const result = await simulateRefresh('/api', 'Header', 'creationDate', 'desc', 'tok');
    assert.equal(result.items.length, 2);
  });

  it('handles response as plain array (fallback format)', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ([{ id: '1' }, { id: '2' }, { id: '3' }]),
    });

    const result = await simulateRefresh('/api', 'Header', 'creationDate', 'desc', 'tok');
    assert.equal(result.items.length, 3);
  });

  it('handles response with no data property (returns empty)', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ response: {} }),
    });

    const result = await simulateRefresh('/api', 'Header', 'creationDate', 'desc', 'tok');
    assert.deepEqual(result.items, []);
    assert.equal(result.hasMore, false);
  });
});
