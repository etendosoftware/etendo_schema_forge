/**
 * Records the options every call site hands to `apiFetch`, while the REAL client still performs
 * the request.
 *
 * Why a recorder and not the `globalThis.fetch` stub alone: the core client consumes its own
 * options (`timeout`, `on401`, `baseUrl`, `token`) and never forwards them to `fetch`, so an
 * assertion like "the render opts out of the default timeout" (ETP-5424, `timeout: 0`) is only
 * observable one level up. Wrapping keeps the real behaviour — headers, 401 handling, the
 * TypeError → NetworkError translation — so a suite that uses it still exercises production code.
 *
 * Usage (the factory must import lazily, `vi.mock` is hoisted above static imports):
 *
 *   vi.mock('@/auth/useApiFetch.js', async (importOriginal) => {
 *     const { wrapUseApiFetchModule } = await import('@/test/recordApiFetch.js');
 *     return wrapUseApiFetchModule(await importOriginal());
 *   });
 *   vi.mock('@etendosoftware/app-shell-core/auth/api', async (importOriginal) => {
 *     const { wrapApiFetchModule } = await import('@/test/recordApiFetch.js');
 *     return wrapApiFetchModule(await importOriginal());
 *   });
 *   import { apiFetchCalls, resetApiFetchCalls } from '@/test/recordApiFetch.js';
 */

export const apiFetchCalls = [];

export function resetApiFetchCalls() {
  apiFetchCalls.length = 0;
}

/** The recorded calls whose path contains `fragment`. */
export function apiFetchCallsTo(fragment) {
  return apiFetchCalls.filter(({ path }) => String(path).includes(fragment));
}

function record(real) {
  return (path, options = {}) => {
    apiFetchCalls.push({ path, options });
    return real(path, options);
  };
}

/**
 * Wraps `@/auth/useApiFetch.js`. The wrapper is cached per real client so its identity is as
 * stable as the one it wraps — a fresh function per render would re-fire every effect that lists
 * `apiFetch` as a dependency.
 */
export function wrapUseApiFetchModule(actual) {
  const wrapped = new WeakMap();
  return {
    ...actual,
    useApiFetch: (...args) => {
      const real = actual.useApiFetch(...args);
      if (!wrapped.has(real)) wrapped.set(real, record(real));
      return wrapped.get(real);
    },
  };
}

/** Wraps a module that exports the ambient `apiFetch` (core `auth/api`, `@/auth/api.js`). */
export function wrapApiFetchModule(actual) {
  return { ...actual, apiFetch: record(actual.apiFetch) };
}
