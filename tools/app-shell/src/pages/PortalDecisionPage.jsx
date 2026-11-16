import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, Ban, CheckCircle2, FileText, Loader2 } from 'lucide-react';
import { useUI } from '@/i18n';
import { Button } from '@/components/ui/button';
import { useApiFetch } from '@/auth/useApiFetch.js';
import {
  PORTAL_DECISION_STATE, PORTAL_ERROR, confirmPortalDecision, resolvePortalBaseUrl,
} from '@/lib/portal/portalApi.js';
import { PORTAL_REJECT_REASONS } from './portal/portalPresentation.js';

/**
 * The confirmation landing of a portal quotation decision (ETP-6209 Part C): the page the
 * confirmation email's button opens, at `/portal/decision/:token`.
 *
 * <b>One step</b> (ETP-6209, call with the PO): the email's button ("Confirmar rechazo" /
 * "Confirmar aceptación") is the confirmation. As soon as the page opens, its script sends the
 * confirmation POST and then shows the result ("Has rechazado el presupuesto…", already applied,
 * superseded, no longer pending, expired). <b>A bare GET of the URL applies nothing</b>: a link
 * scanner that does not run the page's script never reaches the POST. The token is moved from the
 * path into its own header (`X-Portal-Decision-Token`) — never into a query string. A token is
 * single use and never expires; a second open answers what happened to it. Unknown tokens get the
 * portal's generic invalid-link screen. A failed POST (network) offers a retry.
 */

const VIEW = Object.freeze({ applying: 'applying', ready: 'ready', invalid: 'invalid', failed: 'failed' });

/** Title, description and icon per state. */
const STATE_COPY = Object.freeze({
  [PORTAL_DECISION_STATE.confirmed]: { titleKey: 'portalDecisionConfirmedTitle', descriptionKey: 'portalDecisionConfirmedDescription', tone: 'success' },
  [PORTAL_DECISION_STATE.voided]: { titleKey: 'portalDecisionVoidedTitle', descriptionKey: 'portalDecisionVoidedDescription', tone: 'neutral' },
  [PORTAL_DECISION_STATE.notPending]: { titleKey: 'portalDecisionNotPendingTitle', descriptionKey: 'portalDecisionNotPendingDescription', tone: 'neutral' },
  [PORTAL_DECISION_STATE.expired]: { titleKey: 'portalDecisionExpiredTitle', descriptionKey: 'portalDecisionExpiredDescription', tone: 'neutral' },
});

function Frame({ children }) {
  return (
    <div className="min-h-screen bg-background px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-xl">{children}</div>
    </div>
  );
}

function Card({ testId, icon, title, description, children, tenantName }) {
  return (
    <div
      className="flex flex-col items-center rounded-xl border border-border bg-card px-6 py-10 text-center shadow-sm"
      data-testid={testId}
    >
      {tenantName ? <span className="mb-4 text-sm font-semibold text-muted-foreground">{tenantName}</span> : null}
      {icon}
      <h1 className="mt-5 text-xl font-semibold text-foreground">{title}</h1>
      {description ? <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {children}
    </div>
  );
}

/** The result card's title: what this open applied, or what had already happened. */
function resultTitle(decision, copy) {
  if (decision.state === PORTAL_DECISION_STATE.confirmed && decision.appliedNow) {
    return decision.decision === 'ACCEPT' ? 'portalDecisionAppliedAcceptTitle' : 'portalDecisionAppliedRejectTitle';
  }
  return copy.titleKey;
}

export default function PortalDecisionPage() {
  const { token = '' } = useParams();
  const ui = useUI();
  const baseUrl = useMemo(() => resolvePortalBaseUrl(), []);
  const apiFetch = useApiFetch(baseUrl);
  const [view, setView] = useState(VIEW.applying);
  const [decision, setDecision] = useState(null);

  // The token whose confirmation was already sent: the POST goes out once per open, also under
  // StrictMode's double effect in development (a second POST would answer "already applied").
  const sentFor = useRef(null);

  const apply = useCallback(() => {
    const trimmed = token.trim();
    if (!trimmed) {
      setView(VIEW.invalid);
      return;
    }
    setView(VIEW.applying);
    confirmPortalDecision(apiFetch, trimmed).then((result) => {
      setDecision(result);
      setView(VIEW.ready);
    }).catch((error) => {
      setView(error?.code === PORTAL_ERROR.invalidLink ? VIEW.invalid : VIEW.failed);
    });
  }, [apiFetch, token]);

  // The confirmation is the page's own POST, sent once on open (never a GET side effect).
  useEffect(() => {
    if (sentFor.current === token) return;
    sentFor.current = token;
    apply();
  }, [apply, token]);

  if (view === VIEW.applying) {
    return (
      <Frame data-testid="Frame__be410c">
        <Card
          testId="portal-decision-applying"
          icon={<Loader2
            className="h-8 w-8 animate-spin text-primary"
            data-testid="Loader2__be410c" />}
          title={ui('portalDecisionApplying')}
          data-testid="Card__be410c" />
      </Frame>
    );
  }
  if (view === VIEW.invalid) {
    return (
      <Frame data-testid="Frame__be410c">
        <Card
          testId="portal-decision-invalid"
          icon={<Ban
            className="h-8 w-8 text-muted-foreground"
            aria-hidden="true"
            data-testid="Ban__be410c" />}
          title={ui('portalInvalidLinkTitle')}
          description={ui('portalInvalidLinkDescription')}
          data-testid="Card__be410c" />
      </Frame>
    );
  }
  if (view === VIEW.failed) {
    return (
      <Frame data-testid="Frame__be410c">
        <Card
          testId="portal-decision-failed"
          icon={<AlertCircle
            className="h-8 w-8 text-destructive"
            aria-hidden="true"
            data-testid="AlertCircle__be410c" />}
          title={ui('portalDecisionConfirmFailed')}
          data-testid="Card__be410c">
          <Button className="mt-6" onClick={() => apply()} data-testid="portal-decision-retry">
            {ui('retry')}
          </Button>
        </Card>
      </Frame>
    );
  }

  const params = { number: decision.documentNo ?? '', tenantName: decision.tenantName ?? '' };
  const reasonLabel = PORTAL_REJECT_REASONS.find((r) => r.code === decision.reasonCode)?.labelKey;
  const appliedNow = decision.state === PORTAL_DECISION_STATE.confirmed && decision.appliedNow;
  // `pending` should not come back from a confirmation; it reads as "no longer pending" here.
  const copy = STATE_COPY[decision.state] ?? STATE_COPY[PORTAL_DECISION_STATE.notPending];
  return (
    <Frame data-testid="Frame__be410c">
      <Card
        testId={appliedNow ? 'portal-decision-applied' : `portal-decision-${decision.state}`}
        tenantName={decision.tenantName}
        icon={copy.tone === 'success'
          ? <CheckCircle2
          className="h-8 w-8 text-[var(--status-success-fg)]"
          aria-hidden="true"
          data-testid="CheckCircle2__be410c" />
          : <FileText
          className="h-8 w-8 text-muted-foreground"
          aria-hidden="true"
          data-testid="FileText__be410c" />}
        title={appliedNow ? `${ui(resultTitle(decision, copy))} ${params.number}`.trim() : ui(resultTitle(decision, copy))}
        description={ui(appliedNow ? 'portalDecisionAppliedDescription' : copy.descriptionKey, params)}
        data-testid="Card__be410c">
        {appliedNow && reasonLabel ? (
          <p className="mt-3 text-sm" data-testid="portal-decision-reason">
            <span className="font-medium">{ui('portalRejectReasonLabel')}:</span>{' '}
            {ui(reasonLabel)}{decision.reasonText ? ` — ${decision.reasonText}` : ''}
          </p>
        ) : null}
      </Card>
    </Frame>
  );
}
