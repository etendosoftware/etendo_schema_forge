import { setContext } from '../observability.js';

/**
 * ETP-6228 — `ad_user_id`, `ad_client_id` and `etgo_account_id`: the common identity of every
 * analytics event, so a KPI can count per environment or account and join SPA events with the
 * backend's. They are the internal identifiers only (no name, email or username).
 *
 * `ad_client_id` is the environment (AD_Client_ID), the value `account_id` has always carried;
 * `etgo_account_id` is the ETGO_Account that owns it (one account, several environments).
 */
export const EMPTY_IDENTITY_CONTEXT = Object.freeze({
  ad_user_id: undefined,
  ad_client_id: undefined,
  etgo_account_id: undefined,
});

function idOrUndefined(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

/**
 * @returns {{ad_user_id?: string, ad_client_id?: string, etgo_account_id?: string}} every key
 *   present, `undefined` while its id is unknown (left off the events, never guessed).
 */
export function resolveIdentityContext({ userId, clientId, accountId } = {}) {
  return {
    ad_user_id: idOrUndefined(userId),
    ad_client_id: idOrUndefined(clientId),
    etgo_account_id: idOrUndefined(accountId),
  };
}

/** Drops the three ids from the common event context (logout, session loss, unmount). */
export function clearIdentityContext() {
  return setContext(EMPTY_IDENTITY_CONTEXT);
}
