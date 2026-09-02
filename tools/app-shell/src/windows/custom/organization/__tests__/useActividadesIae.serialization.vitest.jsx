// ETP-5112 regression — `enforceSingleDefault` must sweep its sibling rows one PATCH at a
// time, never with `Promise.all(others.map(...))`.
//
// This is the worst shape for core's non-thread-safe `updated` parser
// (`JsonToDataConverter` line 129, a `private final static SimpleDateFormat`): the sweep
// fans out one write PER SIBLING ROW, so an organization with several IAE activities fires
// N concurrent PATCHes and any two of them can corrupt each other's parse — the loser
// coming back as a 500 conflict against a row nobody touched.
//
// The assertion is NON-OVERLAP, not arrival order: `Promise.all` maps in order too. See
// `@/test/requestJournal.js`.
//
// The sweep's ORIGINAL semantics are asserted alongside, because the obvious "fix" —
// breaking the loop on the first failure — would serialize correctly while silently
// dropping the guarantee the hook's docstring makes: a failed sweep on one sibling must
// not stop the others from being corrected.

import { renderHook, act, waitFor } from '@testing-library/react';
import { createStableUseApiFetchMock } from '@/test/mockUseApiFetch.js';
import { createRequestJournal } from '@/test/requestJournal.js';

vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: createStableUseApiFetchMock(),
}));

import { useActividadesIae } from '../useActividadesIae.js';

const API_BASE_URL = '/sws/neo/organization';
const ORG_ID = 'org-1';

const KEEP_ID = 'row-keep';
// Three siblings, not one: a single sweep target cannot expose an overlap, and the whole
// point of this call site is that it fans out.
const SIBLING_IDS = ['row-a', 'row-b', 'row-c'];

const ALL_ROWS = [
  { id: KEEP_ID, default: false, epiaeCode: 'K' },
  ...SIBLING_IDS.map((id, i) => ({ id, default: true, epiaeCode: `S${i}` })),
];

function okJson(body) {
  return { ok: true, status: 200, json: async () => body };
}

function rowIdFromUrl(url) {
  return url.split('/actividadesDelIae/')[1]?.split('?')[0] ?? null;
}

/** Mounts the hook with `ALL_ROWS` already loaded. */
async function mountLoaded() {
  globalThis.fetch = vi.fn(async () => okJson({ response: { data: ALL_ROWS } }));
  const { result } = renderHook(() => useActividadesIae(ORG_ID, API_BASE_URL));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.rows).toHaveLength(ALL_ROWS.length);
  return result;
}

/**
 * Journalling `fetch` for the sweep. `delayedId` is held open long enough that a
 * concurrent sweep would start the next PATCH inside its window; `failingIds` reject so
 * the per-row `catch` and the loop's refusal to break can be asserted.
 */
function installJournalledFetch({ delayedId = SIBLING_IDS[0], failingIds = [] } = {}) {
  const journal = createRequestJournal();
  globalThis.fetch = vi.fn((url, options) => {
    if (options?.method !== 'PATCH') return Promise.resolve(okJson({ response: { data: [] } }));
    const id = rowIdFromUrl(url);
    return journal.track(id, {
      delayMs: id === delayedId ? 30 : 0,
      result: () => (failingIds.includes(id)
        ? { ok: false, status: 500, json: async () => ({}) }
        : okJson({ response: { data: [{ id, default: false }] } })),
    });
  });
  return journal;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useActividadesIae — enforceSingleDefault serialization (ETP-5112)', () => {
  it('never has two sweep PATCHes in flight at the same time', async () => {
    const result = await mountLoaded();
    const journal = installJournalledFetch();

    await act(async () => {
      await result.current.enforceSingleDefault(KEEP_ID);
    });

    expect(journal.labels()).toEqual(SIBLING_IDS);
    // `Promise.all(others.map(...))` yields -3 here: rows b and c stamp their start ticks
    // while row a is still open.
    expect(journal.minOverlapGap()).toBeGreaterThan(0);
  });

  it('never overlaps when every sibling is equally slow', async () => {
    const result = await mountLoaded();
    const journal = createRequestJournal();
    globalThis.fetch = vi.fn((url, options) => {
      if (options?.method !== 'PATCH') return Promise.resolve(okJson({ response: { data: [] } }));
      return journal.track(rowIdFromUrl(url), {
        delayMs: 15,
        result: () => okJson({ response: { data: [] } }),
      });
    });

    await act(async () => {
      await result.current.enforceSingleDefault(KEEP_ID);
    });

    expect(journal.entries).toHaveLength(SIBLING_IDS.length);
    expect(journal.minOverlapGap()).toBeGreaterThan(0);
  });

  it('does not touch the row being kept', async () => {
    const result = await mountLoaded();
    const journal = installJournalledFetch();

    await act(async () => {
      await result.current.enforceSingleDefault(KEEP_ID);
    });

    expect(journal.labels()).not.toContain(KEEP_ID);
  });

  it('clears every sibling with default:false, one body per row', async () => {
    const result = await mountLoaded();
    installJournalledFetch();

    await act(async () => {
      await result.current.enforceSingleDefault(KEEP_ID);
    });

    const patches = globalThis.fetch.mock.calls.filter(([, o]) => o?.method === 'PATCH');
    expect(patches).toHaveLength(SIBLING_IDS.length);
    patches.forEach(([, options]) => {
      expect(JSON.parse(options.body)).toEqual({ default: false });
    });
  });

  // Semantics the serialization must preserve — see the hook's docstring.
  it('keeps sweeping the remaining siblings after one of them fails', async () => {
    const result = await mountLoaded();
    const journal = installJournalledFetch({ failingIds: [SIBLING_IDS[0]] });

    await act(async () => {
      // Swallowed per row: the caller must not see the failed sibling as a rejection.
      await expect(result.current.enforceSingleDefault(KEEP_ID)).resolves.toBeUndefined();
    });

    expect(journal.labels()).toEqual(SIBLING_IDS);
    expect(journal.minOverlapGap()).toBeGreaterThan(0);
  });

  it('keeps sweeping when the failure is in the middle of the fan-out', async () => {
    const result = await mountLoaded();
    const journal = installJournalledFetch({ failingIds: [SIBLING_IDS[1]] });

    await act(async () => {
      await result.current.enforceSingleDefault(KEEP_ID);
    });

    // The row AFTER the failing one was still attempted — a `break` would stop here.
    expect(journal.labels()).toContain(SIBLING_IDS[2]);
    expect(journal.labels()).toEqual(SIBLING_IDS);
  });

  it('issues no request at all when there is no other default row', async () => {
    globalThis.fetch = vi.fn(async () => okJson({
      response: { data: [{ id: KEEP_ID, default: false }, { id: 'other', default: false }] },
    }));
    const { result } = renderHook(() => useActividadesIae(ORG_ID, API_BASE_URL));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const journal = installJournalledFetch();
    await act(async () => {
      await result.current.enforceSingleDefault(KEEP_ID);
    });

    expect(journal.entries).toHaveLength(0);
  });
});
