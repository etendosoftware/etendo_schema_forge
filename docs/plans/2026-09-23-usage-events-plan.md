# Usage Events — Generic Async Usage Table, Java Recorder and NEO Endpoint

- **Status:** In progress — phases 1–4 and 5b delivered, review/QA/docs pending (§11)
- **Date:** 2026-09-23
- **Repos:** `com.etendoerp.go` (table, Java, endpoint) · `schema_forge_core` / app-shell (UI client)
- **Jira:** ETP-5462 (epic ETP-5339); follow-up ETP-5475
- **Reference implementation:** `ETGO_MCP_USAGE` + `com.etendoerp.go.mcp.McpUsageLogger` / `McpUsageRow`

## 1. Goal

Have one table where Etendo GO records **usage events** of any kind (backend and UI), written
**asynchronously** so recording never slows down or breaks the operation being measured. Once the
infrastructure exists, decide (phase 4) which events are worth recording.

Three deliverables:

1. A generic table (`ETGO_USAGE_EVENT`, see §2.1 on naming).
2. A Java utility that enqueues a row and inserts it on a separate thread.
3. A NEO endpoint (`POST /sws/neo/usage`) so the React UI can record events too.

## 2. Design decisions

### 2.1 Naming — avoid a collision with the existing `usage` package

`com.etendoerp.go.usage` already exists and means **billing usage** (`UsageAggregationService`,
`UsageDaily`, `BillingResource`, `ETGO_BILLING_EVENT`). A table called plain `ETGO_USAGE` and a class
called `UsageRecorder` in that package would mix two unrelated concepts (billing counters vs.
product telemetry).

**Proposal:** table `ETGO_USAGE_EVENT`, DAL entity `ETGO_UsageEvent`, Java package
`com.etendoerp.go.usageevents`. **Decided (D1).**

### 2.2 What we copy from `McpUsageLogger` (proven properties)

| Property | How |
|---|---|
| Never breaks the caller | `record()` catches `Throwable`; no code path from a failure back to the caller |
| Never slows the caller | Caller only does a queue `offer`; the INSERT runs on a single daemon writer thread |
| Never touches the business transaction | Own connection from `ExternalConnectionPool`, own commit — never `OBDal` / `SessionHandler` |
| Bounded memory | `ThreadPoolExecutor(1,1)` + `ArrayBlockingQueue(capacity)`; full queue → drop |
| Losses are visible | `AtomicLong droppedRows` + throttled WARN (first drop, then ≤ 1/min) + report on shutdown |
| Per-instance opt-out | `Openbravo.properties` flag, default ON, read without DB/OBContext |
| Immutable row, no Etendo types | Row resolved on the request thread (client/org/user captured there), no DAL objects crossing threads |
| Builder, never positional ctor | Avoids silently swapping String columns |
| Shape, never content | No business values, no free text typed by the user, no record contents |

### 2.3 What we improve over `McpUsageLogger`

- **Batched writes:** the writer drains up to N queued rows (e.g. 100) and inserts them with
  `addBatch()` in a single commit. The UI endpoint can produce bursts; one round-trip per row does
  not scale.
- **Generic, not MCP-shaped:** fixed "who/when/what" columns plus a JSON `PROPERTIES` column for
  event-specific attributes, instead of one column per MCP concept.
- **Event type registry:** a Java constant class (`UsageEventTypes`) + a pattern check, so the table
  does not fill with typos and arbitrary strings coming from the UI.
- **Reusable by MCP later:** `McpUsageLogger` could delegate its threading/pooling to the new
  writer (phase 5, optional — not part of the first delivery; `ETGO_MCP_USAGE` stays as is).

### 2.4 Endpoint routing — NEO pseudo-spec, not a webhook

Per the "NEO Pseudo-Spec Bridge Pattern" (CLAUDE.md), add a `case "usage"` in
`NeoPseudoSpecDispatcher` → `POST /sws/neo/usage`. Only a valid NEO bearer token is needed, no
per-role webhook grant that `update.database` would wipe.

## 3. Data model — `ETGO_USAGE_EVENT`

| Column | Type | Req | Notes |
|---|---|---|---|
| `ETGO_USAGE_EVENT_ID` | VARCHAR(32) | ✔ | UUID (`SequenceIdData.getUUID()`) |
| `AD_CLIENT_ID`, `AD_ORG_ID` | VARCHAR(32) | ✔ | From the context/token, never from the request body |
| `ISACTIVE`, `CREATED`, `CREATEDBY`, `UPDATED`, `UPDATEDBY` | std | ✔ | Standard audit; `CREATEDBY` = user or `100` (system) |
| `EVENT_TYPE` | VARCHAR(60) | ✔ | e.g. `window.open`, `record.create`, `report.print`. Pattern `^[a-z][a-z0-9_.]{1,59}$` |
| `SOURCE` | VARCHAR(20) | ✔ | `backend` \| `ui` \| `mcp` (check constraint) |
| `AD_USER_ID` | VARCHAR(32) | | Actor (FK `AD_USER`) |
| `AD_ROLE_ID` | VARCHAR(32) | | Role in use |
| `SESSION_KEY` | VARCHAR(200) | | Groups one session's events |
| `TARGET` | VARCHAR(200) | | Spec name / report / process the event is about. **Not** `ENTITY*` — clashes with `BaseOBObject` accessors (see `McpUsageRow` javadoc) |
| `ACTION` | VARCHAR(60) | | Sub-action (`create`, `complete`, `export_csv`, …) |
| `OUTCOME` | VARCHAR(20) | | `ok` \| `error` \| null |
| `ERROR_CODE` | VARCHAR(200) | | Canonical code, never a stack trace or message |
| `DURATION_MS` | DECIMAL(10,0) | | Optional |
| `OCCURRED_AT` | TIMESTAMP | ✔ | When it happened (UI events may arrive later than `CREATED`); clamped server-side |
| `APP_VERSION` | VARCHAR(60) | | UI build / module version |
| `PROPERTIES` | CLOB | | JSON object (text), ≤ 4 KB, **shape only**. Event-specific data lives here — including AI token counts and model (D2); no dedicated token columns |

Indexes: `(AD_CLIENT_ID, OCCURRED_AT)`, `(EVENT_TYPE, OCCURRED_AT)`, `(SESSION_KEY)`.

Registered in `AD_TABLE` + `AD_COLUMN` (+ `AD_ELEMENT`) via the `/etendo:alter-db` webhooks so the
DAL entity `ETGO_UsageEvent` is generated — **no `AD_WINDOW`, `AD_TAB` or menu entry** (D8); the
table's `AD_Window_ID` stays empty. Then `export.database` (done by the user).

## 4. Java utility

Package `com.etendoerp.go.usageevents`:

| Class | Responsibility |
|---|---|
| `UsageEvent` (record + `Builder`) | Immutable row. `Builder.fromContext()` captures client/org/user/role from `OBContext` **on the calling thread** |
| `UsageEventTypes` | Constants for known event types + `isValid(String)` |
| `UsageEventRecorder` | Public facade: `static void record(UsageEvent e)` — enqueue, never throws. Opt-out property `usage.events.enabled` (default true). Test seam to inject a writer |
| `UsageEventWriter` | Writer thread: drains batch, JDBC `addBatch` on `ExternalConnectionPool`, commit, rollback/close quietly, drop accounting |
| `UsageEventLifecycle` | Shuts down the writer on undeploy (listener or hook in an existing servlet `destroy()`), draining with a grace period |

Usage from any backend code:

```java
UsageEventRecorder.record(UsageEvent.builder()
    .fromContext()
    .eventType(UsageEventTypes.REPORT_PRINT)
    .source(UsageEvent.SOURCE_BACKEND)
    .target("sales-invoice")
    .action("pdf")
    .durationMs(elapsed)
    .build());
```

Rule: call it **after** the business transaction has been committed (as MCP does), so a
rolled-back operation is not recorded as done — or record it with `outcome=error`.

Unit tests (delegated to Tester): enqueue never throws with a null row / disabled flag / full queue
/ pool unavailable; drop counter and throttled WARN; batch binding (clipping, NULLs, CLOB); context
captured on the caller thread, not the writer thread.

## 5. NEO endpoint — `POST /sws/neo/usage`

**Request**

```json
{
  "events": [
    {
      "eventType": "window.open",
      "target": "sales-invoice",
      "action": "list",
      "occurredAt": "2026-09-23T10:15:02.120Z",
      "durationMs": 340,
      "sessionKey": "…",
      "properties": { "layout": "kanban" }
    }
  ]
}
```

**Server rules**

- Auth: normal NEO JWT. Client/org/user/role come **from the token**; the body cannot set them.
- `source` accepted from the body within `{ui, ai-bff}` (default `ui`). It is a **label, not a
  security boundary**: the AI BFF authenticates with the same user NEO token the UI uses (D3),
  because usage is recorded per user and per tenant. Accepted consequence: a user could send
  inflated numbers under their own user/tenant — acceptable, this is product insight, not billing.
  If it ever feeds billing, revisit (service credential).
- Max 50 events per request; `properties` ≤ 4 KB serialized, flat object, string/number/boolean
  values only; strings clipped.
- `eventType` must be in the defined array `UsageEventTypes` (D4), which is extended as new
  events are agreed. An unknown type is dropped and logged at ERROR in the server log (throttled)
  — never an HTTP error, so an old/new UI never gets a failure.
- `occurredAt` clamped to `[now - 24h, now + 5min]`; missing → `now`.
- Response `202 Accepted` with `{ "accepted": n, "dropped": m }`. `400` only for a malformed body.
  The endpoint never waits for the INSERT.
- Simple per-session rate limit (e.g. 600 events/min) to prevent the table being flooded.

Class: `NeoUsageEventEndpoint` (parsing + validation + mapping to `UsageEvent`), wired from
`NeoPseudoSpecDispatcher` with `case "usage"`. Documented in `com.etendoerp.go/docs/neo-headless.md`
§4.x.

## 6. UI client (app-shell)

- `lib/usage/usageClient.js`: in-memory buffer, flush every ~10 s, when the buffer reaches 20 events,
  and on `visibilitychange → hidden` / `pagehide`.
- Sending via `apiFetch` (mandatory request policy — never a bare `fetch`) with `keepalive: true`;
  `navigator.sendBeacon` is not usable because it cannot carry the `Authorization` header.
  `on401: 'ignore'` — a usage flush must never log the user out.
- Failures swallowed (usage must never show an error to the user).
- `useUsage()` hook → `trackUsage(eventType, { target, action, properties })`.
- No automatic mirroring of existing observability events (D5). Each metric is decided
  explicitly: table only, Mixpanel only, or both. The event catalog entry declares its
  destination(s) so a call site instruments once and the helper fans out to the declared
  channels.
- Being generic, it belongs in `schema_forge_core` (`@etendosoftware/app-shell-core`) — see
  `docs/repo-topology.md`.

## 7. Privacy & retention

- Same rule as MCP: **shape, never content** — no amounts, names, NIFs, free text, record values.
  Record ids only when a concrete event justifies it (e.g. counting distinct documents) (D6).
- Opt-out per instance (`usage.events.enabled=false`).
- Retention: **no purge in the first delivery** (D7). Revisit when there is real volume.
- No Mixpanel projection in the first delivery (the table is the source of truth; can be added
  later with its own opt-out, as MCP did).

## 8. Phases

| # | Phase | Repo | Output |
|---|---|---|---|
| 0 | Jira task + feature flag registered (`/feature-debt`) + branch | both | `feature/ETP-XXXX` |
| 1 | Table `ETGO_USAGE_EVENT` in AD + DAL generation | go | XML model + sourcedata |
| 2 | Java recorder (`UsageEvent`, `UsageEventRecorder`, `UsageEventWriter`, types, lifecycle) + unit tests | go | Async utility |
| 3 | NEO endpoint `POST /sws/neo/usage` + tests + `neo-headless.md` | go | Endpoint |
| 4 | UI client + hook + observability provider + tests | core | `trackUsage()` |
| 5 | Event catalog: decide and instrument the first events (see §9) | both | First real data |
| 6 | (Optional) `McpUsageLogger` reuses `UsageEventWriter` | go | Less duplication |

Pipeline per phase: DEV → REVIEW (Alex) → QA (Sentinel) → DOCS (Sage).

## 9. Candidate events (to be decided in phase 5)

| Event | Source | Why |
|---|---|---|
| `session.login` / `session.logout` | backend | Active users, session length |
| `window.open` | ui | Which windows are actually used |
| `record.create` / `record.update` / `record.delete` | backend (NEO CRUD, one central hook) | Real adoption per spec, broad coverage with one hook |
| `process.execute` (complete, post, reactivate…) | backend | Document flows actually used |
| `report.generate` / `document.print` / `document.email` | backend | Reporting / printing usage |
| `export.csv` / `export.xlsx` | ui/backend | Data-out needs |
| `search.global` / `search.vector` | backend | Search usage, zero-result rate |
| `filter.advanced.apply` | ui | Whether the advanced filter is used |
| `copilot.*` / `ai.*` | backend | AI feature adoption |
| `error.ui` (by code) | ui | UX friction |

Criterion to keep an event: it answers a concrete product question, and nobody can answer it
already from `ETGO_MCP_USAGE`, `ETGO_BILLING_EVENT` or Mixpanel.

### 9.1 First event: AI token consumption (support chat + agent chat)

Scope assumption: the agent chat runs with the `webmcp-agent-chat` flag **on** (AI BFF path). The
legacy Etendo Copilot Python path (`/sws/copilot/*`) is being retired and is **out of scope**.

Current state (verified 2026-09-23): neither chat reads, stores or forwards token usage.

| Chat | Path | Where the usage is today |
|---|---|---|
| Agent chat | `useAiCopilotChat.js` → `POST /api/ai/chat` → AI BFF (`tools/ai-bff/src/server.js`, Vercel AI SDK, OpenCode Go OpenAI-compatible provider) | SDK returns `usage` / `totalUsage`, ignored: `onStepFinish` (server.js:220) does not destructure it, `onFinish` (server.js:239) only closes the MCP client |
| Support chat (ValerIA) | `SupportChatContext.jsx` → `SupportConversationsServlet` → `SupportIntegrationClient.sendToAdk` → Google ADK `/run` | ADK returns `usageMetadata` per event, discarded by `parseAdkResponse` (SupportIntegrationClient.java:253-265) |

Tokens are **recorded server-side, never from the UI**: they are cost data and a UI-reported
number can be forged.

| Event | Source | Hook point | Properties |
|---|---|---|---|
| `ai.agent.message` | `ai-bff` | BFF `onFinish` → read `totalUsage` + model → `POST /sws/neo/usage` with the caller's NEO token | `model`, `inputTokens`, `outputTokens`, `cachedInputTokens`, `steps`, `toolCalls`, `finishReason`; `SESSION_KEY` = `x-opencode-session` |
| `ai.support.message` | `backend` | `SupportIntegrationClient.parseAdkResponse` → sum `usageMetadata` of the model events → `UsageEventRecorder.record(...)` | `model`, `inputTokens` (`promptTokenCount`), `outputTokens` (`candidatesTokenCount`), `cachedInputTokens`; `SESSION_KEY` = support conversation id |

Notes:
- The BFF is Node, so it cannot use the Java recorder — it goes through the NEO endpoint. The call
  must be fire-and-forget (not awaited before the stream ends) so it never delays the response.
- `SupportIntegrationClient` needs the ADK agent to actually return `usageMetadata` in the `/run`
  response; the ADK agent code (`agent/callbacks.py`) is not in this workspace — to be confirmed.
- Optional later: also forward the usage to the UI via `toUIMessageStream({ messageMetadata })` for
  display. Display only — the recorded value is always the server-side one.
- Tokens and model go in `PROPERTIES` (D2), e.g.
  `{"model":"kimi-k2.6","inputTokens":1200,"outputTokens":340,"cachedInputTokens":0}`.
  Aggregation via `(properties::jsonb ->> 'inputTokens')::numeric`.
- The BFF authenticates with the user's own NEO token (D3), so each row lands under the right
  user and tenant.

## 10. Decisions (2026-09-23)

| # | Decision |
|---|---|
| D1 | Table `ETGO_USAGE_EVENT`, package `com.etendoerp.go.usageevents` |
| D2 | Event-specific data (including AI tokens and model) in `PROPERTIES`, a text column holding JSON — no dedicated token columns |
| D3 | The AI BFF records with the user's own NEO token (usage per user and per tenant); `source` is a label, not a trust boundary |
| D4 | Event types are a defined array (`UsageEventTypes`), extended over time; unknown type → dropped + ERROR in the server log, never an HTTP failure |
| D5 | No automatic mirroring of Mixpanel events; each metric goes to the table, Mixpanel or both, as decided per metric |
| D6 | Record ids in `PROPERTIES` only when a specific event justifies it |
| D7 | No retention/purge process for now |
| D8 | Physical table **registered in `AD_TABLE` + `AD_COLUMN`** (so the DAL entity is generated), but **no `AD_WINDOW` / `AD_TAB` / menu** and no NEO spec; queried via SQL |

Still to confirm: the ADK support agent actually returns `usageMetadata` in its `/run` response
(its code is not in this workspace).

## 11. Progress (2026-09-23)

All work is on `feature/ETP-5462` in the three repos, committed, not pushed.

| Phase | Repo | Commits | State |
|---|---|---|---|
| 1. Table `ETGO_USAGE_EVENT` (AD_TABLE + AD_COLUMN, no window; DAL `UsageEventLog`, entity `etgo_usage_event`) | com.etendoerp.go | `32c237043` | Done |
| 2. Async recorder (`com.etendoerp.go.usageevents`) + unit tests | com.etendoerp.go | `0d4ebb8c6`, `31918bd10` | Done, 105 tests |
| 3. `POST /sws/neo/usage` (`NeoUsageEventEndpoint`) + tests | com.etendoerp.go | `b6aae8782`, `8e89b3006`, `20d186128`, `54ad2c39a`, `00d3f3484` | Done, verified live against local Tomcat |
| 4. UI client (`app-shell-core/src/lib/usage/`) + tests | schema_forge_core | `e2cd7d3c2`, `5009ccff3` | Done; catalog intentionally empty |
| 5b. Agent chat tokens from the AI BFF (`tools/ai-bff/src/usage.js`) + tests | schema_forge | `0beb856de`, `ecc768e79` | Done; error path verified live |
| `session.login` backend event (`SessionLoginUsage`) + tests | com.etendoerp.go | `b4f1563e1`, `d15b71180` | Done; non-blocking proven live |
| 5a. Support chat tokens (ADK) | — | — | Deferred |

### Changes against the original plan

- `source` accepts `backend`, `ui`, `ai-bff`, `mcp` (check constraint); the endpoint only takes `ui` or `ai-bff` from the body.
- Endpoint limits: 50 events per request, body ≤ 256 KB (413), JSON nesting depth ≤ 32 (400), 600 events/min per client+user+session **and** 1200 events/min per client+user.
- The JSON parser hardening found a module-wide issue (jettison `StackOverflowError` on truncated/deep bodies); fixed here only for the usage endpoint, tracked for the rest in ETP-5475.
- Registered event types: `ai.agent.message`, `ai.support.message` (defined, no caller yet), `session.login`.
- Agent chat properties: `model`, `inputTokens`, `outputTokens`, `cachedInputTokens` (when reported), `steps`, `toolCalls`, `finishReason`; `target` is `agent-chat` or `page-help`.
- `session.login` is recorded on both environment-entry paths: `GET /sws/go/login?userId=` (`action=login`) and `POST /sws/go/session/environment` (`action=cookie-login`).

### Live evidence (local Tomcat)

- Endpoint: mixed batch → 202 `{accepted:1, dropped:2}`; truncated and 20,000-deep bodies → 400; GET → 405; no token → 401. The stored row takes client/user/role from the token, not from the body.
- Non-blocking: 30 logins with `etgo_usage_event` held under `ACCESS EXCLUSIVE` answered in 13.9 ms on average (baseline 17.3 ms), all 200; the writer INSERT waited on the lock and the 30 rows appeared once it was released.
- AI BFF: one `ai.agent.message` row recorded on the error path (provider out of credits); the success path with non-zero tokens is still to be seen.

### Pending

- REVIEW (Alex), QA (Sentinel), DOCS (Sage) and the three PRs.
- Support chat tokens (5a): needs a reachable ADK or a captured `/run` response to confirm `usageMetadata` / `modelVersion`.
- Agent chat success path with non-zero tokens, once the provider has credits.
- `app-shell-core` version bump and wiring `trackUsageEvent` in the functional `App.jsx` (owned outside this task).
- Test seams: optional deps for `handleChat` in the BFF; an injectable clock for the recorder's rejection throttle.

