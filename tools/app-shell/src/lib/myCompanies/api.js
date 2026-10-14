import { apiFetch } from '@etendosoftware/app-shell-core/auth/api';

/*
 * ETP-5734 — the two account-level reads behind the "Mis empresas" page.
 *
 * Both go through the shared `apiFetch`, which carries the active session credential; neither is a
 * write, so no CSRF proof is involved. A 401 is left to `apiFetch`'s default handling: the page
 * lives inside the authenticated app, where a dead session means logging out, not a page-local
 * error state.
 *
 * The core subpath, never the `@/auth/api.js` barrel: the barrel re-exports `.jsx`, which plain
 * `node --test` cannot load.
 */

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function requestError(response) {
  const error = new Error(`Request failed with status ${response.status}`);
  error.status = response.status;
  return error;
}

/**
 * The list under `key`, or a rejection when a successful answer does not carry one. A 200 with an
 * HTML body (an SPA fallback or a proxy page) or without the array is not "no companies": reading
 * it as empty would show the empty state to an account that has companies, with no way to retry.
 */
async function readList(response, key) {
  if (!response.ok) throw requestError(response);
  const data = await readJson(response);
  if (!Array.isArray(data?.[key])) {
    const error = new Error(`Malformed response: missing ${key} array`);
    error.status = response.status;
    throw error;
  }
  return data[key];
}

/**
 * Lists the account's environments WITH the per-company details only this page needs
 * (`userCount`, `ownerName`, role fields). `details=true` is opt-in on the backend so the
 * environment list every app load reads stays cheap.
 *
 * @param {string} baseUrl backend context path (`/etendo`, or `''` at the domain root)
 * @returns {Promise<object[]>} one entry per company organization, as `/environments` returns them
 */
export async function fetchCompanyEnvironments(baseUrl) {
  const response = await apiFetch('/sws/go/environments?details=true', { baseUrl });
  return readList(response, 'environments');
}

/**
 * Lists the company invitations addressed to the signed-in account, whatever their status.
 *
 * @param {string} baseUrl backend context path
 * @returns {Promise<object[]>} the invitations as `/company-invitations/mine` returns them
 */
export async function fetchMyInvitations(baseUrl) {
  const response = await apiFetch('/sws/go/company-invitations/mine', { baseUrl });
  return readList(response, 'invitations');
}
