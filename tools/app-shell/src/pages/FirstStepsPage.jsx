import { useCallback, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Check, Circle, Clock, Eye, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { cn } from '@/lib/utils.js';
import { useGuardedNavigate } from '@/hooks/useGuardedNavigate.js';
import { useCapabilitiesSafe } from '@/hooks/useCapabilitiesSafe.js';
import { useSetPageMeta } from '@/components/layout/PageMetaContext';
import {
  areAllStepsDone,
  findExpandedStepId,
  isStepDone,
  isStepExpandable,
  isStepGated,
} from '@/pages/first-steps/firstStepsConfig.js';
import { useFirstStepsState } from '@/pages/first-steps/FirstStepsContext.jsx';
import FirstStepsImportButton from '@/pages/first-steps/FirstStepsImportButton.jsx';
import { FIRST_STEPS_ICONS } from '@/pages/first-steps/firstStepsIcons.js';
import CompanyDataSummary from '@/pages/first-steps/CompanyDataSummary.jsx';

/**
 * ETP-5190 — post-signup onboarding checklist.
 *
 * The step catalogue lives in `first-steps/firstStepsConfig.js` and the completion state in
 * `first-steps/FirstStepsContext.jsx`; this file only renders them. Both progress numbers are
 * derived from the catalogue, so adding an eighth step needs no change here.
 *
 * Steps are NOT a wizard: any row can be opened and completed at any time, in any order. The
 * catalogue's `findExpandedStepId` only picks which row is open when the page first renders.
 *
 * ETP-5364 — once every visible step is done the page offers "Finalizar configuración inicial",
 * which sets `dismissed` and drops the entry from the sidebar. The page itself stays routable at
 * `/first-steps` and then renders the banner that undoes it, so the action is reversible without
 * a settings screen: hiding a menu entry with no way back is a trap, not a feature. Completing
 * the list does NOT dismiss it on its own — a user may well want the checklist to stay.
 *
 * Where the first invoice is created: the same route the dashboard's "Sales invoices" quick
 * action uses (`/{window}/new`, resolved by the `:windowName/:recordId` route).
 */
const CREATE_INVOICE_TO = '/sales-invoice/new';

/**
 * The solid green completion badge from the design: a filled disc with a white check, not a
 * ring. `lucide`'s `CheckCircle` cannot draw it — its circle is a stroke, so filling it leaves
 * the check as a hairline of the page background rather than a bold white tick.
 */
function StepDoneBadge({ stepId }) {
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--status-done-badge))] text-[hsl(var(--status-done-badge-fg))]"
      data-testid={`first-steps-done-${stepId}`}
    >
      <Check
        className="h-5 w-5"
        strokeWidth={3}
        aria-hidden="true"
        data-testid="Check__45a28a" />
    </span>
  );
}

/**
 * A completed step's controls are locked, so an import cannot be re-run and a configuration page
 * cannot be reopened by a stray click on a row the user already ticked. Unticking the step
 * unlocks them again — the checkbox is the switch. `keepActionWhenDone` opts a step out (company data, which
 * is the one thing here people genuinely revisit).
 */
function isStepLocked(step, done) {
  return done && !step.keepActionWhenDone;
}

function DataTransferAction({ transfer, ui, onRetryError }) {
  const products = transfer.products?.total != null
    ? ui('firstStepsDemoDataTransferProducts', transfer.products) : null;
  const contacts = transfer.contacts?.total != null
    ? ui('firstStepsDemoDataTransferContacts', transfer.contacts) : null;
  const progress = [products, contacts].filter(Boolean).join(' · ');
  if (transfer.status === 'FAILED') {
    const retry = async () => {
      try {
        await transfer.retry();
      } catch {
        onRetryError();
      }
    };
    return <button type="button" onClick={retry}
      className="rounded-md border px-3 py-1 text-xs font-medium text-foreground hover:bg-muted/50"
      data-testid="first-steps-data-transfer-retry">{ui('firstStepsDemoDataTransferRetry')}</button>;
  }
  if (transfer.status === 'RUNNING') {
    return <span className="text-xs text-muted-foreground" data-testid="first-steps-data-transfer-progress">
      {progress || ui('firstStepsDemoDataTransferStarting')}
    </span>;
  }
  if (transfer.status === 'COMPLETED') {
    return <span className="text-xs text-muted-foreground" data-testid="first-steps-data-transfer-result">
      {progress || ui('firstStepsDemoDataTransferCompleted')}
    </span>;
  }
  if (transfer.error) return <span className="text-xs text-destructive">{ui('genericError')}</span>;
  return <span className="text-xs text-muted-foreground">{ui('firstStepsDemoDataTransferSkipped')}</span>;
}

function StepAction({ step, done, ui, onConfigure, dataTransfer, onRetryError }) {
  const locked = isStepLocked(step, done);
  if (step.action === 'dataTransfer') {
    return <DataTransferAction transfer={dataTransfer} ui={ui} onRetryError={onRetryError} />;
  }
  if (step.action === 'import') {
    return (
      <FirstStepsImportButton
        step={step}
        ui={ui}
        disabled={locked}
        data-testid="FirstStepsImportButton__45a28a" />
    );
  }
  if (!step.to) return null;
  return (
    <button
      type="button"
      onClick={() => onConfigure(step)}
      disabled={locked}
      className="rounded-md border px-3 py-1 text-xs font-medium text-foreground cursor-pointer hover:bg-muted/50 disabled:opacity-50 disabled:cursor-default disabled:hover:bg-transparent"
      data-testid={`first-steps-configure-${step.id}`}
    >
      {ui('firstStepsConfigure')}
    </button>
  );
}

/**
 * The yes/no question that stands in for a gated step's body until it is answered.
 *
 * "No" is not a dismissal: for a tenant that reports to no SIF, "no" IS the completed state, so
 * it ticks the step. That is why the caller routes it through the same toggle the checkbox uses
 * rather than a separate code path — one way for a step to become done, one thing to persist.
 */
function StepGateQuestion({ step, ui, loading, onAnswer }) {
  return (
    <div className="space-y-3" data-testid={`first-steps-gate-${step.id}`}>
      <p className="text-xs text-muted-foreground">{ui(step.gateQuestionKey)}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={loading}
          onClick={() => onAnswer(step, true)}
          className="rounded-md border px-3 py-1 text-xs font-medium text-foreground cursor-pointer hover:bg-muted/50 disabled:opacity-50 disabled:cursor-default"
          data-testid={`first-steps-gate-yes-${step.id}`}
        >
          {ui('yes')}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => onAnswer(step, false)}
          className="rounded-md border px-3 py-1 text-xs font-medium text-foreground cursor-pointer hover:bg-muted/50 disabled:opacity-50 disabled:cursor-default"
          data-testid={`first-steps-gate-no-${step.id}`}
        >
          {ui('no')}
        </button>
      </div>
    </div>
  );
}

function StepRow({
  step, done, expanded, loading, gateAnswered,
  onToggle, onOpen, onConfigure, onGateAnswer, ui, dataTransfer, onRetryError,
}) {
  const Icon = FIRST_STEPS_ICONS[step.iconName];
  const expandable = isStepExpandable(step);
  const gated = isStepGated(step, done, gateAnswered);
  return (
    <div className="bg-card" data-testid={`first-steps-step-${step.id}`}>
      <div className="flex items-start gap-4 px-5 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {Icon && <Icon className="h-5 w-5" data-testid={`first-steps-step-icon-${step.id}`} />}
        </div>

        <div className="flex-1 min-w-0">
          {/* The whole title is the disclosure control: a step is never gated on the one above
              it, so every expandable row must be reachable directly. */}
          <button
            type="button"
            disabled={!expandable}
            onClick={() => onOpen(step.id)}
            aria-expanded={expandable ? expanded : undefined}
            className={cn(
              'block w-full text-left text-sm font-semibold',
              done ? 'line-through text-muted-foreground' : 'text-text-primary',
              expandable ? 'cursor-pointer' : 'cursor-default',
            )}
            data-testid={`first-steps-title-${step.id}`}
          >
            {ui(step.titleKey)}
          </button>

          {expanded && (
            <div className="mt-1 space-y-3">
              {gated ? (
                <StepGateQuestion
                  step={step}
                  ui={ui}
                  loading={loading}
                  onAnswer={onGateAnswer}
                  data-testid="StepGateQuestion__45a28a" />
              ) : (
                <>
                  {step.descKey && (
                    <p className="text-xs text-muted-foreground">{ui(step.descKey)}</p>
                  )}
                  {step.action === 'company' && <CompanyDataSummary ui={ui} data-testid="CompanyDataSummary__45a28a" />}
                  <div className="flex items-center gap-3">
                    <StepAction
                      step={step}
                      done={done}
                      ui={ui}
                      onConfigure={onConfigure}
                      dataTransfer={dataTransfer}
                      onRetryError={onRetryError}
                      data-testid="StepAction__45a28a" />
                    {Boolean(step.minutes) && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" data-testid={`first-steps-time-${step.id}`} />
                        {step.minutes} {ui('minutes')}
                      </span>
                    )}
                  </div>
                </>
              )}
              {step.action !== 'dataTransfer' && <label className="flex w-fit items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={done}
                  disabled={loading}
                  onChange={() => onToggle(step.id)}
                  className="peer sr-only"
                  data-testid={`first-steps-toggle-${step.id}`}
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border',
                    'peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-1',
                    done && 'border-primary bg-primary text-primary-foreground',
                  )}
                >
                  {done && <Check className="h-3 w-3" data-testid={`first-steps-toggle-check-${step.id}`} />}
                </span>
                {ui('markAsCompleted')}
              </label>}
            </div>
          )}
        </div>

        <div className="shrink-0 flex items-center gap-3 mt-0.5">
          {!done && !expanded && Boolean(step.minutes) && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" data-testid={`first-steps-collapsed-time-${step.id}`} />
              {step.minutes} {ui('minutes')}
            </span>
          )}
          {done && <StepDoneBadge stepId={step.id} data-testid="StepDoneBadge__45a28a" />}
          {!done && expanded && (
            <Circle
              className="h-8 w-8 text-muted-foreground/30"
              data-testid={`first-steps-pending-${step.id}`} />
          )}
        </div>
      </div>
    </div>
  );
}

export default function FirstStepsPage() {
  // ETP-5395 — "Primeros pasos" is Owner-only (AD_User.EM_ETGO_Is_Owner, ETP-4830). Hiding the
  // menu entry (menu.json's `"capability": "isOwner"`) is not enough on its own — a non-owner
  // typing the URL directly must be bounced too. `capabilities.isOwner` is absent/false until
  // proven true (fail-closed, same convention as every other capability read through
  // `useCapabilitiesSafe()`), so this redirects unless it is explicitly `true`. The check itself
  // runs AFTER every hook below (see the `return <Navigate .../>` right before the JSX return) —
  // Rules of Hooks forbids an early return before hooks are called, so `useCapabilitiesSafe()` is
  // read here but acted on only once every hook has executed unconditionally, mirroring the
  // AppLayout.jsx "ETP-5395 Point 1 Fix B" gate in that same file (its `if (allowedIds ===
  // undefined) return <AppLayoutLoading />;` also runs only after every hook above it).
  const capabilities = useCapabilitiesSafe();
  const ui = useUI();
  const navigate = useGuardedNavigate();
  // `steps`, `completedCount` and `total` come from the provider rather than from the
  // catalogue directly: a trial tenant is shown a shorter list (see "Plan-dependent steps" in
  // firstStepsConfig.js), and the page, the sidebar badge and the progress bar must all be
  // counting the same rows.
  const { completed, loading, toggleStep, plan, steps, completedCount, total, dismissed,
    setDismissed, dataTransfer, demoDataTransfer } = useFirstStepsState();

  // The optimistic rollback in `useFirstSteps` is invisible on its own — without this the row
  // would silently un-check itself after a failed POST.
  /**
   * Which gated steps the user has answered "yes" to, this visit. Deliberately not persisted —
   * see "Gated steps" in `firstStepsConfig.js`. Cleared on every toggle of the step, which is
   * what makes un-ticking a step bring its question back.
   */
  const [gateAnswered, setGateAnswered] = useState({});

  const handleToggle = useCallback(async (id) => {
    const saved = await toggleStep(id);
    if (!saved) {
      toast.error(ui('genericError'));
      return;
    }
    // Only on a saved toggle: a failed write leaves the step where it was, so a user who
    // answered "yes" must not lose the body they are looking at.
    setGateAnswered((prev) => (prev[id] ? { ...prev, [id]: false } : prev));
  }, [toggleStep, ui]);

  /**
   * "Yes" reveals the step's real body; "No" completes the step, because for a tenant that
   * reports to no SIF the answer IS the outcome. Both go through the same toggle the checkbox
   * uses, so there is exactly one way a step becomes done.
   */
  const handleGateAnswer = useCallback((step, answer) => {
    if (answer) {
      setGateAnswered((prev) => ({ ...prev, [step.id]: true }));
      return;
    }
    handleToggle(step.id);
  }, [handleToggle]);

  /**
   * ETP-5364 — closes the checklist for good, or brings it back.
   *
   * Stays on this page after closing rather than navigating to the dashboard: the entry has
   * just vanished from the menu, and leaving the user in front of the banner that explains it
   * (and offers the way back) is what makes that reversible instead of alarming. `setDismissed`
   * rolls its own state back on a failed POST, which is invisible on its own — hence the toast.
   */
  const handleSetDismissed = useCallback(async (next) => {
    const saved = await setDismissed(next);
    if (!saved) toast.error(ui('genericError'));
  }, [setDismissed, ui]);

  useSetPageMeta({
    title: ui('firstStepsPageTitle'),
    breadcrumb: ui('firstStepsPageTitle'),
  });

  const allSet = areAllStepsDone(completed, plan, demoDataTransfer);

  // `null` means "nothing opened by hand yet", which is what lets the default follow the
  // loading state: the first incomplete row opens once the real completion state arrives,
  // instead of latching onto the empty state the page rendered with. Once the user clicks a
  // row, their choice wins for the rest of the visit — including closing every row.
  const [openedStepId, setOpenedStepId] = useState(null);
  const expandedStepId = openedStepId === null
    ? findExpandedStepId(completed, plan, demoDataTransfer) : openedStepId;
  const handleOpen = useCallback((id) => {
    setOpenedStepId((current) => {
      const effective = current === null
        ? findExpandedStepId(completed, plan, demoDataTransfer) : current;
      return effective === id ? '' : id;
    });
  }, [completed, plan, demoDataTransfer]);

  // Gate acted on here, after every hook above has already been called unconditionally on
  // every render (see the ETP-5395 comment at the top of this component).
  if (capabilities.isOwner !== true) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="flex flex-col h-full" data-testid="first-steps-page">
      <div className="flex-1 overflow-auto bg-page-bg px-6 py-8">
        <div className="mx-auto max-w-2xl space-y-6">

          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-text-primary" data-testid="first-steps-heading">
              {ui(allSet ? 'firstStepsAllSetTitle' : 'firstStepsPrepareAccount')}
            </h1>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground" data-testid="first-steps-subtitle">
                {ui(allSet ? 'firstStepsAllSetSubtitle' : 'firstStepsSubtitle')}
              </span>
              <span
                className="shrink-0 ml-4 font-medium text-muted-foreground"
                data-testid="first-steps-progress"
              >
                {completedCount}/{total} {ui('firstStepsCompleted')}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-foreground transition-all"
                style={{ width: `${total ? (completedCount / total) * 100 : 0}%` }}
                data-testid="first-steps-progress-bar"
              />
            </div>
          </div>

          {dismissed && (
            <div
              className="rounded-xl border bg-card p-4 shadow-sm space-y-2"
              data-testid="first-steps-dismissed-notice"
            >
              <p className="text-sm font-medium text-text-primary">
                {ui('firstStepsDismissedTitle')}
              </p>
              <p className="text-sm text-muted-foreground">
                {ui('firstStepsDismissedSubtitle')}
              </p>
              <button
                type="button"
                onClick={() => handleSetDismissed(false)}
                className="flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted/50"
                data-testid="first-steps-reopen"
              >
                <Eye className="h-4 w-4" data-testid="first-steps-reopen-icon" />
                {ui('firstStepsReopen')}
              </button>
            </div>
          )}

          {allSet && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => navigate(CREATE_INVOICE_TO)}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  data-testid="first-steps-create-invoice"
                >
                  <Receipt className="h-4 w-4" data-testid="first-steps-create-invoice-icon" />
                  {ui('createInvoice')}
                </button>
                {!dismissed && (
                  <button
                    type="button"
                    onClick={() => handleSetDismissed(true)}
                    className="flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted/50"
                    data-testid="first-steps-finish-setup"
                  >
                    <Check className="h-4 w-4" data-testid="first-steps-finish-setup-icon" />
                    {ui('firstStepsFinishSetup')}
                  </button>
                )}
              </div>
              {!dismissed && (
                <p
                  className="text-xs text-muted-foreground"
                  data-testid="first-steps-finish-setup-hint"
                >
                  {ui('firstStepsFinishSetupHint')}
                </p>
              )}
            </div>
          )}

          <div className="rounded-xl border bg-card shadow-sm overflow-hidden divide-y">
            {steps.map((step) => (
              <StepRow
                key={step.id}
                step={step}
                done={isStepDone(step, completed, demoDataTransfer)}
                expanded={step.id === expandedStepId}
                loading={loading}
                gateAnswered={Boolean(gateAnswered[step.id])}
                onToggle={handleToggle}
                onOpen={handleOpen}
                onConfigure={(target) => navigate(target.to)}
                onGateAnswer={handleGateAnswer}
                dataTransfer={dataTransfer}
                onRetryError={() => toast.error(ui('genericError'))}
                ui={ui}
                data-testid="StepRow__45a28a" />
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
