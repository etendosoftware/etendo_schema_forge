import { NEO_BASE, fetchNeoWebhookJson } from './neoWebhookClient.js';

// ETP-4830 (item #4) — thin client for the dev/QA-only `SFDebugInvitationBypass` webhook
// (com.etendoerp.go, reached through the NEO pseudo-spec bridge like every other webhook this
// repo calls from `lib/*Api.js`). The backend endpoint 404s outright when its own
// GoRuntimeProperties flag is off (see that class's javadoc) — that is the real security
// boundary, not anything in this file. This module only exists so `UserDebugPanel.jsx` doesn't
// hand-roll the fetch/token/error-unwrap mechanics `fetchNeoWebhookJson` already centralizes.
//
// Response shape branches on the body's own `success` flag, NOT the HTTP status — same
// convention as `saveUserRoleAssignments` (`userRoleAssignmentsApi.js`): both actions fold every
// expected domain-validation rejection into a `success:false` body, thrown here as a JS `Error`
// so callers can surface `error.message` directly (e.g. in a toast).
const successFallback = (data) => ('success' in data ? data : null);

async function callDebugInvitationBypass(params) {
  const query = new URLSearchParams(params).toString();
  const url = `${NEO_BASE}/debuginvitationbypass?${query}`;
  const result = await fetchNeoWebhookJson(url, 'SFDebugInvitationBypass', successFallback);
  if (result.success === false) {
    throw new Error(result.message || 'SFDebugInvitationBypass rejected the request');
  }
  return result;
}

/**
 * Force-accepts an invitation for `email` (or the email of the `AD_User` identified by
 * `adUserId`, when `email` is omitted): finds-or-creates an active `etgo_account` and, if a
 * matching `ETGO_INVITATION` row exists, flips it to `ACCEPTED` — skipping the real token/email
 * round-trip entirely.
 *
 * @param {{email?: string, adUserId?: string, name?: string}} args
 * @returns {Promise<{success: true, email: string, accountId: string, accountCreated: boolean,
 *   temporaryPassword?: string, invitationId: string|null, invitationStatus: string|null}>}
 */
export async function forceAcceptInvitation({ email, adUserId, name } = {}) {
  const params = { Action: 'forceAccept' };
  if (email) params.Email = email;
  if (adUserId) params.AdUserId = adUserId;
  if (name) params.Name = name;
  return callDebugInvitationBypass(params);
}

/**
 * Forces `ETGO_INVITATION.STATUS` to an arbitrary enum value (`PENDING`/`SENT`/`ACCEPTED`/
 * `EXPIRED`/`REVOKED`/`DELIVERY_FAILED`), for exercising `PendingInvitationPill`'s states
 * (`windows/custom/user/index.jsx`) without waiting on real email delivery.
 *
 * @param {{invitationId?: string, email?: string, status: string}} args
 * @returns {Promise<{success: true, invitationId: string, email: string, status: string}>}
 */
export async function forceInvitationStatus({ invitationId, email, status } = {}) {
  const params = { Action: 'forceStatus', Status: status };
  if (invitationId) params.InvitationId = invitationId;
  if (email) params.Email = email;
  return callDebugInvitationBypass(params);
}
