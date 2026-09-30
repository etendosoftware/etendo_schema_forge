// ETP-5424 — two contracts for the list "Print / Report" drawer:
//   1. The jsreport render is a RAW fetch (`/jsreport/api/report`, the unauthenticated
//      container proxy), so apiFetch's NetworkError translation never touches it. A dropped
//      connection there must still show the translated networkErrorRetry text, never the
//      browser's 'Failed to fetch'.
//   2. `fetchAllRecords` pages through up to 10,000 rows, which legitimately outlives
//      apiFetch's default timeout — every page request opts out with `timeout: 0`.
// `useApiFetch` is wrapped (not replaced) so the options can be asserted while the real client
// still performs the request.

import { render, screen, waitFor } from '@testing-library/react';
import {
  registerErrorTranslator, resetErrorTranslatorForTests,
} from '@etendosoftware/app-shell-core/auth';

const TRANSLATED = 'No se pudo completar la acción. Intenta nuevamente.';

const { apiFetchCalls } = vi.hoisted(() => ({ apiFetchCalls: [] }));

vi.mock('@/auth/useApiFetch.js', async (importOriginal) => {
  const actual = await importOriginal();
  const wrapped = new WeakMap();
  return {
    ...actual,
    useApiFetch: (baseUrl) => {
      const real = actual.useApiFetch(baseUrl);
      if (!wrapped.has(real)) {
        wrapped.set(real, (path, options = {}) => {
          apiFetchCalls.push({ path, options });
          return real(path, options);
        });
      }
      return wrapped.get(real);
    },
  };
});

// networkErrorRetry is mapped so the case holds whether the drawer builds a core NetworkError
// (translator-resolved) or asks ui() for the key itself.
vi.mock('@/i18n', () => ({
  useUI: () => (key) => (key === 'networkErrorRetry' ? 'No se pudo completar la acción. Intenta nuevamente.' : key),
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocale: () => ({}),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/lib/useAnimatedOpen.js', () => ({
  useAnimatedOpen: (open) => ({ shouldRender: open, isClosing: false }),
}));

vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (row, key) => row?.[key] ?? '',
}));

vi.mock('@/lib/statusBadge.js', () => ({
  statusLabel: (raw) => raw,
}));

import ReportDrawer from '../ReportDrawer.jsx';

const BASE_PROPS = {
  open: true,
  onClose: vi.fn(),
  windowName: 'sales-order',
  columns: [
    { key: 'documentNo', label: 'Document No', type: 'string' },
    { key: 'grandTotal', label: 'Total', type: 'amount' },
  ],
  title: 'Sales Orders Report',
  apiBaseUrl: 'http://localhost:8080/etendo/neo',
  entity: 'sales-order',
  token: 'test-token',
  sortColumn: 'creationDate',
  sortDirection: 'desc',
  activeFilters: [],
};

function dataResponse() {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ response: { data: [{ id: '1', documentNo: 'SO-001', grandTotal: 100 }] } }),
  };
}

describe('ReportDrawer — network failures and data-fetch timeout (ETP-5424)', () => {
  beforeEach(() => {
    apiFetchCalls.length = 0;
    registerErrorTranslator((key) => (key === 'networkErrorRetry' ? TRANSLATED : key));
  });

  afterEach(() => {
    resetErrorTranslatorForTests();
    vi.restoreAllMocks();
  });

  it('a dropped connection on the jsreport render shows the translated retry text, not "Failed to fetch"', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('/jsreport/api/ping')) return Promise.resolve({ ok: true });
      if (url.includes('/jsreport/api/report')) return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve(dataResponse());
    });

    render(<ReportDrawer {...BASE_PROPS} />);

    await waitFor(() => expect(screen.getByText(TRANSLATED)).toBeInTheDocument(), { timeout: 2000 });
    expect(screen.queryByText(/Failed to fetch/)).not.toBeInTheDocument();
  }, 10_000);

  it('a dropped connection on the data fetch shows the translated retry text too', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('/jsreport/api/ping')) return Promise.resolve({ ok: false });
      return Promise.reject(new TypeError('Failed to fetch'));
    });

    render(<ReportDrawer {...BASE_PROPS} />);

    await waitFor(() => expect(screen.getByText(TRANSLATED)).toBeInTheDocument());
    expect(screen.queryByText(/Failed to fetch/)).not.toBeInTheDocument();
  });

  it('fetchAllRecords passes timeout: 0 on every page request', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('/jsreport/api/ping')) return Promise.resolve({ ok: false });
      return Promise.resolve(dataResponse());
    });

    render(<ReportDrawer {...BASE_PROPS} />);

    await waitFor(() => expect(apiFetchCalls.length).toBeGreaterThanOrEqual(1));
    const pageCalls = apiFetchCalls.filter(({ path }) => String(path).includes('_startRow='));
    expect(pageCalls.length).toBeGreaterThanOrEqual(1);
    for (const { options } of pageCalls) {
      expect(options?.timeout).toBe(0);
    }
  });
});
