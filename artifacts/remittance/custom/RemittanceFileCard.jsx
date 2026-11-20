import { useCallback, useEffect, useRef, useState } from 'react';
import { WarningIcon, ArrowsClockwiseIcon } from '@phosphor-icons/react';
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { Button } from '@/components/ui/button';
import { RecordLink } from '@/components/contract-ui/RecordLink.jsx';
import {
  fetchFileReadiness,
  groupReadinessProblems,
  isCreditorIdProblem,
  readinessProblemText,
} from './remittanceFileApi.js';

// ETP-6247 — light and consistent with the app's notices (InfoBanner tokens): a left-accented strip, not a
// card with a header, so it does not dominate the page. Problems: warning strip; ready: one discreet line.
const STRIP = 'flex items-start gap-3 rounded-[0_8px_8px_0] border-l-2 border-status-warning-border bg-status-warning px-4 py-2';
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
function ProblemSentence({ problem, ui, renderActions }) {
  return (
    <li className="text-sm text-foreground" data-testid="remittance-file-problem" data-code={problem.code ?? undefined}>
      {readinessProblemText(problem, ui)}
      {renderActions?.(problem)}
    </li>
  );
}

function ProblemGroup({ title, to, problems, ui, onNavigate, testId, renderActions }) {
  return (
    <div className="min-w-0" data-testid={testId}>
      <div className="text-sm font-medium text-foreground">
        {to
          ? <RecordLink to={to} onNavigate={onNavigate} data-testid={`${testId}-link`}>{title}</RecordLink>
          : <span>{title}</span>}
      </div>
      <ul className="mt-0.5 list-disc space-y-0.5 pl-5">
        {problems.map((problem, i) => (
          <ProblemSentence key={`${problem.lineId ?? ''}-${problem.code ?? ''}-${i}`} problem={problem} ui={ui} renderActions={renderActions} data-testid="ProblemSentence__remittance" />
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
export function ReadinessProblemList({ problems, onNavigate, renderProblemActions }) {
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
          renderActions={renderProblemActions}
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
          renderActions={renderProblemActions}
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
          renderActions={renderProblemActions}
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
export function ReadinessProblemsBlock({ problems, onNavigate, testId, renderProblemActions, hideIcon = false }) {
  const ui = useUI();
  return (
    <div className="space-y-2" role="alert" data-testid={testId}>
      <p className="inline-flex items-center gap-1.5 text-sm font-medium text-[hsl(var(--status-warning-fg))]">
        {!hideIcon && <WarningIcon className="h-4 w-4 shrink-0" aria-hidden="true" data-testid="AlertTriangle__readiness" />}
        {ui('remittanceFileReadinessProblems')}
      </p>
      <ReadinessProblemList problems={problems} onNavigate={onNavigate} renderProblemActions={renderProblemActions} data-testid="ReadinessProblemList__block" />
    </div>
  );
}

/**
 * ETP-6247 — «Antes de confirmar», on a saved remittance that is not processed: whether the SEPA
 * file can be generated (`fileReadiness`). Re-read whenever the record changes (its `updated`
 * token moves on every save, line sync and IBAN fix of the header) and on «Volver a comprobar»,
 * since a contact fixed in another tab does not touch this record. It only informs: «Confirmar»
 * itself re-checks in its dialog, which refuses to confirm while there are problems.
 */
function ReadinessCard({ data, apiBaseUrl, creditorValid = false }) {
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

  // ETP-6247 — the creditor identifier is an input of «Datos para el fichero SEPA» saved with the header; here a
  // creditor-id problem (none valid or computable, or an invalid own one) is a plain sentence that points to it.
  const renderProblemActions = useCallback((problem) => (isCreditorIdProblem(problem)
    ? <span className="ml-1 text-[hsl(var(--muted-foreground))]" data-testid="remittance-file-creditor-hint">{ui('remittanceFileCreditorIdHint')}</span>
    : null), [ui]);

  // A creditor-id problem is dropped while the field of «Datos para el fichero SEPA» holds a valid value
  // (typed, the account's or the one computed from the organization): confirm copies it to the remittance.
  // The server may still report it (an older backend, or before the value is saved); it only stays when there
  // really is no valid or computable identifier.
  const { loading, failed } = state;
  const problems = (state.readiness?.problems ?? []).filter((problem) => !(creditorValid && isCreditorIdProblem(problem)));
  const readiness = state.readiness && { ...state.readiness, problems, ready: state.readiness.ready || problems.length === 0 };
  const recheck = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={load}
      disabled={loading}
      className="h-7 shrink-0 gap-1.5 px-2 text-xs text-[hsl(var(--muted-foreground))]"
      data-testid="remittance-file-readiness-recheck"
    >
      <ArrowsClockwiseIcon className={`h-3.5 w-3.5${loading ? ' animate-spin' : ''}`} aria-hidden="true" data-testid="RefreshCw__readiness" />
      {ui('remittanceFileReadinessRecheck')}
    </Button>
  );
  // Nothing at all while loading and when there is nothing to fix: «ready» is not shown (with no lines it would
  // mislead; «Confirmar» is refused by the server then). Only a failed check and the problems render.
  let body = null;
  if (failed) {
    body = (
      <div className="flex items-center justify-between gap-3">
        <p className={MUTED} data-testid="remittance-file-readiness-error">{ui('remittanceFileReadinessLoadError')}</p>
        {recheck}
      </div>
    );
  } else if (readiness && !readiness.ready) {
    body = (
      <div className={STRIP}>
        <WarningIcon className="mt-0.5 h-4 w-4 shrink-0 text-status-warning-foreground" aria-hidden="true" data-testid="AlertTriangle__readiness-card" />
        <div className="min-w-0 flex-1">
          <ReadinessProblemsBlock problems={problems} renderProblemActions={renderProblemActions} hideIcon testId="remittance-file-readiness-problems" data-testid="ReadinessProblemsBlock__card" />
        </div>
        {recheck}
      </div>
    );
  }

  if (!body) return null;
  return (
    <section className="col-span-full" aria-label={ui('remittanceFileReadinessTitle')} data-testid="remittance-file-readiness">
      {body}
    </section>
  );
}

/**
 * ETP-6247 — the SEPA file block under «Datos para el fichero SEPA»: «Antes de confirmar» while the
 * remittance is pending, «Fichero SEPA» once it is processed. Nothing for an unsaved remittance (the
 * actions need a record). Rendered by RemittanceSepaFileData, the window's `headerExtra.customForm`.
 */
export default function RemittanceFileCard({ data, apiBaseUrl, creditorValid = false }) {
  // ETP-6247 — a processed remittance shows no card here any more: «Descargar fichero» is a button in the
  // top bar and «Regenerar fichero» an item of the detail kebab (the file name is in «Adjuntos»).
  if (!data?.id || isProcessedRemittance(data)) return null;
  return <ReadinessCard data={data} apiBaseUrl={apiBaseUrl} creditorValid={creditorValid} data-testid="ReadinessCard__remittance" />;
}
