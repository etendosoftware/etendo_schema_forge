import { detectBaseUrl } from '@etendosoftware/app-shell-core/auth/api';

/**
 * Read-only client for the Business Partner self-service portal (ETP-5267).
 *
 * The portal is the one surface in the app whose caller is NOT a tenant user: a Business
 * Partner opens a magic link and reads their own invoices, with no account and no session.
 * Three consequences shape this module.
 *
 * **1. The token is the whole credential, and it travels in a header.** It arrives once, as a
 * path segment of `/portal/<token>` (that is what makes the link mailable and bookmarkable),
 * and every request made afterwards passes it through `apiFetch`'s `token` option so it goes
 * out as `Authorization: Bearer …`. It must NEVER be appended to a query string — that is the
 * one place it would be recorded in access logs and proxy logs (plan §5.4).
 *
 * **2. A 401 here is a domain answer, not an expired session**, so every call sets
 * `on401: 'ignore'`. Without it the shared helper would route the BP's invalid link into the
 * tenant logout choke point — clearing state for a session that never existed. See
 * `docs/request-policy.md`.
 *
 * **3. Unknown and revoked are deliberately indistinguishable.** The backend answers the same
 * way to both (plan §5.2), and this module keeps that property by collapsing 401/403/404 into
 * one {@link PORTAL_ERROR.invalidLink} code. Nothing in the UI may branch on which it was —
 * that branch is the enumeration oracle the design removes.
 *
 * Endpoints live under `/sws/portal/*`, never `/sws/neo/*`: the portal is a separate bounded
 * context and must not be reachable through the generic CRUD engine every window shares.
 * This is also why the route's own `apiBaseUrl` (which already ends in `/sws/neo`) is NOT
 * usable here — see {@link resolvePortalBaseUrl}.
 */

/** Path prefix of the portal's own servlet — deliberately NOT under `/sws/neo`. */
const PORTAL_API_PREFIX = '/sws/portal';

/**
 * The error codes this module raises, mapped to i18n keys by `PortalPage`.
 *
 * `invalidLink` covers unknown AND revoked AND out-of-scope, on purpose: the page renders one
 * generic message for all three.
 */
export const PORTAL_ERROR = {
  invalidLink: 'invalidLink',
  loadFailed: 'loadFailed',
  downloadFailed: 'downloadFailed',
};

/**
 * Statuses that mean "this token is not, or is no longer, a credential".
 *
 * 404 belongs here for the two collection endpoints because the backend answers 404 rather
 * than 403 for anything outside the token's own `(client, bpartner)` scope — it never confirms
 * that a record exists (plan §6).
 */
const INVALID_TOKEN_STATUSES = Object.freeze([401, 403, 404]);

/** As above, minus 404: on a single PDF, a 404 is one missing document, not a dead link. */
const INVALID_TOKEN_STATUSES_PDF = Object.freeze([401, 403]);

/**
 * Base URL for the portal's requests.
 *
 * Two things it is NOT. It is not the `apiBaseUrl` the router hands its pages — that value
 * ends in `/sws/neo`, and prefixing it would send portal calls into the NEO servlet. And in
 * `vite dev` it is not `VITE_API_BASE` either: that variable can point straight at Tomcat,
 * which bypasses the dev server's `/sws` proxy and turns every portal call into a
 * cross-origin request. Same reasoning, and same shape, as `UpgradePage`'s own base helper.
 */
export function resolvePortalBaseUrl() {
  return import.meta.env?.DEV ? '' : detectBaseUrl();
}

/** An `Error` carrying one of {@link PORTAL_ERROR}'s codes, so the page can switch on it. */
function portalError(code, { status = null, cause } = {}) {
  return Object.assign(new Error(code), { code, status, cause });
}

function readableText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** `null` for anything that is not a finite number, so `formatCurrency` renders its own dash. */
function readableAmount(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * One GET against the portal servlet, with the token in the header and the status mapping
 * described in this module's docstring.
 *
 * `fetchImpl` is injected rather than imported so the caller supplies the memoized `apiFetch`
 * from `useApiFetch` (and a test supplies a double) — the same shape `lib/upgrade/api.js` uses.
 */
async function portalGet(fetchImpl, token, path, {
  invalidOn = INVALID_TOKEN_STATUSES,
  failure = PORTAL_ERROR.loadFailed,
} = {}) {
  let response;
  try {
    // `on401: 'ignore'`: an invalid portal link answers 401, which is a domain answer here and
    // must not reach the tenant logout wiring. `token` puts the portal token in the
    // Authorization header — never in the URL.
    response = await fetchImpl(`${PORTAL_API_PREFIX}${path}`, { token, on401: 'ignore' });
  } catch (cause) {
    // The request never completed (offline, DNS, aborted). That is transient and retryable,
    // and saying "your link is invalid" for it would be a lie the BP cannot act on.
    throw portalError(failure, { cause });
  }
  if (invalidOn.includes(response.status)) {
    throw portalError(PORTAL_ERROR.invalidLink, { status: response.status });
  }
  if (!response.ok) throw portalError(failure, { status: response.status });
  return response;
}

/**
 * Validates the token and returns who the link belongs to.
 *
 * Both names are optional in the rendered page: the portal must stay usable when the backend
 * has nothing friendly to show, so a missing name degrades to no greeting rather than to an
 * error state.
 *
 * @returns {Promise<{ businessPartnerName: string|null, tenantName: string|null }>}
 */
export async function fetchPortalIdentity(fetchImpl, token) {
  const response = await portalGet(fetchImpl, token, '/me');
  const data = await response.json().catch(() => ({}));
  return {
    businessPartnerName: readableText(data?.businessPartnerName),
    tenantName: readableText(data?.tenantName),
  };
}

/**
 * The BP's completed invoices plus their outstanding balance.
 *
 * The list is whatever the backend sends, in the order it sends it: it filters by
 * `ad_client_id` + `c_bpartner_id` + `docstatus = 'CO'` from the token row alone, so the
 * browser has no scoping decision to make and must not invent one.
 *
 * @returns {Promise<{ currency: string|null, outstandingAmount: number|null,
 *   invoices: Array<ReturnType<typeof normalizePortalInvoice>> }>}
 */
export async function fetchPortalInvoices(fetchImpl, token) {
  const response = await portalGet(fetchImpl, token, '/invoices');
  const data = await response.json().catch(() => ({}));
  const rows = Array.isArray(data?.invoices) ? data.invoices : [];
  return {
    currency: readableText(data?.currency),
    outstandingAmount: readableAmount(data?.outstandingAmount),
    invoices: rows.map((row) => normalizePortalInvoice(row, readableText(data?.currency))),
  };
}

/**
 * One invoice row, with every field coerced to the type the UI renders.
 *
 * `currency` falls back to the payload's instance-wide code so a per-row omission still
 * formats as money instead of as a bare number.
 */
export function normalizePortalInvoice(row, fallbackCurrency = null) {
  return {
    id: readableText(row?.id),
    documentNo: readableText(row?.documentNo),
    invoiceDate: readableText(row?.invoiceDate),
    dueDate: readableText(row?.dueDate),
    grandTotalAmount: readableAmount(row?.grandTotalAmount),
    outstandingAmount: readableAmount(row?.outstandingAmount),
    currency: readableText(row?.currency) || fallbackCurrency,
  };
}

/**
 * The invoice's PDF as a `Blob`, streamed by the same pipeline the back office prints from.
 *
 * A 404 is NOT treated as a dead link here — see {@link INVALID_TOKEN_STATUSES_PDF}. It means
 * this one document could not be produced, which is a per-row failure the rest of the page
 * survives.
 */
export async function fetchInvoicePdfBlob(fetchImpl, token, invoiceId) {
  const response = await portalGet(
    fetchImpl,
    token,
    `/invoices/${encodeURIComponent(invoiceId)}/pdf`,
    { invalidOn: INVALID_TOKEN_STATUSES_PDF, failure: PORTAL_ERROR.downloadFailed },
  );
  return response.blob();
}
