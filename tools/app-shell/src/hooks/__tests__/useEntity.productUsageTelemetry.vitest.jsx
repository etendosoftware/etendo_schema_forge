import { renderHook, act } from '@testing-library/react';
import { useEntity } from '../useEntity';

const telemetryMocks = vi.hoisted(() => ({
  trackDocumentCompleted: vi.fn(),
  trackRecordCreated: vi.fn(),
  trackRecordUpdated: vi.fn(),
  isCompletionProcess: vi.fn(() => true),
}));

vi.mock('@/lib/productUsageTelemetry.js', () => telemetryMocks);

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
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
  skipListFetch: true,
  specName: 'sales-order',
};

function renderEntity(opts = {}) {
  return renderHook(() => useEntity('salesOrder', null, { ...baseOpts, ...opts }));
}

describe('useEntity product usage telemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('tracks successful creates', async () => {
    globalThis.fetch.mockImplementation(async (url, opts) => {
      if (url.includes('/defaults')) return { ok: true, json: async () => ({ defaults: {} }) };
      if (opts?.method === 'POST') {
        return { ok: true, json: async () => ({ response: { data: [{ id: 'new-1', name: 'Created' }] } }) };
      }
      return { ok: true, json: async () => ({ response: { data: [] } }) };
    });

    const { result } = renderEntity();
    await act(async () => { await result.current.handleNew(); });
    act(() => { result.current.handleChange('name', 'Created'); });
    await act(async () => { await result.current.handleSave(); });

    expect(telemetryMocks.trackRecordCreated).toHaveBeenCalledWith({
      entity: 'salesOrder',
      specName: 'sales-order',
    });
    expect(telemetryMocks.trackRecordUpdated).not.toHaveBeenCalled();
  });

  it('tracks successful updates', async () => {
    globalThis.fetch.mockImplementation(async (url, opts) => {
      if (opts?.method === 'PATCH') {
        return { ok: true, json: async () => ({ response: { data: [{ id: 'rec-1', name: 'Updated' }] } }) };
      }
      return { ok: true, json: async () => ({ response: { data: [] } }) };
    });

    const { result } = renderEntity();
    act(() => {
      result.current.handleSelect({ id: 'rec-1', name: 'Original' });
    });
    act(() => { result.current.handleChange('name', 'Updated'); });
    await act(async () => { await result.current.handleSave(); });

    expect(telemetryMocks.trackRecordUpdated).toHaveBeenCalledWith({
      entity: 'salesOrder',
      specName: 'sales-order',
    });
    expect(telemetryMocks.trackRecordCreated).not.toHaveBeenCalled();
  });

  it('tracks document completion after save and process succeeds', async () => {
    globalThis.fetch.mockImplementation(async (url, opts) => {
      if (url.includes('/defaults')) return { ok: true, json: async () => ({ defaults: {} }) };
      if (opts?.method === 'POST' && !url.includes('/action/')) {
        return { ok: true, json: async () => ({ response: { data: [{ id: 'doc-1', documentStatus: 'DR' }] } }) };
      }
      if (opts?.method === 'POST' && url.includes('/action/')) {
        return { ok: true, json: async () => ({ response: { data: [{ id: 'doc-1', documentStatus: 'CO' }] } }) };
      }
      return { ok: true, json: async () => ({ response: { data: [{ id: 'doc-1', documentStatus: 'CO' }] } }) };
    });

    const { result } = renderEntity();
    await act(async () => { await result.current.handleNew(); });
    await act(async () => {
      await result.current.handleSaveAndProcess({ processField: 'docAction', processValue: 'CO' });
    });

    expect(telemetryMocks.trackDocumentCompleted).toHaveBeenCalledWith({
      entity: 'salesOrder',
      specName: 'sales-order',
      source: 'detail_view',
      operation: 'complete',
    });
  });
});
