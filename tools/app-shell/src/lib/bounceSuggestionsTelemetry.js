import { track } from '@/lib/observability.js';
import { OBSERVABILITY_EVENTS, buildObservabilityEvent } from '@/lib/observability/events.js';
import { getSessionIdentity } from '@/lib/sessionIdentity.js';

/**
 * Fire-and-forget telemetry of the bounce suggestions in the automatch modal (ETP-5581, roadmap #15
 * indicator "suggestions closed without deciding"). Same domain-wrapper pattern as
 * productUsageTelemetry.js: the event goes through the shared gateway, so the support-session
 * suppression, the kill switch and the provider/env gating apply as for every other event, and the
 * payload policy drops anything not declared. The account is the tenant from the session, never a
 * person; no record id, amount, counterparty or text is ever sent.
 */
function send(eventDefinition, properties) {
  const { clientId } = getSessionIdentity();
  const event = buildObservabilityEvent(eventDefinition, {
    account_id: clientId || undefined,
    ...properties,
  });
  if (!event.name) return;
  try {
    Promise.resolve(track(event.name, event.properties)).catch(() => {});
  } catch {
    // Telemetry never breaks the modal.
  }
}

/**
 * The automatch modal was shown with at least one bounce pair. Once per opening.
 *
 * @param {{ pairsShown: number, pairsPreselected: number, autoOpened: boolean }} args
 */
export function trackBounceSuggestionsViewed({ pairsShown, pairsPreselected, autoOpened }) {
  send(OBSERVABILITY_EVENTS.BOUNCE_SUGGESTIONS_VIEWED, {
    pairs_shown: pairsShown,
    pairs_preselected: pairsPreselected,
    auto_opened: !!autoOpened,
  });
}

/**
 * The automatch modal was closed without applying while it showed bounce pairs.
 *
 * @param {{ pairsShown: number, pairsCheckedAtClose: number, autoOpened: boolean }} args
 */
export function trackBounceSuggestionsDismissed({ pairsShown, pairsCheckedAtClose, autoOpened }) {
  send(OBSERVABILITY_EVENTS.BOUNCE_SUGGESTIONS_DISMISSED, {
    pairs_shown: pairsShown,
    pairs_checked_at_close: pairsCheckedAtClose,
    auto_opened: !!autoOpened,
  });
}
