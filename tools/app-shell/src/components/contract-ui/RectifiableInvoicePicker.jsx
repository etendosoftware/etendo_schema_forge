import { useState, useEffect, useCallback, useMemo } from 'react';
import { useUI } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import { useApiFetch } from '@/auth/useApiFetch.js';

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
 * shipments billed on two invoices has to name both. So this is a searchable multi-select, the
 * same shape as the picker in the rectificative-invoice window.
 */

const MAX_VISIBLE = 6;

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
        // friction this list exists to remove.
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
 * Renders a searchable, multi-select list of rectifiable invoices.
 *
 * Selected rows are pinned above the search results, so what is about to be rectified stays
 * visible once the user types a query that no longer matches it.
 */
export function RectifiableInvoiceField({ invoices, selectedIds, onToggle, loading, isEmpty, idPrefix = 'rectify' }) {
  const ui = useUI();
  const [search, setSearch] = useState('');

  const { selected, results, hiddenCount } = useMemo(() => {
    const isSelected = inv => selectedIds.includes(inv.id);
    const pinned = invoices.filter(isSelected);
    let rest = invoices.filter(inv => !isSelected(inv));
    const q = search.trim().toLowerCase();
    if (q) {
      rest = rest.filter(inv =>
        `${inv.documentNo || ''} ${inv.businessPartner || ''}`.toLowerCase().includes(q));
    } else {
      // With no query, lead with what the backend detected from the return's own chain.
      rest = [...rest].sort((a, b) => Number(Boolean(b.suggested)) - Number(Boolean(a.suggested)));
    }
    return {
      selected: pinned,
      results: rest.slice(0, MAX_VISIBLE),
      hiddenCount: Math.max(0, rest.length - MAX_VISIBLE),
    };
  }, [invoices, selectedIds, search]);

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

  const renderRow = (inv) => {
    const isSelected = selectedIds.includes(inv.id);
    return (
      <div
        key={inv.id}
        role="button"
        tabIndex={0}
        onClick={() => onToggle(inv.id)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(inv.id); } }}
        data-testid={`${idPrefix}-option-${inv.id}`}
        data-selected={isSelected ? 'true' : 'false'}
        style={rowStyle(isSelected)}
      >
        <div style={{
          width: 16, height: 16, borderRadius: 4, flexShrink: 0,
          border: isSelected ? 'none' : '1.5px solid hsl(var(--text-disabled))',
          background: isSelected ? 'var(--status-info-fg)' : 'hsl(var(--card))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {isSelected && (
            <svg width="10" height="8" viewBox="0 0 11 9" fill="none" stroke="hsl(var(--card))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 4 7.5 10 1" />
            </svg>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'hsl(var(--foreground))', display: 'flex', alignItems: 'center', gap: 6 }}>
            {inv.documentNo}
            {inv.suggested && (
              <span
                data-testid={`${idPrefix}-suggested-${inv.id}`}
                style={{ fontSize: 9, fontWeight: 500, padding: '1px 6px', borderRadius: 999, background: 'var(--status-info-bg)', color: 'var(--status-info-fg)', whiteSpace: 'nowrap' }}
              >
                {ui('rectifySuggestedBadge')}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {[inv.invoiceDate ? formatCalendarDate(inv.invoiceDate) : null, inv.businessPartner]
              .filter(Boolean).join(' · ')}
          </div>
        </div>
        {inv.grandTotalAmount != null && (
          <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', flexShrink: 0 }}>
            {inv.currency ? formatCurrency(inv.currency, inv.grandTotalAmount) : inv.grandTotalAmount}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'hsl(var(--muted-foreground))' }}>
          {ui('invoiceToRectifyLabel')}
        </span>
        {selectedIds.length > 0 && (
          <span data-testid={`${idPrefix}-selected-count`} style={{ fontSize: 11, color: 'var(--status-info-fg)', fontWeight: 500 }}>
            {ui('rectifySelectedCount', { count: selectedIds.length })}
          </span>
        )}
      </div>

      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={ui('rectifySearchPlaceholder')}
        data-testid={`${idPrefix}-search`}
        style={{
          width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '7px 10px',
          borderRadius: 6, border: '1px solid hsl(var(--border-subtle))',
          background: 'hsl(var(--card))', color: 'hsl(var(--foreground))', outline: 'none',
        }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 230, overflowY: 'auto' }}>
        {selected.map(renderRow)}
        {selected.length > 0 && results.length > 0 && (
          <div style={{ height: 1, background: 'hsl(var(--border-subtle))', margin: '2px 0' }} />
        )}
        {results.map(renderRow)}
        {results.length === 0 && selected.length === 0 && (
          <div data-testid={`${idPrefix}-no-matches`} style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', padding: '6px 2px' }}>
            {ui('rectifyNoMatches')}
          </div>
        )}
        {hiddenCount > 0 && (
          <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', padding: '2px 2px' }}>
            {ui('rectifyMoreHidden', { count: hiddenCount })}
          </div>
        )}
      </div>
    </div>
  );
}
