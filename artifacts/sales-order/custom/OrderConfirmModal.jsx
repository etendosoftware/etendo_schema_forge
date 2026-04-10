import { useState, useEffect, useMemo } from 'react';
import { Truck, FileText, Check } from 'lucide-react';
import { useUI } from '@/i18n';

/**
 * Confirmation modal for Sales Order.
 *
 * Flow:
 *  1. Modal opens with 3 options.
 *  2. On confirm: DocAction=CO (skipped if order already CO) → create shipment / invoice / nothing.
 *  3. Shows success state with optional navigation to created document.
 */
export default function OrderConfirmModal({
  orderId,
  data,
  token,
  apiBaseUrl,
  onClose,
  defaultSelected = 'shipment',
}) {
  const ui = useUI();
  const alreadyConfirmed = data?.documentStatus === 'CO';
  const [selected, setSelected] = useState(defaultSelected);
  const [orderProcessed, setOrderProcessed] = useState(alreadyConfirmed);
  const [loading, setLoading] = useState(false);
  const [createdDoc, setCreatedDoc] = useState(null);
  const [error, setError] = useState(null);
  const [lineCount, setLineCount] = useState(null);
  const [freshData, setFreshData] = useState(null);
  const [needsReload, setNeedsReload] = useState(false);

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

  const d = freshData || data || {};
  const documentNo = d.documentNo || '';
  const bpName = d['businessPartner$_identifier'] || '';
  const grandTotal = d.grandTotalAmount ?? d.grandTotal ?? '';
  const totalLines = d.summedLineAmount ?? d.totalLines ?? grandTotal;
  const currency = d['currency$_identifier'] || '';

  const handleConfirm = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      // Step 1: Process DocAction=CO (skip if order is already confirmed)
      if (!orderProcessed) {
        const processRes = await fetch(
          `${orderUrl}/${orderId}/action/DocAction`,
          { method: 'POST', headers, body: JSON.stringify({ action: 'CO' }) },
        );
        if (!processRes.ok) {
          const err = await processRes.json().catch(() => null);
          throw new Error(err?.response?.message || err?.message || `Process failed (${processRes.status})`);
        }
        setOrderProcessed(true);
        setNeedsReload(true);
      }

      // Step 2: Create document based on selection
      if (selected === 'shipment') {
        const res = await fetch(
          `${orderUrl}/${orderId}/action/createShipment`,
          { method: 'POST', headers, body: JSON.stringify({}) },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(
            ui('soOrderConfirmedShipmentError')
            + (err?.response?.message || err?.message || `Error (${res.status})`),
          );
        }
        const json = await res.json();
        const shipment = json?.response?.data;
        setCreatedDoc({
          type: 'shipment',
          id: shipment?.id ?? null,
          documentNo: shipment?.documentNo || '',
          total: shipment?.grandTotal != null ? `${fmtNum(shipment.grandTotal)} ${currency}`.trim() : '',
          status: 'Draft',
        });

      } else if (selected === 'invoice') {
        const res = await fetch(
          `${orderUrl}/${orderId}/action/createDraftInvoice`,
          { method: 'POST', headers, body: JSON.stringify({}) },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(
            ui('soOrderConfirmedInvoiceError')
            + (err?.response?.message || err?.message || `Error (${res.status})`),
          );
        }
        const json = await res.json();
        const invoice = json?.response?.data;
        setCreatedDoc({
          type: 'invoice',
          id: invoice?.id ?? null,
          documentNo: invoice?.documentNo || '',
          total: invoice?.grandTotal != null ? `${fmtNum(invoice.grandTotal)} ${currency}`.trim() : '',
          status: 'Draft',
        });

      } else {
        // Solo confirmar — no additional document
        setCreatedDoc({
          type: 'confirm',
          documentNo,
        });
      }
    } catch (err) {
      setError(err.message || ui('soErrorOccurred'));
    } finally {
      setLoading(false);
    }
  };

  const primaryLabel = {
    shipment: ui('soConfirmActionShipment'),
    invoice:  ui('soConfirmActionInvoice'),
    confirm:  ui('soConfirmActionOnly'),
  }[selected];

  const handleGoToDoc = () => {
    if (!createdDoc?.id) { handleCloseAfterCreate(); return; }
    const basePath = window.location.pathname.replace(/\/sales-order\/.*$/, '');
    const target = createdDoc.type === 'invoice' ? 'sales-invoice' : 'goods-shipment';
    window.location.href = `${basePath}/${target}/${createdDoc.id}`;
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
  if (createdDoc) {
    const isConfirmOnly = createdDoc.type === 'confirm';

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

            {isConfirmOnly ? (
              <>
                <div style={{ fontSize: 15, fontWeight: 500, color: '#111827' }}>
                  {ui('soOrderConfirmed')}
                </div>
                <div style={{ fontSize: 12, color: '#6B7280', marginTop: 8, lineHeight: 1.5 }}>
                  {ui('soOrderConfirmedDesc', { number: createdDoc.documentNo })}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 15, fontWeight: 500, color: '#111827' }}>
                  {createdDoc.type === 'shipment' ? ui('soShipmentCreated') : ui('soInvoiceCreated')}
                </div>
                <div style={{ fontSize: 12, color: '#6B7280', marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {createdDoc.documentNo && (
                    <span>
                      {createdDoc.type === 'shipment' ? ui('shipmentDoc', { number: createdDoc.documentNo }) : ui('invoiceDoc', { number: createdDoc.documentNo })}
                    </span>
                  )}
                  {createdDoc.total && (
                    <><span style={{ color: '#D1D5DB' }}>·</span><span>{createdDoc.total}</span></>
                  )}
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 99,
                    background: '#FEF3C7', color: '#92400E',
                  }}>
                    {ui('statusDraft')}
                  </span>
                </div>
                {createdDoc.type === 'shipment' && (
                  <div style={{ fontSize: 12, color: '#6B7280', marginTop: 10, lineHeight: 1.5 }}>
                    {ui('soShipmentCreatedNote')}
                  </div>
                )}
              </>
            )}
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8,
            padding: '12px 16px', borderTop: '0.5px solid #E5E7EB',
          }}>
            <button type="button" onClick={handleCloseAfterCreate} style={btnSecondary}>
              {ui('soClose')}
            </button>
            {!isConfirmOnly && createdDoc.id && (
              <button type="button" onClick={handleGoToDoc} style={btnPrimary}>
                {createdDoc.type === 'shipment' ? ui('soViewShipment') : ui('soViewInvoice')}
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
            Sales Order #{documentNo}
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

        {/* Options */}
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, borderBottom: '0.5px solid #E5E7EB' }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', marginBottom: 2 }}>
            {ui('soWhatToDo')}
          </div>
          <OptionCard
            selected={selected === 'shipment'}
            onClick={() => setSelected('shipment')}
            icon={<Truck size={16} />}
            title={ui('soCreateShipmentTitle')}
            badge={ui('soRecommended')}
            subtitle={ui('soCreateShipmentDesc')}
          />
          <OptionCard
            selected={selected === 'invoice'}
            onClick={() => setSelected('invoice')}
            icon={<FileText size={16} />}
            title={ui('soInvoiceDirectly')}
            subtitle={ui('soInvoiceDirectlyDesc')}
          />
          {!alreadyConfirmed && (
            <OptionCard
              selected={selected === 'confirm'}
              onClick={() => setSelected('confirm')}
              icon={<Check size={16} />}
              title={ui('soConfirmOnly')}
              subtitle={ui('soOnlyConfirmDesc')}
            />
          )}
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

/* ── Option card ───────────────────────────────────────────────── */

function OptionCard({ selected, onClick, icon, title, badge, subtitle }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        border: selected ? '2px solid #3B82F6' : '0.5px solid #E5E7EB',
        borderRadius: 8, padding: selected ? '11px 13px' : '12px 14px',
        cursor: 'pointer',
        background: selected ? '#EFF6FF' : '#fff',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 6, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: selected ? '#fff' : '#F3F4F6',
        color: selected ? '#2563EB' : '#6B7280',
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: selected ? '#2563EB' : '#111827' }}>
            {title}
          </span>
          {badge && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 99,
              background: '#ECFDF5', color: '#059669',
              letterSpacing: '0.3px',
            }}>
              {badge}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: '#6B7280', marginTop: 3, lineHeight: 1.4 }}>
          {subtitle}
        </div>
      </div>
      <div style={{
        width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
        border: selected ? 'none' : '1.5px solid #D1D5DB',
        background: selected ? '#3B82F6' : '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {selected && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
      </div>
    </div>
  );
}

/* ── Shared styles ─────────────────────────────────────────────── */

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

const btnSecondary = {
  fontSize: 12, padding: '7px 14px', borderRadius: 6,
  border: '1px solid #D1D5DB', background: 'transparent', color: '#6B7280', cursor: 'pointer',
};

const btnPrimary = {
  fontSize: 12, fontWeight: 500, padding: '7px 16px', borderRadius: 6,
  border: 'none', background: '#185FA5', color: '#fff', cursor: 'pointer',
};
