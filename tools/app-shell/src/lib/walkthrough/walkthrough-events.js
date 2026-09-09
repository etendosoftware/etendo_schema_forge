/**
 * Mixpanel reporting for the guided walkthroughs (ETP-5144).
 *
 * This is the HOST half of the split. `app-shell-core` decides what happened —
 * the launcher reports a menu open / a flow start, and `recordFlowFinish`
 * persists a run's outcome and describes it — all in plain data, with no event
 * names and no analytics vocabulary. This module is the only place that turns
 * those descriptors into events in THIS app's catalog, which is what keeps the
 * core usable by a host with different (or no) telemetry.
 *
 * The three `track*` functions are injected into the core through
 * `<ObservabilityProvider>` in `App.jsx`; `handleWalkthroughFinish` is handed to
 * `<WalkthroughProvider onFinish>` in `AppLayout.jsx`.
 *
 * Every call is fire-and-forget, following `components/support/SupportChatContext.jsx`:
 * a failed `track()` must never block or break the UI it was reporting on.
 *
 * Property vocabulary is constrained by `lib/observability/payload.js`: `step`
 * is numeric-only, so the step INDEX travels under `step` and the authored id
 * under `stepId`. Undeclared properties are dropped at sanitization, which is
 * why each event's keys are declared in `lib/observability/events.js`.
 */
import { recordFlowFinish } from '@etendosoftware/app-shell-core/walkthrough';
import { track } from '@/lib/observability.js';
import { OBSERVABILITY_EVENTS, buildObservabilityEvent } from '@/lib/observability/events.js';

function emit(eventDefinition, properties = {}) {
  const event = buildObservabilityEvent(eventDefinition, properties);
  Promise.resolve(track(event.name, event.properties)).catch(() => {});
}

/**
 * The click on the tutorials button in the topbar.
 * @param {{count: number, total: number}} properties unfinished / on offer
 */
export function trackWalkthroughMenuOpened(properties) {
  emit(OBSERVABILITY_EVENTS.WALKTHROUGH_MENU_OPENED, properties);
}

/**
 * A tutorial starting. `status` is the flow's state BEFORE the run, which is
 * what separates a first-timer from a repeater from someone returning to a
 * revised tour; the core reads it before it marks the start.
 * @param {{flowId: string, status: string, total: number, source: string}} properties
 */
export function trackWalkthroughStarted(properties) {
  emit(OBSERVABILITY_EVENTS.WALKTHROUGH_STARTED, properties);
}

/**
 * A tutorial ending, either way.
 *
 * Renames the core descriptor's `stepIndex`/`totalSteps` onto this app's
 * `step`/`total` -- the allowlist in `payload.js` is the constraint, and `step`
 * there is numeric-only, so the index goes in `step` and the authored id stays
 * in `stepId`.
 *
 * @param {{flowId: string, status: string, stepId: string|null,
 *          stepIndex?: number, totalSteps?: number, durationMs?: number}} report
 */
export function trackWalkthroughFinished({ stepIndex, totalSteps, ...rest } = {}) {
  emit(OBSERVABILITY_EVENTS.WALKTHROUGH_FINISHED, {
    ...rest,
    step: stepIndex,
    total: totalSteps,
  });
}

/**
 * The engine's `onFinish`: persist the outcome, then report it.
 *
 * A completed run and an abandoned one are ONE event with a `status` breakdown
 * rather than two events, so the funnel stays a single step. `stepId` is the
 * step an abandoned run walked away from — the datum that says where a tour
 * loses people, which a bare `completed: false` cannot.
 *
 * @param {{flowId: string, completed: boolean, stepId?: string|null,
 *          stepIndex?: number, totalSteps?: number}} info the engine's payload
 * @param {{id: string, revision?: number}[]} flows the flows given to the provider
 */
export function handleWalkthroughFinish(info, flows) {
  const report = recordFlowFinish(info, flows);
  if (!report) return;
  trackWalkthroughFinished(report);
}
