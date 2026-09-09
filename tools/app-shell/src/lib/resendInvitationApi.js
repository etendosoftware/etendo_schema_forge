import { NEO_BASE, fetchNeoWebhookJson } from './neoWebhookClient.js';

// ETP-4830 (item #2) — thin client for the admin-triggered `SFResendInvitation` webhook
// (com.etendoerp.go, reached through the NEO pseudo-spec bridge like every other webhook this
// repo calls from `lib/*Api.js`). Unlike `debugInvitationBypassApi.js`'s sibling, this is a real,
// always-on production feature (no dev-only flag) — the access boundary is the webhook's own
// admin/client-admin role check plus server-side client scoping of the target user.
//
// Response shape branches on the body's own `error` flag, NOT the HTTP status — same "don't 500 a
// validation rejection" convention as every other webhook on this bridge
// (`CompanyInvitationService#errorResponse` sets `error: true`, `#invitationResponse` sets
// `status: "success"` — different key names than `saveUserRoleAssignments`'s `success`/`false`
// pair, since this reuses `CompanyInvitationService`'s own existing response builders rather than
// inventing a new shape for this one webhook).
const resendFallback = (data) => ('status' in data || 'error' in data ? data : null);

/**
 * Re-issues an invitation for `userId` regardless of whether the current one is still valid.
 * Eligible source statuses: `PENDING`, `SENT`, `EXPIRED`, `DELIVERY_FAILED` (a `REVOKED`
 * invitation is rejected server-side rather than silently resurrected; `ACCEPTED` has nothing
 * left to resend). If the current invitation is still open (`PENDING`/`SENT`, not yet expired),
 * the backend revokes it before minting a new one — see
 * `CompanyInvitationService#resendInvitation`'s own javadoc for the full rule.
 *
 * @param {string} userId - AD_User_ID of the invited user.
 * @param {string} [language] - Operator locale (`es_ES`, `en_US`). ETP-5003 — without it the email
 *   falls back to Spanish for every recipient instead of following the locale in use.
 * @returns {Promise<{status: 'success', invitation: {id: string, email: string, status: string,
 *   expiresAt?: string}}>}
 */
export async function resendInvitation(userId, language) {
  const params = new URLSearchParams({ AdUserId: userId });
  if (language) {
    params.set('Language', language);
  }
  const url = `${NEO_BASE}/resendinvitation?${params.toString()}`;
  const result = await fetchNeoWebhookJson(url, 'SFResendInvitation', resendFallback);
  if (result.error) {
    throw new Error(result.message || 'SFResendInvitation rejected the request');
  }
  return result;
}
