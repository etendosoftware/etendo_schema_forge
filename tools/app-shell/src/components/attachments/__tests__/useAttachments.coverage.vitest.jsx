/**
 * Complements useAttachments.vitest.jsx (list / upload / remove / patch happy
 * paths) with the branches it never reaches: formatBytes, the download and
 * download-all blob plumbing, removeAll, the backend error-message extraction
 * fallbacks, the early-return guards and the abort path.
 */
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

import { useAttachments, formatBytes } from '../useAttachments';
import { toast } from 'sonner';

const baseOpts = {
  tableName: 'C_Order',
  recordId: 'REC-1',
  token: 'tok-123',
  apiBaseUrl: 'http://api.test/sws/neo/sales-order',
  isActive: true,
};

/** Minimal fetch Response double; `clone()` is what extractErrorMessage uses first. */
function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(typeof body === 'string' ? body : JSON.stringify(body)),
    clone() { return jsonResponse(body, { ok, status }); },
    blob: vi.fn().mockResolvedValue(new Blob(['x'])),
  };
}

/** Response whose body is not JSON, so extractErrorMessage falls back to text(). */
function textResponse(text, { ok = false, status = 500 } = {}) {
  const res = {
    ok,
    status,
    json: vi.fn().mockRejectedValue(new SyntaxError('not json')),
    text: vi.fn().mockResolvedValue(text),
    clone() { return res; },
    blob: vi.fn().mockResolvedValue(new Blob(['x'])),
  };
  return res;
}

/** Response where neither json() nor text() can be read. */
function unreadableResponse({ status = 503 } = {}) {
  const res = {
    ok: false,
    status,
    json: vi.fn().mockRejectedValue(new Error('nope')),
    text: vi.fn().mockRejectedValue(new Error('nope')),
    clone() { return res; },
  };
  return res;
}

describe('formatBytes', () => {
  it('renders a dash for a missing size', () => {
    expect(formatBytes(null)).toBe('—');
    expect(formatBytes(undefined)).toBe('—');
    expect(formatBytes(Number.NaN)).toBe('—');
  });

  it('renders zero without a decimal', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('renders raw bytes without decimals', () => {
    expect(formatBytes(1)).toBe('1 B');
    expect(formatBytes(999)).toBe('999 B');
  });

  it('renders one decimal below 10 units and none above', () => {
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(10 * 1024)).toBe('10 KB');
    expect(formatBytes(1.2 * 1024 * 1024)).toBe('1.2 MB');
    expect(formatBytes(2 * 1024 ** 3)).toBe('2.0 GB');
  });

  it('clamps the unit at TB for very large sizes', () => {
    expect(formatBytes(1024 ** 5)).toBe('1024 TB');
  });

  it('handles a negative size via its absolute magnitude', () => {
    expect(formatBytes(-2048)).toBe('-2.0 KB');
  });
});

describe('useAttachments — remaining branches', () => {
  let anchorClick;

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ items: [] }));
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:fake');
    globalThis.URL.revokeObjectURL = vi.fn();
    anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function setup(opts = {}) {
    const hook = renderHook(() => useAttachments({ ...baseOpts, ...opts }));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    return hook;
  }

  describe('endpoint base derivation', () => {
    it('strips the spec segment from apiBaseUrl to reach the transversal endpoint', async () => {
      await setup();
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://api.test/sws/neo/attachments/C_Order/REC-1',
        expect.objectContaining({ headers: { Authorization: 'Bearer tok-123', 'Accept-Language': 'es_ES' } }),
      );
    });

    it('builds a relative URL when no apiBaseUrl is given', async () => {
      await setup({ apiBaseUrl: undefined });
      expect(globalThis.fetch.mock.calls[0][0]).toBe('/sws/neo/attachments/C_Order/REC-1');
    });

    it('sends no Authorization header without a token, but still sends the UI locale', async () => {
      // ETP-5022: a tokenless request carries no credentials, but Accept-Language is not a
      // credential — it must always travel so the backend answers in the UI locale.
      await setup({ token: undefined });
      expect(globalThis.fetch.mock.calls[0][1].headers).toEqual({ 'Accept-Language': 'es_ES' });
    });
  });

  describe('guards', () => {
    it('does not load without a recordId', () => {
      const { result } = renderHook(() => useAttachments({ ...baseOpts, recordId: undefined }));
      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect(result.current.loading).toBe(false);
      expect(result.current.items).toEqual([]);
    });

    it('list() is a no-op without a tableName', async () => {
      const { result } = renderHook(() => useAttachments({ ...baseOpts, tableName: undefined }));
      await act(async () => { await result.current.list(); });
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('upload() ignores a missing file', async () => {
      const { result } = await setup();
      globalThis.fetch.mockClear();
      await act(async () => { await result.current.upload(null); });
      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect(result.current.uploadingFiles.size).toBe(0);
    });

    it('upload() ignores a file when there is no record yet', async () => {
      const { result } = renderHook(() => useAttachments({ ...baseOpts, recordId: undefined }));
      await act(async () => {
        await result.current.upload(new File(['x'], 'x.pdf', { type: 'application/pdf' }));
      });
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('download() ignores an attachment with no id', async () => {
      const { result } = await setup();
      globalThis.fetch.mockClear();
      await act(async () => { await result.current.download({ name: 'x.pdf' }); });
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('downloadAll() is a no-op without a record', async () => {
      const { result } = renderHook(() => useAttachments({ ...baseOpts, recordId: undefined }));
      await act(async () => { await result.current.downloadAll(); });
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('remove() ignores a missing id', async () => {
      const { result } = await setup();
      globalThis.fetch.mockClear();
      await act(async () => { await result.current.remove(undefined); });
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('updateDescription() ignores a missing id', async () => {
      const { result } = await setup();
      globalThis.fetch.mockClear();
      await act(async () => { await result.current.updateDescription(null, 'x'); });
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('removeAll() is a no-op with an empty list', async () => {
      const { result } = await setup();
      globalThis.fetch.mockClear();
      await act(async () => { await result.current.removeAll(); });
      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
    });
  });

  describe('list() payload shapes', () => {
    it('accepts response.data', async () => {
      globalThis.fetch.mockResolvedValue(jsonResponse({ response: { data: [{ id: 'a' }] } }));
      const { result } = await setup();
      expect(result.current.items.map(i => i.id)).toEqual(['a']);
    });

    it('accepts a bare data array', async () => {
      globalThis.fetch.mockResolvedValue(jsonResponse({ data: [{ id: 'b' }, { id: 'c' }] }));
      const { result } = await setup();
      expect(result.current.items.map(i => i.id)).toEqual(['b', 'c']);
    });

    it('accepts a top-level array', async () => {
      globalThis.fetch.mockResolvedValue(jsonResponse([{ id: 'd' }]));
      const { result } = await setup();
      expect(result.current.items.map(i => i.id)).toEqual(['d']);
    });

    it('falls back to an empty list for an unexpected shape', async () => {
      globalThis.fetch.mockResolvedValue(jsonResponse({ unexpected: true }));
      const { result } = await setup();
      expect(result.current.items).toEqual([]);
      expect(result.current.error).toBeNull();
    });

    it('ignores an aborted request without setting an error', async () => {
      const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
      globalThis.fetch.mockRejectedValue(abortError);
      const { result } = renderHook(() => useAttachments(baseOpts));
      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
      await act(async () => { await Promise.resolve(); });
      expect(result.current.error).toBeNull();
      expect(toast.error).not.toHaveBeenCalled();
    });
  });

  describe('backend error messages', () => {
    it('prefers error.message', async () => {
      globalThis.fetch.mockResolvedValue(
        jsonResponse({ error: { message: 'no access' } }, { ok: false, status: 403 }),
      );
      const { result } = await setup();
      expect(result.current.error.message).toBe('no access');
      expect(toast.error).toHaveBeenCalledWith('no access');
    });

    it('accepts the nested response.error.message shape', async () => {
      globalThis.fetch.mockResolvedValue(
        jsonResponse({ response: { error: { message: 'nested boom' } } }, { ok: false, status: 500 }),
      );
      const { result } = await setup();
      expect(result.current.error.message).toBe('nested boom');
    });

    it('falls back to the plain text body when the payload is not JSON', async () => {
      globalThis.fetch.mockResolvedValue(textResponse('gateway exploded'));
      const { result } = await setup();
      expect(result.current.error.message).toBe('gateway exploded');
    });

    it('falls back to the HTTP status when nothing can be read', async () => {
      globalThis.fetch.mockResolvedValue(unreadableResponse({ status: 503 }));
      const { result } = await setup();
      expect(result.current.error.message).toBe('HTTP 503');
    });

    it('falls back to the HTTP status when the text body is empty', async () => {
      globalThis.fetch.mockResolvedValue(textResponse('', { status: 502 }));
      const { result } = await setup();
      expect(result.current.error.message).toBe('HTTP 502');
    });
  });

  describe('upload', () => {
    it('tracks the file while in flight and clears it afterwards', async () => {
      let release;
      const { result } = await setup();
      globalThis.fetch.mockImplementation(() => new Promise((resolve) => {
        release = () => resolve(jsonResponse({ id: 'new-1' }));
      }));

      const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
      Object.defineProperty(file, 'size', { value: 4096 });
      let pending;
      await act(async () => { pending = result.current.upload(file); });

      expect(result.current.uploadingFiles.size).toBe(1);
      expect([...result.current.uploadingFiles.values()][0]).toEqual({ name: 'hello.txt', size: 4096 });

      await act(async () => { release(); await pending; });
      expect(result.current.uploadingFiles.size).toBe(0);
      expect(result.current.items.map(i => i.id)).toEqual(['new-1']);
    });

    it('reports a failed upload and keeps the list untouched', async () => {
      globalThis.fetch.mockResolvedValue(jsonResponse({ items: [{ id: 'old' }] }));
      const { result } = await setup();
      globalThis.fetch.mockResolvedValue(
        jsonResponse({ message: 'file too big' }, { ok: false, status: 413 }),
      );

      await act(async () => {
        await result.current.upload(new File(['x'], 'x.pdf', { type: 'application/pdf' }));
      });

      expect(toast.error).toHaveBeenCalledWith('file too big');
      expect(result.current.items.map(i => i.id)).toEqual(['old']);
      expect(result.current.uploadingFiles.size).toBe(0);
    });
  });

  describe('download', () => {
    it('downloads a single attachment under its name', async () => {
      const { result } = await setup();
      globalThis.fetch.mockClear();

      await act(async () => {
        await result.current.download({ id: 'att-1', name: 'invoice.pdf' });
      });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://api.test/sws/neo/attachments/file/att-1',
        { headers: { Authorization: 'Bearer tok-123', 'Accept-Language': 'es_ES' } },
      );
      expect(anchorClick).toHaveBeenCalledTimes(1);
      expect(globalThis.URL.createObjectURL).toHaveBeenCalled();
      expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake');
      // The temporary anchor is removed again.
      expect(document.querySelector('a[download]')).toBeNull();
    });

    it('falls back to fileName and then to a generated name', async () => {
      const { result } = await setup();
      const names = [];
      anchorClick.mockImplementation(function capture() { names.push(this.download); });

      await act(async () => {
        await result.current.download({ id: 'att-2', fileName: 'from-file-name.pdf' });
      });
      await act(async () => {
        await result.current.download({ id: 'att-3' });
      });

      expect(names).toEqual(['from-file-name.pdf', 'attachment-att-3']);
    });

    it('reports a failed download', async () => {
      const { result } = await setup();
      globalThis.fetch.mockResolvedValue(
        jsonResponse({ message: 'not found' }, { ok: false, status: 404 }),
      );

      await act(async () => { await result.current.download({ id: 'att-9' }); });

      expect(toast.error).toHaveBeenCalledWith('not found');
      expect(anchorClick).not.toHaveBeenCalled();
    });
  });

  describe('downloadAll', () => {
    it('downloads the zip named after the record', async () => {
      const { result } = await setup();
      globalThis.fetch.mockClear();
      let downloadName;
      anchorClick.mockImplementation(function capture() { downloadName = this.download; });

      await act(async () => { await result.current.downloadAll(); });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://api.test/sws/neo/attachments/C_Order/REC-1/zip',
        { headers: { Authorization: 'Bearer tok-123', 'Accept-Language': 'es_ES' } },
      );
      expect(downloadName).toBe('attachments-REC-1.zip');
    });

    it('reports a failed zip download', async () => {
      const { result } = await setup();
      globalThis.fetch.mockResolvedValue(unreadableResponse({ status: 500 }));

      await act(async () => { await result.current.downloadAll(); });

      expect(toast.error).toHaveBeenCalledWith('HTTP 500');
      expect(anchorClick).not.toHaveBeenCalled();
    });
  });

  describe('removeAll', () => {
    it('deletes every attachment and empties the list', async () => {
      globalThis.fetch.mockResolvedValue(jsonResponse({ items: [{ id: 'x' }, { id: 'y' }] }));
      const { result } = await setup();
      globalThis.fetch.mockClear();
      globalThis.fetch.mockResolvedValue(jsonResponse({}));

      await act(async () => { await result.current.removeAll(); });

      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect(globalThis.fetch.mock.calls.map(c => c[0])).toEqual([
        'http://api.test/sws/neo/attachments/file/x',
        'http://api.test/sws/neo/attachments/file/y',
      ]);
      expect(globalThis.fetch.mock.calls[0][1].method).toBe('DELETE');
      expect(result.current.items).toEqual([]);
      expect(toast.success).toHaveBeenCalledWith('attachmentsDeleteAllSuccess');
    });

    it('rolls the list back when one delete fails', async () => {
      globalThis.fetch.mockResolvedValue(jsonResponse({ items: [{ id: 'x' }, { id: 'y' }] }));
      const { result } = await setup();
      globalThis.fetch.mockImplementation((url) => Promise.resolve(
        url.endsWith('/y')
          ? textResponse('cannot delete', { status: 409 })
          : jsonResponse({}),
      ));

      await act(async () => { await result.current.removeAll(); });

      await waitFor(() => expect(result.current.items.map(i => i.id)).toEqual(['x', 'y']));
      expect(toast.error).toHaveBeenCalledWith('cannot delete');
    });

    it('falls back to the HTTP status when the failed delete has no body', async () => {
      globalThis.fetch.mockResolvedValue(jsonResponse({ items: [{ id: 'x' }] }));
      const { result } = await setup();
      globalThis.fetch.mockResolvedValue(textResponse('', { status: 500 }));

      await act(async () => { await result.current.removeAll(); });

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('HTTP 500'));
      expect(result.current.items.map(i => i.id)).toEqual(['x']);
    });
  });

  it('exposes formatBytes through the hook API', async () => {
    const { result } = await setup();
    expect(result.current.formatBytes(1536)).toBe('1.5 KB');
  });
});
