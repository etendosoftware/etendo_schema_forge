// ETP-5112 regression — `VfSolveErrorModal.handleResolve` must write one selected row at a
// time, never with `Promise.allSettled(rows.map(...))`.
//
// Core parses a write's `updated` optimistic-locking token through a `private final static
// SimpleDateFormat` (`JsonToDataConverter` line 129), which is not thread-safe: two
// concurrent writes corrupt each other's parse and one is refused as a conflict against a
// record nobody touched. This modal fans out one write PER SELECTED INVOICE, so an
// operator resolving a multi-row selection had more room to hit it, not less.
//
// Note this path only became reachable WITH ETP-5112: before it these PUTs carried no
// `updated` at all, and core skips the parse entirely when the key is absent. Making every
// read arm the write that follows is what brought this modal into the race.
//
// The assertion is NON-OVERLAP, not arrival order — `allSettled` maps in order too. See
// `@/test/requestJournal.js`.
//
// `allSettled`'s per-row semantics are asserted alongside: one failing invoice must not
// skip the invoices after it, and a partial failure must still surface as an error toast
// rather than a success + close.

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createRequestJournal } from '@/test/requestJournal.js';

const apiFetchMock = vi.fn();

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => apiFetchMock }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('lucide-react', () => ({
  X: () => <span data-testid="icon-x" />,
  Loader2: () => <span data-testid="icon-loader" />,
  AlertTriangle: () => <span data-testid="icon-alert" />,
  ChevronDown: () => <span data-testid="icon-chevron-down" />,
  ChevronUp: () => <span data-testid="icon-chevron-up" />,
}));
vi.mock('../FmPrimitives.jsx', () => ({
  StatusPill: ({ estado }) => <span data-testid="status-pill">{estado}</span>,
}));

import VfSolveErrorModal from '../VfSolveErrorModal.jsx';
import { toast } from 'sonner';

// 'AE' = partially accepted → the PUT branch (`isSubsanation: true`), which is the write
// shape the serialization protects. 'IN' would take the POST /action/Correct_Invoice
// branch instead.
const STATUS_PARTIAL = 'AE';
const ROW_IDS = ['vf-1', 'vf-2', 'vf-3'];

const rows = ROW_IDS.map(id => ({
  id,
  verifactuSendingStatus: STATUS_PARTIAL,
  'invoice$documentNo': `DOC-${id}`,
}));

function okResponse() {
  return { ok: true, status: 200, json: async () => ({ response: { data: [] } }) };
}

function idFromUrl(url) {
  return ROW_IDS.find(id => url.includes(`/${id}`)) ?? url;
}

/**
 * Journalling `apiFetch`. `delayedId` is held open long enough that a concurrent
 * implementation starts the next PUT inside its window.
 */
function installJournalledApiFetch({ delayedId = ROW_IDS[0], failingIds = [] } = {}) {
  const journal = createRequestJournal();
  apiFetchMock.mockImplementation((url) => {
    const id = idFromUrl(url);
    return journal.track(id, {
      delayMs: id === delayedId ? 30 : 0,
      result: () => okResponse(),
      fail: failingIds.includes(id) ? new Error(`network failure on ${id}`) : undefined,
    });
  });
  return journal;
}

function renderModal(props = {}) {
  const defaults = {
    open: true,
    onClose: vi.fn(),
    rows,
    neoApiBase: '/sws/neo',
    onResolved: vi.fn(),
  };
  const merged = { ...defaults, ...props };
  return { ...render(<VfSolveErrorModal {...merged} />), props: merged };
}

/**
 * Clicks the modal's resolve button and waits until every tracked write has SETTLED — not
 * merely been issued. Under a concurrent implementation the last request settles first, so
 * asserting on call count alone would read a still-open first request as a clean gap.
 */
async function clickResolve(journal, expectedCalls = ROW_IDS.length) {
  fireEvent.click(screen.getByText('vfSolveError.partial.action'));
  await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(expectedCalls));
  if (journal) await waitFor(() => expect(journal.allSettled(expectedCalls)).toBe(true));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('VfSolveErrorModal — resolve serialization (ETP-5112)', () => {
  it('never has two invoice writes in flight at the same time', async () => {
    const journal = installJournalledApiFetch();
    renderModal();

    await clickResolve(journal);

    expect(journal.labels()).toEqual(ROW_IDS);
    // `Promise.allSettled(rows.map(...))` yields -3 here: rows 2 and 3 stamp their start
    // ticks while row 1 is still open.
    expect(journal.minOverlapGap()).toBeGreaterThan(0);
  });

  it('never overlaps when every invoice is equally slow', async () => {
    const journal = createRequestJournal();
    apiFetchMock.mockImplementation((url) => journal.track(idFromUrl(url), {
      delayMs: 15,
      result: () => okResponse(),
    }));
    renderModal();

    await clickResolve(journal);

    expect(journal.entries).toHaveLength(ROW_IDS.length);
    expect(journal.minOverlapGap()).toBeGreaterThan(0);
  });

  it('sends one PUT per selected invoice, carrying the subsanation flag', async () => {
    const journal = installJournalledApiFetch();
    renderModal();

    await clickResolve(journal);

    const calls = apiFetchMock.mock.calls;
    expect(calls).toHaveLength(ROW_IDS.length);
    calls.forEach(([url, options], i) => {
      expect(url).toContain(`/${ROW_IDS[i]}`);
      expect(options.method).toBe('PUT');
      expect(JSON.parse(options.body)).toEqual({ isSubsanation: true });
    });
  });

  it('reports success and closes only when every invoice succeeded', async () => {
    const journal = installJournalledApiFetch();
    const { props } = renderModal();

    await clickResolve(journal);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('vfSolveError.success'));

    expect(props.onResolved).toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });

  // Semantics the serialization must preserve — the previous `allSettled` settled each row
  // on its own, and a `break` on the first failure would silently drop the rest.
  it('still writes the invoices after one that threw', async () => {
    const journal = installJournalledApiFetch({ failingIds: [ROW_IDS[0]] });
    renderModal();

    await clickResolve(journal);

    expect(journal.labels()).toEqual(ROW_IDS);
    expect(journal.minOverlapGap()).toBeGreaterThan(0);
  });

  it('still writes the invoices after one that failed mid fan-out', async () => {
    const journal = installJournalledApiFetch({ failingIds: [ROW_IDS[1]] });
    renderModal();

    await clickResolve(journal);

    expect(journal.labels()).toContain(ROW_IDS[2]);
  });

  it('surfaces a partial failure as an error, without resolving or closing', async () => {
    const journal = installJournalledApiFetch({ failingIds: [ROW_IDS[1]] });
    const { props } = renderModal();

    await clickResolve(journal);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('vfSolveError.saveError'));

    expect(toast.success).not.toHaveBeenCalled();
    expect(props.onResolved).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('treats a non-ok response like a failure, not a success', async () => {
    apiFetchMock.mockImplementation(async (url) => (
      url.includes(ROW_IDS[2]) ? { ok: false, status: 500 } : okResponse()
    ));
    renderModal();

    await clickResolve(null);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('vfSolveError.saveError'));
  });
});
