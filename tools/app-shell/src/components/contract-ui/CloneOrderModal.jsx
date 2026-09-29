import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUI, useLocale } from '@/i18n';
import { statusLabel } from '@/lib/statusBadge.js';
import { StatusTag } from '@/components/ui/status-tag';
import { trackDocumentCreated } from '@/lib/observability/health-events.js';
import { useApiFetch } from '@/auth/useApiFetch.js';
// ETP-5073 / DOC-09 + DOC-10: the dirty-state gate reads the SAME registry the beforeunload
// guard and the locale switcher read. Gating HERE rather than in each window's topbar is what
// makes one fix cover all of them: every window that offers cloning renders this very component
// (sales-invoice, purchase-order, goods-shipment, goods-receipt, ReturnWindowShell, the grid's
// row action), and each one had its own enable/disable decision — which is precisely why Clone
// was reachable over a dirty form.
import { hasUnsavedChanges } from '@/lib/unsavedChanges.js';

// ETP-5547: every cloned row carries a `cloneStatus` so State 2 never shows a link to a record
// that does not exist.
//   ok        — the follow-up GET answered 2xx: the record exists (an unparseable body only
//               costs the documentNo / business partner, not the link).
//   notFound  — the GET answered 404: the clone POST said 201 but the record is gone (the
//               transaction was rolled back after the response). Rendered as a failed row.
//   unverified — the GET failed for any other reason (network, 5xx, 403): the record most
//               likely exists, so the row stays clickable, but it is flagged instead of being
//               presented as a confirmed success.
//   missingId — the POST answered 2xx without a usable id: a copy was created but cannot be
//               linked, so the row points the user to the list instead.
const CLONE_STATUS = Object.freeze({
  OK: 'ok', NOT_FOUND: 'notFound', UNVERIFIED: 'unverified', MISSING_ID: 'missingId',
});

function extractRecord(json) {
  const raw = json?.response?.data;
  return (Array.isArray(raw) ? raw[0] : raw) ?? {};
}

// ASSUMPTION: the server commits the clone transaction BEFORE the POST response reaches the
// client (NeoServlet does no early response flush), so a 404 here means the clone truly does not
// exist. If an early flush is ever introduced, this GET could race the commit and produce false
// `notFound` rows.
async function verifyClonedRecord(apiFetch, headerEntity, id) {
  if (!id) return { id: null, cloneStatus: CLONE_STATUS.MISSING_ID };
  try {
    const r = await apiFetch(`/${headerEntity}/${id}`);
    if (r.status === 404) return { id, cloneStatus: CLONE_STATUS.NOT_FOUND };
    if (!r.ok) return { id, cloneStatus: CLONE_STATUS.UNVERIFIED };
    const json = await r.json().catch(() => null);
    return { id, ...extractRecord(json), cloneStatus: CLONE_STATUS.OK };
  } catch {
    return { id, cloneStatus: CLONE_STATUS.UNVERIFIED };
  }
}

// Re-reads each freshly cloned header so State 2 can list them with their own documentNo /
// business partner / status instead of bare ids — and, since ETP-5547, so a clone that the
// server reported but that does not actually exist is caught before we link to it.
function fetchClonedRecords(apiFetch, headerEntity, newIds) {
  return Promise.all(newIds.map(id => verifyClonedRecord(apiFetch, headerEntity, id)));
}

// A clone can be navigated to only when it has an id and the GET did not prove it missing.
function isNavigableClone(rec) {
  return !!rec.id && rec.cloneStatus !== CLONE_STATUS.NOT_FOUND && rec.cloneStatus !== CLONE_STATUS.MISSING_ID;
}

const CLONE_STATUS_MESSAGE_KEY = {
  [CLONE_STATUS.NOT_FOUND]: 'cloneResultNotFound',
  [CLONE_STATUS.UNVERIFIED]: 'cloneResultUnverified',
  [CLONE_STATUS.MISSING_ID]: 'cloneResultMissingId',
};

// Singular/plural copy for the two states. Kept together (and out of the component) because all
// three strings switch on the same count and the many-variants share the {count} placeholder.
// `created` is the number of clones NOT proven missing by the follow-up GET (ETP-5547): the
// done title only ever counts those, and switches to the failure copy when there are none.
function buildCloneTitles(n, ui, created = n) {
  const one = n === 1;
  let doneTitle;
  if (created === 0) {
    doneTitle = one ? ui('cloneFailedTitleOne') : ui('cloneFailedTitleMany').replace('{count}', n);
  } else {
    doneTitle = created === 1 ? ui('cloneDoneTitleOne') : ui('cloneDoneTitleMany').replace('{count}', created);
  }
  return {
    confirmTitle: one ? ui('cloneConfirmTitleOne') : ui('cloneConfirmTitleMany').replace('{count}', n),
    confirmSub: one ? ui('cloneConfirmSubtitleOne') : ui('cloneConfirmSubtitleMany').replace('{count}', n),
    doneTitle,
  };
}

// NEO reports a failed action at one of several depths depending on where it was raised
// (handler, servlet, DAL), so all four shapes are tried before the generic i18n fallback.
function extractCloneErrorMessage(json, fallback) {
  return json?.error?.message
    || json?.response?.error?.message
    || json?.response?.message
    || json?.message
    || fallback;
}

function CloneIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function Spinner() {
  return (
    <>
      <svg style={{ width: 15, height: 15, animation: 'spin 1s linear infinite', flexShrink: 0 }}
        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      </svg>
      <style>{`@keyframes spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }`}</style>
    </>
  );
}

function DocStatusTag({ status, dictionary }) {
  return (
    <StatusTag
      status={status}
      label={statusLabel(status, dictionary)}
      data-testid="StatusTag__66b049" />
  );
}

/**
 * Modal for cloning one or more records.
 *
 * State 1 — Confirmation: lists selected documents + full-width clone button.
 * State 2 — Done: lists cloned documents as clickable links; replaces State 1 in place. Each
 *           row is verified with a GET first (ETP-5547): a 404 renders as a failed, non-clickable
 *           row; any other GET failure stays clickable but flagged as unverified; when every
 *           clone is missing the title switches to the failure copy.
 *
 * Props:
 *   records        — rowObject[] for grid multi-clone (each row has id, documentNo?, businessPartner$_identifier?, documentStatus?)
 *   recordId       — string (legacy single-record form, e.g. from topbars)
 *   data           — row object (legacy single-record data)
 *   apiBaseUrl     — e.g. '/sws/neo/sales-order'
 *   headers        — { Authorization, Content-Type }
 *   onClose        — () => void
 *   routePrefix    — e.g. '/sales-order/' — enables State 2 with internal navigation
 *   onCloned       — (newId|newIds) => void — legacy callback when no routePrefix (topbars)
 *   cloneActionName — defaults to 'cloneRecord'
 *   headerEntity   — entity name to fetch cloned records, defaults to 'header'
 *   errorKey       — i18n key for error text
 *   processingKey  — i18n key for loading text
 */
export default function CloneOrderModal({
  records: recordsProp,
  recordId,
  data,
  apiBaseUrl,
  headers,
  onClose,
  routePrefix,
  onCloned,
  cloneActionName = 'cloneRecord',
  headerEntity = 'header',
  errorKey = 'cloneOrderError',
  processingKey = 'soProcessing',
}) {
  const navigate = useNavigate();
  const ui = useUI();
  const dictionary = useLocale();
  const apiFetch = useApiFetch(apiBaseUrl);

  const items = recordsProp ?? (recordId ? [{ id: recordId, ...data }] : []);
  const n = items.length;

  const [phase, setPhase]           = useState('confirm'); // 'confirm' | 'cloning' | 'done'
  // Snapshotted at mount (i.e. when the modal opens) rather than read on every render: while this
  // modal is up the form behind it cannot be edited or saved, so the answer cannot legitimately
  // change, and a stable value keeps the banner from flickering on unrelated re-renders.
  const [blockedByUnsaved] = useState(() => hasUnsavedChanges());
  const [error, setError]           = useState(null);
  const [clonedRecords, setCloned]  = useState([]);
  const [hoveredId, setHoveredId]   = useState(null);

  const createdCount = clonedRecords.filter(rec => rec.cloneStatus !== CLONE_STATUS.NOT_FOUND).length;
  const allFailed = phase === 'done' && createdCount === 0;
  const { confirmTitle, confirmSub, doneTitle } = buildCloneTitles(n, ui, phase === 'done' ? createdCount : n);

  const handleClone = async () => {
    setPhase('cloning');
    setError(null);
    try {
      const newIds = [];
      for (const item of items) {
        const res  = await apiFetch(`/${headerEntity}/${item.id}/action/${cloneActionName}`, { method: 'POST' });
        // ETP-5547: an empty / non-JSON body must not turn a created clone into the generic
        // error — a 2xx without a usable id is reported per row as `missingId` instead.
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setError(extractCloneErrorMessage(json, ui(errorKey)));
          setPhase('confirm');
          return;
        }
        newIds.push(json?.response?.data?.id ?? null);
        trackDocumentCreated();
      }

      const fetched = await fetchClonedRecords(apiFetch, headerEntity, newIds);
      // Only clones that can be opened are handed to the caller: a caller-side navigation to a
      // missing id is the very false success ETP-5547 removes.
      const usableIds = fetched.filter(isNavigableClone).map(rec => rec.id);
      const result = n > 1 ? usableIds : usableIds[0];
      if (routePrefix) {
        setCloned(fetched);
        setPhase('done');
        if (usableIds.length > 0) onCloned?.(result);
      } else if (usableIds.length === fetched.length) {
        onClose();
        onCloned?.(result);
      } else {
        // Legacy caller (no routePrefix) and at least one clone cannot be opened: show State 2
        // with the per-row outcome instead of closing and navigating to a missing record.
        setCloned(fetched);
        setPhase('done');
      }
    } catch {
      setError(ui(errorKey));
      setPhase('confirm');
    }
  };

  const handleRowClick = (id) => {
    onClose();
    navigate(`${routePrefix}${id}`);
  };

  return (
    <div style={overlay} onClick={phase === 'cloning' ? undefined : onClose}>
      <div style={card} onClick={e => e.stopPropagation()}>

        {phase === 'done' ? (
          /* ── STATE 2: Done ── */
          (<>
            <div style={{ ...modalHeader, background: allFailed ? 'var(--status-destructive-bg)' : 'var(--status-success-bg)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {allFailed ? (
                  <div style={{ ...iconBox, background: 'var(--status-destructive-bg)', color: 'var(--status-destructive-fg)' }}>
                    <InfoIcon data-testid="InfoIcon__66b049" />
                  </div>
                ) : (
                  <div style={{ ...iconBox, background: 'var(--status-success-bg)', color: 'var(--status-success-fg)' }}>
                    <CheckIcon size={18} data-testid="CheckIcon__66b049" />
                  </div>
                )}
                <div>
                  <div style={titleStyle} data-testid="clone-done-title">{doneTitle}</div>
                  <div style={subtitleStyle}>{ui(allFailed ? 'cloneFailedSubtitle' : 'cloneDoneSubtitle')}</div>
                </div>
              </div>
              <button type="button" onClick={onClose} style={closeBtn}>×</button>
            </div>
            <div style={{ overflowY: 'auto', maxHeight: 360 }}>
              {clonedRecords.map((rec, index) => {
                const navigable = !!routePrefix && isNavigableClone(rec);
                const failed = rec.cloneStatus === CLONE_STATUS.NOT_FOUND;
                const messageKey = CLONE_STATUS_MESSAGE_KEY[rec.cloneStatus];
                const rowKey = rec.id ?? `missing-${index}`;
                const hovered = navigable && hoveredId === rec.id;
                let messageColor = 'var(--status-warning-fg)';
                if (failed) messageColor = 'var(--status-destructive-fg)';
                return (
                  <div
                    key={rowKey}
                    data-testid={`clone-result-${rowKey}`}
                    data-clone-status={rec.cloneStatus}
                    onClick={navigable ? () => handleRowClick(rec.id) : undefined}
                    onMouseEnter={navigable ? () => setHoveredId(rec.id) : undefined}
                    onMouseLeave={navigable ? () => setHoveredId(null) : undefined}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px',
                      borderBottom: '1px solid hsl(var(--muted))', cursor: navigable ? 'pointer' : 'default',
                      background: (failed && 'var(--status-destructive-bg)') || (hovered ? 'hsl(var(--muted))' : 'hsl(var(--card))'),
                      transition: 'background 0.12s',
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 600, color: navigable ? 'var(--status-info-fg)' : 'hsl(var(--muted-foreground))', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {rec.documentNo || rec.id || ''}
                    </span>
                    {messageKey ? (
                      <span
                        data-testid={`clone-result-message-${rowKey}`}
                        style={{ fontSize: 12, color: messageColor, flex: 1, lineHeight: 1.4 }}
                      >
                        {ui(messageKey)}
                      </span>
                    ) : (
                      <span style={{ fontSize: 13, color: 'hsl(var(--foreground))', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {rec['businessPartner$_identifier'] || ''}
                      </span>
                    )}
                    {rec.cloneStatus === CLONE_STATUS.OK && (
                      <DocStatusTag status="DR" dictionary={dictionary} data-testid="DocStatusTag__66b049" />
                    )}
                    {navigable && (
                      <span style={{ color: 'hsl(var(--text-disabled))', opacity: hovered ? 1 : 0, transition: 'opacity 0.12s', flexShrink: 0 }}>
                        <ArrowRightIcon data-testid="ArrowRightIcon__66b049" />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </>)
        ) : (
          /* ── STATE 1: Confirm ── */
          (<>
            <div style={{ ...modalHeader, background: 'var(--status-info-bg)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ ...iconBox, background: 'var(--status-info-bg)', color: 'var(--status-info-fg)' }}>
                  <CloneIcon size={18} data-testid="CloneIcon__66b049" />
                </div>
                <div>
                  <div style={titleStyle}>{confirmTitle}</div>
                  <div style={subtitleStyle}>{confirmSub}</div>
                </div>
              </div>
              <button type="button" onClick={onClose} style={closeBtn} disabled={phase === 'cloning'}>×</button>
            </div>
            {/* Document list */}
            <div style={{ overflowY: 'auto', maxHeight: 240, borderBottom: '1px solid hsl(var(--muted))' }}>
              {items.map((item) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px', borderBottom: '1px solid hsl(var(--muted))', background: 'hsl(var(--card))' }}>
                  <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {item.documentNo || item.id}
                  </span>
                  <span style={{ fontSize: 13, color: 'hsl(var(--foreground))', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item['businessPartner$_identifier'] || ''}
                  </span>
                  {item.documentStatus && <DocStatusTag
                    status={item.documentStatus}
                    dictionary={dictionary}
                    data-testid="DocStatusTag__66b049" />}
                </div>
              ))}
            </div>
            <div style={{ padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Info banner — or the unsaved-changes refusal, which replaces it: showing both
                  would bury the one thing the user has to act on. */}
              {blockedByUnsaved ? (
                <div data-testid="clone-blocked-unsaved" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: 'var(--status-warning-bg)', borderRadius: 8, border: '1px solid var(--status-warning-border)' }}>
                  <span style={{ color: 'var(--status-warning-fg)', flexShrink: 0, marginTop: 1 }}><InfoIcon data-testid="InfoIcon__66b049" /></span>
                  <span style={{ fontSize: 12, color: 'var(--status-warning-fg)', lineHeight: 1.5 }}>{ui('cloneBlockedUnsavedChanges')}</span>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: 'var(--status-info-bg)', borderRadius: 8, border: '1px solid var(--status-info-border)' }}>
                  <span style={{ color: 'var(--status-info-fg)', flexShrink: 0, marginTop: 1 }}><InfoIcon data-testid="InfoIcon__66b049" /></span>
                  <span style={{ fontSize: 12, color: 'var(--status-info-fg)', lineHeight: 1.5 }}>{ui('cloneInfoBanner')}</span>
                </div>
              )}

              {error && <div style={{ color: 'hsl(var(--destructive))', fontSize: 12 }}>{error}</div>}

              {/* Clone button */}
              <button
                type="button"
                data-testid="action-clone-record"
                onClick={handleClone}
                disabled={phase === 'cloning' || blockedByUnsaved}
                title={blockedByUnsaved ? ui('cloneBlockedUnsavedChanges') : undefined}
                style={{ ...btnPrimary, width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 8, opacity: (phase === 'cloning' || blockedByUnsaved) ? 0.6 : 1, cursor: (phase === 'cloning' || blockedByUnsaved) ? 'not-allowed' : 'pointer' }}
              >
                {phase === 'cloning' ? <Spinner data-testid="Spinner__66b049" /> : <CloneIcon size={15} data-testid="CloneIcon__66b049" />}
                {phase === 'cloning' ? ui(processingKey) : confirmTitle}
              </button>

            </div>
          </>)
        )}
      </div>
    </div>
  );
}

const overlay = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  backgroundColor: 'hsl(var(--foreground) / 0.3)',
};

const card = {
  width: 460, maxHeight: '85vh', display: 'flex', flexDirection: 'column',
  overflow: 'hidden', borderRadius: 12, backgroundColor: 'hsl(var(--card))',
  boxShadow: '0 8px 30px hsl(var(--foreground) / 0.12)', border: '0.5px solid hsl(var(--border-subtle))',
};

const modalHeader = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '16px 20px', flexShrink: 0,
};

const iconBox = {
  width: 36, height: 36, borderRadius: 8,
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
};

const titleStyle = { fontWeight: 600, fontSize: 15, color: 'hsl(var(--foreground))' };
const subtitleStyle = { fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 2 };

const btnPrimary = {
  padding: '9px 16px', borderRadius: 7, border: 'none',
  background: 'var(--status-info-fg)', color: 'hsl(var(--card))', fontWeight: 500, fontSize: 13,
};

const closeBtn = {
  fontSize: 20, lineHeight: 1, padding: '2px 6px', borderRadius: 4,
  background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--text-disabled))', flexShrink: 0,
};
