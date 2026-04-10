import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useUI } from '@/i18n';

// ── Helpers ────────────────────────────────────────────────────────────────────

const CRITERIA = (field, value) =>
  encodeURIComponent(JSON.stringify([{ fieldName: field, operator: 'equals', value }]));

const fmtNum = (v, decimals = 2) =>
  v != null && v !== '' && !isNaN(Number(v))
    ? Number(v).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : '0';

function Spinner() {
  return (
    <>
      <svg style={{ width: 14, height: 14, animation: 'spin 1s linear infinite', flexShrink: 0 }}
        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      </svg>
      <style>{`@keyframes spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }`}</style>
    </>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function OrderCreateInvoice({ data, recordId, token, apiBaseUrl }) {
  const navigate = useNavigate();
  const ui = useUI();
  const [showConfirm,  setShowConfirm]  = useState(false);
  const [showActions,  setShowActions]  = useState(false);
  const [actionsScroll, setActionsScroll] = useState(null); // 'shipment'|'invoice'|null
  const [fetched,      setFetched]      = useState(null);

  const status      = data?.documentStatus;
  const isDraft     = status === 'DR';
  const isCompleted = status === 'CO';

  const base    = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);

  // OrderDraftChips (topbarExtra) dispatches this event when a grouped chip is clicked
  useEffect(() => {
    const handler = (e) => {
      setActionsScroll(e.detail?.scrollTo ?? null);
      setShowActions(true);
    };
    window.addEventListener('sales-order:open-actions-modal', handler);
    return () => window.removeEventListener('sales-order:open-actions-modal', handler);
  }, []);

  useEffect(() => {
    if (!isCompleted || !recordId) return;
    let cancelled = false;

    (async () => {
      try {
        // listInvoices finds ALL invoices via line items (works even when C_Invoice.C_Order_ID is null)
        const [shipRes, linesRes, invRes] = await Promise.all([
          fetch(`${base}/goods-shipment/goodsShipment?criteria=${CRITERIA('salesOrder', recordId)}&_limit=50`, { headers }),
          fetch(`${apiBaseUrl}/lines?parentId=${recordId}&_startRow=0&_endRow=999`, { headers }),
          fetch(`${apiBaseUrl}/header/${recordId}/action/listInvoices`, { headers }),
        ]);
        if (cancelled) return;

        const shipments  = shipRes.ok  ? ((await shipRes.json())?.response?.data  ?? []) : [];
        const orderLines = linesRes.ok ? ((await linesRes.json())?.response?.data ?? []) : [];
        const invoices   = invRes.ok   ? ((await invRes.json())?.response?.data   ?? []) : [];

        // deliveredQuantity and invoicedQuantity are system fields on order lines —
        // Etendo updates them when shipments/invoices are confirmed, so they are
        // the authoritative source. No need to fetch shipment lines separately.
        if (!cancelled) setFetched({ shipments, invoices, orderLines });
      } catch {
        if (!cancelled) setFetched({ shipments: [], invoices: [], orderLines: [] });
      }
    })();

    return () => { cancelled = true; };
  }, [isCompleted, recordId, base, headers, apiBaseUrl]);

  // ── DRAFT ──────────────────────────────────────────────────────────────────
  if (isDraft) {
    return (
      <>
        <button type="button" onClick={() => setShowConfirm(true)} style={btnPrimaryStyle}>
          {ui('soConfirmBtn')}
        </button>
        {showConfirm && createPortal(
          <ConfirmModal
            orderId={recordId}
            data={data}
            apiBaseUrl={apiBaseUrl}
            headers={headers}
            onClose={() => setShowConfirm(false)}
          />,
          document.body,
        )}
      </>
    );
  }

  // ── COMPLETED ──────────────────────────────────────────────────────────────
  if (isCompleted) {
    if (!fetched) {
      return <span style={{ fontSize: 12, color: '#9CA3AF', padding: '4px 8px' }}>…</span>;
    }

    const { shipments, invoices, orderLines } = fetched;

    const shipmentsDraft    = shipments.filter(s => s.documentStatus === 'DR');
    const shipmentsComplete = shipments.filter(s => s.documentStatus === 'CO');
    const invoiceDraft      = invoices.find(i => i.documentStatus === 'DR') ?? null;
    const invoicesComplete  = invoices.filter(i => i.documentStatus === 'CO');

    // deliveredQuantity is a system field on each order line — Etendo updates it
    // when shipments are confirmed. More reliable than summing shipment lines.
    const qtyOrdered   = orderLines.reduce((s, l) => s + (Number(l.orderedQuantity)   || 0), 0);
    const qtyDelivered = orderLines.reduce((s, l) => s + (Number(l.deliveredQuantity) || 0), 0);
    const qtyPending   = Math.max(0, qtyOrdered - qtyDelivered);

    const totalOrder    = Number(data?.grandTotalAmount) || 0;
    const totalInvoiced = invoicesComplete.reduce((s, i) => s + (Number(i.grandTotalAmount) || 0), 0);
    const totalPending  = Math.max(0, totalOrder - totalInvoiced);

    const currency = data?.['currency$_identifier'] || '';

    // Acción pendiente = hay qty/importe pendiente Y no hay borrador cubriendo esa acción
    // (si hay borrador, el chip en topbar ya lo cubre — el botón Gestionar no la incluye)
    const needsShip    = qtyPending > 0 && shipmentsDraft.length === 0;
    const needsInvoice = totalPending > 0 && !invoiceDraft;

    let buttonLabel = null;
    if      (needsShip && needsInvoice) buttonLabel = ui('soManageShipmentAndInvoice');
    else if (needsShip)                 buttonLabel = ui('soManageShipment');
    else if (needsInvoice)              buttonLabel = ui('soManageInvoice');

    const openModal = (scrollTo = null) => {
      setActionsScroll(scrollTo);
      setShowActions(true);
    };

    const derived = {
      shipmentsComplete, invoicesComplete,
      qtyOrdered, qtyDelivered, qtyPending,
      totalOrder, totalInvoiced, totalPending,
      needsShip, needsInvoice,
    };

    return (
      <>
        {/* Main action button — only shown when action is still pending */}
        {buttonLabel && (
          <button type="button" onClick={() => openModal(null)} style={btnPrimaryStyle}>
            {buttonLabel}
          </button>
        )}

        {showActions && createPortal(
          <ActionsModal
            orderId={recordId}
            data={data}
            base={base}
            headers={headers}
            currency={currency}
            derived={derived}
            scrollTo={actionsScroll}
            onClose={() => setShowActions(false)}
          />,
          document.body,
        )}
      </>
    );
  }

  return null;
}

// ── ConfirmModal ───────────────────────────────────────────────────────────────

function ConfirmModal({ orderId, data, apiBaseUrl, headers, onClose }) {
  const navigate  = useNavigate();
  const ui        = useUI();
  const [selected, setSelected] = useState('confirm');

  const CONFIRM_OPTIONS = [
    { value: 'confirm',  icon: '✓',  title: ui('soConfirmOnly'),        subtitle: ui('soConfirmOnlyDesc') },
    { value: 'shipment', icon: '🚚', title: ui('soConfirmWithShipment'), subtitle: ui('soConfirmWithShipmentDesc') },
    { value: 'invoice',  icon: '🧾', title: ui('soConfirmWithInvoice'),  subtitle: ui('soConfirmWithInvoiceDesc') },
  ];
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);

  const d          = data || {};
  const documentNo = d.documentNo || '';
  const bpName     = d['businessPartner$_identifier'] || '';
  const grandTotal = Number(d.grandTotalAmount) || 0;
  const currency   = d['currency$_identifier'] || '';

  const handleConfirm = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const processRes = await fetch(
        `${apiBaseUrl}/header/${orderId}/action/documentAction`,
        { method: 'POST', headers, body: JSON.stringify({ action: 'CO' }) },
      );
      if (!processRes.ok) {
        const e = await processRes.json().catch(() => null);
        throw new Error(e?.response?.message || `Error (${processRes.status})`);
      }

      if (selected === 'shipment') {
        const res = await fetch(`${apiBaseUrl}/header/${orderId}/action/createShipment`,
          { method: 'POST', headers, body: JSON.stringify({}) });
        if (!res.ok) {
          const e = await res.json().catch(() => null);
          throw new Error(ui('soOrderConfirmedShipmentError') + (e?.response?.message || `Error (${res.status})`));
        }
        const doc = (await res.json())?.response?.data;
        window.dispatchEvent(new CustomEvent('sales-order:document-created'));
        onClose();
        if (doc?.id) navigate(`/goods-shipment/${doc.id}`);
        else navigate(`/sales-order/${orderId}`, { replace: true });

      } else if (selected === 'invoice') {
        const res = await fetch(`${apiBaseUrl}/header/${orderId}/action/createDraftInvoice`,
          { method: 'POST', headers, body: JSON.stringify({}) });
        if (!res.ok) {
          const e = await res.json().catch(() => null);
          throw new Error(ui('soOrderConfirmedInvoiceError') + (e?.response?.message || `Error (${res.status})`));
        }
        const doc = (await res.json())?.response?.data;
        window.dispatchEvent(new CustomEvent('sales-order:document-created'));
        onClose();
        if (doc?.id) navigate(`/sales-invoice/${doc.id}`);
        else navigate(`/sales-order/${orderId}`, { replace: true });

      } else {
        onClose();
        navigate(`/sales-order/${orderId}`, { replace: true });
      }
    } catch (e) {
      setError(e.message || ui('soErrorOccurred'));
      setLoading(false);
    }
  };

  return (
    <div onClick={onClose} style={overlayStyle}>
      <div onClick={e => e.stopPropagation()} style={{ ...cardStyle, width: 460 }}>

        {/* Title row */}
        <div style={{ padding: '16px 20px 14px', borderBottom: '0.5px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>
            {ui('soConfirmTitle', { number: documentNo })}
          </div>
          <button type="button" onClick={onClose} style={closeBtn}>&times;</button>
        </div>

        {/* Summary + warning unified card */}
        <div style={{ padding: '14px 20px' }}>
          <div style={{
            borderRadius: 8, border: '1px solid #E5E7EB', background: '#F9FAFB',
            padding: '12px 14px',
          }}>
            {bpName && (
              <div style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 4 }}>
                {bpName}
              </div>
            )}
            <div style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 10 }}>
              {grandTotal > 0 ? `${fmtNum(grandTotal)}${currency ? ` ${currency}` : ''}` : '0,00'}
            </div>
            {/* Warning sub-card */}
            <div style={{
              borderRadius: 6, background: '#FFFBEB',
              border: '1px solid #FDE68A',
              padding: '8px 12px',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 17, lineHeight: 1, flexShrink: 0 }}>🔒</span>
              <span style={{ fontSize: 12, color: '#92400E', lineHeight: 1.4 }}>
                {ui('soConfirmWarning')}
              </span>
            </div>
          </div>
        </div>

        {/* Options */}
        <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {CONFIRM_OPTIONS.map(opt => (
            <div key={opt.value} onClick={() => setSelected(opt.value)} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px', borderRadius: 8, cursor: 'pointer',
              border: selected === opt.value ? '2px solid #3B82F6' : '1px solid #E5E7EB',
              background: selected === opt.value ? '#EFF6FF' : '#fff',
            }}>
              {/* Radio dot */}
              <div style={{
                width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                border: selected === opt.value ? 'none' : '1.5px solid #D1D5DB',
                background: selected === opt.value ? '#3B82F6' : '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {selected === opt.value && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
              </div>
              {/* Icon */}
              <span style={{ fontSize: 15, lineHeight: 1, flexShrink: 0 }}>{opt.icon}</span>
              {/* Text */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: selected === opt.value ? '#2563EB' : '#111827' }}>
                  {opt.title}
                </div>
                <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 3, lineHeight: 1.4 }}>
                  {opt.subtitle}
                </div>
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div style={{ padding: '8px 20px', fontSize: 12, color: '#DC2626', background: '#FEF2F2', borderTop: '0.5px solid #FECACA' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '0.5px solid #E5E7EB' }}>
          <button type="button" onClick={onClose} disabled={loading} style={{ ...btnSecondary, opacity: loading ? 0.5 : 1 }}>
            {ui('cancel')}
          </button>
          <button type="button" onClick={handleConfirm} disabled={loading}
            style={{ ...btnPrimaryStyle, opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {loading && <Spinner />}
            {loading ? ui('soProcessing') : ui('soConfirmAction')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ActionsModal (CO orders — Gestionar) ──────────────────────────────────────

function ActionsModal({ orderId, data, base, headers, currency, derived, scrollTo, onClose }) {
  const navigate = useNavigate();
  const ui       = useUI();
  const [loading, setLoading] = useState(null);
  const [error,   setError]   = useState(null);
  const shipRef = useRef(null);
  const invRef  = useRef(null);

  const {
    shipmentsComplete, invoicesComplete,
    qtyOrdered, qtyDelivered, qtyPending,
    totalOrder, totalInvoiced, totalPending,
    needsShip, needsInvoice,
  } = derived;

  const d          = data || {};
  const documentNo = d.documentNo || '';
  const bpName     = d['businessPartner$_identifier'] || '';
  const grandTotal = Number(d.grandTotalAmount) || 0;

  // Scroll to section after render
  useEffect(() => {
    if (!scrollTo) return;
    const ref = scrollTo === 'shipment' ? shipRef.current : invRef.current;
    if (ref) ref.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [scrollTo]);

  const createDoc = async (type) => {
    if (loading) return;
    setLoading(type);
    setError(null);
    try {
      const url = type === 'shipment'
        ? `${base}/sales-order/header/${orderId}/action/createShipment`
        : `${base}/sales-order/header/${orderId}/action/createDraftInvoice`;
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({}) });
      if (!res.ok) {
        const e = await res.json().catch(() => null);
        throw new Error(e?.response?.message || `Error (${res.status})`);
      }
      const doc = (await res.json())?.response?.data;
      window.dispatchEvent(new CustomEvent('sales-order:document-created'));
      onClose();
      if (type === 'shipment') navigate(`/goods-shipment/${doc?.id}`);
      else navigate(`/sales-invoice/${doc?.id}`);
    } catch (e) {
      setError(e.message || ui('soErrorOccurred'));
      setLoading(null);
    }
  };

  return (
    <div onClick={onClose} style={overlayStyle}>
      <div onClick={e => e.stopPropagation()} style={cardStyle}>

        {/* Header */}
        <div style={{ padding: '14px 16px 0', position: 'relative', flexShrink: 0 }}>
          <button type="button" onClick={onClose} style={{ ...closeBtn, position: 'absolute', top: 10, right: 12 }}>&times;</button>
          <div style={{ fontSize: 10, color: '#9CA3AF', letterSpacing: '0.04em', marginBottom: 8 }}>
            Sales Order #{documentNo}
          </div>
          <div style={{ background: '#E6F1FB', border: '0.5px solid #B5D4F4', borderRadius: 10, padding: '12px 16px', marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: '#185FA5' }}>{bpName}</div>
            <div style={{ fontSize: 26, fontWeight: 500, color: '#042C53', lineHeight: 1, marginTop: 4, marginBottom: 4 }}>
              {fmtNum(grandTotal)}{currency ? ` ${currency}` : ''}
            </div>
          </div>
        </div>

        {/* Only sections where action is available (borrador cubre → no aparece aquí) */}
        <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 10, borderBottom: '0.5px solid #E5E7EB', overflowY: 'auto' }}>
          {needsShip && (
            <div ref={shipRef}>
              <DocSection
                icon="🚚"
                title={ui('soShipmentSection')}
                statusText={qtyOrdered > 0
                  ? (qtyDelivered > 0
                    ? ui('soQtyDeliveredOf', { delivered: fmtNum(qtyDelivered, 0), total: fmtNum(qtyOrdered, 0), pending: fmtNum(qtyPending, 0) })
                    : ui('soQtyPendingDelivery', { pending: fmtNum(qtyPending, 0) }))
                  : null}
                createLabel={ui('soCreateShipment')}
                creating={loading === 'shipment'}
                onCreateClick={() => createDoc('shipment')}
              />
            </div>
          )}
          {needsInvoice && (
            <div ref={invRef}>
              <DocSection
                icon="🧾"
                title={ui('soInvoiceSection')}
                statusText={totalOrder > 0
                  ? (totalInvoiced > 0
                    ? ui('soAmountInvoicedOf', { invoiced: `${fmtNum(totalInvoiced)}${currency ? ` ${currency}` : ''}`, total: `${fmtNum(totalOrder)}${currency ? ` ${currency}` : ''}`, pending: `${fmtNum(totalPending)}${currency ? ` ${currency}` : ''}` })
                    : ui('soAmountPendingInvoice', { pending: `${fmtNum(totalPending)}${currency ? ` ${currency}` : ''}` }))
                  : null}
                createLabel={ui('soCreateInvoice')}
                creating={loading === 'invoice'}
                onCreateClick={() => createDoc('invoice')}
              />
            </div>
          )}
        </div>

        {error && (
          <div style={{ padding: '8px 16px', fontSize: 12, color: '#DC2626', background: '#FEF2F2', borderTop: '0.5px solid #FECACA', flexShrink: 0 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 16px', flexShrink: 0 }}>
          <button type="button" onClick={onClose} style={btnSecondary}>{ui('cancel')}</button>
        </div>
      </div>
    </div>
  );
}

// ── DocSection ─────────────────────────────────────────────────────────────────

function DocSection({ icon, title, statusText, createLabel, creating, onCreateClick }) {
  const ui = useUI();
  return (
    <div style={{ border: '0.5px solid #E5E7EB', borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ marginBottom: statusText ? 6 : 8 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>{icon} {title}</span>
      </div>
      {statusText && (
        <div style={{ fontSize: 11, color: '#6B7280', lineHeight: 1.5, marginBottom: 8 }}>
          {statusText}
        </div>
      )}
      <button type="button" onClick={onCreateClick} disabled={creating}
        style={{
          fontSize: 12, fontWeight: 500, color: '#185FA5',
          background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 6, padding: '6px 12px',
          cursor: creating ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
          opacity: creating ? 0.6 : 1,
        }}>
        {creating ? ui('soCreating') : createLabel}
      </button>
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const overlayStyle = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  backgroundColor: 'rgba(0,0,0,0.3)',
};

const cardStyle = {
  width: 480, maxHeight: '85vh', display: 'flex', flexDirection: 'column',
  overflow: 'hidden', borderRadius: 12, backgroundColor: '#fff',
  boxShadow: '0 8px 30px rgba(0,0,0,0.12)', border: '0.5px solid #E5E7EB',
};

const btnPrimaryStyle = {
  padding: '5px 14px', borderRadius: 6, border: 'none',
  background: '#185FA5', color: '#fff', fontWeight: 500, fontSize: 13,
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
};

const btnSecondary = {
  fontSize: 12, padding: '7px 14px', borderRadius: 6,
  border: '1px solid #D1D5DB', background: 'transparent', color: '#6B7280', cursor: 'pointer',
};

const closeBtn = {
  fontSize: 18, lineHeight: 1, padding: '2px 6px', borderRadius: 4,
  background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF',
};
