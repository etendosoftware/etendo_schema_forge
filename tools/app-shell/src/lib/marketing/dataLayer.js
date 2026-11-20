/**
 * ETP-6363 — the app's events for marketing, pushed to Google Tag Manager's `dataLayer`, which
 * forwards them to Google Analytics (marketing's spec, "Atribución de leads", step 6).
 *
 * Rules, all enforced here:
 *   - nothing personal: each event carries only the parameters listed for it, and none is an email,
 *     a name or a phone. `user_id` is the account's internal id;
 *   - an event only once its action is confirmed (the backend answered), never on the click;
 *   - no duplicates: one `onboarding_step` per step, one `purchase` per transaction;
 *   - nothing at all where GTM is not loaded (another host, a support session), so a developer's
 *     machine never feeds marketing's reports.
 *
 * `step_name` values are the onboarding's own step ids, shared with Mixpanel; marketing's reports
 * depend on them, so they must not change.
 */

import { isGtmInstalled } from './gtm.js';

export const ONBOARDING_STEPS = Object.freeze({
  profile: 1,
  company: 2,
});

const PURCHASED_KEY = 'etgo_dl_purchases';
const MAX_REMEMBERED = 50;

let identifiedUserId = null;
const pushedSteps = new Set();

function dataLayerOf(win) {
  if (!win || !isGtmInstalled(win)) return null;
  win.dataLayer = win.dataLayer || [];
  return win.dataLayer;
}

/**
 * Pushes one event, when GTM is loaded.
 *
 * @param {object} message the dataLayer message
 * @param {Window} [win] the browser's, by default
 * @returns {boolean} whether it was pushed
 */
export function pushDataLayer(message, win = globalThis.window) {
  const dataLayer = dataLayerOf(win);
  if (!dataLayer) return false;
  dataLayer.push(message);
  return true;
}

/** `sign_up`, on an account created: `google` for a single sign-on, `email` for the form. */
export function pushSignUp(method, win) {
  return pushDataLayer({ event: 'sign_up', method: methodOf(method) }, win);
}

/** `login`, on a sign-in that found the account. */
export function pushLogin(method, win) {
  return pushDataLayer({ event: 'login', method: methodOf(method) }, win);
}

function methodOf(method) {
  return method === 'google' ? 'google' : 'email';
}

/**
 * `user_identified`, once per account and page load.
 *
 * @param {string} userId the account's internal id, never its address
 */
export function pushUserIdentified(userId, win) {
  const id = typeof userId === 'string' ? userId.trim() : '';
  if (!id || id.includes('@') || id === identifiedUserId) return false;
  const pushed = pushDataLayer({ event: 'user_identified', user_id: id }, win);
  if (pushed) identifiedUserId = id;
  return pushed;
}

/** `logout`, which also clears the user GTM holds. */
export function pushLogout(win) {
  identifiedUserId = null;
  return pushDataLayer({ event: 'logout', user_id: null }, win);
}

/**
 * `onboarding_step`, once per step and page load.
 *
 * @param {string} stepName one of {@link ONBOARDING_STEPS}
 */
export function pushOnboardingStep(stepName, win) {
  const stepNumber = ONBOARDING_STEPS[stepName];
  if (!stepNumber || pushedSteps.has(stepName)) return false;
  const pushed = pushDataLayer({ event: 'onboarding_step', step_number: stepNumber, step_name: stepName }, win);
  if (pushed) pushedSteps.add(stepName);
  return pushed;
}

/** `onboarding_complete`: the environment was created. */
export function pushOnboardingComplete(win) {
  return pushDataLayer({ event: 'onboarding_complete' }, win);
}

function rememberedPurchases(storage) {
  return rememberedList(storage, PURCHASED_KEY);
}

/**
 * `purchase`, once per transaction, when the backend has confirmed the payment.
 *
 * @param {{ transactionId: string, planKey?: string, planName?: string, value?: number,
 *   currency?: string }} purchase
 * @param {{ win?: Window, storage?: Storage }} [target]
 */
export function pushPurchase(purchase, { win = globalThis.window, storage = globalThis.localStorage } = {}) {
  const transactionId = String(purchase?.transactionId || '').trim();
  if (!transactionId || !dataLayerOf(win)) return false;
  const remembered = rememberedPurchases(storage);
  if (remembered.includes(transactionId)) return false;
  const value = Number(purchase.value);
  const ecommerce = {
    transaction_id: transactionId,
    ...(Number.isFinite(value) && value >= 0 ? { value } : {}),
    ...(purchase.currency ? { currency: String(purchase.currency).toUpperCase() } : {}),
    ...(purchase.planKey ? { items: [{ item_id: purchase.planKey, item_name: purchase.planName || purchase.planKey }] } : {}),
  };
  // Google's recommendation: clear the previous ecommerce object before a new one.
  pushDataLayer({ ecommerce: null }, win);
  pushDataLayer({ event: 'purchase', ecommerce }, win);
  try {
    storage?.setItem(PURCHASED_KEY, JSON.stringify([...remembered, transactionId].slice(-MAX_REMEMBERED)));
  } catch {
    // A purchase pushed again after storage failed is a duplicate, not a lost sale.
  }
  return true;
}

/**
 * The qualification milestones the backend detects (com.etendoerp.go `HubSpotOutboxStore`), the
 * values `first_key_action` carries as `action_name`.
 */
export const KEY_ACTIONS = Object.freeze([
  'import', 'business_partner', 'product', 'order', 'invoice', 'invoice_completed', 'invoice_posted',
]);

const FIRST_KEY_ACTION_KEY = 'etgo_dl_first_key_action';
/**
 * A first key action older than this is not reported: it predates the event (accounts that were
 * already active when it shipped), and reporting it now would date the conversion wrongly.
 */
export const FIRST_KEY_ACTION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function rememberedList(storage, key) {
  try {
    const stored = JSON.parse(storage?.getItem(key) || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

/**
 * `first_key_action`, once per account: the first qualification milestone the backend detected in
 * the demo, as `/sws/go/me` tells it (`firstKeyAction`), sent as `action_name`. The backend detects it within a minute,
 * so it is reported on a later load of the app, not on the action itself.
 *
 * @param {string} accountId the account's internal id
 * @param {{ action?: string, at?: string }} firstKeyAction what `/me` said, if anything
 * @param {{ win?: Window, storage?: Storage, now?: number }} [target]
 * @returns {boolean} whether it was pushed
 */
export function pushFirstKeyAction(accountId, firstKeyAction, {
  win = globalThis.window,
  storage = globalThis.localStorage,
  now = Date.now(),
} = {}) {
  const id = typeof accountId === 'string' ? accountId.trim() : '';
  const action = firstKeyAction?.action;
  const at = Date.parse(firstKeyAction?.at);
  if (!id || !KEY_ACTIONS.includes(action) || !Number.isFinite(at)) return false;
  if (now - at > FIRST_KEY_ACTION_MAX_AGE_MS || !dataLayerOf(win)) return false;
  const remembered = rememberedList(storage, FIRST_KEY_ACTION_KEY);
  if (remembered.includes(id)) return false;
  pushDataLayer({ event: 'first_key_action', action_name: action }, win);
  try {
    storage?.setItem(FIRST_KEY_ACTION_KEY, JSON.stringify([...remembered, id].slice(-MAX_REMEMBERED)));
  } catch {
    // Unwritable storage only risks a repeat on a later load.
  }
  return true;
}

/**
 * Translates an onboarding event into marketing's, if it is one of them.
 *
 * @param {string} name the onboarding event (see etendo-go-core's trackOnboarding calls)
 * @param {object} properties its properties
 * @param {Window} [win]
 */
export function pushOnboardingEvent(name, properties = {}, win = globalThis.window) {
  switch (name) {
    case 'onboarding_auth_succeeded':
      return pushAuthSucceeded(properties, win);
    case 'onboarding_setup_step_completed':
      return pushOnboardingStep(properties.type, win);
    case 'onboarding_run_succeeded':
      return pushOnboardingComplete(win);
    default:
      return false;
  }
}

function pushAuthSucceeded(properties, win) {
  const { action, provider, accountCreated, accountId } = properties;
  let pushed;
  if (action === 'register') {
    pushed = pushSignUp('email', win);
  } else if (action === 'sso') {
    pushed = accountCreated === true ? pushSignUp(provider, win) : pushLogin(provider, win);
  } else if (action === 'login') {
    pushed = pushLogin('email', win);
  } else {
    return false;
  }
  if (accountId) pushUserIdentified(accountId, win);
  return pushed;
}

/** Test seam: forgets what this page load already pushed. */
export function resetDataLayerStateForTests() {
  identifiedUserId = null;
  pushedSteps.clear();
}
