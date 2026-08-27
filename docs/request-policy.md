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
| `on401: 'ignore'` | the endpoint's 401 is a domain answer, not an expired session — `lib/upgrade/api.js` maps it to its own `sessionExpired` code; a probe reads it as "feature unavailable" |
| `baseUrl: ''` | the URL is already complete, or points outside the base (`buildCreateUrl` returns a sibling path from the app root) |
| `token` | a plain module was handed a specific token by its caller |
| `credentials` | overrides the default `'include'` |

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
