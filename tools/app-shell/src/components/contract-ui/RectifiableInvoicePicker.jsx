import { useState, useEffect, useCallback, useMemo } from 'react';
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
 * rows as `suggested` so they sort first and come preselected, but detection cannot be a
 * restriction: a return created standalone has no chain at all, and a return covering two
 * shipments billed on two invoices has to name both.
 *
 * <p>The browsing list lives in its own modal rather than inline: the host modal already carries a
 * summary card, an optional tariff selector and the generate-documents block, and an embedded
 * scrolling list of every invoice in the system pushed its actions below the fold. The field below
 * shows only what is selected; picking happens in {@link RectifiableInvoicePickerModal}.
 */

/**
 * Loads the invoices this return document can rectify.
 *
 * @param enabled  when false, nothing is fetched and the hook reports a neutral state
 * @param url      action URL (POST) returning
 *                 { response: { data: { invoices, suggestedInvoiceIds } } }
 * @param token    auth bearer token
 */
export function useRectifiableInvoices({ enabled, url, token }) {
  const apiFetch = useApiFetch();
  const [invoices, setInvoices] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(false);
  // Distinguishes "we asked and there are none" from "we have not asked yet". Without it the
  // caller cannot tell an empty list apart from a pending fetch, and would disable the confirm
  // button during the round-trip as if nothing were rectifiable.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled || !url) return undefined;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await apiFetch(url, { method: 'POST', body: JSON.stringify({}), baseUrl: '', token });
        if (!res.ok || cancelled) return;
        const data = (await res.json())?.response?.data;
        if (cancelled) return;
        const list = Array.isArray(data?.invoices) ? data.invoices : [];
        setInvoices(list);
        // Preselect every chain-detected invoice, not just one: a return covering two invoiced
        // shipments must rectify both, and making the user re-find the second by hand is the
        // friction this picker exists to remove.
        const suggested = Array.isArray(data?.suggestedInvoiceIds) ? data.suggestedInvoiceIds : [];
        const valid = suggested.filter(id => list.some(inv => inv.id === id));
        if (valid.length > 0) setSelectedIds(valid);
      } catch {
        // Leave the list empty: the confirm button stays disabled with the "nothing to rectify"
        // explanation, which is the safe outcome — better than letting the user submit a request
        // that would be rejected server-side anyway.
      } finally {
        if (!cancelled) {
          setLoading(false);
          setLoaded(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [enabled, url, token, apiFetch]);

  const toggle = useCallback((id) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  }, []);

  return {
    invoices,
    selectedIds,
    toggle,
    setSelectedIds,
    loading,
    // True only once we know there is genuinely nothing to rectify.
    isEmpty: loaded && invoices.length === 0,
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
  invoices, selectedIds, onToggle, onApply, loading, isEmpty, idPrefix = 'rectify',
}) {
  const ui = useUI();
  const [pickerOpen, setPickerOpen] = useState(false);

  const selected = useMemo(
    () => invoices.filter(inv => selectedIds.includes(inv.id)),
    [invoices, selectedIds],
  );

  if (loading) {
    return (
      <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }} data-testid={`${idPrefix}-loading`}>
        {ui('loading')}
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
        />
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
export function RectifiableInvoicePickerModal({ invoices, selectedIds, onApply, onClose, idPrefix = 'rectify' }) {
  return createPortal(
    // Title and page size are deliberately NOT overridden: this has to read as the very same picker
    // the Rectificaciones tab shows, so the only visible difference is the checkbox `multiple` adds.
    // Passing a custom title and a larger maxVisible made it look like a second, unrelated dialog.
    <InvoicePickerModal
      invoices={invoices}
      multiple
      selectedIds={selectedIds}
      onApply={onApply}
      onClose={onClose}
      idPrefix={idPrefix}
      // Above the host modal (the app's modal tier is 50) but below the walkthrough overlay at 70,
      // which ETP-5108 established must stay on top.
      zIndex={60}
    />,
    document.body,
  );
}
