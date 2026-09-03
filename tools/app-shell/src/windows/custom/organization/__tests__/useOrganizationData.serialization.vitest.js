// ETP-5112 regression — `useOrganizationData.save()` must issue its two PATCHes one
// AFTER the other, never concurrently.
//
// The Organización screen is the only one that writes two entities in a single save
// (`AD_Org` as entity `organization`, `AD_OrgInfo` as entity `information`). Fired with
// `Promise.all`, both PATCHes landed on two Tomcat threads in the same millisecond and
// both parsed their `updated` token through core's `private final static
// SimpleDateFormat` (`JsonToDataConverter` line 129) — which is not thread-safe. The
// loser of the race got a corrupted `Date`, the concurrency check found a difference, and
// the write came back 500 "the record has already been changed by another user" against a
// record nobody had touched.
//
// The assertion is NON-OVERLAP, not arrival order: `Promise.all` also fires the two in
// order, so an order-only test would pass against the exact defect this file guards.
// See `@/test/requestJournal.js`.

import { createStableUseApiFetchMock } from '@/test/mockUseApiFetch.js';

vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: createStableUseApiFetchMock(),
}));

import { renderHook, act, waitFor } from '@testing-library/react';
import { createRequestJournal } from '@/test/requestJournal.js';
import { useOrganizationData } from '../useOrganizationData.js';

const API_BASE_URL = '/sws/neo/organization';
const ORG_ID = 'org-1';

// AD_Org and AD_OrgInfo share the same primary key in Etendo, so the entity segment is
// the only thing that tells the two requests apart.
const HEADER_PATH = `/organization/organization/${ORG_ID}`;

function okResponse(record = {}) {
  return { ok: true, status: 200, json: async () => ({ response: { data: [record] } }) };
}

/** Mounts the hook and lets its initial load settle, so `save` starts from a clean slate. */
async function mountLoaded() {
  globalThis.fetch = vi.fn(async () => okResponse({ id: ORG_ID }));
  const { result } = renderHook(() => useOrganizationData(ORG_ID, API_BASE_URL));
  await waitFor(() => expect(result.current.loading).toBe(false));
  return result;
}

/**
 * Replaces `fetch` with a journalling double. Only PATCHes are tracked — the hook issues
 * nothing else during a save, and tracking a stray GET would add a phantom entry.
 *
 * The delay goes on the FIRST of the two writes: that is what forces a concurrent
 * implementation to stamp the second request's start tick while the first is still open.
 */
function installJournalledFetch({ headerDelayMs = 30, infoDelayMs = 0, failing = null } = {}) {
  const journal = createRequestJournal();
  globalThis.fetch = vi.fn((url, options) => {
    if (options?.method !== 'PATCH') return Promise.resolve(okResponse());
    const isHeader = url.includes(HEADER_PATH);
    const label = isHeader ? 'organization' : 'information';
    return journal.track(label, {
      delayMs: isHeader ? headerDelayMs : infoDelayMs,
      result: () => (failing === label
        ? { ok: false, status: 500, json: async () => ({}) }
        : okResponse()),
    });
  });
  return journal;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useOrganizationData — save serialization (ETP-5112)', () => {
  it('never has the information PATCH in flight while the organization PATCH is open', async () => {
    const result = await mountLoaded();
    const journal = installJournalledFetch();

    await act(async () => {
      await result.current.save({ header: { name: 'New name' }, info: { taxID: 'B999' } });
    });

    expect(journal.labels()).toEqual(['organization', 'information']);
    // Strictly greater than zero: the second write started after the first one settled.
    // `Promise.all` yields -2 here (second starts at tick 2, first settles at tick 4).
    expect(journal.minOverlapGap()).toBeGreaterThan(0);
  });

  // Same guarantee with both writes held open for the same time, so the result does not
  // depend on the first one being the slow one — under `Promise.all` the second still
  // stamps its start tick inside the first one's window and the gap goes negative.
  it('never overlaps when both writes are equally slow', async () => {
    const result = await mountLoaded();
    const journal = installJournalledFetch({ headerDelayMs: 20, infoDelayMs: 20 });

    await act(async () => {
      await result.current.save({ header: { name: 'x' }, info: { taxID: 'y' } });
    });

    expect(journal.entries).toHaveLength(2);
    expect(journal.minOverlapGap()).toBeGreaterThan(0);
  });

  it('issues only the entity that was passed, and still awaits it', async () => {
    const result = await mountLoaded();
    const journal = installJournalledFetch();

    await act(async () => {
      await result.current.save({ header: null, info: { taxID: 'only-info' } });
    });

    expect(journal.labels()).toEqual(['information']);
    const [entry] = journal.entries;
    expect(entry.finishedAt).not.toBeNull();
  });

  it('still surfaces a failing write as a throw after serializing', async () => {
    const result = await mountLoaded();
    const journal = installJournalledFetch({ failing: 'organization' });

    await expect(
      result.current.save({ header: { name: 'x' }, info: { taxID: 'y' } }),
    ).rejects.toThrow(/500/);

    // Both writes are still attempted — the first one failing must not swallow the second,
    // which is the behaviour the pre-ETP-5112 `Promise.all` had and the loop preserves.
    expect(journal.labels()).toEqual(['organization', 'information']);
    expect(journal.minOverlapGap()).toBeGreaterThan(0);
  });
});
