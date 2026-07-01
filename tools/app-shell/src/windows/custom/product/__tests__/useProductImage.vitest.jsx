// Mocks must come before imports (Vitest hoisting)

import { renderHook, waitFor } from '@testing-library/react';
import { useProductImage } from '../useProductImage.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBlob(content = 'image-data') {
  return new Blob([content], { type: 'image/jpeg' });
}

function mockFetchOk(blob) {
  global.fetch = vi.fn(() =>
    Promise.resolve({
      ok: true,
      blob: () => Promise.resolve(blob),
    }),
  );
}

function mockFetchNotOk(status = 404) {
  global.fetch = vi.fn(() =>
    Promise.resolve({
      ok: false,
      status,
      blob: () => Promise.resolve(null),
    }),
  );
}

function mockFetchReject(message = 'Network error') {
  global.fetch = vi.fn(() => Promise.reject(new Error(message)));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useProductImage', () => {
  beforeEach(() => {
    global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/fake-object-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. No imageId — returns null immediately, no fetch fired
  // -------------------------------------------------------------------------
  it('returns null immediately when imageId is falsy (null)', () => {
    const spy = vi.spyOn(global, 'fetch');
    const { result } = renderHook(() => useProductImage(null, 'tok', '/api/product'));
    expect(result.current).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns null immediately when imageId is empty string', () => {
    const { result } = renderHook(() => useProductImage('', 'tok', '/api/product'));
    expect(result.current).toBeNull();
  });

  it('returns null immediately when imageId is undefined', () => {
    const { result } = renderHook(() => useProductImage(undefined, 'tok', '/api/product'));
    expect(result.current).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 2. Successful fetch — sets imgSrc to object URL
  // -------------------------------------------------------------------------
  it('fetches the image and returns the object URL on success', async () => {
    const blob = makeBlob();
    mockFetchOk(blob);

    const { result } = renderHook(() =>
      useProductImage('img-123', 'my-token', '/api/product/header'),
    );

    await waitFor(() => expect(result.current).not.toBeNull());

    expect(result.current).toBe('blob:http://localhost/fake-object-url');
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
  });

  it('derives neoBaseUrl by stripping the last URL segment', async () => {
    const blob = makeBlob();
    mockFetchOk(blob);

    renderHook(() => useProductImage('img-abc', 'tok', '/api/product/header'));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    const [calledUrl] = global.fetch.mock.calls[0];
    // Last segment (/header) stripped → /api/product/image/img-abc
    expect(calledUrl).toBe('/api/product/image/img-abc');
  });

  it('sends Authorization header with Bearer token', async () => {
    mockFetchOk(makeBlob());

    renderHook(() => useProductImage('img-456', 'secret-token', '/api/product/header'));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    const [, init] = global.fetch.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer secret-token');
  });

  // -------------------------------------------------------------------------
  // 3. Non-ok response — returns null, no object URL created
  // -------------------------------------------------------------------------
  it('returns null when the response is not ok', async () => {
    mockFetchNotOk(404);

    const { result } = renderHook(() =>
      useProductImage('img-missing', 'tok', '/api/product/header'),
    );

    // Give effect time to run
    await new Promise((r) => setTimeout(r, 50));

    expect(result.current).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('returns null when the response is a 500', async () => {
    mockFetchNotOk(500);

    const { result } = renderHook(() =>
      useProductImage('img-error', 'tok', '/api/product/header'),
    );

    await new Promise((r) => setTimeout(r, 50));

    expect(result.current).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 4. Fetch rejection — swallowed, returns null, no crash
  // -------------------------------------------------------------------------
  it('handles fetch rejection gracefully without crashing', async () => {
    mockFetchReject('Network error');

    const { result } = renderHook(() =>
      useProductImage('img-net', 'tok', '/api/product/header'),
    );

    await new Promise((r) => setTimeout(r, 50));

    expect(result.current).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 5. Cleanup — revokeObjectURL called on unmount
  // -------------------------------------------------------------------------
  it('revokes the object URL when the component unmounts', async () => {
    mockFetchOk(makeBlob());

    const { result, unmount } = renderHook(() =>
      useProductImage('img-789', 'tok', '/api/product/header'),
    );

    await waitFor(() => expect(result.current).not.toBeNull());

    unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/fake-object-url');
  });

  it('does NOT revoke when fetch returned null (no object URL was created)', async () => {
    mockFetchNotOk(404);

    const { unmount } = renderHook(() =>
      useProductImage('img-bad', 'tok', '/api/product/header'),
    );

    await new Promise((r) => setTimeout(r, 50));

    unmount();

    // revokeObjectURL must not have been called because objectUrl was never set
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 6. Re-renders with new imageId — refetches
  // -------------------------------------------------------------------------
  it('re-fetches when imageId changes', async () => {
    mockFetchOk(makeBlob());

    const { result, rerender } = renderHook(
      ({ id }) => useProductImage(id, 'tok', '/api/product/header'),
      { initialProps: { id: 'img-first' } },
    );

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(global.fetch).toHaveBeenCalledTimes(1);

    rerender({ id: 'img-second' });

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    const [secondUrl] = global.fetch.mock.calls[1];
    expect(secondUrl).toContain('img-second');
  });

  // -------------------------------------------------------------------------
  // 7. Edge: apiBaseUrl without trailing segment still works
  // -------------------------------------------------------------------------
  it('works when apiBaseUrl has no path segment (empty after replace)', async () => {
    mockFetchOk(makeBlob());

    renderHook(() => useProductImage('img-root', 'tok', '/header'));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    const [calledUrl] = global.fetch.mock.calls[0];
    // /header → strip last segment → '' → /image/img-root
    expect(calledUrl).toBe('/image/img-root');
  });
});
