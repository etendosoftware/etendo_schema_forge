import { track, group, groupSet, flush } from '../observability.js';
import { extractWindowName } from './payload.js';
import { HEALTH_EVENTS_MAP } from './health-events.map.js';
import { setFeatureFlagContext } from '../flags/bootstrap.js';

function getWindowName() {
  try {
    return extractWindowName(window.location.pathname);
  } catch {
    return undefined;
  }
}

function getSessionContext() {
  try {
    return {
      account_id: localStorage.getItem('sf_auth_client_id') || undefined,
    };
  } catch {
    return {};
  }
}

export async function trackSessionStarted({ username, clientId, clientName } = {}) {
  // Re-target feature flags on the signed-in identity so bucketing matches the
  // Mixpanel user this session reports as. This does NOT reintroduce identify() —
  // that call was removed entirely from the survey/session flow as part of the
  // ETP-4352 GDPR remediation and must stay gone; setFeatureFlagContext is a local
  // OpenFeature evaluation-context update, unrelated to Mixpanel identity tracking.
  setFeatureFlagContext({ username, clientId });
  if (clientId) {
    void group('account_id', clientId);
    const clientNameValue = clientName || localStorage.getItem('sf_auth_client_name') || undefined;
    if (clientNameValue) {
      void groupSet('account_id', clientId, { $name: clientNameValue });
    }
  }
  await track('session_started', {
    account_id: clientId || undefined,
  });
  await flush();
}

export function trackDocumentCreated(windowName) {
  const resolvedWindowName = windowName || getWindowName();
  const meta = HEALTH_EVENTS_MAP[resolvedWindowName];
  if (!meta) return;
  void track('document_created', {
    document_type: meta.document_type,
    functional_area: meta.functional_area,
    ...getSessionContext(),
  });
}

export function trackTransactionPosted() {
  const windowName = getWindowName();
  const meta = HEALTH_EVENTS_MAP[windowName];
  if (!meta || !meta.transactional) return;
  void track('transaction_posted', {
    document_type: meta.document_type,
    functional_area: meta.functional_area,
    ...getSessionContext(),
  });
}
