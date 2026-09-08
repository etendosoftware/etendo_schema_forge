/**
 * The script (mini-tutorial) half of `highlight_element`.
 *
 * A single call can carry an ordered list of steps, and the overlay walks the
 * user through them with Next/Back. Everything here is pure so the machine can
 * be tested without React and without a layout engine: the caller supplies the
 * resolvers, this decides which step ends up on screen.
 */

/**
 * Hard cap on the steps one call may carry.
 *
 * Ten is already a long tutorial for one screen, and the cap protects the
 * overlay from a model that dumps every field of a document into one call.
 * Steps beyond the cap are DROPPED, never a reason to reject the whole call:
 * a nine-tenths tutorial is useful, and the return value tells the model how
 * many were dropped so it can send the rest in a second call.
 */
export const MAX_HIGHLIGHT_STEPS = 10;

function readTargetKey(value) {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/**
 * Read the tool arguments into either a single-element call or a script.
 *
 * `steps` wins over the top-level `fieldKey`/`elementId`/`note`/`durationMs`.
 * Why: `steps` is strictly more expressive — its first entry carries the same
 * addressing shape as the top-level target — so a call with both is a model
 * that left the old single-target fields next to a new array. Honouring the
 * array is what the user asked for, and ignoring the top-level target keeps
 * exactly one source of truth per call instead of silently prepending a
 * phantom step nobody wrote.
 *
 * @param {{steps?: unknown, fieldKey?: string, elementId?: string, note?: string, durationMs?: number}} args
 * @returns {{mode:'single'|'script', steps: Array<{fieldKey?:string, elementId?:string, note:string}>, dropped:number, rejected:Array<{step:number, reason:string}>}}
 */
export function normalizeHighlightSteps(args = {}) {
  const raw = args?.steps;
  if (!Array.isArray(raw) || raw.length === 0) {
    return { mode: 'single', steps: [], dropped: 0, rejected: [] };
  }
  const steps = [];
  const rejected = [];
  let dropped = 0;
  raw.forEach((step, index) => {
    const position = index + 1;
    if (steps.length >= MAX_HIGHLIGHT_STEPS) {
      dropped += 1;
      return;
    }
    if (!step || typeof step !== 'object' || Array.isArray(step)) {
      rejected.push({ step: position, reason: 'a step must be an object with fieldKey or elementId' });
      return;
    }
    const fieldKey = readTargetKey(step.fieldKey);
    const elementId = readTargetKey(step.elementId);
    if (!fieldKey && !elementId) {
      rejected.push({ step: position, reason: 'a step requires elementId or fieldKey' });
      return;
    }
    steps.push({
      ...(fieldKey ? { fieldKey } : {}),
      ...(elementId ? { elementId } : {}),
      note: typeof step.note === 'string' ? step.note : '',
    });
  });
  return { mode: 'script', steps, dropped, rejected };
}

/**
 * Find the first step that can actually be shown, walking in one direction.
 *
 * Resolution happens HERE — at the moment of advancing — not up front: a later
 * field may be off-screen, inside a collapsed section, or not rendered yet when
 * the call arrives, and pre-resolving would reject a step that is perfectly
 * reachable by the time the user presses Next.
 *
 * An unresolvable step is SKIPPED, never a dead end. Dead-ending would leave a
 * ring on nothing (or a Next button that visibly does nothing), which reads as
 * a broken app; the user's mental model is "the tour moved on". The skipped
 * steps and their reasons are returned so the caller can report them.
 *
 * @param {Array<{note?: string, resolve: () => Element}>} steps
 * @param {number} startIndex — first index to try
 * @param {1|-1} direction
 * @returns {{index:number, element:Element|null, note:string, skipped:Array<{step:number, reason:string}>}}
 */
export function advanceHighlightScript(steps, startIndex, direction) {
  const skipped = [];
  const list = Array.isArray(steps) ? steps : [];
  for (let index = startIndex; index >= 0 && index < list.length; index += direction) {
    const step = list[index];
    let element = null;
    let reason = 'the step resolved to nothing';
    try {
      element = step?.resolve?.();
    } catch (error) {
      element = null;
      reason = error instanceof Error ? error.message : String(error);
    }
    if (element) {
      return { index, element, note: typeof step.note === 'string' ? step.note : '', skipped };
    }
    skipped.push({ step: index + 1, reason });
  }
  return { index: -1, element: null, note: '', skipped };
}
