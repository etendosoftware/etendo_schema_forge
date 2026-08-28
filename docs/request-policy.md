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
| `on401: 'ignore'` | the endpoint's 401 is a domain answer, not an expired session — `lib/upgrade/api.js` maps it to its own `sessionExpired` code; a probe reads it as "feature unavailable". **"This file did not log out before the migration" is NOT a reason**: that was the defect, and applying it as a rule would opt every call site out of the fix. Today only four places use it: `InviteAcceptancePage` (pre-login, the 401 body carries the domain code), `ImportLinesModal` (a per-line loop that must not abort on one failure), `App.jsx`'s window-access map (fail-closed during hydration, where a logout would loop), and `useDashboardData` (a failed widget degrades to `null`) |
| `baseUrl: ''` | the URL is already complete, or points outside the base (`buildCreateUrl` returns a sibling path from the app root) |
| `token` | a plain module was handed a specific token by its caller |
| `credentials` | overrides the default `'include'` |

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

`useEntity` handles this already, with a non-dismissing notice and **exactly two choices**:

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

## 401 and logout

A 401 that is not ignored calls the logout handler and throws `Unauthorized`. In the app that
handler is `useLogout` — the clear-then-logout choke point — so an expired session clears the
persisted dashboard period filter exactly like the user menu does. `App.jsx` additionally
wires `AuthProvider`'s `onSessionChange` to clear session-scoped state whenever the session
loses its token, which covers the ambient (non-React) path too.

That is why the local `@/auth/useApiFetch.js` **wraps** the core hook instead of re-exporting
it: taking the core's own `useAuth().logout` would silently skip the clear.

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
| `tools/app-shell/test/no-raw-fetch.test.js` | a source file calls `fetch` directly |

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
