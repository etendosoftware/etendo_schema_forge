import {
  CircleNotchIcon,
  CalendarBlankIcon,
  CheckCircleIcon,
  FileTextIcon,
  InfoIcon,
  ProhibitIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';
import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';


import { useUI } from '@/i18n';
import { cn } from '@/lib/utils';
import { usePortalApiFetch } from '@/lib/portal/usePortalApiFetch.js';
import { usePortalFavicon } from './portal/usePortalFavicon.js';
import {
  PORTAL_DECISION_STATE, PORTAL_ERROR, confirmPortalDecision, fetchPortalDecision,
  resolvePortalBaseUrl,
} from '@/lib/portal/portalApi.js';
import { PORTAL_REJECT_REASONS, PORTAL_REJECT_REASON_OTHER } from './portal/portalPresentation.js';
import {
  PortalDate, PortalDocumentStatus, PortalMoney, PORTAL_FIGMA_BUTTON_PRIMARY, PORTAL_FIGMA_SHADOW,
} from './portal/PortalBits.jsx';
import { portalEntryPath } from './portal/portalDecisionArrival.js';

/**
 * The confirmation page of a portal quotation decision (ETP-6209 Part C, redesign "Página de
 * confirmación"): the page the confirmation email's button opens, at `/portal/decision/:token`.
 *
 * <b>One step</b> (ETP-6209, call with the PO): the email's button ("Confirmar rechazo" /
 * "Confirmar aceptación") is the confirmation. As soon as the page opens, its script sends the
 * confirmation POST and then shows the result — "¡Presupuesto aceptado!" / "¡Presupuesto
 * rechazado!" with the quotation's summary (number, issue date or reason, total, status) and "La
 * empresa emisora ha sido notificada de tu decisión"; or already applied, superseded, no longer
 * pending, expired. <b>A bare GET of the URL applies nothing</b>: a link scanner that does not run
 * the page's script never reaches the POST. The token is moved from the path into its own header
 * (`X-Portal-Decision-Token`) — never into a query string. A token is single use and never
 * expires; a second open answers what happened to it. Unknown tokens get the portal's generic
 * invalid-link screen. A failed POST offers a retry.
 *
 * The page no longer opens the portal by itself: its "Portal de clientes" button does, on the
 * quotation, with the portal token only the confirm POST returns (hidden when none came back).
 */

/**
 * Pause before the one automatic resend of a lost confirmation: long enough for a dropped
 * connection to come back, short enough that the customer still sees one "applying" step.
 */
export const CONFIRM_RESEND_DELAY_MS = 400;

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const VIEW = Object.freeze({ applying: 'applying', ready: 'ready', invalid: 'invalid', failed: 'failed' });

/** Title and description per state that applied nothing now. */
const STATE_COPY = Object.freeze({
  [PORTAL_DECISION_STATE.confirmed]: { titleKey: 'portalDecisionConfirmedTitle', descriptionKey: 'portalDecisionConfirmedDescription' },
  [PORTAL_DECISION_STATE.voided]: { titleKey: 'portalDecisionVoidedTitle', descriptionKey: 'portalDecisionVoidedDescription' },
  [PORTAL_DECISION_STATE.notPending]: { titleKey: 'portalDecisionNotPendingTitle', descriptionKey: 'portalDecisionNotPendingDescription' },
  [PORTAL_DECISION_STATE.expired]: { titleKey: 'portalDecisionExpiredTitle', descriptionKey: 'portalDecisionExpiredDescription' },
});

/**
 * The page frame (Figma "Página de confirmación", 2026-11-17): the #F3F5F9 page with 8px padding,
 * a white 12px card, its header (the etendo.ai tile and name; "Portal de clientes" on the right
 * when there is a way in), and the centred content column (784px wide on desktop, full width on a
 * phone, 200px of air below).
 */
function Frame({ onEnter, children }) {
  const ui = useUI();
  return (
    <div className="flex min-h-screen bg-[#F3F5F9] p-2">
      <div className="flex min-h-[calc(100vh-1rem)] flex-1 flex-col overflow-y-auto rounded-xl bg-white">
        <header className="flex items-center justify-between gap-3 p-5">
          <span className="flex items-center gap-2">
            <img src="/logo-etendo-ai.png" alt="" className="h-11 w-11 rounded-[8.8px] object-contain" />
            <span className="text-lg font-semibold tracking-[-0.01em] text-[#1B1A1F]">{ui('portalBrandName')}</span>
          </span>
          {onEnter ? (
            <button
              type="button"
              onClick={onEnter}
              className="flex h-7 items-center rounded-lg border border-[#C7CBD3] bg-[#F3F5F9] px-2 py-1 text-sm leading-5 text-[#40465C] hover:bg-white"
              data-testid="portal-decision-enter"
            >
              {ui('portalCustomerPortalButton')}
            </button>
          ) : null}
        </header>
        <main className="flex flex-1 flex-col items-center px-4 pb-[200px] pt-10">
          <div className="flex w-full max-w-[784px] flex-col items-center gap-5">{children}</div>
        </main>
      </div>
    </div>
  );
}

/** The 52px icon bubbles of the Figma (success, danger, neutral). */
const BUBBLE_TONES = Object.freeze({
  success: 'bg-[#EEFBF4] text-[#1E874C]',
  destructive: 'bg-[#FEF0F4] text-[#D50B3E]',
  neutral: 'bg-[#F3F5F9] text-[#81848F]',
});

/** The state's 52px bubble, title (Plus Jakarta 600 24/36) and text (14/20 #282833). */
function Result({ testId, Icon, tone = 'neutral', spin = false, title, description, children }) {
  return (
    <section className="flex w-full flex-col items-center gap-5 text-center" data-testid={testId}>
      <div className="flex flex-col items-center gap-1 px-7 py-3">
        <span className={cn('mb-2 flex h-[52px] w-[52px] items-center justify-center rounded-full p-[10.4px]', BUBBLE_TONES[tone])}>
          <Icon size={26} className={spin ? 'animate-spin' : ''} aria-hidden="true" data-testid="Icon__be410c" />
        </span>
        <h1 className="text-2xl font-semibold leading-9 tracking-[-0.01em] text-[#1B1A1F]">{title}</h1>
        {description ? <p className="max-w-md text-sm leading-5 text-[#282833]">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** One column of the summary: 16px 24px padding, label 12/16 #6B7280, value 14/20 600. */
function SummaryCell({ label, children, testId, first = false }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1 px-6 py-4', first ? '' : 'sm:border-l sm:border-[#E3E7EC]')} data-testid={testId}>
      <span className="text-xs leading-4 text-[#6B7280]">{label}</span>
      <span className="truncate text-sm font-semibold leading-5 text-[#1B1A1F]">{children}</span>
    </div>
  );
}

/**
 * "Resumen del presupuesto": number, issue date (or the reason of a confirmed rejection), total
 * and the quotation's current status (the app's label, the Figma's colour). Every figure comes from
 * the answer.
 */
function DecisionSummary({ decision, notified }) {
  const ui = useUI();
  const rejected = decision.state === PORTAL_DECISION_STATE.confirmed && decision.decision === 'REJECT';
  const reason = PORTAL_REJECT_REASONS.find((entry) => entry.code === decision.reasonCode);
  const reasonText = decision.reasonCode === PORTAL_REJECT_REASON_OTHER && decision.reasonText
    ? decision.reasonText : null;
  return (
    <div className="w-full rounded-lg bg-[#F3F5F9] p-1 text-left" data-testid="portal-decision-summary">
      <h2 className="px-2 pb-2 pt-1 text-sm font-medium leading-5 text-[#1B1A1F] [font-family:inherit]">{ui('portalDecisionSummaryTitle')}</h2>
      <div className={`grid grid-cols-2 rounded-lg border border-[#E3E7EC] bg-white sm:grid-cols-4 ${PORTAL_FIGMA_SHADOW}`}>
        <SummaryCell first label={ui('portalSummaryNumber')} testId="portal-decision-summary-number" data-testid="SummaryCell__be410c">
          {decision.documentNo || '—'}
        </SummaryCell>
        {rejected ? (
          <SummaryCell label={ui('portalRejectReasonLabel')} testId="portal-decision-reason" data-testid="SummaryCell__be410c">
            {reasonText ?? (reason ? ui(reason.labelKey) : '—')}
          </SummaryCell>
        ) : (
          <SummaryCell label={ui('portalSummaryIssueDate')} testId="portal-decision-summary-date" data-testid="SummaryCell__be410c">
            <span className="inline-flex items-center gap-1.5">
              <CalendarBlankIcon size={16} className="text-[#81848F]" aria-hidden="true" data-testid="CalendarBlank__be410c" />
              <PortalDate value={decision.date} data-testid="PortalDate__be410c" />
            </span>
          </SummaryCell>
        )}
        <SummaryCell label={ui('portalSummaryTotal')} testId="portal-decision-summary-total" data-testid="SummaryCell__be410c">
          <PortalMoney currency={decision.currency} value={decision.grandTotal} data-testid="PortalMoney__be410c" />
        </SummaryCell>
        <SummaryCell label={ui('portalColStatus')} testId="portal-decision-summary-status" data-testid="SummaryCell__be410c">
          {decision.documentStatus ? (
            <PortalDocumentStatus
              status={decision.documentStatus}
              palette="figma"
              className="h-6 rounded-full border-transparent px-2 py-1 font-normal"
              data-testid="PortalDocumentStatus__be410c" />
          ) : '—'}
        </SummaryCell>
      </div>
      {notified ? (
        <p className="flex items-center gap-1.5 px-1 py-2 text-xs leading-4 text-[#6B7280]" data-testid="portal-decision-notified">
          <InfoIcon size={16} className="shrink-0 text-[#81848F]" aria-hidden="true" data-testid="Info__be410c" />
          {ui('portalDecisionNotified')}
        </p>
      ) : null}
    </div>
  );
}

/** The card of a confirmation that shows no result: the customer can always try again. */
function FailedCard({ onRetry }) {
  const ui = useUI();
  return (
    <Frame data-testid="Frame__be410c">
      <Result
        testId="portal-decision-failed"
        Icon={WarningCircleIcon}
        tone="destructive"
        title={ui('portalDecisionConfirmFailed')}
        data-testid="Result__be410c">
        <button type="button" className={PORTAL_FIGMA_BUTTON_PRIMARY} onClick={onRetry} data-testid="portal-decision-retry">
          <span className="px-1">{ui('retry')}</span>
        </button>
      </Result>
    </Frame>
  );
}

/**
 * Keeps a result that cannot be rendered inside the page: a render error is no promise rejection,
 * so the confirmation chain's `.catch` never sees it. It is mounted only while the result shows, so
 * the retry, which moves the page back to "applying", also discards the caught error.
 */
class ResultBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** The result's title and description: what was just applied, else what the decision's state says. */
function decisionResultCopy(decision, ui) {
  if (decision.state === PORTAL_DECISION_STATE.confirmed && decision.appliedNow) {
    const accepted = decision.decision === 'ACCEPT';
    return {
      title: ui(accepted ? 'portalDecisionAcceptedTitle' : 'portalDecisionRejectedTitle'),
      description: ui(accepted ? 'portalDecisionAcceptedDescription' : 'portalDecisionRejectedDescription'),
    };
  }
  const copy = STATE_COPY[decision.state] ?? STATE_COPY[PORTAL_DECISION_STATE.notPending];
  const params = { number: decision.documentNo ?? '', tenantName: decision.tenantName ?? '' };
  return { title: ui(copy.titleKey), description: ui(copy.descriptionKey, params) };
}

/** The result bubble's tone: only a confirmed decision is coloured, by which way it went. */
function decisionResultTone(decision) {
  if (decision.state !== PORTAL_DECISION_STATE.confirmed) return 'neutral';
  return decision.decision === 'ACCEPT' ? 'success' : 'destructive';
}

/** The confirmation's result, with the way into the portal when the answer carries one. */
function DecisionResult({ decision }) {
  const ui = useUI();
  const navigate = useNavigate();
  const entryPath = portalEntryPath(decision);
  const enter = entryPath
    ? () => navigate(entryPath, { replace: true })
    : null;
  const confirmed = decision.state === PORTAL_DECISION_STATE.confirmed;
  const appliedNow = confirmed && decision.appliedNow;
  const { title, description } = decisionResultCopy(decision, ui);
  return (
    <Frame onEnter={enter} data-testid="Frame__be410c">
      <Result
        testId={appliedNow ? 'portal-decision-applied' : `portal-decision-${decision.state}`}
        Icon={confirmed ? CheckCircleIcon : FileTextIcon}
        tone={decisionResultTone(decision)}
        title={title}
        description={description}
        data-testid="Result__be410c">
        {decision.documentNo ? (
          <DecisionSummary decision={decision} notified={confirmed} data-testid="DecisionSummary__be410c" />
        ) : null}
      </Result>
    </Frame>
  );
}

export default function PortalDecisionPage({ resendDelayMs = CONFIRM_RESEND_DELAY_MS } = {}) {
  const { token = '' } = useParams();
  const ui = useUI();
  // The tab icon: index.html's relative favicon does not resolve under /portal/decision/….
  usePortalFavicon();
  const baseUrl = useMemo(() => resolvePortalBaseUrl(), []);
  const apiFetch = usePortalApiFetch(baseUrl);
  const [view, setView] = useState(VIEW.applying);
  const [decision, setDecision] = useState(null);

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

  /**
   * A confirm answer: this page's own result. The way into the portal (its token and quotation)
   * stays in the answer, for the "Portal de clientes" button; nothing navigates by itself.
   */
  const showResult = useCallback((result) => {
    if (!alive.current) return;
    setDecision(result);
    setView(VIEW.ready);
  }, []);

  /**
   * Sends the confirmation; when it fails without a readable answer (other than a dead link) —
   * no answer, a 5xx or 429, or a 200 whose body was cut mid-read — it is resent ONCE, after a
   * short backoff, before anything else. A request can be committed by the backend and still be
   * lost on the way back (a cut connection — ETP-6209), and the customer must not be told to
   * retry a decision that already took effect. The resend is safe: the confirmation is single-use
   * server-side, so an applied decision is never applied twice, and its answer still carries the
   * portal token, so "Portal de clientes" still enters the portal.
   *
   * Its answer says `appliedNow: false` when the lost call had applied it, so the page reads
   * "already applied". That wording is kept on purpose: nothing in the answer tells this page's
   * own lost call apart from an earlier open of the same link (no timestamp, no request id), and
   * claiming "you have just rejected…" would be false for a genuinely re-opened link.
   *
   * Anything that throws in these steps ends on the failure card with its retry, never stuck on
   * "applying"; so does a result that cannot be rendered, through {@link ResultBoundary}, because
   * that error happens later and never reaches this chain. Once the page is gone, the chain stops.
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
        <Result
          testId="portal-decision-applying"
          Icon={CircleNotchIcon}
          spin
          title={ui('portalDecisionApplying')}
          data-testid="Result__be410c" />
      </Frame>
    );
  }
  if (view === VIEW.invalid) {
    return (
      <Frame data-testid="Frame__be410c">
        <Result
          testId="portal-decision-invalid"
          Icon={ProhibitIcon}
          title={ui('portalInvalidLinkTitle')}
          description={ui('portalInvalidLinkDescription')}
          data-testid="Result__be410c" />
      </Frame>
    );
  }
  const failedCard = <FailedCard onRetry={() => apply()} data-testid="FailedCard__be410c" />;
  if (view === VIEW.failed) return failedCard;

  return (
    <ResultBoundary fallback={failedCard} data-testid="ResultBoundary__be410c">
      <DecisionResult decision={decision} data-testid="DecisionResult__be410c" />
    </ResultBoundary>
  );
}
