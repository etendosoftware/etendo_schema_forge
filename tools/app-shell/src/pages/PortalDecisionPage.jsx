import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircleIcon, CircleNotchIcon, FileTextIcon, ProhibitIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { useUI } from '@/i18n';
import { Button } from '@/components/ui/button';
import { usePortalApiFetch } from '@/lib/portal/usePortalApiFetch.js';
import {
  PORTAL_DECISION_STATE, PORTAL_ERROR, confirmPortalDecision, fetchPortalDecision,
  resolvePortalBaseUrl,
} from '@/lib/portal/portalApi.js';
import { PORTAL_REJECT_REASONS } from './portal/portalPresentation.js';
import {
  PORTAL_NOTICE_STATE_KEY, portalDecisionNotice, portalEntryPath,
} from './portal/portalDecisionArrival.js';

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

/**
 * Pause before the one automatic resend of a lost confirmation: long enough for a dropped
 * connection to come back, short enough that the customer still sees one "applying" step.
 */
export const CONFIRM_RESEND_DELAY_MS = 400;

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

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

export default function PortalDecisionPage({ resendDelayMs = CONFIRM_RESEND_DELAY_MS } = {}) {
  const { token = '' } = useParams();
  const ui = useUI();
  const baseUrl = useMemo(() => resolvePortalBaseUrl(), []);
  const apiFetch = usePortalApiFetch(baseUrl);
  const [view, setView] = useState(VIEW.applying);
  const [decision, setDecision] = useState(null);
  const navigate = useNavigate();

  // The token whose confirmation was already sent: the POST goes out once per open, also under
  // StrictMode's double effect in development (a second POST would answer "already applied").
  const sentFor = useRef(null);
  // Whether the page is still mounted: once the customer leaves, nothing the confirmation chain
  // still has in flight may resend, navigate or set state (ETP-6209 QA BUG-1). Set back to true on
  // mount, so StrictMode's mount → unmount → mount in development keeps it alive.
  const alive = useRef(true);
  // One confirmation chain at a time: a second click on "Reintentar" before the first re-renders
  // must not send a second POST. Per page instance, not per token: no in-app flow navigates from
  // one decision token to another; each email link is a fresh page load.
  const inFlight = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  /**
   * Last resort, once the confirm POST AND its resend both failed without an answer we could
   * read: before saying "we could not apply it", ask the read-only view whether it was applied
   * anyway. Only a decision that is no longer `pending` replaces the failure card, and it shows
   * what the view says ("this decision was already applied"): the view never carries `appliedNow`
   * nor the portal token, so it cannot claim "you have just rejected…" nor open the portal. A
   * still-pending decision, or a view that fails too, keeps the retry.
   */
  const settleFromView = useCallback((decisionToken) => fetchPortalDecision(apiFetch, decisionToken)
    .then((current) => {
      if (!alive.current) return;
      if (current.state === PORTAL_DECISION_STATE.pending) {
        setView(VIEW.failed);
        return;
      }
      setDecision(current);
      setView(VIEW.ready);
    }, (error) => {
      if (!alive.current) return;
      setView(error?.code === PORTAL_ERROR.invalidLink ? VIEW.invalid : VIEW.failed);
    }), [apiFetch]);

  /** A confirm answer: into the portal when it carries a way in, else this page's own card. */
  const showResult = useCallback((result) => {
    if (!alive.current) return;
    // ETP-6209: the customer is taken into the portal on the quotation, with a one-off notice in
    // the router state (never the URL). Without a way in, this page shows its own card.
    const entryPath = portalEntryPath(result);
    if (entryPath) {
      navigate(entryPath, { replace: true, state: { [PORTAL_NOTICE_STATE_KEY]: portalDecisionNotice(result) } });
      return;
    }
    setDecision(result);
    setView(VIEW.ready);
  }, [navigate]);

  /**
   * Sends the confirmation; when it fails without a readable answer (other than a dead link) —
   * no answer, a 5xx or 429, or a 200 whose body was cut mid-read — it is resent ONCE, after a
   * short backoff, before anything else. A request can be committed by the backend and still be
   * lost on the way back (a cut connection — ETP-6209), and the customer must not be told to
   * retry a decision that already took effect. The resend is safe: the confirmation is single-use
   * server-side, so an applied decision is never applied twice, and its answer still carries the
   * portal token, so the customer still enters the portal.
   *
   * Its answer says `appliedNow: false` when the lost call had applied it, so the notice reads
   * "already answered". That wording is kept on purpose: nothing in the answer tells this page's
   * own lost call apart from an earlier open of the same link (no timestamp, no request id), and
   * claiming "you have just rejected…" would be false for a genuinely re-opened link.
   *
   * Anything that throws past these steps (rendering the result, navigating) ends on the failure
   * card with its retry, never stuck on "applying". Once the page is gone, the chain stops.
   */
  const apply = useCallback(() => {
    const trimmed = token.trim();
    if (!trimmed) {
      setView(VIEW.invalid);
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    setView(VIEW.applying);
    const onFailure = (next) => (error) => {
      if (!alive.current) return undefined;
      if (error?.code === PORTAL_ERROR.invalidLink) {
        setView(VIEW.invalid);
        return undefined;
      }
      return next();
    };
    const resend = () => wait(resendDelayMs)
      .then(() => (alive.current ? confirmPortalDecision(apiFetch, trimmed) : undefined))
      .then(
        (result) => (result === undefined ? undefined : showResult(result)),
        onFailure(() => settleFromView(trimmed)),
      );
    confirmPortalDecision(apiFetch, trimmed)
      .then(showResult, onFailure(resend))
      .catch(() => { if (alive.current) setView(VIEW.failed); })
      .finally(() => { inFlight.current = false; });
  }, [apiFetch, token, showResult, settleFromView, resendDelayMs]);

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
          icon={<CircleNotchIcon
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
          icon={<ProhibitIcon
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
          icon={<WarningCircleIcon
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
          ? <CheckCircleIcon
          className="h-8 w-8 text-[var(--status-success-fg)]"
          aria-hidden="true"
          data-testid="CheckCircle2__be410c" />
          : <FileTextIcon
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
