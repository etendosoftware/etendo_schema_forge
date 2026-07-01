import { useState } from 'react';
import { X, Loader2, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { toast } from 'sonner';
import { StatusPill } from './FmPrimitives.jsx';
import { VF_SPEC, VF_INVALIDAS_ENTITY, VF_PARCIAL_ENTITY } from './useFiscalMonitor.js';
import '../fiscal-models/fiscal-models.css';

const STATUS_IN = 'IN';
const STATUS_AE = 'AE';

function getPillStatus(isInvalid, isPartial) {
  if (isInvalid) return 'invalid';
  if (isPartial) return 'partiallyAccepted';
  return 'rejected';
}

function getVfTitle(isSingle, isInvalid, isPartial, ui) {
  if (isSingle) {
    if (isInvalid) return ui('vfSolveError.invalid.title');
    if (isPartial) return ui('vfSolveError.partial.title');
    return ui('vfSolveError.rejected.title');
  }
  return isInvalid ? ui('vfSolveError.invalid.titleMulti') : ui('vfSolveError.partial.titleMulti');
}

function getDescription(isInvalid, isPartial, ui) {
  if (isInvalid) return ui('vfSolveError.invalid.description');
  if (isPartial) return ui('vfSolveError.partial.description');
  return ui('vfSolveError.rejected.description');
}

function getActionLabel(isInvalid, isPartial, ui) {
  if (isInvalid) return ui('vfSolveError.invalid.action');
  if (isPartial) return ui('vfSolveError.partial.action');
  return null;
}

export default function VfSolveErrorModal({ open, onClose, rows, neoApiBase, onResolved }) {
  const ui = useUI();
  const apiFetch = useApiFetch(neoApiBase);
  const [saving, setSaving] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  if (!open || !rows?.length) return null;

  const isSingle  = rows.length === 1;
  const row       = rows[0];
  const status    = row.verifactuSendingStatus;
  const isInvalid = status === STATUS_IN;
  const isPartial = status === STATUS_AE;
  const canResolve = isInvalid || isPartial;

  const invoiceNo = row['invoice$documentNo']
    ?? row['invoice$_identifier']?.split(/\s[–-]\s/)[0]?.trim()
    ?? '—';

  const pillStatus = getPillStatus(isInvalid, isPartial);
  const title = getVfTitle(isSingle, isInvalid, isPartial, ui);
  const description = getDescription(isInvalid, isPartial, ui);
  const actionLabel = getActionLabel(isInvalid, isPartial, ui);

  async function handleResolve() {
    if (saving || !canResolve) return;
    setSaving(true);
    try {
      const results = await Promise.allSettled(
        rows.map(r => {
          if (isInvalid) {
            // Correct_Invoice is a Button-type process — must call the NEO action endpoint,
            // not a regular PUT (the backing table is a VIEW; PUT returns 200 but writes nothing).
            return apiFetch(
              `/${VF_SPEC}/${encodeURIComponent(VF_INVALIDAS_ENTITY)}/${r.id}/action/Correct_Invoice`,
              { method: 'POST' },
            );
          } else {
            return apiFetch(
              `/${VF_SPEC}/${encodeURIComponent(VF_PARCIAL_ENTITY)}/${r.id}`,
              {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isSubsanation: true }),
              },
            );
          }
        })
      );
      const failed = results.filter(r => r.status === 'rejected' || (r.value && !r.value.ok));
      if (failed.length === 0) {
        toast.success(ui('vfSolveError.success'));
        onResolved?.();
        onClose();
      } else {
        toast.error(ui('vfSolveError.saveError'));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fm-modal-overlay"
      data-testid="vf-solve-error-backdrop"
      onClick={onClose}
    >
      <div
        className="fm-config-modal"
        style={{ maxWidth: 560 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="fm-config-modal__header">
          <div className="fm-config-modal__titles">
            <div className="fm-config-modal__title">{title}</div>
            {isSingle && (
              <div className="fm-config-modal__sub" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <span>{invoiceNo}</span>
                <StatusPill estado={pillStatus} data-testid="StatusPill__a6e471" />
              </div>
            )}
          </div>
          <button className="fm-config-modal__close" onClick={onClose} aria-label={ui('close')}>
            <X size={16} data-testid="X__a6e471" />
          </button>
        </div>

        {/* Body */}
        <div className="fm-config-modal__body" style={{ minHeight: 'auto', padding: '16px 20px' }}>

          {/* Single: error detail with collapsible full text */}
          {isSingle && (row.codeError || row.errorReason) && (
            <div style={{
              borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA',
              padding: '10px 12px', marginBottom: 14,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <AlertTriangle
                  size={13}
                  style={{ color: '#DC2626', flexShrink: 0 }}
                  data-testid="AlertTriangle__a6e471" />
                <span style={{ fontSize: 12, fontWeight: 600, color: '#B91C1C' }}>Error</span>
              </div>
              {row.codeError && (
                <p style={{ fontSize: 13, fontFamily: 'monospace', color: '#991B1B', margin: '0 0 4px' }}>
                  [{row.codeError}]
                </p>
              )}
              {row.errorReason && (
                <>
                  <p style={{
                    fontSize: 13, color: '#B91C1C', margin: 0, lineHeight: 1.5,
                    overflowWrap: 'break-word', wordBreak: 'break-word',
                    ...(showDetail ? {} : {
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }),
                  }}>
                    {row.errorReason}
                  </p>
                  {row.errorReason.length > 120 && (
                    <button
                      onClick={() => setShowDetail(v => !v)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 12, color: '#DC2626', background: 'none', border: 'none',
                        cursor: 'pointer', padding: '4px 0', textDecoration: 'underline',
                      }}
                    >
                      {showDetail ? <ChevronUp size={12} data-testid="ChevronUp__a6e471" /> : <ChevronDown size={12} data-testid="ChevronDown__a6e471" />}
                      {showDetail ? ui('vfSolveError.hideDetail') : ui('vfSolveError.showDetail')}
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Multi: list of invoices */}
          {!isSingle && (
            <div style={{
              borderRadius: 8, background: '#F9FAFB', border: '1px solid #E5E7EB',
              padding: '10px 12px', marginBottom: 14, maxHeight: 160, overflowY: 'auto',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <StatusPill estado={pillStatus} data-testid="StatusPill__a6e471" />
                <span style={{ fontSize: 12, fontWeight: 600, color: '#6B7280' }}>
                  {rows.length} {ui('vfSolveError.invoicesSelected')}
                </span>
              </div>
              {rows.map(r => {
                const no = r['invoice$documentNo']
                  ?? r['invoice$_identifier']?.split(/\s[–-]\s/)[0]?.trim()
                  ?? r.id;
                return (
                  <div key={r.id} style={{ padding: '2px 0', fontSize: 13, color: '#374151' }}>
                    {no}
                  </div>
                );
              })}
            </div>
          )}

          {/* Instructions */}
          {description && (
            <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.6, margin: 0 }}>
              {description}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="fm-config-modal__footer">
          <button className="fm-btn fm-btn--cancel-pill" onClick={onClose}>
            {ui('close')}
          </button>
          {canResolve && (
            <button
              className="fm-btn fm-btn--save-pill fm-btn--save-pill--active"
              onClick={handleResolve}
              disabled={saving}
            >
              {saving && <Loader2
                size={13}
                style={{ animation: 'spin 1s linear infinite' }}
                data-testid="Loader2__a6e471" />}
              {actionLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
