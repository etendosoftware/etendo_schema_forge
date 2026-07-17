import { track } from '@/lib/observability.js';
import { OBSERVABILITY_EVENTS, buildObservabilityEvent } from '@/lib/observability/events.js';

/**
 * Fire-and-forget telemetry for the MCP client connection landing.
 * Mirrors the domain-wrapper pattern in productUsageTelemetry.js.
 */
export function trackMcpConnectTabSelected({ client } = {}) {
  const event = buildObservabilityEvent(OBSERVABILITY_EVENTS.MCP_CONNECT_TAB_SELECTED, {
    client,
  });

  if (!event.name) return;
  Promise.resolve(track(event.name, event.properties)).catch(() => {});
}
