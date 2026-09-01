import { buildHeaders } from '@/auth/api.js';
/**
 * Shared fetch helpers for the `financial-account` NEO spec's write hooks
 * (`useAccountMutations.js`, `useFinancialAccountAccounting.js`) — both call
 * the same bearer-token-authenticated endpoints and surface backend errors
 * the same way, so the plumbing lives here instead of being duplicated.
 */

export function authHeaders(token) {
  return buildHeaders(token);
}

export async function readErrorMessage(res) {
  try {
    const json = await res.json();
    return json?.error?.message || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export async function throwHttpError(res) {
  const message = await readErrorMessage(res);
  const error = new Error(message);
  error.status = res.status;
  throw error;
}
