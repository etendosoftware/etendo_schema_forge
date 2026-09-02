// ETP-5112 regression (bug 1) — the Rectificaciones panel must send the line's `updated`
// optimistic-locking token on its PATCH.
//
// ETP-5073 made the backend require the token of the record AS IT WAS READ; only
// `useEntity` remembered one, so every panel that reads with `apiFetch` directly — this one
// — patched without it and got 400 `missing_updated`. The fix is central, in
// `@etendosoftware/app-shell-core` (`auth/api.js` harvests the token from every GET, keyed
// by entity AND id, and injects it into the write that follows), so nothing in this screen
// changed. What is pinned here is the screen's half: it lists its lines through `apiFetch`
// at a path whose entity (`reversedInvoices`) matches the one it writes to.
//
// The real `createApiFetch` is deliberately not stubbed — see `@/test/realApiFetch.js`.

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'es_ES', setLocale: () => {} }),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() } }));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  jsonResponse, neoResponse, bodyOf, writeCalls, resetRecordVersionsForTests,
} from '@/test/realApiFetch.js';
import ReversedInvoicesPanel from '../ReversedInvoicesPanel.jsx';

const RECORD_ID = 'rec-1';
const API_BASE = '/sws/neo/sales-invoice';
const LINE_ID = 'line-1';
const LINE_TOKEN = 'RECT-LINE-TOKEN-0001';

const YEARS = [{ id: 'y2026', fiscalYear: '2026' }];

/** A rectification line that is already corrective, so unchecking PATCHes immediately. */
const correctiveLine = (overrides = {}) => ({
  id: LINE_ID,
  invoice: RECORD_ID,
  'reversedInvoice$_identifier': '10000067 - 05-06-2026 - 2854.20',
  reversedInvoice: 'inv-orig-1',
  aEAT349IsCorrective: 'Y',
  aEAT349CYear: 'y2026',
  'aEAT349CYear$_identifier': '2026',
  aEAT349Period: '1T',
  updated: LINE_TOKEN,
  ...overrides,
});

function installFetch({ lines = [] } = {}) {
  globalThis.fetch = vi.fn((rawUrl, init = {}) => {
    const url = String(rawUrl);
    const method = String(init.method || 'GET').toUpperCase();
    if (method === 'GET' && url.includes('/fiscal-models-catalog')) {
      // Not a NEO record envelope — the panel reads this catalog as a bare object.
      return Promise.resolve(jsonResponse({ 349: true }));
    }
    if (method === 'GET' && url.includes('/fiscal-calendar/year')) return Promise.resolve(neoResponse(YEARS));
    if (method === 'GET' && url.includes('/reversedInvoices')) return Promise.resolve(neoResponse(lines));
    if (method === 'GET' && url.includes('/header')) return Promise.resolve(neoResponse([]));
    return Promise.resolve(neoResponse([]));
  });
  return globalThis.fetch;
}

function renderPanel(fetchOptions) {
  installFetch(fetchOptions);
  return render(
    <ReversedInvoicesPanel
      recordId={RECORD_ID}
      data={{ id: RECORD_ID, isRectificative: true, processed: false, documentStatus: 'DR' }}
      token="tkn"
      apiBaseUrl={API_BASE}
      api={{}}
      catalogs={{}}
      isActive />,
  );
}

async function expandFirstRow() {
  fireEvent.click(await screen.findByRole('button', { name: 'rectExpand' }));
}

beforeEach(() => {
  resetRecordVersionsForTests();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ReversedInvoicesPanel — updated token (ETP-5112)', () => {
  it('sends the line updated token it read, on the corrective PATCH', async () => {
    renderPanel({ lines: [correctiveLine()] });
    const fetchMock = globalThis.fetch;
    await expandFirstRow();

    // Unchecking a fully-configured corrective line PATCHes immediately.
    fireEvent.click(screen.getByTestId('checkbox__isCorrective'));

    await waitFor(() => expect(writeCalls(fetchMock)).toHaveLength(1));

    const [call] = writeCalls(fetchMock);
    expect(call[0]).toContain(`/reversedInvoices/${LINE_ID}`);
    const body = bodyOf(call);
    expect(body.updated).toBe(LINE_TOKEN);
    expect(body.aEAT349IsCorrective).toBe('N');
  });

  it('sends the token of the row actually edited, not of the first row listed', async () => {
    const other = correctiveLine({ id: 'line-0', updated: 'OTHER-LINE-TOKEN' });
    renderPanel({ lines: [other, correctiveLine()] });
    const fetchMock = globalThis.fetch;

    const chevrons = await screen.findAllByRole('button', { name: 'rectExpand' });
    fireEvent.click(chevrons[1]);

    fireEvent.click(screen.getByTestId('checkbox__isCorrective'));

    await waitFor(() => expect(writeCalls(fetchMock)).toHaveLength(1));

    const [call] = writeCalls(fetchMock);
    expect(call[0]).toContain(`/reversedInvoices/${LINE_ID}`);
    expect(bodyOf(call).updated).toBe(LINE_TOKEN);
  });
});
