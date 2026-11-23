import { track, group, groupSet, flush } from '../observability.js';
import { extractWindowName } from './payload.js';
import { HEALTH_EVENTS_MAP } from './health-events.map.js';
import { setFeatureFlagContext } from '../flags/bootstrap.js';
import { getSessionIdentity, getSessionIdentityEpoch, setSessionIdentity } from '../sessionIdentity.js';

function getWindowName() {
  try {
    return extractWindowName(window.location.pathname);
  } catch {
    return undefined;
  }
}

// ETP-5455: the account comes from the in-memory session identity. It used to be read from the
// legacy sf_auth_client_id key, which nothing writes since the cookie session.
function getSessionContext() {
  const { clientId } = getSessionIdentity();
  // `account_id` is the pre-ETP-6228 name of `ad_client_id`; it keeps going out during the transition.
  return clientId ? { account_id: clientId, ad_client_id: clientId } : {};
}

// `account_id` is the pre-ETP-6228 group key, kept until saved reports move to `ad_client_id`.
const GROUP_KEYS = ['ad_client_id', 'account_id'];

export async function trackSessionStarted({ username, clientId, clientName } = {}) {
  // Recorded first, so the flag context below and every later event see who signed in.
  setSessionIdentity({ username, clientId, clientName });
  const session = getSessionIdentity();
  const epoch = getSessionIdentityEpoch();
  const stillCurrent = () => {
    const current = getSessionIdentity();
    return epoch === getSessionIdentityEpoch() && session.username === current.username && session.clientId === current.clientId;
  };
  // Re-target feature flags on the signed-in identity so bucketing matches the
  // Mixpanel user this session reports as. This does NOT reintroduce identify() —
  // that call was removed entirely from the survey/session flow as part of the
  // ETP-4352 GDPR remediation and must stay gone; setFeatureFlagContext is an asynchronous
  // OpenFeature evaluation-context update, unrelated to Mixpanel identity tracking.
  await setFeatureFlagContext({ username, clientId });
  // A failed flag assignment can still belong to a valid session. Session ownership,
  // rather than the provider's success boolean, decides whether telemetry may continue.
  if (!stillCurrent()) return;
  if (clientId) {
    // Both group keys during the ETP-6228 transition, so saved `account_id` group reports keep working.
    // Each pair starts together, with no yield between its calls, and the session is checked before
    // the next step: `group` registers a super property, so a call after a logout would put the
    // previous tenant's id back on later events.
    await Promise.all(GROUP_KEYS.map(key => group(key, clientId)));
    if (!stillCurrent()) return;
    const clientNameValue = clientName || getSessionIdentity().clientName;
    if (clientNameValue) {
      await Promise.all(GROUP_KEYS.map(key => groupSet(key, clientId, { $name: clientNameValue })));
      if (!stillCurrent()) return;
    }
  }
  await track('session_started', {
    account_id: clientId || undefined,
    ad_client_id: clientId || undefined,
  });
  if (!stillCurrent()) return;
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
