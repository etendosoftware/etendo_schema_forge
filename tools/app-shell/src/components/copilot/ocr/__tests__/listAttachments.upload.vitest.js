/**
 * Transport contract for `uploadAttachment` (ETP-4855 Error 3).
 *
 * The side panel attaches through the same `/sws/neo/attachments/...` endpoint
 * the document's Attachments tab reads, which is what makes the file appear in
 * both places. Two details are easy to break and silent when broken: setting
 * Content-Type by hand (kills the multipart boundary) and letting an error
 * escape (this client is documented as never throwing).
 */
import { uploadAttachment } from '../listAttachments.js';
import {
  TEST_BEARER_TOKEN,
  TEST_CSRF_TOKEN,
  declareBearerSession,
  declareCookieSession,
} from '@/test/sessionContract.js';

const PARAMS = {
  tableName: 'C_Invoice',
  recordId: 'inv-1',
  apiBaseUrl: 'http://host/sws/neo/purchase-invoice',
};

function pdf() {
  return new File(['%PDF-1.4'], 'invoice.pdf', { type: 'application/pdf' });
}

beforeEach(() => {
    declareBearerSession();
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => '' });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('uploadAttachment', () => {
  it('POSTs to the attachments endpoint derived from the spec URL', async () => {
    await uploadAttachment({ ...PARAMS, file: pdf() });

    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('http://host/sws/neo/attachments/C_Invoice/inv-1');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(`Bearer ${TEST_BEARER_TOKEN}`);
    // No Content-Type: the browser must set the multipart boundary itself.
    expect(init.headers).not.toHaveProperty('Content-Type');
  });

  it('sends the file as multipart and lets the browser set the boundary', async () => {
    await uploadAttachment({ ...PARAMS, file: pdf() });

    const [, init] = globalThis.fetch.mock.calls[0];
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.body.get('file')).toBeInstanceOf(File);
    // A hand-set Content-Type would omit the boundary and the upload fails.
    const headerNames = Object.keys(init.headers).map(h => h.toLowerCase());
    expect(headerNames).not.toContain('content-type');
  });

  it('reports success', async () => {
    await expect(uploadAttachment({ ...PARAMS, file: pdf() })).resolves.toEqual({ ok: true });
  });

  it('returns the server message on a non-OK response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'boom',
    });

    await expect(uploadAttachment({ ...PARAMS, file: pdf() }))
      .resolves.toEqual({ ok: false, error: 'boom' });
  });

  it('falls back to the status code when the error body is empty', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 413, text: async () => '' });

    await expect(uploadAttachment({ ...PARAMS, file: pdf() }))
      .resolves.toEqual({ ok: false, error: 'HTTP 413' });
  });

  it('never throws when the network fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline'));

    await expect(uploadAttachment({ ...PARAMS, file: pdf() }))
      .resolves.toEqual({ ok: false, error: 'offline' });
  });

  it('refuses incomplete parameters without hitting the network', async () => {
    for (const missing of ['tableName', 'recordId']) {
      const args = { ...PARAMS, file: pdf(), [missing]: null };
      await expect(uploadAttachment(args)).resolves.toEqual({ ok: false, error: 'missing_params' });
    }
    await expect(uploadAttachment({ ...PARAMS, file: null }))
      .resolves.toEqual({ ok: false, error: 'missing_params' });
    await expect(uploadAttachment()).resolves.toEqual({ ok: false, error: 'missing_params' });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
