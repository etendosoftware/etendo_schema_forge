/**
 * Registry of every feature flag the app evaluates.
 *
 * The default declared here is the value the app uses whenever the control
 * plane cannot answer (provider disabled, offline, misconfigured, or the flag
 * is missing in Mixpanel). It must always describe today's shipped behaviour,
 * so an unreachable control plane degrades to the current product instead of
 * exposing unfinished work.
 */

// `tenant-upgrade` was retired in ETP-4966. The paid productive-environment flow is permanent and
// cannot be switched off: this end evaluated the key through ConfigCat while the backend evaluated
// it through local properties that were unset in every deployed environment, so the browser offered
// a Stripe checkout the backend did not honour and paying accounts got a demo environment. Do not
// reintroduce a client-only gate over a capability the backend charges for.

/** Reveals the internal Proof of Concept section in the side menu. */
export const PROOF_OF_CONCEPT_MENU = 'proof-of-concept-menu';

/** Enables the AI SDK Copilot agent integration; native browser WebMCP is deferred. */
export const WEBMCP_AGENT_CHAT = 'webmcp-agent-chat';

export const FLAG_DEFAULTS = Object.freeze({
  [PROOF_OF_CONCEPT_MENU]: false,
  [WEBMCP_AGENT_CHAT]: false,
});

/**
 * Safe default for a key. Unknown keys resolve to `false` so a typo hides the
 * feature rather than revealing it.
 */
export function defaultForFlag(key) {
  return FLAG_DEFAULTS[key] ?? false;
}
