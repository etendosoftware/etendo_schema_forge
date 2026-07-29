// ETP-4404 — ReversedInvoicesPanel unit suite (Jira TC map in each test title).
//
// The panel is the "Rectificaciones" accordion custom tab shared by the
// sales-invoice and purchase-invoice windows. These tests drive the REAL
// component (only '@/i18n' is mocked, per the convention of the neighboring
// vitest files) and stub global.fetch to observe the NEO traffic:
//   GET  {apiBaseUrl}/reversedInvoices  → existing rectification lines
//   GET  {apiBaseUrl}/header            → InvoicePickerModal candidates
//   GET  /sws/neo/fiscal-calendar/year  → YearPickerSelect options
//   POST/PATCH/DELETE {apiBaseUrl}/reversedInvoices[/id]

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'es_ES', setLocale: () => {} }),
}));

// ETP-4536 / ETP-4548: the panel is now SIF-aware — it reads useAuth (for the
// org) and useFiscalConfig (for the SIF profile). Mock both so the existing
// fetch-driven suite is unaffected. `fiscalState` lets a test flip the profile:
//   - a real profile (e.g. 'sii') → SIF configured → non-rectificative restricted
//   - 'unconfigured'              → no SIF          → restriction lifted
let fiscalState = { profile: 'sii', loading: false };
vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ selectedOrg: { id: 'org-1' } }),
}));
vi.mock('@/windows/custom/fiscal-config/useFiscalConfig.js', () => ({
  useFiscalConfig: () => fiscalState,
}));

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReversedInvoicesPanel from '../ReversedInvoicesPanel.jsx';

const RECORD_ID = 'rec-1';
const API_BASE = '/sws/neo/sales-invoice';

// ---------------------------------------------------------------------------
// fetch stub
// ---------------------------------------------------------------------------

let fetchCalls;

function installFetch({ lines = [], headerInvoices = [], years = [], postResponse = null, patchResponse = null } = {}) {
  fetchCalls = [];
  global.fetch = vi.fn(async (url, opts = {}) => {
    const method = opts.method ?? 'GET';
    fetchCalls.push({ url: String(url), method, body: opts.body ? JSON.parse(opts.body) : null });
    const ok = (data) => ({ ok: true, json: async () => ({ response: { data } }) });
    if (method === 'GET' && String(url).includes('/fiscal-calendar/year')) return ok(years);
    if (method === 'GET' && String(url).includes('/reversedInvoices')) return ok(lines);
    if (method === 'GET' && String(url).includes('/header')) return ok(headerInvoices);
    if (method === 'POST') return postResponse ?? { ok: true, json: async () => ({}) };
    if (method === 'PATCH') return patchResponse ?? { ok: true, json: async () => ({}) };
    if (method === 'DELETE') return { ok: true, json: async () => ({}) };
    return { ok: false, json: async () => ({}) };
  });
}

const patchCalls = () => fetchCalls.filter(c => c.method === 'PATCH');
const postCalls = () => fetchCalls.filter(c => c.method === 'POST');

// ---------------------------------------------------------------------------
// render helper
// ---------------------------------------------------------------------------

function renderPanel({ data = {}, ...fetchOpts } = {}) {
  installFetch(fetchOpts);
  return render(
    <ReversedInvoicesPanel
      recordId={RECORD_ID}
      data={{ id: RECORD_ID, isRectificative: true, processed: false, documentStatus: 'DR', ...data }}
      token="tkn"
      apiBaseUrl={API_BASE}
      api={{}}
      catalogs={{}}
      isActive
    />
  );
}

const LINE = (extra = {}) => ({
  id: 'line-1',
  invoice: RECORD_ID,
  'reversedInvoice$_identifier': '10000067 - 05-06-2026 - 2854.20',
  reversedInvoice: 'inv-orig-1',
  aEAT349IsCorrective: 'N',
  ...extra,
});

async function expandFirstRow() {
  const chevron = await screen.findByRole('button', { name: 'rectExpand' });
  fireEvent.click(chevron);
}

/** Period <select> = the combobox that offers the "0A - rectPeriodAnnual" option. */
function findPeriodSelect() {
  return screen.queryAllByRole('combobox').find(s => within(s).queryByRole('option', { name: /0A - rectPeriodAnnual/ }));
}

/** Year <select> = the AeatGrid combobox that is NOT the period one. */
function findYearSelect() {
  return screen.queryAllByRole('combobox').find(s => !within(s).queryByRole('option', { name: /0A - rectPeriodAnnual/ }));
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: a SIF is configured, so the non-rectificative restriction applies
  // (mirrors the backend gate). Individual tests override fiscalState as needed.
  fiscalState = { profile: 'sii', loading: false };
});

// TC-01/TC-02 (tab visibility gating) intentionally NOT covered: the tab stays
// always visible per user decision — the original design does not hide it.

// ---------------------------------------------------------------------------
// TC-03 — InvoicePickerModal basic flow
// ---------------------------------------------------------------------------

describe('TC-03 — InvoicePickerModal lists CO invoices, sorted, capped at 5, searchable', () => {
  const CO = (id, docNo, date, bp) => ({
    id, documentNo: docNo, invoiceDate: date, documentStatus: 'CO',
    'businessPartner$_identifier': bp, grandTotalAmount: 100,
  });
  const HEADER_INVOICES = [
    CO(RECORD_ID, '10000001', '2026-06-30', 'Yo Mismo SL'),                       // current invoice → excluded
    { ...CO('inv-dr', '10000099', '2026-06-29', 'Draft SL'), documentStatus: 'DR' }, // not CO → excluded
    CO('inv-a', '10000020', '2026-03-01', 'Acme Corp S.A.'),
    CO('inv-b', '10000019', '2026-05-10', 'Beta SL'),
    CO('inv-c', '10000030', '2026-05-10', 'Gamma SL'),
    CO('inv-d', '10000005', '2026-01-01', 'Delta SL'),
    CO('inv-e', '10000021', '2026-04-01', 'Epsilon SL'),
    CO('inv-f', '10000002', '2025-12-01', 'Zeta SL'),
  ];

  async function openPicker() {
    renderPanel({ headerInvoices: HEADER_INVOICES });
    fireEvent.click(await screen.findByTestId('btn__addFirstRectificacion'));
    fireEvent.click(screen.getByText('Seleccionar...'));
    await screen.findByPlaceholderText('rectSearchInvoice');
    // wait until the loading placeholder is gone
    await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument());
  }

  it('TC-03: shows only completed (CO) invoices, most recent first, max 5 with a hidden-count hint', async () => {
    await openPicker();

    const shown = screen.getAllByText(/^100000\d\d$/).map(el => el.textContent);
    // invoiceDate desc, documentNo desc numeric as tie-breaker, sliced to 5
    expect(shown).toEqual(['10000030', '10000019', '10000021', '10000020', '10000005']);
    // current invoice, draft invoice and the 6th CO candidate are not listed
    expect(screen.queryByText('10000001')).not.toBeInTheDocument();
    expect(screen.queryByText('10000099')).not.toBeInTheDocument();
    expect(screen.queryByText('10000002')).not.toBeInTheDocument();
    expect(screen.getByText(/\+1 rectMoreInvoicesHint/)).toBeInTheDocument();
  });

  it('TC-03: search filters by documentNo AND by business partner identifier', async () => {
    await openPicker();
    const search = screen.getByPlaceholderText('rectSearchInvoice');

    // by business partner
    fireEvent.change(search, { target: { value: 'acme' } });
    expect(screen.getAllByText(/^100000\d\d$/).map(el => el.textContent)).toEqual(['10000020']);
    expect(screen.queryByText(/rectMoreInvoicesHint/)).not.toBeInTheDocument();

    // by document number — reaches the invoice hidden beyond the 5-row cap
    fireEvent.change(search, { target: { value: '10000002' } });
    expect(screen.getAllByText(/^100000\d\d$/).map(el => el.textContent)).toEqual(['10000002']);
  });

  it('TC-03/TC-07: selecting an invoice closes the modal and fills the draft field', async () => {
    await openPicker();
    fireEvent.click(screen.getByText('10000030'));

    expect(screen.queryByPlaceholderText('rectSearchInvoice')).not.toBeInTheDocument();
    expect(screen.getByText('10000030')).toBeInTheDocument(); // draft field now shows the pick
    expect(screen.getByTestId('btn__saveNewLine')).not.toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// TC-04 — lookup-derived display from reversedInvoice$_identifier
// ---------------------------------------------------------------------------

describe('TC-04 — grid row derives docNo/date/amount from the reversed invoice identifier', () => {
  it('TC-04: renders 10000067, 05/06/2026 and the localized total from the _identifier', async () => {
    renderPanel({ lines: [LINE()] });

    // docNo appears in both "Factura original" and "Documento" columns
    expect(await screen.findAllByText('10000067')).toHaveLength(2);
    expect(screen.getByText('05/06/2026')).toBeInTheDocument();
    const expectedTotal = Number('2854.20').toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    expect(screen.getByText(`${expectedTotal} EUR`)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// TC-05 / TC-06 — conditional AEAT-349 fields
// ---------------------------------------------------------------------------

describe('TC-05/TC-06 — 349 fields only visible when "Correctiva del 349" is checked', () => {
  it('TC-05: expanded non-corrective row hides Año/Periodo/Base fields', async () => {
    renderPanel({ lines: [LINE()] });
    await expandFirstRow();

    expect(screen.getByTestId('checkbox__isCorrective')).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByText('rectBaseProducts')).not.toBeInTheDocument();
    expect(screen.queryByText('rectBaseServices')).not.toBeInTheDocument();
    expect(findPeriodSelect()).toBeUndefined();
  });

  it('TC-06: checking the box reveals the 349 fields; Base amounts are always disabled', async () => {
    renderPanel({ lines: [LINE()], years: [{ id: 'y2026', fiscalYear: '2026' }] });
    await expandFirstRow();
    fireEvent.click(screen.getByTestId('checkbox__isCorrective'));

    expect(screen.getByTestId('checkbox__isCorrective')).toHaveAttribute('aria-checked', 'true');
    expect(await screen.findByText('rectBaseProducts')).toBeInTheDocument();
    expect(screen.getByText('rectBaseServices')).toBeInTheDocument();
    expect(findPeriodSelect()).toBeDefined();

    // Base amount inputs are DB-trigger computed → always disabled
    for (const label of ['rectBaseProducts', 'rectBaseServices']) {
      const input = screen.getByText(label).closest('div').querySelector('input');
      expect(input).toBeDisabled();
    }
    // Checking alone must NOT fire a PATCH (year+period still missing)
    expect(patchCalls()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-07 — save a rectification without corrective 349
// ---------------------------------------------------------------------------

describe('TC-07 — draft save POSTs only invoice + reversedInvoice', () => {
  const CANDIDATE = {
    id: 'inv-orig-9', documentNo: '10000090', invoiceDate: '2026-05-01',
    documentStatus: 'CO', 'businessPartner$_identifier': 'Cliente SL', grandTotalAmount: 50,
  };

  it('TC-07: POST body is exactly { invoice, reversedInvoice } — no 349 keys', async () => {
    renderPanel({ headerInvoices: [CANDIDATE] });
    fireEvent.click(await screen.findByTestId('btn__addFirstRectificacion'));
    fireEvent.click(screen.getByText('Seleccionar...'));
    fireEvent.click(await screen.findByText('10000090'));
    fireEvent.click(screen.getByTestId('btn__saveNewLine'));

    await waitFor(() => expect(postCalls()).toHaveLength(1));
    const post = postCalls()[0];
    expect(post.url).toBe(`${API_BASE}/reversedInvoices`);
    expect(post.body).toEqual({ invoice: RECORD_ID, reversedInvoice: 'inv-orig-9' });
  });

  it('TC-07: a failed POST surfaces the backend message in text__saveError', async () => {
    renderPanel({
      headerInvoices: [CANDIDATE],
      postResponse: { ok: false, json: async () => ({ error: { message: 'BP distinto al de la factura original' } }) },
    });
    fireEvent.click(await screen.findByTestId('btn__addFirstRectificacion'));
    fireEvent.click(screen.getByText('Seleccionar...'));
    fireEvent.click(await screen.findByText('10000090'));
    fireEvent.click(screen.getByTestId('btn__saveNewLine'));

    expect(await screen.findByTestId('text__saveError')).toHaveTextContent('BP distinto al de la factura original');
  });
});

// ---------------------------------------------------------------------------
// TC-08 — corrective full save (AEAT-349 group batching)
// ---------------------------------------------------------------------------

describe('TC-08 — 349 group PATCHes once, only when corrective + year + period are all set', () => {
  const YEARS = [
    { id: 'y2026', fiscalYear: '2026' },
    { id: 'y2024', fiscalYear: '2024' },
  ];

  it('TC-08: exactly one PATCH with the three keys together; nothing before period is set', async () => {
    renderPanel({ lines: [LINE()], years: YEARS });
    await expandFirstRow();

    // 1. check corrective → local only
    fireEvent.click(screen.getByTestId('checkbox__isCorrective'));
    expect(patchCalls()).toHaveLength(0);

    // 2. year options load ascending numeric by fiscalYear
    const yearSelect = findYearSelect();
    await waitFor(() => expect(within(yearSelect).getAllByRole('option').length).toBeGreaterThan(1));
    const yearLabels = within(yearSelect).getAllByRole('option').map(o => o.textContent);
    expect(yearLabels).toEqual(['Seleccionar...', '2024', '2026']);

    // 3. pick the year → group still incomplete, still no PATCH
    fireEvent.change(yearSelect, { target: { value: 'y2026' } });
    expect(patchCalls()).toHaveLength(0);

    // 4. pick the period → group complete → exactly ONE PATCH with all three keys
    fireEvent.change(findPeriodSelect(), { target: { value: '1T' } });
    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    const patch = patchCalls()[0];
    expect(patch.url).toBe(`${API_BASE}/reversedInvoices/line-1`);
    expect(patch.body).toEqual({ aEAT349IsCorrective: 'Y', aEAT349CYear: 'y2026', aEAT349Period: '1T' });
  });

  it('TC-08: unchecking corrective PATCHes {aEAT349IsCorrective: N} immediately', async () => {
    renderPanel({
      lines: [LINE({ aEAT349IsCorrective: 'Y', aEAT349CYear: 'y2026', 'aEAT349CYear$_identifier': '2026', aEAT349Period: '1T' })],
      years: YEARS,
    });
    await expandFirstRow();
    fireEvent.click(screen.getByTestId('checkbox__isCorrective'));

    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    expect(patchCalls()[0].body).toEqual({ aEAT349IsCorrective: 'N' });
  });
});

// ---------------------------------------------------------------------------
// TC-09 — read-only when processed
// ---------------------------------------------------------------------------

describe('TC-09 — processed completed invoice renders the panel read-only', () => {
  it('TC-09: no add button, no delete button, corrective checkbox disabled', async () => {
    renderPanel({ lines: [LINE()], data: { processed: true, documentStatus: 'CO' } });
    await screen.findAllByText('10000067');

    expect(screen.queryByTestId('btn__addReversedInvoice')).not.toBeInTheDocument();
    expect(screen.queryByTestId('btn__addFirstRectificacion')).not.toBeInTheDocument();
    expect(screen.queryByTestId('btn__deleteLine')).not.toBeInTheDocument();

    await expandFirstRow();
    expect(screen.getByTestId('checkbox__isCorrective')).toBeDisabled();
  });

  it('TC-09: voided (VO) processed invoice is NOT read-only — actions stay available', async () => {
    renderPanel({ lines: [LINE()], data: { processed: 'Y', documentStatus: 'VO' } });
    await screen.findAllByText('10000067');

    expect(screen.getByTestId('btn__addReversedInvoice')).toBeInTheDocument();
    expect(screen.getByTestId('btn__deleteLine')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// TC-10 — period catalog
// ---------------------------------------------------------------------------

describe('TC-10 — Periodo offers exactly the 17 AEAT period codes', () => {
  it('TC-10: 01..12, 1T..4T and 0A — 17 options plus the empty placeholder', async () => {
    renderPanel({ lines: [LINE({ aEAT349IsCorrective: 'Y' })], years: [] });
    await expandFirstRow();

    const periodSelect = findPeriodSelect();
    expect(periodSelect).toBeDefined();
    const values = within(periodSelect).getAllByRole('option').map(o => o.value).filter(v => v !== '');
    expect(values).toHaveLength(17);
    expect([...values].sort()).toEqual([
      '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12',
      '0A', '1T', '2T', '3T', '4T',
    ].sort());
  });
});

// ---------------------------------------------------------------------------
// TC-13 — non-rectificative invoices never get add actions
// ---------------------------------------------------------------------------

// ETP-4536 / ETP-4548: the non-rectificative restriction is now SIF-conditional.
// The DB function ETSG_CHECK_RECTIF_INV_DOC only enforces the rectificative
// doc-type/rectifications consistency when the org is SIF-enrolled, so the panel
// must gate its own restriction the same way. With a SIF configured the panel is
// still strict (TC-13); with NO SIF the restriction is lifted.
//
// Follow-up fix: `isRectificative` is only backend-enriched on a detail GET, so
// on a new form / right after a save it is `undefined`, not `false`. The panel
// now treats ONLY an explicit `true` as rectificative — undefined/null/false all
// count as non-rectificative. With a SIF that means unknown → read-only
// (add button hidden) until a detail GET resolves it to `true` ("lines-first").
describe('TC-13 — non-rectificative (incl. undefined) blocks add/delete only when a SIF is configured', () => {
  it('TC-13: empty state renders without the add button (SIF configured, isRectificative=false)', async () => {
    fiscalState = { profile: 'sii', loading: false };
    renderPanel({ data: { isRectificative: false } });

    expect(await screen.findByText('rectEmptyTitle')).toBeInTheDocument();
    expect(screen.queryByTestId('btn__addFirstRectificacion')).not.toBeInTheDocument();
  });

  it('TC-13: with existing rows and a SIF, the "Añadir factura rectificada" link and delete are absent', async () => {
    fiscalState = { profile: 'sii', loading: false };
    renderPanel({ lines: [LINE()], data: { isRectificative: false } });
    await screen.findAllByText('10000067');

    expect(screen.queryByTestId('btn__addReversedInvoice')).not.toBeInTheDocument();
    expect(screen.queryByText('rectAddInvoice')).not.toBeInTheDocument();
    expect(screen.queryByTestId('btn__deleteLine')).not.toBeInTheDocument();
  });

  it('TC-13: SIF configured + isRectificative UNDEFINED (new/just-saved, not yet enriched) → NO add button', async () => {
    fiscalState = { profile: 'sii', loading: false };
    renderPanel({ data: { isRectificative: undefined } });

    expect(await screen.findByText('rectEmptyTitle')).toBeInTheDocument();
    expect(screen.queryByTestId('btn__addFirstRectificacion')).not.toBeInTheDocument();
  });

  it('TC-13: SIF configured + isRectificative TRUE → add button shown', async () => {
    fiscalState = { profile: 'sii', loading: false };
    renderPanel({ data: { isRectificative: true } });

    expect(await screen.findByTestId('btn__addFirstRectificacion')).toBeInTheDocument();
  });

  it('TC-13: while fiscal config is still loading, a non-rectificative doc stays restricted (no add-button flash)', async () => {
    fiscalState = { profile: null, loading: true };
    renderPanel({ data: { isRectificative: false } });

    expect(await screen.findByText('rectEmptyTitle')).toBeInTheDocument();
    expect(screen.queryByTestId('btn__addFirstRectificacion')).not.toBeInTheDocument();
  });

  it('TC-13 (no SIF): a non-rectificative invoice DOES show the add button — restriction lifted', async () => {
    fiscalState = { profile: 'unconfigured', loading: false };
    renderPanel({ data: { isRectificative: false } });

    expect(await screen.findByTestId('btn__addFirstRectificacion')).toBeInTheDocument();
  });

  it('TC-13 (no SIF): isRectificative UNDEFINED still shows the add button — restriction lifted', async () => {
    fiscalState = { profile: 'unconfigured', loading: false };
    renderPanel({ data: { isRectificative: undefined } });

    expect(await screen.findByTestId('btn__addFirstRectificacion')).toBeInTheDocument();
  });

  it('TC-13 (no SIF): isRectificative TRUE shows the add button', async () => {
    fiscalState = { profile: 'unconfigured', loading: false };
    renderPanel({ data: { isRectificative: true } });

    expect(await screen.findByTestId('btn__addFirstRectificacion')).toBeInTheDocument();
  });

  it('TC-13 (no SIF): with existing rows the add link and delete are available', async () => {
    fiscalState = { profile: 'unconfigured', loading: false };
    renderPanel({ lines: [LINE()], data: { isRectificative: false } });
    await screen.findAllByText('10000067');

    expect(screen.getByTestId('btn__addReversedInvoice')).toBeInTheDocument();
    expect(screen.getByTestId('btn__deleteLine')).toBeInTheDocument();
  });
});
