// @vitest-environment jsdom
//
// ETP-5381 — a rectificative invoice is now created AND confirmed in one step, and the
// completion is rejected outright (ETSG_CHECK_RECTIF_INV_DOC) unless it declares which
// invoice it rectifies. This picker is what makes the user choose up front, so its two
// gates carry real weight: `isSatisfied` is the only thing standing between the user and
// a request the server will refuse, and `isEmpty` must never fire while the round-trip is
// still in flight — that would disable the confirm button and blame an empty list for a
// pending fetch.
import { render, screen, fireEvent, waitFor, within, renderHook, act } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

import {
  useRectifiableInvoices,
  RectifiableInvoiceField,
  RectifiableInvoicePickerModal,
  RECTIFIABLE_PAGE_SIZE,
} from '../RectifiableInvoicePicker.jsx';

const URL = '/sws/neo/return-material-receipt/header/REC-001/action/rectifiableInvoices';

const INVOICES = [
  { id: 'inv-1', documentNo: 'FAC-001', invoiceDate: '2026-08-10', grandTotalAmount: 1234.5, currency: 'EUR' },
  { id: 'inv-2', documentNo: 'FAC-002', invoiceDate: '2026-08-11', grandTotalAmount: 99.9, currency: 'EUR' },
  { id: 'inv-3', documentNo: 'FAC-003' },
];

/**
 * Routes the picker's own action POST and lets every other call (e.g. the fire-and-forget
 * currency-format config) resolve to a harmless empty payload, so the assertions below can
 * never be satisfied by the wrong request.
 */
function mockFetch({ invoices = INVOICES, suggestedInvoiceIds, ok = true, status = 200, reject = false, deferred = false } = {}) {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const stub = vi.fn((url) => {
    if (!String(url).includes('rectifiableInvoices')) {
      return Promise.resolve({ ok: true, json: async () => ({ response: { data: [] } }) });
    }
    if (reject) return Promise.reject(new Error('Network down'));
    const answer = {
      ok,
      status,
      json: async () => ({ response: { data: { invoices, suggestedInvoiceIds } } }),
    };
    return deferred ? gate.then(() => answer) : Promise.resolve(answer);
  });
  vi.stubGlobal('fetch', stub);
  return { stub, release: () => release() };
}

const okAnswer = (data) => ({ ok: true, json: async () => ({ response: { data } }) });
const HARMLESS = { ok: true, json: async () => ({ response: { data: [] } }) };

/**
 * The paging-aware sibling of {@link mockFetch}: `respond` is handed the parsed request body of
 * every action POST, so a test can answer batch 2 differently from batch 1 — or hold one of them
 * open to reproduce an out-of-order landing.
 *
 * @returns the stub plus a live array of `{ body }`, one entry per action POST in call order.
 */
function mockPagedFetch(respond) {
  const calls = [];
  const stub = vi.fn((url, init) => {
    if (!String(url).includes('rectifiableInvoices')) return Promise.resolve(HARMLESS);
    const call = { body: JSON.parse(init.body), index: calls.length };
    calls.push(call);
    return respond(call);
  });
  vi.stubGlobal('fetch', stub);
  return { stub, calls };
}

/** A promise a test resolves by hand, to control when a batch lands. */
function gate() {
  let open;
  const promise = new Promise((resolve) => { open = resolve; });
  return { promise, open: (value) => open(value) };
}

/**
 * The failing twin of {@link gate}: a request a test makes fail by hand, so a slow batch can be
 * made to break AFTER a newer one has already succeeded.
 */
function failingGate() {
  let fail;
  const promise = new Promise((_resolve, reject) => { fail = reject; });
  return { promise, fail: (error = new Error('Network down')) => fail(error) };
}

const pageOf = (prefix, n) => Array.from(
  { length: n },
  (_, i) => ({ id: `${prefix}-${i}`, documentNo: `FAC-${prefix}-${i}` }),
);

const idsOf = (rows) => rows.map(r => r.id);

// jsdom has no layout, so the scroll geometry has to be installed on the node by hand.
// defineProperty rather than fireEvent's `target` option: clientHeight/scrollHeight are
// getter-only on Element.prototype, and assigning to them throws inside an ES module.
const scrollToBottom = (node) => {
  Object.defineProperty(node, 'scrollTop', { value: 640, configurable: true });
  Object.defineProperty(node, 'clientHeight', { value: 400, configurable: true });
  Object.defineProperty(node, 'scrollHeight', { value: 1050, configurable: true });
  fireEvent.scroll(node);
};

describe('useRectifiableInvoices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('disabled / no URL', () => {
    it('fetches nothing and reports a neutral state when enabled is false', async () => {
      const { stub } = mockFetch();
      const { result } = renderHook(() => useRectifiableInvoices({ enabled: false, url: URL, token: 't' }));
      await new Promise(r => setTimeout(r, 0));
      expect(stub.mock.calls.filter(([u]) => String(u).includes('rectifiableInvoices'))).toHaveLength(0);
      expect(result.current.invoices).toEqual([]);
      expect(result.current.loading).toBe(false);
      expect(result.current.isEmpty).toBe(false);
      // Nothing to satisfy when the picker is off — the caller's confirm button must stay usable.
      expect(result.current.isSatisfied).toBe(true);
    });

    it('fetches nothing when enabled is true but no url was supplied', async () => {
      const { stub } = mockFetch();
      const { result } = renderHook(() => useRectifiableInvoices({ enabled: true, url: undefined, token: 't' }));
      await new Promise(r => setTimeout(r, 0));
      expect(stub.mock.calls.filter(([u]) => String(u).includes('rectifiableInvoices'))).toHaveLength(0);
      expect(result.current.isEmpty).toBe(false);
    });
  });

  describe('loading the candidates', () => {
    it('POSTs to the supplied action URL verbatim (baseUrl is not prepended)', async () => {
      const { stub } = mockFetch();
      renderHook(() => useRectifiableInvoices({ enabled: true, url: URL, token: 't' }));
      await waitFor(() => {
        const call = stub.mock.calls.find(([u]) => String(u).includes('rectifiableInvoices'));
        expect(call).toBeTruthy();
        expect(String(call[0])).toBe(URL);
        expect(call[1].method).toBe('POST');
      });
    });

    it('stores the returned invoice list', async () => {
      mockFetch();
      const { result } = renderHook(() => useRectifiableInvoices({ enabled: true, url: URL, token: 't' }));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.invoices).toHaveLength(3);
      expect(result.current.invoices[0].documentNo).toBe('FAC-001');
    });

    it('treats a non-array invoices field as an empty list instead of crashing', async () => {
      mockFetch({ invoices: null });
      const { result } = renderHook(() => useRectifiableInvoices({ enabled: true, url: URL, token: 't' }));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.invoices).toEqual([]);
      expect(result.current.isEmpty).toBe(true);
    });
  });

  // ONE detected invoice is an answer; SEVERAL are a question.
  //
  // The chain (return line → original line → its invoice) can legitimately land on more than one
  // invoice — an order billed across two invoices, one shipment, a single return against it — and
  // nothing in that chain knows WHICH of them the user means to rectify. Preselecting all of them
  // therefore did not save the user a click, it made a choice on their behalf and submitted it
  // silently. So the rule is a count, not a presence: exactly one valid detection preselects,
  // two or more leave the field empty with the confirm button disabled via `isSatisfied`, and the
  // picker keeps badging those rows so the user can see what the chain found and pick.
  //
  // Every test here passes a REALISTIC number of ids. Before this block the suite only ever sent a
  // single id, so "preselect all detections" and "preselect only an unambiguous detection" were
  // indistinguishable to it — the whole rule sat uncovered, and flipping it changed nothing.
  describe('preselection of suggestedInvoiceIds', () => {
    const mount = () => renderHook(() => useRectifiableInvoices({ enabled: true, url: URL, token: 't' }));

    it('preselects the backend suggestion when it is part of the list', async () => {
      mockFetch({ suggestedInvoiceIds: ['inv-2'] });
      const { result } = mount();
      await waitFor(() => expect(result.current.selectedIds).toEqual(['inv-2']));
      // Preselected means the caller can confirm straight away and reproduce exactly the
      // link the server would have made on its own.
      expect(result.current.isSatisfied).toBe(true);
    });

    it('does NOT preselect a suggestion that is absent from the list', async () => {
      mockFetch({ suggestedInvoiceIds: ['inv-does-not-exist'] });
      const { result } = mount();
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.selectedIds).toEqual([]);
      expect(result.current.isSatisfied).toBe(false);
    });

    it('selects nothing when the backend sends no suggestion', async () => {
      mockFetch({ suggestedInvoiceIds: undefined });
      const { result } = mount();
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.selectedIds).toEqual([]);
    });

    it('preselects NOTHING when the chain detects two invoices — the user has to choose', async () => {
      // The reported case: one order, two invoices, one shipment, one return. Both invoices are
      // genuinely part of the chain, so both get badged — but picking either one FOR the user is a
      // guess wearing the costume of a default, and the user would have had to notice and untick
      // the wrong one to avoid rectifying an invoice they never meant to touch.
      mockFetch({ suggestedInvoiceIds: ['inv-1', 'inv-2'] });
      const { result } = mount();
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.selectedIds).toEqual([]);
      // And the confirm button stays disabled until they do choose: an empty selection is exactly
      // what ETSG_CHECK_RECTIF_INV_DOC refuses, so the gate has to hold here.
      expect(result.current.isSatisfied).toBe(false);
      // Ambiguity suppresses the PRESELECTION, never the rows: both candidates are still on offer,
      // still flagged, so the picker can show the user what the chain found.
      expect(idsOf(result.current.invoices)).toEqual(['inv-1', 'inv-2', 'inv-3']);
    });

    it('preselects NOTHING when the chain detects three invoices either', async () => {
      // Two is not a special case — the rule is "exactly one", so every count above it behaves the
      // same. A future "well, just take the first one" shortcut has to fail here too.
      mockFetch({ suggestedInvoiceIds: ['inv-1', 'inv-2', 'inv-3'] });
      const { result } = mount();
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.selectedIds).toEqual([]);
      expect(result.current.isSatisfied).toBe(false);
    });

    it('counts the VALID detections, not the reported ones: two reported, one delivered, preselected', async () => {
      // `valid.length === 1` and `suggested.length === 1` are not the same test, and the difference
      // is invisible until a detected row falls outside the batch the server delivered. Two ids
      // come back, only one of them names a row the user can actually see — that is an unambiguous
      // choice as far as this screen is concerned, so it preselects.
      mockFetch({ suggestedInvoiceIds: ['inv-2', 'inv-not-in-this-batch'] });
      const { result } = mount();
      await waitFor(() => expect(result.current.selectedIds).toEqual(['inv-2']));
      expect(result.current.isSatisfied).toBe(true);
    });

    it('counts the VALID detections the other way too: two reported, none delivered, nothing selected', async () => {
      // The complement of the case above, and the reason the filter exists at all: preselecting an
      // id whose row never arrived would submit a rectification the user can neither see nor untick.
      mockFetch({ suggestedInvoiceIds: ['ghost-1', 'ghost-2'] });
      const { result } = mount();
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.selectedIds).toEqual([]);
      expect(result.current.isSatisfied).toBe(false);
    });

    it('never overwrites a selection the user already made, when a refetch detects two', async () => {
      // A search re-runs the FIRST batch, so the preselection branch runs again on a list the user
      // has already acted on. Whatever the chain reports the second time, the user's own choice is
      // the newer information and must survive it.
      const { calls } = mockPagedFetch(() => Promise.resolve(
        okAnswer({ invoices: INVOICES, suggestedInvoiceIds: ['inv-1', 'inv-2'], hasMore: false }),
      ));
      const { result } = mount();
      await waitFor(() => expect(result.current.invoices).toHaveLength(3));
      expect(result.current.selectedIds).toEqual([]);

      act(() => result.current.toggle('inv-3'));
      act(() => result.current.setSearch('FAC'));
      await waitFor(() => expect(calls).toHaveLength(2));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.selectedIds).toEqual(['inv-3']);
      expect(result.current.isSatisfied).toBe(true);
    });

    it('never overwrites a selection the user already made, when a refetch detects exactly one', async () => {
      // Where `prev.length > 0` is the ONLY thing holding: the count check passes, so without the
      // guard this refetch would quietly swap the user's invoice for the chain's again — after they
      // had explicitly moved off it.
      const { calls } = mockPagedFetch(() => Promise.resolve(
        okAnswer({ invoices: INVOICES, suggestedInvoiceIds: ['inv-2'], hasMore: false }),
      ));
      const { result } = mount();
      await waitFor(() => expect(result.current.selectedIds).toEqual(['inv-2']));

      act(() => result.current.toggle('inv-2'));
      act(() => result.current.toggle('inv-3'));
      act(() => result.current.setSearch('FAC'));
      await waitFor(() => expect(calls).toHaveLength(2));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.selectedIds).toEqual(['inv-3']);
    });

    it('never preselects from an APPENDED batch, not even an unambiguous one', async () => {
      // The `!append` half of the guard. Page 2 repeats the same detected ids, and by then the user
      // may have deliberately cleared the selection — resurrecting it on scroll would undo a
      // decision with no visible cause.
      // Batch 2 carries the detected row itself, so the id IS valid against the rows it delivered:
      // `!append` is then the only thing left standing between the user and a resurrected choice.
      mockPagedFetch(({ body }) => Promise.resolve(body.startRow === 0
        ? okAnswer({ invoices: INVOICES, suggestedInvoiceIds: ['inv-2'], hasMore: true })
        : okAnswer({ invoices: [...pageOf('b', 2), INVOICES[1]], suggestedInvoiceIds: ['inv-2'], hasMore: false })));
      const { result } = mount();
      await waitFor(() => expect(result.current.selectedIds).toEqual(['inv-2']));

      act(() => result.current.toggle('inv-2'));
      expect(result.current.selectedIds).toEqual([]);

      act(() => result.current.loadMore());
      await waitFor(() => expect(result.current.invoices).toHaveLength(6));
      expect(result.current.selectedIds).toEqual([]);
      expect(result.current.isSatisfied).toBe(false);
    });
  });

  describe('isSatisfied — the confirm gate', () => {
    it('is false while the picker is enabled and nothing is selected', async () => {
      mockFetch({ suggestedInvoiceIds: undefined });
      const { result } = renderHook(() => useRectifiableInvoices({ enabled: true, url: URL, token: 't' }));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.isSatisfied).toBe(false);
    });

    it('flips to true as soon as an invoice is selected', async () => {
      mockFetch({ suggestedInvoiceIds: undefined });
      const { result } = renderHook(() => useRectifiableInvoices({ enabled: true, url: URL, token: 't' }));
      await waitFor(() => expect(result.current.loading).toBe(false));
      act(() => result.current.toggle('inv-1'));
      expect(result.current.isSatisfied).toBe(true);
    });

    it('falls back to false when the last selection is removed', async () => {
      mockFetch({ suggestedInvoiceIds: ['inv-1'] });
      const { result } = renderHook(() => useRectifiableInvoices({ enabled: true, url: URL, token: 't' }));
      await waitFor(() => expect(result.current.isSatisfied).toBe(true));
      act(() => result.current.toggle('inv-1'));
      expect(result.current.selectedIds).toEqual([]);
      expect(result.current.isSatisfied).toBe(false);
    });
  });

  describe('isEmpty — only after the answer is in', () => {
    it('is false while the request is still in flight, even though the list is empty', async () => {
      const { release } = mockFetch({ invoices: [], deferred: true });
      const { result } = renderHook(() => useRectifiableInvoices({ enabled: true, url: URL, token: 't' }));
      await waitFor(() => expect(result.current.loading).toBe(true));
      // The whole point of the `loaded` flag: a pending round-trip must not be reported
      // as "nothing to rectify", which would disable the caller's confirm button.
      //
      // Note this assertion now holds for TWO independent reasons — `loaded` is still false (this
      // is the first request) and `loading` is true — so it no longer isolates either guard on its
      // own. The `!loading` half is pinned where it is the only thing left: mid-RETRY, in "clears
      // the error as soon as a new attempt starts", where `loaded` is already true from the failed
      // attempt. Read the two together; deleting either guard should still turn one of them red.
      expect(result.current.isEmpty).toBe(false);
      release();
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.isEmpty).toBe(true);
    });

    it('is false once a non-empty list has loaded', async () => {
      mockFetch();
      const { result } = renderHook(() => useRectifiableInvoices({ enabled: true, url: URL, token: 't' }));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.isEmpty).toBe(false);
    });

    it('is true after a confirmed empty answer', async () => {
      mockFetch({ invoices: [] });
      const { result } = renderHook(() => useRectifiableInvoices({ enabled: true, url: URL, token: 't' }));
      await waitFor(() => expect(result.current.isEmpty).toBe(true));
      expect(result.current.isSatisfied).toBe(false);
    });
  });

  describe('toggle — multiple selection', () => {
    it('accumulates selections in click order', async () => {
      mockFetch({ suggestedInvoiceIds: undefined });
      const { result } = renderHook(() => useRectifiableInvoices({ enabled: true, url: URL, token: 't' }));
      await waitFor(() => expect(result.current.loading).toBe(false));
      act(() => result.current.toggle('inv-1'));
      act(() => result.current.toggle('inv-3'));
      // C_Invoice_Reverse is a 1:N bridge: one return can legitimately correct several invoices.
      expect(result.current.selectedIds).toEqual(['inv-1', 'inv-3']);
      expect(result.current.isSatisfied).toBe(true);
    });

    it('removes only the toggled id and keeps the rest selected', async () => {
      mockFetch({ suggestedInvoiceIds: undefined });
      const { result } = renderHook(() => useRectifiableInvoices({ enabled: true, url: URL, token: 't' }));
      await waitFor(() => expect(result.current.loading).toBe(false));
      act(() => result.current.toggle('inv-1'));
      act(() => result.current.toggle('inv-2'));
      act(() => result.current.toggle('inv-1'));
      expect(result.current.selectedIds).toEqual(['inv-2']);
      expect(result.current.isSatisfied).toBe(true);
    });
  });

  // ETP-5381 — a failure must never be able to render as a fact about the user's DATA. The
  // OFFSET-binding bug made this action answer 400; the hook read that as "no rows", `isEmpty`
  // went true, and the modal stated there were no confirmed invoices to rectify while twenty sat
  // in the table. The reader believed the message — it is a confident claim, not a hedge — and a
  // perfectly good business-partner filter was nearly deleted because of it.
  //
  // So the two answers are now told apart and every test below pins the distinction:
  //   loadError → "we asked and never got an answer"
  //   isEmpty   → "we asked and the answer was none"
  // A failure still fails CLOSED (no rows, no paging, confirm blocked); it just no longer lies
  // about why.
  describe('failure modes fail closed — and say which failure it was', () => {
    const mount = () => renderHook(() => useRectifiableInvoices({ enabled: true, url: URL, token: 't' }));

    it('treats an HTTP error status as a failure, NOT as an empty list', async () => {
      // THE branch that produced the bug. `fetch` only rejects on a transport failure, so a 400
      // resolves normally with ok=false and never reaches a catch on its own: without the
      // explicit `!res.ok` throw the hook read `data?.invoices` off an error payload, got
      // undefined, and a server-side exception became indistinguishable from zero rows.
      mockFetch({ ok: false, status: 400 });
      const { result } = mount();
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.loadError).toBe(true);
      // The assertion that matters: the picker must not be able to say "this document has
      // nothing to rectify" on the strength of a 400.
      expect(result.current.isEmpty).toBe(false);
      expect(result.current.invoices).toEqual([]);
      expect(result.current.hasMore).toBe(false);
      // Still closed: confirm stays blocked rather than letting the user submit a request the
      // server would reject anyway (ETSG_CHECK_RECTIF_INV_DOC).
      expect(result.current.isSatisfied).toBe(false);
    });

    it('treats a 500 the same way — any non-ok status is an unanswered question', async () => {
      mockFetch({ ok: false, status: 500 });
      const { result } = mount();
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.loadError).toBe(true);
      expect(result.current.isEmpty).toBe(false);
    });

    it('records a rejected fetch as a failure instead of an empty list', async () => {
      // Formerly "swallows a rejected fetch and stops loading", which asserted isEmpty === true:
      // that assertion pinned the exact conflation described above. The intent is unchanged — a
      // failed load fails closed — only its honest expression.
      mockFetch({ reject: true });
      const { result } = mount();
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.loadError).toBe(true);
      expect(result.current.isEmpty).toBe(false);
      expect(result.current.invoices).toEqual([]);
      // Paging stops rather than retrying into a loop, exactly as useEntity does.
      expect(result.current.hasMore).toBe(false);
      expect(result.current.loadingMore).toBe(false);
      expect(result.current.isSatisfied).toBe(false);
    });

    it('preselects nothing and remembers no rows from a failed load', async () => {
      mockFetch({ reject: true, suggestedInvoiceIds: ['inv-2'] });
      const { result } = mount();
      await waitFor(() => expect(result.current.loadError).toBe(true));
      // Nothing was read, so nothing may be submitted: a chip here would offer to rectify an
      // invoice the hook never actually saw.
      expect(result.current.selectedIds).toEqual([]);
      expect(result.current.selectedInvoices).toEqual([]);
    });

    it('clears the error as soon as a new attempt starts, not only once it succeeds', async () => {
      const second = gate();
      mockPagedFetch(({ index }) => (index === 0
        ? Promise.reject(new Error('Network down'))
        : second.promise));
      const { result } = mount();
      await waitFor(() => expect(result.current.loadError).toBe(true));

      // Braces, not a concise arrow: `retry` RETURNS the fetch promise (unlike `loadMore`, which
      // drops it), and handing a thenable to a synchronous act() makes React treat the call as
      // async and leaves overlapping act scopes behind — every later render in the file then
      // comes back null.
      act(() => { result.current.retry(); });
      await waitFor(() => expect(result.current.loading).toBe(true));
      // Leaving the error up under the spinner would tell the user the retry had already failed
      // again, before the server has said anything.
      expect(result.current.loadError).toBe(false);
      // The invariant, asserted at the one instant that used to break it: while a request is in
      // flight the hook makes NO claim about the data. Clearing `loadError` hands the question
      // back to `isEmpty`, and `loaded` is still true from the failed attempt with the rows still
      // none — so `isEmpty` is only false here because it subtracts `loading` itself. It does not
      // depend on the field checking `loading` first: whatever a consumer renders, and in
      // whatever order, there is nothing here for it to render the false sentence from.
      expect(result.current.loading).toBe(true);
      expect(result.current.isEmpty).toBe(false);

      await act(async () => {
        second.open(okAnswer({ invoices: INVOICES, hasMore: false }));
        await Promise.resolve();
      });
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.loadError).toBe(false);
    });

    it('recovers the rows on a successful retry, from the first batch', async () => {
      const { calls } = mockPagedFetch(({ index }) => (index === 0
        ? Promise.reject(new Error('Network down'))
        : Promise.resolve(okAnswer({ invoices: INVOICES, suggestedInvoiceIds: ['inv-2'], hasMore: false }))));
      const { result } = mount();
      await waitFor(() => expect(result.current.loadError).toBe(true));

      await act(async () => { result.current.retry(); });
      await waitFor(() => expect(result.current.invoices).toHaveLength(3));

      expect(result.current.loadError).toBe(false);
      expect(result.current.isEmpty).toBe(false);
      // A retry re-asks for the FIRST window, not the one a half-finished run left behind.
      expect(calls[1].body).toEqual({ startRow: 0, pageSize: RECTIFIABLE_PAGE_SIZE, search: '' });
      // And the flow resumes in full: the chain detection the failed attempt never delivered.
      expect(result.current.selectedIds).toEqual(['inv-2']);
      expect(result.current.isSatisfied).toBe(true);
    });

    it('re-arms the error when the retry fails too', async () => {
      const { calls } = mockPagedFetch(() => Promise.reject(new Error('Network down')));
      const { result } = mount();
      await waitFor(() => expect(result.current.loadError).toBe(true));

      await act(async () => { result.current.retry(); });
      await waitFor(() => expect(calls).toHaveLength(2));
      await waitFor(() => expect(result.current.loadError).toBe(true));
      expect(result.current.isEmpty).toBe(false);
      expect(result.current.loading).toBe(false);
    });

    it('carries an empty answer as empty — the flag is for failures only', async () => {
      // The counterweight to everything above: a genuine "there is nothing to rectify" must
      // still be reported as such, or the fix would have swapped one wrong message for another.
      mockFetch({ invoices: [] });
      const { result } = mount();
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.loadError).toBe(false);
      expect(result.current.isEmpty).toBe(true);
    });

    it('does not let a STALE failure overwrite a newer successful load', async () => {
      const slow = failingGate();
      const { calls } = mockPagedFetch(({ body }) => (body.search === ''
        ? slow.promise
        : Promise.resolve(okAnswer({ invoices: pageOf('fresh', 2), hasMore: false }))));
      const { result } = mount();
      await waitFor(() => expect(calls).toHaveLength(1));

      act(() => result.current.setSearch('FAC-fresh'));
      await waitFor(() => expect(idsOf(result.current.invoices)).toEqual(['fresh-0', 'fresh-1']));
      expect(result.current.loadError).toBe(false);

      // The abandoned first request finally breaks. It belongs to a query the user has moved on
      // from, so it must not paint an error over rows that are on screen and perfectly good —
      // the same seq guard that protects the rows protects the flag.
      await act(async () => {
        slow.fail();
        await Promise.resolve();
      });
      await new Promise(r => setTimeout(r, 0));

      expect(result.current.loadError).toBe(false);
      expect(idsOf(result.current.invoices)).toEqual(['fresh-0', 'fresh-1']);
      expect(result.current.isEmpty).toBe(false);
    });

    it('does not let a STALE failure close paging on a live list that has more rows', async () => {
      // The counterpart of the test above, and the one that actually covers the guard: that one
      // answers the fresh query with `hasMore: false`, so the catch clearing `hasMore` was
      // indistinguishable from the correct value and it could not have caught anything. Here the
      // fresh list genuinely HAS more rows, which is the only arrangement in which an unguarded
      // `setHasMore(false)` is visible — move it back outside `seq === reqRef.current` and this
      // test, alone, goes red.
      const slow = failingGate();
      const { calls } = mockPagedFetch(({ body }) => (body.search === ''
        ? slow.promise
        : Promise.resolve(okAnswer({ invoices: pageOf('fresh', 2), hasMore: true }))));
      const { result } = mount();
      await waitFor(() => expect(calls).toHaveLength(1));

      act(() => result.current.setSearch('FAC-fresh'));
      await waitFor(() => expect(result.current.hasMore).toBe(true));
      expect(idsOf(result.current.invoices)).toEqual(['fresh-0', 'fresh-1']);

      await act(async () => {
        slow.fail();
        await Promise.resolve();
      });
      await new Promise(r => setTimeout(r, 0));

      // A dead request must not narrate the state of a live one. Losing `hasMore` here is silent
      // and shaped exactly like a real result: the list simply stops growing on scroll, so the
      // user concludes the invoice they are hunting for does not exist — the same wrong
      // conclusion, reached by a different route, that this whole ticket is about.
      expect(result.current.hasMore).toBe(true);
      expect(result.current.loadError).toBe(false);
      expect(idsOf(result.current.invoices)).toEqual(['fresh-0', 'fresh-1']);

      // And the affordance is not merely flagged — it still works.
      act(() => result.current.loadMore());
      await waitFor(() => expect(calls).toHaveLength(3));
      expect(calls[2].body.startRow).toBe(2);
    });
  });

  // ETP-5381 — the hook stopped fetching "everything" and started paging the server the way the
  // invoice list window does. Everything below guards that window: what goes out in the request,
  // what a second batch does to the rows already on screen, and what happens when the batches
  // come back in the wrong order.
  describe('server-side paging', () => {
    const mount = () => renderHook(() => useRectifiableInvoices({ enabled: true, url: URL, token: 't' }));

    it('sends the paging window in the BODY, not the query string', async () => {
      const { stub, calls } = mockPagedFetch(() => Promise.resolve(okAnswer({ invoices: INVOICES, hasMore: false })));
      const { result } = mount();
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(calls[0].body).toEqual({ startRow: 0, pageSize: RECTIFIABLE_PAGE_SIZE, search: '' });
      expect(RECTIFIABLE_PAGE_SIZE).toBe(80);
      // The action dispatcher does not populate `queryParams`, so a window smuggled into the URL
      // is silently ignored and the server pages from row 0 forever.
      const actionCall = stub.mock.calls.find(([u]) => String(u).includes('rectifiableInvoices'));
      expect(String(actionCall[0])).toBe(URL);
      expect(String(actionCall[0])).not.toContain('?');
    });

    it('reports hasMore straight from the server answer', async () => {
      mockPagedFetch(() => Promise.resolve(okAnswer({ invoices: pageOf('a', 3), hasMore: true })));
      const { result } = mount();
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.hasMore).toBe(true);
      expect(result.current.loadingMore).toBe(false);
    });

    it('APPENDS the next batch to the rows already on screen', async () => {
      const { calls } = mockPagedFetch(({ body }) => Promise.resolve(body.startRow === 0
        ? okAnswer({ invoices: pageOf('a', 3), hasMore: true })
        : okAnswer({ invoices: pageOf('b', 2), hasMore: false })));
      const { result } = mount();
      await waitFor(() => expect(result.current.hasMore).toBe(true));

      act(() => result.current.loadMore());
      await waitFor(() => expect(result.current.invoices).toHaveLength(5));
      // Replacing instead of appending would make the list flicker back to the top and lose every
      // row the user had already scrolled past.
      expect(idsOf(result.current.invoices)).toEqual(['a-0', 'a-1', 'a-2', 'b-0', 'b-1']);
      // The next window starts where the rows actually ended, not at a page multiple.
      expect(calls[1].body.startRow).toBe(3);
      expect(calls[1].body.pageSize).toBe(RECTIFIABLE_PAGE_SIZE);
      expect(result.current.hasMore).toBe(false);
    });

    it('does nothing when loadMore is called with no more rows to fetch', async () => {
      const { calls } = mockPagedFetch(() => Promise.resolve(okAnswer({ invoices: pageOf('a', 3), hasMore: false })));
      const { result } = mount();
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => result.current.loadMore());
      await new Promise(r => setTimeout(r, 0));
      expect(calls).toHaveLength(1);
      expect(result.current.invoices).toHaveLength(3);
    });

    it('ignores a second loadMore while a batch is still in flight', async () => {
      const second = gate();
      const { calls } = mockPagedFetch(({ body }) => (body.startRow === 0
        ? Promise.resolve(okAnswer({ invoices: pageOf('a', 3), hasMore: true }))
        : second.promise));
      const { result } = mount();
      await waitFor(() => expect(result.current.hasMore).toBe(true));

      act(() => result.current.loadMore());
      await waitFor(() => expect(result.current.loadingMore).toBe(true));
      // A scroll container fires many events per gesture: without the guard every one of them
      // would launch another request for the very same window.
      act(() => result.current.loadMore());
      act(() => result.current.loadMore());
      expect(calls).toHaveLength(2);

      await act(async () => {
        second.open(okAnswer({ invoices: pageOf('b', 1), hasMore: false }));
        await Promise.resolve();
      });
      await waitFor(() => expect(result.current.loadingMore).toBe(false));
      expect(idsOf(result.current.invoices)).toEqual(['a-0', 'a-1', 'a-2', 'b-0']);
    });

    it('stops paging when a batch fails instead of retrying it forever', async () => {
      mockPagedFetch(({ body }) => (body.startRow === 0
        ? Promise.resolve(okAnswer({ invoices: pageOf('a', 3), hasMore: true }))
        : Promise.reject(new Error('Network down'))));
      const { result } = mount();
      await waitFor(() => expect(result.current.hasMore).toBe(true));

      act(() => result.current.loadMore());
      await waitFor(() => expect(result.current.hasMore).toBe(false));
      expect(result.current.loadingMore).toBe(false);
      // The rows already fetched stay usable — a failed TAIL must not empty the list, and the
      // user's selection lives among those rows.
      expect(idsOf(result.current.invoices)).toEqual(['a-0', 'a-1', 'a-2']);
      expect(result.current.isEmpty).toBe(false);
      // It was still a failure: the set on screen is now known to be incomplete, so the caller
      // is told rather than left to assume it saw everything.
      expect(result.current.loadError).toBe(true);
    });

    it('keeps a selection made before the failing batch', async () => {
      mockPagedFetch(({ body }) => (body.startRow === 0
        ? Promise.resolve(okAnswer({ invoices: pageOf('a', 3), hasMore: true }))
        : Promise.reject(new Error('Network down'))));
      const { result } = mount();
      await waitFor(() => expect(result.current.hasMore).toBe(true));
      act(() => result.current.toggle('a-1'));

      act(() => result.current.loadMore());
      await waitFor(() => expect(result.current.loadError).toBe(true));
      // Losing the choice because page 4 timed out would make the user redo work the hook
      // already has in hand.
      expect(result.current.selectedIds).toEqual(['a-1']);
      expect(result.current.selectedInvoices[0].documentNo).toBe('FAC-a-1');
      expect(result.current.isSatisfied).toBe(true);
    });

    it('recovers a failed tail by retrying from the first batch', async () => {
      const { calls } = mockPagedFetch(({ body, index }) => {
        if (body.startRow > 0) return Promise.reject(new Error('Network down'));
        return Promise.resolve(okAnswer({ invoices: pageOf('a', 3), hasMore: index === 0 }));
      });
      const { result } = mount();
      await waitFor(() => expect(result.current.hasMore).toBe(true));
      act(() => result.current.loadMore());
      await waitFor(() => expect(result.current.loadError).toBe(true));

      await act(async () => { result.current.retry(); });
      await waitFor(() => expect(result.current.loadError).toBe(false));
      expect(calls[2].body.startRow).toBe(0);
      expect(idsOf(result.current.invoices)).toEqual(['a-0', 'a-1', 'a-2']);
    });

    it('discards a stale batch that lands after a newer one', async () => {
      const first = gate();
      const { calls } = mockPagedFetch(({ body }) => (body.search === ''
        ? first.promise
        : Promise.resolve(okAnswer({ invoices: pageOf('fresh', 1), hasMore: false }))));
      const { result } = mount();
      await waitFor(() => expect(calls).toHaveLength(1));

      act(() => result.current.setSearch('FAC-b'));
      await waitFor(() => expect(calls).toHaveLength(2));
      await waitFor(() => expect(idsOf(result.current.invoices)).toEqual(['fresh-0']));

      // The slow first page finally arrives. It belongs to a query the user has already moved on
      // from, so it must not overwrite the rows — nor re-open paging on them.
      await act(async () => {
        first.open(okAnswer({ invoices: pageOf('stale', 4), hasMore: true }));
        await Promise.resolve();
      });
      await new Promise(r => setTimeout(r, 0));
      expect(idsOf(result.current.invoices)).toEqual(['fresh-0']);
      expect(result.current.hasMore).toBe(false);
    });
  });

  describe('search — server-side, debounced, and replacing', () => {
    const mount = () => renderHook(() => useRectifiableInvoices({ enabled: true, url: URL, token: 't' }));

    it('exposes the typed text immediately and only queries once the typing settles', async () => {
      const { calls } = mockPagedFetch(() => Promise.resolve(okAnswer({ invoices: INVOICES, hasMore: false })));
      const { result } = mount();
      await waitFor(() => expect(calls).toHaveLength(1));

      act(() => result.current.setSearch('F'));
      act(() => result.current.setSearch('FA'));
      act(() => result.current.setSearch('FAC-002'));
      expect(result.current.search).toBe('FAC-002');
      // Debounced: three keystrokes are one request, and it carries the final text.
      expect(calls).toHaveLength(1);
      await waitFor(() => expect(calls).toHaveLength(2));
      expect(calls[1].body).toEqual({ startRow: 0, pageSize: RECTIFIABLE_PAGE_SIZE, search: 'FAC-002' });
    });

    it('REPLACES the rows when the search changes, rather than appending to them', async () => {
      const { calls } = mockPagedFetch(({ body }) => Promise.resolve(body.search === ''
        ? okAnswer({ invoices: pageOf('all', 3), hasMore: true })
        : okAnswer({ invoices: pageOf('hit', 1), hasMore: false })));
      const { result } = mount();
      await waitFor(() => expect(result.current.invoices).toHaveLength(3));

      act(() => result.current.setSearch('FAC-hit'));
      await waitFor(() => expect(idsOf(result.current.invoices)).toEqual(['hit-0']));
      expect(calls[1].body.startRow).toBe(0);
    });

    it('sends the trimmed query', async () => {
      const { calls } = mockPagedFetch(() => Promise.resolve(okAnswer({ invoices: [], hasMore: false })));
      const { result } = mount();
      await waitFor(() => expect(calls).toHaveLength(1));
      act(() => result.current.setSearch('  FAC-002  '));
      await waitFor(() => expect(calls).toHaveLength(2));
      expect(calls[1].body.search).toBe('FAC-002');
    });

    it('never reads a fruitless search as "this document has nothing to rectify"', async () => {
      mockPagedFetch(({ body }) => Promise.resolve(body.search === ''
        ? okAnswer({ invoices: INVOICES, hasMore: false })
        : okAnswer({ invoices: [], hasMore: false })));
      const { result } = mount();
      await waitFor(() => expect(result.current.invoices).toHaveLength(3));

      act(() => result.current.setSearch('nothing-like-this'));
      await waitFor(() => expect(result.current.invoices).toEqual([]));
      // isEmpty drives the "noInvoicesToRectify" warning AND the caller's confirm gate. Firing it
      // here would blame the document for the user's own search term.
      expect(result.current.isEmpty).toBe(false);
    });
  });

  describe('selectedInvoices — a chip outlives the batch it came from', () => {
    const mount = () => renderHook(() => useRectifiableInvoices({ enabled: true, url: URL, token: 't' }));

    it('resolves the selection from every row it has ever seen, not just the current batch', async () => {
      mockPagedFetch(({ body }) => Promise.resolve(body.search === ''
        ? okAnswer({ invoices: INVOICES, suggestedInvoiceIds: ['inv-2'], hasMore: false })
        : okAnswer({ invoices: [], hasMore: false })));
      const { result } = mount();
      await waitFor(() => expect(result.current.selectedIds).toEqual(['inv-2']));
      expect(result.current.selectedInvoices[0].documentNo).toBe('FAC-002');

      act(() => result.current.setSearch('ZZZ'));
      await waitFor(() => expect(result.current.invoices).toEqual([]));
      // The row is gone from `invoices`, but the user's choice — and the label they picked it by —
      // must still be on screen. Resolving the chip out of `invoices` would blank it here.
      expect(result.current.selectedInvoices).toHaveLength(1);
      expect(result.current.selectedInvoices[0].documentNo).toBe('FAC-002');
      expect(result.current.isSatisfied).toBe(true);
    });

    it('remembers rows from a later batch too', async () => {
      mockPagedFetch(({ body }) => Promise.resolve(body.startRow === 0
        ? okAnswer({ invoices: pageOf('a', 3), hasMore: true })
        : okAnswer({ invoices: pageOf('b', 2), hasMore: false })));
      const { result } = mount();
      await waitFor(() => expect(result.current.hasMore).toBe(true));
      act(() => result.current.loadMore());
      await waitFor(() => expect(result.current.invoices).toHaveLength(5));

      act(() => result.current.toggle('b-1'));
      expect(result.current.selectedInvoices[0].documentNo).toBe('FAC-b-1');
    });

    it('falls back to a bare id for a selection it has never seen a row for', async () => {
      mockPagedFetch(() => Promise.resolve(okAnswer({ invoices: INVOICES, hasMore: false })));
      const { result } = mount();
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => result.current.setSelectedIds(['ghost']));
      // Degraded but never crashing: the caller still renders a removable chip.
      expect(result.current.selectedInvoices).toEqual([{ id: 'ghost' }]);
    });
  });
});

describe('RectifiableInvoiceField', () => {
  const BASE = {
    invoices: INVOICES,
    selectedIds: [],
    onToggle: vi.fn(),
    onApply: vi.fn(),
    loading: false,
    isEmpty: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ response: { data: [] } }) }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the loading placeholder while loading', () => {
    render(<RectifiableInvoiceField {...BASE} loading={true} />);
    expect(screen.getByTestId('rectify-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('rectify-open')).not.toBeInTheDocument();
    expect(screen.queryByTestId('rectify-option-inv-1')).not.toBeInTheDocument();
  });

  it('renders the noInvoicesToRectify notice when the list is empty', () => {
    render(<RectifiableInvoiceField {...BASE} invoices={[]} isEmpty={true} />);
    expect(screen.getByTestId('rectify-empty')).toHaveTextContent('noInvoicesToRectify');
    expect(screen.queryByText('invoiceToRectifyLabel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('rectify-open')).not.toBeInTheDocument();
    // The claim is only licensed by a real answer of zero rows.
    expect(screen.queryByTestId('rectify-error')).not.toBeInTheDocument();
  });

  // ETP-5381 — the field is where the false statement was actually printed. "No hay facturas
  // confirmadas que rectificar para este documento de devolución" is a claim about the user's
  // data; it may only be made when the server said so, never when the server said nothing.
  describe('a failed load never borrows the "nothing to rectify" wording', () => {
    it('renders the error block, not the empty notice', () => {
      render(<RectifiableInvoiceField {...BASE} invoices={[]} isEmpty={false} loadError={true} />);
      expect(screen.getByTestId('rectify-error')).toHaveTextContent('couldNotLoadInvoicesToRectify');
      expect(screen.queryByTestId('rectify-empty')).not.toBeInTheDocument();
      expect(screen.queryByText('noInvoicesToRectify')).not.toBeInTheDocument();
    });

    it('puts the error branch BEFORE the empty branch when both flags are set', () => {
      // The ordering is the guard, so it gets its own test. `isEmpty` is supposed to be false
      // while `loadError` is true, but a caller computing it independently — or a future hook
      // that stops subtracting `loadError` from it — would hand over both. Reordering these two
      // branches would then silently restore the very message this ticket removed, with nothing
      // failing anywhere.
      render(<RectifiableInvoiceField {...BASE} invoices={[]} isEmpty={true} loadError={true} />);
      expect(screen.getByTestId('rectify-error')).toBeInTheDocument();
      expect(screen.queryByTestId('rectify-empty')).not.toBeInTheDocument();
      expect(screen.queryByText('noInvoicesToRectify')).not.toBeInTheDocument();
    });

    it('offers a retry and wires it to the caller', () => {
      const onRetry = vi.fn();
      render(<RectifiableInvoiceField {...BASE} loadError={true} onRetry={onRetry} />);
      const retry = within(screen.getByTestId('rectify-error')).getByTestId('rectify-retry');
      expect(retry).toHaveTextContent('retry');
      fireEvent.click(retry);
      // A transient 500 has to be recoverable in place: closing and reopening the host modal to
      // re-ask is not an obvious move for the user.
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('omits the button when no retry was supplied', () => {
      render(<RectifiableInvoiceField {...BASE} loadError={true} onRetry={undefined} />);
      // Still says what happened — a dead button would be worse than none.
      expect(screen.getByTestId('rectify-error')).toHaveTextContent('couldNotLoadInvoicesToRectify');
      expect(screen.queryByTestId('rectify-retry')).not.toBeInTheDocument();
    });

    it('defers to the loading placeholder while a fresh attempt is in flight', () => {
      render(<RectifiableInvoiceField {...BASE} loading={true} loadError={true} onRetry={vi.fn()} />);
      expect(screen.getByTestId('rectify-loading')).toBeInTheDocument();
      expect(screen.queryByTestId('rectify-error')).not.toBeInTheDocument();
    });

    it('shows the spinner, not the empty notice, if a caller ever hands over both', () => {
      // `useRectifiableInvoices` can no longer produce this pair — `isEmpty` subtracts `loading`
      // itself, precisely so the claim does not depend on branch order here. This is the second
      // line of defence, not the first: the field is exported and takes plain props, so any other
      // caller (or a hand-rolled state in a window) can still set both, and when it does the
      // spinner must win. Kept deliberately cheap; the real guarantee lives in the hook.
      render(<RectifiableInvoiceField {...BASE} invoices={[]} loading={true} isEmpty={true} loadError={false} />);
      expect(screen.getByTestId('rectify-loading')).toBeInTheDocument();
      expect(screen.queryByTestId('rectify-empty')).not.toBeInTheDocument();
      expect(screen.queryByText('noInvoicesToRectify')).not.toBeInTheDocument();
    });

    it('honours the idPrefix on both the error block and its retry button', () => {
      // Both host modals mount this field, and ConfirmInOutModal can show it beside other
      // sections: a shared testid would make the E2E selectors ambiguous.
      render(<RectifiableInvoiceField {...BASE} idPrefix="confirm-modal-rectify" loadError={true} onRetry={vi.fn()} />);
      expect(screen.getByTestId('confirm-modal-rectify-error')).toBeInTheDocument();
      expect(screen.getByTestId('confirm-modal-rectify-retry')).toBeInTheDocument();
      expect(screen.queryByTestId('rectify-error')).not.toBeInTheDocument();
      expect(screen.queryByTestId('rectify-retry')).not.toBeInTheDocument();
    });

    it('renders nothing of the error when the load succeeded', () => {
      render(<RectifiableInvoiceField {...BASE} loadError={false} onRetry={vi.fn()} />);
      expect(screen.queryByTestId('rectify-error')).not.toBeInTheDocument();
      expect(screen.queryByTestId('rectify-retry')).not.toBeInTheDocument();
      expect(screen.getByTestId('rectify-open')).toBeInTheDocument();
    });
  });

  it('renders the field label and, with nothing selected, only the trigger — never an inline row', () => {
    render(<RectifiableInvoiceField {...BASE} />);
    expect(screen.getByText('invoiceToRectifyLabel')).toBeInTheDocument();
    expect(screen.getByTestId('rectify-open')).toHaveTextContent('rectifySelectInvoices');
    // The host modal already carries a summary card and the generate-documents block: the
    // catalogue must stay behind the trigger, or those actions get pushed below the fold.
    for (const inv of INVOICES) {
      expect(screen.queryByTestId(`rectify-selected-${inv.id}`)).not.toBeInTheDocument();
      expect(screen.queryByTestId(`rectify-option-${inv.id}`)).not.toBeInTheDocument();
      expect(screen.queryByText(inv.documentNo)).not.toBeInTheDocument();
    }
    expect(screen.queryByTestId('rectify-selected-count')).not.toBeInTheDocument();
    expect(screen.queryByTestId('rectify-picker-modal')).not.toBeInTheDocument();
  });

  it('shows ONLY the selected invoices, not the whole catalogue', () => {
    render(<RectifiableInvoiceField {...BASE} selectedIds={['inv-2']} />);
    expect(screen.getByTestId('rectify-selected-inv-2')).toHaveTextContent('FAC-002');
    expect(screen.queryByTestId('rectify-selected-inv-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('rectify-selected-inv-3')).not.toBeInTheDocument();
    expect(screen.queryByText('FAC-001')).not.toBeInTheDocument();
    expect(screen.queryByText('FAC-003')).not.toBeInTheDocument();
    expect(screen.getByTestId('rectify-selected-count')).toBeInTheDocument();
    // With a selection the trigger changes its offer from "pick" to "change".
    expect(screen.getByTestId('rectify-open')).toHaveTextContent('rectifyChangeSelection');
  });

  it('lists every selected invoice — C_Invoice_Reverse is a 1:N bridge', () => {
    render(<RectifiableInvoiceField {...BASE} selectedIds={['inv-1', 'inv-3']} />);
    expect(screen.getByTestId('rectify-selected-inv-1')).toBeInTheDocument();
    expect(screen.getByTestId('rectify-selected-inv-3')).toBeInTheDocument();
    expect(screen.queryByTestId('rectify-selected-inv-2')).not.toBeInTheDocument();
  });

  it('deselects an invoice through the row remove button', () => {
    const onToggle = vi.fn();
    render(<RectifiableInvoiceField {...BASE} selectedIds={['inv-1', 'inv-2']} onToggle={onToggle} />);
    fireEvent.click(screen.getByTestId('rectify-remove-inv-2'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('inv-2');
  });

  it('formats the selected row amount through the canonical currency formatter (grouped, symbol after)', () => {
    render(<RectifiableInvoiceField {...BASE} selectedIds={['inv-1']} />);
    // Exact match — a tolerant regex would also pass with the ungrouped / raw-ISO-code output.
    expect(screen.getByTestId('rectify-selected-inv-1')).toHaveTextContent('1.234,50 €');
    expect(screen.getByTestId('rectify-selected-inv-1')).not.toHaveTextContent('EUR');
  });

  it('omits the amount when the selected invoice carries none', () => {
    render(<RectifiableInvoiceField {...BASE} selectedIds={['inv-3']} />);
    expect(screen.getByTestId('rectify-selected-inv-3')).toHaveTextContent('FAC-003');
    expect(screen.getByTestId('rectify-selected-inv-3').textContent).not.toMatch(/\d,\d\d/);
  });

  it('honours a custom idPrefix so two pickers can coexist on one page', () => {
    render(<RectifiableInvoiceField {...BASE} idPrefix="confirm-modal-rectify" />);
    expect(screen.getByTestId('confirm-modal-rectify-open')).toBeInTheDocument();
    expect(screen.queryByTestId('rectify-open')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('confirm-modal-rectify-open'));
    expect(screen.getByTestId('confirm-modal-rectify-picker-modal')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-modal-rectify-option-inv-1')).toBeInTheDocument();
    expect(screen.queryByTestId('rectify-option-inv-1')).not.toBeInTheDocument();
  });

  // ETP-5381 — with server-side paging the row behind a selection is routinely NOT in the batch
  // currently on screen: a later page, or a search, replaces `invoices` wholesale. The hook
  // resolves the chips out of everything it has ever seen and hands them down as
  // `selectedInvoices`, which the field must prefer over filtering `invoices` itself.
  describe('selectedInvoices — the chip survives a batch it is not in', () => {
    const ABSENT = { id: 'inv-9', documentNo: 'FAC-009', invoiceDate: '2026-08-12', grandTotalAmount: 42.5, currency: 'EUR' };

    it('renders a chip for a selection whose row is absent from the current batch', () => {
      render(<RectifiableInvoiceField
        {...BASE}
        invoices={INVOICES}
        selectedIds={['inv-9']}
        selectedInvoices={[ABSENT]}
      />);
      // Filtering `invoices` would find nothing here and silently drop the user's choice, while
      // the parent still holds it — the field would claim nothing is selected on a request that
      // the server will happily accept.
      expect(screen.getByTestId('rectify-selected-inv-9')).toHaveTextContent('FAC-009');
      expect(screen.getByTestId('rectify-selected-inv-9')).toHaveTextContent('42,50 €');
      expect(screen.getByTestId('rectify-selected-count')).toBeInTheDocument();
      expect(screen.getByTestId('rectify-open')).toHaveTextContent('rectifyChangeSelection');
    });

    it('survives the degraded chip the hook falls back to for an unknown row', () => {
      render(<RectifiableInvoiceField {...BASE} selectedIds={['ghost']} selectedInvoices={[{ id: 'ghost' }]} />);
      expect(screen.getByTestId('rectify-selected-ghost')).toBeInTheDocument();
      expect(screen.getByTestId('rectify-remove-ghost')).toBeInTheDocument();
    });

    it('prefers the resolved list over the batch, even when both could answer', () => {
      render(<RectifiableInvoiceField
        {...BASE}
        selectedIds={['inv-1', 'inv-9']}
        selectedInvoices={[INVOICES[0], ABSENT]}
      />);
      expect(screen.getByTestId('rectify-selected-inv-1')).toBeInTheDocument();
      expect(screen.getByTestId('rectify-selected-inv-9')).toBeInTheDocument();
      expect(screen.queryByTestId('rectify-selected-inv-2')).not.toBeInTheDocument();
    });

    it('still falls back to filtering the batch when no resolved list is supplied', () => {
      render(<RectifiableInvoiceField {...BASE} selectedIds={['inv-2']} selectedInvoices={undefined} />);
      expect(screen.getByTestId('rectify-selected-inv-2')).toHaveTextContent('FAC-002');
      expect(screen.queryByTestId('rectify-selected-inv-1')).not.toBeInTheDocument();
    });

    it('shows the trigger, not a chip, when the resolved list is empty', () => {
      render(<RectifiableInvoiceField {...BASE} selectedIds={['inv-2']} selectedInvoices={[]} />);
      expect(screen.getByTestId('rectify-open')).toHaveTextContent('rectifySelectInvoices');
      expect(screen.queryByTestId('rectify-selected-inv-2')).not.toBeInTheDocument();
    });
  });

  describe('wiring the picker to the server-side pager', () => {
    it('forwards the search text, the query callback and the loading-more flag down', () => {
      const onSearchChange = vi.fn();
      render(<RectifiableInvoiceField
        {...BASE}
        search="globex"
        onSearchChange={onSearchChange}
        loadingMore={true}
      />);
      fireEvent.click(screen.getByTestId('rectify-open'));

      expect(screen.getByTestId('rectify-search')).toHaveValue('globex');
      expect(screen.getByTestId('rectify-loading-more')).toBeInTheDocument();
      fireEvent.change(screen.getByTestId('rectify-search'), { target: { value: 'acme' } });
      expect(onSearchChange).toHaveBeenCalledWith('acme');
      // Server-driven: the batch stays whole no matter what is typed.
      expect(screen.getByTestId('rectify-option-inv-1')).toBeInTheDocument();
      expect(screen.getByTestId('rectify-option-inv-2')).toBeInTheDocument();
      expect(screen.getByTestId('rectify-option-inv-3')).toBeInTheDocument();
    });

    it('forwards the bottom-of-list callback down', () => {
      const onReachBottom = vi.fn();
      render(<RectifiableInvoiceField {...BASE} search="" onSearchChange={vi.fn()} onReachBottom={onReachBottom} />);
      fireEvent.click(screen.getByTestId('rectify-open'));
      scrollToBottom(screen.getByTestId('rectify-list'));
      expect(onReachBottom).toHaveBeenCalledTimes(1);
    });
  });

  it('handles an empty list without the isEmpty flag by rendering no rows', () => {
    render(<RectifiableInvoiceField {...BASE} invoices={[]} isEmpty={false} />);
    expect(screen.getByText('invoiceToRectifyLabel')).toBeInTheDocument();
    expect(screen.queryByTestId('rectify-empty')).not.toBeInTheDocument();
    expect(screen.queryByTestId('rectify-selected-inv-1')).not.toBeInTheDocument();
  });

  describe('opening the picker', () => {
    it('mounts the picker modal with one row per invoice', () => {
      render(<RectifiableInvoiceField {...BASE} />);
      fireEvent.click(screen.getByTestId('rectify-open'));
      expect(screen.getByTestId('rectify-picker-modal')).toBeInTheDocument();
      expect(screen.getByTestId('rectify-option-inv-1')).toHaveTextContent('FAC-001');
      expect(screen.getByTestId('rectify-option-inv-2')).toHaveTextContent('FAC-002');
      expect(screen.getByTestId('rectify-option-inv-3')).toHaveTextContent('FAC-003');
    });

    it('offers the multi-select affordances — the shared picker is opened in `multiple` mode', () => {
      render(<RectifiableInvoiceField {...BASE} />);
      fireEvent.click(screen.getByTestId('rectify-open'));
      expect(screen.getByTestId('rectify-apply')).toBeInTheDocument();
      expect(screen.getByTestId('rectify-option-inv-1')).toHaveAttribute('data-selected', 'false');
    });

    it('marks only the already-selected rows via data-selected', () => {
      render(<RectifiableInvoiceField {...BASE} selectedIds={['inv-2']} />);
      fireEvent.click(screen.getByTestId('rectify-open'));
      expect(screen.getByTestId('rectify-option-inv-1')).toHaveAttribute('data-selected', 'false');
      expect(screen.getByTestId('rectify-option-inv-2')).toHaveAttribute('data-selected', 'true');
      expect(screen.getByTestId('rectify-option-inv-3')).toHaveAttribute('data-selected', 'false');
    });

    it('does not commit a click straight to the parent — only Apply does', () => {
      const onToggle = vi.fn();
      const onApply = vi.fn();
      render(<RectifiableInvoiceField {...BASE} onToggle={onToggle} onApply={onApply} />);
      fireEvent.click(screen.getByTestId('rectify-open'));
      fireEvent.click(screen.getByTestId('rectify-option-inv-2'));
      // Visible in the draft...
      expect(screen.getByTestId('rectify-option-inv-2')).toHaveAttribute('data-selected', 'true');
      // ...but the parent has not heard about it yet.
      expect(onToggle).not.toHaveBeenCalled();
      expect(onApply).not.toHaveBeenCalled();
    });

    it('drafts from a click on the checkbox itself, not just on the row container', () => {
      // The path the user actually aims at, and the one that was silently broken: the shared
      // Checkbox is a <label> over a hidden <input>, so the click used to reach the row twice and
      // cancel itself out. Reached here through the field, the way both consumers wire it.
      const onApply = vi.fn();
      render(<RectifiableInvoiceField {...BASE} onApply={onApply} />);
      fireEvent.click(screen.getByTestId('rectify-open'));

      const row = screen.getByTestId('rectify-option-inv-2');
      fireEvent.click(row.querySelector('input[type="checkbox"]'));
      expect(row).toHaveAttribute('data-selected', 'true');

      fireEvent.click(screen.getByTestId('rectify-apply'));
      expect(onApply).toHaveBeenCalledWith(['inv-2']);
    });

    it('propagates the draft to the parent on Apply and closes the picker', () => {
      const onApply = vi.fn();
      render(<RectifiableInvoiceField {...BASE} onApply={onApply} />);
      fireEvent.click(screen.getByTestId('rectify-open'));
      fireEvent.click(screen.getByTestId('rectify-option-inv-1'));
      fireEvent.click(screen.getByTestId('rectify-option-inv-3'));
      fireEvent.click(screen.getByTestId('rectify-apply'));
      expect(onApply).toHaveBeenCalledTimes(1);
      expect(onApply).toHaveBeenCalledWith(['inv-1', 'inv-3']);
      expect(screen.queryByTestId('rectify-picker-modal')).not.toBeInTheDocument();
    });

    it('discards the draft when the user cancels — Cancel must not be a lie', () => {
      const onToggle = vi.fn();
      const onApply = vi.fn();
      render(<RectifiableInvoiceField {...BASE} selectedIds={['inv-1']} onToggle={onToggle} onApply={onApply} />);
      fireEvent.click(screen.getByTestId('rectify-open'));

      // Pick a different invoice, drop the original one, then walk away.
      fireEvent.click(screen.getByTestId('rectify-option-inv-3'));
      fireEvent.click(screen.getByTestId('rectify-option-inv-1'));
      fireEvent.click(screen.getByText('cancel'));

      expect(onApply).not.toHaveBeenCalled();
      expect(onToggle).not.toHaveBeenCalled();
      expect(screen.queryByTestId('rectify-picker-modal')).not.toBeInTheDocument();
      // The field still shows exactly what the parent holds.
      expect(screen.getByTestId('rectify-selected-inv-1')).toBeInTheDocument();
      expect(screen.queryByTestId('rectify-selected-inv-3')).not.toBeInTheDocument();
    });

    it('reopens with a clean draft after a cancel', () => {
      render(<RectifiableInvoiceField {...BASE} selectedIds={['inv-1']} />);
      fireEvent.click(screen.getByTestId('rectify-open'));
      fireEvent.click(screen.getByTestId('rectify-option-inv-3'));
      fireEvent.click(screen.getByText('cancel'));

      fireEvent.click(screen.getByTestId('rectify-open'));
      expect(screen.getByTestId('rectify-option-inv-1')).toHaveAttribute('data-selected', 'true');
      expect(screen.getByTestId('rectify-option-inv-3')).toHaveAttribute('data-selected', 'false');
    });

    it('closes without applying when the × of the picker is used', () => {
      const onApply = vi.fn();
      render(<RectifiableInvoiceField {...BASE} onApply={onApply} />);
      fireEvent.click(screen.getByTestId('rectify-open'));
      fireEvent.click(screen.getByTestId('rectify-option-inv-2'));
      fireEvent.click(within(screen.getByTestId('rectify-picker-modal')).getByLabelText('cancel'));
      expect(onApply).not.toHaveBeenCalled();
      expect(screen.queryByTestId('rectify-picker-modal')).not.toBeInTheDocument();
    });

    it('can clear the whole selection by applying an empty draft', () => {
      const onApply = vi.fn();
      render(<RectifiableInvoiceField {...BASE} selectedIds={['inv-1']} onApply={onApply} />);
      fireEvent.click(screen.getByTestId('rectify-open'));
      fireEvent.click(screen.getByTestId('rectify-option-inv-1'));
      fireEvent.click(screen.getByTestId('rectify-apply'));
      expect(onApply).toHaveBeenCalledWith([]);
    });
  });
});

describe('RectifiableInvoicePickerModal', () => {
  const SEARCHABLE = [
    { id: 'inv-1', documentNo: 'FAC-001', businessPartner: 'Acme Corp', invoiceDate: '2026-08-10', grandTotalAmount: 1234.5, currency: 'EUR' },
    { id: 'inv-2', documentNo: 'FAC-002', businessPartner: 'Globex SA' },
    { id: 'inv-3', documentNo: 'ALB-777', businessPartner: 'Acme Corp', suggested: true },
  ];

  const BASE = {
    invoices: SEARCHABLE,
    selectedIds: [],
    onApply: vi.fn(),
    onClose: vi.fn(),
  };

  const optionIds = () => [...document.body.querySelectorAll('[data-testid^="rectify-option-"]')]
    .map(node => node.getAttribute('data-testid'));

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ response: { data: [] } }) }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders through a portal on document.body, not inside the caller subtree', () => {
    const { container } = render(<RectifiableInvoicePickerModal {...BASE} />);
    // Portalled: the host modal's own layout is left untouched, which is what lets the picker
    // sit above it instead of stretching it.
    expect(container).toBeEmptyDOMElement();
    expect(document.body).toContainElement(screen.getByTestId('rectify-picker-modal'));
  });

  it('stacks above the host modal tier (zIndex 60 > 50, and below the 70 walkthrough overlay)', () => {
    render(<RectifiableInvoicePickerModal {...BASE} />);
    expect(screen.getByTestId('rectify-picker-modal')).toHaveStyle({ zIndex: '60' });
  });

  it('is an accessible dialog', () => {
    render(<RectifiableInvoicePickerModal {...BASE} />);
    const dialog = screen.getByTestId('rectify-picker-modal');
    expect(dialog).toHaveAttribute('role', 'dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('opens the shared picker in multiple mode (checkboxes + apply, no select-and-close)', () => {
    render(<RectifiableInvoicePickerModal {...BASE} />);
    expect(screen.getByTestId('rectify-apply')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('rectify-option-inv-1'));
    expect(screen.getByTestId('rectify-option-inv-1')).toHaveAttribute('data-selected', 'true');
    expect(BASE.onClose).not.toHaveBeenCalled();
  });

  it('leads with the backend-detected invoices when there is no search', () => {
    render(<RectifiableInvoicePickerModal {...BASE} />);
    expect(optionIds()).toEqual(['rectify-option-inv-3', 'rectify-option-inv-1', 'rectify-option-inv-2']);
    expect(screen.getByTestId('rectify-suggested-inv-3')).toBeInTheDocument();
    expect(screen.queryByTestId('rectify-suggested-inv-1')).not.toBeInTheDocument();
  });

  it('filters by document number', () => {
    render(<RectifiableInvoicePickerModal {...BASE} />);
    fireEvent.change(screen.getByTestId('rectify-search'), { target: { value: 'FAC-002' } });
    expect(optionIds()).toEqual(['rectify-option-inv-2']);
  });

  it('filters by business partner, case-insensitively', () => {
    render(<RectifiableInvoicePickerModal {...BASE} />);
    fireEvent.change(screen.getByTestId('rectify-search'), { target: { value: 'globex' } });
    expect(optionIds()).toEqual(['rectify-option-inv-2']);
  });

  it('keeps the incoming list order while searching (suggested-first is a no-query nicety)', () => {
    render(<RectifiableInvoicePickerModal {...BASE} />);
    fireEvent.change(screen.getByTestId('rectify-search'), { target: { value: 'acme' } });
    expect(optionIds()).toEqual(['rectify-option-inv-1', 'rectify-option-inv-3']);
  });

  it('ignores surrounding whitespace in the query', () => {
    render(<RectifiableInvoicePickerModal {...BASE} />);
    fireEvent.change(screen.getByTestId('rectify-search'), { target: { value: '  ALB  ' } });
    expect(optionIds()).toEqual(['rectify-option-inv-3']);
  });

  it('reports no matches instead of an empty void', () => {
    render(<RectifiableInvoicePickerModal {...BASE} />);
    fireEvent.change(screen.getByTestId('rectify-search'), { target: { value: 'nothing-like-this' } });
    expect(screen.getByTestId('rectify-no-matches')).toBeInTheDocument();
    expect(optionIds()).toEqual([]);
  });

  it('survives invoices with no documentNo or business partner while searching', () => {
    render(<RectifiableInvoicePickerModal {...BASE} invoices={[{ id: 'inv-x' }]} />);
    fireEvent.change(screen.getByTestId('rectify-search'), { target: { value: 'FAC' } });
    expect(screen.getByTestId('rectify-no-matches')).toBeInTheDocument();
  });

  it('preselects the ids handed in by the parent', () => {
    render(<RectifiableInvoicePickerModal {...BASE} selectedIds={['inv-2']} />);
    expect(screen.getByTestId('rectify-option-inv-2')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('rectify-option-inv-1')).toHaveAttribute('data-selected', 'false');
  });

  it('toggles a row with the keyboard', () => {
    render(<RectifiableInvoicePickerModal {...BASE} />);
    const row = screen.getByTestId('rectify-option-inv-1');
    expect(row).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(row).toHaveAttribute('data-selected', 'true');
    fireEvent.keyDown(row, { key: ' ' });
    expect(row).toHaveAttribute('data-selected', 'false');
  });

  it('applies the draft in click order', () => {
    const onApply = vi.fn();
    render(<RectifiableInvoicePickerModal {...BASE} onApply={onApply} />);
    fireEvent.click(screen.getByTestId('rectify-option-inv-2'));
    fireEvent.click(screen.getByTestId('rectify-option-inv-1'));
    fireEvent.click(screen.getByTestId('rectify-apply'));
    expect(onApply).toHaveBeenCalledWith(['inv-2', 'inv-1']);
  });

  it('never applies on Cancel', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(<RectifiableInvoicePickerModal {...BASE} onApply={onApply} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('rectify-option-inv-1'));
    fireEvent.click(screen.getByText('cancel'));
    expect(onApply).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on a backdrop click but not on a click inside the panel', () => {
    const onClose = vi.fn();
    render(<RectifiableInvoicePickerModal {...BASE} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('rectify-search'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('rectify-picker-modal'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the shared page size instead of overriding it', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ id: `inv-${i}`, documentNo: `FAC-${i}` }));
    render(<RectifiableInvoicePickerModal {...BASE} invoices={many} />);
    // Same 20-row page the Rectificaciones tab shows. A different page size here made this read
    // as a second, unrelated dialog — the reason the two callers share one component at all.
    expect(optionIds()).toHaveLength(20);
  });

  it('grows by a page on scroll rather than hiding the tail behind a search term', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ id: `inv-${i}`, documentNo: `FAC-${i}` }));
    render(<RectifiableInvoicePickerModal {...BASE} invoices={many} />);
    scrollToBottom(screen.getByTestId('rectify-list'));
    expect(optionIds()).toHaveLength(25);
  });

  it('keeps the shared title too — the only visible difference is the checkbox', () => {
    render(<RectifiableInvoicePickerModal {...BASE} />);
    expect(screen.getByText('rectPickerTitle')).toBeInTheDocument();
  });

  it('renders every row when the whole set fits in one page', () => {
    render(<RectifiableInvoicePickerModal {...BASE} />);
    expect(optionIds()).toHaveLength(SEARCHABLE.length);
  });

  describe('driven by the server', () => {
    const SERVER = {
      ...BASE,
      search: '',
      onSearchChange: vi.fn(),
      onReachBottom: vi.fn(),
    };

    it('forwards the query to the caller and keeps showing the batch it holds', () => {
      const onSearchChange = vi.fn();
      render(<RectifiableInvoicePickerModal {...SERVER} onSearchChange={onSearchChange} />);
      fireEvent.change(screen.getByTestId('rectify-search'), { target: { value: 'FAC-002' } });
      expect(onSearchChange).toHaveBeenCalledWith('FAC-002');
      // Filtering locally here would report "no matches" for invoices the server has but has not
      // sent yet — the whole reason the search moved server-side.
      expect(optionIds()).toHaveLength(SEARCHABLE.length);
      expect(screen.queryByTestId('rectify-no-matches')).not.toBeInTheDocument();
    });

    it('asks for the next batch when the list reaches the bottom', () => {
      const onReachBottom = vi.fn();
      render(<RectifiableInvoicePickerModal {...SERVER} onReachBottom={onReachBottom} />);
      scrollToBottom(screen.getByTestId('rectify-list'));
      expect(onReachBottom).toHaveBeenCalledTimes(1);
    });

    it('announces the batch in flight', () => {
      render(<RectifiableInvoicePickerModal {...SERVER} loadingMore={true} />);
      expect(screen.getByTestId('rectify-loading-more')).toBeInTheDocument();
      expect(optionIds()).toHaveLength(SEARCHABLE.length);
    });
  });

  it('honours a custom idPrefix on every hook the callers query', () => {
    render(<RectifiableInvoicePickerModal {...BASE} idPrefix="invoice-confirm-rectify" />);
    expect(screen.getByTestId('invoice-confirm-rectify-picker-modal')).toBeInTheDocument();
    expect(screen.getByTestId('invoice-confirm-rectify-search')).toBeInTheDocument();
    expect(screen.getByTestId('invoice-confirm-rectify-apply')).toBeInTheDocument();
    expect(screen.getByTestId('invoice-confirm-rectify-option-inv-1')).toBeInTheDocument();
    expect(screen.queryByTestId('rectify-picker-modal')).not.toBeInTheDocument();
  });
});
