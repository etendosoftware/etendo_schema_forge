import { sortEnvironments } from '../environmentPresentation.js';

/*
 * ETP-5734 — pure shaping of the "Mis empresas" page: which companies go in which section, and
 * which invitations are still waiting for an answer. No React, no i18n, so it is testable with
 * plain inputs.
 */

/** Invitation statuses that still expect an answer from the invitee. */
const OPEN_INVITATION_STATUSES = new Set(['PENDING', 'SENT']);

/**
 * `/environments` returns one entry per business organization, so a company with two
 * organizations arrives twice. The page lists companies, not organizations: keep the first entry
 * of each client, after the productive-first ordering the rest of the app uses.
 */
export function uniqueCompanies(environments) {
  const byClient = new Map();
  for (const env of sortEnvironments(environments)) {
    if (env?.clientId && !byClient.has(env.clientId)) {
      byClient.set(env.clientId, env);
    }
  }
  return [...byClient.values()];
}

/**
 * Whether the invitation is still open. The backend lists every invitation addressed to the
 * account and only flips a stored status lazily, so a `PENDING`/`SENT` row past its `expiresAt`
 * is already expired and must not be offered.
 */
export function isOpenInvitation(invitation, now = Date.now()) {
  if (!OPEN_INVITATION_STATUSES.has(String(invitation?.status || '').toUpperCase())) return false;
  if (!invitation.expiresAt) return true;
  const expiresAt = Date.parse(invitation.expiresAt);
  return Number.isNaN(expiresAt) || expiresAt > now;
}

/**
 * Companies the account was invited to but never joined: every invitation for the company is
 * closed (expired, revoked, undeliverable) and none was accepted. Their `AD_User` is active from
 * before the invitation, so `/environments` lists them anyway.
 */
function unjoinedClientIds(invitations, now) {
  const accepted = new Set();
  const closed = new Set();
  for (const invitation of invitations) {
    if (!invitation?.clientId) continue;
    if (String(invitation.status || '').toUpperCase() === 'ACCEPTED') {
      accepted.add(invitation.clientId);
    } else if (!isOpenInvitation(invitation, now)) {
      closed.add(invitation.clientId);
    }
  }
  return new Set([...closed].filter((clientId) => !accepted.has(clientId)));
}

/**
 * Splits the account's companies into the page's sections.
 *
 * An invited company whose invitation is still open is shown only in the pending-invitation
 * notice: an invitee's `AD_User` exists from the moment the invitation is created, so the company
 * is already in `/environments` before the invitation has been answered, and listing it twice
 * would read as two different things. For the same reason, an invited company whose invitations
 * all closed without being accepted is not listed at all: the invitation lapsing must not turn it
 * into a membership. A company the account reached without any invitation is listed as before.
 *
 * @param {object[]} environments `/environments?details=true` entries
 * @param {object[]} invitations `/company-invitations/mine` entries
 * @param {number} [now] current time in ms, injectable for tests
 * @returns {{ owned: object[], invited: object[], pendingInvitations: object[] }}
 */
export function groupCompanies(environments, invitations, now = Date.now()) {
  const allInvitations = Array.isArray(invitations) ? invitations : [];
  const pendingInvitations = allInvitations.filter((invitation) => isOpenInvitation(invitation, now));
  const hiddenClientIds = new Set([
    ...pendingInvitations.map((invitation) => invitation.clientId).filter(Boolean),
    ...unjoinedClientIds(allInvitations, now),
  ]);
  const companies = uniqueCompanies(environments);
  return {
    owned: companies.filter((env) => env.relationship === 'OWNER'),
    invited: companies.filter(
      (env) => env.relationship !== 'OWNER' && !hiddenClientIds.has(env.clientId)
    ),
    pendingInvitations,
  };
}
