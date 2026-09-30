// ETP-5424 — the send modal renders the document twice through the report service: the HTML
// preview when the modal opens without a cached PDF, and the HTML behind "Download PDF". Both
// can outlive apiFetch's default timeout, so both opt out with `timeout: 0`.
//
// The jsreport PDF step of the download also goes through apiFetch (`/jsreport/api/report`,
// `baseUrl: ''`), so a dropped connection there reaches the user as the translated
// networkErrorRetry text — never the browser's 'Failed to fetch'.
//
// The real client performs every request; only its options are recorded
// (see `@/test/recordApiFetch.js`).
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  registerErrorTranslator, resetErrorTranslatorForTests,
} from '@etendosoftware/app-shell-core/auth';

const TRANSLATED = 'No se pudo completar la acción. Intenta nuevamente.';

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => {
    if (key === 'networkErrorRetry') return 'No se pudo completar la acción. Intenta nuevamente.';
    return params ? `${key}:${JSON.stringify(params)}` : key;
  },
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('lucide-react', () => ({
  Mail: () => null,
  Search: () => null,
  Loader2: () => null,
}));

vi.mock('@/auth/useApiFetch.js', async (importOriginal) => {
  const { wrapUseApiFetchModule } = await import('@/test/recordApiFetch.js');
  return wrapUseApiFetchModule(await importOriginal());
});

import { toast } from 'sonner';
import { apiFetchCallsTo, resetApiFetchCalls } from '@/test/recordApiFetch.js';
import SendDocumentModal from '../SendDocumentModal.jsx';

// No pdfBlobUrl, and a window without a client-side PDF builder ('order' is not in
// documentPdfRegistry): the modal has to render the preview itself through the report service.
const BASE = {
  documentType: 'Invoice',
  documentNo: 'INV-001',
  bpName: 'ACME',
  bpEmail: 'user@domain.com',
  documentId: 'doc-1',
  windowName: 'order',
  token: 'tok',
  onClose: vi.fn(),
  allowEmail: true,
  pdfBlobUrl: null,
  pdfBlobLoading: false,
  cachePreviewBeforeSend: false,
};

function stubFetch({ jsreport } = {}) {
  global.fetch = vi.fn((url) => {
    const u = String(url);
    if (u.includes('/render')) {
      return Promise.resolve({ ok: true, status: 200, text: async () => '<html>Doc</html>', json: async () => ({}) });
    }
    if (u.includes('/jsreport/api/report')) {
      return jsreport ? jsreport() : Promise.resolve({ ok: true, status: 200, blob: async () => new Blob(['%PDF']) });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ response: { data: [] } }) });
  });
}

describe('SendDocumentModal — render timeout opt-out and jsreport network failure (ETP-5424)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetApiFetchCalls();
    registerErrorTranslator((key) => (key === 'networkErrorRetry' ? TRANSLATED : key));
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    resetErrorTranslatorForTests();
    vi.restoreAllMocks();
  });

  it('the preview render passes timeout: 0', async () => {
    stubFetch();
    render(<SendDocumentModal {...BASE} />);

    await waitFor(() => expect(apiFetchCallsTo('/render').length).toBeGreaterThanOrEqual(1));
    expect(apiFetchCallsTo('/render')[0].options.timeout).toBe(0);
  });

  it('the render behind Download PDF passes timeout: 0', async () => {
    const user = userEvent.setup();
    stubFetch();
    render(<SendDocumentModal {...BASE} />);
    await waitFor(() => expect(apiFetchCallsTo('/render').length).toBe(1));

    await user.click(screen.getByText('downloadPdf'));

    await waitFor(() => expect(apiFetchCallsTo('/render').length).toBe(2));
    expect(apiFetchCallsTo('/render')[1].options.timeout).toBe(0);
  });

  it('a dropped connection on the jsreport PDF step shows the translated retry text', async () => {
    const user = userEvent.setup();
    stubFetch({ jsreport: () => Promise.reject(new TypeError('Failed to fetch')) });
    render(<SendDocumentModal {...BASE} />);
    await waitFor(() => expect(apiFetchCallsTo('/render').length).toBe(1));

    await user.click(screen.getByText('downloadPdf'));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.error).toHaveBeenCalledWith(TRANSLATED);
    for (const [msg] of vi.mocked(toast.error).mock.calls) {
      expect(String(msg)).not.toMatch(/Failed to fetch/);
    }
  });
});
