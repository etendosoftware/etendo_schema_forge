// @covers tools/app-shell/src/hooks/useEntity.js
import { renderHook, act } from '@testing-library/react';
import { useEntity } from '../useEntity';

/**
 * ETP-4557 — the save gate runs the shared core validator: an invalid changed value sends no
 * request (normal and silent save), the error lands on the offending field, a correction saves,
 * a new record is fully validated, and unregistered or read-only fields are skipped.
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

describe('useEntity — save gate uses the core validator (ETP-4557)', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
    vi.clearAllMocks();
  });
  afterEach(() => vi.restoreAllMocks());

  const fields = [
    { key: 'name', column: 'Name', type: 'text', maxLength: 5 },
    { key: 'etgoEmail', column: 'EM_Etgo_Email', type: 'text' },
    { key: 'locked', column: 'Locked', type: 'text', maxLength: 1, readOnly: true },
  ];
  const record = { id: 'rec-1', name: 'abc', etgoEmail: '', updated: 'v1' };

  function setup() {
    const requests = [];
    globalThis.fetch.mockImplementation(async (url, opts) => {
      if (url.includes('/defaults')) return { ok: true, json: async () => ({ defaults: {} }) };
      if (opts?.method === 'PATCH' || opts?.method === 'PUT' || opts?.method === 'POST') {
        requests.push(opts.method);
        return { ok: true, json: async () => ({ response: { data: [{ ...record, id: 'rec-1' }] } }) };
      }
      return { ok: true, json: async () => ({ response: { data: [] } }) };
    });
    const hook = renderHook(() => useEntity('header', null, { ...baseOpts, skipListFetch: true }));
    return { hook, requests };
  }

  for (const silent of [false, true]) {
    it(`blocks the request for a changed invalid value (silent=${silent}), flags the field, and saves after the correction`, async () => {
      const { hook, requests } = setup();
      act(() => { hook.result.current.registerFields(fields, 'form-1'); });
      act(() => { hook.result.current.handleSelect(record); });
      act(() => { hook.result.current.handleChange('name', 'abcdefg'); });
      await act(async () => { await hook.result.current.handleSave({ silent }); });
      expect(requests).toHaveLength(0);
      expect(hook.result.current.fieldErrors).toHaveProperty('name', 'fieldMaxLengthError');

      act(() => { hook.result.current.handleChange('name', 'abcd'); });
      expect(hook.result.current.fieldErrors.name).toBeUndefined();
      await act(async () => { await hook.result.current.handleSave({ silent }); });
      expect(requests).toHaveLength(1);
    });
  }

  it('does not block an unrelated edit because of an untouched legacy-invalid value', async () => {
    const { hook, requests } = setup();
    const legacy = { ...record, name: 'way-too-long' };
    act(() => { hook.result.current.registerFields(fields, 'form-1'); });
    act(() => { hook.result.current.handleSelect(legacy); });
    act(() => { hook.result.current.handleChange('etgoEmail', 'ok@acme.com'); });
    await act(async () => { await hook.result.current.handleSave({ silent: true }); });
    expect(requests).toHaveLength(1);
  });

  it('skips a section that unregistered its fields, and read-only fields', async () => {
    const { hook, requests } = setup();
    act(() => { hook.result.current.registerFields([{ key: 'name', column: 'Name', type: 'text', maxLength: 5 }], 'form-2'); });
    act(() => { hook.result.current.handleSelect(record); });
    act(() => { hook.result.current.handleChange('name', 'abcdefg'); });
    await act(async () => { await hook.result.current.handleSave({ silent: true }); });
    expect(requests).toHaveLength(0);
    act(() => { hook.result.current.registerFields(null, 'form-2'); });
    await act(async () => { await hook.result.current.handleSave({ silent: true }); });
    expect(requests).toHaveLength(1);
  });

  it('fully validates a new record: an invalid value blocks the POST', async () => {
    const { hook, requests } = setup();
    await act(async () => { await hook.result.current.handleNew(); });
    act(() => { hook.result.current.registerFields(fields, 'form-1'); });
    act(() => { hook.result.current.handleChange('etgoEmail', 'not-an-email'); });
    await act(async () => { await hook.result.current.handleSave({ silent: true }); });
    expect(requests).toHaveLength(0);
    expect(hook.result.current.fieldErrors).toHaveProperty('etgoEmail', 'sendModalInvalidEmail');
  });

  it('skips a field hidden by display logic', async () => {
    const { hook, requests } = setup();
    const hidden = { key: 'name', column: 'Name', type: 'text', maxLength: 5, displayLogic: () => false };
    act(() => { hook.result.current.registerFields([hidden], 'form-1'); });
    act(() => { hook.result.current.handleSelect(record); });
    act(() => { hook.result.current.handleChange('name', 'abcdefg'); });
    await act(async () => { await hook.result.current.handleSave({ silent: true }); });
    expect(requests).toHaveLength(1);
    expect(hook.result.current.fieldErrors.name).toBeUndefined();
  });
});
