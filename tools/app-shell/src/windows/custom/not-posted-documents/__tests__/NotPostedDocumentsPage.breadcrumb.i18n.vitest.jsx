// Real-locale breadcrumb + i18n regression coverage (ETP-4945).
//
// Three separate bugs fixed in NotPostedDocumentsPage.jsx, all invisible to
// the sibling NotPostedDocumentsPage.vitest.jsx's identity `useUI` mock
// (`(key) => key`) — this file renders with `useUI` backed by the REAL locale
// dictionary so each fix's actual text is verified, not just that some key
// was looked up:
//   1. useSetPageMeta never received a `breadcrumb` key at all — TopBar
//      rendered nothing. Fix: `breadcrumb: `${ui('finance')} / ${ui('notPostedDocuments')}``.
//   2. (Retired by ETP-5591: the From/To date inputs were replaced by the shared
//      DateRangePopover, whose labels are covered below with the other toolbar
//      triggers.)
//   3. The document-type badge rendered the raw backend value untranslated. Fix:
//      look the row's code up in `filterOptions.documentTypes` (already
//      {value,label} pairs from the API). Since ETP-5591 rows carry that code as
//      `documentTypeCode`; a row without one keeps the raw datasource label.
// Capture pattern for useSetPageMeta mirrors
// windows/custom/financial-account/__tests__/index.vitest.jsx.
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { loadLocaleDictionary, makeRealUI } from '../../shared/__tests__/testUtils/realLocaleUI.js';

import NotPostedDocumentsPage from '../NotPostedDocumentsPage.jsx';

const esES = loadLocaleDictionary('es_ES');
const enUS = loadLocaleDictionary('en_US');
const realUiEs = makeRealUI(esES);
const realUiEn = makeRealUI(enUS);

let activeUi = realUiEs;
vi.mock('@/i18n', () => ({
  useUI: () => activeUi,
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocale: () => ({}),
  useLocaleSwitch: () => ({ locale: 'es_ES', setLocale: vi.fn() }),
}));

const setMetaMock = vi.fn();
vi.mock('@/components/layout/PageMetaContext', () => ({
  useSetPageMeta: (meta) => setMetaMock(meta),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const BASE_URL = '/swebsf/not-posted-documents';
const TOKEN = 'test-token';

// GLJ is a real AD_Ref_List document-type code — the backend's filter-options response carries
// a {value,label} pair per code, and since ETP-5591 each row carries its code too.
const ROWS = [
  {
    documentId: 'doc-1', documentType: 'GL Journal', documentTypeCode: 'GLJ', accountingStatus: 'p',
    description: 'GL-001', accountingDate: '2024-03-15', organization: 'Main Org', tableId: '224',
  },
  {
    documentId: 'doc-2', documentType: 'Some Future Type', documentTypeCode: null, accountingStatus: 'N',
    description: 'UNK-002', accountingDate: '2024-04-20', organization: 'Branch', tableId: null,
  },
];

function mkFetch(rows = []) {
  return vi.fn((url) => {
    if (String(url).includes('_mode=filter-options')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ documentTypes: [{ value: 'GLJ', label: 'Asiento contable' }], accountingStatuses: [] }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({ rows, total: rows.length }) });
  });
}

function renderPage(url = '/not-posted-documents') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <NotPostedDocumentsPage token={TOKEN} apiBaseUrl={BASE_URL} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  setMetaMock.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('NotPostedDocumentsPage — breadcrumb against the real locale dictionary (ETP-4945)', () => {
  it('resolves the es_ES breadcrumb to "Finanzas / Documentos no contabilizados" (previously missing entirely)', async () => {
    activeUi = realUiEs;
    vi.stubGlobal('fetch', mkFetch(ROWS));
    renderPage();

    await waitFor(() => expect(setMetaMock).toHaveBeenCalled());
    const lastCall = setMetaMock.mock.calls.at(-1)[0];
    expect(lastCall.breadcrumb).toBe('Finanzas / Documentos no contabilizados');
    expect(lastCall.title).toBe('Documentos no contabilizados');
  });

  it('resolves the en_US breadcrumb to "Finance / Not Posted Documents"', async () => {
    activeUi = realUiEn;
    vi.stubGlobal('fetch', mkFetch(ROWS));
    renderPage();

    await waitFor(() => expect(setMetaMock).toHaveBeenCalled());
    const lastCall = setMetaMock.mock.calls.at(-1)[0];
    expect(lastCall.breadcrumb).toBe('Finance / Not Posted Documents');
  });

  it('republishes the record count once the rows arrive (ETP-5591)', async () => {
    activeUi = realUiEs;
    vi.stubGlobal('fetch', mkFetch(ROWS));
    renderPage();

    await waitFor(() => expect(setMetaMock.mock.calls.at(-1)[0].recordCount).toBe(2));
  });
});

// ETP-5591 — the toolbar triggers and the status badges, with the real copy.
describe('NotPostedDocumentsPage — toolbar and status copy against the real locale dictionary (ETP-5591)', () => {
  it('es_ES: "Todos los documentos" / "Todos los estados" / "Últimos 12 meses" and sentence-case badges', async () => {
    activeUi = realUiEs;
    vi.stubGlobal('fetch', mkFetch(ROWS));
    renderPage();

    await screen.findByTestId('row-doc-1');
    expect(screen.getByTestId('npd-filter-document-type')).toHaveTextContent('Todos los documentos');
    expect(screen.getByTestId('npd-filter-accounting-status')).toHaveTextContent('Todos los estados');
    expect(screen.getByTestId('npd-filter-date-range')).toHaveTextContent('Últimos 12 meses');
    expect(screen.getByTestId('npd-status-doc-1')).toHaveTextContent('Periodo cerrado');
    expect(screen.getByTestId('npd-status-doc-2')).toHaveTextContent('No contabilizado');
    expect(screen.getByTestId('npd-post-row-doc-1')).toHaveTextContent('Contabilizar');
    expect(screen.getByTestId('npd-open-row-doc-1')).toHaveTextContent('Abrir documento');
  });

  it('en_US: "All documents" / "All statuses" and the English badges', async () => {
    activeUi = realUiEn;
    vi.stubGlobal('fetch', mkFetch(ROWS));
    renderPage();

    await screen.findByTestId('row-doc-1');
    expect(screen.getByTestId('npd-filter-document-type')).toHaveTextContent('All documents');
    expect(screen.getByTestId('npd-filter-accounting-status')).toHaveTextContent('All statuses');
    expect(screen.getByTestId('npd-status-doc-1')).toHaveTextContent('Period closed');
    expect(screen.getByTestId('npd-status-doc-2')).toHaveTextContent('Unposted');
  });

  it('es_ES: two statuses read "2 Estados" on the trigger', async () => {
    activeUi = realUiEs;
    vi.stubGlobal('fetch', mkFetch(ROWS));
    renderPage('/not-posted-documents?status=N,i');

    await screen.findByTestId('row-doc-1');
    expect(screen.getByTestId('npd-filter-accounting-status')).toHaveTextContent('2 Estados');
  });

  it('es_ES: the two empty states read as designed', async () => {
    activeUi = realUiEs;
    vi.stubGlobal('fetch', mkFetch([]));
    const { unmount } = renderPage();
    expect(await screen.findByTestId('npd-empty-none')).toHaveTextContent('No hay documentos sin contabilizar');
    unmount();

    renderPage('/not-posted-documents?status=E');
    const filtered = await screen.findByTestId('npd-empty-filtered');
    expect(filtered).toHaveTextContent('No encontramos documentos');
    expect(filtered).toHaveTextContent('No hay documentos que coincidan con los filtros seleccionados.');
    expect(filtered).toHaveTextContent('Limpiar filtros');
  });
});

describe('NotPostedDocumentsPage — document-type badge translation (ETP-4945)', () => {
  it('renders the mapped label for a known document-type code, not the raw value', async () => {
    activeUi = realUiEs;
    vi.stubGlobal('fetch', mkFetch(ROWS));
    renderPage();

    const row = await screen.findByTestId('row-doc-1');
    expect(row.textContent).toContain('Asiento contable');
    expect(row.textContent).not.toContain('GL Journal');
  });

  it('falls back to the raw datasource label for a row without a code', async () => {
    activeUi = realUiEs;
    vi.stubGlobal('fetch', mkFetch(ROWS));
    renderPage();

    const row = await screen.findByTestId('row-doc-2');
    expect(row.textContent).toContain('Some Future Type');
  });
});
