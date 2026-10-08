# Request policy — one way to call the backend

Every authenticated HTTP request from the app shell goes through **one** helper. This page
is the reference for how to make a request, and for why the alternatives are gone.

Established by ETP-5022, which migrated **293 raw `fetch` calls across 121 files**. Two
repo-root tests fail the build if a call site drifts back.

## Why

The bug that started it: País / UOM / UOM for Weight selectors returned English while the
UI was in Spanish. The backend was already correct — `NeoAuthenticator.applyRequestLanguage`
reads `Accept-Language` and sets the request's `OBContext` language, so the DAL resolves
`*_Trl` names in the UI locale. The header simply was not being sent.

The failure mode is what makes this worth a policy: a missing `Accept-Language` is a
**silent** no-op. No error, no warning — just reference data in the wrong language. ETP-4685
fixed one field by hand; the same defect resurfaced in three more fields, because every raw
`fetch` was a blank slate that re-decided the headers.

A raw `fetch` also re-decided four other things, each an independent chance to get it wrong:

| Concern | Raw `fetch` | `apiFetch` |
|---|---|---|
| `Authorization` + `Accept-Language` | per call site | always, from the canonical builders |
| `Content-Type` | often set on bodyless GETs, which is wrong | only when there is a body |
| Base URL | re-assembled at every call site | the `baseUrl` argument |
| `credentials: 'include'` | easy to omit | always set (overridable) |
| `FormData` boundary | manual `delete headers['Content-Type']` | automatic |
| 401 / expired session | nothing, or a bespoke handler per site | routed to the logout choke point |
| 402 / environment blocked | read only by `windowaccessmap` | recorded in the environment-access gate from any response |

## How to make a request

### In a component or a hook

```js
import { useApiFetch } from '@/auth/useApiFetch.js';

const apiFetch = useApiFetch(apiBaseUrl);          // top level of the component/hook
const res = await apiFetch(`/price?parentId=${id}`);            // GET
const res = await apiFetch('/price', { method: 'POST', body: JSON.stringify(payload) });
```

`apiFetch` belongs in the dependency array of any `useCallback` / `useEffect` that calls it;
it is memoized on the base URL and the token.

### In a plain module (no React body to call a hook from)

```js
import { apiFetch } from '@etendosoftware/app-shell-core/auth/api';

const res = await apiFetch(`${base}/spec/entity?${params}`, { baseUrl: '', token });
```

Import from the **core subpath**, never from the `@/auth/api.js` barrel: the barrel
re-exports `.jsx` modules, which the plain `node --test` suite cannot load, and a single such
import makes the whole module unloadable there.

The ambient `apiFetch` reads the session that `AuthProvider` registers at startup, so a
module needs no `token` argument. Pass one anyway when the caller hands the module a specific
token — the module then keeps working with no session registered at all, which is what its
own tests rely on.

### Options

Everything not listed here is forwarded to `fetch` untouched (`method`, `body`, `signal`, …).

| Option | Use it when |
|---|---|
| `on401: 'ignore'` | the endpoint's 401 is a domain answer, not an expired session — `lib/upgrade/api.js` maps it to its own `sessionExpired` code; a probe reads it as "feature unavailable". **"This file did not log out before the migration" is NOT a reason**: that was the defect, and applying it as a rule would opt every call site out of the fix. Today only five places use it: `InviteAcceptancePage` (pre-login, the 401 body carries the domain code), `ImportLinesModal` (a per-line loop that must not abort on one failure), `App.jsx`'s window-access map (fail-closed during hydration, where a logout would loop), `useDashboardData` (a failed widget degrades to `null`), and `lib/portal/portalApi.js` (the caller is a Business Partner with no session at all — a 401 means "this link is not valid", and routing it to the tenant logout would clear state for a session that never existed) |
| `baseUrl: ''` | the URL is already complete, or points outside the base (`buildCreateUrl` returns a sibling path from the app root) |
| `token` | a plain module was handed a specific token by its caller |
| `credentials` | overrides the default `'include'` |
| `refreshVersion: false` | the call is a POST to an action endpoint (`/{spec}/{entity}/{id}/action/<name>`) that is a query in disguise — verified to NOT mutate the record it addresses. Skips the post-action re-read described below. Default `true`. See [Action endpoints re-read the record afterward](#action-endpoints-re-read-the-record-afterward-refreshversion-etp-5434) before setting this — the warning there is the important part |

| `timeout` | ms to wait for a response before rejecting with a `NetworkError` (`reason: 'timeout'`). **Default: 60 s for a safe method (`GET`, `HEAD`, `OPTIONS`, or no method) and none for any other method.** An explicit value applies to any method; `0` disables it. Pass `timeout: 0` for a **long read** — see [Network failures and the timeout](#network-failures-and-the-timeout-etp-5424) |

## Network failures and the timeout (ETP-5424)

A request that never got an HTTP answer does not reach the call site as the browser's
`TypeError('Failed to fetch')` anymore. `apiFetch` rejects with a `NetworkError`
(`@etendosoftware/app-shell-core/auth`) whose `message` is **already translated**
(`genericLabels.networkErrorRetry`), so any call site that shows `err.message` is correct
without a special case.

| Situation | What the call site receives |
|---|---|
| Offline, DNS, CORS, connection reset — `fetch` rejects with a `TypeError` | `NetworkError`, `reason: 'offline'`, original on `cause` |
| A body reader (`json`, `text`, `blob`, …) rejects with a `TypeError` | `NetworkError`, `reason: 'offline'` |
| No response within the timeout | `NetworkError`, `reason: 'timeout'` |
| The caller's own `signal` aborts | the caller's `AbortError`, unchanged — a cancellation is not a failure |
| A `SyntaxError` (bad JSON), a plain `Error` | unchanged |

Detect it with `isNetworkError(err)`, never by matching `'Failed to fetch'` or
`name === 'TypeError'`. A caller with more specific wording checks it first (the importer maps
it to `importErrorConnection` / `importErrorTimeout`).

**The translator** is registered once, by `installErrorTranslator` (`src/i18n/errorTranslator.js`)
in an effect in `App.jsx`, with the rendered locale's dictionary — see `docs/i18n-guide.md`.

**Why writes get no default timeout.** A read that is cut off can be retried safely. A write
that is cut off may still commit on the server, and the user's "try again" is then a double
submit — an order completed twice, a payment registered twice. So the 60 s default applies only
to `GET`/`HEAD`/`OPTIONS`; a `POST`/`PUT`/`PATCH`/`DELETE` waits for its answer unless the
caller passes a `timeout` explicitly. Some synchronous processes carry an explicit
`timeout: 0` anyway (useEntity save-and-process and `handleProcess`, `useBatch`, year close,
posting); it is redundant and documents intent.

**Rule: pass `timeout: 0` for a long read.** The timer covers only until the response headers
arrive, so what counts is how long the server takes to START answering. Opt out when the server
builds the whole payload before replying:

- a server-side export — `useCsvExport` (`export=csv|xlsx`, used by `ListExportButton` and the
  financial-account exports);
- a walk over thousands of rows — `ReportDrawer`'s `fetchAllRecords`;
- an archive built on demand — the attachments `/zip` download.

A plain list page, a single record, a selector or a file download (the bytes stream after the
headers) keep the default.

**A raw `fetch`** (the `/jsreport` container proxy) gets none of this: map a `TypeError` yourself
with `new NetworkError({ reason: 'offline', cause: err })` — see `renderViaJsreport` in
`ReportDrawer.jsx`.

## Updates carry a concurrency token (ETP-5073)

`apiFetch` attaches an `updated` value to every `PATCH`/`PUT` whose target record this client has
read. **You do not pass it, and you must not hand-roll it.**

### Why the helper does this and not the call site

The backend refuses an update that does not carry the `updated` value of the record as it was
read. That is not a new rule invented here — it is how Etendo's core has always implemented
optimistic concurrency (`JsonToDataConverter.setData` compares the value and raises
`OBStaleObjectException`). Our layer used to strip `updated` from every write, so the check never
ran for any entity: two users editing the same document both got a success and the second silently
erased the first.

Threading the token through the ~41 update call sites by hand would put the same failure one
forgotten argument away, and forgetting is invisible at the call site — it surfaces as a 400 in
whatever panel nobody was looking at. So the token is remembered centrally instead:

| Piece | Where | Does what |
|---|---|---|
| The store | `app-shell-core/lib/recordVersions.js` | `updated` per record id, LRU-bounded |
| Harvest (reads) | `useEntity.js` → `normalizeRecord` | the one place every record and list row is parsed |
| Harvest (writes) | `apiFetch` | remembers what a successful write returned |
| Injection | `apiFetch` → `withRecordVersion` | adds the token on the way out |

Keyed by **record id**, not URL: the same row is read through the list endpoint and written
through the detail endpoint, and inline grid editing depends on those resolving to one entry.

### What happens when the token is missing

Nothing is injected, the server answers **400 `missing_updated`**, and in dev a console warning
names the call site. That is the intended behaviour, not a gap: a caller that cannot produce
`updated` has not read the record it is about to overwrite. The fix is to read the record before
writing it — never to fabricate a timestamp, which cannot work (any value other than the stored
one is rejected as a conflict).

Two situations produce this, and only one is a defect:

- **a panel that patches a record it never read** — the defect; give it a read;
- **an endpoint that is not a NEO record** (an OAuth2 `PUT`, a fiscal-config `PUT`) — harmless.
  The guard is the cache miss itself: an id we never saw has no entry, so an unrelated write is
  never touched.

### What happens on a conflict

**409** with `error: "stale_record"`. Branch on that discriminator, **never on the status alone** —
a duplicate-key rejection is also a 409 and its remedy is the opposite (change your data, not your
baseline).

The same dialog is raised from all three write paths, so a conflict looks identical wherever the
user was typing:

| Path | Where it is wired | Refresh action |
|---|---|---|
| Header save | `useEntity.handleSaveErrorResponse` | `discardChangesAndReload` |
| Lines sidebar save | `useLineSaveConflict.raiseLineSaveConflict` | `discardLineChangesAndReload` |
| Inline lines grid (`linesLayout: 'inlineEditable'`) | `useLineSaveConflict.raiseRowSaveConflict` | `discardRowChangesAndReload` |

`components/contract-ui/useLineSaveConflict.js` holds both line paths (extracted from
`DetailView.jsx`, which is size-gated). Its `isStaleRecordResponse` reads a **clone** of the
response so the caller's own `extractErrorMessage` still has an unconsumed body — ask for the
conflict first, extract the message second.

The inline grid needs one extra step: `InlineLinesPanel` catches the save handler's throw and
toasts it, so a failure the handler had already reported surfaced **twice**. The handler therefore
throws `Object.assign(new Error(msg), { userNotified: true })` and the panel skips its own toast on
that marker. Any error raised from elsewhere still gets one.

`useEntity` handles the header already, with a non-dismissing notice and **exactly two choices**:

- **Cancel save** — nothing was written, so the form keeps the user's edits and they can save later
  against a fresh read.
- **Discard my changes and refresh** — re-reads the record as the system holds it and drops the
  pending edits. The label names the loss on purpose: a button that destroys work must not read as
  a harmless "reload".

**There is deliberately no merge option.** An earlier implementation re-applied the user's changed
keys over the freshly-read record, and it was wrong twice:

1. it silently overwrote the other person's value on any field **both** had edited — the exact data
   loss this ticket removes, moved one step later;
2. it injected values through `setEditing`, which does **not** run callouts. On a document whose
   fields are interdependent (changing the business partner recomputes price list, payment terms
   and taxes) the merged form displayed a combination no callout had ever derived. The server would
   recompute on save, so the database stayed consistent — but the user was shown numbers that did
   not add up, and asked to approve them.

Re-entering a value by hand goes through the normal edit path, so **its callouts fire in the new
context** — which no merge could guarantee. On a rare, integrity-critical path, that is worth more
than the convenience of not retyping.

### If you set `updated` yourself

An explicit value always wins over the remembered one. Reserve it for a caller that genuinely
holds a token from elsewhere; a copy of the record you just read is what the store already has.

### Action endpoints re-read the record afterward (`refreshVersion`, ETP-5434)

A process action (`docAction: 'CO'`, etc.) mutates the row server-side, so the `updated` token
this client holds for it is stale the moment the action succeeds — and the action's own response
carries the process result, not the record, so there is nothing to harvest from it. `apiFetch`
compensates: on a successful POST to `/{spec}/{entity}/{id}/action/<name>`, it fires a GET of
that same record and **awaits it before resolving**, so the version cache is correct again by the
time the caller's promise settles.

`refreshVersion: false` skips that GET. **Only set it on an action verified to leave the record's
`updated` unchanged** — i.e. an action endpoint that is really a query dressed up as a POST.
Today that is exactly three call sites behind one modal ("Añadir cobro"): `invoiceAccounts`,
`invoicePaymentMethods`, `invoiceCreditSources`.

**Setting it on an action that DOES mutate the record silently reintroduces ETP-5255.** Nothing
fails at the call site — the flag does not and cannot verify the assumption for you. The failure
surfaces later, on the *next* `PATCH`/`PUT` of that record: it is refused with 409
`stale_record`, shown to the user as "somebody else edited this record" when the editor was the
action they themselves just ran, and it is not recoverable by retrying — only by reloading.

The re-read is not free, which is the other half of the trade-off: measured in production, it
costs **0.7–1.9s per call**. `refreshVersion: false` is how a verified-non-mutating action avoids
paying that cost, not a shortcut to reach for when unsure.

Separately, concurrent re-reads for the same record are now deduplicated in the core regardless
of this flag: several actions firing against the same record at once share one GET instead of
each racing its own.

## 401 and logout

A 401 that is not ignored calls the logout handler and throws `Unauthorized`. In the app that
handler is `useLogout` — the clear-then-logout choke point — so an expired session clears the
persisted dashboard period filter exactly like the user menu does. `App.jsx` additionally
wires `AuthProvider`'s `onSessionChange` to clear session-scoped state whenever the session
loses its token, which covers the ambient (non-React) path too.

That is why the local `@/auth/useApiFetch.js` **wraps** the core hook instead of re-exporting
it: taking the core's own `useAuth().logout` would silently skip the clear.

## 402 and the blocked-access screen (ETP-5642)

When an environment's commercial access is cut (demo trial expired, subscription grace elapsed),
the backend answers **402** `Environment access is not available: <DECISION>` to every request
that touches it — NEO, Copilot, MCP and the account endpoints acting on the tenant. `apiFetch`
treats that answer like the 401: as a statement about the whole session, not about the request.
Its single response exit (`finish()` in the core's `auth/api.js`) reads a **clone** of every 402
and, when the decision is `DEMO_TRIAL_EXPIRED` or `SUBSCRIPTION_REQUIRED`, records it in the
environment-access gate (`@etendosoftware/app-shell-core/lib/environmentAccessGate.js`, re-exported
as `@/lib/environmentAccessGate.js`). `AppLayout` reads the gate and replaces the UI with the
blocked-access screen.

- The caller still gets its response, unread and unchanged — handle the 402 as before, or not at all.
- The transport only ever **sets** a block. A 200 from another endpoint proves nothing (the account
  API stays reachable while ERP access is blocked); only a successful `/sws/neo/windowaccessmap`
  clears it.
- A 402 that arrives after the session changed identity (an environment switch) is not recorded.
- Before this, the block was detected only from `windowaccessmap`. A tab already open when the
  trial expired showed empty lists and an empty dashboard indefinitely — the silent refresh stops
  at `/sws/neo/refreshtoken`'s 402 and never reaches `windowaccessmap`.

## 403 "Session belongs to another account" and the conflict screen (ETP-5675)

The session cookie belongs to the browser profile, not to a tab, and production is one domain for
every customer. When another tab signs in as a different account, a tab still showing the previous
one used to read the new account's tenant data under the old name and avatar. So every request
carries `X-Go-Account` — the `account.id` the tab restored from `GET /sws/go/session`, published by
`AuthProvider` through `sessionCredentials.js` exactly like the CSRF proof (cookie scheme only) —
and the backend refuses a mismatch with **403** `Session belongs to another account`.

- `apiFetch`'s single exit reads a clone of every 403 and, for that message, records the conflict in
  the core's `auth/sessionConflict.js`. `useAuth().sessionConflict` exposes it, and `AppLayout`
  replaces the page — before every other gate — with `SessionConflictScreen`: *continue as the other
  account* (a full reload, so nothing of the previous account stays cached) or *sign out of this
  browser and sign in again* (revokes the browser's live session — the other account's — with its
  own proof and account, only on an explicit click, then goes to the login).
- Two cheaper signals raise the same screen before any request goes out: the tab that signs in or
  out announces the account on a `BroadcastChannel` (`etendo-go-session`), and a tab returning to
  the foreground compares its account with the live session (at most every 30 s). A session that
  cannot be read (a deploy) is never a conflict. Another tab signing the browser **out** signs this
  one out locally, without a revoke.
- Same account, other company, is **not** a conflict: that is the ETP-5550 environment switch,
  handled by the CSRF recovery. Only `account.id` is compared.
- The caller still gets its 403. Never send `X-Go-Account` by hand: it comes from the header
  builders, like every other credential header.

The onboarding (`etendo-go-core`) does the same with its own binding (`bindOnboardingAccount`):
a lost or foreign session replaces the step with "Tu sesión se cerró" instead of failing at
provisioning with the backend's raw `Missing or invalid Authorization header`, and its "Cerrar
sesión" now revokes the session server-side.

## Writes to child documents invalidate the parent order's cache (ETP-5525)

The shared record cache (`@etendosoftware/app-shell-core/data`, 30 s `recordStaleTime`) is
invalidated by `useEntity` for **its own spec only**. Some specs show values the backend derives
from other specs' documents — the order header's `needsPrimaryDoc` / `needsInvoiceDoc` are computed
from its shipments/receipts and invoices — so a write to a shipment left the order record "fresh"
in the cache, and a client-side return to the order (a Related Documents chip, the back button)
rendered the pre-write annotation until a full reload.

The local `useApiFetch` therefore also runs `invalidateAfterWrite` from
`tools/app-shell/src/lib/crossSpecCacheInvalidation.js` after every **successful non-GET**
response: if the request URL has a path segment listed in `WRITE_INVALIDATES_SPECS`, every cached
query of the dependent specs is marked stale (`cache.invalidate({ spec })`) and the next read
refetches. The response itself is returned untouched, and without a `DataProvider` the hook
returns the plain core client.

A POST is not always a write: a URL whose **last** path segment is in `READ_ONLY_SUB_ENDPOINTS`
— `evaluate-display` (fired on every record open) and `callout` (fired on field edits) — never
invalidates anything (`isReadOnlySubEndpoint`). Without that rule a callout on a shipment field
marked the sales order stale.

| A write to | Marks stale |
|---|---|
| `goods-shipment`, `sales-invoice` | `sales-order` |

The Purchase equivalent (`goods-receipt` / `purchase-invoice` → `purchase-order`) is intentionally
not included yet: it is owned by the Purchase cell, and adding it is just those two map entries.

Add a row there when a new spec starts displaying values derived from another spec's documents.
Not covered: writes made through the plain-module `apiFetch` (`@etendosoftware/app-shell-core/auth/api`,
e.g. `lib/batchDelete.js`), which has no access to the cache, and
writes made in another tab or by another user — those still wait out `recordStaleTime`.
Also not covered: hook-based writes made inside app-shell-core itself, which go through core's own
`useApiFetch` rather than this wrapper, and the in-flight read race: an order GET already in flight
when the child write completes can store pre-write data as fresh (the core cache only discards such
a response on `clear()`). That race is rare in this flow, which is a navigation after the write.

### Writes to Contactos invalidate every cached selector page (ETP-5571)

Selector option pages (`CreatableSearchSelect`, `SelectorInput`) are cached under
`entity: 'selector'` for `catalogStaleTime` (5 min), keyed by the selector URL of the document
that renders them — they belong to no spec that `WRITE_INVALIDATES_SPECS` could name. Renaming a
contact in Contactos therefore left the Contacto selector of every Sales/Purchase document serving
the old name until a full reload: re-opening the selector goes through `fetchQuery`, which returns
the cached page while it is still fresh.

A second map in the same module, `WRITE_INVALIDATES_ENTITIES`, covers caches keyed by entity: a
successful non-GET whose URL has a listed path segment marks every cached query of the dependent
entities stale (`cache.invalidate({ entity })`). Matching is the same whole-path-segment rule,
and the same read-only sub-endpoints are excluded: opening a contact POSTs `evaluate-display`, and
counting it as a write wiped every cached selector page on each open.

| A write to | Marks stale |
|---|---|
| `contacts` (any entity: `businessPartner`, `basicDiscount`, …) | every `selector` entry |

The invalidation is intentionally broad — a selector entry does not record which table its options
come from, so all selector pages are marked, at the cost of one extra GET the next time each is
opened. Only `contacts` is declared; other master-data specs are added when a ticket needs them.

Not covered: the Contacts CSV/XLSX import (`contactsImportDescriptor.js`) writes through the
plain-module `apiFetch`, so selector pages still wait out `catalogStaleTime` after an import.

## Working without an AuthProvider

`useApiFetch` and `useLogout` read the session with `useAuthOptional`, so they do NOT throw in
a tree with no provider above; they fall back to the ambient session, and to an anonymous
request when there is none either.

This is load-bearing, not a convenience. The hook replaced a raw `fetch` in ~105 components
whose existing tests render them bare. Throwing "useAuth must be used within AuthProvider"
would have forced a provider wrapper into hundreds of test files — a larger and riskier change
than the migration it was enabling.

Consequence for tests: a test that needs a token must supply a **session**, not a `token`
prop:

```js
vi.mock('@etendosoftware/app-shell-core/auth', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuthOptional: () => ({ token: 'test-token' }),
}));
```

Spread from the original — `useApiFetch` also imports `createApiFetch` and `getAmbientToken`
from that module. And return a **stable** object: a fresh object per render produces a fresh
request function per render, and any effect depending on it re-fires forever.

## The two guardrails

| Test | Fails when |
|---|---|
| `tools/app-shell/test/auth-header-policy.test.js` | a file hand-rolls an `Authorization` header, or calls a builder it never imported (an unresolved call is a runtime `ReferenceError` that the build does not catch) |
| `tools/app-shell/test/no-raw-fetch.test.js` | a production file in `tools/app-shell/src` or `artifacts/*/custom` calls `fetch` directly |

Both blank out comments before matching, so prose that merely names a builder or spells out a
header is not a hit.

## Documented exceptions

Not every `fetch` is a backend request. Two escape hatches, both visible in a diff:

**File-level** — the `ALLOWED_FILES` map in `no-raw-fetch.test.js`, each entry carrying its
reason:

| File | Why |
|---|---|
| `pages/ArtifactViewerPage.jsx` | dev server (`/api/artifacts`), no token expected |
| `preview/PreviewPage.jsx` | dev server (`/api/source`), no token expected |
| `components/support/helpDocs.js` | public mkdocs assets (`mkdocs.yml`, `search_index.json`) |

**Call-level** — a `raw-fetch-ok: <reason>` comment on the call or the line above, for a
request that is not an API call at all: reading a `blob:` URL from a local PDF preview, or the
`/jsreport/*` container proxy, which takes no Etendo bearer token.

Do not reach for either to silence the guardrail on a real backend call.
