import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/components/related-documents/helpers.js', () => ({
  neoBase: (url) => url ?? '',
}));

vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: vi.fn(),
}));

import { useFiscalTestMode } from '../useFiscalTestMode.js';
import { useApiFetch } from '@/auth/useApiFetch.js';

function makeApiFetch(body, { ok = true } = {}) {
  return vi.fn(() => Promise.resolve({ ok, json: () => Promise.resolve(body) }));
}

const BASE = 'http://api.test/fiscal-config';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('useFiscalTestMode — guard: missing apiBaseUrl', () => {
  it('keeps forceTestMode false and does not fetch when apiBaseUrl is falsy', async () => {
    const apiFetch = makeApiFetch({ forceTestMode: true });
    vi.mocked(useApiFetch).mockReturnValue(apiFetch);

    const { result } = renderHook(() => useFiscalTestMode(null));

    await act(async () => {});
    expect(result.current.forceTestMode).toBe(false);
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe('useFiscalTestMode — success', () => {
  it('calls the /fiscal-test-mode endpoint', async () => {
    const apiFetch = makeApiFetch({ forceTestMode: false });
    vi.mocked(useApiFetch).mockReturnValue(apiFetch);

    renderHook(() => useFiscalTestMode(BASE));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(apiFetch.mock.calls[0][0]).toBe('/fiscal-test-mode');
  });

  it('sets forceTestMode to true when the API returns { forceTestMode: true }', async () => {
    vi.mocked(useApiFetch).mockReturnValue(makeApiFetch({ forceTestMode: true }));

    const { result } = renderHook(() => useFiscalTestMode(BASE));

    await waitFor(() => expect(result.current.forceTestMode).toBe(true));
  });

  it('sets forceTestMode to false when the API returns { forceTestMode: false }', async () => {
    vi.mocked(useApiFetch).mockReturnValue(makeApiFetch({ forceTestMode: false }));

    const { result } = renderHook(() => useFiscalTestMode(BASE));

    await act(async () => {});
    expect(result.current.forceTestMode).toBe(false);
  });

  it('treats any non-true value (e.g. a truthy string) as false — strict === true check', async () => {
    vi.mocked(useApiFetch).mockReturnValue(makeApiFetch({ forceTestMode: 'true' }));

    const { result } = renderHook(() => useFiscalTestMode(BASE));

    await act(async () => {});
    expect(result.current.forceTestMode).toBe(false);
  });
});

describe('useFiscalTestMode — fail-open behavior', () => {
  it('falls back to forceTestMode=false when the response is not ok', async () => {
    vi.mocked(useApiFetch).mockReturnValue(makeApiFetch({}, { ok: false }));

    const { result } = renderHook(() => useFiscalTestMode(BASE));

    await act(async () => {});
    expect(result.current.forceTestMode).toBe(false);
  });

  it('warns via console.warn when the response is not ok (never silent)', async () => {
    vi.mocked(useApiFetch).mockReturnValue(makeApiFetch({}, { ok: false }));

    renderHook(() => useFiscalTestMode(BASE));

    await waitFor(() => expect(console.warn).toHaveBeenCalled());
  });

  it('falls back to forceTestMode=false when the fetch rejects (network error)', async () => {
    const apiFetch = vi.fn(() => Promise.reject(new Error('Network failure')));
    vi.mocked(useApiFetch).mockReturnValue(apiFetch);

    const { result } = renderHook(() => useFiscalTestMode(BASE));

    await act(async () => {});
    expect(result.current.forceTestMode).toBe(false);
  });

  it('warns via console.warn when the fetch rejects (never silent)', async () => {
    const apiFetch = vi.fn(() => Promise.reject(new Error('Network failure')));
    vi.mocked(useApiFetch).mockReturnValue(apiFetch);

    renderHook(() => useFiscalTestMode(BASE));

    await waitFor(() => expect(console.warn).toHaveBeenCalled());
    expect(console.warn.mock.calls[0].join(' ')).toMatch(/fiscal-test-mode/i);
  });

  it('falls back to forceTestMode=false when json() itself rejects (malformed body)', async () => {
    const apiFetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.reject(new Error('bad json')) }));
    vi.mocked(useApiFetch).mockReturnValue(apiFetch);

    const { result } = renderHook(() => useFiscalTestMode(BASE));

    await act(async () => {});
    expect(result.current.forceTestMode).toBe(false);
  });

  it('never flips forceTestMode to true on any failure path (fail-open is never fail-locked)', async () => {
    vi.mocked(useApiFetch).mockReturnValueOnce(makeApiFetch({}, { ok: false }));
    const { result, rerender } = renderHook(({ base }) => useFiscalTestMode(base), { initialProps: { base: BASE } });
    await act(async () => {});
    expect(result.current.forceTestMode).toBe(false);

    // Even a follow-up rejection while already false must stay false.
    vi.mocked(useApiFetch).mockReturnValue(vi.fn(() => Promise.reject(new Error('boom'))));
    rerender({ base: `${BASE}?x=2` });
    await act(async () => {});
    expect(result.current.forceTestMode).toBe(false);
  });
});
