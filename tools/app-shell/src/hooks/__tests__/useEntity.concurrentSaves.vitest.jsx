import { renderHook, act } from '@testing-library/react';
import { useEntity } from '../useEntity';

/**
 * ETP-5081 — two saves of the same record must never be in flight at once.
 *
 * Several controls call `handleSave` without knowing about each other: the Save button, "Add
 * lines", "Import lines", and every process button (which saves before it processes). On a
 * backend answering in seconds, the second one lands long before the first returns.
 *
 * The two overlaps fail differently, so both are pinned here:
 *
 *  - CREATE — two POSTs mean two documents. Observed leaving three empty purchase orders behind
 *    in one flow.
 *  - UPDATE — since ETP-5073 an update carries the `updated` token the client last read, and two
 *    overlapping saves necessarily carry the SAME one. The server commits the first, bumps
 *    `updated`, and refuses the second with 409 `stale_record` — the "record was changed by
 *    someone else" dialog, raised against a collision the app caused with itself, and blocking
 *    every click behind it. Reproduced in the amortization E2E flow: "Guardar" then "Crear
 *    amortización" sent two byte-identical PATCHes 510 ms apart, 200 then 409.
 *
 * Hence the asymmetry under test: creates COALESCE (one request, both callers get the record),
 * updates SERIALIZE (both requests run, never at the same time). An update must not be dropped —
 * the second caller may be saving newer edits.
 */

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

const baseOpts = {
  token: 'test-token',
  apiBaseUrl: 'http://localhost/api',
};

/** A promise plus its resolver, so a test can hold a request open. */
function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

describe('useEntity — overlapping saves of one record (ETP-5081)', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderEntity(opts = {}) {
    return renderHook(() => useEntity('header', null, { ...baseOpts, skipListFetch: true, ...opts }));
  }

  it('coalesces concurrent creates into ONE POST, and both callers get the created record', async () => {
    const created = { id: 'new-1', name: 'Created' };
    const gate = deferred();
    const posts = [];
    globalThis.fetch.mockImplementation(async (url, opts) => {
      if (url.includes('/defaults')) return { ok: true, json: async () => ({ defaults: {} }) };
      if (opts?.method === 'POST') {
        posts.push(url);
        await gate.promise;
        return { ok: true, json: async () => ({ response: { data: [created] } }) };
      }
      return { ok: true, json: async () => ({ response: { data: [] } }) };
    });

    const { result } = renderEntity();
    await act(async () => { await result.current.handleNew(); });
    act(() => { result.current.handleChange('name', 'Created'); });

    let first;
    let second;
    await act(async () => {
      first = result.current.handleSave({ silent: true });
      second = result.current.handleSave({ silent: true });
      gate.resolve();
      [first, second] = await Promise.all([first, second]);
    });

    expect(posts).toHaveLength(1);
    expect(first).toEqual(created);
    expect(second).toEqual(created);
  });

  it('runs a second update only after the first has answered — never two PATCHes in flight', async () => {
    const record = { id: 'rec-1', name: 'Original', updated: '2026-08-31T19:28:22+00:00' };
    const gate = deferred();
    let inFlight = 0;
    let maxInFlight = 0;
    const patches = [];
    globalThis.fetch.mockImplementation(async (url, opts) => {
      if (url.includes('/defaults')) return { ok: true, json: async () => ({ defaults: {} }) };
      if (opts?.method === 'PATCH' || opts?.method === 'PUT') {
        patches.push(JSON.parse(opts.body));
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        // Only the FIRST patch is held open; a serialized second one must not deadlock on it.
        if (patches.length === 1) await gate.promise;
        inFlight -= 1;
        return {
          ok: true,
          json: async () => ({ response: { data: [{ ...record, updated: '2026-08-31T19:28:24+00:00' }] } }),
        };
      }
      return { ok: true, json: async () => ({ response: { data: [] } }) };
    });

    const { result } = renderEntity();
    act(() => { result.current.handleSelect(record); });
    act(() => { result.current.handleChange('name', 'Edited'); });

    await act(async () => {
      const first = result.current.handleSave({ silent: true });
      const second = result.current.handleSave({ silent: true });
      gate.resolve();
      await Promise.all([first, second]);
    });

    // Both saves ran — dropping one would lose whatever edits it carried…
    expect(patches).toHaveLength(2);
    // …but never at the same time, which is what made them share one stale `updated`.
    expect(maxInFlight).toBe(1);
  });

  it('lets a later update run normally once the chain has drained', async () => {
    const record = { id: 'rec-2', name: 'Original', updated: 'v1' };
    const patches = [];
    globalThis.fetch.mockImplementation(async (url, opts) => {
      if (url.includes('/defaults')) return { ok: true, json: async () => ({ defaults: {} }) };
      if (opts?.method === 'PATCH' || opts?.method === 'PUT') {
        patches.push(JSON.parse(opts.body));
        return { ok: true, json: async () => ({ response: { data: [{ ...record, updated: 'v2' }] } }) };
      }
      return { ok: true, json: async () => ({ response: { data: [] } }) };
    });

    const { result } = renderEntity();
    act(() => { result.current.handleSelect(record); });

    act(() => { result.current.handleChange('name', 'One'); });
    await act(async () => { await result.current.handleSave({ silent: true }); });
    act(() => { result.current.handleChange('name', 'Two'); });
    await act(async () => { await result.current.handleSave({ silent: true }); });

    expect(patches).toHaveLength(2);
    expect(patches[1].name).toBe('Two');
  });
});
