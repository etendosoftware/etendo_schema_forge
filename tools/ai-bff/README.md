# Local AI BFF

The BFF keeps the OpenCode Go credential server-side and forwards only the
current browser session credential to Etendo Go's MCP endpoint. The existing
Copilot popup calls this BFF when the `webmcp-agent-chat` feature flag is on;
when it is off, the legacy Copilot API remains unchanged.

## The forwarded credential: two schemes, three headers

Etendo Go issues one of two session schemes (ETP-4575/4576) and the SPA resolves
which one is active from whether the backend handed it a CSRF token:

| Scheme | What the browser sends | What the BFF forwards |
|---|---|---|
| `bearer` | `Authorization: Bearer <jwt>` | `Authorization` |
| `cookie` | `__Host-go_session` cookie + `X-Go-CSRF` | `Cookie` (the session cookie only), `X-Go-CSRF`, `Origin`, `Referer` |

Under `cookie` the client holds **no token at all** — `authHeaders()` deliberately
sends nothing and lets the `__Host-` cookie travel on its own. A BFF that gates on
`Authorization: Bearer` therefore rejects every in-app conversation with a 401 that
reads like an expired login, while every other request in the app keeps working.
That is what `sessionCredentials()` exists to prevent; it accepts either scheme and
returns `null` only when neither is present.

`Origin` is the one that is easy to drop and expensive to debug. The chat POST is an
unsafe method, so `GoSessionSecurity.isUnsafeRequestAuthorized()` requires a valid
`X-Go-CSRF` **and** an allowlisted origin, and the origin check fails closed. Losing
the header turns the 401 into a `403 CSRF validation failed`, which reads like an
unrelated second bug. It is forwarded verbatim rather than reconstructed, because the
backend compares it exactly (`CorsUtils.isAllowedOrigin`).

Only the session cookie is forwarded, never the whole jar: `ETENDO_MCP_URL` is
configuration, so passing the browser's full `Cookie` header would hand every unrelated
cookie it happens to hold to whatever that variable points at.

A missing CSRF proof is **not** rejected here: this process proxies a credential, it is
not a second authority on it, so the caller gets Etendo Go's own 403 rather than a
lookalike invented one hop earlier.

**Deployment note.** `isAllowedOrigin` accepts the request's own origin plus a
localhost allowlist, so local dev (`http://localhost:3100`) works out of the box. When
the BFF reaches Etendo over an internal URL, the browser's origin is not the backend's
own, so that origin must be listed in `ETGO_ALLOWED_ORIGINS` (or the
`etgo.allowed.origins` system property) on the Etendo side.

Copy `.env.example` to `.env` and set:

```env
OPENCODE_API_KEY=secret
OPENCODE_MODEL=opencode-go/<model-id>
OPENCODE_BASE_URL=https://opencode.ai/zen/go/v1
ETENDO_MCP_URL=http://localhost:8080/etendo/sws/mcp
BFF_PORT=3400
BFF_MAX_BODY_BYTES=1000000
```

`make dev` installs the BFF dependencies on first use and starts it together
with the app-shell. Never put `OPENCODE_API_KEY` in Vite variables or browser
code. In production, expose the same `/api/ai/chat` contract through the
server-side Cloud Function/BFF and keep the browser session token as the only
credential forwarded to the Etendo MCP endpoint.

When the feature flag is enabled, the BFF also advertises the browser-side
`inspect_page_dom` and `interact_with_page` tools. The browser returns visible
interactive elements as temporary IDs, and subsequent interactions must use an
ID from the latest inspection. The interaction surface is limited to click,
fill, type, and key press operations; it does not expose arbitrary selectors,
JavaScript execution, password values, or a second authorization mechanism.
The app-shell also provides a throttled floating page-help action that asks the
model to inspect the current page after navigation or meaningful UI interaction
and present a contextual suggestion in a floating callout. Clicking that callout
opens the existing Copilot conversation with the help context. It is advisory:
consequential operations remain explicit user actions.

The BFF disables MCP protocol discovery when connecting to Etendo Go. Etendo's
MCP endpoint uses the legacy `initialize` handshake and does not implement the
optional `server/discover` probe introduced by newer MCP clients.

Each browser conversation sends a stable `x-opencode-session` value to the BFF,
which forwards it to OpenCode Go for request routing and prompt caching. The
BFF generates a fallback session ID for older clients that omit the header.

## Token usage recording

Every model turn — agent chat and page help — is recorded as one
`ai.agent.message` event in `ETGO_USAGE_EVENT` (`src/usage.js`). The BFF posts it
to `POST /sws/neo/usage` with the **caller's own Bearer token**, the same one it
forwards to the MCP endpoint, so the row lands under the right user, role and
tenant; the body cannot name them. The URL is derived from `ETENDO_MCP_URL`
(`…/sws/mcp` → `…/sws/neo/usage`); set `ETENDO_USAGE_URL` to override it.

| Field | Value |
|---|---|
| `source` / `action` | `ai-bff` / `reply` |
| `target` | `agent-chat`, or `page-help` for the floating page-help request |
| `outcome` | `ok` from `onFinish`; `error` from `onError` or `onAbort` (timeout), with the usage summed over the steps that did finish |
| `sessionKey` | the `x-opencode-session` value (or the BFF fallback ID) |
| `durationMs` | from the moment the BFF read the request |
| `properties` | `model`, `inputTokens`, `outputTokens`, `cachedInputTokens` (only when the provider reports cache reads), `steps`, `toolCalls`, `finishReason` |

The token keys are shared with the support chat's `ai.support.message`, so both
aggregate with the same `(properties::jsonb ->> 'inputTokens')::numeric`.

Recording never touches the chat: the POST is fire-and-forget (never awaited
before the stream ends), bounded by a 3 s timeout, counted at most once per
turn, and any failure is a single `[ai-bff:usage] not recorded: …` line on
stdout. A missing row is therefore silent in the UI — check the BFF log first.

## Navigation tools and the window allow-list

`navigate_to` and `open_form` accept either an internal path (`/sales-order`,
`/sales-order/new`) or the window name as the user says it, in any UI language
("Sales Order", "Pedido de Venta", "Albaranes de Venta"). The browser resolves
names in `app-shell/src/components/copilot/windowRoutes.js` against an index
built from the **access-filtered menu groups the sidebar renders** — the output
of `filterMenuGroupsByAccess()` that `AppLayout` already passes to
`CopilotProvider`. Consequences worth keeping:

- A window the current role cannot reach is not in the index, so the agent
  cannot route to it. Navigation is not a new authorization path; it can only
  reach what the sidebar offers.
- While `useRoleMenu()` is in flight the index is empty and the agent reports
  navigation as unavailable, matching the sidebar's fail-closed behaviour.
- Adding a window to `menu.json` makes it navigable with no change here. Never
  reintroduce a hardcoded alias table: the one this replaced (ETP-5064) knew
  only Goods Receipt and Goods Shipment, so "llevame a sales order" failed on a
  perfectly navigable route.
- Short menu labels are not unique — "Order" belongs to both Sales Order and
  Purchase Order, "Factura" to both invoices, "Albarán" to both goods documents
  (11 clashes in today's menu). Such a reference resolves to *nothing*: the
  agent is told the candidates and must pick or ask, because silently routing
  to the wrong document is worse than an error.

Three failures that must stay distinct, because the model reacts to the message:

| Failure | Error | Model's move |
|---|---|---|
| External or malformed path (`https://…`, `//host`) | `Only internal application paths are allowed` | Give up; this is the security boundary. |
| Name the index cannot resolve | `UnknownWindowError`, listing every reachable slug | Retry `navigate_to` with one of the listed paths. |
| Name shared by several windows | `AmbiguousWindowError`, listing the candidates | Pick one candidate path, or ask the user which they mean. |

Reusing the first message for the second is what made the agent tell the user
navigation was unavailable and to open the menu by hand. `open_form` therefore
also **requires** `path` — it used to be optional with a Spanish-regex guess
over the conversation, and a miss surfaced as the security error.

## Tool schemas: `inputSchema`, never `parameters`

`tool({ ... })` takes the argument schema in **`inputSchema`**. `parameters` was
its name up to ai@4 and is silently ignored by ai@7: the tool is still
advertised to the model, just with no schema, so the model calls it with **no
arguments at all**. The visible symptom is not "invalid arguments" but a browser
tool failing on `args.path === undefined` while the model reports it "could not
provide a path" — the exact ETP-5064 dead end. `test/server.test.js` fails if any
browser tool loses its schema or goes back to `parameters`.

## System prompt

The BFF sends the model a server-side system prompt (`src/systemPrompt.js`,
`buildSystemPrompt({ mode })`), with a `chat` variant (agentic, MCP + browser
tools) and a `page-help` variant (no tools, short answers). It is never sent to
or exposed by the UI, and a `system` field in the request body is ignored.

The default rules address an end user with little technical knowledge (plain
language, no tool names), ground answers in the MCP tools, and point only to the
functional docs (https://etendosoftware.github.io/etendo-docs/) plus Etendo
support when the agent cannot answer. In that case the chat variant also calls
the MCP `neo_feedback` tool once, silently, so the team can review the gap.

For local experiments set `AI_BFF_SYSTEM_PROMPT_FILE=/path/to/prompt.md`: if the
file is readable and non-empty, its content replaces the default for both modes.
It is read on every request, so edits apply without a restart; an unreadable or
empty file falls back to the default.

## Conversation history cache

The browser already sends every UIMessage (tool calls and results included)
while its tab stays open. A conversation resumed from the history panel, or a
reloaded tab, only has the user/assistant text stored in the database, so the
agent would forget the tool work it did earlier. To close that gap the BFF keeps
the full model history (`src/historyCache.js`) in memory, keyed by the
`x-opencode-session` id (the frontend uses the conversation UUID).

- **What is stored:** the full `ModelMessage[]` at the end of the last completed
  turn (tool calls and results included). Aborted or failed turns are not stored.
- **Life:** sliding TTL of 1 hour (`AI_BFF_HISTORY_TTL_MS`, default `3600000`;
  `0` disables the cache). After it expires the conversation continues from what
  the browser sends (the DB text history).
- **Bounds:** LRU cap of `AI_BFF_HISTORY_MAX_ENTRIES` (default 200) and a
  per-entry guard of `AI_BFF_HISTORY_MAX_ENTRY_CHARS` (default 2000000); an
  oversized history is simply not stored.
- **Tool output growth:** results of previous turns larger than
  `AI_BFF_HISTORY_TOOL_RESULT_BUDGET` chars (default 4000) are replaced by
  `[elided N chars]`. The call/result pair is always kept, and the latest turn
  is never elided.
- **Consistency rule:** the cache is used only when the incoming messages are
  exactly the cached turns (same roles and whitespace-normalized text; ids are
  not compared because the client generates its own) followed by one or more new
  user messages. Edit, regenerate, retry or any count mismatch ignores the cache
  and the request uses `body.messages` as before, replacing the entry afterwards.
- **`page-help`** never reads or writes it, and a request without an
  `x-opencode-session` header is not cached.
- **Trace:** one `[ai-bff:history]` line per chat request (`hit`, `miss` or
  `ignored` + reason), never the content.
- **Limits:** per process. It is lost on restart and is not shared between
  replicas, so behind a load balancer use session affinity or accept the
  fallback to the DB history on a cache miss.

## Tracing a conversation

Both halves of the loop are traced, and both are needed: MCP tools (`neo_list`,
`neo_get`, ...) execute **inside this process** and never reach the browser,
while browser tools (`navigate_to`, `open_form`, ...) execute in the page and
never reach this process.

| Where | Output | Shows |
|---|---|---|
| BFF stdout | `[ai-bff:tools]`, `[ai-bff:step]` | which tools were offered, and every tool call + result the model made |
| Browser console (DEV only) | `[copilot:tool] call/result/error/turn` | the args the browser received, what it answered, and the assistant turn's parts |

Silence them with `AI_BFF_TRACE=off` (server) or
`window.__ETENDO_COPILOT_TRACE__ = false` (browser). Server payloads are
truncated to `AI_BFF_TRACE_MAX` characters (default 1500) because a single
`neo_list` result is far larger than a readable log line.

Note this process has **no hot reload** (`npm run start`, not `--watch`), so a
change here needs a restart of `make dev` before the model sees it.

## Deployment

The BFF is released by Jenkins, not from this repository. The logic lives in
`etendo-go-staging/bff-release.sh` of `com.etendoerp.jenkins.pipelines`, and
both deploy pipelines call it after the backend is live and after the
report-server, **before** the front, from the same `etendo_schema_forge`
commit the front ships (so a new SPA never talks to an old BFF):

| Pipeline | Forge branch | Environments (in order) | Cluster / task family | ECR repository |
|---|---|---|---|---|
| `JenkinsfileExperimental` | `develop` | experimental, then demo1 | `etendo-<env>` / `ai-bff-<env>` | `etendo/ai-bff-experimental` |
| `JenkinsfileProduction` | `main` | production | `etendo-production` / `ai-bff-production` | `etendo/ai-bff-production` |

demo1 is deployed only when experimental succeeded, with the same image.
Production has its own switch, `AI_BFF_RELEASE_MODE` in
`releaseFrontAndReportServer()`: while it is `dry-run` the step resolves (and,
if needed, tests and builds) the image and logs what it would deploy, but
pushes and deploys nothing. A failed BFF release ends the build `UNSTABLE`; the
backend is never rolled back for it and the front is still published.

**Tag = content.** The image tag is `bff-<first 12 chars of the git tree hash
of tools/ai-bff>` at that commit. The same content has the same tag on any
branch, and any file under `tools/ai-bff/` (this README included) changes it.
For that tag the release does exactly one of:

| Tag found in | Action |
|---|---|
| the target repository | reuse it — no build, no tests |
| only the other repository | copy it with `docker buildx imagetools create --prefer-index=false` (same manifest, same digest) |
| neither | test, build, gate, push (below) |

A `develop` → `main` promotion with no BFF change in between is therefore a
copy: production runs the byte-identical image experimental ran.

**Build gates.** A build first runs, in a `node:22` container, `npm test` here
and the Copilot regression suite (`useAiCopilotChat.vitest.jsx` and
`ChatView.vitest.jsx` in `tools/app-shell`, after a root `npm install`). Then
it builds `linux/amd64` with provenance/SBOM off (a single manifest, not an
index), starts the container and requires `GET /health` → 200 before pushing.
Tests only run when an image is built; a reused or copied image was tested
when it was first built.

**Pinned by digest, with rollback.** The new task definition is a copy of the
revision the service runs now, with only the `ai-bff` container's image
replaced by `<repository>@sha256:…`. It is tagged `ai-bff.tree`,
`ai-bff.commit` and `ai-bff.build` (registered untagged, with a warning, if the
role lacks `ecs:TagResource`). After `update-service` the release waits for
`services-stable` and then checks the service is on a revision running the new
digest, with one deployment, rollout `COMPLETED` and all tasks running — the
circuit breaker on demo1 and production can roll back on its own and still
report stable. Otherwise it puts the previous revision back and fails. Keep
the running revision `ACTIVE` (do not deregister it by hand): rollback needs
it. A service that already runs the digest is a no-op. Each release is also
recorded, best-effort, in the SSM parameter `/etendo/<env>/ai-bff-release`.

**What is running.** From a checkout of `com.etendoerp.jenkins.pipelines`,
with AWS credentials for account `278186107973` (read-only is enough):

```bash
S=etendo-go-staging/bff-release.sh
bash $S current production                       # digest the service runs
bash $S verify  production sha256:<digest>       # settled on it, all tasks up
FORGE_DIR=<forge clone> bash $S plan production <forge_sha>   # tag + reuse|copy|build
```

**Emergency deploy by hand.** Normally, merge the fix and let the pipeline
release it. If the BFF must change before the next pipeline run (or the
pipeline itself is broken), run the same script on a Linux host with Docker
(the build server is the natural one) and credentials that can push to ECR and
update the service:

```bash
export GH_TOKEN=<token with repo + read:packages>   # the build installs @etendosoftware packages
bash $S build  production <forge_sha>              # prints DIGEST=sha256:…
bash $S deploy production sha256:<digest>          # verifies, rolls back on failure
```

To go back to an earlier image, `deploy` its digest (see
`aws ecr describe-images --repository-name etendo/ai-bff-<experimental|production>`).
`deploy` never builds, so rolling back is a single, fast step. Deploying by hand
leaves the pipeline in charge: its next run redeploys whatever the forge
commit contains.
