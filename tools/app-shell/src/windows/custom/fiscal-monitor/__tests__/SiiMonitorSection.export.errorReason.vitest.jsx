// ETP-4784 correction #3: the "Exportar" CSV re-fetches the invoice list
// independently of the on-screen state, so it must replicate the same
// header/SiiData `motivo` fallback used by the on-screen "Motivo error"
// column — otherwise a row that shows a reason on screen (because it came
// from the SiiData sub-table) exports with an empty Error cell.

const invoiceRow = (overrides = {}) => ({
  id: 'inv-1',
  invoiceDate: '2026-01-10',
  documentNo: 'EV-2026-0001',
  businessPartner: 'A-1',
  aeatsiiEstado: 'EE',
  aeatsiiErrorCode: null,
  aeatsiiErrorMsg: null,
  grandTotalAmount: 100,
  ...overrides,
});

function mockApiFetch(mainRows, siiDataRows) {
  return vi.fn((url) => {
    if (String(url).includes('SiiData')) {
      return Promise.resolve({ ok: true, json: async () => ({ response: { data: siiDataRows, totalRows: siiDataRows.length } }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({ response: { data: mainRows, totalRows: mainRows.length } }) });
  });
}

let currentApiFetch = mockApiFetch([], []);

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => currentApiFetch }));
vi.mock('@/components/related-documents/helpers.js', () => ({ neoBase: (u) => u }));
vi.mock('@/lib/formatAmount.js', () => ({ formatAmount: (v) => String(v ?? '') }));
vi.mock('lucide-react', () => ({ FileUp: () => null, FileDown: () => null }));
vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, onChange }) => <input type="checkbox" checked={!!checked} onChange={onChange ?? (() => {})} />,
}));
const stableSetSelectedIds = () => {};
const stableToggleAll = () => {};
const stableToggleRow = () => {};
const stableSelectedIds = new Set();

// Real fetchCsvAndDownload/buildCsvAndDownload from FmPrimitives — only the
// display-only bits are stubbed — so the actual CSV-building code path runs.
vi.mock('../FmPrimitives.jsx', async () => {
  const actual = await vi.importActual('../FmPrimitives.jsx');
  return {
    ...actual,
    StatusPill: ({ estado }) => <span data-testid="status-pill">{estado}</span>,
    NumFactura: ({ n }) => <span>{n}</span>,
    ScrollSentinel: () => null,
    isErrorStatus: () => false,
    isPendingStatus: () => false,
    fmtDate: (d) => d ?? '',
    useFmSelection: () => ({
      selectedIds: stableSelectedIds,
      setSelectedIds: stableSetSelectedIds,
      handleToggleAll: stableToggleAll,
      handleToggleRow: stableToggleRow,
    }),
  };
});
vi.mock('../useFiscalMonitor.js', () => ({
  SII_SPEC: 'sii-monitor',
  SII_EMITIDAS_ENTITY: 'issuedInvoices',
  SII_RECIBIDAS_ENTITY: 'receivedInvoices',
  SII_EMITIDAS_ANT_ENTITY: 'issuedInvoices(previousPeriod)',
  SII_RECIBIDAS_ANT_ENTITY: 'receivedInvoices(previousPeriod)',
}));

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SiiMonitorSection from '../SiiMonitorSection.jsx';

const baseProps = {
  orgId: 'org-1',
  apiBaseUrl: '/sws/neo/sii-monitor',
  parentId: 'parent-1',
  kpis: { sii: { issued: 1, received: 0, issuedPrevious: 0, receivedPrevious: 0 } },
};

function captureDownloadedCsv() {
  let capturedText = null;
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    // jsdom/undici Blob exposes text() synchronously-resolved via a promise;
    // read it eagerly so assertions can await a single captured value.
    blob.text().then((t) => { capturedText = t; });
    return 'blob:mock';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const origCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag) => {
    const el = origCreate(tag);
    if (tag === 'a') vi.spyOn(el, 'click').mockImplementation(() => {});
    return el;
  });
  return () => capturedText;
}

describe('SiiMonitorSection — CSV export "Error" column fallback (ETP-4784 #3)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('includes the SiiData motivo in the exported CSV when the header msg is empty', async () => {
    currentApiFetch = mockApiFetch(
      [invoiceRow()],
      [{ invoice: 'inv-1', motivo: 'NIF no identificado en el censo', fechaltimaModificacinSII: '2026-01-01' }],
    );
    const getCsv = captureDownloadedCsv();

    render(<SiiMonitorSection {...baseProps} />);
    const btn = await screen.findByRole('button', { name: /fiscalMonitor\.export/ });
    await userEvent.click(btn);

    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    await waitFor(() => expect(getCsv()).not.toBeNull());
    expect(getCsv()).toContain('NIF no identificado en el censo');
  });

  it('prefers the header aeatsiiErrorMsg over the SiiData motivo when both are present', async () => {
    currentApiFetch = mockApiFetch(
      [invoiceRow({ aeatsiiErrorCode: '500', aeatsiiErrorMsg: 'Header error message' })],
      [{ invoice: 'inv-1', motivo: 'Should not be exported', fechaltimaModificacinSII: '2026-01-01' }],
    );
    const getCsv = captureDownloadedCsv();

    render(<SiiMonitorSection {...baseProps} />);
    const btn = await screen.findByRole('button', { name: /fiscalMonitor\.export/ });
    await userEvent.click(btn);

    await waitFor(() => expect(getCsv()).not.toBeNull());
    expect(getCsv()).toContain('Header error message');
    expect(getCsv()).not.toContain('Should not be exported');
  });
});
