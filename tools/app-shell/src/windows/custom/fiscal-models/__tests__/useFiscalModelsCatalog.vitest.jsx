// @covers tools/app-shell/src/windows/custom/fiscal-models/useFiscalModelsCatalog.js
// The shared reader of the fiscal models catalog (GET <neo base>/fiscal-models-catalog).

import { renderHook, waitFor, act } from '@testing-library/react';

// Stable reference: the hook lists `apiFetch` in its effect dependencies.
const mockApiFetch = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: () => mockApiFetch,
}));

import { isModelActive, useFiscalModelsCatalog } from '../useFiscalModelsCatalog.js';

const API = '/sws/neo/organization';
const CATALOG_URL = '/sws/neo/fiscal-models-catalog';

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

describe('isModelActive', () => {
  it('is true only when the model flag is exactly true', () => {
    expect(isModelActive({ 303: true }, '303')).toBe(true);
    expect(isModelActive({ 303: false }, '303')).toBe(false);
    expect(isModelActive({ 303: 'Y' }, '303')).toBe(false);
    expect(isModelActive({ 303: 1 }, '303')).toBe(false);
  });

  it('is false for a model missing from the catalog and for an empty catalog', () => {
    expect(isModelActive({ 303: true }, '390')).toBe(false);
    expect(isModelActive({}, '303')).toBe(false);
  });

  it('is false for a null or undefined catalog', () => {
    expect(isModelActive(null, '303')).toBe(false);
    expect(isModelActive(undefined, '303')).toBe(false);
  });
});

describe('useFiscalModelsCatalog', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('reads the catalog from the NEO base of the spec URL, with no extra base prefix', async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ 303: true, 390: false }));
    const { result } = renderHook(() => useFiscalModelsCatalog(API));

    expect(result.current.loaded).toBe(false);
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch).toHaveBeenCalledWith(CATALOG_URL, { baseUrl: '' });
    expect(result.current.activeModels).toEqual({ 303: true, 390: false });
    expect(result.current.error).toBeNull();
  });

  it('keeps an empty catalog {} as is — no registry defaults applied', async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({}));
    const { result } = renderHook(() => useFiscalModelsCatalog(API));

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.activeModels).toEqual({});
    expect(result.current.error).toBeNull();
  });

  it('treats a null body as an empty catalog', async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(null));
    const { result } = renderHook(() => useFiscalModelsCatalog(API));

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.activeModels).toEqual({});
  });

  it('on a non-ok response: error set, no model active, loaded', async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ 303: true }, { ok: false, status: 500 }));
    const { result } = renderHook(() => useFiscalModelsCatalog(API));

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error.message).toBe('HTTP 500');
    expect(result.current.activeModels).toEqual({});
  });

  it('on a rejected request: error holds the cause, no model active, loaded', async () => {
    const cause = new Error('network down');
    mockApiFetch.mockRejectedValue(cause);
    const { result } = renderHook(() => useFiscalModelsCatalog(API));

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.error).toBe(cause);
    expect(result.current.activeModels).toEqual({});
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
  ])('on a request rejected with %s: error is still truthy, so callers fail closed', async (_name, reason) => {
    mockApiFetch.mockReturnValue(Promise.reject(reason));
    const { result } = renderHook(() => useFiscalModelsCatalog(API));

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.error).toBeTruthy();
    expect(result.current.activeModels).toEqual({});
  });

  it('fetches nothing and reports loaded when there is no apiBaseUrl', () => {
    const { result } = renderHook(() => useFiscalModelsCatalog(''));

    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(result.current.loaded).toBe(true);
    expect(result.current.activeModels).toEqual({});
  });

  it('re-reads the catalog when refreshKey changes, and not on a plain re-render', async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse({ 303: true }));
    const { result, rerender } = renderHook(({ key }) => useFiscalModelsCatalog(API, key), {
      initialProps: { key: 'token-1' },
    });
    await waitFor(() => expect(result.current.activeModels).toEqual({ 303: true }));

    rerender({ key: 'token-1' });
    expect(mockApiFetch).toHaveBeenCalledTimes(1);

    mockApiFetch.mockResolvedValueOnce(jsonResponse({ 390: true }));
    rerender({ key: 'token-2' });

    await waitFor(() => expect(result.current.activeModels).toEqual({ 390: true }));
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });

  it('clears a previous error when a refresh succeeds', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('first'));
    const { result, rerender } = renderHook(({ key }) => useFiscalModelsCatalog(API, key), {
      initialProps: { key: 1 },
    });
    await waitFor(() => expect(result.current.error).not.toBeNull());

    mockApiFetch.mockResolvedValueOnce(jsonResponse({ 303: true }));
    rerender({ key: 2 });

    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.activeModels).toEqual({ 303: true });
  });

  it('ignores a response that lands after a newer read started (no stale overwrite)', async () => {
    const first = deferred();
    mockApiFetch.mockReturnValueOnce(first.promise);
    const { result, rerender } = renderHook(({ key }) => useFiscalModelsCatalog(API, key), {
      initialProps: { key: 1 },
    });

    mockApiFetch.mockResolvedValueOnce(jsonResponse({ 390: true }));
    rerender({ key: 2 });
    await waitFor(() => expect(result.current.activeModels).toEqual({ 390: true }));

    await act(async () => { first.resolve(jsonResponse({ 303: true })); await first.promise; });
    expect(result.current.activeModels).toEqual({ 390: true });
  });

  it('does not update state after unmount', async () => {
    const pending = deferred();
    mockApiFetch.mockReturnValueOnce(pending.promise);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useFiscalModelsCatalog(API));

    unmount();
    await act(async () => { pending.resolve(jsonResponse({ 303: true })); await pending.promise; });

    expect(result.current.loaded).toBe(false);
    expect(result.current.activeModels).toEqual({});
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('exposes setActiveModels so the catalog drawer can apply a saved catalog locally', async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({}));
    const { result } = renderHook(() => useFiscalModelsCatalog(API));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => result.current.setActiveModels({ 349: true }));
    expect(result.current.activeModels).toEqual({ 349: true });
  });
});
