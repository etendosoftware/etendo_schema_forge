import { useState, useEffect } from 'react';
import { useUI } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { MODAL_STYLES } from '@/components/contract-ui/modal-styles.js';
import { ActionModalSummary, ActionModalBanner } from '@/components/contract-ui/ActionModalSummary.jsx';

export default function SendToEvaluationModal({
  quotationId,
  data,
  token,
  apiBaseUrl,
  onClose,
  onRefresh,
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

  // ETP-5398 — the summary strip's columns. The two testIds are unchanged and still land
  // on the amounts: two E2E specs read their text.
  const summaryItems = [
    { label: ui('quotationDocumentLabel'), value: documentNo },
    { label: ui('contact'), value: bpName },
    { label: ui('lines'), value: lineCount ?? '…' },
    { label: ui('soSubtotal'), value: formatCurrency(currency, totalLines), testId: 'confirm-summary-subtotal' },
    { label: ui('total'), value: formatCurrency(currency, grandTotal), testId: 'confirm-summary-total' },
  ];

  // The DR → UE transition only changes the header's status, which drives the badge and
  // the readonly logic — exactly what `onRefresh` refetches. A full page reload threw away
  // the SPA boot, the scroll position and any open panel to show that one badge. Same fix
  // QuotationConfirmModal already carries (ETP-4779).
  //
  // The reload stays as the fallback so a mount that has not wired the prop keeps working
  // as before rather than silently leaving a stale screen.
  const refreshAfterTransition = () => {
    if (onRefresh) {
      onRefresh();
      return;
    }
    window.location.reload();
  };

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
      refreshAfterTransition();
    } catch (err) {
      setError(err.message || ui('soErrorOccurred'));
      setLoading(false);
    }
  };

  return (
    <div onClick={onClose} style={overlayStyle}>
      <div onClick={e => e.stopPropagation()} style={cardStyle}>

        {/* ETP-5398 — the title is the ACTION, not the document reference. The document
            number moved into the summary strip below, where it reads as one more column
            alongside the contact and the amounts. */}
        <div style={headerStyle}>
          <span style={MODAL_STYLES.title}>{ui('sqSendToEvalConfirm')}</span>
          <button type="button" onClick={onClose} aria-label={ui('cancel')} style={MODAL_STYLES.closeBtn}>
            &times;
          </button>
        </div>

        <div style={bodyStyle}>
          <ActionModalSummary items={summaryItems} />
          <ActionModalBanner>{ui('sqSendToEvalDesc')}</ActionModalBanner>
        </div>

        {error && (
          <div style={{ padding: '8px 20px', fontSize: 12, color: 'hsl(var(--destructive))', background: 'hsl(var(--card))', borderTop: '0.5px solid hsl(var(--destructive))' }}>
            {error}
          </div>
        )}

        {/* Footer is space-between: Cancelar anchors left, the primary right. No padding
            on top: the body's own 20px bottom padding is the gap to the banner. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '0 20px 20px' }}>
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
        </div>
        {/* Outside the footer on purpose: it is a flex child there, and under
            `space-between` a third child pushes the primary button to the centre. */}
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  backgroundColor: 'hsl(var(--foreground) / 0.3)',
};

// ETP-5398 — widened from 460: the summary strip carries five columns now, and the
// contact name is the one that overflows first. Widths stay per-modal, not normalised.
const cardStyle = {
  width: 620, maxWidth: '92vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
  overflow: 'hidden', borderRadius: 8, backgroundColor: 'hsl(var(--card))',
  boxShadow: MODAL_STYLES.dialog.boxShadow, border: '0.5px solid hsl(var(--border-subtle))',
};

// The divider belongs under the header, not above the footer.
const headerStyle = {
  display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  gap: 20, padding: '16px 20px', borderBottom: '1px solid hsl(var(--border-subtle))',
};

const bodyStyle = {
  display: 'flex', flexDirection: 'column', gap: 16, padding: '20px',
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
