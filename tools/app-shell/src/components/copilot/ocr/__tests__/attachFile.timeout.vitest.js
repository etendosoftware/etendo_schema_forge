// ETP-5424 — the attachment upload carries the whole file as a base64 body, which on a slow
// uplink can outlive apiFetch's default timeout; a cut-off upload that still lands server-side
// invites a duplicate attachment on retry, so the upload opts out with `timeout: 0`. The real
// core `apiFetch` performs the request; only its options are recorded
// (see `@/test/recordApiFetch.js`).
vi.mock('@etendosoftware/app-shell-core/auth/api', async (importOriginal) => {
  const { wrapApiFetchModule } = await import('@/test/recordApiFetch.js');
  return wrapApiFetchModule(await importOriginal());
});

import { apiFetchCalls, resetApiFetchCalls } from '@/test/recordApiFetch.js';
import { attachFile } from '../attachFile.js';

describe('attachFile — timeout opt-out (ETP-5424)', () => {
  beforeEach(() => {
    resetApiFetchCalls();
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ message: 'Attachment created successfully' }),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes timeout: 0 on the AttachFile upload', async () => {
    const file = new Blob(['%PDF-1.4 fake'], { type: 'application/pdf' });
    await attachFile({ token: 'tok', tabId: 'tab-1', recordId: 'rec-1', file, fileName: 'doc.pdf' });

    const upload = apiFetchCalls.find(({ path }) => String(path).includes('name=AttachFile'));
    expect(upload, 'expected attachFile to call apiFetch on the AttachFile webhook').toBeTruthy();
    expect(upload.options.method).toBe('POST');
    expect(upload.options.timeout).toBe(0);
  });
});
