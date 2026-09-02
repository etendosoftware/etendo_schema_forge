// Real-locale breadcrumb + i18n regression coverage (ETP-4945).
//
// Three separate bugs fixed in NotPostedDocumentsPage.jsx, all invisible to
// the sibling NotPostedDocumentsPage.vitest.jsx's identity `useUI` mock
// (`(key) => key`) — this file renders with `useUI` backed by the REAL locale
// dictionary so each fix's actual text is verified, not just that some key
// was looked up:
//   1. useSetPageMeta never received a `breadcrumb` key at all — TopBar
//      rendered nothing. Fix: `breadcrumb: `${ui('finance')} / ${ui('notPostedDocuments')}``.
//   2. The date-range filter labels were hardcoded English `<label>From</label>`
//      / `<label>To</label>`. Fix: `ui('filterFrom')` / `ui('filterTo')`.
//   3. The document-type badge rendered the raw backend code
//      (`row.documentType`, e.g. "GLJ") untranslated. Fix: look it up in
//      `filterOptions.documentTypes` (already {value,label} pairs from the
//      API) via `documentTypeLabels`, falling back to the raw code only if
//      unmapped.
// Capture pattern for useSetPageMeta mirrors
// windows/custom/financial-account/__tests__/index.vitest.jsx.
import { render, screen, waitFor } from '@testing-library/react';
import { loadLocaleDictionary, makeRealUI } from '../../shared/__tests__/testUtils/realLocaleUI.js';

import NotPostedDocumentsPage from '../NotPostedDocumentsPage.jsx';

const esES = loadLocaleDictionary('es_ES');
const enUS = loadLocaleDictionary('en_US');
const realUiEs = makeRealUI(esES);
const realUiEn = makeRealUI(enUS);

let activeUi = realUiEs;
vi.mock('@/i18n', () => ({ useUI: () => activeUi }));

const setMetaMock = vi.fn();
vi.mock('@/components/layout/PageMetaContext', () => ({
  useSetPageMeta: (meta) => setMetaMock(meta),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const BASE_URL = '/swebsf/not-posted-documents';
const TOKEN = 'test-token';

// GLJ ("General Ledger Journal") is a real AD_Ref_List document-type code —
// mirrors what the backend's `/header?_mode=filter-options` response actually
// carries (a {value,label} pair per document type), matching the comment
// in NotPostedDocumentsPage.jsx:63-65.
const ROWS = [
  {
    documentId: 'doc-1',
    documentType: 'GLJ',
    description: 'GL-001',
    accountingDate: '2024-03-15T00:00:00',
    organization: 'Main Org',
    tableId: 'tbl-1',
  },
  {
    documentId: 'doc-2',
    documentType: 'UNKNOWN_CODE',
    description: 'UNK-002',
    accountingDate: '2024-04-20',
    organization: 'Branch',
    tableId: 'tbl-2',
  },
];

function mkFetch(rows = []) {
  return vi.fn((url) => {
    if (String(url).includes('_mode=filter-options')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          documentTypes: [{ value: 'GLJ', label: 'Asiento contable' }],
          accountingStatuses: [],
        }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({ rows, total: rows.length }) });
  });
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
    render(<NotPostedDocumentsPage token={TOKEN} apiBaseUrl={BASE_URL} />);

    await waitFor(() => expect(setMetaMock).toHaveBeenCalled());
    const lastCall = setMetaMock.mock.calls.at(-1)[0];
    expect(lastCall.breadcrumb).toBe('Finanzas / Documentos no contabilizados');
    expect(lastCall.title).toBe('Documentos no contabilizados');
  });

  it('resolves the en_US breadcrumb to "Finance / Not Posted Documents"', async () => {
    activeUi = realUiEn;
    vi.stubGlobal('fetch', mkFetch(ROWS));
    render(<NotPostedDocumentsPage token={TOKEN} apiBaseUrl={BASE_URL} />);

    await waitFor(() => expect(setMetaMock).toHaveBeenCalled());
    const lastCall = setMetaMock.mock.calls.at(-1)[0];
    expect(lastCall.breadcrumb).toBe('Finance / Not Posted Documents');
  });
});

describe('NotPostedDocumentsPage — filter labels against the real locale dictionary (ETP-4945)', () => {
  it('renders "Desde"/"Hasta" for the date-range filters in es_ES, not the hardcoded English "From"/"To"', async () => {
    activeUi = realUiEs;
    vi.stubGlobal('fetch', mkFetch([]));
    render(<NotPostedDocumentsPage token={TOKEN} apiBaseUrl={BASE_URL} />);

    await waitFor(() => expect(screen.getByTestId('npd-filter-apply')).toBeInTheDocument());
    expect(screen.getByText('Desde')).toBeInTheDocument();
    expect(screen.getByText('Hasta')).toBeInTheDocument();
    expect(screen.queryByText('From')).not.toBeInTheDocument();
    expect(screen.queryByText('To')).not.toBeInTheDocument();
  });

  it('renders "From"/"To" in en_US', async () => {
    activeUi = realUiEn;
    vi.stubGlobal('fetch', mkFetch([]));
    render(<NotPostedDocumentsPage token={TOKEN} apiBaseUrl={BASE_URL} />);

    await waitFor(() => expect(screen.getByTestId('npd-filter-apply')).toBeInTheDocument());
    expect(screen.getByText('From')).toBeInTheDocument();
    expect(screen.getByText('To')).toBeInTheDocument();
  });
});

describe('NotPostedDocumentsPage — document-type badge translation (ETP-4945)', () => {
  it('renders the mapped label for a known document-type code, not the raw code', async () => {
    activeUi = realUiEs;
    vi.stubGlobal('fetch', mkFetch(ROWS));
    render(<NotPostedDocumentsPage token={TOKEN} apiBaseUrl={BASE_URL} />);

    const row = await screen.findByTestId('npd-row-doc-1');
    expect(row.textContent).toContain('Asiento contable');
    expect(row.textContent).not.toContain('GLJ');
  });

  it('falls back to the raw code for a document type absent from the filter-options catalog', async () => {
    activeUi = realUiEs;
    vi.stubGlobal('fetch', mkFetch(ROWS));
    render(<NotPostedDocumentsPage token={TOKEN} apiBaseUrl={BASE_URL} />);

    const row = await screen.findByTestId('npd-row-doc-2');
    expect(row.textContent).toContain('UNKNOWN_CODE');
  });
});
