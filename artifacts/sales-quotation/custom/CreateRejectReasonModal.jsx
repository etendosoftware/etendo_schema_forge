import { useState, useMemo, useRef, useEffect } from 'react';
import { useUI } from '@/i18n';

/**
 * Inline-create sub-modal opened from RejectQuotationModal when the user
 * clicks "+ Crear razón". Posts to the dedicated NEO action endpoint
 * (`POST /sws/neo/sales-quotation/quotation/{quotationId}/action/createRejectReason`)
 * and returns the new `{ id, name }` to the parent modal so the typeahead
 * can preselect it without an extra round-trip.
 *
 * The endpoint is hosted on the quotation entity for routing convenience —
 * the handler ignores the recordId for create. See
 * com.etendoerp.go.schemaforge.CreateRejectReasonHandler.
 */
export default function CreateRejectReasonModal({
  initialName,
  quotationId,
  apiBaseUrl,
  token,
  onClose,
  onCreated,
}) {
  const ui = useUI();
  const [name, setName] = useState(initialName || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && !loading;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${apiBaseUrl}/quotation/${quotationId}/action/createRejectReason`,
        { method: 'POST', headers, body: JSON.stringify({ name: trimmed }) },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.response?.message || err?.message || `Error (${res.status})`);
      }
      const payload = await res.json();
      const created = payload?.response?.data ?? payload;
      const id = created?.id;
      const newName = created?.name ?? trimmed;
      if (!id) throw new Error('Missing id in response');
      onCreated?.({ id, name: newName });
    } catch (err) {
      setError(`${ui('rejectReasonCreateError')}${err.message || ''}`);
      setLoading(false);
    }
  };

  return (
    <div onClick={onClose} style={overlayStyle}>
      <div onClick={(e) => e.stopPropagation()} style={cardStyle}>

        <div style={{ padding: '14px 16px 0', position: 'relative' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{ ...closeBtnStyle, opacity: loading ? 0.5 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
            aria-label={ui('cancel')}
          >
            &times;
          </button>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'hsl(var(--foreground))', marginBottom: 12 }}>
            {ui('createRejectReasonTitle')}
          </div>
        </div>

        <div style={{ padding: '0 16px 14px' }}>
          <label htmlFor="reject-reason-name"
            style={{ display: 'block', fontSize: 11, color: 'var(--status-info-fg)', fontWeight: 500, marginBottom: 6 }}>
            {ui('rejectReasonNameLabel')}
          </label>
          <input
            ref={inputRef}
            id="reject-reason-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={ui('rejectReasonNamePlaceholder')}
            disabled={loading}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canSubmit) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            style={inputStyle}
            maxLength={60}
          />
        </div>

        {error && (
          <div style={{
            padding: '8px 16px', fontSize: 12, color: 'hsl(var(--destructive))',
            background: 'hsl(var(--card))', borderTop: '0.5px solid hsl(var(--destructive))',
          }}>
            {error}
          </div>
        )}

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8,
          padding: '12px 16px', borderTop: '0.5px solid hsl(var(--card))',
        }}>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{
              ...btnSecondary,
              opacity: loading ? 0.5 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {ui('cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              ...(canSubmit ? btnPrimary : btnPrimaryDisabled),
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            {loading && (
              <svg style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            )}
            {loading ? ui('soProcessing') : ui('rejectReasonCreateConfirm')}
          </button>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 60,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  backgroundColor: 'hsl(var(--foreground) / 0.3)',
};

const cardStyle = {
  width: 400, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
  overflow: 'hidden', borderRadius: 12, backgroundColor: 'hsl(var(--card))',
  boxShadow: '0 8px 30px hsl(var(--foreground) / 0.12)', border: '0.5px solid hsl(var(--card))',
};

const closeBtnStyle = {
  position: 'absolute', top: 10, right: 12,
  fontSize: 18, lineHeight: 1, padding: '2px 6px', borderRadius: 4,
  background: 'none', border: 'none', color: 'hsl(var(--muted-foreground))',
};

const inputStyle = {
  width: '100%', fontSize: 13, color: 'hsl(var(--foreground))',
  border: '1px solid hsl(var(--card))', borderRadius: 6, padding: '7px 10px',
  background: 'hsl(var(--card))',
  outline: 'none',
};

// Mirrors the cancel / save palette used by EntityCreationModal (see
// tools/app-shell/src/components/contract-ui/modal-styles.js → btnCancel /
// btnSaveEnabled). Same fontFamily, same rounded-full radius, same
// black-on-disabled-grey contrast as "Guardar contacto".
const btnSecondary = {
  fontSize: 14, fontWeight: 500, padding: '8px 18px',
  borderRadius: 360, fontFamily: 'Inter, sans-serif',
  border: '1px solid hsl(var(--card))', background: 'hsl(var(--card))', color: 'hsl(var(--foreground))',
  boxShadow: '0px 1px 2px hsl(var(--foreground) / 0.05)',
};

const btnPrimary = {
  fontSize: 14, fontWeight: 500, padding: '8px 18px',
  borderRadius: 360, fontFamily: 'Inter, sans-serif',
  border: 'none', background: 'hsl(var(--foreground))', color: 'hsl(var(--card))',
};

const btnPrimaryDisabled = {
  fontSize: 14, fontWeight: 500, padding: '8px 18px',
  borderRadius: 360, fontFamily: 'Inter, sans-serif',
  border: 'none', background: 'hsl(var(--card))', color: 'hsl(var(--card))',
};
