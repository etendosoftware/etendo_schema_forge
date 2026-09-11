/**
 * ETP-5190 — `useFirstSteps`, the transport layer for the post-signup First Steps state.
 *
 * Everything here runs against a mocked `globalThis.fetch`; no request ever leaves the
 * process. The hook reads its session through `useApiFetch`, which reads it with the
 * core's `useAuthOptional` — so per `docs/request-policy.md` the test supplies a SESSION
 * (a stable object from the mocked core module), never a `token` prop.
 */
import { renderHook, act, waitFor } from '@testing-library/react';

// One stable object per test — a fresh object each render would make `useApiFetch`'s memo
// churn and could refire the GET on every commit.
const SESSION = Object.freeze({ token: 'test-token' });
const authState = vi.hoisted(() => ({ value: null }));

vi.mock('@etendosoftware/app-shell-core/auth', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuthOptional: () => authState.value,
}));

import {
  useFirstSteps,
  sanitizeCompletedIds,
  normalizeFirstStepsState,
  FIRST_STEPS_STATE_VERSION,
} from '../useFirstSteps.js';

const ENDPOINT = '/sws/go/onboarding/first-steps';
const ALLOWED = ['company-data', 'products', 'contacts', 'team'];

const okJson = (body) => ({
  ok: true,
  status: 200,
  headers: { get: () => 'application/json' },
  json: async () => body,
});
const httpError = (status = 500) => ({
  ok: false,
  status,
  headers: { get: () => 'application/json' },
  json: async () => ({ status: 'error' }),
});

const methodOf = (init) => String(init?.method || 'GET').toUpperCase();
const callsWithMethod = (method) => globalThis.fetch.mock.calls
  .filter(([, init]) => methodOf(init) === method);
const postBodies = () => callsWithMethod('POST').map(([, init]) => JSON.parse(init.body).firstSteps);

/** GET answers `getPayload`; every POST answers `postResponse` (or a factory of it). */
function stubEndpoint({ getPayload = { status: 'success', firstSteps: null }, getResponse, postResponse } = {}) {
  globalThis.fetch = vi.fn(async (url, init) => {
    expect(String(url)).toContain(ENDPOINT);
    if (methodOf(init) === 'GET') {
      if (getResponse) return typeof getResponse === 'function' ? getResponse() : getResponse;
      return okJson(getPayload);
    }
    if (postResponse) return typeof postResponse === 'function' ? postResponse() : postResponse;
    return okJson({ status: 'success' });
  });
}

/** Renders the hook with the writable allowlist and waits for the initial GET to settle. */
async function renderLoaded(options = { allowedIds: ALLOWED }) {
  const view = renderHook(() => useFirstSteps(options));
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
}

beforeEach(() => {
  authState.value = SESSION;
  stubEndpoint();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sanitizeCompletedIds', () => {
  it('keeps only allowed ids, in allowlist order', () => {
    expect(sanitizeCompletedIds(['team', 'products'], ALLOWED)).toEqual(['products', 'team']);
  });

  it('drops ids outside the allowlist', () => {
    expect(sanitizeCompletedIds(['create-account', 'fiscal-config', 'products'], ALLOWED)).toEqual(['products']);
  });

  it('de-duplicates', () => {
    expect(sanitizeCompletedIds(['products', 'products'], ALLOWED)).toEqual(['products']);
  });

  it('returns [] for a non-array input', () => {
    expect(sanitizeCompletedIds(null, ALLOWED)).toEqual([]);
    expect(sanitizeCompletedIds(undefined, ALLOWED)).toEqual([]);
    expect(sanitizeCompletedIds('products', ALLOWED)).toEqual([]);
  });

  it('with no allowlist, de-duplicates and keeps only strings', () => {
    expect(sanitizeCompletedIds(['a', 'a', 5, null, 'b'], null)).toEqual(['a', 'b']);
  });
});

describe('normalizeFirstStepsState', () => {
  it('maps a never-saved (null) payload to not-seen / nothing-completed', () => {
    expect(normalizeFirstStepsState(null, ALLOWED)).toEqual({
      v: FIRST_STEPS_STATE_VERSION,
      seen: false,
      completed: [],
    });
  });

  it('treats a non-boolean `seen` as false', () => {
    expect(normalizeFirstStepsState({ seen: 'true' }, ALLOWED).seen).toBe(false);
    expect(normalizeFirstStepsState({ seen: 1 }, ALLOWED).seen).toBe(false);
    expect(normalizeFirstStepsState({ seen: true }, ALLOWED).seen).toBe(true);
  });

  it('always stamps the current state version', () => {
    expect(normalizeFirstStepsState({ v: 99, seen: true, completed: [] }, ALLOWED).v)
      .toBe(FIRST_STEPS_STATE_VERSION);
  });
});

describe('useFirstSteps — initial load', () => {
  it('maps `firstSteps: null` to { seen: false, completed: [] }', async () => {
    stubEndpoint({ getPayload: { status: 'success', firstSteps: null } });
    const { result } = await renderLoaded();

    expect(result.current.seen).toBe(false);
    expect(result.current.completed).toEqual([]);
    expect(result.current.error).toBe(null);
  });

  it('issues exactly one GET and no POST on mount', async () => {
    await renderLoaded();
    expect(callsWithMethod('GET')).toHaveLength(1);
    expect(callsWithMethod('POST')).toHaveLength(0);
  });

  it('loads a saved state and filters `completed` through the allowlist', async () => {
    stubEndpoint({
      getPayload: {
        status: 'success',
        firstSteps: { v: 1, seen: true, completed: ['team', 'products', 'create-account', 'ghost'] },
      },
    });
    const { result } = await renderLoaded();

    expect(result.current.seen).toBe(true);
    // Allowlist order, and the non-writable / unknown ids are gone.
    expect(result.current.completed).toEqual(['products', 'team']);
  });

  it('sends the bearer token and Accept-Language on the GET (shared helper, not a raw fetch)', async () => {
    await renderLoaded();
    const [, init] = callsWithMethod('GET')[0];
    expect(init.headers.Authorization).toBe('Bearer test-token');
    expect(init.headers['Accept-Language']).toBeDefined();
  });
});

describe('useFirstSteps — no session yet', () => {
  it('fires no GET at all while `token` is null, and stays in loading', async () => {
    authState.value = null;
    const { result } = renderHook(() => useFirstSteps({ allowedIds: ALLOWED }));

    // Let every pending microtask/effect flush before concluding "no request".
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(globalThis.fetch).not.toHaveBeenCalled();
    // Deliberately still loading: a 401 from an unauthenticated GET would be read as an
    // expired session and log the user out.
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBe(null);
    expect(result.current.completed).toEqual([]);
  });

  it('fires the GET once the session arrives', async () => {
    authState.value = null;
    const { result, rerender } = renderHook(() => useFirstSteps({ allowedIds: ALLOWED }));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(globalThis.fetch).not.toHaveBeenCalled();

    authState.value = SESSION;
    rerender();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(callsWithMethod('GET')).toHaveLength(1);
  });
});

describe('useFirstSteps — failed load', () => {
  it('degrades to error "load" with nothing completed, and is NOT stuck loading', async () => {
    stubEndpoint({ getResponse: httpError(500) });
    const { result } = await renderLoaded();

    expect(result.current.error).toBe('load');
    expect(result.current.completed).toEqual([]);
    expect(result.current.seen).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it('behaves the same when the request rejects outright (network down)', async () => {
    globalThis.fetch = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    const { result } = await renderLoaded();

    expect(result.current.error).toBe('load');
    expect(result.current.completed).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('behaves the same when the body is not JSON', async () => {
    stubEndpoint({
      getResponse: {
        ok: true,
        status: 200,
        headers: { get: () => 'text/html' },
        json: async () => { throw new SyntaxError('Unexpected token <'); },
      },
    });
    const { result } = await renderLoaded();

    expect(result.current.error).toBe('load');
    expect(result.current.loading).toBe(false);
  });
});

describe('useFirstSteps — toggleStep', () => {
  it('marks a step complete, POSTs the full next state and reports success', async () => {
    const { result } = await renderLoaded();

    let outcome;
    await act(async () => { outcome = await result.current.toggleStep('products'); });

    expect(outcome).toBe(true);
    expect(result.current.completed).toEqual(['products']);
    expect(postBodies()).toEqual([
      { v: FIRST_STEPS_STATE_VERSION, seen: false, completed: ['products'] },
    ]);
  });

  it('un-marks a step that was already complete', async () => {
    stubEndpoint({
      getPayload: { status: 'success', firstSteps: { v: 1, seen: true, completed: ['products', 'team'] } },
    });
    const { result } = await renderLoaded();

    await act(async () => { await result.current.toggleStep('products'); });

    expect(result.current.completed).toEqual(['team']);
    expect(postBodies().at(-1).completed).toEqual(['team']);
  });

  it('keeps the persisted `completed` in allowlist order regardless of click order', async () => {
    const { result } = await renderLoaded();

    await act(async () => { await result.current.toggleStep('team'); });
    await act(async () => { await result.current.toggleStep('company-data'); });

    expect(result.current.completed).toEqual(['company-data', 'team']);
    expect(postBodies().at(-1).completed).toEqual(['company-data', 'team']);
  });

  it('preserves `seen` across a toggle (the POST replaces the whole object)', async () => {
    stubEndpoint({
      getPayload: { status: 'success', firstSteps: { v: 1, seen: true, completed: [] } },
    });
    const { result } = await renderLoaded();

    await act(async () => { await result.current.toggleStep('contacts'); });

    expect(postBodies().at(-1)).toEqual({
      v: FIRST_STEPS_STATE_VERSION, seen: true, completed: ['contacts'],
    });
  });

  it('rolls the state back and reports failure when the POST fails', async () => {
    stubEndpoint({
      getPayload: { status: 'success', firstSteps: { v: 1, seen: false, completed: ['company-data'] } },
      postResponse: httpError(500),
    });
    const { result } = await renderLoaded();
    const before = result.current.completed;
    expect(before).toEqual(['company-data']);

    let outcome;
    await act(async () => { outcome = await result.current.toggleStep('products'); });

    expect(outcome).toBe(false);
    expect(result.current.completed).toEqual(before);
    expect(result.current.error).toBe('save');
  });

  it('rolls back an UN-check too, so the row cannot lose a completion the server kept', async () => {
    stubEndpoint({
      getPayload: { status: 'success', firstSteps: { v: 1, seen: false, completed: ['products'] } },
      postResponse: httpError(500),
    });
    const { result } = await renderLoaded();

    let outcome;
    await act(async () => { outcome = await result.current.toggleStep('products'); });

    expect(outcome).toBe(false);
    expect(result.current.completed).toEqual(['products']);
  });

  it('clears a previous save error after a successful toggle', async () => {
    let failNext = true;
    stubEndpoint({ postResponse: () => (failNext ? httpError(500) : okJson({ status: 'success' })) });
    const { result } = await renderLoaded();

    await act(async () => { await result.current.toggleStep('products'); });
    expect(result.current.error).toBe('save');

    failNext = false;
    await act(async () => { await result.current.toggleStep('products'); });
    expect(result.current.error).toBe(null);
    expect(result.current.completed).toEqual(['products']);
  });
});

describe('useFirstSteps — allowedIds is the write allowlist', () => {
  it('makes a non-toggleable id a no-op that still reports success', async () => {
    const { result } = await renderLoaded();
    const postsBefore = callsWithMethod('POST').length;

    let outcome;
    await act(async () => { outcome = await result.current.toggleStep('create-account'); });

    // Nothing to persist, so nothing failed — the page must not show an error toast.
    expect(outcome).toBe(true);
    expect(callsWithMethod('POST')).toHaveLength(postsBefore);
    expect(result.current.completed).toEqual([]);
  });

  it('never lets a non-toggleable id reach a POST body, even mid-sequence', async () => {
    const { result } = await renderLoaded();

    for (const id of ['company-data', 'create-account', 'products', 'fiscal-config', 'contacts', 'team']) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => { await result.current.toggleStep(id); });
    }

    expect(result.current.completed).toEqual(['company-data', 'products', 'contacts', 'team']);
    const forbidden = ['create-account', 'fiscal-config'];
    for (const body of postBodies()) {
      for (const id of forbidden) {
        expect(body.completed, `POST body ${JSON.stringify(body.completed)}`).not.toContain(id);
      }
    }
    // The two always-done clicks produced no request of their own.
    expect(postBodies()).toHaveLength(4);
  });

  it('with no allowlist at all (the dashboard gate), toggleStep is not filtered', async () => {
    // The gate never toggles, but the hook must not silently drop writes for a caller that
    // omits `allowedIds` — that would be a confusing partial contract.
    const { result } = await renderLoaded({});
    await act(async () => { await result.current.toggleStep('anything'); });
    expect(postBodies().at(-1).completed).toEqual(['anything']);
  });
});

describe('useFirstSteps — markSeen', () => {
  it('POSTs seen: true once and flips the local flag', async () => {
    const { result } = await renderLoaded();

    let outcome;
    await act(async () => { outcome = await result.current.markSeen(); });

    expect(outcome).toBe(true);
    expect(result.current.seen).toBe(true);
    expect(postBodies()).toEqual([
      { v: FIRST_STEPS_STATE_VERSION, seen: true, completed: [] },
    ]);
  });

  it('sends exactly one POST when called twice in a row', async () => {
    const { result } = await renderLoaded();

    await act(async () => { await result.current.markSeen(); });
    await act(async () => { await result.current.markSeen(); });

    expect(callsWithMethod('POST')).toHaveLength(1);
  });

  it('sends exactly one POST when called twice in the SAME tick (StrictMode double effect)', async () => {
    const { result } = await renderLoaded();

    await act(async () => {
      await Promise.all([result.current.markSeen(), result.current.markSeen()]);
    });

    expect(callsWithMethod('POST')).toHaveLength(1);
  });

  it('sends no POST at all when the state is already seen', async () => {
    stubEndpoint({
      getPayload: { status: 'success', firstSteps: { v: 1, seen: true, completed: [] } },
    });
    const { result } = await renderLoaded();

    let outcome;
    await act(async () => { outcome = await result.current.markSeen(); });

    expect(outcome).toBe(true);
    expect(callsWithMethod('POST')).toHaveLength(0);
  });

  it('releases the guard and restores `seen` when the POST fails, so the next visit retries', async () => {
    let failNext = true;
    stubEndpoint({ postResponse: () => (failNext ? httpError(500) : okJson({ status: 'success' })) });
    const { result } = await renderLoaded();

    let outcome;
    await act(async () => { outcome = await result.current.markSeen(); });

    expect(outcome).toBe(false);
    expect(result.current.seen).toBe(false);
    expect(result.current.error).toBe('save');

    // Guard released — a retry actually issues a second POST and succeeds.
    failNext = false;
    await act(async () => { outcome = await result.current.markSeen(); });

    expect(outcome).toBe(true);
    expect(result.current.seen).toBe(true);
    expect(callsWithMethod('POST')).toHaveLength(2);
  });

  it('preserves `completed` when recording the visit', async () => {
    stubEndpoint({
      getPayload: { status: 'success', firstSteps: { v: 1, seen: false, completed: ['products'] } },
    });
    const { result } = await renderLoaded();

    await act(async () => { await result.current.markSeen(); });

    expect(postBodies().at(-1)).toEqual({
      v: FIRST_STEPS_STATE_VERSION, seen: true, completed: ['products'],
    });
  });
});
