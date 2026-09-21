import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useUI } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import { useApiFetch } from '@/auth/useApiFetch.js';
import InvoicePickerModal from './InvoicePickerModal.jsx';

/**
 * ETP-5381 — picker for the invoice(s) a rectificative invoice will rectify.
 *
 * A rectificative invoice cannot be confirmed without declaring which invoice it corrects: the
 * ETSG_CHECK_RECTIF_INV_DOC validation rejects a rectificative document type with no rows in
 * C_Invoice_Reverse. Since these invoices are now created AND confirmed in one step, the choice
 * has to be made up front — in both entry points (confirming the return document with the invoice
 * option ticked, and the create-rectificative-invoice button on a confirmed return document).
 *
 * <p><b>The list is every confirmed invoice of the flow, not just the return's own chain.</b>
 * The backend still detects the chain (return line → original line → its invoice) and flags those
 * rows as related so they sort first, but detection cannot be a restriction: a return created
 * standalone has no chain at all, and a return covering two shipments billed on two invoices has
 * to be able to name both.
 *
 * <p><b>Preselection only when the chain is unambiguous.</b> A single detected invoice is
 * preselected; two or more are not. An order billed across two invoices and returned once makes
 * the chain find both, and nothing in the chain says which one the user means to rectify —
 * choosing for them is a guess wearing the costume of a default. With several, the field stays
 * empty and the confirm button stays disabled; the picker still badges those rows as related so
 * the user can see what the chain found and decide.
 *
 * <p>The browsing list lives in its own modal rather than inline: the host modal already carries a
 * summary card, an optional tariff selector and the generate-documents block, and an embedded
 * scrolling list of every invoice in the system pushed its actions below the fold. The field below
 * shows only what is selected; picking happens in {@link RectifiableInvoicePickerModal}.
 */

/**
 * Rows per batch. Matches `ReturnShipmentUtils.DEFAULT_RECTIFIABLE_PAGE_SIZE` so an unparameterised
 * call and a first batch return the same rows; nothing breaks if they drift, the client simply
 * asks for a window the server is happy to serve.
 */
export const RECTIFIABLE_PAGE_SIZE = 80;

/**
 * Loads the invoices this return document can rectify, **one batch at a time**.
 *
 * <p>Mirrors the contract `useEntity` gives the list windows — `items` / `hasMore` /
 * `loadingMore` / `loadMore` — so the picker pages the way the rest of the app does and a slow
 * connection does not wait for the whole candidate set before the modal can open.
 *
 * <p><b>Search is a server round-trip, not a client filter.</b> The client only ever holds the
 * batches it fetched, so filtering here would answer "no matches" for an invoice that exists
 * further down the set — the user would conclude it is not there. Typing therefore resets to the
 * first batch and refetches, debounced.
 *
 * <p><b>Selected rows are cached by id.</b> A selection made in batch 1 has to keep rendering its
 * number and amount once batch 4 arrives, and after a search replaces the loaded rows entirely.
 * With the whole set in memory that was free; paging makes it something the hook has to carry, so
 * the callers below (and the chips they render) never have to care which batch a selection came
 * from.
 *
 * @param enabled  when false, nothing is fetched and the hook reports a neutral state
 * @param url      action URL (POST) returning
 *                 { response: { data: { invoices, hasMore, suggestedInvoiceIds } } }
 * @param token    auth bearer token
 */
export function useRectifiableInvoices({ enabled, url, token }) {
  const apiFetch = useApiFetch();
  const [invoices, setInvoices] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');
  // Debounced copy of `search`: the input updates on every keystroke, this is what actually
  // triggers a fetch, so a user typing an invoice number fires one request instead of eight.
  const [query, setQuery] = useState('');
  const [loaded, setLoaded] = useState(false);
  // Set only by a failed fetch. Kept separate from `loaded` so the UI can tell "we asked and
  // the answer was none" from "we asked and never got an answer".
  const [loadError, setLoadError] = useState(false);
  // id → row, for every invoice seen in any batch. Only grows, and only for rows the user
  // selected; see the javadoc above for why the chips depend on it.
  const [knownById, setKnownById] = useState({});
  // Monotonic request id. Batches can come back out of order — a slow first page landing after a
  // fast search would otherwise append stale rows to a list they do not belong to — so every
  // response checks it is still the newest before touching state.
  const reqRef = useRef(0);
  const startRowRef = useRef(0);

  useEffect(() => {
    const id = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(id);
  }, [search]);

  const remember = useCallback((rows) => {
    setKnownById(prev => {
      const next = { ...prev };
      rows.forEach(r => { if (r?.id) next[r.id] = r; });
      return next;
    });
  }, []);

  const fetchBatch = useCallback(async (startRow, { append }) => {
    const seq = ++reqRef.current;
    setLoadError(false);
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const res = await apiFetch(url, {
        method: 'POST',
        body: JSON.stringify({ startRow, pageSize: RECTIFIABLE_PAGE_SIZE, search: query }),
        baseUrl: '',
        token,
      });
      if (seq !== reqRef.current) return;
      // An HTTP error does NOT throw — `fetch` only rejects on a transport failure — so a 400/500
      // has to be turned into one here or it slips past the catch below and reports as an empty
      // list. That is precisely how the OFFSET-binding failure surfaced as "there are no confirmed
      // invoices to rectify": the action answered 400, this branch returned quietly, and the modal
      // made a false statement about the data.
      if (!res.ok) throw new Error(`rectifiableInvoices: HTTP ${res.status}`);
      const data = (await res.json())?.response?.data;
      if (seq !== reqRef.current) return;
      const list = Array.isArray(data?.invoices) ? data.invoices : [];
      remember(list);
      setInvoices(prev => (append ? [...prev, ...list] : list));
      setHasMore(Boolean(data?.hasMore));
      startRowRef.current = startRow + list.length;
      // Preselect every chain-detected invoice, not just one: a return covering two invoiced
      // shipments must rectify both, and making the user re-find the second by hand is the
      // friction this picker exists to remove. Only on the first batch — a later batch repeats the
      // same ids and must not resurrect a selection the user has since cleared.
      if (!append) {
        const suggested = Array.isArray(data?.suggestedInvoiceIds) ? data.suggestedInvoiceIds : [];
        // Still filtered against the rows actually delivered, exactly as before paging. The backend
        // guarantees detected rows ride the first batch, so this drops nothing in practice — it is
        // insurance against that contract drifting: preselecting an id whose row never arrived
        // would submit a rectification the user can neither see nor untick.
        const valid = suggested.filter(id => list.some(inv => inv.id === id));
        // ONE detected invoice is an answer; SEVERAL are a question. When an order was billed
        // across two invoices and a single return comes back against it, the chain legitimately
        // finds both — but which one the user means to rectify is not something the chain knows,
        // and preselecting both quietly decided it for them. So we only preselect when the chain
        // leaves no ambiguity; otherwise the field stays empty, the confirm button stays disabled
        // via `isSatisfied`, and the picker still marks those rows as related so the user can see
        // which ones the chain found.
        if (valid.length === 1) setSelectedIds(prev => (prev.length > 0 ? prev : valid));
      }
    } catch {
      // Stop paging, and RECORD that this was a failure rather than an answer. Matches useEntity,
      // which also clears hasMore on a failed page rather than retrying into a loop.
      //
      // The flag exists because conflating the two cost real debugging time: a 400 from the action
      // left the list empty, `isEmpty` went true, and the modal stated "there are no confirmed
      // invoices to rectify for this return document" — a confident claim about the user's DATA
      // when the truth was that the query had thrown. The reader reasonably concluded the filter
      // was wrong and nearly had it removed, while 20 perfectly good invoices sat in the table.
      // An error must never be able to render as a fact about the data.
      // BOTH writes are behind the race guard. `setHasMore` used to sit outside it, so a stale
      // request failing after a newer search had already succeeded cleared `hasMore` on the fresh
      // list — the user silently lost the ability to scroll for more rows of the query they were
      // actually looking at. Same reasoning as `setLoadError`: a dead request must not narrate the
      // state of a live one.
      if (seq === reqRef.current) {
        setLoadError(true);
        setHasMore(false);
      }
    } finally {
      if (seq === reqRef.current) {
        setLoading(false);
        setLoadingMore(false);
        setLoaded(true);
      }
    }
  }, [apiFetch, url, token, query, remember]);

  // First batch, and a fresh one whenever the debounced query changes.
  useEffect(() => {
    if (!enabled || !url) return;
    startRowRef.current = 0;
    fetchBatch(0, { append: false });
  }, [enabled, url, fetchBatch]);

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore || loading) return;
    fetchBatch(startRowRef.current, { append: true });
  }, [hasMore, loadingMore, loading, fetchBatch]);

  const toggle = useCallback((id) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  }, []);

  // What the chips render: the selected rows, resolved from the cache so a selection survives
  // paging and searching. Falls back to a bare id rather than dropping the chip — losing the
  // visual record of a selection that IS going to be submitted would be worse than showing it
  // plainly.
  const selectedInvoices = useMemo(
    () => selectedIds.map(id => knownById[id] || { id }),
    [selectedIds, knownById],
  );

  return {
    invoices,
    selectedIds,
    selectedInvoices,
    toggle,
    setSelectedIds,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    search,
    setSearch,
    // True only once we know there is genuinely nothing to rectify — and only when the user is not
    // narrowing the list themselves, so "your search matched nothing" never reads as "this document
    // has nothing to rectify".
    loadError,
    retry: () => fetchBatch(0, { append: false }),
    // Four guards, and each one stops a DIFFERENT non-fact from being stated as "this document has
    // nothing to rectify": `loaded` (we have not asked yet), `!query` (your search matched nothing),
    // `!loadError` (we never got an answer) and `!loading` (we are asking right now).
    //
    // `!loading` matters even though no caller can currently render it: during a retry, `loaded` is
    // still true from the failed attempt and `invoices` is still empty, so the flag flipped back to
    // true mid-flight. It only stayed off-screen because `RectifiableInvoiceField` happens to check
    // `loading` first. A flag that is wrong unless every consumer remembers to check another flag
    // first is a trap, and this whole error/empty split exists because exactly that kind of
    // near-miss shipped a false claim about the user's data.
    isEmpty: loaded && !loading && invoices.length === 0 && !query && !loadError,
    // The gate the confirm button uses.
    isSatisfied: !enabled || selectedIds.length > 0,
  };
}

const invoiceMeta = (inv) => [
  inv.invoiceDate ? formatCalendarDate(inv.invoiceDate) : null,
  inv.businessPartner,
].filter(Boolean).join(' · ');

const invoiceAmount = (inv) => (inv.grandTotalAmount == null
  ? null
  : (inv.currency ? formatCurrency(inv.currency, inv.grandTotalAmount) : String(inv.grandTotalAmount)));

// ── Selection field ───────────────────────────────────────────────────────────

/**
 * Compact field for the host modal: shows only the selected invoices plus a trigger that opens
 * {@link RectifiableInvoicePickerModal} to change the selection.
 */
export function RectifiableInvoiceField({
  invoices, selectedIds, selectedInvoices, onToggle, onApply, loading, isEmpty, idPrefix = 'rectify',
  search, onSearchChange, onReachBottom, loadingMore, loadError, onRetry,
}) {
  const ui = useUI();
  const [pickerOpen, setPickerOpen] = useState(false);

  // Prefer the hook's id-keyed cache over filtering the loaded batch. Since the list pages, the
  // rows currently in `invoices` are one window onto the set: an invoice picked in the first batch
  // is NOT in `invoices` after the user scrolls on or searches, so filtering here would silently
  // drop its chip while its id stays in the payload that gets submitted. `invoices` remains the
  // fallback for any caller still handing over the whole set.
  const selected = useMemo(
    () => selectedInvoices ?? invoices.filter(inv => selectedIds.includes(inv.id)),
    [selectedInvoices, invoices, selectedIds],
  );

  if (loading) {
    return (
      <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }} data-testid={`${idPrefix}-loading`}>
        {ui('loading')}
      </div>
    );
  }

  // Before the empty state, never after: a failed load must say so instead of borrowing the
  // "nothing to rectify" wording, which asserts something about the data we did not manage to read.
  if (loadError) {
    return (
      <div
        data-testid={`${idPrefix}-error`}
        style={{
          fontSize: 12, lineHeight: 1.4, padding: '10px 12px', borderRadius: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          color: 'hsl(var(--destructive))',
          background: 'var(--status-destructive-bg)',
          border: '0.5px solid hsl(var(--destructive) / 0.3)',
        }}
      >
        <span>{ui('couldNotLoadInvoicesToRectify')}</span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            data-testid={`${idPrefix}-retry`}
            style={{
              flexShrink: 0, fontSize: 12, fontWeight: 500, padding: '3px 10px', borderRadius: 6,
              border: '1px solid hsl(var(--destructive) / 0.4)', background: 'transparent',
              color: 'hsl(var(--destructive))', cursor: 'pointer',
            }}
          >
            {ui('retry')}
          </button>
        )}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div
        data-testid={`${idPrefix}-empty`}
        style={{
          fontSize: 12, lineHeight: 1.4, padding: '10px 12px', borderRadius: 6,
          color: 'var(--status-warning-fg)',
          background: 'var(--status-warning-bg)',
          border: '0.5px solid var(--status-warning-border)',
        }}
      >
        {ui('noInvoicesToRectify')}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'hsl(var(--muted-foreground))' }}>
          {ui('invoiceToRectifyLabel')}
        </span>
        {selected.length > 0 && (
          <span data-testid={`${idPrefix}-selected-count`} style={{ fontSize: 11, color: 'var(--status-info-fg)', fontWeight: 500 }}>
            {ui('rectifySelectedCount', { count: selected.length })}
          </span>
        )}
      </div>

      {selected.length === 0 ? (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          data-testid={`${idPrefix}-open`}
          style={{
            width: '100%', textAlign: 'left', fontSize: 12, padding: '9px 11px', borderRadius: 6,
            border: '1px dashed hsl(var(--border-subtle))', background: 'hsl(var(--card))',
            color: 'hsl(var(--muted-foreground))', cursor: 'pointer',
          }}
        >
          {ui('rectifySelectInvoices')}
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {selected.map(inv => (
            <div
              key={inv.id}
              data-testid={`${idPrefix}-selected-${inv.id}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6,
                border: '1px solid var(--status-info-border)', background: 'var(--status-info-bg)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'hsl(var(--foreground))' }}>{inv.documentNo}</div>
                <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {invoiceMeta(inv)}
                </div>
              </div>
              {invoiceAmount(inv) && (
                <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', flexShrink: 0 }}>{invoiceAmount(inv)}</span>
              )}
              <button
                type="button"
                onClick={() => onToggle(inv.id)}
                aria-label={ui('remove')}
                data-testid={`${idPrefix}-remove-${inv.id}`}
                style={{
                  flexShrink: 0, border: 'none', background: 'transparent', cursor: 'pointer',
                  color: 'hsl(var(--muted-foreground))', fontSize: 16, lineHeight: 1, padding: '0 2px',
                }}
              >
                &times;
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            data-testid={`${idPrefix}-open`}
            style={{
              alignSelf: 'flex-start', fontSize: 12, fontWeight: 500, padding: '4px 0',
              border: 'none', background: 'transparent', color: 'var(--status-info-fg)', cursor: 'pointer',
            }}
          >
            {ui('rectifyChangeSelection')}
          </button>
        </div>
      )}

      {pickerOpen && (
        <RectifiableInvoicePickerModal
          invoices={invoices}
          selectedIds={selectedIds}
          onApply={(ids) => { onApply(ids); setPickerOpen(false); }}
          onClose={() => setPickerOpen(false)}
          idPrefix={idPrefix}
          search={search}
          onSearchChange={onSearchChange}
          onReachBottom={onReachBottom}
          loadingMore={loadingMore}
          data-testid="RectifiableInvoicePickerModal__43f26f" />
      )}
    </div>
  );
}

// ── Picker modal ──────────────────────────────────────────────────────────────
//
// Thin wrapper over the shared InvoicePickerModal — the very list the
// "Rectificaciones" tab of the invoice window uses, in multi-select mode. Kept as a named export
// so the return-document flow imports one name, but there is deliberately no second picker
// implementation to drift from the first.

/**
 * Searchable multi-select list of invoices, opened from {@link RectifiableInvoiceField}.
 *
 * Holds its own draft selection so Cancel really discards — committing straight to the parent on
 * every click would make the Cancel button a lie.
 *
 * <p>zIndex 60: above the host modal (the app's modal tier is 50) but below the walkthrough
 * overlay at 70, which ETP-5108 established must stay on top.
 */
export function RectifiableInvoicePickerModal({
  invoices, selectedIds, onApply, onClose, idPrefix = 'rectify',
  search, onSearchChange, onReachBottom, loadingMore,
}) {
  return createPortal(
    // Title is deliberately NOT overridden: this has to read as the very same picker the
    // Rectificaciones tab shows, so the only visible difference is the checkbox `multiple` adds.
    // Passing a custom title made it look like a second, unrelated dialog.
    <InvoicePickerModal
      invoices={invoices}
      multiple
      selectedIds={selectedIds}
      onApply={onApply}
      onClose={onClose}
      idPrefix={idPrefix}
      // Server-driven: the hook owns the window and the search, so the modal renders the batch it
      // is handed and asks for the next one on scroll. Passing onSearchChange is what switches it
      // out of local filtering — critical here, because a local filter over one batch would claim
      // "no matches" for an invoice the server has but has not sent yet.
      search={search}
      onSearchChange={onSearchChange}
      onReachBottom={onReachBottom}
      loadingMore={loadingMore}
      // Above the host modal (the app's modal tier is 50) but below the walkthrough overlay at 70,
      // which ETP-5108 established must stay on top.
      zIndex={60}
      data-testid="InvoicePickerModal__43f26f" />,
    document.body,
  );
}
