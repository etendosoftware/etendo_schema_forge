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
import { createApiFetch } from '@etendosoftware/app-shell-core/auth';

// `rememberRecordVersion` is re-exported for the panels that never read at all: they get
// `data` through props from `useEntity`, which remembers the token under the `null` bucket.
// Seeding it directly is how a test stands in for that provider.
export {
  resetRecordVersionsForTests, rememberRecordVersion,
} from '@etendosoftware/app-shell-core/lib/recordVersions.js';

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
