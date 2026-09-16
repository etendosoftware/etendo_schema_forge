import { useState, useEffect, useCallback } from 'react';
import { useUI } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import { useApiFetch } from '@/auth/useApiFetch.js';

/**
 * ETP-5381 — picker for the invoice(s) a rectificative invoice will rectify.
 *
 * A rectificative invoice cannot be confirmed without at least one rectified invoice: the
 * ETSG_CHECK_RECTIF_INV_DOC validation rejects a rectificative document type with no rows in
 * C_Invoice_Reverse. Since return-document invoices are now created AND confirmed in one step,
 * the choice has to be made up front — hence this picker, shown in both entry points (confirming
 * the return document with the invoice option ticked, and the "create rectificative invoice"
 * button on an already-confirmed return document).
 *
 * Multiple invoices can be selected: C_Invoice_Reverse is a 1:N bridge table and a single return
 * can legitimately correct more than one original invoice.
 */

/**
 * Loads the invoices this return document can rectify.
 *
 * @param enabled  when false, nothing is fetched and the hook reports a neutral state
 * @param url      action URL (POST) returning { response: { data: { invoices, suggestedInvoiceId } } }
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
        // Preselect what the backend would have chosen on its own, so confirming without
        // touching the picker produces exactly the same link the server would have made.
        const suggested = data?.suggestedInvoiceId;
        if (suggested && list.some(inv => inv.id === suggested)) {
          setSelectedIds([suggested]);
        }
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
    loading,
    // True only once we know there is genuinely nothing to rectify.
    isEmpty: loaded && invoices.length === 0,
    // The gate the confirm button uses.
    isSatisfied: !enabled || selectedIds.length > 0,
  };
}

const rowStyle = (selected) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 10px',
  borderRadius: 6,
  cursor: 'pointer',
  border: selected ? '1.5px solid var(--status-info-fg)' : '1px solid hsl(var(--border-subtle))',
  background: selected ? 'var(--status-info-bg)' : 'hsl(var(--card))',
});

/**
 * Renders the list of rectifiable invoices with checkboxes.
 *
 * When the list is empty this renders the reason instead, so the caller can disable its confirm
 * action and the user understands why rather than facing a silently dead button.
 */
export function RectifiableInvoiceField({ invoices, selectedIds, onToggle, loading, isEmpty, idPrefix = 'rectify' }) {
  const ui = useUI();

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
      <div style={{ fontSize: 12, fontWeight: 500, color: 'hsl(var(--muted-foreground))' }}>
        {ui('invoiceToRectifyLabel')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 190, overflowY: 'auto' }}>
        {invoices.map(inv => {
          const selected = selectedIds.includes(inv.id);
          return (
            <div
              key={inv.id}
              onClick={() => onToggle(inv.id)}
              data-testid={`${idPrefix}-option-${inv.id}`}
              data-selected={selected ? 'true' : 'false'}
              style={rowStyle(selected)}
            >
              <div style={{
                width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                border: selected ? 'none' : '1.5px solid hsl(var(--text-disabled))',
                background: selected ? 'var(--status-info-fg)' : 'hsl(var(--card))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {selected && (
                  <svg width="10" height="8" viewBox="0 0 11 9" fill="none" stroke="hsl(var(--card))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="1 4 4 7.5 10 1" />
                  </svg>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'hsl(var(--foreground))' }}>
                  {inv.documentNo}
                </div>
                {inv.invoiceDate && (
                  <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>
                    {formatCalendarDate(inv.invoiceDate)}
                  </div>
                )}
              </div>
              {inv.grandTotalAmount != null && (
                <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', flexShrink: 0 }}>
                  {inv.currency ? formatCurrency(inv.currency, inv.grandTotalAmount) : inv.grandTotalAmount}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
