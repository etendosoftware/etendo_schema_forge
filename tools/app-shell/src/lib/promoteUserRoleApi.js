import { NEO_BASE, fetchNeoWebhookJson } from './neoWebhookClient.js';

// ETP-5019 — thin client for the admin-triggered `SFPromoteUserRole` webhook
// (com.etendoerp.go), same "thin client for a single webhook" convention as
// `resendInvitationApi.js`. Response shape branches on the body's own `success` flag, matching
// `SFPromoteUserRole`'s own `SFAssignUserRoles`-style convention (never a raw HTTP error for an
// expected domain rejection).
const promoteFallback = (data) => ('success' in data ? data : null);

async function callPromoteWebhook(userId, mode) {
  const params = new URLSearchParams({ UserId: userId, Mode: mode });
  const url = `${NEO_BASE}/promoteuserrole?${params.toString()}`;
  const result = await fetchNeoWebhookJson(url, 'SFPromoteUserRole', promoteFallback);
  if (!result.success) {
    throw new Error(result.message || 'SFPromoteUserRole rejected the request');
  }
  return result;
}

/**
 * Promotes `userId` (a non-owner, non-admin invited user) to the client's Admin role.
 * @param {string} userId - AD_User_ID of the target user.
 * @returns {Promise<{success: true, userId: string, roleId: string}>}
 */
export async function promoteUserToAdmin(userId) {
  return callPromoteWebhook(userId, 'promote');
}

/**
 * Demotes `userId` from the client's Admin role back to their prior (or a fresh) personal role.
 * @param {string} userId - AD_User_ID of the target user.
 * @returns {Promise<{success: true, userId: string, roleId: string}>}
 */
export async function demoteUserFromAdmin(userId) {
  return callPromoteWebhook(userId, 'demote');
}
