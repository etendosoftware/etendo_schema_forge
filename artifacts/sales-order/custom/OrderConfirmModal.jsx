import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Truck, FileText } from 'lucide-react';
import { useUI } from '@/i18n';

/**
 * Confirmation modal for Sales Order.
 *
 * Flow:
 *  1. Modal opens with two optional checkboxes: shipment and/or invoice.
 *  2. On confirm: DocAction=CO (always) → create shipment (if checked) → create invoice (if checked).
 *  3. Shipment and invoice are independent — invoice uses order quantities regardless of shipment state.
 *  4. Shows success state with navigation to created documents.
 */
export default function OrderConfirmModal({
  orderId,
  data,
  token,
  apiBaseUrl,
  onClose,
}) {
  const ui = useUI();
  const navigate = useNavigate();
  const alreadyConfirmed = data?.documentStatus === 'CO';
  const [createShipment, setCreateShipment] = useState(false);
  const [createInvoice,  setCreateInvoice]  = useState(false);
  const [orderProcessed, setOrderProcessed] = useState(alreadyConfirmed);
  const [loading,        setLoading]        = useState(false);
  const [createdDocs,    setCreatedDocs]    = useState(null); // { shipment?, invoice? }
  const [error,          setError]          = useState(null);
  const [lineCount,      setLineCount]      = useState(null);
  const [freshData,      setFreshData]      = useState(null);
  const [needsReload,    setNeedsReload]    = useState(false);

  const orderUrl = `${apiBaseUrl}/header`;
  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);

  const fmtNum = (v) =>
    v != null && v !== ''
      ? Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '-';

  // Fetch fresh record + line count on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [recRes, linesRes] = await Promise.all([
          fetch(`${orderUrl}/${orderId}`, { headers }),
          fetch(`${apiBaseUrl}/lines?parentId=${orderId}&_startRow=0&_endRow=999`, { headers }),
        ]);
        if (cancelled) return;
        if (recRes.ok) {
          const recJson = await recRes.json();
          const rec = recJson?.response?.data?.[0] ?? recJson;
          setFreshData(rec);
        }
        if (linesRes.ok) {
          const linesJson = await linesRes.json();
          setLineCount(linesJson?.response?.data?.length ?? 0);
        }
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [orderId, orderUrl, apiBaseUrl, headers]);

  const d              = freshData || data || {};
  const documentNo     = d.documentNo || '';
  const bpName         = d['businessPartner$_identifier'] || '';
  // Apply etgoTotalDiscount client-side only while the order is still in DR — at
  // that point TotalDiscountService has not yet materialized the ETGO_DTO line, so
  // the server totals are pre-discount and we show the user what the totals WILL be
  // once the order is completed. After CO the totals already reflect the discount.
  const discountPct    = Number(d.etgoTotalDiscount ?? 0);
  const isPreCompletion = d.documentStatus === 'DR';
  const discountFactor = (isPreCompletion && discountPct > 0) ? (1 - discountPct / 100) : 1;
  // Same accounting rule as DocumentTotalsPanel: the displayed total must equal
  // round(net × factor) + round(tax × factor), not round(gross × factor).
  // Avoids the 1-cent double-rounding drift versus the order's right panel and
  // the printed invoice (AEAT/Modelo 303 rule "base + IVA = total").
  const round2        = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const grossBase     = Number(d.grandTotalAmount ?? d.grandTotal ?? 0) || 0;
  const netBase       = Number(d.summedLineAmount ?? d.totalLines ?? grossBase) || 0;
  const totalLines    = round2(netBase * discountFactor);
  const grandTotal    = totalLines + round2((grossBase - netBase) * discountFactor);
  const currency       = d['currency$_identifier'] || '';

  const handleConfirm = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      // Step 1: Confirm the order (always)
      if (!orderProcessed) {
        const processRes = await fetch(
          `${orderUrl}/${orderId}/action/DocAction`,
          { method: 'POST', headers, body: JSON.stringify({ action: 'CO' }) },
        );
        if (!processRes.ok) {
          const err = await processRes.json().catch(() => null);
          const rawMsg = err?.response?.message || err?.message || `Process failed (${processRes.status})`;
          throw new Error(rawMsg.includes('@OrderWithoutLines@') ? ui('soNoLinesError') : rawMsg);
        }
        setOrderProcessed(true);
        setNeedsReload(true);
      }

      // If no docs selected, just confirm and close
      if (!createShipment && !createInvoice) {
        onClose();
        window.location.reload();
        return;
      }

      const result = {};

      // Step 2: Create shipment if checked
      if (createShipment) {
        const res = await fetch(
          `${orderUrl}/${orderId}/action/createShipment`,
          { method: 'POST', headers, body: JSON.stringify({}) },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(
            ui('soOrderConfirmedShipmentError')
            + (err?.error?.message || err?.response?.message || err?.message || `Error (${res.status})`),
          );
        }
        const json = await res.json();
        const shipment = json?.response?.data;
        result.shipment = {
          id:         shipment?.id ?? null,
          documentNo: shipment?.documentNo || '',
          total:      shipment?.grandTotal != null ? `${fmtNum(shipment.grandTotal)} ${currency}`.trim() : '',
        };
      }

      // Step 3: Create invoice if checked.
      // Uses order quantities (ordered - already invoiced), independent of the shipment above.
      if (createInvoice) {
        const res = await fetch(
          `${orderUrl}/${orderId}/action/createDraftInvoice`,
          { method: 'POST', headers, body: JSON.stringify({}) },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(
            ui('soOrderConfirmedInvoiceError')
            + (err?.error?.message || err?.response?.message || err?.message || `Error (${res.status})`),
          );
        }
        const json = await res.json();
        const invoice = json?.response?.data;
        result.invoice = {
          id:         invoice?.id ?? null,
          documentNo: invoice?.documentNo || '',
          total:      invoice?.grandTotal != null ? `${fmtNum(invoice.grandTotal)} ${currency}`.trim() : '',
        };
      }

      setCreatedDocs(result);
    } catch (err) {
      setError(err.message || ui('soErrorOccurred'));
    } finally {
      setLoading(false);
    }
  };

  // Dynamic button label based on checkbox state
  const primaryLabel = (() => {
    if (createShipment && createInvoice) return ui('soConfirmActionBoth');
    if (createShipment)                  return ui('soConfirmActionShipment');
    if (createInvoice)                   return ui('soConfirmActionInvoice');
    return ui('soConfirmActionOnly');
  })();

  const handleGoToInvoice = () => {
    if (!createdDocs?.invoice?.id) { handleCloseAfterCreate(); return; }
    onClose();
    navigate(`/sales-invoice/${createdDocs.invoice.id}`);
  };

  const handleGoToShipment = () => {
    if (!createdDocs?.shipment?.id) { handleCloseAfterCreate(); return; }
    onClose();
    navigate(`/goods-shipment/${createdDocs.shipment.id}`);
  };

  const handleCloseAfterCreate = () => {
    onClose();
    window.location.reload();
  };

  const handleClose = () => {
    onClose();
    if (needsReload) window.location.reload();
  };

  // ── Success state ──────────────────────────────────────────
  if (createdDocs) {
    const { shipment, invoice } = createdDocs;
    const both = !!(shipment && invoice);
    const statusLabel = ui('statusDraft');

    return (
      <div style={overlayStyle}>
        <div onClick={e => e.stopPropagation()} style={{ ...cardStyle, width: 400 }}>
          <div style={{ padding: '28px 24px', textAlign: 'center' }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%', margin: '0 auto 14px',
              background: '#ECFDF5',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div style={{ fontSize: 15, fontWeight: 500, color: '#111827' }}>
              {both ? ui('soBothCreated') : (shipment ? ui('soShipmentCreated') : ui('soInvoiceCreated'))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
              {shipment && (
                <DocPill
                  label={ui('shipmentDoc', { number: shipment.documentNo })}
                  total={shipment.total}
                  statusLabel={statusLabel}
                />
              )}
              {invoice && (
                <DocPill
                  label={ui('invoiceDoc', { number: invoice.documentNo })}
                  total={invoice.total}
                  statusLabel={statusLabel}
                />
              )}
            </div>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8,
            padding: '12px 16px', borderTop: '0.5px solid #E5E7EB',
          }}>
            <button type="button" onClick={handleCloseAfterCreate} style={btnSecondary}>
              {ui('soClose')}
            </button>
            {/* When both: show shipment as secondary, invoice as primary */}
            {both && shipment?.id && (
              <button type="button" onClick={handleGoToShipment} style={btnSecondary}>
                {ui('soViewShipment')} →
              </button>
            )}
            {invoice?.id && (
              <button type="button" onClick={handleGoToInvoice} style={btnPrimary}>
                {ui('soViewInvoice')} →
              </button>
            )}
            {!invoice?.id && shipment?.id && (
              <button type="button" onClick={handleGoToShipment} style={btnPrimary}>
                {ui('soViewShipment')} →
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Selection state ────────────────────────────────────────
  return (
    <div onClick={handleClose} style={overlayStyle}>
      <div onClick={e => e.stopPropagation()} style={cardStyle}>

        {/* Header — blue card */}
        <div style={{ padding: '14px 16px 0', position: 'relative' }}>
          <button
            type="button"
            onClick={handleClose}
            style={{
              position: 'absolute', top: 10, right: 12,
              fontSize: 18, lineHeight: 1, padding: '2px 6px', borderRadius: 4,
              background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF',
            }}
          >
            &times;
          </button>
          <div style={{ fontSize: 10, color: '#9CA3AF', letterSpacing: '0.04em', marginBottom: 8 }}>
            {ui('salesOrderRef')}{documentNo}
          </div>
          <div style={{
            background: '#E6F1FB', border: '0.5px solid #B5D4F4', borderRadius: 10,
            padding: '14px 16px', marginBottom: 14,
          }}>
            <div style={{ fontSize: 11, color: '#185FA5' }}>
              {bpName}
            </div>
            <div style={{ fontSize: 28, fontWeight: 500, color: '#042C53', lineHeight: 1, marginTop: 4, marginBottom: 6 }}>
              {fmtNum(grandTotal)}{currency ? ` ${currency}` : ''}
            </div>
            <div style={{ fontSize: 11, color: '#185FA5' }}>
              {lineCount != null ? ui('soLines', { count: lineCount }) : '...'}
              {' '}<span style={{ color: '#85B7EB' }}>·</span>{' '}
              {ui('soSubtotal')}{' '}
              <span style={{ fontWeight: 500, color: '#042C53' }}>
                {fmtNum(totalLines)}{currency ? ` ${currency}` : ''}
              </span>
            </div>
          </div>
        </div>

        {/* Checkboxes — both optional, both can be selected simultaneously */}
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, borderBottom: '0.5px solid #E5E7EB' }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', marginBottom: 2 }}>
            {ui('soGenerateDocs')}
          </div>
          <CheckboxCard
            checked={createShipment}
            onChange={() => setCreateShipment(v => !v)}
            icon={<Truck size={16} />}
            title={ui('soCreateShipmentTitle')}
            subtitle={ui('soCreateShipmentCheckDesc')}
          />
          <CheckboxCard
            checked={createInvoice}
            onChange={() => setCreateInvoice(v => !v)}
            icon={<FileText size={16} />}
            title={ui('soCreateInvoiceTitle')}
            subtitle={ui('soCreateInvoiceCheckDesc')}
          />
        </div>

        {/* Error */}
        {error && (
          <div style={{ padding: '8px 16px', fontSize: 12, color: '#DC2626', background: '#FEF2F2', borderTop: '0.5px solid #FECACA' }}>
            {error}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '12px 16px' }}>
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            style={{ ...btnSecondary, opacity: loading ? 0.5 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {ui('cancel')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            style={{
              ...btnPrimary,
              opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            {loading && (
              <svg style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            )}
            {loading ? ui('soProcessing') : primaryLabel}
          </button>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    </div>
  );
}

/* ── Checkbox card ─────────────────────────────────────────────── */

function CheckboxCard({ checked, onChange, icon, title, subtitle }) {
  return (
    <div
      onClick={onChange}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        border: checked ? '2px solid #3B82F6' : '0.5px solid #E5E7EB',
        borderRadius: 8, padding: checked ? '11px 13px' : '12px 14px',
        cursor: 'pointer',
        background: checked ? '#EFF6FF' : '#fff',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 6, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: checked ? '#fff' : '#F3F4F6',
        color: checked ? '#2563EB' : '#6B7280',
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: checked ? '#2563EB' : '#111827' }}>
          {title}
        </div>
        <div style={{ fontSize: 12, color: '#6B7280', marginTop: 3, lineHeight: 1.4 }}>
          {subtitle}
        </div>
      </div>
      {/* Checkbox indicator (square, not circle) */}
      <div style={{
        width: 18, height: 18, borderRadius: 4, flexShrink: 0,
        border: checked ? 'none' : '1.5px solid #D1D5DB',
        background: checked ? '#3B82F6' : '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.15s',
      }}>
        {checked && (
          <svg width="11" height="9" viewBox="0 0 11 9" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 4 7.5 10 1" />
          </svg>
        )}
      </div>
    </div>
  );
}

/* ── Doc pill ─────────────────────────────────────────────────── */

function DocPill({ label, total, statusLabel }) {
  return (
    <div style={{ fontSize: 12, color: '#6B7280', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span>{label}</span>
      {total && (
        <><span style={{ color: '#D1D5DB' }}>·</span><span>{total}</span></>
      )}
      <span style={{
        fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 99,
        background: '#FEF3C7', color: '#92400E',
      }}>
        {statusLabel}
      </span>
    </div>
  );
}

/* ── Shared styles ─────────────────────────────────────────────── */

const overlayStyle = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  backgroundColor: 'rgba(0,0,0,0.3)',
};

const cardStyle = {
  width: 480, maxHeight: '85vh', display: 'flex', flexDirection: 'column',
  overflow: 'hidden', borderRadius: 12, backgroundColor: '#fff',
  boxShadow: '0 8px 30px rgba(0,0,0,0.12)', border: '0.5px solid #E5E7EB',
};

const btnSecondary = {
  fontSize: 12, padding: '7px 14px', borderRadius: 6,
  border: '1px solid #D1D5DB', background: 'transparent', color: '#6B7280', cursor: 'pointer',
};

const btnPrimary = {
  fontSize: 12, fontWeight: 500, padding: '7px 16px', borderRadius: 6,
  border: 'none', background: '#185FA5', color: '#fff', cursor: 'pointer',
};
