import { renderHook, act } from '@testing-library/react';

// ETP-5332 — handleNew's `initialData` seeding contract.
//
// The embedded "New contact" dialog (ETP-5254's RecordCreateModal +
// EmbeddedWindowRoute) needs to pre-fill the creation form with what the
// caller already knows (e.g. the typed search text, or the Cliente/Proveedor
// flag implied by the document that opened it). `useEntity` accepts an
// `initialData` option that `handleNew` applies as a seed.
//
// The safety of the whole feature rests on ONE fact, pinned here: seeded keys
// are marked as user-changed BEFORE the async `/defaults` GET is even issued.
// `mergeDefaultsPreservingUserEdits` already refuses to overwrite a
// user-changed key, so the in-flight defaults response can land after the
// seed without a new race-handling mechanism. The same marking also keeps
// `shouldSkipPayloadField` from dropping a seeded legacy-looking numeric FK
// id out of the POST payload.
//
// These tests pin:
//   - the no-`initialData` case behaves exactly as before (no regression for
//     every existing caller)
//   - `handleNew` seeds `editing` synchronously, before defaults arrive
//   - a `/defaults` response that repeats a seeded key does not clobber it,
//     but still fills every key the seed did not touch
//   - `handleNew`'s identity stays stable across re-renders even when the
//     caller passes a fresh `initialData` object literal every render

vi.mock('@/lib/observability.js', () => ({
  track: vi.fn().mockResolvedValue(undefined),
  page: vi.fn().mockResolvedValue(undefined),
  identify: vi.fn().mockResolvedValue(undefined),
  group: vi.fn().mockResolvedValue(undefined),
  groupSet: vi.fn().mockResolvedValue(undefined),
  flush: vi.fn().mockResolvedValue(undefined),
  captureException: vi.fn(),
  setContext: vi.fn(),
  initObservability: vi.fn(),
  createObservability: vi.fn(() => ({})),
  buildKpiProperties: vi.fn(() => ({})),
  trackKpiEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

import { useEntity } from '../useEntity';

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function jsonResponse(body) {
  return { ok: true, status: 200, json: async () => body };
}

async function settle() {
  await act(async () => {
    for (let i = 0; i < 10; i += 1) {
      await Promise.resolve();
    }
  });
}

describe('useEntity — initialData seeding on handleNew (ETP-5332)', () => {
  const defaultOpts = {
    token: 'test-token',
    apiBaseUrl: 'http://localhost/api',
    skipListFetch: true,
  };

  function renderEntity(entity = 'businessPartner', opts = {}) {
    return renderHook(
      ({ initialData }) => useEntity(entity, null, { ...defaultOpts, ...opts, initialData }),
      { initialProps: { initialData: opts.initialData ?? null } }
    );
  }

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  it('with no initialData, seeds editing with an empty object (no regression)', async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse({ defaults: {} }));

    const { result } = renderEntity();
    await act(async () => {
      result.current.handleNew();
    });

    expect(result.current.editing).toEqual({});
    await settle();
  });

  it('with no initialData, a later defaults response fills every key (userChangedKeys stayed empty)', async () => {
    const pending = deferred();
    globalThis.fetch.mockReturnValue(pending.promise);

    const { result } = renderEntity();
    await act(async () => {
      result.current.handleNew();
    });

    await act(async () => {
      pending.resolve(jsonResponse({ defaults: { name: 'Default Name' } }));
    });
    await settle();

    expect(result.current.editing?.name).toBe('Default Name');
  });

  it('seeds editing synchronously with initialData, before the defaults response lands', async () => {
    const pending = deferred();
    globalThis.fetch.mockReturnValue(pending.promise);

    const seed = { name: 'Acme Corp', isCustomer: true };
    const { result } = renderEntity('businessPartner', { initialData: seed });

    await act(async () => {
      result.current.handleNew();
    });

    expect(result.current.editing).toEqual(seed);

    // Drain: the defaults request is still pending; resolve it so the test
    // does not leak a dangling promise into the next one.
    await act(async () => {
      pending.resolve(jsonResponse({ defaults: {} }));
    });
    await settle();
  });

  it('a defaults response does not overwrite a seeded key, but fills non-seeded keys', async () => {
    const pending = deferred();
    globalThis.fetch.mockReturnValue(pending.promise);

    const seed = { name: 'Acme Corp' };
    const { result } = renderEntity('businessPartner', { initialData: seed });

    await act(async () => {
      result.current.handleNew();
    });

    await act(async () => {
      // The backend's own default for `name` must lose to the seed; `taxId`
      // was never seeded, so it must land normally.
      pending.resolve(jsonResponse({ defaults: { name: 'Backend Default Name', taxId: 'B12345678' } }));
    });
    await settle();

    expect(
      result.current.editing?.name,
      'a defaults response must never clobber a value the caller seeded via initialData'
    ).toBe('Acme Corp');
    expect(
      result.current.editing?.taxId,
      'a defaults response must still fill keys the seed did not touch'
    ).toBe('B12345678');
  });

  it('handleNew keeps a stable identity across re-renders when initialData is a fresh object literal', async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse({ defaults: {} }));

    const { result, rerender } = renderHook(
      ({ initialData }) => useEntity('businessPartner', null, { ...defaultOpts, initialData }),
      { initialProps: { initialData: { name: 'First' } } }
    );

    const firstHandleNew = result.current.handleNew;

    // A fresh object literal every render — exactly what a caller building
    // initialData inline (e.g. from route search params) would pass.
    rerender({ initialData: { name: 'Second' } });

    expect(
      result.current.handleNew,
      'handleNew must not be rebuilt when initialData changes identity, or useNewRouteEditingReset re-fires unnecessarily'
    ).toBe(firstHandleNew);
  });
});
