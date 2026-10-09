/**
 * Tiny pub/sub: "the user tried to use a Save/Confirm button the required-field
 * gate is blocking" (ETP-5513).
 *
 * `buildSaveGate` disables Save/Confirm while required fields are empty, so the user
 * can never click it and `fieldErrors` is never set. A required field hidden behind
 * the header form's "Show more details" block would then be named only in a tooltip.
 * `GateTooltip` (the wrapper of every gated button) reports the attempt here —
 * hover, focus or press on the disabled button — and the header form reveals the
 * hidden fields named in `keys`.
 *
 * Module-level on purpose: the buttons live in the topbar, the form several levels
 * away, and DetailView must not grow (committed no-growth guardrail).
 */
const listeners = new Set();

/** @param {(keys: string[]) => void} listener @returns {() => void} unsubscribe */
export function subscribeSaveGateAttempts(listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** @param {string|string[]|undefined} missing comma-separated string (`data-missing-required`) or keys */
export function notifySaveGateAttempt(missing) {
  const keys = (Array.isArray(missing) ? missing : String(missing ?? '').split(','))
    .map(k => String(k).trim())
    .filter(Boolean);
  if (keys.length === 0) return;
  for (const listener of [...listeners]) listener(keys);
}
