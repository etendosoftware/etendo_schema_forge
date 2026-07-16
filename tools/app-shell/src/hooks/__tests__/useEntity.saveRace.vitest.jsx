import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock i18n hooks before importing the hook under test.
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

// Auth context is consumed for logout — stub it.
vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));

// Telemetry is fire-and-forget — stub all exports used by useEntity.
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

/** Build a Response-like object. */
function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    clone() { return jsonResponse(body, { ok, status }); },
  };
}

/** A promise whose resolution is controlled from the test body. */
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
 * ETP-4524 — Race 1 (autoSaveOnBlur data loss).
 *
 * useEntity.js handleSave() snapshots `editing` at call time (blur time). On PATCH
 * success it does `setSelected(resolvedSaved); setEditing({ ...resolvedSaved })`
 * (useEntity.js ~1017-1018) — a full replace with the server record. Any key the
 * user edited WHILE the round-trip was in flight is silently discarded when the
 * response lands, and afterwards `editing === selected` so the next blur doesn't
 * even re-save it — the edit is lost for good.
 *
 * Contrast with refreshHeaderTotals (useEntity.js ~860-874), which already merges
 * correctly: it preserves any key tracked in userChangedKeysRef instead of blindly
 * overwriting with the server row. handleSave's success handler has no equivalent
 * merge.
 */
describe('useEntity — handleSave race with a concurrent edit (ETP-4524 Race 1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves an edit made while the save PATCH is in flight', async () => {
    const patch = deferred();
    globalThis.fetch.mockImplementation((url, init) => {
      if (init?.method === 'PATCH') return patch.promise;
      return Promise.resolve(jsonResponse({ response: { data: [] } }));
    });

    const { result } = renderHook(() => useEntity('contact', null, opts));

    // Arrange: an existing record is selected and the user edits firstName.
    act(() => {
      result.current.handleSelect({ id: 'rec-1', firstName: 'Juan', lastName: 'Perez' });
    });
    act(() => {
      result.current.handleChange('firstName', 'Ana');
    });

    // Act: blur fires handleSave() — the PATCH stays unresolved (simulates network latency).
    let savePromise;
    act(() => {
      savePromise = result.current.handleSave();
    });

    // While the PATCH is in flight, the user tabs to the next field and types.
    act(() => {
      result.current.handleChange('lastName', 'García');
    });

    // The PATCH resolves with the server record reflecting only the FIRST edit
    // (firstName), because the request body was built from the pre-edit snapshot.
    // It does NOT contain the lastName edit made after the request was sent.
    act(() => {
      patch.resolve(jsonResponse({
        response: { data: [{ id: 'rec-1', firstName: 'Ana', lastName: 'Perez' }] },
      }));
    });

    await act(async () => {
      await savePromise;
    });

    // Assert: the concurrent edit must survive the response landing.
    expect(result.current.editing.lastName).toBe('García');
    // And the record must still be considered dirty for that key, so the NEXT
    // blur would actually persist it — today `editing === {...resolvedSaved}`,
    // which matches `selected` exactly, so isDirtyHeader is (incorrectly) false
    // and the edit is silently lost forever.
    expect(result.current.isDirtyHeader).toBe(true);
  });
});
