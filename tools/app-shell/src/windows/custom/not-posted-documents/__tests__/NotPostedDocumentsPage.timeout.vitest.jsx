// @vitest-environment jsdom
// ETP-5424 — posting runs the accounting engine synchronously, and a bulk post does it for
// every selected document in one request. Both can outlive apiFetch's default timeout; a
// client-side cut while the server still commits would report "posting failed" for documents
// that were in fact posted, so both opt out with `timeout: 0`. The real client performs the
// request; only its options are recorded (see `@/test/recordApiFetch.js`).
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { stableUi } = vi.hoisted(() => ({ stableUi: (key) => key }));
vi.mock('@/i18n', () => ({
  useUI: () => stableUi,
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocale: () => ({}),
  useLocaleSwitch: () => ({ locale: 'es_ES', setLocale: vi.fn() }),
}));
vi.mock('@/components/layout/PageMetaContext', () => ({ useSetPageMeta: () => vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

vi.mock('@/auth/useApiFetch.js', async (importOriginal) => {
  const { wrapUseApiFetchModule } = await import('@/test/recordApiFetch.js');
  return wrapUseApiFetchModule(await importOriginal());
});

import { apiFetchCalls, apiFetchCallsTo, resetApiFetchCalls } from '@/test/recordApiFetch.js';
import NotPostedDocumentsPage from '../NotPostedDocumentsPage.jsx';

const BASE_URL = '/swebsf/not-posted-documents';
const TOKEN = 'test-token';

const ROWS = [
  { documentId: 'doc-1', documentType: 'Sales Invoice', description: 'INV-001', accountingDate: '2024-03-15', organization: 'Main Org', tableId: 'tbl-1' },
  { documentId: 'doc-2', documentType: 'Purchase Invoice', description: 'INV-002', accountingDate: '2024-04-20', organization: 'Branch', tableId: 'tbl-2' },
];

function mkFetch() {
  return vi.fn((url) => {
    const u = String(url);
    if (u.includes('_mode=filter-options')) {
      return Promise.resolve({ ok: true, json: async () => ({ documentTypes: [], accountingStatuses: [] }) });
    }
    if (u.includes('/action/bulk-post')) {
      return Promise.resolve({ ok: true, json: async () => ({ ok: 1, total: 1, results: [] }) });
    }
    if (u.includes('/action/post')) {
      return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({ rows: ROWS, total: ROWS.length }) });
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/not-posted-documents']}>
      <NotPostedDocumentsPage token={TOKEN} apiBaseUrl={BASE_URL} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  resetApiFetchCalls();
  globalThis.fetch = mkFetch();
});

describe('NotPostedDocumentsPage — posting timeout opt-out (ETP-5424)', () => {
  it('posting a single row passes timeout: 0', async () => {
    renderPage();
    await waitFor(() => screen.getByTestId('npd-post-row-doc-1'));

    await act(async () => { fireEvent.click(screen.getByTestId('npd-post-row-doc-1')); });

    await waitFor(() => expect(apiFetchCallsTo('/action/post').length).toBe(1));
    expect(apiFetchCallsTo('/action/post')[0].options.timeout).toBe(0);
  });

  it('the bulk post passes timeout: 0', async () => {
    renderPage();
    await waitFor(() => screen.getByTestId('row-doc-1'));
    fireEvent.click(within(screen.getByTestId('row-doc-1')).getByRole('checkbox'));

    await act(async () => { fireEvent.click(screen.getByTestId('npd-post-selected')); });

    await waitFor(() => expect(apiFetchCallsTo('/action/bulk-post').length).toBe(1));
    expect(apiFetchCallsTo('/action/bulk-post')[0].options.timeout).toBe(0);
  });

  it('the list and filter-option reads keep the default timeout', async () => {
    renderPage();
    await waitFor(() => screen.getByTestId('npd-post-row-doc-1'));
    const reads = apiFetchCalls.filter(({ options }) => !options?.method || options.method === 'GET');
    expect(reads.length).toBeGreaterThanOrEqual(1);
    for (const { options } of reads) expect(options?.timeout).toBeUndefined();
  });
});
