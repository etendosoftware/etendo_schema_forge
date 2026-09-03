// ETP-5112 regression — `ContactDetailModal`'s save must issue its two PUTs one after the
// other: the business partner record first, then the invoice record.
//
// Core parses a write's `updated` optimistic-locking token through a `private final static
// SimpleDateFormat` (`JsonToDataConverter` line 129), which is not thread-safe. Two writes
// landing on two Tomcat threads at once corrupt each other's parse and one comes back as a
// 500 conflict against a record nobody touched — the same two-write shape that reproduced
// it on the Organización screen.
//
// THE SPECIFIC REGRESSION THIS FILE EXISTS FOR: `saves` is a list of THUNKS
// (`() => apiFetch(...)`), not of promises. Building the list as promises —
// `const saves = [apiFetch(...), apiFetch(...)]` — puts BOTH requests in flight while the
// array is being constructed, and the `for (const save of saves) results.push(await save)`
// loop underneath then serializes only the READING of the results, leaving the race
// exactly as it was. That variant passes any order-only assertion, and it passes any
// assertion that only counts requests. It does not pass a non-overlap assertion, which is
// why that is what this file checks. See `@/test/requestJournal.js`.

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createRequestJournal } from '@/test/requestJournal.js';

const apiFetchMock = vi.fn();

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
// One shared double for both bases (`contactsApiBase` and `neoApiBase`): the two writes are
// told apart by their PATH, which is what the journal labels on.
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => apiFetchMock }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('lucide-react', () => ({
  X: () => <span data-testid="icon-x" />,
  Loader2: () => <span data-testid="icon-loader" />,
  MapPin: () => <span data-testid="icon-map" />,
  ChevronDown: () => <span data-testid="icon-chevron" />,
  Check: () => <span data-testid="icon-check" />,
}));
vi.mock('@/windows/custom/shared/LocationEditorModal.jsx', () => ({
  default: () => <div data-testid="location-editor-modal" />,
}));

import ContactDetailModal from '../ContactDetailModal.jsx';
import { toast } from 'sonner';

const BP_ID = 'bp-1';
const INVOICE_ID = 'inv-1';
const INVOICE_SPEC = 'sales-invoice';

const BP_LABEL = 'businessPartner';
const INVOICE_LABEL = 'invoice';

const baseProps = {
  open: true,
  onClose: vi.fn(),
  bpId: BP_ID,
  contactsApiBase: '/sws/neo/contacts',
  invoiceId: INVOICE_ID,
  invoiceSpec: INVOICE_SPEC,
  neoApiBase: '/sws/neo',
};

function okJson(body) {
  return { ok: true, status: 200, json: async () => body };
}

/** The reads the modal performs on mount, none of which are journalled. */
function readResponse(url) {
  if (url.includes('/businessPartner/selectors')) {
    return okJson({ items: [{ id: 'key1', label: 'NIF' }] });
  }
  if (url.includes('/locationAddress')) {
    return okJson({ response: { data: [{ id: 'loc1', address: '1 St', city: 'Madrid' }] } });
  }
  if (url.includes(`/${INVOICE_SPEC}/header/`)) {
    // `aeatsiiDescripcionSii` must be non-empty: the save handler refuses to write at all
    // (and jumps to the invoice tab) when the SII description is blank.
    return okJson({ response: { data: [{ id: INVOICE_ID, aeatsiiClaveTipo: '01', aeatsiiDescripcionSii: 'Operación interior' }] } });
  }
  if (url.includes('/businessPartner/')) {
    return okJson({ response: { data: [{ id: BP_ID, name: 'Test BP', taxID: 'B1', oBTIKTaxIDKey: 'key1' }] } });
  }
  return okJson({});
}

function labelFor(url) {
  return url.includes(`/${INVOICE_SPEC}/header/`) ? INVOICE_LABEL : BP_LABEL;
}

/**
 * Journals the two PUTs and leaves every read untouched.
 *
 * The delay is on the business partner write — the FIRST of the two — because that is what
 * forces a pre-launched (promise-built) `saves` array to stamp the invoice write's start
 * tick while the BP write is still open.
 */
function installJournalledApiFetch({ bpDelayMs = 30, invoiceDelayMs = 0, failing = null } = {}) {
  const journal = createRequestJournal();
  apiFetchMock.mockImplementation((url, options) => {
    if (options?.method !== 'PUT') return Promise.resolve(readResponse(url));
    const label = labelFor(url);
    return journal.track(label, {
      delayMs: label === BP_LABEL ? bpDelayMs : invoiceDelayMs,
      result: () => (failing === label ? { ok: false, status: 500 } : okJson({})),
    });
  });
  return journal;
}

async function renderLoadedModal(props = {}) {
  const merged = { ...baseProps, onClose: vi.fn(), ...props };
  const utils = render(<ContactDetailModal {...merged} />);
  await waitFor(() => expect(screen.getByText('save')).toBeInTheDocument());
  return { ...utils, props: merged };
}

/** Saves and waits until both writes have SETTLED, not merely been issued. */
async function clickSave(journal, expected = 2) {
  fireEvent.click(screen.getByText('save'));
  await waitFor(() => expect(journal.allSettled(expected)).toBe(true));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ContactDetailModal — save serialization (ETP-5112)', () => {
  it('never has the invoice PUT in flight while the business partner PUT is open', async () => {
    const journal = installJournalledApiFetch();
    await renderLoadedModal();

    await clickSave(journal);

    expect(journal.labels()).toEqual([BP_LABEL, INVOICE_LABEL]);
    // A `saves` array built from already-launched promises yields -2 here: the invoice
    // write stamps its start tick at 2 while the BP write only settles at 4.
    expect(journal.minOverlapGap()).toBeGreaterThan(0);
  });

  it('never overlaps when both writes are equally slow', async () => {
    const journal = installJournalledApiFetch({ bpDelayMs: 20, invoiceDelayMs: 20 });
    await renderLoadedModal();

    await clickSave(journal);

    expect(journal.entries).toHaveLength(2);
    expect(journal.minOverlapGap()).toBeGreaterThan(0);
  });

  // A pre-launched list would fire the invoice write even for the branch that must not
  // build one at all, so this pins the other half of the thunk contract.
  it('issues only the business partner PUT when there is no invoice in context', async () => {
    const journal = installJournalledApiFetch();
    await renderLoadedModal({ invoiceId: null, invoiceSpec: null });

    fireEvent.click(screen.getByText('save'));
    await waitFor(() => expect(journal.allSettled(1)).toBe(true));

    expect(journal.labels()).toEqual([BP_LABEL]);
  });

  it('reports success and closes only when both writes succeeded', async () => {
    const journal = installJournalledApiFetch();
    const { props } = await renderLoadedModal();

    await clickSave(journal);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('contactDetail.saved'));

    expect(props.onClose).toHaveBeenCalled();
  });

  // Semantics the serialization must preserve: the loop never breaks, so a failing first
  // write must not skip the second one, and the modal must stay open on the error.
  it('still issues the invoice PUT after the business partner PUT failed', async () => {
    const journal = installJournalledApiFetch({ failing: BP_LABEL });
    const { props } = await renderLoadedModal();

    await clickSave(journal);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('contactDetail.saveError'));

    expect(journal.labels()).toEqual([BP_LABEL, INVOICE_LABEL]);
    expect(journal.minOverlapGap()).toBeGreaterThan(0);
    expect(toast.success).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });
});
