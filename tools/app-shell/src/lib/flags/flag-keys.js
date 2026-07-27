/**
 * Registry of every feature flag the app evaluates.
 *
 * The default declared here is the value the app uses whenever the control
 * plane cannot answer (provider disabled, offline, misconfigured, or the flag
 * is missing in Mixpanel). It must always describe today's shipped behaviour,
 * so an unreachable control plane degrades to the current product instead of
 * exposing unfinished work.
 */

/** Gates the paid upgrade flow that creates a second, productive tenant. */
export const TENANT_UPGRADE = 'tenant-upgrade';

/** Reveals the internal Proof of Concept section in the side menu. */
export const PROOF_OF_CONCEPT_MENU = 'proof-of-concept-menu';

export const FLAG_DEFAULTS = Object.freeze({
  [TENANT_UPGRADE]: false,
  [PROOF_OF_CONCEPT_MENU]: false,
});

/**
 * Safe default for a key. Unknown keys resolve to `false` so a typo hides the
 * feature rather than revealing it.
 */
export function defaultForFlag(key) {
  return FLAG_DEFAULTS[key] ?? false;
}
