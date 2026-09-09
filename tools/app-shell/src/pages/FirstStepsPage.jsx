import { useCallback, useState } from 'react';
import { Check, Circle, Clock, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { cn } from '@/lib/utils.js';
import { useGuardedNavigate } from '@/hooks/useGuardedNavigate.js';
import { useSetPageMeta } from '@/components/layout/PageMetaContext';
import {
  FIRST_STEPS,
  FIRST_STEPS_TOTAL,
  areAllStepsDone,
  countCompletedSteps,
  findExpandedStepId,
  isStepDone,
  isStepExpandable,
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
      <Check className="h-5 w-5" strokeWidth={3} aria-hidden="true" />
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

function StepAction({ step, done, ui, onConfigure }) {
  const locked = isStepLocked(step, done);
  if (step.action === 'import') {
    return <FirstStepsImportButton step={step} ui={ui} disabled={locked} />;
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

function StepRow({ step, done, expanded, loading, onToggle, onOpen, onConfigure, ui }) {
  const Icon = FIRST_STEPS_ICONS[step.iconName];
  const expandable = isStepExpandable(step);
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
              {step.descKey && (
                <p className="text-xs text-muted-foreground">{ui(step.descKey)}</p>
              )}
              {step.action === 'company' && <CompanyDataSummary ui={ui} />}
              <div className="flex items-center gap-3">
                <StepAction step={step} done={done} ui={ui} onConfigure={onConfigure} />
                {Boolean(step.minutes) && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" data-testid={`first-steps-time-${step.id}`} />
                    {step.minutes} {ui('minutes')}
                  </span>
                )}
              </div>
              <label className="flex w-fit items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
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
              </label>
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
          {done && <StepDoneBadge stepId={step.id} />}
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
  const ui = useUI();
  const navigate = useGuardedNavigate();
  const { completed, loading, toggleStep } = useFirstStepsState();

  // The optimistic rollback in `useFirstSteps` is invisible on its own — without this the row
  // would silently un-check itself after a failed POST.
  const handleToggle = useCallback(async (id) => {
    const saved = await toggleStep(id);
    if (!saved) toast.error(ui('genericError'));
  }, [toggleStep, ui]);

  useSetPageMeta({
    title: ui('firstStepsPageTitle'),
    breadcrumb: ui('firstStepsPageTitle'),
  });

  const doneCount = countCompletedSteps(completed);
  const allSet = areAllStepsDone(completed);

  // `null` means "nothing opened by hand yet", which is what lets the default follow the
  // loading state: the first incomplete row opens once the real completion state arrives,
  // instead of latching onto the empty state the page rendered with. Once the user clicks a
  // row, their choice wins for the rest of the visit — including closing every row.
  const [openedStepId, setOpenedStepId] = useState(null);
  const expandedStepId = openedStepId === null ? findExpandedStepId(completed) : openedStepId;
  const handleOpen = useCallback((id) => {
    setOpenedStepId((current) => {
      const effective = current === null ? findExpandedStepId(completed) : current;
      return effective === id ? '' : id;
    });
  }, [completed]);

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
                {doneCount}/{FIRST_STEPS_TOTAL} {ui('firstStepsCompleted')}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-foreground transition-all"
                style={{ width: `${(doneCount / FIRST_STEPS_TOTAL) * 100}%` }}
                data-testid="first-steps-progress-bar"
              />
            </div>
          </div>

          {allSet && (
            <div className="flex">
              <button
                type="button"
                onClick={() => navigate(CREATE_INVOICE_TO)}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                data-testid="first-steps-create-invoice"
              >
                <Receipt className="h-4 w-4" data-testid="first-steps-create-invoice-icon" />
                {ui('createInvoice')}
              </button>
            </div>
          )}

          <div className="rounded-xl border bg-card shadow-sm overflow-hidden divide-y">
            {FIRST_STEPS.map((step) => (
              <StepRow
                key={step.id}
                step={step}
                done={isStepDone(step, completed)}
                expanded={step.id === expandedStepId}
                loading={loading}
                onToggle={handleToggle}
                onOpen={handleOpen}
                onConfigure={(target) => navigate(target.to)}
                ui={ui} />
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
