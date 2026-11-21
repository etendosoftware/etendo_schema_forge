import {
  clearActiveFeature,
  getSessionAccountId,
  setActiveFeature,
} from '@etendosoftware/app-shell-core/auth';
import { track, setContext } from '../observability.js';
import { OBSERVABILITY_EVENTS, buildObservabilityEvent } from './events.js';
import { getSessionIdentity } from '../sessionIdentity.js';

/**
 * ETP-5646 — feature usage: which menu entry the user is on, counted once per actual open.
 *
 * `enterFeature` is called by the route tracker with the feature the current location resolves to
 * (or null). It does three things, all keyed by the same stable feature key:
 *   1. binds the key to this tab for first-party NEO requests (`X-Etendo-Feature`, attribution);
 *   2. puts it in the observability context, so RUM views, actions, errors and resources carry it;
 *   3. emits `feature_opened` ONCE when the feature changes (menu click, link or direct URL).
 *
 * Moving inside a feature (list -> record, query or hash change) is not an open. Leaving for a
 * non-feature route and coming back is. An identity switch or logout forgets the last feature, so
 * the next user's first screen counts for them, and the previous user's feature never labels it.
 * Module state is per tab: two tabs count their own opens.
 */
let lastKey = null;
let lastAccount = null;
let lastClient = null;
let firstRoute = true;

export function resetFeatureUsageForTests() {
  lastKey = null;
  lastAccount = null;
  lastClient = null;
  firstRoute = true;
  clearActiveFeature();
}

/** Forget the current feature and the identity it was counted for (logout, session loss). */
export function leaveFeature() {
  lastKey = null;
  lastAccount = null;
  lastClient = null;
  clearActiveFeature();
  return setContext({ featureKey: undefined });
}

// A REAL identity change: both the old and the new id are known and differ. An id that was
// unknown and resolves later (a direct URL rendered before the session) is not a change.
const changed = (previous, next) => previous !== null && next !== null && previous !== next;

export function enterFeature(feature, { emit = defaultEmit } = {}) {
  // Same scope the request path compares against (`apiFetch` reads `getSessionAccountId()`).
  const account = getSessionAccountId() ?? null;
  const client = getSessionIdentity().clientId ?? null;
  const source = firstRoute ? 'direct_url' : 'navigation';
  firstRoute = false;

  const identityChanged = changed(lastAccount, account) || changed(lastClient, client);
  if (identityChanged) leaveFeature();
  lastAccount = account ?? lastAccount;
  lastClient = client ?? lastClient;

  if (!feature) {
    if (lastKey !== null) leaveFeature();
    return;
  }
  const key = feature.key;
  // Binding follows the account silently, so it never starts a second open.
  setActiveFeature(key, account);
  if (key === lastKey) return;
  lastKey = key;
  Promise.resolve(setContext({ featureKey: key })).catch(() => {});
  emit({ featureKey: key, source });
}

function defaultEmit({ featureKey, source }) {
  const event = buildObservabilityEvent(OBSERVABILITY_EVENTS.FEATURE_OPENED, {
    category: 'product_usage',
    featureKey,
    source,
  });
  if (!event.name) return;
  Promise.resolve(track(event.name, event.properties)).catch(() => {});
}
