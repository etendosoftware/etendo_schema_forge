/**
 * Test seam for the ETP-5112 `updated`-token regression tests.
 *
 * `@/test/mockUseApiFetch.js` replaces `apiFetch` with a thin `globalThis.fetch` wrapper.
 * That is the right double for almost everything — but it BYPASSES the code under test
 * here. The whole of ETP-5112's bug-1 fix lives inside the core helper: `auth/api.js`
 * harvests the `updated` optimistic-locking token off every GET response (keyed by entity
 * AND id) and injects it into the PUT/PATCH that follows. A screen that reads a record and
 * then writes it is only armed BECAUSE it goes through that helper, so a test that stubs
 * the helper away can never show the token going out.
 *
 * So these tests keep the REAL `createApiFetch` and stub `globalThis.fetch` underneath it.
 * What each screen's test then proves is its own half of the contract: that the panel reads
 * the record through `apiFetch` (not a raw `fetch`, not a bypassing double) before writing
 * it, at a path whose (entity, id) matches the write — which is exactly what makes the
 * server-side concurrency check pass instead of answering 400 `missing_updated`.
 */
import { beforeEach } from 'vitest';
import { createApiFetch } from '@etendosoftware/app-shell-core/auth';
// The `auth/api` subpath, not the `auth` barrel: the barrel does not re-export the write-chain
// test seam (it only forwards the public helpers), and it also pulls in `AuthContext.jsx`.
import { resetRecordWriteChainsForTests } from '@etendosoftware/app-shell-core/auth/api';
import {
  resetRecordVersionsForTests as resetCoreRecordVersions,
  rememberRecordVersion as rememberCoreRecordVersion,
} from '@etendosoftware/app-shell-core/lib/recordVersions.js';

// `rememberRecordVersion` is re-exported for the panels that never read at all: they get
// `data` through props from `useEntity`, which remembers the token under the `null` bucket.
// Seeding it directly is how a test stands in for that provider.
export { rememberCoreRecordVersion as rememberRecordVersion };

/**
 * Drops BOTH pieces of module-level state the real `apiFetch` keeps per record: the `updated`
 * token cache (ETP-5112) and the pending write chains (ETP-5255).
 *
 * The second one is not an optimisation — do NOT "simplify" this back into a plain re-export of
 * the core's `resetRecordVersionsForTests`. Since ETP-5255 the core serialises `PUT`/`PATCH` per
 * (entity, id): each write awaits the previous write to the SAME record, and its chain entry is
 * removed only when it settles. The suites that use this harness prove single-flight behaviour by
 * deliberately holding a write OPEN and never settling it, which is the whole technique — so a
 * chain entry survives the test that created it, and the next test in the file that writes the
 * same record would await it forever, never reaching `globalThis.fetch`. The symptom is a bizarre
 * order-dependent failure: the test passes alone and reports `expected [] to have a length of 1`
 * when run with its siblings.
 *
 * Both caches are therefore cleared HERE, in the one place every such suite already goes through,
 * rather than in each suite — a per-suite call is exactly the trap that was hit once and would be
 * hit again by the next suite written.
 */
export function resetRecordVersionsForTests() {
  resetCoreRecordVersions();
  resetRecordWriteChainsForTests();
}

// Importing this harness is enough to be protected: not every suite that drives the real
// `apiFetch` needs the `updated`-token seam (some only want `jsonResponse`), and such a suite has
// no reason to guess that it must reset per-record state it never touches by name.
beforeEach(() => {
  resetRecordVersionsForTests();
});

/**
 * A `useApiFetch` replacement backed by the real core helper.
 *
 * Cached per base URL for the same reason `createStableUseApiFetchMock` is: a fresh
 * function on every render re-fires any effect that lists `apiFetch` as a dependency.
 */
export function createRealUseApiFetchMock({ token = 'test-token' } = {}) {
  const cache = new Map();
  return (base = '') => {
    if (!cache.has(base)) {
      cache.set(base, createApiFetch(base, () => token, () => {}));
    }
    return cache.get(base);
  };
}

/**
 * A response double the core helper can actually harvest from. Three things matter and all
 * three are easy to omit by accident, each silently disabling the harvest:
 *
 * - `headers.get('content-type')` must say JSON — reads are only harvested for JSON bodies;
 * - `clone()` must return an INDEPENDENT body, because the helper reads the clone while the
 *   caller reads the original (a `clone()` that returns `this` is deliberately skipped by
 *   the helper, so the caller is never starved);
 * - the payload must carry the record's `id` and `updated`, since that pair is the cache key.
 */
export function jsonResponse(payload, { ok = true, status = 200 } = {}) {
  const body = JSON.stringify(payload ?? {});
  const make = () => ({
    ok,
    status,
    headers: { get: (name) => (String(name).toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => JSON.parse(body),
    text: async () => body,
    clone: () => make(),
  });
  return make();
}

/** NEO's list/record envelope. */
export function neoResponse(records, options) {
  const rows = Array.isArray(records) ? records : [records];
  return jsonResponse({ response: { data: rows, totalRows: rows.length } }, options);
}

/** Parses the JSON body of a recorded `fetch` call. */
export function bodyOf(call) {
  return JSON.parse(call[1].body);
}

/** The recorded `fetch` calls that used one of the versioned write methods. */
export function writeCalls(fetchMock) {
  return fetchMock.mock.calls.filter(([, options]) => (
    ['PUT', 'PATCH'].includes(String(options?.method || '').toUpperCase())
  ));
}
