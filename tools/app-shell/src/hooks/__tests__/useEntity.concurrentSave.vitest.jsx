import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));

vi.mock('@/lib/productUsageTelemetry.js', () => ({
  isCompletionProcess: vi.fn(() => true),
  trackDocumentCompleted: vi.fn(),
  trackRecordCreated: vi.fn(),
  trackRecordUpdated: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

import { useEntity } from '../useEntity';

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    clone() { return jsonResponse(body, { ok, status }); },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
}

const opts = {
  token: 'tok-123',
  apiBaseUrl: 'http://api.test',
  specName: 'contacts',
  skipListFetch: true,
};

/**
 * ETP-4524 — Race 3 (two quick blurs, two racing PATCHes).
 *
 * handleFieldBlur (DetailView.jsx ~1866-1871) never consults `isSaving` before
 * calling hook.handleSave(). Two quick blurs (e.g. tabbing fast through two
 * fields) each call handleSave() independently, producing two overlapping
 * PATCH requests. Whichever response lands LAST wins the final
 * setSelected/setEditing, even if it is the OLDER of the two requests —
 * so a fast user can end up with the earlier (stale) save's data.
 */
describe('useEntity — concurrent handleSave calls (ETP-4524 Race 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps at most one PATCH in flight when handleSave is called twice back-to-back', async () => {
    const patchDeferreds = [];
    globalThis.fetch.mockImplementation((url, init) => {
      if (init?.method === 'PATCH') {
        const d = deferred();
        patchDeferreds.push(d);
        return d.promise;
      }
      return Promise.resolve(jsonResponse({ response: { data: [] } }));
    });

    const { result } = renderHook(() => useEntity('contact', null, opts));

    act(() => {
      result.current.handleSelect({ id: 'rec-1', firstName: 'Juan' });
    });
    act(() => {
      result.current.handleChange('firstName', 'Edit1');
    });

    // Two blurs in quick succession, both firing handleSave() before either
    // PATCH has resolved (mirrors DetailView's handleFieldBlur not checking isSaving).
    act(() => {
      result.current.handleSave();
    });
    act(() => {
      result.current.handleChange('firstName', 'Edit2');
      result.current.handleSave();
    });

    // A correct implementation coalesces the second call into a single trailing
    // save (or serializes it after the first completes) — never firing a second
    // PATCH while one is already in flight.
    expect(patchDeferreds.length).toBe(1);

    // Cleanup: resolve whatever fired so the test doesn't leave a dangling promise.
    for (const d of patchDeferreds) {
      d.resolve(jsonResponse({ response: { data: [{ id: 'rec-1', firstName: 'Edit2' }] } }));
    }
  });

  it('reflects the newest server response, never an older one landing later', async () => {
    let patchCallCount = 0;
    const d0 = deferred();
    const d1 = deferred();
    globalThis.fetch.mockImplementation((url, init) => {
      if (init?.method === 'PATCH') {
        patchCallCount += 1;
        return patchCallCount === 1 ? d0.promise : d1.promise;
      }
      return Promise.resolve(jsonResponse({ response: { data: [] } }));
    });

    const { result } = renderHook(() => useEntity('contact', null, opts));

    act(() => {
      result.current.handleSelect({ id: 'rec-1', status: 'v0' });
    });

    act(() => {
      result.current.handleChange('status', 'v1');
    });
    let save1;
    act(() => {
      save1 = result.current.handleSave(); // fires the OLDER request (d0)
    });

    act(() => {
      result.current.handleChange('status', 'v2');
    });
    let save2;
    act(() => {
      save2 = result.current.handleSave(); // fires the NEWER request (d1)
    });

    // Responses land out of order: the newer request's response arrives first,
    // then the older request's (stale) response arrives last.
    act(() => {
      d1.resolve(jsonResponse({ response: { data: [{ id: 'rec-1', status: 'v2-server' }] } }));
    });
    await act(async () => {
      await save2;
    });

    act(() => {
      d0.resolve(jsonResponse({ response: { data: [{ id: 'rec-1', status: 'v1-server' }] } }));
    });
    await act(async () => {
      await save1;
    });

    // The final state must reflect the newest save (v2-server), not be clobbered
    // by the older (v1-server) response landing after it.
    expect(result.current.selected.status).toBe('v2-server');
  });
});
