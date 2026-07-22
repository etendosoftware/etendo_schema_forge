// ETP-4404 — ReversedInvoicesPanel save-header-first flow (new invoice UX).
//
// Companion suite to ReversedInvoicesPanel.vitest.jsx (which covers the picker,
// AEAT-349 batching, read-only gating, etc. on SAVED records). This file drives
// the props added for the /sales-invoice/new flow:
//   isNew / onSaveHeader / onGoToSavedRecord / autoOpenAdd / restoreDraft
// plus the parseNeoError 400 shape and the docTypeLabel row subtitle.
// Same conventions: real component, only '@/i18n' mocked, global.fetch stubbed.

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'es_ES', setLocale: () => {} }),
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReversedInvoicesPanel from '../ReversedInvoicesPanel.jsx';

const RECORD_ID = 'rec-1';
const API_BASE = '/sws/neo/sales-invoice';

// ---------------------------------------------------------------------------
// fetch stub (same shape as the sibling suite)
// ---------------------------------------------------------------------------

let fetchCalls;

function installFetch({ lines = [], headerInvoices = [], years = [], postResponse = null } = {}) {
  fetchCalls = [];
  global.fetch = vi.fn(async (url, opts = {}) => {
    const method = opts.method ?? 'GET';
    fetchCalls.push({ url: String(url), method, body: opts.body ? JSON.parse(opts.body) : null });
    const ok = (data) => ({ ok: true, json: async () => ({ response: { data } }) });
    if (method === 'GET' && String(url).includes('/fiscal-calendar/year')) return ok(years);
    if (method === 'GET' && String(url).includes('/reversedInvoices')) return ok(lines);
    if (method === 'GET' && String(url).includes('/header')) return ok(headerInvoices);
    if (method === 'POST') return postResponse ?? { ok: true, json: async () => ({}) };
    return { ok: true, json: async () => ({}) };
  });
}

const postCalls = () => fetchCalls.filter(c => c.method === 'POST');

const CANDIDATE = {
  id: 'inv-orig-9', documentNo: '10000090', invoiceDate: '2026-05-01',
  documentStatus: 'CO', 'businessPartner$_identifier': 'Cliente SL', grandTotalAmount: 50,
};

const LINE = (extra = {}) => ({
  id: 'line-1',
  invoice: RECORD_ID,
  'reversedInvoice$_identifier': '10000067 - 05-06-2026 - 2854.20',
  reversedInvoice: 'inv-orig-1',
  aEAT349IsCorrective: 'N',
  ...extra,
});

/** Render the panel in "unsaved invoice" mode (route recordId='new', no data.id). */
function renderNewPanel({ onSaveHeader, onGoToSavedRecord, ...fetchOpts } = {}) {
  installFetch(fetchOpts);
  return render(
    <ReversedInvoicesPanel
      recordId="new"
      data={{ documentStatus: 'DR' }}
      token="tkn"
      apiBaseUrl={API_BASE}
      api={{}}
      catalogs={{}}
      isActive
      isNew
      onSaveHeader={onSaveHeader}
      onGoToSavedRecord={onGoToSavedRecord}
    />
  );
}

/** Render on a saved record with optional autoOpenAdd/restoreDraft. */
function renderSavedPanel({ data = {}, panelProps = {}, ...fetchOpts } = {}) {
  installFetch(fetchOpts);
  const props = {
    recordId: RECORD_ID,
    data: { id: RECORD_ID, isRectificative: true, processed: false, documentStatus: 'DR', ...data },
    token: 'tkn',
    apiBaseUrl: API_BASE,
    api: {},
    catalogs: {},
    isActive: true,
    ...panelProps,
  };
  const utils = render(<ReversedInvoicesPanel {...props} />);
  return { ...utils, props };
}

/** Open the add form on a new-record panel and pick the mocked candidate. */
async function openAddAndPickCandidate() {
  fireEvent.click(await screen.findByTestId('btn__addFirstRectificacion'));
  fireEvent.click(screen.getByText('Seleccionar...'));
  fireEvent.click(await screen.findByText('10000090'));
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// (a) add button on an unsaved record
// ---------------------------------------------------------------------------

describe('save-header-first — add button on an unsaved record', () => {
  it('recordId="new" + isNew + onSaveHeader → add button visible; clicking only opens the form', async () => {
    const onSaveHeader = vi.fn();
    renderNewPanel({ onSaveHeader, headerInvoices: [CANDIDATE] });

    const addBtn = await screen.findByTestId('btn__addFirstRectificacion');
    fireEvent.click(addBtn);

    // The draft form is open (picker trigger + save/cancel buttons render) …
    expect(screen.getByText('Seleccionar...')).toBeInTheDocument();
    expect(screen.getByTestId('btn__saveNewLine')).toBeInTheDocument();
    // … but the header has NOT been saved yet — save happens on Guardar, not on add
    expect(onSaveHeader).not.toHaveBeenCalled();
  });

  it('without onSaveHeader an unsaved record shows NO add button (needs a persisted parent FK)', async () => {
    installFetch({});
    render(
      <ReversedInvoicesPanel
        recordId="new"
        data={{ documentStatus: 'DR' }}
        token="tkn"
        apiBaseUrl={API_BASE}
        api={{}}
        catalogs={{}}
        isActive
        isNew
      />
    );

    expect(await screen.findByText('rectEmptyTitle')).toBeInTheDocument();
    expect(screen.queryByTestId('btn__addFirstRectificacion')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// (b) saving the draft persists the header first, then POSTs with the fresh id
// ---------------------------------------------------------------------------

describe('save-header-first — successful save on an unsaved record', () => {
  it('calls onSaveHeader({navigateAfter:false}), POSTs with invoice=saved.id, then onGoToSavedRecord(saved)', async () => {
    const saved = { id: 'saved-77', documentNo: 'NC-01' };
    const onSaveHeader = vi.fn(async () => saved);
    const onGoToSavedRecord = vi.fn();
    renderNewPanel({ onSaveHeader, onGoToSavedRecord, headerInvoices: [CANDIDATE] });

    await openAddAndPickCandidate();
    fireEvent.click(screen.getByTestId('btn__saveNewLine'));

    await waitFor(() => expect(onGoToSavedRecord).toHaveBeenCalledTimes(1));
    // Header persisted WITHOUT navigating, so the in-progress form stays alive
    expect(onSaveHeader).toHaveBeenCalledTimes(1);
    expect(onSaveHeader).toHaveBeenCalledWith({ navigateAfter: false });
    // The rectification row is POSTed against the fresh header id
    expect(postCalls()).toHaveLength(1);
    expect(postCalls()[0].url).toBe(`${API_BASE}/reversedInvoices`);
    expect(postCalls()[0].body).toEqual({ invoice: 'saved-77', reversedInvoice: 'inv-orig-9' });
    // Success path lands on the saved record with no reopen/draft options
    expect(onGoToSavedRecord).toHaveBeenCalledWith(saved);
  });
});

// ---------------------------------------------------------------------------
// (c) POST fails AFTER the header was created → navigate carrying draft + error
// ---------------------------------------------------------------------------

describe('save-header-first — child POST failure after header save', () => {
  it('calls onGoToSavedRecord(saved, {reopenAdd:true, draft, error:<backend msg>})', async () => {
    const saved = { id: 'saved-77' };
    const onSaveHeader = vi.fn(async () => saved);
    const onGoToSavedRecord = vi.fn();
    renderNewPanel({
      onSaveHeader,
      onGoToSavedRecord,
      headerInvoices: [CANDIDATE],
      postResponse: { ok: false, json: async () => ({ error: { message: 'trigger rejected' } }) },
    });

    await openAddAndPickCandidate();
    fireEvent.click(screen.getByTestId('btn__saveNewLine'));

    await waitFor(() => expect(onGoToSavedRecord).toHaveBeenCalledTimes(1));
    expect(onGoToSavedRecord).toHaveBeenCalledWith(saved, {
      reopenAdd: true,
      draft: { reversedInvoice: 'inv-orig-9', 'reversedInvoice$_identifier': '10000090' },
      error: 'trigger rejected',
    });
    // No inline error on THIS mount — staying on /new would re-save the header
    // on every tab switch (duplicate invoices); the error travels with the draft
    expect(screen.queryByTestId('text__saveError')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// (d) header save itself fails → inline error, no POST
// ---------------------------------------------------------------------------

describe('save-header-first — header save failure', () => {
  it('onSaveHeader returning null shows rectSaveError and fires no POST', async () => {
    const onSaveHeader = vi.fn(async () => null);
    const onGoToSavedRecord = vi.fn();
    renderNewPanel({ onSaveHeader, onGoToSavedRecord, headerInvoices: [CANDIDATE] });

    await openAddAndPickCandidate();
    fireEvent.click(screen.getByTestId('btn__saveNewLine'));

    expect(await screen.findByTestId('text__saveError')).toHaveTextContent('rectSaveError');
    expect(postCalls()).toHaveLength(0);
    expect(onGoToSavedRecord).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// (e) autoOpenAdd + restoreDraft after the save-header navigation
// ---------------------------------------------------------------------------

describe('save-header-first — autoOpenAdd restores the draft after the remount', () => {
  const RESTORE = {
    draft: { reversedInvoice: 'x', 'reversedInvoice$_identifier': 'X' },
    error: 'boom',
  };

  it('mounts with the add form open, the picked invoice prefilled and the carried error visible', async () => {
    renderSavedPanel({ panelProps: { autoOpenAdd: true, restoreDraft: RESTORE } });

    // Add form auto-opened with the restored draft
    expect(await screen.findByTestId('btn__saveNewLine')).toBeInTheDocument();
    expect(screen.getByText('X')).toBeInTheDocument();
    // The error from the failed child POST survived the navigation
    expect(screen.getByTestId('text__saveError')).toHaveTextContent('boom');
    // Draft has an invoice picked → save is enabled
    expect(screen.getByTestId('btn__saveNewLine')).not.toBeDisabled();
  });

  it('fires once only — after cancelling, a rerender does not reopen the form', async () => {
    const { rerender, props } = renderSavedPanel({ panelProps: { autoOpenAdd: true, restoreDraft: RESTORE } });
    await screen.findByTestId('btn__saveNewLine');

    fireEvent.click(screen.getByTestId('btn__cancelNewLine'));
    expect(screen.queryByTestId('btn__saveNewLine')).not.toBeInTheDocument();

    // Rerender with a NEW restoreDraft object identity — the one-shot ref guard
    // must keep the form closed (otherwise every parent render reopens it)
    rerender(
      <ReversedInvoicesPanel
        {...props}
        restoreDraft={{ draft: { ...RESTORE.draft }, error: RESTORE.error }}
      />
    );
    expect(screen.queryByTestId('btn__saveNewLine')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// (f) parseNeoError — NEO 400 shape {"response":{"status":-4,"errors":{...}}}
// ---------------------------------------------------------------------------

describe('parseNeoError — 400 field-errors shape joins all messages', () => {
  it('failed POST on a SAVED record shows "msg1 · msg2"', async () => {
    renderSavedPanel({
      headerInvoices: [CANDIDATE],
      postResponse: {
        ok: false,
        json: async () => ({ response: { status: -4, errors: { id: 'msg1', other: 'msg2' } } }),
      },
    });

    fireEvent.click(await screen.findByTestId('btn__addFirstRectificacion'));
    fireEvent.click(screen.getByText('Seleccionar...'));
    fireEvent.click(await screen.findByText('10000090'));
    fireEvent.click(screen.getByTestId('btn__saveNewLine'));

    expect(await screen.findByTestId('text__saveError')).toHaveTextContent('msg1 · msg2');
  });
});

// ---------------------------------------------------------------------------
// (g) docTypeLabel — row subtitle derived from the spec in apiBaseUrl
// ---------------------------------------------------------------------------

describe('docTypeLabel — Documento subtitle follows the window spec', () => {
  function renderWithBase(apiBaseUrl) {
    installFetch({ lines: [LINE()] });
    return render(
      <ReversedInvoicesPanel
        recordId={RECORD_ID}
        data={{ id: RECORD_ID, isRectificative: true, processed: false, documentStatus: 'DR' }}
        token="tkn"
        apiBaseUrl={apiBaseUrl}
        api={{}}
        catalogs={{}}
        isActive
      />
    );
  }

  it('purchase-invoice spec renders rectDocPurchase under the document number', async () => {
    renderWithBase('/sws/neo/purchase-invoice');
    await screen.findAllByText('10000067');
    expect(screen.getByText('rectDocPurchase')).toBeInTheDocument();
    expect(screen.queryByText('rectDocSales')).not.toBeInTheDocument();
  });

  it('sales-invoice spec renders rectDocSales under the document number', async () => {
    renderWithBase('/sws/neo/sales-invoice');
    await screen.findAllByText('10000067');
    expect(screen.getByText('rectDocSales')).toBeInTheDocument();
    expect(screen.queryByText('rectDocPurchase')).not.toBeInTheDocument();
  });
});
