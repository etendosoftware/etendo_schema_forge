import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, Info, X } from 'lucide-react';
import { useUI } from '@/i18n';
import { PORTAL_REJECT_REASONS } from './portalPresentation.js';
import { PORTAL_NOTICE_STATE_KEY } from './portalDecisionArrival.js';

/**
 * Reads, once, the notice a decision confirmation handed the portal through router state
 * (ETP-6209 Part C, see `portalDecisionArrival.js`), and drops it from the history entry right away,
 * so a reload or a back navigation does not show it again.
 *
 * @returns {[object|null, () => void]} the notice and its dismiss callback
 */
export function usePortalArrivalNotice() {
  const location = useLocation();
  const navigate = useNavigate();
  const [notice, setNotice] = useState(() => location.state?.[PORTAL_NOTICE_STATE_KEY] ?? null);
  const cleared = useRef(false);

  useEffect(() => {
    if (cleared.current || !location.state?.[PORTAL_NOTICE_STATE_KEY]) return;
    cleared.current = true;
    navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null });
  }, [location, navigate]);

  return [notice, () => setNotice(null)];
}

/** The reject reason line: "Motivo: Precio — <text>". */
function ReasonLine({ notice }) {
  const ui = useUI();
  const labelKey = PORTAL_REJECT_REASONS.find((reason) => reason.code === notice.reasonCode)?.labelKey;
  if (!labelKey) return null;
  return (
    <p className="mt-1" data-testid="portal-arrival-notice-reason">
      <span className="font-medium">{ui('portalRejectReasonLabel')}:</span>{' '}
      {ui(labelKey)}{notice.reasonText ? ` — ${notice.reasonText}` : ''}
    </p>
  );
}

const TONE_CLASS = Object.freeze({
  success: 'border-status-success-border bg-status-success text-status-success-foreground',
  neutral: 'border-border bg-muted text-muted-foreground',
});

/**
 * The portal's one-off notice after a decision confirmation: "Has rechazado el presupuesto …"
 * (with its reason), "Ya habías respondido este presupuesto", no longer pending or expired.
 * Renders nothing without a notice.
 */
export default function PortalArrivalNotice({ notice, onDismiss }) {
  const ui = useUI();
  if (!notice) return null;
  const Icon = notice.tone === 'success' ? CheckCircle2 : Info;
  return (
    <div
      role="status"
      className={`mx-6 mt-4 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm md:mx-1 md:mb-2 md:mt-0 ${TONE_CLASS[notice.tone] ?? TONE_CLASS.neutral}`}
      data-testid="portal-arrival-notice"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" data-testid="PortalArrivalNotice-icon" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{ui(notice.messageKey, { number: notice.number })}</p>
        <ReasonLine notice={notice} data-testid="ReasonLine__portal-arrival" />
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={ui('portalNoticeDismiss')}
        className="shrink-0 rounded p-0.5 hover:bg-background/40"
        data-testid="portal-arrival-notice-dismiss"
      >
        <X className="h-4 w-4" aria-hidden="true" data-testid="PortalArrivalNotice-close-icon" />
      </button>
    </div>
  );
}
