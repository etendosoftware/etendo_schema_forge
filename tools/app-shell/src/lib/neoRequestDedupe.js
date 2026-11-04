/**
 * ETP-4952 — one network read per resource per page load.
 *
 * Opening a document issued the same three reads several times over: `GET .../sws/neo/session`
 * 2–5 times, the record's `GET .../<spec>/header/<id>` twice and its marked attachment
 * `GET .../attachments/<table>/<id>/main` twice. Every caller wanted the same bytes for the same
 * request; nobody shared them. The burst queued against itself at the backend (the issue measured a
 * 3.9 s tail on a single user's page load) and the same reads kept arriving on each navigation.
 *
 * The readers are independent components and plain modules (`pdfUtils.js`, `listAttachments.js`,
 * `related-documents/helpers.js`) with no access to the React-side shared cache
 * (`@etendosoftware/app-shell-core/data`) and, in two cases, no agreement on the shape they expect
 * from the very same URL: `useEntity` caches a NORMALIZED row while `useTaxSifLineRowActions` reads
 * the raw `response.data[0]` envelope. A shared cache entry would have to pick one shape and break
 * the other. So the sharing happens one layer lower, on the response bytes: a caller gets its own
 * `Response` built from the shared body and parses it exactly as before.
 *
 * This module decorates `globalThis.fetch` with a deliberately tiny allowlist — everything else is
 * forwarded untouched, as the same call with the same `init`:
 *
 *   1. `GET <base>/sws/neo/session` — PAGE MEMO. The payload (currency, standard precision,
 *      account identity, org tax id) is constant for a page load; that is what the core's
 *      `CurrencyProvider` already assumes when it fetches once per session identity. Only an `ok`
 *      response is memoized. The memo is dropped when the session changes: any non-GET to
 *      `.../sws/go/session` or `.../sws/neo/session` (login, logout, entering an environment,
 *      switching role/org). `brandingUpdated` is the exception to "constant": it moves when the
 *      company branding is written (ETP-5541 compares cached PDFs against it), so the memo is
 *      ALSO dropped by every non-GET to a branding-writing endpoint (see `BRANDING_WRITE`).
 *      A generation counter, bumped on dispatch AND on settle of every such request, makes sure a
 *      read that was already in flight cannot repopulate the memo with pre-change data, and that
 *      callers arriving after the change never join it.
 *      Limit, by construction: a change made by ANOTHER tab, user or channel (MCP, backoffice) is
 *      invisible to this page, so `brandingUpdated` can lag it until the page reloads.
 *
 *   2. `GET <base>/sws/neo/<spec>/header/<id>` and
 *      `GET <base>/sws/neo/attachments/<table>/<id>[/main|/count]` — IN-FLIGHT COALESCING ONLY.
 *      While such a read is outstanding every caller joins it; once it settles the next read goes
 *      to the network. A write (any non-GET/HEAD/OPTIONS under `/sws/neo/`) ends the sharing: reads
 *      started before it are never joined by reads issued after it, so the post-save refetch of
 *      `useEntity` cannot be handed the pre-save bytes. No memo: these records change (a save, an upload marks a new main
 *      attachment), so serving a stored copy would show the user stale data, which is exactly what
 *      `useEntity`'s own `force` refetches exist to avoid.
 *
 * Aborts: a caller's `AbortSignal` is NEVER handed to the shared request — one caller unmounting
 * (the aborted attachment read the issue reported) must not cancel the read the others are waiting
 * for. Each caller's signal instead rejects only that caller. The shared request carries its own
 * timeout so a hung socket can never keep an in-flight entry alive forever. That timeout is
 * {@link SHARED_READ_TIMEOUT_MS} for EVERY coalesced read: a caller that passes `timeout: 0`
 * ("long read, no cap") to `apiFetch` still has its coalesced header/attachment/session read cut
 * at that limit. None of the three listed reads is a long one, so this is accepted.
 *
 * Requests are keyed by method + full URL + `Authorization` + `Accept-Language` (the backend
 * resolves translated reference data from it), so two different sessions, users or UI locales
 * never share a response.
 */

/** Kind returned by {@link dedupePolicyFor}: the response is memoized for the page load. */
export const PAGE_MEMO = 'page-memo';
/** Kind returned by {@link dedupePolicyFor}: only concurrent callers share one response. */
export const IN_FLIGHT = 'in-flight';

/** Marker on the installed wrapper, so a second install is a no-op. */
const INSTALLED = Symbol.for('etendo.schemaForge.neoRequestDedupe');

/** The page-load-stable NEO session read. Path only, query stripped. Not anchored to the start:
 * deployments serve the API under a context path (`/etendo/sws/neo/session`). */
const SESSION_READ = /\/sws\/neo\/session$/;
/**
 * The per-record reads that were measured duplicated. Anchored to the END of the path so
 * `/<spec>/header/<id>/action/listInvoices` (a different resource) and the paginated
 * `<spec>/header` list query are never coalesced with them.
 */
const RECORD_READS = [
  /\/sws\/neo\/[^/]+\/header\/[^/]+$/,
  /\/sws\/neo\/attachments\/[^/]+\/[^/]+(?:\/(?:main|count))?$/,
];
/** A request that can change the session (login, logout, entering an environment, role/org). */
const SESSION_MUTATION = /\/sws\/(?:go|neo)\/session(?:\/|$)/;
/**
 * The endpoints that write the rows `brandingUpdated` is computed from (organization name,
 * `AD_OrgInfo` tax id / logo reference, the address `C_Location`, the logo `AD_Image` —
 * `NeoSessionService.resolveBrandingUpdated`). In this SPA they are written by the Organization
 * screen: `PATCH .../organization/<id>` and `.../information/<id>` (spec `organization`),
 * `POST .../image` (logo upload), the organization's printable design (`.../doctemplateconfig`,
 * Settings → Printable documents), and the plain `C_Location` CRUD behind the address modal
 * (`.../<spec>/location[Address]`, reached through the warehouse spec). Matching is deliberately
 * a little wider than that (the whole `organization` spec) — dropping a memo too often costs one
 * request; too rarely shows a stale logo on a printed document.
 */
const BRANDING_WRITE = [
  /\/sws\/neo\/organization(?:\/|$)/,
  /\/sws\/neo\/image(?:\/|$)/,
  /\/sws\/neo\/[^/]+\/location(?:Address)?(?:\/|$)/,
  // ETP-5988 — the saved printable design counts toward `brandingUpdated` too (NeoSessionService).
  /\/sws\/neo\/doctemplateconfig(?:\/|$)/,
];
/** Any NEO request (the namespace every record write goes through). */
const NEO_PATH = /\/sws\/neo\//;

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
/** Mirrors the core apiFetch's own default timeout; only exists so a hung socket cannot pin an entry. */
const SHARED_READ_TIMEOUT_MS = 30_000;
/** Statuses a Response may not carry a body for. */
const BODYLESS_STATUSES = new Set([101, 204, 205, 304]);

/** @type {{ sessionMemo: Map<string, object>, inFlight: Map<string, Promise<object>> } | null} */
let state = null;

/**
 * The dedupe policy for a request, or null when it must be forwarded untouched.
 *
 * @param {string} url full or relative request URL
 * @param {string} [method]
 * @returns {string|null} {@link PAGE_MEMO}, {@link IN_FLIGHT} or null
 */
export function dedupePolicyFor(url, method = 'GET') {
  const path = pathOf(url);
  if (!path || !READ_METHODS.has(String(method || 'GET').toUpperCase())) return null;
  if (SESSION_READ.test(path)) return PAGE_MEMO;
  if (RECORD_READS.some((re) => re.test(path))) return IN_FLIGHT;
  return null;
}

/**
 * True when this request can change the session and therefore invalidates the memo.
 *
 * @param {string} url
 * @param {string} [method]
 * @returns {boolean}
 */
export function isSessionMutationRequest(url, method = 'GET') {
  const path = pathOf(url);
  if (!path) return false;
  return SESSION_MUTATION.test(path) && !READ_METHODS.has(String(method || 'GET').toUpperCase());
}

/**
 * True when this request can change the company branding and therefore the session payload's
 * `brandingUpdated`.
 *
 * @param {string} url
 * @param {string} [method]
 * @returns {boolean}
 */
export function isBrandingMutationRequest(url, method = 'GET') {
  const path = pathOf(url);
  if (!path || READ_METHODS.has(String(method || 'GET').toUpperCase())) return false;
  return BRANDING_WRITE.some((re) => re.test(path));
}

/**
 * True for any write under `/sws/neo/`: after it, an in-flight read of a record may predate it, so
 * later callers must not join that read.
 *
 * @param {string} url
 * @param {string} [method]
 * @returns {boolean}
 */
export function isNeoWriteRequest(url, method = 'GET') {
  const path = pathOf(url);
  return Boolean(path) && NEO_PATH.test(path) && !READ_METHODS.has(String(method || 'GET').toUpperCase());
}

/** The pathname of a URL (path only), or null when it cannot be parsed. */
function pathOf(url) {
  if (typeof url !== 'string' || !url) return null;
  try {
    return new URL(url, 'http://localhost').pathname;
  } catch {
    return null;
  }
}

/** An AbortError the way the platform reports one. */
function abortError() {
  if (typeof DOMException === 'function') return new DOMException('The operation was aborted.', 'AbortError');
  const err = new Error('The operation was aborted.');
  err.name = 'AbortError';
  return err;
}

/** Reads one header out of a Headers instance or a plain object (case-insensitive). */
function headerOf(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) || '';
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === name) return String(value);
  }
  return '';
}

/**
 * Normalizes the two shapes `fetch` accepts into what the policy needs, or null when the request
 * cannot be inspected (an exotic input) and must therefore be forwarded untouched.
 */
function normalize(input, init) {
  if (typeof input === 'string') {
    return { method: (init?.method || 'GET').toUpperCase(), url: input, signal: init?.signal };
  }
  if (input && typeof input === 'object' && typeof input.url === 'string') {
    return {
      method: (init?.method || input.method || 'GET').toUpperCase(),
      url: input.url,
      signal: init?.signal || input.signal,
    };
  }
  return null;
}

/** Rejects only this caller when its own signal aborts; the shared request keeps running. */
function raceCallerAbort(shared, signal) {
  if (!signal) return shared;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    shared.then(
      (value) => { signal.removeEventListener('abort', onAbort); resolve(value); },
      (error) => { signal.removeEventListener('abort', onAbort); reject(error); },
    );
  });
}

/** A Response the given caller owns, built from the shared bytes so each may read its own body. */
function materialize(entry) {
  const body = BODYLESS_STATUSES.has(entry.status) ? null : entry.buffer.slice(0);
  return new Response(body, {
    status: entry.status,
    statusText: entry.statusText,
    headers: new Headers(entry.headers),
  });
}

/**
 * Installs the decorator on `target.fetch`, once. Idempotent.
 *
 * @param {{ fetch: Function }} [target] defaults to `globalThis`
 * @returns {Function} the installed fetch (the existing one when already installed)
 */
export function installNeoRequestDedupe(target = globalThis) {
  const realFetch = target?.fetch;
  if (typeof realFetch !== 'function' || realFetch[INSTALLED]) return realFetch;

  const sessionMemo = new Map();
  const inFlight = new Map();
  state = { sessionMemo, inFlight };

  // Generation counters. A shared read is keyed by the generations it started under, and only
  // writes the memo while its session generation is still current, so nothing that began before a
  // change can be joined or stored after it.
  let writeGen = 0;
  let sessionGen = 0;

  /** Drops every memoized session payload: the session about to change, or just changed. */
  const bumpSession = () => {
    sessionGen += 1;
    sessionMemo.clear();
  };
  const bumpWrite = () => {
    writeGen += 1;
  };

  async function readOnce(input, init) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SHARED_READ_TIMEOUT_MS);
    try {
      const res = await realFetch.call(target, input, { ...init, signal: controller.signal });
      const buffer = await res.arrayBuffer();
      return {
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        headers: [...res.headers],
        buffer,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  const dedupedFetch = function neoRequestDedupeFetch(input, init) {
    const request = normalize(input, init);
    if (!request) return realFetch.call(target, input, init);

    const sessionChange = isSessionMutationRequest(request.url, request.method)
      || isBrandingMutationRequest(request.url, request.method);
    const neoWrite = isNeoWriteRequest(request.url, request.method);
    if (sessionChange || neoWrite) {
      // Both on dispatch and on settle: a read started while the write was in flight may have been
      // answered from either side of it, so nothing started before the settle may be reused.
      const settle = () => {
        bumpWrite();
        if (sessionChange) bumpSession();
      };
      bumpWrite();
      if (sessionChange) bumpSession();
      return realFetch.call(target, input, init).finally(settle);
    }

    const kind = dedupePolicyFor(request.url, request.method);
    if (!kind) return realFetch.call(target, input, init);

    const headers = init?.headers ?? input?.headers;
    const key = [
      request.method,
      request.url,
      headerOf(headers, 'authorization'),
      headerOf(headers, 'accept-language'),
      // The session payload does not depend on record writes; only a session change moves it.
      kind === PAGE_MEMO ? `s${sessionGen}` : `w${writeGen}`,
    ].join(' ');
    if (kind === PAGE_MEMO) {
      const hit = sessionMemo.get(key);
      if (hit) return Promise.resolve(materialize(hit));
    }

    let shared = inFlight.get(key);
    if (!shared) {
      const startedAt = sessionGen;
      shared = readOnce(input, init).then(
        (entry) => {
          if (inFlight.get(key) === shared) inFlight.delete(key);
          if (kind === PAGE_MEMO && entry.ok && startedAt === sessionGen) sessionMemo.set(key, entry);
          return entry;
        },
        (error) => {
          if (inFlight.get(key) === shared) inFlight.delete(key);
          throw error;
        },
      );
      inFlight.set(key, shared);
    }
    return raceCallerAbort(shared, request.signal).then(materialize);
  };

  Object.defineProperty(dedupedFetch, INSTALLED, { value: true });
  target.fetch = dedupedFetch;
  return dedupedFetch;
}

/** Clears every memo and in-flight entry. For hosts that must drop the cache, and for tests. */
export function resetNeoRequestDedupe() {
  state?.sessionMemo.clear();
  state?.inFlight.clear();
}
