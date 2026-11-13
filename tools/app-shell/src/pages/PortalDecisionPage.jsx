import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, Ban, CheckCircle2, FileText, Loader2 } from 'lucide-react';
import { useUI } from '@/i18n';
import { Button } from '@/components/ui/button';
import { useApiFetch } from '@/auth/useApiFetch.js';
import {
  PORTAL_DECISION_STATE, PORTAL_ERROR, confirmPortalDecision, fetchPortalDecision,
  resolvePortalBaseUrl,
} from '@/lib/portal/portalApi.js';
import { PORTAL_REJECT_REASONS } from './portal/portalPresentation.js';

/**
 * The confirmation landing of a portal quotation decision (ETP-6209 Part C): the page the
 * confirmation email's button opens, at `/portal/decision/:token`.
 *
 * <b>Opening it never applies anything</b> (user decision): mail scanners pre-fetch links, so the
 * page only reads what would be applied, and the customer's click on "Confirmar" is what confirms.
 * The token is moved from the path into its own header (`X-Portal-Decision-Token`) for every
 * request — never into a query string. A token is single use and never expires; a second open
 * shows what happened to it (confirmed, superseded by another confirmed request, no longer pending,
 * expired). Unknown tokens get the portal's generic invalid-link screen.
 */

const VIEW = Object.freeze({ loading: 'loading', ready: 'ready', invalid: 'invalid', failed: 'failed' });

/** Title, description and icon per state. */
const STATE_COPY = Object.freeze({
  [PORTAL_DECISION_STATE.confirmed]: { title: 'portalDecisionConfirmedTitle', description: 'portalDecisionConfirmedDescription', tone: 'success' },
  [PORTAL_DECISION_STATE.voided]: { title: 'portalDecisionVoidedTitle', description: 'portalDecisionVoidedDescription', tone: 'neutral' },
  [PORTAL_DECISION_STATE.notPending]: { title: 'portalDecisionNotPendingTitle', description: 'portalDecisionNotPendingDescription', tone: 'neutral' },
  [PORTAL_DECISION_STATE.expired]: { title: 'portalDecisionExpiredTitle', description: 'portalDecisionExpiredDescription', tone: 'neutral' },
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

export default function PortalDecisionPage() {
  const { token = '' } = useParams();
  const ui = useUI();
  const baseUrl = useMemo(() => resolvePortalBaseUrl(), []);
  const apiFetch = useApiFetch(baseUrl);
  const [view, setView] = useState(VIEW.loading);
  const [decision, setDecision] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmFailed, setConfirmFailed] = useState(false);

  useEffect(() => {
    const trimmed = token.trim();
    if (!trimmed) {
      setView(VIEW.invalid);
      return undefined;
    }
    let active = true;
    fetchPortalDecision(apiFetch, trimmed).then((loaded) => {
      if (!active) return;
      setDecision(loaded);
      setView(VIEW.ready);
    }).catch((error) => {
      if (!active) return;
      setView(error?.code === PORTAL_ERROR.invalidLink ? VIEW.invalid : VIEW.failed);
    });
    return () => { active = false; };
  }, [apiFetch, token]);

  const confirm = async () => {
    setBusy(true);
    setConfirmFailed(false);
    try {
      setDecision(await confirmPortalDecision(apiFetch, token.trim()));
    } catch (error) {
      if (error?.code === PORTAL_ERROR.invalidLink) setView(VIEW.invalid);
      else setConfirmFailed(true);
    } finally {
      setBusy(false);
    }
  };

  if (view === VIEW.loading) {
    return (
      <Frame>
        <Card testId="portal-decision-loading" icon={<Loader2 className="h-8 w-8 animate-spin text-primary" />} title={ui('loading')} />
      </Frame>
    );
  }
  if (view === VIEW.invalid) {
    return (
      <Frame>
        <Card
          testId="portal-decision-invalid"
          icon={<Ban className="h-8 w-8 text-muted-foreground" aria-hidden="true" />}
          title={ui('portalInvalidLinkTitle')}
          description={ui('portalInvalidLinkDescription')}
        />
      </Frame>
    );
  }
  if (view === VIEW.failed) {
    return (
      <Frame>
        <Card
          testId="portal-decision-failed"
          icon={<AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />}
          title={ui('portalLoadErrorTitle')}
          description={ui('portalLoadErrorDescription')}
        />
      </Frame>
    );
  }

  const params = { number: decision.documentNo ?? '', tenantName: decision.tenantName ?? '' };
  const reasonLabel = PORTAL_REJECT_REASONS.find((r) => r.code === decision.reasonCode)?.labelKey;

  if (decision.state !== PORTAL_DECISION_STATE.pending) {
    const copy = STATE_COPY[decision.state] ?? STATE_COPY[PORTAL_DECISION_STATE.notPending];
    return (
      <Frame>
        <Card
          testId={`portal-decision-${decision.state}`}
          tenantName={decision.tenantName}
          icon={copy.tone === 'success'
            ? <CheckCircle2 className="h-8 w-8 text-[var(--status-success-fg)]" aria-hidden="true" />
            : <FileText className="h-8 w-8 text-muted-foreground" aria-hidden="true" />}
          title={ui(copy.title)}
          description={ui(copy.description, params)}
        />
      </Frame>
    );
  }

  const action = ui(decision.decision === 'ACCEPT' ? 'portalDecisionActionAccept' : 'portalDecisionActionReject');
  return (
    <Frame>
      <Card
        testId="portal-decision-pending"
        tenantName={decision.tenantName}
        icon={<FileText className="h-8 w-8 text-primary" aria-hidden="true" />}
        title={ui('portalDecisionPageTitle')}
        description={ui('portalDecisionPendingDescription', { ...params, action })}
      >
        {reasonLabel ? (
          <p className="mt-3 text-sm" data-testid="portal-decision-reason">
            <span className="font-medium">{ui('portalRejectReasonLabel')}:</span>{' '}
            {ui(reasonLabel)}{decision.reasonText ? ` — ${decision.reasonText}` : ''}
          </p>
        ) : null}
        <Button className="mt-6" onClick={confirm} disabled={busy} data-testid="portal-decision-confirm">
          {ui('portalDecisionConfirm')}
        </Button>
        {confirmFailed ? (
          <p className="mt-3 text-sm text-destructive" role="alert">{ui('portalDecisionError')}</p>
        ) : null}
      </Card>
    </Frame>
  );
}
