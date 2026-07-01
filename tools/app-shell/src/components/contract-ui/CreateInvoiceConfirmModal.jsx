import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useUI } from '@/i18n';
import { overlayStyle, cardStyle, btnPrimaryStyle, btnSecondaryStyle, closeBtnStyle, Spinner } from './ConfirmDocumentModal';

/**
 * Generic "Create Invoice" confirmation modal — used by both goods-shipment and
 * goods-receipt. Shows a summary card and a checkbox before executing the action.
 *
 * Props:
 *   data             — header record data (documentNo, businessPartner$_identifier, etc.)
 *   loading          — external loading state (parent sets while API call is in flight)
 *   pendingQtyUrl    — optional URL to fetch { response: { data: [{ pendingQty }] } }
 *                      to display the pending units subtitle. Omit for a generic subtitle.
 *   onConfirm        — called when user clicks Confirm (checkbox must be checked)
 *   onClose          — called to dismiss without confirming
 */
export default function CreateInvoiceConfirmModal({
  data,
  loading,
  pendingQtyUrl,
  onConfirm,
  onClose,
}) {
  const ui = useUI();
  const [checked, setChecked] = useState(true);
  const [pendingQty, setPendingQty] = useState(null);

  const documentNo  = data?.documentNo || '';
  const bpName      = data?.['businessPartner$_identifier'] || '';
  const linkedOrder = Array.isArray(data?.linkedOrders) ? data.linkedOrders[0] : null;
  const currency    = linkedOrder?.['currency$_identifier'] || data?.['currency$_identifier'] || '';
  const grandTotal  = Number(linkedOrder?.grandTotalAmount ?? data?.grandTotalAmount ?? 0);

  const fmtNum = (v, dec = 2) =>
    v != null ? Number(v).toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec }) : '-';

  const formattedTotal = currency ? `${fmtNum(grandTotal)} ${currency}` : fmtNum(grandTotal);
  const displayAmount = grandTotal > 0 ? formattedTotal : documentNo;

  useEffect(() => {
    if (!pendingQtyUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(pendingQtyUrl);
        if (!res.ok || cancelled) return;
        const lines = (await res.json())?.response?.data || [];
        const total = lines.reduce((sum, l) => sum + Number(l.pendingQty || 0), 0);
        if (!cancelled) setPendingQty(total);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [pendingQtyUrl]);

  const subtitle = pendingQty != null
    ? ui('soAmountPendingInvoice', { pending: `${fmtNum(pendingQty, 0)} ${ui('units')}` })
    : ui('soCreateInvoiceCheckDesc');

  return createPortal(
    <div data-testid="create-invoice-confirm-modal" onClick={onClose} style={overlayStyle}>
      <div onClick={e => e.stopPropagation()} style={{ ...cardStyle, width: 460 }}>

        <div style={{ padding: '16px 20px 14px', borderBottom: '0.5px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>
            {ui('soManageDocsTitle')}
          </div>
          <button type="button" onClick={onClose} style={closeBtnStyle}>&times;</button>
        </div>

        <div style={{ padding: '14px 20px' }}>
          <div style={{ background: '#E6F1FB', border: '0.5px solid #B5D4F4', borderRadius: 10, padding: '14px 16px' }}>
            {bpName && <div style={{ fontSize: 11, color: '#185FA5' }}>{bpName}</div>}
            <div style={{ fontSize: 28, fontWeight: 500, color: '#042C53', lineHeight: 1, marginTop: 4 }}>
              {displayAmount}
            </div>
          </div>
        </div>

        <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', marginBottom: 2 }}>
            {ui('soGenerateDocs')}
          </div>
          <div
            onClick={() => setChecked(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: checked ? '11px 13px' : '12px 14px', borderRadius: 8, cursor: 'pointer',
              border: checked ? '2px solid #3B82F6' : '1px solid #E5E7EB',
              background: checked ? '#EFF6FF' : '#fff',
              transition: 'border-color 0.15s, background 0.15s',
            }}
          >
            <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>🧾</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: checked ? '#2563EB' : '#111827' }}>
                {ui('soCreateInvoiceTitle')}
              </div>
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 3, lineHeight: 1.4 }}>
                {subtitle}
              </div>
            </div>
            <div style={{
              width: 18, height: 18, borderRadius: 4, flexShrink: 0,
              border: checked ? 'none' : '1.5px solid #D1D5DB',
              background: checked ? '#3B82F6' : '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {checked && (
                <svg width="11" height="9" viewBox="0 0 11 9" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 4 7.5 10 1" />
                </svg>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '0.5px solid #E5E7EB' }}>
          <button type="button" onClick={onClose} disabled={loading} style={{ ...btnSecondaryStyle, opacity: loading ? 0.5 : 1 }}>
            {ui('cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading || !checked}
            style={{ ...btnPrimaryStyle, opacity: (loading || !checked) ? 0.6 : 1, cursor: (loading || !checked) ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
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
