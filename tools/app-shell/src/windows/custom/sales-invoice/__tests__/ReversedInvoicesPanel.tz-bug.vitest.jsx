// Regression test for ETP-4850: date off-by-one bug under negative-UTC-offset
// timezones.
//
// InvoicePickerModal's private fmtDate(d) (used by invoiceRow, both defined
// inside ReversedInvoicesPanel.jsx) does
// `new Date(d).toLocaleDateString('es-ES', {...})` with no explicit
// `timeZone` option. `new Date(d)` is parsed as a UTC instant when `d` is a
// date-only string like "2026-08-10", and `toLocaleDateString` without a
// pinned timeZone renders using the host's local timezone. Under a
// negative-offset timezone (e.g. America/Argentina/Buenos_Aires, UTC-3) that
// rolls the displayed calendar day back by one, e.g. "2026-08-10" renders as
// "09/08/2026" instead of "10/08/2026". The canonical fix
// (tools/app-shell/src/lib/dateOnly.js — formatCalendarDate) avoids this by
// parsing the yyyy-MM-dd components directly with the local Date
// constructor.
//
// TZ is forced to America/Argentina/Buenos_Aires (verified empirically:
// process.env.TZ takes effect per-call in this project's Node/Vitest setup)
// to make the bug reproducible regardless of the CI machine's default
// timezone.
//
// Reached the same way TC-03 in ReversedInvoicesPanel.vitest.jsx does: the
// empty-state "add" flow opens the draft ExpandedForm, whose "Seleccionar..."
// button opens InvoicePickerModal (picker(false)) — the modal fetches
// {apiBaseUrl}/header and renders each CO invoice through invoiceRow().

// --- Mocks (before imports) ---

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'es_ES', setLocale: () => {} }),
}));

// --- Import under test (after mocks) ---

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import ReversedInvoicesPanel from '../ReversedInvoicesPanel.jsx';

// --- Fixtures ---

const RECORD_ID = 'rec-1';
const API_BASE = '/sws/neo/sales-invoice';

// A completed invoice genuinely dated August 10, 2026 — the date-only format
// NEO returns for Date-type fields (matches invoiceDate in the sibling
// ReversedInvoicesPanel.vitest.jsx TC-03 fixtures).
const INVOICE_AUG_10 = {
  id: 'inv-aug-10', documentNo: '10000067', invoiceDate: '2026-08-10',
  documentStatus: 'CO', 'businessPartner$_identifier': 'Cliente SL', grandTotalAmount: 100,
};

function installFetch({ headerInvoices = [] } = {}) {
  global.fetch = vi.fn(async (url) => {
    const ok = (data) => ({ ok: true, json: async () => ({ response: { data } }) });
    if (String(url).includes('/header')) return ok(headerInvoices);
    if (String(url).includes('/reversedInvoices')) return ok([]);
    return { ok: false, json: async () => ({}) };
  });
}

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

// --- Tests ---

describe('ReversedInvoicesPanel — InvoicePickerModal — ETP-4850 date off-by-one bug', () => {
  const originalTz = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = 'America/Argentina/Buenos_Aires';
  });

  afterAll(() => {
    process.env.TZ = originalTz;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the picker row date as 10/08/2026, not shifted back a day', async () => {
    renderPanel({ headerInvoices: [INVOICE_AUG_10] });

    fireEvent.click(await screen.findByTestId('btn__addFirstRectificacion'));
    fireEvent.click(screen.getByText('Seleccionar...'));
    await screen.findByPlaceholderText('rectSearchInvoice');
    await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument());

    // Correct expected behavior: the date shown is the calendar day that was
    // actually stored (2026-08-10), unaffected by the local timezone offset.
    expect(await screen.findByText('10/08/2026')).toBeInTheDocument();
    expect(screen.queryByText('09/08/2026')).not.toBeInTheDocument();
  });
});
