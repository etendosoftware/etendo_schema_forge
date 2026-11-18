import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { Button } from '@/components/ui/button';
import { RecordLink } from '@/components/contract-ui/RecordLink.jsx';
import {
  fetchFileReadiness,
  groupReadinessProblems,
  readinessProblemText,
} from './remittanceFileApi.js';

// Same card frame and header strip as «Datos para el fichero SEPA» (RemittanceSepaFileData), so the
// two read as one block under the header form.
const CARD = 'mx-2 mt-3 mb-3 overflow-hidden rounded-xl border border-[hsl(var(--border-subtle))] bg-card';
const CARD_HEADER = 'flex items-center justify-between gap-3 border-b border-[hsl(var(--border-subtle))] bg-[hsl(var(--muted))] px-4 py-1.5';
const MUTED = 'text-sm text-[hsl(var(--muted-foreground))]';

export function isProcessedRemittance(data) {
  return data?.processed === true || data?.processed === 'Y';
}

/** Where a problem's owner is fixed: the contact, the account (its edit modal) or the organization. */
export function problemFixRoute(scope, ids) {
  if (scope === 'line') return ids.businessPartnerId ? `/contacts/${encodeURIComponent(ids.businessPartnerId)}` : null;
  if (scope === 'account') return ids.accountId ? `/financial-account/${encodeURIComponent(ids.accountId)}?edit=true` : null;
  if (scope === 'org') return ids.organizationId ? `/organization/${encodeURIComponent(ids.organizationId)}` : null;
  return null;
}

// The sentence as the backend wrote it: it already names the contact or the invoice, and a contact
// problem is reported once for all its lines (`lineIds`), so prefixing one invoice would mislead.
function ProblemSentence({ problem, ui }) {
  return (
    <li className="text-sm text-foreground" data-testid="remittance-file-problem" data-code={problem.code ?? undefined}>
      {readinessProblemText(problem, ui)}
    </li>
  );
}

function ProblemGroup({ title, to, problems, ui, onNavigate, testId }) {
  return (
    <div className="min-w-0" data-testid={testId}>
      <div className="text-sm font-medium text-foreground">
        {to
          ? <RecordLink to={to} onNavigate={onNavigate} data-testid={`${testId}-link`}>{title}</RecordLink>
          : <span>{title}</span>}
      </div>
      <ul className="mt-0.5 list-disc space-y-0.5 pl-5">
        {problems.map((problem, i) => (
          <ProblemSentence key={`${problem.lineId ?? ''}-${problem.code ?? ''}-${i}`} problem={problem} ui={ui} data-testid="ProblemSentence__remittance" />
        ))}
      </ul>
    </div>
  );
}

/**
 * ETP-6247 — the `fileReadiness` problems, grouped: the organization's, the account's, then one
 * group per business partner, each titled with a ↗ link to where it is fixed (the contact for its
 * IBAN, mandate or address; the account's edit modal; the organization). Shared by «Antes de
 * confirmar» and the confirm dialog. `onNavigate` lets a dialog close itself before navigating.
 */
export function ReadinessProblemList({ problems, onNavigate }) {
  const ui = useUI();
  const groups = groupReadinessProblems(problems);
  const orgId = groups.org.find((p) => p.organizationId)?.organizationId;
  const accountId = groups.account.find((p) => p.accountId)?.accountId;
  return (
    <div className="space-y-2" data-testid="remittance-file-problems">
      {groups.org.length > 0 && (
        <ProblemGroup
          title={ui('remittanceFileGroupOrganization')}
          to={problemFixRoute('org', { organizationId: orgId })}
          problems={groups.org}
          ui={ui}
          onNavigate={onNavigate}
          testId="remittance-file-problems-org"
          data-testid="ProblemGroup__org" />
      )}
      {groups.account.length > 0 && (
        <ProblemGroup
          title={ui('remittanceFileGroupAccount')}
          to={problemFixRoute('account', { accountId })}
          problems={groups.account}
          ui={ui}
          onNavigate={onNavigate}
          testId="remittance-file-problems-account"
          data-testid="ProblemGroup__account" />
      )}
      {groups.partners.map((group, i) => (
        <ProblemGroup
          key={group.businessPartnerId ?? `partner-${i}`}
          title={group.businessPartnerName || ui('remittanceFileGroupContact')}
          to={problemFixRoute('line', { businessPartnerId: group.businessPartnerId })}
          problems={group.problems}
          ui={ui}
          onNavigate={onNavigate}
          testId={`remittance-file-problems-partner-${group.businessPartnerId ?? i}`}
          data-testid="ProblemGroup__partner" />
      ))}
    </div>
  );
}

/**
 * ETP-6247 — the «Resuelve esto para poder confirmar:» block: the warning heading with its icon and
 * the grouped problem list. Shared by «Antes de confirmar» and the confirm dialog so both read as
 * one pattern. `testId` names the wrapper (each caller keeps its own).
 */
export function ReadinessProblemsBlock({ problems, onNavigate, testId }) {
  const ui = useUI();
  return (
    <div className="space-y-2" role="alert" data-testid={testId}>
      <p className="inline-flex items-center gap-1.5 text-sm font-medium text-[hsl(var(--status-warning-fg))]">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" data-testid="AlertTriangle__readiness" />
        {ui('remittanceFileReadinessProblems')}
      </p>
      <ReadinessProblemList problems={problems} onNavigate={onNavigate} data-testid="ReadinessProblemList__block" />
    </div>
  );
}

/** The «Todo listo» line, shared by «Antes de confirmar» and the confirm dialog. */
export function ReadinessReadyLine({ testId }) {
  const ui = useUI();
  return (
    <p className="inline-flex items-center gap-1.5 text-sm text-[hsl(var(--status-success-fg))]" data-testid={testId}>
      <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" data-testid="CheckCircle2__readiness" />
      {ui('remittanceFileReadinessReady')}
    </p>
  );
}

/**
 * ETP-6247 — «Antes de confirmar», on a saved remittance that is not processed: whether the SEPA
 * file can be generated (`fileReadiness`). Re-read whenever the record changes (its `updated`
 * token moves on every save, line sync and IBAN fix of the header) and on «Volver a comprobar»,
 * since a contact fixed in another tab does not touch this record. It only informs: «Confirmar»
 * itself re-checks in its dialog, which refuses to confirm while there are problems.
 */
function ReadinessCard({ data, apiBaseUrl }) {
  const ui = useUI();
  const apiFetch = useApiFetch(apiBaseUrl);
  const remittanceId = data.id;
  const [state, setState] = useState({ loading: true, readiness: null, failed: false });
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    setState((prev) => ({ ...prev, loading: true, failed: false }));
    try {
      const readiness = await fetchFileReadiness(apiFetch, remittanceId);
      if (requestId === requestRef.current) setState({ loading: false, readiness, failed: false });
    } catch {
      if (requestId === requestRef.current) setState({ loading: false, readiness: null, failed: true });
    }
  }, [apiFetch, remittanceId]);

  useEffect(() => { load(); }, [load, data.updated, data.financialAccount]);

  const { loading, readiness, failed } = state;
  let body;
  if (loading && !readiness) {
    body = <p className={MUTED} data-testid="remittance-file-readiness-loading">{ui('remittanceFileReadinessChecking')}</p>;
  } else if (failed) {
    body = <p className={MUTED} data-testid="remittance-file-readiness-error">{ui('remittanceFileReadinessLoadError')}</p>;
  } else if (readiness?.ready) {
    body = <ReadinessReadyLine testId="remittance-file-readiness-ready" data-testid="ReadinessReadyLine__card" />;
  } else {
    body = <ReadinessProblemsBlock problems={readiness?.problems ?? []} testId="remittance-file-readiness-problems" data-testid="ReadinessProblemsBlock__card" />;
  }

  return (
    <section className={CARD} aria-labelledby="remittance-file-readiness-title" data-testid="remittance-file-readiness">
      <header className={CARD_HEADER}>
        <h3 id="remittance-file-readiness-title" className="text-sm font-semibold text-foreground">{ui('remittanceFileReadinessTitle')}</h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={load}
          disabled={loading}
          className="h-7 gap-1.5 px-2 text-xs"
          data-testid="remittance-file-readiness-recheck"
        >
          <RefreshCw className={`h-3.5 w-3.5${loading ? ' animate-spin' : ''}`} aria-hidden="true" data-testid="RefreshCw__readiness" />
          {ui('remittanceFileReadinessRecheck')}
        </Button>
      </header>
      <div className="px-4 py-2.5">{body}</div>
    </section>
  );
}

/**
 * ETP-6247 — the SEPA file block under «Datos para el fichero SEPA»: «Antes de confirmar» while the
 * remittance is pending, «Fichero SEPA» once it is processed. Nothing for an unsaved remittance (the
 * actions need a record). Rendered by RemittanceSepaFileData, the window's `headerExtra.customForm`.
 */
export default function RemittanceFileCard({ data, apiBaseUrl }) {
  // ETP-6247 — a processed remittance shows no card here any more: «Descargar fichero» is a button in the
  // top bar and «Regenerar fichero» an item of the detail kebab (the file name is in «Adjuntos»).
  if (!data?.id || isProcessedRemittance(data)) return null;
  return <ReadinessCard data={data} apiBaseUrl={apiBaseUrl} data-testid="ReadinessCard__remittance" />;
}
