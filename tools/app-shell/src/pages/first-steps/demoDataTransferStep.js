/**
 * ETP-5364 / ETP-5443 — the First Steps row for the demo-to-productive data transfer, owned by
 * the backend flag `demo-data-transfer` (see `flags-registry.json`).
 *
 * The row is NOT part of `FIRST_STEPS`: it is spliced into the visible list only when the
 * backend has answered `GET /sws/go/demo-data-transfer` successfully. With the flag off that
 * endpoint answers 404 ("Unknown endpoint", exactly as before it existed), so the catalogue is
 * the pre-ETP-5364 one — same rows, same `x/TOTAL`.
 *
 * There is deliberately no key in `lib/flags/flag-keys.js`. The flag is evaluated by
 * `com.etendoerp.go` alone and the browser asks it: a second evaluator in the browser would
 * resolve through a different control plane and targeting key, which is the ETP-4966 failure
 * (see `docs/feature-flags.md` → "Where the SDK key lives" and `GoFeatureFlags`).
 */

/**
 * Transfer statuses that no longer need attention. `NOT_REQUESTED` is included: the productive
 * tenant was created without a transfer, so there is nothing left for the user to wait on.
 */
const TERMINAL_STATUSES = Object.freeze(['COMPLETED', 'SKIPPED', 'NOT_REQUESTED']);

/** The transfer state the catalogue assumes whenever the backend has not exposed the transfer. */
export const NO_DEMO_DATA_TRANSFER = Object.freeze({ available: false, done: false });

/** The id of the step the transfer row is rendered after. */
const INSERT_AFTER_STEP_ID = 'fiscal-config';

export const DEMO_DATA_TRANSFER_STEP = Object.freeze({
  // The job is created by the server after a paid productive tenant is ready. It is not a
  // checkbox because completion is a durable migration result, not a user assertion.
  id: 'demo-data-transfer',
  iconName: 'ArrowsClockwise',
  titleKey: 'firstStepsDemoDataTransfer',
  descKey: 'firstStepsDemoDataTransferDesc',
  minutes: null,
  action: 'dataTransfer',
  to: null,
  importSpec: null,
  keepActionWhenDone: true,
  productiveOnly: true,
  gateQuestionKey: null,
  alwaysDone: false,
});

/** True once the transfer status needs nothing more from the user. */
export function isDemoDataTransferTerminal(status) {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * Collapses the hook's state into what the catalogue needs: is the row shown, and does it
 * count as done.
 */
export function demoDataTransferStepState(transfer) {
  if (!transfer?.available) return NO_DEMO_DATA_TRANSFER;
  return { available: true, done: isDemoDataTransferTerminal(transfer.status) };
}

/**
 * Returns `steps` with the transfer row spliced in after the fiscal step, or `steps` unchanged
 * when the backend did not expose the transfer or the plan hides productive-only rows.
 */
export function withDemoDataTransferStep(steps, transferState, productive) {
  if (!transferState?.available || !productive) return steps;
  const anchor = steps.findIndex((step) => step.id === INSERT_AFTER_STEP_ID);
  const at = anchor < 0 ? steps.length : anchor + 1;
  return [...steps.slice(0, at), DEMO_DATA_TRANSFER_STEP, ...steps.slice(at)];
}
