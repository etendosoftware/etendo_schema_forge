import { useState, useEffect } from 'react';
import { useUI } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { MODAL_STYLES } from '@/components/contract-ui/modal-styles.js';

export default function SendToEvaluationModal({
  quotationId,
  data,
  token,
  apiBaseUrl,
  onClose,
}) {
  const ui = useUI();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [freshData, setFreshData] = useState(null);
  const [lineCount, setLineCount] = useState(null);

  const entityUrl = `${apiBaseUrl}/quotation`;
  // ETP-4576 - the credential belongs to apiFetch, not to the component: it picks the
  // active scheme's headers, and the CSRF proof on every unsafe method.
  // Empty base ON PURPOSE: every URL below is already absolute, and several address a
  // DIFFERENT spec than this window's. resolveApiUrl only skips the prefix when the path
  // starts with that same base, so a configured base turns a cross-spec call into
  // /sws/neo/<this>/sws/neo/<other>/... and a 404.
  const apiFetch = useApiFetch('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [recRes, linesRes] = await Promise.all([
          apiFetch(`${entityUrl}/${quotationId}`),
          apiFetch(`${apiBaseUrl}/quotationLine?parentId=${quotationId}&_startRow=0&_endRow=999`),
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
  }, [quotationId, entityUrl, apiBaseUrl, apiFetch]);

  const d              = freshData || data || {};
  const documentNo     = d.documentNo || '';
  const bpName         = d['businessPartner$_identifier'] || '';
  const discountPct    = Number(d.etgoTotalDiscount ?? 0);
  const discountFactor = discountPct > 0 ? (1 - discountPct / 100) : 1;
  // Same accounting rule as DocumentTotalsPanel: the displayed total must equal
  // round(net × factor) + round(tax × factor), not round(gross × factor).
  // Avoids the 1-cent double-rounding drift versus the quotation's right panel
  // and the printed invoice (AEAT/Modelo 303 rule "base + IVA = total").
  const round2        = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const grossBase     = Number(d.grandTotalAmount ?? d.grandTotal ?? 0) || 0;
  const netBase       = Number(d.summedLineAmount ?? d.totalLines ?? grossBase) || 0;
  const totalLines    = round2(netBase * discountFactor);
  // ETP-5132 (confirm-modal regression) — grandTotal must be grossBase as-is, NOT
  // totalLines + a client-recomputed tax delta. grossBase (grandTotalAmount) is
  // ALREADY GET-time-compensated for the pending total discount by
  // AbstractInvoiceHeaderHandler/AbstractOrderHeaderHandler's
  // applyTotalDiscountToRecord() (ETP-4029) whenever the quotation is in DR
  // (SendToEvaluationModal always runs pre-completion, per ETP-4006), so
  // re-applying discountFactor here double-discounts it. Only netBase
  // (summedLineAmount) is never backend-compensated, which is why totalLines
  // above still needs the client-side discountFactor.
  const grandTotal    = grossBase;
  const currency       = d['currency$_identifier'] || '';

  const handleConfirm = async () => {
    if (loading) return;
    if (lineCount === 0) {
      setError(ui('sqNoLinesError'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(
        `${entityUrl}/${quotationId}/action/DocAction`,
        { method: 'POST', body: JSON.stringify({ fieldValues: {} }) },
      );
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const rawMsg = errJson?.response?.message || errJson?.message || `Error (${res.status})`;
        throw new Error(rawMsg.includes('@OrderWithoutLines@') ? ui('sqNoLinesError') : rawMsg);
      }
      onClose();
      window.location.reload();
    } catch (err) {
      setError(err.message || ui('soErrorOccurred'));
      setLoading(false);
    }
  };

  return (
    <div onClick={onClose} style={overlayStyle}>
      <div onClick={e => e.stopPropagation()} style={cardStyle}>

        <div style={{ padding: '14px 16px 0', position: 'relative' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              position: 'absolute', top: 10, right: 12,
              fontSize: 20, lineHeight: 1, padding: '2px 6px', borderRadius: 4,
              background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))',
            }}
          >
            &times;
          </button>
          <div style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))', letterSpacing: '0.04em', marginBottom: 8 }}>
            {ui('quotationDocumentLabel')} #{documentNo}
          </div>
          <div style={{
            background: 'var(--status-info-bg)', border: '0.5px solid var(--status-info-border)', borderRadius: 10,
            padding: '14px 16px', marginBottom: 14,
          }}>
            <div style={{ fontSize: 11, color: 'var(--status-info-border)' }}>
              {bpName}
            </div>
            <div data-testid="confirm-summary-total" style={{ fontSize: 28, fontWeight: 500, color: 'var(--status-info-fg)', lineHeight: 1, marginTop: 4, marginBottom: 6 }}>
              {formatCurrency(currency, grandTotal)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--status-info-fg)' }}>
              {lineCount != null ? ui('soLines', { count: lineCount }) : '...'} <span style={{ color: 'var(--status-info-fg)' }}>·</span> {ui('soSubtotal')} <span data-testid="confirm-summary-subtotal" style={{ fontWeight: 500, color: 'var(--status-info-fg)' }}>{formatCurrency(currency, totalLines)}</span>
            </div>
          </div>
        </div>

        <div style={{ padding: '0 16px 14px', borderBottom: '0.5px solid hsl(var(--card))' }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'hsl(var(--foreground))', marginBottom: 4 }}>
            {ui('sqSendToEvalTitle')}
          </div>
          <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', lineHeight: 1.5 }}>
            {ui('sqSendToEvalDesc')}
          </div>
        </div>

        {error && (
          <div style={{ padding: '8px 16px', fontSize: 12, color: 'hsl(var(--destructive))', background: 'hsl(var(--card))', borderTop: '0.5px solid hsl(var(--destructive))' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '12px 16px' }}>
          <button type="button" onClick={onClose} disabled={loading}
            style={{ ...btnSecondary, cursor: loading ? 'not-allowed' : 'pointer' }}>
            {ui('cancel')}
          </button>
          <button type="button" data-testid="action-confirm-modal" onClick={handleConfirm} disabled={loading || lineCount === 0}
            style={loading || lineCount === 0 ? btnPrimaryDisabled : btnPrimary}>
            {loading && (
              <svg style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            )}
            {loading ? ui('soProcessing') : ui('sqSendToEvalConfirm')}
          </button>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  backgroundColor: 'hsl(var(--foreground) / 0.3)',
};

const cardStyle = {
  width: 460, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
  overflow: 'hidden', borderRadius: 8, backgroundColor: 'hsl(var(--card))',
  boxShadow: MODAL_STYLES.dialog.boxShadow, border: '0.5px solid hsl(var(--border-subtle))',
};

// ETP-5398 — buttons come from MODAL_STYLES, the canonical action-modal palette. See the
// matching comment in QuotationConfirmModal: same edits, these two style blocks were
// byte-identical. `width: 'auto'` overrides the per-frame widths MODAL_STYLES pins.
const btnSecondary = { ...MODAL_STYLES.btnCancel, width: 'auto' };

const btnPrimary = { ...MODAL_STYLES.btnSaveEnabled, width: 'auto', display: 'inline-flex', gap: 6 };

// Disabled swaps the whole object — never `opacity` on the fill. This modal disables on
// `lineCount === 0`, a resting state, so its dimmed blue sat next to the other modal's
// full-strength blue in the report. Same hex, two opacities.
const btnPrimaryDisabled = { ...MODAL_STYLES.btnSaveDisabled, width: 'auto', display: 'inline-flex', gap: 6 };
