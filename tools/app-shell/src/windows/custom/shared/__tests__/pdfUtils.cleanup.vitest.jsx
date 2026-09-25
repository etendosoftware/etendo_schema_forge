/**
 * ETP-5308 — usePdfGenerator's effect cleanup used to reset only `pdfBlob` (plus revoking
 * the object URL). `pdfUrl`, `error` and `loading` were left stale, so closing the Send
 * modal (recordId -> null, the lazy-load fix's own transition) could leave the hook
 * reporting a leftover url/error from the PREVIOUS open, and any wiring that trusted
 * `pdfUrl`/`loading` to reflect "there is currently no fetch" would be wrong. Cleanup now
 * also resets `pdfUrl`, `error` and `loading`, so a later reopen starts from a clean slate.
 */

vi.mock('@/lib/locationAddress.js', () => ({
  buildLocationAddressLines: vi.fn(),
}));

const mockFetchMainAttachment = vi.fn();
const mockFetchAttachmentBlob = vi.fn();
vi.mock('@/components/copilot/ocr/listAttachments', () => ({
  fetchMainAttachment: (...args) => mockFetchMainAttachment(...args),
  fetchAttachmentBlob: (...args) => mockFetchAttachmentBlob(...args),
}));

import { renderHook, waitFor } from '@testing-library/react';
import { usePdfGenerator } from '../pdfUtils.js';

describe('usePdfGenerator — cleanup resets url/error/loading, not just the blob (ETP-5308)', () => {
  let buildBlobFn;
  let builtBlob;
  let revokeObjectURLMock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchMainAttachment.mockResolvedValue(null); // always a cache miss -> buildBlobFn runs
    builtBlob = new Blob(['%PDF-built'], { type: 'application/pdf' });
    buildBlobFn = vi.fn(() => Promise.resolve(builtBlob));
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/generated');
    revokeObjectURLMock = vi.fn();
    globalThis.URL.revokeObjectURL = revokeObjectURLMock;
  });

  it('going from a successful build to a null recordId clears pdfUrl, error and loading, and revokes the object URL', async () => {
    const { result, rerender } = renderHook(
      ({ recordId }) => usePdfGenerator(recordId, '/api/sales-order', 'tok', buildBlobFn),
      { initialProps: { recordId: 'rec-1' } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.pdfUrl).toBe('blob:http://localhost/generated');
    expect(result.current.error).toBeNull();

    rerender({ recordId: null });

    expect(result.current.pdfUrl).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:http://localhost/generated');
  });

  it('going from a failed build to a null recordId clears the error too', async () => {
    buildBlobFn = vi.fn(() => Promise.reject(new Error('render failed')));

    const { result, rerender } = renderHook(
      ({ recordId }) => usePdfGenerator(recordId, '/api/sales-order', 'tok', buildBlobFn),
      { initialProps: { recordId: 'rec-1' } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('render failed');

    rerender({ recordId: null });

    expect(result.current.error).toBeNull();
    expect(result.current.pdfUrl).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('reopening (null -> id) after a close triggers exactly one build', async () => {
    const { result, rerender } = renderHook(
      ({ recordId }) => usePdfGenerator(recordId, '/api/sales-order', 'tok', buildBlobFn),
      { initialProps: { recordId: null } },
    );

    // Closed on mount: no build at all.
    expect(buildBlobFn).not.toHaveBeenCalled();

    rerender({ recordId: 'rec-1' });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(buildBlobFn).toHaveBeenCalledTimes(1);
    expect(result.current.pdfUrl).toBe('blob:http://localhost/generated');

    rerender({ recordId: null });
    expect(result.current.pdfUrl).toBeNull();

    rerender({ recordId: 'rec-1' });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(buildBlobFn).toHaveBeenCalledTimes(2);
    expect(result.current.pdfUrl).toBe('blob:http://localhost/generated');
  });
});
