import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useUI } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { overlayStyle, cardStyle, btnPrimaryStyle, btnSecondaryStyle, closeBtnStyle, Spinner } from './ConfirmDocumentModal';
import { usePriceListPicker, PriceListSelectField } from './PriceListPicker';

import { authHeaders } from '@/auth/api.js';
/**
 * Generic "Create Invoice" confirmation modal — used by both goods-shipment and
 * goods-receipt. Shows a summary card and a checkbox before executing the action.
 *
 * Props:
 *   data             — header record data (documentNo, businessPartner$_identifier, etc.)
 *   loading          — external loading state (parent sets while API call is in flight)
 *   pendingQtyUrl    — optional URL to fetch { response: { data: [{ pendingQty }] } }
 *                      to display the pending units subtitle. Omit for a generic subtitle.
 *   onConfirm        — called with the selected price list ID when the user clicks Confirm
 *                      (checkbox must be checked, and — when showPriceListPicker is true —
 *                      a price list must be selected)
 *   onClose          — called to dismiss without confirming
 *   showPriceListPicker — ETP-4028: shipments/receipts carry no price list of their own —
 *                      when true, shows a required Tarifa selector so the user explicitly
 *                      picks the price list applied to every line of the generated invoice.
 *                      Currency is always inherited from the shipment/receipt (read-only,
 *                      shown in the summary card above) — never chosen here.
 *   isSOTrx          — sales (true) vs purchase (false) price lists offered by the picker
 *   apiBaseUrl       — required when showPriceListPicker is true, to fetch price lists
 *   token            — auth bearer token, required for the pendingQtyUrl and price-list fetches
 */
export default function CreateInvoiceConfirmModal({
  data,
  loading,
  pendingQtyUrl,
  onConfirm,
  onClose,
  showPriceListPicker = false,
  isSOTrx = true,
  apiBaseUrl,
  token,
}) {
  const ui = useUI();
  const [checked, setChecked] = useState(true);
  const [pendingQty, setPendingQty] = useState(null);

  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const priceListHeaders = useMemo(() => (authHeaders(token)), [token]);
  const { priceLists, priceListId, setPriceListId, loading: loadingPriceLists } = usePriceListPicker({
    enabled: showPriceListPicker,
    isSOTrx,
    base,
    headers: priceListHeaders,
  });

  const documentNo  = data?.documentNo || '';
  const bpName      = data?.['businessPartner$_identifier'] || '';
  const linkedOrder = Array.isArray(data?.linkedOrders) ? data.linkedOrders[0] : null;
  // The document's own currency wins — it may have been edited in draft to diverge
  // from the linked order's currency (ETP-4028: currency is editable until confirmed).
  const currency    = data?.['etgoCurrency$_identifier'] || data?.['currency$_identifier']
    || linkedOrder?.['currency$_identifier'] || '';
  const currencyCode = currency;
  const grandTotal  = Number(linkedOrder?.grandTotalAmount ?? data?.grandTotalAmount ?? 0);

  const fmtNum = (v, dec = 2) =>
    v != null ? Number(v).toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: true }) : '-';

  const formattedTotal = currencyCode ? formatCurrency(currencyCode, grandTotal) : fmtNum(grandTotal);
  const displayAmount = grandTotal > 0 ? formattedTotal : documentNo;

  useEffect(() => {
    if (!pendingQtyUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(pendingQtyUrl, { headers: authHeaders(token) });
        if (!res.ok || cancelled) return;
        const lines = (await res.json())?.response?.data || [];
        const total = lines.reduce((sum, l) => sum + Number(l.pendingQty || 0), 0);
        if (!cancelled) setPendingQty(total);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [pendingQtyUrl, token]);

  const subtitle = pendingQty != null
    ? ui('soAmountPendingInvoice', { pending: `${fmtNum(pendingQty, 0)} ${ui('units')}` })
    : ui('soCreateInvoiceCheckDesc');

  const canConfirm = checked && (!showPriceListPicker || !!priceListId);

  return createPortal(
    <div data-testid="create-invoice-confirm-modal" onClick={onClose} style={overlayStyle}>
      <div onClick={e => e.stopPropagation()} style={{ ...cardStyle, width: 460 }}>

        <div style={{ padding: '16px 20px 14px', borderBottom: '0.5px solid hsl(var(--border-subtle))', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'hsl(var(--foreground))' }}>
            {ui('soManageDocsTitle')}
          </div>
          <button type="button" onClick={onClose} style={closeBtnStyle}>&times;</button>
        </div>

        <div style={{ padding: '14px 20px' }}>
          <div style={{ background: 'var(--status-info-bg)', border: '0.5px solid var(--status-info-border)', borderRadius: 10, padding: '14px 16px' }}>
            {bpName && <div style={{ fontSize: 11, color: 'var(--status-info-fg)' }}>{bpName}</div>}
            <div style={{ fontSize: 28, fontWeight: 500, color: 'var(--status-info-fg)', lineHeight: 1, marginTop: 4 }}>
              {displayAmount}
            </div>
          </div>
        </div>

        {showPriceListPicker && (
          <div style={{ padding: '0 20px 14px' }}>
            <PriceListSelectField
              priceLists={priceLists}
              priceListId={priceListId}
              onChange={setPriceListId}
              loading={loadingPriceLists}
              idPrefix="invoice-confirm-price-list"
              data-testid="invoice-confirm-price-list-field" />
          </div>
        )}

        <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'hsl(var(--muted-foreground))', marginBottom: 2 }}>
            {ui('soGenerateDocs')}
          </div>
          <div
            onClick={() => setChecked(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: checked ? '11px 13px' : '12px 14px', borderRadius: 8, cursor: 'pointer',
              border: checked ? '2px solid var(--status-info-fg)' : '1px solid hsl(var(--border-subtle))',
              background: checked ? 'var(--status-info-bg)' : 'hsl(var(--card))',
              transition: 'border-color 0.15s, background 0.15s',
            }}
          >
            <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>🧾</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: checked ? 'var(--status-info-fg)' : 'hsl(var(--foreground))' }}>
                {ui('soCreateInvoiceTitle')}
              </div>
              <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 3, lineHeight: 1.4 }}>
                {subtitle}
              </div>
            </div>
            <div style={{
              width: 18, height: 18, borderRadius: 4, flexShrink: 0,
              border: checked ? 'none' : '1.5px solid hsl(var(--text-disabled))',
              background: checked ? 'var(--status-info-fg)' : 'hsl(var(--card))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {checked && (
                <svg width="11" height="9" viewBox="0 0 11 9" fill="none" stroke="hsl(var(--card))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 4 7.5 10 1" />
                </svg>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '0.5px solid hsl(var(--border-subtle))' }}>
          <button type="button" onClick={onClose} disabled={loading} style={{ ...btnSecondaryStyle, opacity: loading ? 0.5 : 1 }}>
            {ui('cancel')}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(priceListId)}
            disabled={loading || !canConfirm}
            style={{ ...btnPrimaryStyle, opacity: (loading || !canConfirm) ? 0.6 : 1, cursor: (loading || !canConfirm) ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {loading && <Spinner data-testid="Spinner__e6fb8b" />}
            {loading ? ui('soProcessing') : ui('soCreateDocsBtn')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
