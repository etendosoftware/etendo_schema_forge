// @covers tools/app-shell/src/components/copilot/ocr/useOcrConfig.js
/**
 * ETP-5715 — what the extraction asks the model is served by the server (`/sws/neo/ocrconfig`),
 * once, and shared with the MCP's document-reading tools. The hook reads it through the shared
 * authenticated helper, keeps no local copy, and says so when it cannot load it.
 */

const mockApiFetch = vi.fn();

vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: () => mockApiFetch,
}));

vi.mock('@/lib/neoBaseUrl.js', () => ({
  getNeoBaseUrl: () => '/etendo/sws/neo',
}));

import { renderHook, waitFor, act } from '@testing-library/react';
import { useOcrConfig } from '../useOcrConfig.js';

const SERVED = {
  docType: 'purchase-invoice',
  toolName: 'SimpleOcrTool',
  question: 'Extract all invoice fields',
  schema: { type: 'object', properties: { vendor_name: { type: ['string', 'null'] } } },
};

function answer(body, ok = true) {
  return { ok, json: async () => body };
}

beforeEach(() => {
  mockApiFetch.mockReset();
});

describe('useOcrConfig', () => {
  it('reads the configuration of the doc type through the shared helper', async () => {
    mockApiFetch.mockResolvedValue(answer(SERVED));

    const { result } = renderHook(() => useOcrConfig('purchase-invoice'));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.config).toEqual(SERVED);
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/etendo/sws/neo/ocrconfig?docType=purchase-invoice',
      { baseUrl: '' },
    );
  });

  it('is loading until the answer arrives', async () => {
    let resolve;
    mockApiFetch.mockReturnValue(new Promise((r) => { resolve = r; }));

    const { result } = renderHook(() => useOcrConfig('purchase-invoice'));

    await waitFor(() => expect(result.current.status).toBe('loading'));
    expect(result.current.config).toBeNull();
    await act(async () => { resolve(answer(SERVED)); });
    expect(result.current.status).toBe('ready');
  });

  it('escapes the doc type in the query string', async () => {
    mockApiFetch.mockResolvedValue(answer(SERVED));

    renderHook(() => useOcrConfig('a b&c'));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(mockApiFetch.mock.calls[0][0]).toBe('/etendo/sws/neo/ocrconfig?docType=a%20b%26c');
  });

  it('does nothing without a doc type, or when disabled (the record is not new)', async () => {
    const none = renderHook(() => useOcrConfig(null));
    const disabled = renderHook(() => useOcrConfig('purchase-invoice', false));

    expect(none.result.current.status).toBe('idle');
    expect(disabled.result.current.status).toBe('idle');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('reports an error for a failed status, a network failure and an unusable answer', async () => {
    for (const failing of [
      () => mockApiFetch.mockResolvedValue(answer({ error: 'nope' }, false)),
      () => mockApiFetch.mockRejectedValue(new Error('offline')),
      () => mockApiFetch.mockResolvedValue(answer({ docType: 'purchase-invoice' })),
      () => mockApiFetch.mockResolvedValue(answer({ ...SERVED, schema: null })),
      () => mockApiFetch.mockResolvedValue({ ok: true, json: async () => { throw new Error('bad json'); } }),
    ]) {
      mockApiFetch.mockReset();
      failing();

      const { result, unmount } = renderHook(() => useOcrConfig('purchase-invoice'));

      await waitFor(() => expect(result.current.status).toBe('error'));
      expect(result.current.config).toBeNull();
      unmount();
    }
  });

  it('retry asks again and recovers', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('offline'));
    mockApiFetch.mockResolvedValue(answer(SERVED));
    const { result } = renderHook(() => useOcrConfig('purchase-invoice'));
    await waitFor(() => expect(result.current.status).toBe('error'));

    act(() => result.current.retry());

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    expect(result.current.config).toEqual(SERVED);
  });

  it('asks again when the doc type changes', async () => {
    mockApiFetch.mockResolvedValue(answer(SERVED));
    const { rerender } = renderHook(({ id }) => useOcrConfig(id), {
      initialProps: { id: 'purchase-invoice' },
    });
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));

    rerender({ id: 'other-doc' });

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    expect(mockApiFetch.mock.calls[1][0]).toContain('docType=other-doc');
  });

  it('an answer that arrives after unmounting changes nothing', async () => {
    let resolve;
    mockApiFetch.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { result, unmount } = renderHook(() => useOcrConfig('purchase-invoice'));
    await waitFor(() => expect(result.current.status).toBe('loading'));

    unmount();
    await act(async () => { resolve(answer(SERVED)); });

    expect(result.current.status).toBe('loading');
  });
});
