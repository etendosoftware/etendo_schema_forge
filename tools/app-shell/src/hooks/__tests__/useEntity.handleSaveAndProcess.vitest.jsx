import { renderHook, act, waitFor } from '@testing-library/react';
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

const opts = {
  token: 'tok-123',
  apiBaseUrl: 'http://api.test',
  specName: 'sales-order',
};

describe('useEntity — handleSaveAndProcess extraParams merge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('merges extraParams at the top level of the process POST body', async () => {
    const saved = { id: 'rec-1', documentNo: 'DOC-1' };

    // 1) PATCH (handleSave on existing record) → returns the saved record.
    // 2) POST action/<processField>  → the process call under test.
    // 3) GET updated record (best-effort refresh after process).
    globalThis.fetch.mockImplementation((url, init) => {
      if (init?.method === 'PATCH') {
        return Promise.resolve(jsonResponse({ response: { data: [saved] } }));
      }
      if (init?.method === 'POST') {
        return Promise.resolve(jsonResponse({ response: { data: [saved] } }));
      }
      // GET refresh
      return Promise.resolve(jsonResponse({ response: { data: [saved] } }));
    });

    const { result } = renderHook(() => useEntity('order', null, opts));

    // Prime editing with an existing record (id present → PATCH path, skips
    // client-side required-field validation that the create path runs).
    act(() => {
      result.current.handleSelect({ id: 'rec-1', documentNo: 'DOC-1' });
    });

    await act(async () => {
      await result.current.handleSaveAndProcess({
        processField: 'processNow',
        processValue: 'CO',
        extraParams: { action: 'CO' },
      });
    });

    // Find the POST to the action endpoint and inspect its body.
    const processCall = globalThis.fetch.mock.calls.find(
      ([url, init]) =>
        init?.method === 'POST' &&
        String(url).includes('/action/processNow'),
    );
    expect(processCall).toBeTruthy();

    const body = JSON.parse(processCall[1].body);
    expect(body.action).toBe('CO');
    expect(body.fieldValues.processNow).toBe('CO');
  });

  it('omits the spread when extraParams is undefined', async () => {
    const saved = { id: 'rec-2', documentNo: 'DOC-2' };
    globalThis.fetch.mockImplementation((url, init) => {
      void url; void init;
      return Promise.resolve(jsonResponse({ response: { data: [saved] } }));
    });

    const { result } = renderHook(() => useEntity('order', null, opts));

    act(() => {
      result.current.handleSelect({ id: 'rec-2', documentNo: 'DOC-2' });
    });

    await act(async () => {
      await result.current.handleSaveAndProcess({
        processField: 'processNow',
        processValue: 'CO',
      });
    });

    const processCall = globalThis.fetch.mock.calls.find(
      ([url, init]) =>
        init?.method === 'POST' &&
        String(url).includes('/action/processNow'),
    );
    expect(processCall).toBeTruthy();

    const body = JSON.parse(processCall[1].body);
    expect(body.fieldValues.processNow).toBe('CO');
    expect(Object.keys(body)).toEqual(['fieldValues']);
  });
});
