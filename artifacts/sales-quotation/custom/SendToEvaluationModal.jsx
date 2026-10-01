import { useState, useEffect } from 'react';
import { Info, Loader2, X } from 'lucide-react';
import { useUI } from '@/i18n';
import { MODAL_STYLES } from '@/components/contract-ui/modal-styles.js';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { useApiFetch } from '@/auth/useApiFetch.js';

// Shown in the summary table while the line count is still being fetched.
const LINE_COUNT_PENDING = '...';

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

  const submitDisabled = loading || lineCount === 0;
  const summary = [
    { key: 'documentNo', label: ui('quotation'), value: documentNo },
    { key: 'contact', label: ui('contact'), value: bpName },
    { key: 'lines', label: ui('lines'), value: lineCount ?? LINE_COUNT_PENDING },
    { key: 'subtotal', label: ui('subtotal'), value: formatCurrency(currency, totalLines), testId: 'confirm-summary-subtotal' },
    { key: 'total', label: ui('total'), value: formatCurrency(currency, grandTotal), testId: 'confirm-summary-total' },
  ];

  return (
    <div onClick={onClose} style={overlayStyle}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ui('sqSendToEvalTitle')}
        onClick={e => e.stopPropagation()}
        style={dialogStyle}
      >
        <button type="button" onClick={onClose} aria-label={ui('close')} style={closeBtnStyle}>
          <X size={20} />
        </button>

        <div style={headerStyle}>
          <h2 style={MODAL_STYLES.title}>{ui('sqSendToEvalTitle')}</h2>
        </div>

        <div style={bodyStyle}>
          <div style={summaryTableStyle}>
            {summary.map(({ key, label, value, testId }) => (
              <div key={key} style={summaryCellStyle}>
                <span style={summaryLabelStyle}>{label}</span>
                <span data-testid={testId} style={summaryValueStyle}>{value}</span>
              </div>
            ))}
          </div>

          <div style={sectionStyle}>
            <div style={alertStyle}>
              <Info size={24} style={alertIconStyle} />
              <p style={alertTextStyle}>{ui('sqSendToEvalDesc')}</p>
            </div>

            {error && <div role="alert" style={errorStyle}>{error}</div>}

            <div style={footerStyle}>
              <button type="button" onClick={onClose} disabled={loading} style={cancelBtnStyle}>
                {ui('cancel')}
              </button>
              <button
                type="button"
                data-testid="action-confirm-modal"
                onClick={handleConfirm}
                disabled={submitDisabled}
                style={getPrimaryBtnStyle(submitDisabled)}
              >
                {loading && <Loader2 size={24} className="animate-spin" />}
                {loading ? ui('soProcessing') : ui('sqSendToEvalConfirm')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getPrimaryBtnStyle(disabled) {
  if (disabled) {
    return primaryBtnDisabledStyle;
  }
  return primaryBtnStyle;
}

/* ── Styles (Figma "PopUps" — Enviar a evaluación) ───────────────── */

const FONT_FAMILY = 'Inter, sans-serif';

const overlayStyle = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  backgroundColor: 'hsl(var(--foreground) / 0.3)',
};

const dialogStyle = {
  ...MODAL_STYLES.dialog,
  position: 'relative',
  width: 720,
  fontFamily: FONT_FAMILY,
};

const closeBtnStyle = {
  position: 'absolute', top: 6, right: 8,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 2, borderRadius: 360, border: 'none', background: 'transparent',
  color: 'hsl(var(--icon-secondary))', cursor: 'pointer',
};

const headerStyle = {
  display: 'flex', flexDirection: 'column', gap: 2,
  padding: '8px 20px', alignSelf: 'stretch',
};

const bodyStyle = {
  display: 'flex', flexDirection: 'column', gap: 12,
  padding: '4px 20px 8px', alignSelf: 'stretch',
};

const summaryTableStyle = {
  display: 'flex', alignItems: 'flex-start', gap: 20,
  padding: '8px 12px', borderRadius: 8,
  border: '1px solid hsl(var(--border-subtle))',
};

const summaryCellStyle = {
  flex: '1 0 0', minWidth: 0,
  display: 'flex', flexDirection: 'column',
};

const summaryLabelStyle = {
  fontSize: 12, lineHeight: '16px', letterSpacing: '-0.06px',
  color: 'var(--status-neutral-fg)',
};

const summaryValueStyle = {
  fontSize: 16, lineHeight: '24px', fontWeight: 500,
  color: 'hsl(var(--foreground))', overflowWrap: 'anywhere',
};

const sectionStyle = { display: 'flex', flexDirection: 'column', gap: 20 };

const alertStyle = {
  display: 'flex', alignItems: 'flex-start',
  padding: '12px 8px', borderRadius: 8,
  background: 'var(--status-info-bg)',
};

const alertIconStyle = { flexShrink: 0, marginLeft: 4, color: 'var(--status-info-fg)' };

const alertTextStyle = {
  margin: 0, padding: '0 8px', flex: 1,
  fontSize: 14, lineHeight: '24px', color: 'var(--status-info-fg)',
};

const errorStyle = {
  fontSize: 12, padding: '8px 0', color: 'hsl(var(--destructive))',
  borderTop: '0.5px solid hsl(var(--destructive))',
};

const footerStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between' };

const cancelBtnStyle = {
  ...MODAL_STYLES.btnCancel,
  width: 'auto', padding: '8px 20px', lineHeight: '24px',
};

const primaryBtnStyle = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  height: 40, padding: '8px 20px', borderRadius: 360, border: 'none',
  background: 'hsl(var(--foreground))', color: 'hsl(var(--card))',
  fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 500, lineHeight: '24px',
  cursor: 'pointer',
};

const primaryBtnDisabledStyle = {
  ...primaryBtnStyle,
  background: 'hsl(var(--border-control))',
  cursor: 'not-allowed',
};
