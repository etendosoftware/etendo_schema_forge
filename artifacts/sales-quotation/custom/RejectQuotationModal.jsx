import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useUI } from '@/i18n';
import CreateRejectReasonModal from './CreateRejectReasonModal';
import { jsonHeaders, writeHeaders } from '@/lib/sessionHeaders.js';

/**
 * Reject confirmation for Sales Quotation in Under Evaluation (UE).
 *
 * Visual spec follows the Figma frame "Rechazar Presupuesto":
 * 375px-wide compact card, Inter typography, header with title + document
 * subtitle, body with description + labelled typeahead, and a button row
 * mirroring the EntityCreationModal palette (hsl(var(--foreground)) enabled / hsl(var(--card))
 * disabled, fully-rounded). The selector itself stays a typeahead so users
 * can search and inline-create reasons via the "+ Crear razón" affordance.
 *
 * On confirm we POST to the dedicated NEO action endpoint; the Java handler
 * is the one in com.etendoerp.go that flips DocStatus to CJ and persists
 * the chosen rejectReason.
 */
export default function RejectQuotationModal({
  quotationId,
  data,
  token,
  apiBaseUrl,
  onClose,
}) {
  const ui = useUI();
  const [reasons, setReasons] = useState([]);
  const [loadingReasons, setLoadingReasons] = useState(true);
  const [selected, setSelected] = useState(null); // { id, name } | null
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const isEditingRef = useRef(false);
  const blurTimeoutRef = useRef(null);

  const entityUrl = `${apiBaseUrl}/quotation`;
  const headers = useMemo(() => jsonHeaders(), []);

  // The selector URL mirrors the one EntityForm builds for the rejectReason
  // field (see tools/app-shell/src/components/contract-ui/EntityForm.jsx:626).
  const reasonsUrl = `${apiBaseUrl}/quotation/selectors/C_Reject_Reason_ID`;

  useEffect(() => {
    let cancelled = false;
    setLoadingReasons(true);
    fetch(`${reasonsUrl}?limit=200&offset=0`, { headers })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (cancelled) return;
        const items =
          payload?.items
          ?? payload?.response?.data
          ?? (Array.isArray(payload) ? payload : []);
        const mapped = items
          .map((i) => ({ id: i.id, name: i.label ?? i.name ?? i.id }))
          .filter((i) => i.id);
        setReasons(mapped);
        setLoadingReasons(false);
      })
      .catch(() => {
        if (cancelled) return;
        setReasons([]);
        setLoadingReasons(false);
      });
    return () => { cancelled = true; };
  }, [reasonsUrl, headers]);

  const documentNo = data?.documentNo || '';

  const filteredReasons = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return reasons;
    return reasons.filter((r) => (r.name || '').toLowerCase().includes(q));
  }, [reasons, query]);

  const handleSelect = (reason) => {
    isEditingRef.current = false;
    setSelected(reason);
    setQuery(reason.name);
    setOpen(false);
  };

  const handleClear = () => {
    isEditingRef.current = false;
    setSelected(null);
    setQuery('');
    setOpen(false);
  };

  const handleOpenCreate = () => {
    setOpen(false);
    setShowCreate(true);
  };

  const handleCreated = (created) => {
    setShowCreate(false);
    setReasons((prev) => {
      if (prev.some((r) => r.id === created.id)) return prev;
      return [...prev, created].sort((a, b) =>
        (a.name || '').localeCompare(b.name || ''));
    });
    handleSelect(created);
  };

  const handleConfirm = async () => {
    if (loading || !selected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${entityUrl}/${quotationId}/action/rejectQuotation`,
        {
          method: 'POST',
          headers: writeHeaders(),
          body: JSON.stringify({ rejectReason: selected.id }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(
          err?.response?.message || err?.message || `Error (${res.status})`,
        );
      }
      onClose();
      window.location.reload();
    } catch (err) {
      setError(`${ui('rejectQuotationError')}${err.message || ''}`);
      setLoading(false);
    }
  };

  const canSubmit = !loading && !!selected;

  return (
    <div onClick={onClose} style={overlayStyle}>
      <div onClick={(e) => e.stopPropagation()} style={cardStyle}>

        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          style={{ ...closeBtnStyle, opacity: loading ? 0.5 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
          aria-label={ui('cancel')}
        >
          <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="var(--status-info-bg)" strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 5l10 10M15 5l-10 10" />
          </svg>
        </button>

        <div style={headerStyle}>
          <div style={titleStyle}>{ui('rejectQuotationTitle')}</div>
          <div style={subtitleStyle}>
            {ui('quotationDocumentLabel')}: {documentNo}
          </div>
        </div>

        <div style={bodyStyle}>
          <div style={descriptionStyle}>
            {ui('rejectQuotationDesc')}
          </div>

          <div style={fieldGroupStyle}>
            <label htmlFor="reject-reason-search" style={labelRowStyle}>
              <span style={labelTextStyle}>{ui('rejectReasonLabel')}</span>
              <span style={asteriskStyle}>*</span>
            </label>

            <div style={{ position: 'relative', alignSelf: 'stretch' }}>
              <input
                id="reject-reason-search"
                type="text"
                value={query}
                onChange={(e) => {
                  isEditingRef.current = true;
                  setQuery(e.target.value);
                  setSelected(null);
                  if (!open) setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => {
                  isEditingRef.current = false;
                  blurTimeoutRef.current = setTimeout(() => setOpen(false), 200);
                }}
                placeholder={loadingReasons ? `${ui('loading')}…` : ui('rejectReasonSearchPlaceholder')}
                disabled={loading || loadingReasons}
                style={inputStyle}
                autoComplete="off"
              />
              <svg style={chevronIconStyle} viewBox="0 0 24 24" width="24" height="24"
                   fill="none" stroke="var(--status-info-bg)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
              {selected && !loading && (
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); handleClear(); }}
                  style={clearBtnStyle}
                  aria-label={ui('clear')}
                >
                  ×
                </button>
              )}

              {open && (
                <div style={dropdownStyle}>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); handleOpenCreate(); }}
                    style={createOptionStyle}
                    disabled={loading}
                  >
                    + {ui('createRejectReason')}
                  </button>
                  {filteredReasons.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onMouseDown={() => handleSelect(r)}
                      style={optionStyle}
                      disabled={loading}
                    >
                      {r.name}
                    </button>
                  ))}
                  {filteredReasons.length === 0 && !loadingReasons && query.length > 0 && (
                    <div style={noResultsStyle}>
                      {ui('rejectReasonNoResults')}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div style={errorStyle}>{error}</div>
        )}

        <div style={buttonsRowStyle}>
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
            onClick={handleConfirm}
            disabled={!canSubmit}
            style={{
              ...(canSubmit ? btnPrimary : btnPrimaryDisabled),
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {loading && (
              <svg style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            )}
            {loading ? ui('soProcessing') : ui('rejectQuotationConfirm')}
          </button>
          <style>{`
            @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            #reject-reason-search::placeholder { color: var(--status-info-fg); opacity: 1; font-family: Inter, sans-serif; font-size: 14px; line-height: 24px; font-weight: 400; }
          `}</style>
        </div>
      </div>

      {showCreate && createPortal(
        <CreateRejectReasonModal
          // When something is already selected, `query` mirrors that
          // selection's name. Opening the create sub-modal at that point
          // means "I want a fresh reason, not a copy of the chosen one",
          // so we seed it blank. When only typed text exists (no selection),
          // pre-filling with that text matches the contact-create pattern.
          initialName={selected ? '' : query}
          quotationId={quotationId}
          apiBaseUrl={apiBaseUrl}
          token={token}
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />,
        document.body,
      )}
    </div>
  );
}

const overlayStyle = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  backgroundColor: 'hsl(var(--foreground) / 0.3)',
};

const cardStyle = {
  position: 'relative',
  width: 375, display: 'flex', flexDirection: 'column',
  padding: '8px 0', backgroundColor: 'hsl(var(--card))',
  boxShadow: '0px 0px 0px 1px hsl(var(--foreground) / 0.1), 0px 24px 48px hsl(var(--foreground) / 0.03), 0px 10px 18px hsl(var(--foreground) / 0.03), 0px 5px 8px hsl(var(--foreground) / 0.04), 0px 2px 4px hsl(var(--foreground) / 0.04)',
  borderRadius: 8,
  fontFamily: 'Inter, sans-serif',
};

const closeBtnStyle = {
  position: 'absolute', top: 6, right: 6,
  width: 24, height: 24, borderRadius: 360,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'transparent', border: 'none', padding: 2,
};

const headerStyle = {
  display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
  padding: '8px 20px', gap: 2, alignSelf: 'stretch',
};

const titleStyle = {
  fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: 20, lineHeight: '32px',
  color: 'hsl(var(--foreground))',
};

const subtitleStyle = {
  fontFamily: 'Inter, sans-serif', fontWeight: 400, fontSize: 12, lineHeight: '16px',
  color: 'hsl(var(--foreground))',
};

const bodyStyle = {
  display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
  padding: '4px 20px 8px', gap: 12, alignSelf: 'stretch',
};

const descriptionStyle = {
  fontFamily: 'Inter, sans-serif', fontWeight: 400, fontSize: 12, lineHeight: '16px',
  color: 'hsl(var(--foreground))', alignSelf: 'stretch',
};

const fieldGroupStyle = {
  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8,
  alignSelf: 'stretch',
};

const labelRowStyle = {
  display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 4,
  alignSelf: 'stretch',
};

const labelTextStyle = {
  fontFamily: 'Inter, sans-serif', fontWeight: 500, fontSize: 14, lineHeight: '24px',
  color: 'hsl(var(--foreground))',
};

const asteriskStyle = {
  fontFamily: 'Inter, sans-serif', fontWeight: 400, fontSize: 14, lineHeight: '24px',
  color: 'hsl(var(--destructive))',
};

// Input matches Figma frame "Text Input": 335×40, border 1px hsl(var(--foreground)), radius 8.
// Spec composes its inner layout as nested wraps (text wrap padding 0 8,
// chevron wrap 28 wide padding 0 4 0 0, chevron 24×24). We collapse that
// into explicit input padding so the visual placement of text and chevron
// matches without nesting flex containers.
const inputStyle = {
  width: '100%', boxSizing: 'border-box', height: 40,
  fontFamily: 'Inter, sans-serif', fontSize: 14, lineHeight: '24px', color: 'hsl(var(--foreground))',
  border: '1px solid hsl(var(--foreground))', borderRadius: 8,
  padding: '8px 44px 8px 16px',
  background: 'hsl(var(--card))',
  boxShadow: '0px 1px 2px hsl(var(--foreground) / 0.05)',
  outline: 'none',
};

const chevronIconStyle = {
  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
  width: 24, height: 24,
  pointerEvents: 'none',
};

const clearBtnStyle = {
  position: 'absolute', right: 40, top: '50%', transform: 'translateY(-50%)',
  width: 20, height: 20, borderRadius: '50%',
  border: 'none', background: 'transparent', color: 'var(--status-info-bg)',
  cursor: 'pointer', fontSize: 16, lineHeight: 1,
};

const dropdownStyle = {
  position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, zIndex: 51,
  background: 'hsl(var(--card))', border: '1px solid hsl(var(--card))', borderRadius: 8,
  boxShadow: '0 4px 12px hsl(var(--foreground) / 0.08)',
  maxHeight: 220, overflowY: 'auto',
};

const createOptionStyle = {
  display: 'block', width: '100%', textAlign: 'left',
  padding: '8px 12px',
  fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 500, lineHeight: '24px',
  color: 'hsl(var(--foreground))', background: 'transparent',
  border: 'none', borderBottom: '1px solid hsl(var(--card))',
  cursor: 'pointer',
};

const optionStyle = {
  display: 'block', width: '100%', textAlign: 'left',
  padding: '8px 12px',
  fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 400, lineHeight: '24px',
  color: 'hsl(var(--foreground))', background: 'transparent', border: 'none', cursor: 'pointer',
};

const noResultsStyle = {
  padding: '8px 12px',
  fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'var(--status-info-bg)',
};

const errorStyle = {
  padding: '8px 20px',
  fontFamily: 'Inter, sans-serif', fontSize: 12,
  color: 'hsl(var(--destructive))', background: 'hsl(var(--card))',
  borderTop: '0.5px solid hsl(var(--destructive))',
};

const buttonsRowStyle = {
  display: 'flex', flexDirection: 'row', justifyContent: 'flex-end',
  alignItems: 'center', gap: 12, padding: '12px 20px', alignSelf: 'stretch',
};

// Button widths match the Figma frame (Screenshot 2026-04-30 11-39-55):
// Cancelar = 132×40, Rechazar presupuesto = 191×40. Both centered.
// Palette mirrors EntityCreationModal / CreateRejectReasonModal.
const btnSecondary = {
  width: 132, height: 40,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 14, fontWeight: 500, lineHeight: '24px', padding: '8px 12px',
  borderRadius: 360, fontFamily: 'Inter, sans-serif',
  border: '1px solid hsl(var(--card))', background: 'hsl(var(--card))', color: 'hsl(var(--foreground))',
  boxShadow: '0px 1px 2px hsl(var(--foreground) / 0.05)',
};

const btnPrimary = {
  width: 191, height: 40,
  fontSize: 14, fontWeight: 500, lineHeight: '24px', padding: '8px 12px',
  borderRadius: 360, fontFamily: 'Inter, sans-serif',
  border: 'none', background: 'hsl(var(--foreground))', color: 'hsl(var(--card))',
};

const btnPrimaryDisabled = {
  width: 191, height: 40,
  fontSize: 14, fontWeight: 500, lineHeight: '24px', padding: '8px 12px',
  borderRadius: 360, fontFamily: 'Inter, sans-serif',
  border: 'none', background: 'hsl(var(--card))', color: 'hsl(var(--card))',
};
