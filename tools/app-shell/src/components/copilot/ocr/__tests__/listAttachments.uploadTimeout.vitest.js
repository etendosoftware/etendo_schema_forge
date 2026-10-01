// ETP-5424 — the attachment upload carries the whole file as its body, which on a slow uplink
// can outlive apiFetch's default timeout; a cut-off upload that still lands server-side invites
// a duplicate attachment on retry, so the upload opts out with `timeout: 0`.
// ETP-5289 replaced the AttachFile-webhook `attachFile()` with `uploadAndMarkMainAttachment()`
// (NEO /sws/neo/attachments), so the opt-out lives there now. The real core `apiFetch` performs
// the request; only its options are recorded (see `@/test/recordApiFetch.js`).
vi.mock('@etendosoftware/app-shell-core/auth/api', async (importOriginal) => {
  const { wrapApiFetchModule } = await import('@/test/recordApiFetch.js');
  return wrapApiFetchModule(await importOriginal());
});

import { apiFetchCalls, resetApiFetchCalls } from '@/test/recordApiFetch.js';
import { uploadAndMarkMainAttachment } from '../listAttachments.js';

describe('uploadAndMarkMainAttachment — timeout opt-out (ETP-5424)', () => {
  beforeEach(() => {
    resetApiFetchCalls();
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: { id: 'att-1' } }),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes timeout: 0 on the attachment upload', async () => {
    const file = new Blob(['%PDF-1.4 fake'], { type: 'application/pdf' });
    await uploadAndMarkMainAttachment({
      token: 'tok',
      tableName: 'C_Invoice',
      recordId: 'rec-1',
      file,
      fileName: 'doc.pdf',
      apiBaseUrl: 'http://host/sws/neo/purchase-invoice',
    });

    const upload = apiFetchCalls.find(({ path }) => String(path).includes('/sws/neo/attachments/'));
    expect(upload, 'expected uploadAndMarkMainAttachment to call apiFetch on /sws/neo/attachments').toBeTruthy();
    expect(upload.options.method).toBe('POST');
    expect(upload.options.timeout).toBe(0);
  });
});
