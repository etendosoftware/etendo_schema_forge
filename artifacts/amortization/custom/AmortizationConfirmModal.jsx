import { useState, useEffect, useMemo } from 'react';
import { useUI, getStoredLocale } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { useApiFetch } from '@/auth/useApiFetch.js';

export default function AmortizationConfirmModal({ recordId, token, apiBaseUrl, onClose }) {
  // ETP-4576 - the credential belongs to apiFetch, not to the component.
  const apiFetch = useApiFetch(apiBaseUrl);
  const ui = useUI();
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [freshData,  setFreshData]  = useState(null);
  const [lineCount,  setLineCount]  = useState(null);
  const [linesTotal, setLinesTotal] = useState(null);
  const [invalidCount, setInvalidCount] = useState(0);
  const [missingPctCount, setMissingPctCount] = useState(0);

  // ETP-4576 - the credential belongs to apiFetch, not to the component. It also carries
  // Accept-Language, which this block used to add by hand: the shared builders have done
  // that since ETP-5022, so the backend still resolves AD_Message in the UI's language.

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [recRes, linesRes] = await Promise.all([
          apiFetch(`${apiBaseUrl}/header/${recordId}`),
          apiFetch(`${apiBaseUrl}/lines?parentId=${recordId}&_startRow=0&_endRow=999`),
        ]);
        if (cancelled) return;
        if (recRes.ok) {
          const json = await recRes.json();
          setFreshData(json?.response?.data?.[0] ?? json);
        }
        if (linesRes.ok) {
          const json = await linesRes.json();
          const lines = json?.response?.data ?? [];
          setLineCount(lines.length);
          setLinesTotal(lines.reduce((acc, l) => acc + Number(l.amortizationAmount ?? 0), 0));
          setInvalidCount(lines.filter(l => Number(l.amortizationAmount ?? 0) <= 0).length);
          setMissingPctCount(lines.filter(l => l.amortizationPercentage == null || l.amortizationPercentage === '').length);
        }
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [recordId, apiBaseUrl, apiFetch]);

  const d = freshData || {};
  const name     = d.name || d.documentNo || '';
  const totalNum = linesTotal !== null ? linesTotal : (d.totalAmortization != null ? Number(d.totalAmortization) : null);
  const currency = d['currency$_identifier'] || '';
  const total    = totalNum !== null
    ? (currency ? formatCurrency(currency, totalNum) : totalNum.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }))
    : '...';

  const handleConfirm = async () => {
    if (loading) return;
    if (missingPctCount > 0) {
      setError(ui('amortizationErrorLinePercentageMissing'));
      return;
    }
    if (invalidCount > 0) {
      setError(ui('amortizationErrorLineAmountInvalid'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(
        `${apiBaseUrl}/header/${recordId}/action/Processed`,
        { method: 'POST', body: JSON.stringify({ fieldValues: { Processed: 'Y' } }) },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.response?.message || err?.message || `Error (${res.status})`);
      }
      onClose(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div onClick={() => !loading && onClose(false)} style={overlayStyle}>
      <div onClick={e => e.stopPropagation()} style={cardStyle}>

        {/* Header */}
        <div style={{ padding: '14px 16px 0', position: 'relative' }}>
          <button
            type="button"
            onClick={() => !loading && onClose(false)}
            style={closeBtnStyle}
            disabled={loading}
          >&times;</button>

          <div style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))', letterSpacing: '0.04em', marginBottom: 8, textTransform: 'uppercase' }}>
            {ui('amortizationRef')}
          </div>

          {/* Blue summary card */}
          <div style={blueCardStyle}>
            <div style={{ fontSize: 11, color: 'var(--status-info-fg)' }}>{name || '...'}</div>
            <div style={{ fontSize: 28, fontWeight: 500, color: 'var(--status-info-fg)', lineHeight: 1, marginTop: 4, marginBottom: 6 }}>
              {total}
            </div>
            <div style={{ fontSize: 11, color: 'var(--status-info-fg)' }}>
              {lineCount != null ? ui('amortizationLineCountLabel', { count: lineCount }) : '...'}
            </div>

            {/* Warning */}
            <div style={warningStyle}>
              <span style={{ fontSize: 14 }}>🔒</span>
              <span style={{ fontSize: 12, color: 'var(--status-warning-fg)' }}>
                {ui('amortizationConfirmWarning')}
              </span>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ padding: '8px 16px', fontSize: 12, color: 'hsl(var(--destructive))', background: 'hsl(var(--card))', borderTop: '0.5px solid hsl(var(--destructive))' }}>
            {error}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '12px 16px' }}>
          <button type="button" onClick={() => onClose(false)} disabled={loading} style={{ ...btnSecondary, opacity: loading ? 0.5 : 1 }}>
            {ui('cancel')}
          </button>
          <button type="button" onClick={handleConfirm} disabled={loading} style={{ ...btnPrimary, opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? '...' : ui('amortizationConfirmAction')}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: 'fixed', inset: 0, zIndex: 50,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'hsl(var(--foreground) / 0.3)',
};
const cardStyle = {
  width: 420, borderRadius: 14, background: 'hsl(var(--card))',
  boxShadow: '0 8px 30px hsl(var(--foreground) / 0.15)', border: '0.5px solid hsl(var(--border-subtle))',
  overflow: 'hidden',
};
const blueCardStyle = {
  background: 'var(--status-info-bg)', border: '0.5px solid var(--status-info-border)', borderRadius: 10,
  padding: '14px 16px', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 0,
};
const warningStyle = {
  display: 'flex', alignItems: 'flex-start', gap: 8,
  background: 'var(--status-warning-bg)', border: '0.5px solid var(--status-warning-border)', borderRadius: 8,
  padding: '10px 12px', marginTop: 10,
};
const closeBtnStyle = {
  position: 'absolute', top: 10, right: 12,
  fontSize: 18, lineHeight: 1, padding: '2px 6px', borderRadius: 4,
  background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))',
};
const btnSecondary = {
  padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500,
  background: 'hsl(var(--card))', border: '1px solid hsl(var(--border-subtle))', color: 'hsl(var(--foreground))', cursor: 'pointer',
};
const btnPrimary = {
  padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
  background: 'var(--status-info-fg)', border: 'none', color: 'hsl(var(--card))', cursor: 'pointer',
};
