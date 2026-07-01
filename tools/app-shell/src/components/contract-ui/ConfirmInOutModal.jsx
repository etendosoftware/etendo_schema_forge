import { useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Generic confirm modal for InOut documents (goods-receipt, goods-shipment, return-receipt).
 * Matches the ConfirmGoodsReceiptModal design: toggle switch + green info row + dynamic button.
 *
 * All visible strings are passed as props (resolved by the caller via useUI()).
 */
export default function ConfirmInOutModal({
  base,
  headers,
  recordId,
  specName,
  entityName,
  invoiceAction,
  defaultCreateInvoice = false,
  skipDocumentAction = false,
  title,
  docInfo,
  infoRowPre,
  infoRowBold,
  infoRowPost,
  cardTitle,
  cardDesc,
  confirmLabel,
  confirmWithInvoiceLabel,
  processingLabel,
  cancelLabel,
  onConfirmed,
  onClose,
}) {
  const [createInvoice, setCreateInvoice] = useState(skipDocumentAction ? true : defaultCreateInvoice);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { documentNo, bpName, total, currency } = docInfo || {};

  const fmtAmount = (v, cur) =>
    `${Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`.trim();

  const subtitleParts = [
    documentNo,
    bpName,
    total != null ? fmtAmount(total, currency || '') : null,
  ].filter(Boolean);

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      const actionBase = `${base}/${specName}/${entityName}/${recordId}/action`;

      if (!skipDocumentAction) {
        const res = await fetch(`${actionBase}/documentAction`, {
          method: 'POST', headers, body: JSON.stringify({ docAction: 'CO' }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.response?.message || body?.message || `Error (${res.status})`);
        }
      }

      let invoice = null;
      if ((skipDocumentAction || createInvoice) && invoiceAction) {
        const invRes = await fetch(`${actionBase}/${invoiceAction}`, {
          method: 'POST', headers, body: JSON.stringify({}),
        });
        if (!invRes.ok) {
          const body = await invRes.json().catch(() => null);
          throw new Error(body?.response?.message || body?.message || `Error (${invRes.status})`);
        }
        const invData = (await invRes.json())?.response?.data;
        invoice = {
          id: invData?.id ?? null,
          documentNo: invData?.documentNo || '',
          amount: invData?.grandTotalAmount ?? null,
        };
      }

      onConfirmed({ invoice });
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const toggle = () => { if (!skipDocumentAction) setCreateInvoice(v => !v); };
  const primaryLabel = (skipDocumentAction || createInvoice) && confirmWithInvoiceLabel
    ? confirmWithInvoiceLabel
    : confirmLabel;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      data-testid="confirm-inout-modal"
      onClick={onClose}
      onKeyDown={e => e.key === 'Escape' && onClose()}
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(20,26,38,.45)' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 468, borderRadius: 16, background: '#fff',
          boxShadow: '0 24px 60px -12px rgba(20,26,38,.32), 0 8px 24px -8px rgba(20,26,38,.18)',
          overflow: 'hidden', fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #eef0f2', position: 'relative' }}>
          <div style={{ paddingRight: 36 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1d2530', lineHeight: 1.2 }}>
              {title}
            </div>
            {subtitleParts.length > 0 && (
              <div data-testid="confirm-modal-doc-info" style={{ marginTop: 6, fontSize: 13, color: '#697079', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {subtitleParts.map((part, i) => (
                  <span key={part} style={{ display: 'contents' }}>
                    {i > 0 && <span style={{ color: '#d0d4da', userSelect: 'none' }}>·</span>}
                    <span style={i === 0 ? { fontWeight: 700, color: '#1d2530' } : undefined}>{part}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ position: 'absolute', top: 16, right: 16, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', background: 'none', cursor: 'pointer', color: '#9aa1aa', fontSize: 20, lineHeight: 1 }}
            onMouseEnter={e => { e.currentTarget.style.background = '#f1f3f5'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Info row — hidden when only creating invoice (skipDocumentAction) */}
          {!skipDocumentAction && infoRowBold && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#e9f7ee', border: '1px solid #bfe8cd', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                <svg width="12" height="10" viewBox="0 0 12 10" fill="none" stroke="#157a43" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 5 4.5 8.5 11 1" />
                </svg>
              </div>
              <p style={{ fontSize: 13, color: '#697079', lineHeight: 1.55, margin: 0 }}>
                {infoRowPre}{' '}
                <strong style={{ color: '#1d2530' }}>{infoRowBold}</strong>
                {infoRowPost}
              </p>
            </div>
          )}

          {/* Toggle card — hidden when only creating invoice (skipDocumentAction) */}
          {!skipDocumentAction && <div
            role="switch"
            aria-checked={createInvoice}
            data-testid="confirm-modal-invoice-toggle"
            tabIndex={0}
            onClick={toggle}
            onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } }}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', borderRadius: 10,
              padding: createInvoice ? '13px 15px' : '14px 16px',
              border: createInvoice ? '2px solid #cadffb' : '1px solid #e6e8ec',
              background: createInvoice ? '#eff5fe' : '#fff',
              transition: 'border-color .15s, background .15s',
              outline: 'none',
            }}
            onFocus={e => { e.currentTarget.style.boxShadow = '0 0 0 3px rgba(47,115,214,.22)'; }}
            onBlur={e => { e.currentTarget.style.boxShadow = 'none'; }}
          >
            <div style={{ width: 38, height: 38, borderRadius: 9, background: '#f3f0ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c5cff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: createInvoice ? '#2057ad' : '#1d2530', lineHeight: 1.3 }}>
                {cardTitle}
              </div>
              <div style={{ fontSize: 12, color: '#697079', marginTop: 3, lineHeight: 1.45 }}>
                {cardDesc}
              </div>
            </div>
            <ToggleSwitch on={createInvoice} data-testid="ToggleSwitch__3b3aca" />
          </div>}

          {error && (
            <div style={{ fontSize: 12, color: '#dc2626', background: '#fef2f2', padding: '8px 12px', borderRadius: 6 }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 20px', background: '#fbfcfd', borderTop: '1px solid #eef0f2' }}>
          <button
            type="button"
            data-testid="confirm-modal-cancel-btn"
            onClick={onClose}
            disabled={loading}
            style={{ fontSize: 13, padding: '9px 16px', borderRadius: 9, border: '1px solid #e6e8ec', background: 'transparent', color: '#697079', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1 }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#f5f6f8'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            data-testid="confirm-modal-confirm-btn"
            onClick={handleConfirm}
            disabled={loading}
            style={{ height: 38, display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, padding: '0 18px', borderRadius: 9, border: 'none', background: loading ? '#aac4e8' : '#2f73d6', color: '#fff', cursor: loading ? 'not-allowed' : 'pointer', transition: 'background .15s' }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#2a67c2'; }}
            onMouseLeave={e => { if (!loading) e.currentTarget.style.background = '#2f73d6'; }}
          >
            {loading ? (
              <>
                <Spinner data-testid="Spinner__3b3aca" />
                {processingLabel || primaryLabel}
              </>
            ) : (
              <>
                <svg width="14" height="11" viewBox="0 0 14 11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 5.5 5 9.5 13 1" />
                </svg>
                {primaryLabel}
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

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

function ToggleSwitch({ on }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: 42, height: 25, borderRadius: 25, padding: '0 3px',
        background: on ? '#2f73d6' : '#d1d5db',
        display: 'flex', alignItems: 'center',
        transition: 'background .2s',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: 19, height: 19, borderRadius: '50%', background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,.25)',
          transition: 'transform .2s',
          transform: on ? 'translateX(17px)' : 'translateX(0)',
        }}
      />
    </div>
  );
}
