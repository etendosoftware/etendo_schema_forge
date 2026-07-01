import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { FileText, Check } from 'lucide-react';
import { useUI } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency';

/* eslint-disable react/prop-types */

/**
 * PurchaseOrderActions — topbarRight component for the Purchase Order window.
 *
 * Renders action buttons depending on document status:
 *   DR (Draft)   → Save Draft, Confirm (opens modal), Delete icon, Print icon
 *   CO (Confirmed) → Receive Goods, Create Invoice, Email icon, Print icon
 */
export default function PurchaseOrderActions({
  data,
  recordId,
  token,
  apiBaseUrl,
  api,
  onProcess,
}) {
  const ui = useUI();
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [processing, setProcessing] = useState(false);

  const base = useMemo(
    () => (apiBaseUrl || '').replace(/\/[^/]+$/, ''),
    [apiBaseUrl],
  );
  const headers = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }),
    [token],
  );

  if (!data) return null;

  const docStatus = data.documentStatus;
  const isDraft = docStatus === 'DR';
  const isConfirmed = docStatus === 'CO';

  // ─── Receive goods handler ───────────────────────────────────────────────────

  const handleReceiveGoods = () => {
    const currentPath = window.location.pathname;
    const basePath = currentPath.replace(/\/purchase-order\/.*$/, '');
    window.location.href = `${basePath}/goods-receipt/new?fromOrder=${recordId}`;
  };

  // ─── Create invoice handler ──────────────────────────────────────────────────

  const handleCreateInvoice = async () => {
    if (processing) return;
    setProcessing(true);
    try {
      const res = await fetch(
        `${base}/purchase-order/header/${recordId}/action/rMCreateInvoice`,
        { method: 'POST', headers, body: JSON.stringify({}) },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.response?.message || err?.message || `Error (${res.status})`);
      }
      const json = await res.json();
      const invoiceId = json?.response?.data?.id;
      const invDocNo = json?.response?.data?.documentNo || '';
      if (invoiceId) {
        const currentPath = window.location.pathname;
        const basePath = currentPath.replace(/\/purchase-order\/.*$/, '');
        const invoiceUrl = `${basePath}/purchase-invoice/${invoiceId}`;
        toast.custom((t) => (
          <div
            style={{
              background: '#16a34a',
              color: '#fff',
              borderRadius: 10,
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
              minWidth: 380,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>
                {ui('poInvoiceCreated')} #{invDocNo}
              </div>
              <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>
                {ui('poReviewBeforeConfirming')}
              </div>
            </div>
            <button
              onClick={() => { toast.dismiss(t); window.location.href = invoiceUrl; }}
              style={{
                border: '1px solid rgba(255,255,255,0.4)',
                borderRadius: 6,
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: 500,
                color: '#fff',
                background: 'rgba(255,255,255,0.15)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {ui('poViewInvoice')} →
            </button>
          </div>
        ), { duration: 10000 });
      } else {
        toast.success(ui('poInvoiceCreated'));
      }
    } catch (err) {
      toast.error(err.message || ui('poErrorOccurred'));
    } finally {
      setProcessing(false);
    }
  };

  // ─── Icon buttons ────────────────────────────────────────────────────────────

  const iconBtnStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    borderRadius: 6,
    border: '1px solid var(--color-border, #e5e7eb)',
    background: 'transparent',
    color: 'var(--color-muted-foreground, #6b7280)',
    cursor: 'pointer',
  };

  return (
    <>
      {/* ── DRAFT STATE ── */}
      {isDraft && (
        <>
          <button
            type="button"
            style={{
              padding: '5px 14px',
              borderRadius: 6,
              border: '1px solid var(--color-border, #e5e7eb)',
              background: 'transparent',
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--color-foreground, #111827)',
              cursor: 'pointer',
            }}
            onClick={() => { if (typeof api?.save === 'function') { api.save(); } else { onProcess?.('save'); } }}
          >
            {ui('poSave')}
          </button>

          <button
            type="button"
            style={{
              padding: '5px 14px',
              borderRadius: 6,
              border: 'none',
              background: 'var(--color-primary, #18181b)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
            onClick={() => setShowConfirmModal(true)}
          >
            {ui('poConfirmBtn')}
          </button>

          {/* Delete icon */}
          <button
            type="button"
            aria-label={ui('delete')}
            style={{ ...iconBtnStyle, color: '#ef4444', borderColor: '#fecaca' }}
            onClick={() => onProcess?.('delete')}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
              <path d="M9 6V4h6v2" />
            </svg>
          </button>

          {/* Print icon */}
          <button
            type="button"
            aria-label={ui('print')}
            style={iconBtnStyle}
            onClick={() => onProcess?.('print')}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
          </button>

          {/* Email icon */}
          <button
            type="button"
            aria-label={ui('send')}
            style={iconBtnStyle}
            onClick={() => onProcess?.('email')}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </button>
        </>
      )}
      {/* ── CONFIRMED STATE ── */}
      {isConfirmed && (
        <>
          <button
            type="button"
            style={{
              padding: '5px 14px',
              borderRadius: 6,
              border: 'none',
              background: 'var(--color-primary, #18181b)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
            onClick={handleReceiveGoods}
          >
            {ui('poReceiveGoods')}
          </button>

          <button
            type="button"
            disabled={processing}
            style={{
              padding: '5px 14px',
              borderRadius: 6,
              border: '1px solid var(--color-border-info, #93c5fd)',
              background: 'var(--color-background-info, #eff6ff)',
              color: 'var(--color-text-info, #2563eb)',
              fontSize: 13,
              fontWeight: 500,
              cursor: processing ? 'not-allowed' : 'pointer',
              opacity: processing ? 0.6 : 1,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-background-info-hover, #dbeafe)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-background-info, #eff6ff)'; }}
            onClick={handleCreateInvoice}
          >
            {processing ? ui('poProcessing') : ui('poCreateInvoice')}
          </button>

          {/* Email icon */}
          <button
            type="button"
            aria-label={ui('send')}
            style={iconBtnStyle}
            onClick={() => onProcess?.('email')}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </button>

          {/* Print icon */}
          <button
            type="button"
            aria-label={ui('print')}
            style={iconBtnStyle}
            onClick={() => onProcess?.('print')}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
          </button>
        </>
      )}
      {/* ── CONFIRM MODAL ── */}
      {showConfirmModal &&
        createPortal(
          <ConfirmOrderModal
            orderId={recordId}
            data={data}
            token={token}
            apiBaseUrl={apiBaseUrl}
            onClose={() => setShowConfirmModal(false)}
            data-testid="ConfirmOrderModal__4da6de" />,
          document.body,
        )}
    </>
  );
}

// ─── Confirm Modal ─────────────────────────────────────────────────────────────
// Direct copy of sales-order OrderConfirmModal — shipment option removed, PO endpoints used.

function ConfirmOrderModal({
  orderId,
  data,
  token,
  apiBaseUrl,
  onClose,
  defaultSelected = 'confirm',
}) {
  const ui = useUI();
  const [selected, setSelected] = useState(defaultSelected);
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

  const fmtNum = (v) =>
    v != null && v !== ''
      ? formatCurrency(currency || 'USD', v)
      : '-';

  const handleConfirm = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      // Step 1: Complete the order via documentAction=CO
      const processRes = await fetch(
        `${orderUrl}/${orderId}/action/documentAction`,
        { method: 'POST', headers, body: JSON.stringify({ docAction: 'CO' }) },
      );
      if (!processRes.ok) {
        const err = await processRes.json().catch(() => null);
        throw new Error(err?.response?.message || err?.message || `Process failed (${processRes.status})`);
      }
      setNeedsReload(true);

      // Step 2: Create invoice if requested
      if (selected === 'invoice') {
        const res = await fetch(
          `${orderUrl}/${orderId}/action/rMCreateInvoice`,
          { method: 'POST', headers, body: JSON.stringify({}) },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(
            ui('poOrderConfirmedInvoiceError')
            + (err?.response?.message || err?.message || `Error (${res.status})`),
          );
        }
        const json = await res.json();
        const invoice = json?.response?.data;
        setCreatedDoc({
          type: 'invoice',
          id: invoice?.id ?? null,
          documentNo: invoice?.documentNo || '',
          total: invoice?.grandTotal != null ? fmtNum(invoice.grandTotal) : '',
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
    invoice: ui('soConfirmActionInvoice'),
    confirm: ui('soConfirmActionOnly'),
  }[selected];

  const handleGoToDoc = () => {
    if (!createdDoc?.id) { handleCloseAfterCreate(); return; }
    const basePath = window.location.pathname.replace(/\/purchase-order\/.*$/, '');
    window.location.href = `${basePath}/purchase-invoice/${createdDoc.id}`;
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
      <div className={overlayClass}>
        <div onClick={(e) => e.stopPropagation()} style={{ ...cardStyle, width: 400 }}>
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
                  {ui('poOrderConfirmedDesc', { number: createdDoc.documentNo })}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 15, fontWeight: 500, color: '#111827' }}>
                  {ui('soInvoiceCreated')}
                </div>
                <div style={{ fontSize: 12, color: '#6B7280', marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {createdDoc.documentNo && (
                    <span>{ui('invoiceDoc', { number: createdDoc.documentNo })}</span>
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
                {ui('soViewInvoice')} →
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Selection state ────────────────────────────────────────
  return (
    <div onClick={handleClose} className={overlayClass}>
      <div onClick={(e) => e.stopPropagation()} style={cardStyle}>

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
            {ui('poConfirmTitle', { number: documentNo })}
          </div>
          <div style={{
            background: '#E6F1FB', border: '0.5px solid #B5D4F4', borderRadius: 10,
            padding: '14px 16px', marginBottom: 14,
          }}>
            <div style={{ fontSize: 11, color: '#185FA5' }}>
              {bpName}
            </div>
            <div style={{ fontSize: 28, fontWeight: 500, color: '#042C53', lineHeight: 1, marginTop: 4, marginBottom: 6 }}>
              {fmtNum(grandTotal)}
            </div>
            <div style={{ fontSize: 11, color: '#185FA5' }}>
              {lineCount != null ? ui('soLines', { count: lineCount }) : '...'}
              {' '}<span style={{ color: '#85B7EB' }}>·</span>{' '}
              {ui('soSubtotal')}{' '}
              <span style={{ fontWeight: 500, color: '#042C53' }}>
                {fmtNum(totalLines)}
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
            selected={selected === 'invoice'}
            onClick={() => setSelected('invoice')}
            icon={<FileText size={16} data-testid="FileText__4da6de" />}
            title={ui('poConfirmWithInvoice')}
            subtitle={ui('poConfirmWithInvoiceDesc')}
            data-testid="OptionCard__4da6de" />
          <OptionCard
            selected={selected === 'confirm'}
            onClick={() => setSelected('confirm')}
            icon={<Check size={16} data-testid="Check__4da6de" />}
            title={ui('soConfirmOnly')}
            subtitle={ui('soOnlyConfirmDesc')}
            data-testid="OptionCard__4da6de" />
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

const overlayClass = 'fixed inset-0 z-50 flex items-center justify-center bg-black/30';

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
