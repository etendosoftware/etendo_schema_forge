import { renderHook, act, waitFor } from '@testing-library/react';

import { AuthProvider } from '@/auth/AuthContext.jsx';
import { useStatementPreview } from '../useStatementPreview.js';

// ETP-5022: useStatementPreview (via useStatementFileRequest) now goes through
// useApiFetch, which reads the token from the real core AuthProvider (or falls
// back to the ambient session) rather than from a mocked `useAuth`. A mocked
// `@/auth/AuthContext.jsx` never crosses the `useApiFetch` shim (it imports auth
// via the core package's own relative path, which the `@/auth` alias does not
// intercept), so a real AuthProvider seeded with a token is required instead.
// ETP-4576: `credentialMode` defaults to `auto`, which turns the mount-only session
// restore ON, so every AuthProvider issues a GET /sws/go/session of its own. The
// subject here is the hook request itself, not the restore, so the provider opts out
// through the documented `restoreSession={null}` escape hatch and the fetch count
// stays the hook one. Without it the restore lands as an extra call before the asserts.
const wrapper = ({ children }) => (
  <AuthProvider initialSession={{ token: 'test-token' }} restoreSession={null}>{children}</AuthProvider>
);

function setPathname(pathname) {
  Object.defineProperty(window, 'location', {
    value: { pathname },
    writable: true,
  });
}

describe('useStatementPreview', () => {
  beforeEach(() => {
    setPathname('/etendo/web/app');
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the initial idle state', () => {
    const { result } = renderHook(() => useStatementPreview(), { wrapper });
    expect(result.current.previewing).toBe(false);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.previewStatement).toBe('function');
  });

  it('POSTs to bank-statements?action=preview with the expected body shape', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: { format: 'C43', lineCount: 7 } } }),
    });

    const { result } = renderHook(() => useStatementPreview(), { wrapper });

    let res;
    await act(async () => {
      res = await result.current.previewStatement({
        accountId: 'acc-1',
        fileName: 'ext.c43',
        contentBase64: 'AAAA',
      });
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/etendo/sws/neo/bank-statements?action=preview');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-token');
    expect(JSON.parse(init.body)).toEqual({
      FIN_Financial_Account_ID: 'acc-1',
      fileName: 'ext.c43',
      contentBase64: 'AAAA',
    });
    expect(res).toEqual({ format: 'C43', lineCount: 7 });
  });

  it('flips previewing during the call', async () => {
    let resolve;
    globalThis.fetch.mockReturnValue(
      new Promise((r) => { resolve = r; }),
    );

    const { result } = renderHook(() => useStatementPreview(), { wrapper });
    let promise;
    act(() => {
      promise = result.current.previewStatement({
        accountId: 'a', fileName: 'f', contentBase64: 'b',
      });
    });
    await waitFor(() => expect(result.current.previewing).toBe(true));

    await act(async () => {
      resolve({ ok: true, json: async () => ({ response: { data: {} } }) });
      await promise;
    });
    expect(result.current.previewing).toBe(false);
  });

  it('throws an Error with the HTTP status attached on backend failure', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false, status: 415, text: async () => 'unsupported',
    });
    const { result } = renderHook(() => useStatementPreview(), { wrapper });

    let caught;
    await act(async () => {
      try {
        await result.current.previewStatement({
          accountId: 'a', fileName: 'f', contentBase64: 'b',
        });
      } catch (e) {
        caught = e;
      }
    });
    expect(caught).toBeInstanceOf(Error);
    expect(caught.status).toBe(415);
    expect(caught.message).toContain('HTTP 415');
    expect(caught.message).toContain('unsupported');
    expect(result.current.error).toBe(caught);
  });

  it('propagates network rejection and stores it', async () => {
    globalThis.fetch.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useStatementPreview(), { wrapper });

    await act(async () => {
      await expect(result.current.previewStatement({
        accountId: 'a', fileName: 'f', contentBase64: 'b',
      })).rejects.toThrow('offline');
    });
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error.message).toBe('offline');
  });

  it('returns {} when the API omits response.data', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { result } = renderHook(() => useStatementPreview(), { wrapper });

    let res;
    await act(async () => {
      res = await result.current.previewStatement({
        accountId: 'a', fileName: 'f', contentBase64: 'b',
      });
    });
    expect(res).toEqual({});
  });
});
