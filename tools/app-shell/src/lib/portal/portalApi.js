import { detectBaseUrl } from '@etendosoftware/app-shell-core/auth/api';

/**
 * Read-only client for the Business Partner self-service portal (ETP-5267).
 *
 * The portal is the one surface in the app whose caller is NOT a tenant user: a Business
 * Partner opens a magic link and reads their own invoices, with no account and no session.
 * Three consequences shape this module.
 *
 * **1. The token is the whole credential, and it travels in its own header.** It arrives once,
 * as a path segment of `/portal/<token>` (that is what makes the link mailable and
 * bookmarkable), and every request made afterwards sends it as {@link PORTAL_TOKEN_HEADER}. It
 * must NEVER be appended to a query string — that is the one place it would be recorded in
 * access logs and proxy logs (plan §5.4).
 *
 * Not as `Authorization`, and that is load-bearing (ETP-6209 live test). `Authorization` belongs
 * to the app's session credential scheme: in a browser that holds an Etendo GO session the
 * scheme is `cookie`, and the shared helper then drops an explicit `token` without a word
 * (`credentialHeadersForToken` in app-shell-core) — the portal received no token and showed
 * "this link is no longer valid" for a valid link. The portal token is not a session
 * credential, so it rides a header the scheme never touches, and the servlet reads that header
 * first, so a GO session's own credential can never be what opens the portal. The `token`
 * option is still passed: under `bearer` it keeps the visitor's GO JWT, if any, off these
 * requests.
 *
 * **2. A 401 here is a domain answer, not an expired session**, so every call sets
 * `on401: 'ignore'`. Without it the shared helper would route the BP's invalid link into the
 * tenant logout choke point — clearing state for a session that never existed. See
 * `docs/request-policy.md`.
 *
 * **3. Unknown, pending and deactivated links are deliberately indistinguishable.** The backend
 * answers the same 401 to all of them (plan §5.2), and this module keeps that property by
 * collapsing 401/403/404 into one {@link PORTAL_ERROR.invalidLink} code. Nothing in the UI may
 * branch on which it was — that branch is the enumeration oracle the design removes.
 *
 * **4. A link expires 48 hours after its email (ETP-6209).** `/me` then answers a `state`
 * ({@link PORTAL_LINK_STATE}) instead of a 401, and only for a link that was really sent: an
 * expired link is renewed with {@link renewPortalLink}, which emails a new one to the original
 * recipients. The "unavailable" state never says why (customer blocked, inactive, or the
 * issuing company's plan expired).
 *
 * Endpoints live under `/sws/portal/*`, never `/sws/neo/*`: the portal is a separate bounded
 * context and must not be reachable through the generic CRUD engine every window shares.
 * This is also why the route's own `apiBaseUrl` (which already ends in `/sws/neo`) is NOT
 * usable here — see {@link resolvePortalBaseUrl}.
 */

/**
 * Header carrying the portal token. Read first by `PortalServlet#resolveToken` in
 * `com.etendoerp.go`; keep the two spellings identical.
 */
export const PORTAL_TOKEN_HEADER = 'X-Portal-Token';

/** Path prefix of the portal's own servlet — deliberately NOT under `/sws/neo`. */
const PORTAL_API_PREFIX = '/sws/portal';

/**
 * Rows per page.
 *
 * Matches the backend's own default so the first render and a later "load more" agree on page
 * boundaries; the backend clamps anything larger, so this is a preference, never a guarantee.
 */
export const PORTAL_PAGE_SIZE = 50;

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
 * What `/me` and `/renew` say about a link that was really emailed (ETP-6209). Anything else is
 * {@link PORTAL_ERROR.invalidLink}.
 */
export const PORTAL_LINK_STATE = Object.freeze({
  valid: 'valid',
  expired: 'expired',
  unavailable: 'unavailable',
  renewed: 'renewed',
});

/** What `/renew` did, when it answered {@link PORTAL_LINK_STATE.renewed}. */
export const PORTAL_RENEWAL = Object.freeze({
  sent: 'sent',
  recentlySent: 'recentlySent',
});

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
  method,
} = {}) {
  let response;
  try {
    // `on401: 'ignore'`: an invalid portal link answers 401, which is a domain answer here and
    // must not reach the tenant logout wiring. The portal token travels in its own header,
    // whatever the session credential scheme is — never in the URL.
    response = await fetchImpl(`${PORTAL_API_PREFIX}${path}`, {
      token,
      headers: { [PORTAL_TOKEN_HEADER]: token },
      on401: 'ignore',
      ...(method ? { method } : {}),
    });
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
 * Validates the token and returns its state and who the link belongs to.
 *
 * Both names are optional in the rendered page: the portal must stay usable when the backend
 * has nothing friendly to show, so a missing name degrades to no greeting rather than to an
 * error state. `state` defaults to `valid`: a backend that predates ETP-6209 answered 200 only
 * for a valid link.
 *
 * @returns {Promise<{ state: string, businessPartnerName: string|null, tenantName: string|null,
 *   hasLogo: boolean, entryDocument: { kind: string, id: string }|null,
 *   entryKind: string|null }>}
 *
 * `entryKind` is set only when the link's own document is no longer visible (`entryDocument`
 * null on a valid link): the kind of list to open instead, with a notice (plan §A.8.8).
 */
export async function fetchPortalIdentity(fetchImpl, token) {
  const response = await portalGet(fetchImpl, token, '/me');
  const data = await response.json().catch(() => ({}));
  const entryKind = readableText(data?.entryDocument?.kind);
  const entryId = readableText(data?.entryDocument?.id);
  return {
    state: readLinkState(data?.state),
    entryDocument: entryKind && entryId ? { kind: entryKind, id: entryId } : null,
    entryKind: entryKind && entryId ? null : readableText(data?.entryKind),
    businessPartnerName: readableText(data?.businessPartnerName),
    tenantName: readableText(data?.tenantName),
    // The backend says whether there is a logo, so the page never requests one that does not
    // exist and never has to hide a broken image. Defaults to false: a backend that predates
    // this field shows no logo rather than a placeholder.
    hasLogo: data?.hasLogo === true,
  };
}

/**
 * Asks for a new link to replace an expired one (ETP-6209).
 *
 * The backend emails it to the recipients of the original email — never to whoever is looking
 * at this page — so nothing about the new link comes back here: only whether one went out.
 * A 5xx means the email could not be sent and is worth retrying ({@link PORTAL_ERROR.loadFailed}).
 *
 * @returns {Promise<{ state: string, renewal: string|null }>}
 */
export async function renewPortalLink(fetchImpl, token) {
  const response = await portalGet(fetchImpl, token, '/renew', {
    method: 'POST',
    invalidOn: INVALID_TOKEN_STATUSES_PDF,
  });
  const data = await response.json().catch(() => ({}));
  const renewal = readableText(data?.renewal);
  return {
    state: readLinkState(data?.state),
    renewal: renewal === PORTAL_RENEWAL.recentlySent ? PORTAL_RENEWAL.recentlySent
      : (renewal === PORTAL_RENEWAL.sent ? PORTAL_RENEWAL.sent : null),
  };
}

/** A known {@link PORTAL_LINK_STATE} value, `valid` for anything else. */
function readLinkState(value) {
  return Object.values(PORTAL_LINK_STATE).includes(value) ? value : PORTAL_LINK_STATE.valid;
}

/**
 * The tenant's logo as a `Blob`, or `null` when there is none.
 *
 * Fetched as a blob and turned into an object URL by the caller, rather than pointed at from an
 * `<img src>` directly. That is not indirection for its own sake: a browser issues an `<img>`
 * request itself, with no opportunity to attach the token header, so a direct `src`
 * would force the token into the query string — where it lands in every access log along the way
 * and breaks §5.4. Going through `apiFetch` keeps the token in the header, exactly like every
 * other portal request.
 *
 * A missing logo (404) resolves to `null` rather than throwing: branding is decoration, and a
 * tenant without a logo must not degrade the page.
 */
export async function fetchPortalLogoBlob(fetchImpl, token) {
  try {
    const response = await portalGet(fetchImpl, token, '/logo', {
      invalidOn: INVALID_TOKEN_STATUSES_PDF,
      failure: PORTAL_ERROR.downloadFailed,
    });
    return await response.blob();
  } catch {
    return null;
  }
}

// ─── Part B (ETP-6209): home, per-kind lists, document detail and printable ──────────────────

/** The four document kinds the portal shows; the API speaks them in lower case. */
export const PORTAL_DOCUMENT_KINDS = Object.freeze(['QUOTATION', 'ORDER', 'SHIPMENT', 'INVOICE']);

/**
 * The home's aggregates: pending balance per currency, one tile per kind, recent documents.
 * Every figure is computed server-side over the whole history, never summed here.
 */
export async function fetchPortalHome(fetchImpl, token) {
  const response = await portalGet(fetchImpl, token, '/home');
  const data = await response.json().catch(() => ({}));
  return {
    balances: Array.isArray(data?.balances) ? data.balances.map((b) => ({
      currency: readableText(b?.currency),
      outstanding: readableAmount(b?.outstanding),
      pendingCount: Number.isFinite(b?.pendingCount) ? b.pendingCount : 0,
      overdue: readableAmount(b?.overdue),
      overdueCount: Number.isFinite(b?.overdueCount) ? b.overdueCount : 0,
      overdueSince: readableText(b?.overdueSince),
    })) : [],
    tiles: data?.tiles && typeof data.tiles === 'object' ? data.tiles : {},
    recent: Array.isArray(data?.recent) ? data.recent.map(normalizePortalDocument) : [],
  };
}

/**
 * One page of one kind. Filters go in the query string; the token never does (it rides the
 * header). Dates are calendar days (`yyyy-MM-dd`), inclusive on both ends.
 */
export async function fetchPortalDocuments(fetchImpl, token, {
  kind, statuses = [], dateFrom = null, dateTo = null, search = '', offset = 0,
  limit = PORTAL_PAGE_SIZE,
} = {}) {
  const params = new URLSearchParams();
  params.set('type', String(kind || '').toLowerCase());
  if (statuses.length) params.set('status', statuses.join(','));
  if (dateFrom) params.set('dateFrom', dateFrom);
  if (dateTo) params.set('dateTo', dateTo);
  if (search && search.trim()) params.set('q', search.trim());
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  const response = await portalGet(fetchImpl, token, `/documents?${params.toString()}`, {
    invalidOn: INVALID_TOKEN_STATUSES_PDF,
  });
  const data = await response.json().catch(() => ({}));
  const documents = Array.isArray(data?.documents) ? data.documents.map(normalizePortalDocument) : [];
  return {
    documents,
    totalCount: Number.isFinite(data?.totalCount) ? data.totalCount : documents.length,
    offset: Number.isFinite(data?.offset) ? data.offset : offset,
    statuses: Array.isArray(data?.statuses) ? data.statuses : [],
    totals: Array.isArray(data?.totals) ? data.totals.map((t) => ({
      currency: readableText(t?.currency),
      count: Number.isFinite(t?.count) ? t.count : 0,
      taxBase: readableAmount(t?.taxBase),
      grandTotal: readableAmount(t?.grandTotal),
    })) : [],
  };
}

/**
 * One document's read-only detail. A 404 means this one document is not available (hidden,
 * another customer's, or never existed) — not that the link died.
 */
export async function fetchPortalDocument(fetchImpl, token, kind, id) {
  const response = await portalGet(
    fetchImpl,
    token,
    `/documents/${encodeURIComponent(String(kind).toLowerCase())}/${encodeURIComponent(id)}`,
    { invalidOn: INVALID_TOKEN_STATUSES_PDF },
  );
  const data = await response.json().catch(() => ({}));
  return {
    ...normalizePortalDocument(data),
    description: readableText(data?.description),
    paymentMethod: readableText(data?.paymentMethod),
    paymentTerms: readableText(data?.paymentTerms),
    scheduledDeliveryDate: readableText(data?.scheduledDeliveryDate),
    issuer: readableText(data?.issuer),
    customer: {
      name: readableText(data?.customer?.name),
      address: readableText(data?.customer?.address),
    },
    lines: Array.isArray(data?.lines) ? data.lines.map((line) => ({
      product: readableText(line?.product),
      productCode: readableText(line?.productCode),
      description: readableText(line?.description),
      uom: readableText(line?.uom),
      quantity: readableAmount(line?.quantity),
      unitPrice: readableAmount(line?.unitPrice),
      discount: readableAmount(line?.discount),
      tax: readableText(line?.tax),
      amount: readableAmount(line?.amount),
    })) : [],
    taxes: Array.isArray(data?.taxes) ? data.taxes.map((tax) => ({
      tax: readableText(tax?.tax),
      taxableAmount: readableAmount(tax?.taxableAmount),
      taxAmount: readableAmount(tax?.taxAmount),
    })) : [],
    installments: Array.isArray(data?.installments) ? data.installments.map((inst) => ({
      dueDate: readableText(inst?.dueDate),
      amount: readableAmount(inst?.amount),
      paidAmount: readableAmount(inst?.paidAmount),
      outstandingAmount: readableAmount(inst?.outstandingAmount),
    })) : [],
    related: Array.isArray(data?.related) ? data.related.map(normalizePortalDocument) : [],
    hasPdf: data?.hasPdf === true,
  };
}

/**
 * The document's printable as a `Blob` — the same file the email's download link serves.
 * A 404 is one missing printable, not a dead link.
 */
export async function fetchPortalDocumentPdf(fetchImpl, token, kind, id) {
  const response = await portalGet(
    fetchImpl,
    token,
    `/documents/${encodeURIComponent(String(kind).toLowerCase())}/${encodeURIComponent(id)}/pdf`,
    { invalidOn: INVALID_TOKEN_STATUSES_PDF, failure: PORTAL_ERROR.downloadFailed },
  );
  return response.blob();
}

/** One document summary, every field coerced to the type the UI renders. */
export function normalizePortalDocument(row) {
  return {
    kind: readableText(row?.kind),
    id: readableText(row?.id),
    documentNo: readableText(row?.documentNo),
    isCreditNote: row?.isCreditNote === true,
    reference: readableText(row?.reference),
    date: readableText(row?.date),
    validUntil: readableText(row?.validUntil),
    documentStatus: readableText(row?.documentStatus),
    currency: readableText(row?.currency),
    taxBase: readableAmount(row?.taxBase),
    grandTotal: readableAmount(row?.grandTotal),
    outstandingAmount: readableAmount(row?.outstandingAmount),
    dueDate: readableText(row?.dueDate),
    overdue: row?.overdue === true,
  };
}

