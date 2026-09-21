// ETP-4404 / ETP-5381 — ReversedInvoicesPanel unit suite (Jira TC map in each test title).
//
// The panel is the "Rectificaciones" accordion custom tab shared by the
// sales-invoice and purchase-invoice windows. These tests drive the REAL
// component (only '@/i18n' is mocked, per the convention of the neighboring
// vitest files) and stub global.fetch to observe the NEO traffic:
//   GET  {apiBaseUrl}/reversedInvoices  → existing rectification lines
//   GET  {apiBaseUrl}/header            → InvoicePickerModal candidates
//   GET  /sws/neo/fiscal-calendar/year  → YearPickerSelect options
//   POST/PATCH/DELETE {apiBaseUrl}/reversedInvoices[/id]
//
// ETP-5381 changed WHERE the candidate list is narrowed. The picker used to fetch one fat page
// (_endRow=500) and then filter/sort/slice it in the browser; now the SERVER does all three
// through `criteria` (documentStatus CO + the invoice's business partner + a `contains` search)
// plus `_startRow`/`_endRow`/`_sortBy`, and the browser only appends batches on scroll. So the
// `/header` stub below is a small fake NEO that HONOURS those parameters: a test that asserts
// "only CO rows are listed" now proves the criteria were actually sent and obeyed, instead of
// proving the component re-filters rows it should never have asked for.

vi.mock('@/i18n', () => ({
  // key + interpolation vars (the established convention, see
  // components/contract-ui/__tests__/InvoicePickerModal.vitest.jsx): lets a test assert the
  // NUMBER a label carries — e.g. the draft field's "N selected" — without hardcoding a
  // translated string.
  useUI: () => (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
  useLabel: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'es_ES', setLocale: () => {} }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
}));

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import ReversedInvoicesPanel from '../ReversedInvoicesPanel.jsx';

const RECORD_ID = 'rec-1';
const API_BASE = '/sws/neo/sales-invoice';
const BP_ID = 'bp-cliente-1';
// Must match RECT_PAGE_SIZE in the component — the batch size the paging assertions rely on.
const PAGE_SIZE = 80;

// ---------------------------------------------------------------------------
// fetch stub
// ---------------------------------------------------------------------------

let fetchCalls;

/**
 * Fake NEO `/header` endpoint: applies the `criteria` array, the `_sortBy` and the
 * `_startRow`/`_endRow` window exactly like the server would.
 *
 * `serverIgnoresSearch` deliberately breaks the contract for ONE test: it returns the full set
 * whatever the search says, so that test can prove the CLIENT does not quietly re-filter the
 * rows it was handed. If the client ever filtered again, that test would go red while every
 * other one stayed green.
 */
function serveHeader(url, rows, { serverIgnoresSearch = false } = {}) {
  const params = new URL(url, 'http://test.local').searchParams;
  const criteria = JSON.parse(params.get('criteria') ?? '[]');
  let out = rows.filter(r => criteria.every(c => {
    if (c.fieldName === 'documentStatus') return r.documentStatus === c.value;
    if (c.fieldName === 'businessPartner') return r.businessPartner === c.value;
    if (c.fieldName === 'documentNo') {
      return serverIgnoresSearch || String(r.documentNo ?? '').includes(c.value);
    }
    return true;
  }));
  if (params.get('_sortBy') === 'documentNo desc') {
    out = [...out].sort((a, b) => String(b.documentNo).localeCompare(String(a.documentNo)));
  }
  const startRow = Number(params.get('_startRow') ?? 0);
  const endRow = Number(params.get('_endRow') ?? out.length - 1);
  return out.slice(startRow, endRow + 1);
}

// Defaults 349 to active so all pre-existing (pre-ETP-4755) tests that expect the
// "Correctiva del 349" checkbox panel visible keep passing without having to know
// about the catalog gate — tests that specifically exercise the gate override
// `activeModels`.
function installFetch({
  lines = [], headerInvoices = [], years = [], postResponse = null, patchResponse = null,
  deleteResponse = null, activeModels = { '349': true }, catalogOk = true,
  serverIgnoresSearch = false,
} = {}) {
  fetchCalls = [];
  let postSeq = 0;
  global.fetch = vi.fn(async (url, opts = {}) => {
    const method = opts.method ?? 'GET';
    const body = opts.body ? JSON.parse(opts.body) : null;
    fetchCalls.push({ url: String(url), method, body });
    const ok = (data) => ({ ok: true, json: async () => ({ response: { data } }) });
    if (method === 'GET' && String(url).includes('/fiscal-models-catalog')) {
      if (!catalogOk) return { ok: false, json: async () => ({}) };
      return { ok: true, json: async () => activeModels };
    }
    if (method === 'GET' && String(url).includes('/fiscal-calendar/year')) return ok(years);
    if (method === 'GET' && String(url).includes('/reversedInvoices')) return ok(lines);
    if (method === 'GET' && String(url).includes('/header')) {
      return ok(serveHeader(String(url), headerInvoices, { serverIgnoresSearch }));
    }
    if (method === 'POST') {
      postSeq += 1;
      // A function lets a test answer differently per call — the fan-out needs the 2nd POST
      // to fail while the 1st succeeded.
      const resolved = typeof postResponse === 'function' ? postResponse(postSeq, body) : postResponse;
      return resolved ?? { ok: true, json: async () => ({}) };
    }
    if (method === 'PATCH') return patchResponse ?? { ok: true, json: async () => ({}) };
    if (method === 'DELETE') return deleteResponse ?? { ok: true, json: async () => ({}) };
    return { ok: false, json: async () => ({}) };
  });
}

const patchCalls = () => fetchCalls.filter(c => c.method === 'PATCH');
const postCalls = () => fetchCalls.filter(c => c.method === 'POST');
const headerCalls = () => fetchCalls.filter(c => c.method === 'GET' && c.url.includes('/header'));
const lastHeaderUrl = () => headerCalls().at(-1).url;
const headerParams = (url = lastHeaderUrl()) => new URL(url, 'http://test.local').searchParams;
const headerCriteria = (url = lastHeaderUrl()) => JSON.parse(headerParams(url).get('criteria') ?? '[]');

// ---------------------------------------------------------------------------
// render helper
// ---------------------------------------------------------------------------

function renderPanel({ data = {}, ...fetchOpts } = {}) {
  installFetch(fetchOpts);
  return render(
    <ReversedInvoicesPanel
      recordId={RECORD_ID}
      data={{
        id: RECORD_ID, isRectificative: true, processed: false, documentStatus: 'DR',
        businessPartner: BP_ID, ...data,
      }}
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

const CO = (id, docNo, date, bpName, extra = {}) => ({
  id, documentNo: docNo, invoiceDate: date, documentStatus: 'CO',
  businessPartner: BP_ID, 'businessPartner$_identifier': bpName, grandTotalAmount: 100, ...extra,
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

// ── picker interaction helpers ───────────────────────────────────────────────
// The draft row's trigger is a button whose LABEL is the state of the selection: the
// `rectifySelectInvoices` placeholder while nothing is picked, the document number for exactly
// one, the count for two or more. Reopening it therefore means clicking whatever it says now.
const openDraftPicker = (label = /^rectifySelectInvoices/) => fireEvent.click(screen.getByText(label));
const pickerRows = () => [...document.body.querySelectorAll('[data-testid^="invoice-picker-option-"]')];
const pickerRowIds = () => pickerRows().map(n => n.getAttribute('data-testid').replace('invoice-picker-option-', ''));
const pickerDocNos = () => pickerRows().map(n => n.querySelector('span').textContent);
const togglePickerRow = (id) => fireEvent.click(screen.getByTestId(`invoice-picker-option-${id}`));
const applyPicker = () => fireEvent.click(screen.getByTestId('invoice-picker-apply'));
const searchInput = () => screen.getByTestId('invoice-picker-search');

/** Open the draft picker, wait for the first batch, select `ids` and confirm. */
async function pickInDraft(...ids) {
  openDraftPicker();
  await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument());
  ids.forEach(togglePickerRow);
  applyPicker();
}

// jsdom has no layout, so scroll geometry has to be installed on the node by hand.
// defineProperty rather than fireEvent's `target` option: clientHeight/scrollHeight are
// getter-only on Element.prototype, and assigning to them throws inside an ES module.
const scrollTo = (node, { scrollTop, clientHeight, scrollHeight }) => {
  Object.defineProperty(node, 'scrollTop', { value: scrollTop, configurable: true });
  Object.defineProperty(node, 'clientHeight', { value: clientHeight, configurable: true });
  Object.defineProperty(node, 'scrollHeight', { value: scrollHeight, configurable: true });
  fireEvent.scroll(node);
};
const scrollPickerToBottom = () =>
  scrollTo(screen.getByTestId('invoice-picker-list'), { scrollTop: 640, clientHeight: 400, scrollHeight: 1050 });

// The search box is debounced by 250ms inside the component; real timers keep the debounce
// honest (a fake-timer run would pass even if the debounce were removed).
const DEBOUNCE_WAIT = { timeout: 2000 };

beforeEach(() => {
  vi.clearAllMocks();
});

// TC-01/TC-02 (tab visibility gating) intentionally NOT covered: the tab stays
// always visible per user decision — the original design does not hide it.

// ---------------------------------------------------------------------------
// TC-03 — InvoicePickerModal candidate list (server-driven since ETP-5381)
// ---------------------------------------------------------------------------

describe('TC-03 — the picker asks the SERVER for CO invoices of the same partner', () => {
  const HEADER_INVOICES = [
    CO(RECORD_ID, '10000001', '2026-06-30', 'Yo Mismo SL'),                        // current invoice → excluded client-side
    { ...CO('inv-dr', '10000099', '2026-06-29', 'Draft SL'), documentStatus: 'DR' }, // not CO → server drops it
    CO('inv-a', '10000020', '2026-03-01', 'Acme Corp S.A.'),
    CO('inv-b', '10000019', '2026-05-10', 'Beta SL'),
    CO('inv-c', '10000030', '2026-05-10', 'Gamma SL'),
    CO('inv-d', '10000005', '2026-01-01', 'Delta SL'),
    CO('inv-e', '10000021', '2026-04-01', 'Epsilon SL'),
    CO('inv-f', '10000002', '2025-12-01', 'Zeta SL'),
    // Same status, DIFFERENT partner: the C_Invoice_Reverse trigger rejects it unconditionally
    // (@NotEqualBPartner@), so it must never be offered.
    CO('inv-other-bp', '10000050', '2026-06-01', 'Otra SA', { businessPartner: 'bp-otro' }),
  ];

  async function openPicker(opts = {}) {
    renderPanel({ headerInvoices: HEADER_INVOICES, ...opts });
    fireEvent.click(await screen.findByTestId('btn__addFirstRectificacion'));
    openDraftPicker();
    await screen.findByPlaceholderText('rectSearchInvoice');
    // wait until the loading placeholder is gone
    await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument());
  }

  it('TC-03: lists every row the server returned — CO only, same partner, sorted by the server', async () => {
    await openPicker();

    // documentNo desc, as asked for via _sortBy — and NOT re-sorted in the browser.
    expect(pickerDocNos()).toEqual(['10000030', '10000021', '10000020', '10000019', '10000005', '10000002']);
    // current invoice, the draft one and the other partner's are not listed
    expect(screen.queryByText('10000001')).not.toBeInTheDocument();
    expect(screen.queryByText('10000099')).not.toBeInTheDocument();
    expect(screen.queryByText('10000050')).not.toBeInTheDocument();
    // ETP-5381 replaced the 5-row cap + "+N more" hint with infinite scroll: every candidate is
    // now reachable, so the hint must be gone rather than merely showing a different number.
    expect(screen.queryByText(/rectMoreInvoicesHint/)).not.toBeInTheDocument();
  });

  it('TC-03: the request carries the CO criterion, the partner criterion, the page window and the sort', async () => {
    await openPicker();

    expect(headerCriteria()).toEqual([
      { fieldName: 'documentStatus', operator: 'equals', value: 'CO' },
      { fieldName: 'businessPartner', operator: 'equals', value: BP_ID },
    ]);
    const params = headerParams();
    expect(params.get('_startRow')).toBe('0');
    expect(params.get('_endRow')).toBe(String(PAGE_SIZE - 1));
    expect(params.get('_sortBy')).toBe('documentNo desc');
  });

  it('TC-03: with no partner on the invoice it OMITS the criterion — never businessPartner: undefined', async () => {
    // `value: undefined` would serialise the criterion away to {fieldName, operator} and ask the
    // server to match an absent value — a silent empty list instead of "no partner filter".
    await openPicker({ data: { businessPartner: undefined } });

    expect(headerCriteria()).toEqual([
      { fieldName: 'documentStatus', operator: 'equals', value: 'CO' },
    ]);
    expect(lastHeaderUrl()).not.toMatch(/businessPartner/);
    // Unfiltered by partner → the other partner's CO invoice is now offered.
    expect(pickerDocNos()).toContain('10000050');
  });

  it('TC-03: typing issues a NEW server request with a `contains` criterion, reset to _startRow=0', async () => {
    await openPicker();
    const before = headerCalls().length;

    fireEvent.change(searchInput(), { target: { value: '0000002' } });

    await waitFor(() => expect(headerCalls().length).toBe(before + 1), DEBOUNCE_WAIT);
    expect(headerCriteria()).toContainEqual({ fieldName: 'documentNo', operator: 'contains', value: '0000002' });
    // A search that kept the scrolled-to window would skip the first matches entirely.
    expect(headerParams().get('_startRow')).toBe('0');
    // The narrowed batch is what the server matched, not a browser-side subset of the old one.
    await waitFor(() => expect(pickerDocNos()).toEqual(['10000002']));
  });

  it('TC-03: does NOT filter the loaded batch in the browser — the client holds one page, not the set', async () => {
    // The server here deliberately ignores the search and returns the same batch. A client-side
    // filter would make the list collapse to "no matches"; the real component must keep showing
    // exactly what the server answered, because the match may live in a batch nobody fetched.
    await openPicker({ serverIgnoresSearch: true });
    const before = headerCalls().length;

    fireEvent.change(searchInput(), { target: { value: 'NOTHING-MATCHES-THIS' } });

    await waitFor(() => expect(headerCalls().length).toBe(before + 1), DEBOUNCE_WAIT);
    expect(headerCriteria()).toContainEqual({
      fieldName: 'documentNo', operator: 'contains', value: 'NOTHING-MATCHES-THIS',
    });
    // Every row the server returned is still on screen.
    expect(pickerDocNos()).toEqual(['10000030', '10000021', '10000020', '10000019', '10000005', '10000002']);
    expect(screen.queryByTestId('invoice-picker-no-matches')).not.toBeInTheDocument();
  });

  it('TC-03: renders the partner NAME, never the raw id, for a NEO header row carrying both', async () => {
    // The NEO `/header` entity returns the UUID in `businessPartner` and the readable name in the
    // `$_identifier` twin. Every fixture in this suite used to define only the twin, so the wrong
    // branch of the shared picker was never evaluated and it shipped showing a UUID to the user.
    const RAW_BP = '0ABDA2D3D6C249598F3564C566B8C511';
    renderPanel({
      data: { businessPartner: RAW_BP },
      headerInvoices: [{
        id: 'inv-twin', documentNo: '10000077', invoiceDate: '2026-05-02', documentStatus: 'CO',
        businessPartner: RAW_BP, 'businessPartner$_identifier': 'Laura Morat', grandTotalAmount: 100,
      }],
    });
    fireEvent.click(await screen.findByTestId('btn__addFirstRectificacion'));
    openDraftPicker();
    await screen.findByPlaceholderText('rectSearchInvoice');
    await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument());

    expect(screen.getByText('Laura Morat')).toBeInTheDocument();
    // The assertion that actually guards the regression.
    expect(screen.queryByText(RAW_BP)).not.toBeInTheDocument();
  });

  it('TC-03: also renders a row shaped like the return flow — name in `businessPartner`, no twin', async () => {
    // Same shared component, the mirror row shape produced by the rectifiableInvoices action.
    renderPanel({
      data: { businessPartner: 'Laura Morat' },
      headerInvoices: [{
        id: 'inv-plain', documentNo: '10000078', invoiceDate: '2026-05-03', documentStatus: 'CO',
        businessPartner: 'Laura Morat', grandTotalAmount: 100,
      }],
    });
    fireEvent.click(await screen.findByTestId('btn__addFirstRectificacion'));
    openDraftPicker();
    await screen.findByPlaceholderText('rectSearchInvoice');
    await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument());

    expect(screen.getByText('Laura Morat')).toBeInTheDocument();
  });

  it('TC-03/TC-07: confirming ONE invoice closes the modal, arms the draft and names it on the field', async () => {
    await openPicker();
    togglePickerRow('inv-c');
    applyPicker();

    expect(screen.queryByPlaceholderText('rectSearchInvoice')).not.toBeInTheDocument();
    // The draft now carries an invoice, which is what Save is gated on.
    expect(screen.getByTestId('btn__saveNewLine')).not.toBeDisabled();
    // ETP-5381 follow-up: for exactly one pick the field shows THAT invoice's document number.
    // It regressed to the placeholder once — the multi-select `onApply` blanked the identifier
    // unconditionally and the count branch only fires above one, so a single pick fell through
    // to "rectifySelectInvoices" while Save sat enabled next to it, reading as nothing selected.
    expect(screen.getByText('10000030')).toBeInTheDocument();
    expect(screen.queryByText(/^rectifySelectInvoices/)).not.toBeInTheDocument();
    // …and a document number, not "1 selected": the number tells the user which invoice it is.
    expect(screen.queryByText(/rectifySelectedCount/)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ETP-5381 — server-side paging: batches appended on scroll
// ---------------------------------------------------------------------------

describe('ETP-5381 — the picker pages the candidate list on scroll', () => {
  // 100 candidates: one full batch (80) plus a short one (20).
  const MANY = Array.from({ length: 100 }, (_, i) =>
    CO(`inv-${i}`, `2000${String(i).padStart(4, '0')}`, '2026-05-01', 'Cliente SL'));

  async function openWithMany() {
    renderPanel({ headerInvoices: MANY });
    fireEvent.click(await screen.findByTestId('btn__addFirstRectificacion'));
    openDraftPicker();
    await waitFor(() => expect(pickerRows()).toHaveLength(PAGE_SIZE));
  }

  it('asks for the next window on reaching the bottom and APPENDS it to the rows already shown', async () => {
    await openWithMany();
    expect(headerCalls()).toHaveLength(1);

    scrollPickerToBottom();

    await waitFor(() => expect(headerCalls()).toHaveLength(2));
    // _startRow = rows held so far, not a page counter — the component tracks the row cursor.
    expect(headerParams().get('_startRow')).toBe(String(PAGE_SIZE));
    expect(headerParams().get('_endRow')).toBe(String(2 * PAGE_SIZE - 1));
    // Appended, not replaced.
    await waitFor(() => expect(pickerRows()).toHaveLength(100));
    expect(pickerRowIds()[0]).toBe('inv-99');   // documentNo desc → highest first
  });

  it('stops paging once a SHORT batch comes back', async () => {
    await openWithMany();
    scrollPickerToBottom();
    await waitFor(() => expect(pickerRows()).toHaveLength(100));
    expect(headerCalls()).toHaveLength(2);

    // The 2nd batch was 20 rows < PAGE_SIZE → there is nothing left to ask for.
    scrollPickerToBottom();
    scrollPickerToBottom();

    await waitFor(() => expect(pickerRows()).toHaveLength(100));
    expect(headerCalls()).toHaveLength(2);
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
    // Real € symbol, never the hardcoded literal "EUR" string (not even a variable
    // in the pre-fix code — a raw text literal concatenated unconditionally).
    expect(screen.getByText('2.854,20 €')).toBeInTheDocument();
    expect(screen.queryByText(/EUR/)).toBeNull();
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
// Model 349 catalog gating (ETP-4755) — "Correctiva del 349" checkbox panel
// is fail-closed: hidden while the /fiscal-models-catalog fetch is loading, on
// failure, or unless the response confirms 349 === true. Mirrors NewDeclModal's
// existing catalog-fail-closed convention (fiscal-models window).
// ---------------------------------------------------------------------------

describe('Model 349 catalog gating (ETP-4755) — "Correctiva del 349" checkbox panel', () => {
  it('hides the checkbox panel for an existing row when the catalog reports 349 inactive', async () => {
    renderPanel({ lines: [LINE()], activeModels: { '349': false } });
    await expandFirstRow();

    expect(screen.queryByTestId('checkbox__isCorrective')).not.toBeInTheDocument();
    expect(screen.queryByText('rectBaseProducts')).not.toBeInTheDocument();
  });

  it('hides the checkbox panel for a new-line draft row when the catalog reports 349 inactive', async () => {
    renderPanel({ activeModels: { '349': false } });
    fireEvent.click(await screen.findByTestId('btn__addFirstRectificacion'));

    expect(screen.queryByTestId('checkbox__isCorrective')).not.toBeInTheDocument();
    // Draft row itself still renders (invoice picker, save/cancel) — only the
    // 349-specific panel is gated.
    expect(screen.getByTestId('btn__saveNewLine')).toBeInTheDocument();
  });

  it('hides the checkbox panel (fail-closed) when the catalog fetch fails, for both an existing row and a new-line draft', async () => {
    renderPanel({ lines: [LINE()], catalogOk: false });
    await expandFirstRow();
    expect(screen.queryByTestId('checkbox__isCorrective')).not.toBeInTheDocument();

    fireEvent.click(await screen.findByTestId('btn__addReversedInvoice'));
    // Two ExpandedForm instances now render (existing row still expanded + new draft) —
    // neither carries the checkbox panel.
    expect(screen.queryByTestId('checkbox__isCorrective')).not.toBeInTheDocument();
  });

  it('hides the checkbox panel when the catalog response is malformed (missing the 349 key)', async () => {
    renderPanel({ lines: [LINE()], activeModels: {} });
    await expandFirstRow();

    expect(screen.queryByTestId('checkbox__isCorrective')).not.toBeInTheDocument();
  });

  it('leaves the read-only Modelo 349 grid-column badge unaffected by the catalog gate', async () => {
    // Grid badge (CorrectivaBadge) reflects the row's own persisted aEAT349IsCorrective
    // value — it is a display of past data, not the control that creates it, so the
    // catalog gate (scoped to the checkbox inside ExpandedForm) must not hide it.
    renderPanel({ lines: [LINE({ aEAT349IsCorrective: 'Y' })], activeModels: { '349': false } });
    await screen.findAllByText('10000067');

    expect(screen.getByText('rectCorrective349Badge')).toBeInTheDocument();
    await expandFirstRow();
    expect(screen.queryByTestId('checkbox__isCorrective')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// TC-07 — save a rectification without corrective 349
// ---------------------------------------------------------------------------

describe('TC-07 — draft save POSTs only invoice + reversedInvoice', () => {
  const CANDIDATE = CO('inv-orig-9', '10000090', '2026-05-01', 'Cliente SL');

  it('TC-07: POST body is exactly { invoice, reversedInvoice } — no 349 keys, no _reversedInvoiceIds', async () => {
    renderPanel({ headerInvoices: [CANDIDATE] });
    fireEvent.click(await screen.findByTestId('btn__addFirstRectificacion'));
    await pickInDraft('inv-orig-9');
    fireEvent.click(screen.getByTestId('btn__saveNewLine'));

    await waitFor(() => expect(postCalls()).toHaveLength(1));
    const post = postCalls()[0];
    expect(post.url).toBe(`${API_BASE}/reversedInvoices`);
    expect(post.body).toEqual({ invoice: RECORD_ID, reversedInvoice: 'inv-orig-9' });
    // ETP-5381 added `_reversedInvoiceIds` to the DRAFT state to carry a multi-selection. It is
    // a UI-only carrier and must be stripped before the wire: NEO silently drops keys outside
    // the spec, so a leak here would never fail — it would just quietly travel forever.
    expect(Object.keys(post.body)).not.toContain('_reversedInvoiceIds');
    expect(JSON.stringify(post.body)).not.toContain('_reversedInvoiceIds');
  });

  it('TC-07: a failed POST surfaces the backend message as a toast', async () => {
    renderPanel({
      headerInvoices: [CANDIDATE],
      postResponse: { ok: false, json: async () => ({ error: { message: 'BP distinto al de la factura original' } }) },
    });
    fireEvent.click(await screen.findByTestId('btn__addFirstRectificacion'));
    await pickInDraft('inv-orig-9');
    fireEvent.click(screen.getByTestId('btn__saveNewLine'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('BP distinto al de la factura original'));
    // ETP-5027: toast ONLY — one error, one toast, on every path. The inline
    // paragraph is gone, so the same message is never rendered twice.
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('text__saveError')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ETP-5381 — multi-select on the DRAFT row fans out into one row per invoice
//
// A rectification row holds exactly ONE `reversedInvoice`, so "select several" cannot mean
// "put several in this field" — it means CREATE SEVERAL ROWS. The POSTs are sequential on
// purpose: the C_Invoice_Reverse trigger and the AEAT349 corrective rule run per insert.
// ---------------------------------------------------------------------------

describe('ETP-5381 — draft multi-select fans out into one POST per invoice', () => {
  const THREE = [
    CO('inv-1', '10000091', '2026-05-01', 'Cliente SL'),
    CO('inv-2', '10000092', '2026-05-02', 'Cliente SL'),
    CO('inv-3', '10000093', '2026-05-03', 'Cliente SL'),
  ];
  const YEARS = [{ id: 'y2026', fiscalYear: '2026' }];

  /** Open the add form, select the three candidates and fill the shared AEAT-349 group. */
  async function draftThreeCorrective() {
    fireEvent.click(await screen.findByTestId('btn__addFirstRectificacion'));
    await pickInDraft('inv-1', 'inv-2', 'inv-3');

    fireEvent.click(screen.getByTestId('checkbox__isCorrective'));
    const yearSelect = findYearSelect();
    await waitFor(() => expect(within(yearSelect).getAllByRole('option').length).toBeGreaterThan(1));
    fireEvent.change(yearSelect, { target: { value: 'y2026' } });
    fireEvent.change(findPeriodSelect(), { target: { value: '1T' } });
    // The draft has no onFieldSave, so filling the group must not PATCH anything.
    expect(patchCalls()).toHaveLength(0);
  }

  const AEAT_SHARED = {
    aEAT349IsCorrective: 'Y',
    aEAT349CYear: 'y2026',
    'aEAT349CYear$_identifier': '2026',
    aEAT349Period: '1T',
  };

  it('shows the selected COUNT on the draft field when several are picked, and the document number when one is', async () => {
    renderPanel({ headerInvoices: THREE });
    fireEvent.click(await screen.findByTestId('btn__addFirstRectificacion'));
    await pickInDraft('inv-1', 'inv-2', 'inv-3');

    // The i18n mock renders the interpolation vars, so this asserts the NUMBER, not a translation.
    expect(screen.getByText('rectifySelectedCount:{"count":3}')).toBeInTheDocument();
    // No single identifier can stand for three invoices, so none of them is named…
    expect(screen.queryByText('10000091')).not.toBeInTheDocument();
    // …and the placeholder must not come back either.
    expect(screen.queryByText(/^rectifySelectInvoices/)).not.toBeInTheDocument();

    // Narrow the same draft down to one: the count gives way to that invoice's document number.
    openDraftPicker('rectifySelectedCount:{"count":3}');
    await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument());
    togglePickerRow('inv-1');
    togglePickerRow('inv-3');
    applyPicker();

    expect(screen.getByText('10000092')).toBeInTheDocument();
    expect(screen.queryByText(/rectifySelectedCount/)).not.toBeInTheDocument();
  });

  it('POSTs one row per selected invoice, sharing the same AEAT-349 year/period/corrective', async () => {
    renderPanel({ headerInvoices: THREE, years: YEARS });
    await draftThreeCorrective();

    fireEvent.click(screen.getByTestId('btn__saveNewLine'));

    await waitFor(() => expect(postCalls()).toHaveLength(3));
    expect(postCalls().map(c => c.body.reversedInvoice)).toEqual(['inv-1', 'inv-2', 'inv-3']);
    for (const call of postCalls()) {
      expect(call.url).toBe(`${API_BASE}/reversedInvoices`);
      expect(call.body).toEqual({
        invoice: RECORD_ID, ...AEAT_SHARED, reversedInvoice: call.body.reversedInvoice,
      });
      expect(JSON.stringify(call.body)).not.toContain('_reversedInvoiceIds');
    }
    // The form closes only once the whole fan-out landed.
    await waitFor(() => expect(screen.queryByTestId('btn__saveNewLine')).not.toBeInTheDocument());
  });

  it('STOPS at the first refusal — the invoices after it are never POSTed', async () => {
    // Sequential, not Promise.all: the trigger runs per insert, so a concurrent fan-out would
    // land rows the toast never mentions. The row after the failure must not exist.
    renderPanel({
      headerInvoices: THREE,
      years: YEARS,
      postResponse: (seq) => (seq === 2
        ? { ok: false, json: async () => ({ error: { message: 'Periodo 349 ya declarado' } }) }
        : { ok: true, json: async () => ({}) }),
    });
    await draftThreeCorrective();

    fireEvent.click(screen.getByTestId('btn__saveNewLine'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Periodo 349 ya declarado'));
    expect(postCalls()).toHaveLength(2);
    expect(postCalls().map(c => c.body.reversedInvoice)).toEqual(['inv-1', 'inv-2']);
    expect(postCalls().map(c => c.body.reversedInvoice)).not.toContain('inv-3');
    expect(toast.error).toHaveBeenCalledTimes(1);
    // The draft stays open on the rejected selection so the user can fix it.
    expect(screen.getByTestId('btn__saveNewLine')).toBeInTheDocument();
  });

  it('an EXISTING row stays single-select — no checkboxes, no Confirm — and PATCHes on pick', async () => {
    // Editing a row replaces ONE invoice with ONE invoice; checkboxes there would promise a
    // fan-out the row cannot do.
    renderPanel({ lines: [LINE()], headerInvoices: THREE });
    await expandFirstRow();
    fireEvent.click(screen.getByRole('button', { name: 'rectSearchAria' }));
    await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument());

    const dialog = screen.getByTestId('invoice-picker-picker-modal');
    expect(within(dialog).queryByTestId('invoice-picker-apply')).not.toBeInTheDocument();
    expect(dialog.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    expect(within(dialog).queryByText(/rectifySelectedCount/)).not.toBeInTheDocument();

    // A single click selects AND closes — no Confirm step.
    togglePickerRow('inv-2');
    expect(screen.queryByTestId('invoice-picker-picker-modal')).not.toBeInTheDocument();

    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    expect(patchCalls()[0].url).toBe(`${API_BASE}/reversedInvoices/line-1`);
    expect(patchCalls()[0].body).toEqual({ reversedInvoice: 'inv-2' });
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

describe('TC-13 — isRectificative=false blocks add/delete inside the panel', () => {
  it('TC-13: empty state renders without the add button', async () => {
    renderPanel({ data: { isRectificative: false } });

    expect(await screen.findByText('rectEmptyTitle')).toBeInTheDocument();
    expect(screen.queryByTestId('btn__addFirstRectificacion')).not.toBeInTheDocument();
  });

  it('TC-13: with existing rows, the "Añadir factura rectificada" link and delete are absent', async () => {
    renderPanel({ lines: [LINE()], data: { isRectificative: false } });
    await screen.findAllByText('10000067');

    expect(screen.queryByTestId('btn__addReversedInvoice')).not.toBeInTheDocument();
    expect(screen.queryByText('rectAddInvoice')).not.toBeInTheDocument();
    expect(screen.queryByTestId('btn__deleteLine')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ETP-5027 — a rejected PATCH/DELETE must surface a toast instead of failing silently
// ---------------------------------------------------------------------------

const TRIGGER_MSG = 'La rectificativa dejaría el importe declarado de entregas '
  + '(clave E/A) en negativo para el período indicado.';

describe('ETP-5027 — rejected PATCH surfaces the backend message as a toast', () => {
  const YEARS = [{ id: 'y2026', fiscalYear: '2026' }];

  it('toasts the AEAT349 trigger message when the corrective group PATCH is rejected', async () => {
    renderPanel({
      lines: [LINE()],
      years: YEARS,
      patchResponse: { ok: false, json: async () => ({ error: { message: TRIGGER_MSG } }) },
    });
    await expandFirstRow();

    fireEvent.click(screen.getByTestId('checkbox__isCorrective'));
    const yearSelect = findYearSelect();
    await waitFor(() => expect(within(yearSelect).getAllByRole('option').length).toBeGreaterThan(1));
    fireEvent.change(yearSelect, { target: { value: 'y2026' } });
    fireEvent.change(findPeriodSelect(), { target: { value: '1T' } });

    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    // Before this fix patchLine did nothing at all on !res.ok — the checkbox just
    // reverted on the next fetchLines() with no message anywhere.
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(TRIGGER_MSG));
    // Toast ONLY: an existing row has no draft form to anchor an inline message
    expect(screen.queryByTestId('text__saveError')).not.toBeInTheDocument();
  });

  it('falls back to the generic message when the rejected PATCH body is unparseable', async () => {
    renderPanel({
      lines: [LINE({ aEAT349IsCorrective: 'Y', aEAT349CYear: 'y2026', aEAT349Period: '1T' })],
      years: YEARS,
      patchResponse: { ok: false, json: async () => { throw new Error('not json'); } },
    });
    await expandFirstRow();
    fireEvent.click(screen.getByTestId('checkbox__isCorrective'));

    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('rectSaveError'));
  });

  it('does not toast when the PATCH succeeds', async () => {
    renderPanel({
      lines: [LINE({ aEAT349IsCorrective: 'Y', aEAT349CYear: 'y2026', aEAT349Period: '1T' })],
      years: YEARS,
    });
    await expandFirstRow();
    fireEvent.click(screen.getByTestId('checkbox__isCorrective'));

    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('toasts the backend message when a line DELETE is rejected', async () => {
    renderPanel({
      lines: [LINE()],
      deleteResponse: { ok: false, json: async () => ({ error: { message: TRIGGER_MSG } }) },
    });
    await screen.findAllByText('10000067');
    fireEvent.click(screen.getByTestId('btn__deleteLine'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(TRIGGER_MSG));
    // Toast ONLY — the delete path has no inline anchor either
    expect(screen.queryByTestId('text__saveError')).not.toBeInTheDocument();
  });

  it('does not toast when the DELETE succeeds', async () => {
    renderPanel({ lines: [LINE()] });
    await screen.findAllByText('10000067');
    fireEvent.click(screen.getByTestId('btn__deleteLine'));

    await waitFor(() => expect(fetchCalls.some(c => c.method === 'DELETE')).toBe(true));
    expect(toast.error).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// ETP-5027 regression — a rejected draft POST must not be retried on tab change
//
// DetailView keeps inactive custom tabs MOUNTED (display:none), so the panel's
// document-level capture-phase mousedown "click-outside" handler still fires
// when the user clicks another tab. It used to re-run handleSaveNewLine() with
// the very same already-rejected draft: one extra failed POST — and one extra
// error toast — per tab click, unbounded. Now that the POST path toasts again
// (the inline paragraph was dropped), a regression here is directly visible as
// stacking toasts, so both counts are asserted.
// ---------------------------------------------------------------------------

describe('ETP-5027 — the rejected draft is not re-saved on every outside click', () => {
  const CANDIDATE_A = CO('inv-orig-9', '10000090', '2026-05-01', 'Cliente SL');
  const CANDIDATE_B = CO('inv-orig-8', '10000080', '2026-04-01', 'Cliente SL');
  const REJECTED = { ok: false, json: async () => ({ error: { message: TRIGGER_MSG } }) };

  /** What a tab click does before React unmounts/hides anything: a capture-phase
   *  mousedown on a node outside the draft row. */
  const clickAnotherTab = () => fireEvent.mouseDown(document.body);

  async function failFirstSave(headerInvoices) {
    renderPanel({ headerInvoices, postResponse: REJECTED });
    fireEvent.click(await screen.findByTestId('btn__addFirstRectificacion'));
    await pickInDraft('inv-orig-9');
    fireEvent.click(screen.getByTestId('btn__saveNewLine'));
    await waitFor(() => expect(postCalls()).toHaveLength(1));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(TRIGGER_MSG));
  }

  it('three tab switches after a failed save fire exactly 1 POST and 1 toast', async () => {
    await failFirstSave([CANDIDATE_A]);

    clickAnotherTab();
    clickAnotherTab();
    clickAnotherTab();

    // Give any re-triggered save a chance to land before asserting
    await waitFor(() => expect(screen.getByTestId('btn__saveNewLine')).toBeInTheDocument());
    expect(postCalls()).toHaveLength(1);
    // The user-visible symptom of a re-fire: stacking toasts. Exactly one.
    expect(toast.error).toHaveBeenCalledTimes(1);
    // The draft form stays open so the user can fix the fields
    expect(screen.getByTestId('btn__saveNewLine')).toBeInTheDocument();
    expect(screen.queryByTestId('text__saveError')).not.toBeInTheDocument();
  });

  it('re-arms once the draft changes: editing then clicking outside saves again', async () => {
    await failFirstSave([CANDIDATE_A, CANDIDATE_B]);
    clickAnotherTab();
    expect(postCalls()).toHaveLength(1);
    expect(toast.error).toHaveBeenCalledTimes(1);

    // Swap the pick for a DIFFERENT original invoice → the draft is no longer the rejected one,
    // so `draftSignature` changes and the re-fire guard disarms. The picker reopens from the
    // field, which after a single pick is labelled with that invoice's document number, and it
    // comes back pre-seeded with the current selection: untick the old row, tick the new one.
    openDraftPicker('10000090');
    await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument());
    togglePickerRow('inv-orig-9');
    togglePickerRow('inv-orig-8');
    applyPicker();

    clickAnotherTab();
    await waitFor(() => expect(postCalls()).toHaveLength(2));
    expect(postCalls()[1].body).toEqual({ invoice: RECORD_ID, reversedInvoice: 'inv-orig-8' });
  });
});
