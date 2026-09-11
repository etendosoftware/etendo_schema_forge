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

/**
 * The backend speaks TWO error shapes and this has to read both.
 *
 * The long-standing one nests: `{ error: { message, status } }`. The flat IMP-5 shape introduced
 * with ETP-5073/DOC-04 puts a machine-readable discriminator where the object used to be:
 * `{ status, error: "stale_record", message, detail, hint }`. Reading only the nested shape turned
 * every one of those into a bare "HTTP 409", which is how a concurrent-edit conflict ended up
 * reported to the user as "that account name already exists".
 *
 * @returns {{message: string, code: string|null, body: object|null}}
 */
async function readError(res) {
  try {
    const json = await res.json();
    const nested = json?.error && typeof json.error === 'object' ? json.error : null;
    const code = typeof json?.error === 'string' ? json.error : null;
    return {
      message: nested?.message || json?.message || `HTTP ${res.status}`,
      code,
      body: json ?? null,
    };
  } catch {
    return { message: `HTTP ${res.status}`, code: null, body: null };
  }
}

export async function readErrorMessage(res) {
  return (await readError(res)).message;
}

export async function throwHttpError(res) {
  const { message, code, body } = await readError(res);
  const error = new Error(message);
  error.status = res.status;
  // Branch on the code, never on the status: 409 alone no longer identifies anything.
  error.code = code;
  error.body = body;
  throw error;
}
