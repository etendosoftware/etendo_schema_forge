import { setContext } from '../observability.js';

/** ETP-6230 — company domains whose users are internal (their usage must not count in KPIs). */
export const INTERNAL_EMAIL_DOMAINS = Object.freeze(['etendo.software', 'etendo.ai', 'smfconsulting.es']);

/** `true`/`false` from the email's domain; `undefined` when there is no email. The email itself never leaves. */
export function isInternalEmail(email) {
  const value = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const domain = value.includes('@') ? value.slice(value.lastIndexOf('@') + 1) : undefined; // last '@', as the backend does
  return domain ? INTERNAL_EMAIL_DOMAINS.includes(domain) : undefined;
}

/** Puts `internal_user` on every later event as context (ETP-6230). */
export function setInternalUserContext(email) {
  Promise.resolve(setContext({ internal_user: isInternalEmail(email) })).catch(() => {});
}
