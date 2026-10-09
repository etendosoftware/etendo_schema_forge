import { AlertCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * "Another session is open on this browser" — the shared body of every session-conflict screen.
 *
 * The session cookie belongs to the browser profile, not to a tab, and production is one domain
 * for every customer, so whoever signs in last owns every tab. Two places have to say so: the
 * invitation page (ETP-5202, the invitee is not the signed-in person) and the app itself (ETP-5675,
 * another tab signed the browser in as a different account). They differ in copy and actions, not
 * in shape, so the shape lives here and each caller passes already-translated text.
 *
 * Presentational only: no session reads, no navigation. The wrapper (AuthShell, a full-screen
 * column) is the caller's.
 *
 * @param {object} props
 * @param {string} props.title
 * @param {string} props.description
 * @param {string} props.primaryLabel the action that leaves the other session alone
 * @param {() => void} props.onPrimary
 * @param {string} [props.primaryTestId]
 * @param {string} [props.secondaryLabel] the action that signs the other session out
 * @param {() => void} [props.onSecondary]
 * @param {string} [props.secondaryTestId]
 * @param {string} [props.warning] spelled out next to the destructive action, not discovered after
 * @param {boolean} [props.busy] disables both actions while one is running
 * @param {'primary'|'secondary'} [props.emphasis] which action gets the filled button
 * @param {string} [props.testId]
 */
export function SessionConflictNotice({
  title, description, primaryLabel, onPrimary, primaryTestId, secondaryLabel, onSecondary,
  secondaryTestId, warning, busy = false, emphasis = 'primary', testId = 'session-conflict',
}) {
  // Account emails make these labels long: they must wrap inside the button, never overflow it
  // (a Button is `whitespace-nowrap` by default).
  const fit = 'h-auto min-h-12 w-full whitespace-normal break-words py-3 text-center';
  const filled = `${fit} gap-2 rounded-lg bg-primary text-base font-medium text-primary-foreground hover:bg-accent-highlight hover:text-accent-highlight-foreground`;
  const outlined = `${fit} rounded-lg text-base font-medium`;
  const primaryFilled = emphasis === 'primary';

  return (
    <div className="text-center" data-testid={testId}>
      <div className="mx-auto mb-5 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertCircle className="h-8 w-8" data-testid={`${testId}-icon`} />
      </div>
      <h1 className="text-3xl font-semibold tracking-[-0.06em] text-foreground sm:text-[2.7rem] sm:leading-[1.04]">
        {title}
      </h1>
      <p className="mt-3 text-base text-muted-foreground sm:text-xl">{description}</p>

      {secondaryLabel && !primaryFilled && (
        <SecondaryAction
          className={`mt-6 ${filled}`}
          label={secondaryLabel}
          onClick={onSecondary}
          testId={secondaryTestId}
          warning={warning}
          busy={busy}
          withArrow
          data-testid="SecondaryAction__a312ad" />
      )}

      <Button
        variant={primaryFilled ? 'default' : 'outline'}
        className={primaryFilled ? `mt-6 ${filled}` : `mt-4 ${outlined}`}
        onClick={onPrimary}
        disabled={busy}
        data-testid={primaryTestId}
      >
        <span>{primaryLabel}</span>
        {primaryFilled && <ArrowRight className="h-4 w-4 shrink-0" data-testid={`${testId}-primary-arrow`} />}
      </Button>

      {secondaryLabel && primaryFilled && (
        <SecondaryAction
          className={`mt-4 ${outlined}`}
          variant="outline"
          label={secondaryLabel}
          onClick={onSecondary}
          testId={secondaryTestId}
          warning={warning}
          busy={busy}
          data-testid="SecondaryAction__a312ad" />
      )}
    </div>
  );
}

function SecondaryAction({ className, variant, label, onClick, testId, warning, busy, withArrow = false }) {
  return (
    <>
      <Button variant={variant} className={className} onClick={onClick} disabled={busy} data-testid={testId}>
        <span>{label}</span>
        {withArrow && <ArrowRight className="h-4 w-4 shrink-0" data-testid={`${testId}-arrow`} />}
      </Button>
      {warning && <p className="mt-2 text-xs text-muted-foreground">{warning}</p>}
    </>
  );
}

export default SessionConflictNotice;
