# MCP `Method not found` noise and `server/discover` support

Status: proposal (ticket drafts in §7) · Date: 2026-10-06 · Module: `com.etendoerp.go` (`src/com/etendoerp/go/mcp/`)

## 1. What production shows

Datadog (EU, `service:etendo-core`, host `/ecs/etendo-production`), last 7 days up to 2026-10-06:

| JSON-RPC method | Count | First seen | Last seen |
|---|---|---|---|
| `server/discover` | 565 | 2026-09-29 12:10 | 2026-10-06 11:47 |
| `resources/templates/list` | 3 | 2026-09-30 18:37 | 2026-10-05 18:54 |

Every one of them is logged as:

```
ERROR com.etendoerp.go.mcp.McpServlet - Error processing MCP message: Method not found: <method>
```

followed by a full stack trace (which Datadog ingests line by line as separate `info` entries,
because multiline aggregation is not configured for this source).

Explorer: https://app.datadoghq.eu/logs?query=%22Error+processing+MCP+message%22&viz=pattern

## 2. What the code does today

`McpServlet.dispatchMethod()` (`McpServlet.java:497-516`) knows `initialize`,
`notifications/initialized`, `ping`, `tools/list`, `tools/call`, `resources/list`,
`resources/read`. Anything else throws `McpMethodNotFoundException`.

The **client-facing answer is already correct**: the generic `catch` (`McpServlet.java:182-198`)
maps that exception to JSON-RPC `-32601`. The defects are server-side only:

1. **Wrong log level.** `McpMethodNotFoundException` falls into the same `catch (Exception e)` as
   real server failures and is logged with `log.error(..., e)` — ERROR plus stack trace — for what
   is a client asking for something we do not offer.
2. ~~Wrong telemetry classification.~~ **Refuted 2026-10-06.** The catch does call
   `recordToolCall(..., McpConstants.ERROR_SERVER)`, but `recordToolCall` returns early when
   `toolName` is blank (`McpServlet.java:240`), and `toolName` is only set for `tools/call`
   (`McpServlet.java:152`). Unknown JSON-RPC methods therefore produce **no** telemetry row at all
   — the error rate is not inflated.

Declared protocol version: `PROTOCOL_VERSION = "2024-11-05"` (`McpServlet.java:75`). Revisions
`2025-03-26`, `2025-06-18` and `2025-11-25` (all legacy/initialize-based) and the stateless
`2026-07-28` have shipped since.

## 3. What `server/discover` is

Introduced by the **2026-07-28** revision, which made MCP stateless-first
(SEP-2575): no `initialize` handshake, no session header; protocol version, client info and client
capabilities travel in `params._meta` on **every** request.

- Spec: https://modelcontextprotocol.io/specification/2026-07-28/server/discover
- Versioning / dual-era rules: https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning

`server/discover` returns, in one call, `supportedVersions`, `capabilities`,
`_meta["io.modelcontextprotocol/serverInfo"]`, optional `instructions`, plus cache hints
(`ttlMs`, `cacheScope`). It is **MUST implement** for a 2026-07-28 server and **optional to call**
for clients.

Why clients send it to us: a client that speaks both eras uses it (or a modern request) as a
**probe** to detect whether the server is modern or legacy, and falls back to `initialize` when it
is legacy. Our `-32601` answer is what tells it "legacy" — the fallback then works, which is why no
user-visible failure is associated with these logs.

## 4. Can we "just implement" `server/discover`? — No, not on its own

Answering `server/discover` with a `DiscoverResult` **declares the server modern**. Per the
versioning page (*Backward Compatibility with Initialization-Based Versions*), once a client gets a
`DiscoverResult` it stays modern: it stops sending `initialize` and sends stateless requests with
per-request `_meta` and the `MCP-Protocol-Version: 2026-07-28` header.

So implementing `server/discover` is equivalent to making the server **dual-era**, which also
requires:

- Accepting and validating per-request `_meta` (`protocolVersion`, `clientInfo`,
  `clientCapabilities`) and the `MCP-Protocol-Version` header; answering
  `UnsupportedProtocolVersionError` for versions we do not serve.
- Serving `tools/list`, `tools/call`, `resources/*` without a prior `initialize` (auth is already
  per-request OAuth2, so this is mostly about not depending on handshake state).
- Moving telemetry off the handshake: `McpUsageTelemetry.openSession()` is driven by
  `initialize` and the session header, both of which disappear in modern mode — `clientInfo` would
  have to be read from each request's `_meta` instead, or modern traffic loses the client name and
  task grouping (B1).
- Result shape changes of the revision (e.g. `resultType`) and the HTTP rules for unknown methods
  in the streamable-HTTP binding (legacy fallback is driven by a `400` without a recognized modern
  error body).
- Keeping `initialize` working unchanged for legacy clients (the compatibility matrix makes
  dual-era the only configuration that serves both).

Returning a `DiscoverResult` that lists only `2024-11-05` is not a shortcut: `server/discover` does
not exist in any legacy revision, so the client would be told the server is modern and offered no
modern version to use.

**Recommendation:** treat `server/discover` as part of a single, scoped task "support MCP
2026-07-28 (dual-era)" — not as a one-method patch. Worth doing: the ecosystem is moving there
(AWS, Azure, GitLab are already tracking it) and stateless mode also removes the session-affinity
concern for horizontal scaling.

## 5. Proposed changes — "update the MCP" in two steps

The root issue is not one missing method: the server declares protocol `2024-11-05`, four revisions
behind. It already returns fields from later revisions (`title`, `icons`, `websiteUrl` in
`serverInfo` — `2025-06-18` / `2025-11-25`) while still announcing `2024-11-05`, and it already
implements OAuth Protected Resource Metadata and `WWW-Authenticate` (`OAuth2Filter`, `McpServlet`).
So it sits half-way between revisions without saying so.

Changelogs used for this section (verified 2026-10-06):
[2025-03-26](https://modelcontextprotocol.io/specification/2025-03-26/changelog) ·
[2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/changelog) ·
[2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/changelog) ·
[2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/changelog)

### 5.0 Immediate fix — stop logging client probes as server errors

Independent of both steps, small, ship first. In `McpServlet.java`:

- Add `catch (McpMethodNotFoundException e)` **before** the generic catch: log at `debug` (or
  `warn` without the throwable — one line, no stack trace), answer `-32601` as today. No telemetry
  change is needed (see §2, item 2).
- `resources/templates/list`: **out of scope for now** (decision 2026-10-06). With 5.0 it stops
  producing ERROR logs; it keeps answering `-32601`. Note for later: we advertise the `resources`
  capability, so the conformant answer is `{"resourceTemplates": []}`.

Tests (`tester-go`): unknown method → `-32601`, no ERROR log, telemetry classified as client error.

### 5.1 Step 1 — Catch up to `2025-11-25` (latest legacy revision, `initialize`-based)

Low risk: the session model does not change, existing clients keep working, and modern MCP clients
(Claude, Cursor, …) already speak these revisions. Gap analysis against the current code:

| Revision | Change | Status in `com.etendoerp.go` | Action |
|---|---|---|---|
| 2025-03-26 | OAuth 2.1 authorization framework | Present (`OAuth2Filter`) | Re-validate against 2025-11-25 auth text |
| 2025-03-26 | Streamable HTTP transport | Present (POST JSON-RPC) | — |
| 2025-03-26 | JSON-RPC batching | Not supported (no array body parsing) | None — **removed again in 2025-06-18** |
| 2025-03-26 | Tool annotations (`readOnlyHint`, `destructiveHint`, …) | **Missing** | Add per tool: `etendo_list/get/schema/discover/selectors/defaults` read-only; `etendo_delete` destructive. Cheap, helps clients ask for confirmation correctly |
| 2025-03-26 | Audio content, `completions` capability, progress `message` | Not used | None |
| 2025-06-18 | **Version negotiation** + `MCP-Protocol-Version` header MUST on later HTTP requests | **Missing**: `initialize` always answers `PROTOCOL_VERSION` and ignores the client's `protocolVersion`; header not read | Negotiate: echo the client's version when supported, else our latest; accept/validate the header (`400` on an unsupported value) |
| 2025-06-18 | Structured tool output (`outputSchema` / `structuredContent`) | **Missing** | **Not planned (2026-10-06).** Optional in the spec (MUST only once a tool declares an `outputSchema`); no client needs it. Reopen if one does — measure payload cost with `/mcp-ace-comparison` first |
| 2025-06-18 | OAuth Resource Server + Protected Resource Metadata; RFC 8707 resource indicators | Metadata present | Verify the `resource` parameter is honoured/validated |
| 2025-06-18 | `title` fields, `_meta` on more types, resource links, elicitation | `title` already used | Resource links / elicitation: none for now |
| 2025-11-25 | Icons, `description` in `Implementation` | Icons present in `serverInfo` | Add `description` |
| 2025-11-25 | Input validation errors returned as **tool execution errors** (`isError: true`), not protocol errors (SEP-1303) | `isError` already used by `McpToolRouter` | Audit that no validation path still throws a JSON-RPC error |
| 2025-11-25 | **HTTP 403 for invalid `Origin`** on Streamable HTTP | **Missing** (no Origin check) | **Discarded** — see T4 |
| 2025-11-25 | OIDC discovery, incremental scope consent, Client ID Metadata Documents | Unknown | Review with the OAuth owner; not blocking |
| 2025-11-25 | Tasks (experimental), URL elicitation, sampling with tools | Not used | None (tasks moved to an extension in 2026-07-28) |

Then bump `PROTOCOL_VERSION` to `2025-11-25` (keeping `2024-11-05` negotiable for old clients).

### 5.2 Step 2 — Add `2026-07-28` (stateless) as a second era (dual-era server)

This is where `server/discover` lives. Scope, per the 2026-07-28 changelog and §4:

- `server/discover` returning `supportedVersions`, `capabilities`, `serverInfo` in `_meta`,
  `instructions`, `ttlMs`, `cacheScope`.
- Per-request `_meta` (`protocolVersion`, `clientCapabilities`, `clientInfo`) instead of the
  `initialize` handshake; `UnsupportedProtocolVersionError` (`-32022`) on mismatch.
- No `Mcp-Session-Id` in modern mode → **telemetry redesign**: `McpUsageTelemetry` uses that header
  as its session key (B1) and takes `clientInfo` from `initialize`. In modern mode the client name
  comes from each request's `_meta`, and task grouping needs another key.
- Required `resultType: "complete"` on every result; `ttlMs` + `cacheScope` on `tools/list`,
  `resources/list`, `resources/read`; deterministic `tools/list` order.
- `ping` removed in modern mode; resource-not-found code `-32002` → `-32602`; new standard headers
  `Mcp-Method` / `Mcp-Name` on POST.
- Era detection on HTTP: a legacy client must keep getting the legacy behavior; a modern request
  from a client must not be answered with legacy semantics.
- Keep `initialize` fully working for legacy clients (dual-era is the only configuration that
  serves both — compatibility matrix in the versioning page).

Needs its own design pass before implementation; the telemetry part is the non-obvious one.

## 6. Other MCP findings in the same Datadog window

Not part of this proposal; recorded so they are not lost.

| Signal | Count (7d) | Notes |
|---|---|---|
| `WARN McpParentScope` — tab `Lines` of `FIN_Payment`: parent-link fields `[paymentDetails, invoicePaymentSchedule]` do not point at `FIN_Payment` | 76 | Still occurring (last 2026-10-06 01:22). Config fix: set `MCP_CONFIG parent.field`. |
| `WARN McpParentScope` — tab `Transaction Adjustments`: `[inventoryTransaction]` does not point at `M_Costing_Transactions_HQL` | 42 | Same class of config issue. |
| `WARN McpToolRouter` — "addressed something that does not exist: …" | ~65 | Agent-side mistakes (missing `parentId`, missing `view`, unknown entity). Wording is misleading for "Field '…' is read-only … cannot be written" (16) and "Entity … does not enable POST" — those are not "does not exist". The child-entity hint has a grammar slip: "the id of the parent its parent record". |
| `WARN McpToolRouter` — "refused for the current role: Access denied to spec …" | 17 | Expected behavior. |
| `WARN McpToolRouter` — "Removed FK sentinel '0' … no sibling value found" | 14 | Worth a look: an agent sending `0` as an FK. |
| Telemetry `status=error` — `neo_vector_search` `VECTOR_COLLECTION_NOT_FOUND` | 4 | No active vector source for the namespace in production. |
| Telemetry `status=error` — report `accounting_schema_unresolved` | 3 | Tenant without a resolvable accounting schema. |
| Stack-trace frames ingested as separate `info` logs (`at com.etendoerp.go.mcp…`) | ~76 | Mostly from §1. Datadog multiline aggregation for the Java source would fold them into their ERROR. |

## 7. Ticket drafts

**Ticket split (decided 2026-10-06).** The T-items below are work items; they ship as two Jira tickets:

| Jira ticket | Contains | Notes |
|---|---|---|
| **1 — MCP fixes and update to spec 2025-11-25** (Task, M/L) | Fixes: T8, T6 (parts A + B), T1, T7, T9 (code part: `clientId` in the telemetry log), T11, plus `sessionKey` on the MCP WARN/ERROR lines. Update: T2 + T3 | One PR, **one commit per T-item**, in this order: T8 → T6 → log items → T2 → T3. The update goes last: announcing 2025-11-25 changes client behaviour (e.g. the header on every request), so if validation with real clients (Claude Code, Cursor, Claude.ai connector) fails, revert only the T2/T3 commits and ship the fixes. If T8 becomes urgent, it can be cut into its own PR |
| **2 — MCP stateless mode (spec 2026-07-28)** (Spike → implementation, later) | T5 | Schedule when the T1 WARN lines show a major client no longer falls back to `initialize` |
| — | T4 | Discarded |
| — | T9 investigation part | No ticket: with `clientId` in the log the next occurrence identifies itself |
| — | T10 | Out of scope (2026-10-06): infra, not this team. Kept below for reference only |

Order: **1 → 2**.

Drafts only — not created in Jira. Titles follow the Git Police character rules (no quotes,
backticks, `$`). Owner = the agent of `CLAUDE.md` that would take it.

### T1 — Log unknown MCP methods as client errors, not server errors
- **Type:** Task · **Repo:** `com.etendoerp.go` · **Owner:** schema-forge-developer + tester-go · **Size:** S
- **Context:** §1, §2, §5.0. ~568 ERROR logs/week with stack trace for `server/discover` and
  `resources/templates/list`; the client already gets a correct `-32601`.
- **Scope:** dedicated `catch (McpMethodNotFoundException e)` in `McpServlet`, placed before the
  generic `catch (Exception e)` (`McpServlet.java:182`). Answers `-32601` exactly as today.
  Telemetry untouched — unknown methods never reach `recordToolCall` (§2).
- **Log (decided 2026-10-06): `WARN`, one line, no throwable.** Include the method and, when
  available, the client name, e.g.
  `MCP client called unsupported method 'server/discover' (client=claude-code)`.
  Client name source: the telemetry session (`McpUsageTelemetry.clientInfo(sessionKey)`) when the
  client already ran `initialize`; otherwise `params._meta["io.modelcontextprotocol/clientInfo"].name`,
  which 2026-07-28 probes such as `server/discover` carry; else `unknown`. Never log the full body.
- **Tests:** extend the existing `-32601` cases in `McpServletTest.java` (≈ lines 487, 552, 671,
  688) — no new test file. Assert: code `-32601`; no ERROR-level event; one WARN containing the
  method name; client name taken from `_meta` when there is no session.
- **Out of scope:** implementing `server/discover` (T5) and `resources/templates/list`.
- **Acceptance:** unknown method → JSON-RPC `-32601`; no ERROR log line, no stack trace; Datadog shows no new `Error processing MCP message: Method not found` after deploy.

### T2 — Negotiate the MCP protocol version and move to 2025-11-25
- **Type:** Task · **Repo:** `com.etendoerp.go` · **Owner:** schema-forge-developer + tester-go · **Size:** M
- **Context:** §5.1. `initialize` ignores the client's `protocolVersion` and always answers
  `2024-11-05`, while already returning 2025-era `serverInfo` fields (`title`, `websiteUrl`, icons).
- **Code today (read 2026-10-06):**
  - `PROTOCOL_VERSION = "2024-11-05"` (`McpServlet.java:75`) is returned by `initialize`
    (`:540`) and by the informational `GET` (`:332`).
  - The only headers read are `Authorization` and `Mcp-Session-Id`; `MCP-Protocol-Version` is
    never read.
  - CORS allow-list (`setCorsHeaders`, `:103-107`) is `Content-Type, Authorization, Accept,
    Mcp-Session-Id, X-Go-CSRF` — **`MCP-Protocol-Version` missing**, so a browser-based client
    (e.g. MCP Inspector) that sends it fails the preflight once it is required.
  - Notifications answer `204 No Content` (`:160`); since 2025-03-26 the spec says `202 Accepted`.
  - `GET /sws/mcp` answers an informational JSON; per Streamable HTTP a server without an SSE
    stream MUST answer `405 Method Not Allowed` (scope item 8).
- **Scope:**
  1. Supported set `2024-11-05`, `2025-03-26`, `2025-06-18`, `2025-11-25`; latest = `2025-11-25`.
  2. `initialize`: if the client's `protocolVersion` is in the set, answer it; otherwise answer
     the latest (lifecycle rule). Remember the negotiated version per session.
  3. Read `MCP-Protocol-Version` on every non-`initialize` POST. Missing → assume `2025-03-26`
     (spec fallback). Unsupported value → **lenient (decided 2026-10-06)**: serve the request
     with the session's negotiated version (or the latest) and log one `WARN` line with the
     received value and client name. Switches to strict `400` in T5, where 2026-07-28 era
     detection depends on it.
  4. Add `MCP-Protocol-Version` to the CORS allowed headers.
  5. Notifications → `202 Accepted`.
  6. Add `description` to `serverInfo`.
  7. Audit SEP-1303: input-validation failures are tool execution errors (`isError: true`),
     never JSON-RPC errors.
  8. `GET /sws/mcp` → `405 Method Not Allowed` (included 2026-10-06 — a spec MUST for a server
     without an SSE stream). Keep `GET /.well-known/oauth-protected-resource` working: it shares
     `doGet` (`McpServlet.java:321-325`).
- **Acceptance:** tests per supported version, unsupported version in `initialize` (answers
  latest), header missing, header unsupported (served + WARN, not 400); CORS preflight with the header passes; `GET /sws/mcp` → `405` while the `.well-known` metadata
  still answers; Claude Code
  and Cursor still connect.

### T3 — Add tool annotations to the MCP tools
- **Type:** Task · **Repo:** `com.etendoerp.go` · **Owner:** schema-forge-developer + tester-go · **Size:** S
- **Context:** §5.1 (2025-03-26). No tool declares `annotations` today: `tools/list` emits only
  `name`, `title`, `description`, `inputSchema` (`McpServlet.java:596-602`), and
  `McpToolDefinition` has no annotations field.
- **Spec defaults that drive the design:** `readOnlyHint=false`, **`destructiveHint=true`**,
  `idempotentHint=false`, `openWorldHint=true`. Annotating only the readers would leave
  `etendo_create` reported as destructive, so every tool gets an explicit set.
  `openWorldHint=false` on all tools (everything stays inside the ERP).
- **Classification (decided 2026-10-06):**

  | Tool | readOnly | destructive | idempotent |
  |---|---|---|---|
  | `etendo_list/get/schema/discover/selectors/defaults`, `docs`, `etendo_widget`, `etendo_vector_search`, `etendo_get_image_upload`, `generate_*` reports | true | false | true |
  | `etendo_create`, `etendo_request_image_upload`, `etendo_upload_image`, `etendo_feedback` | false | false | false |
  | `etendo_delete` | false | true | true |
  | `etendo_update`, `etendo_batch`, `etendo_action`, process tools (`complete_order`…), `etendo_generate_amortization_plan` | false | **true** (conservative default) | false |

- **No `MCP_CONFIG` override (decided 2026-10-06).** Considered and dropped: annotations are per
  *tool*, so an override could only reach the 1:1 tools (process tools, `generate_*`), never the
  shared `etendo_update` / `etendo_batch` / `etendo_action`. Not worth a new config section; the
  classification above is fixed in code.
- **Tests:** `tools/list` carries the four hints on every tool; a test pins the read-only set so a
  new tool must take an explicit position.

### T4 — ~~Reject MCP requests with an invalid Origin header~~ — DISCARDED (2026-10-06)
- **What the spec says:** 2025-11-25 requires a `403` for an invalid `Origin` on Streamable HTTP
  (DNS-rebinding guard).
- **Why discarded:** MCP traffic comes from clients (Claude Code, Cursor, the Claude.ai / ChatGPT
  connectors), which send no `Origin`. The rule protects mainly *local* MCP servers (`localhost`),
  where a malicious page in the user's browser can reach the server without credentials. Ours is
  remote and Bearer-authenticated, so such a page has nothing to use. No real risk mitigated.
- **Facts kept for whoever reopens it:** today a disallowed `Origin` only gets no CORS headers and
  the request is still processed (`CorsUtils.apply`, `common/CorsUtils.java:77`); the allow-list
  logic already exists (`CorsUtils.isAllowedOrigin`, `etgo.allowed.origins`). Reopen only if the
  MCP ever runs locally or an external conformance check requires it.

### T5 — Spike: dual-era MCP server with 2026-07-28 stateless support
- **Type:** Spike · **Repo:** `com.etendoerp.go` · **Owner:** schema-forge-developer · **Size:** M (design only)
- **Context:** §3, §4, §5.2. Implementing `server/discover` alone would declare the server modern.
- **Facts the design starts from (read 2026-10-06):**
  - Auth is already per request (Bearer, `McpServlet.authenticate`) — nothing auth-related lives in
    the handshake.
  - The handshake carries only telemetry: `handleInitialize` calls
    `McpUsageTelemetry.openSession(params)` and publishes the key in `Mcp-Session-Id`
    (`McpUsageTelemetry.HEADER_SESSION_ID`); `doPost` reads it back on every call
    (`McpServlet.java:145-146`) and `recordToolCall` resolves `clientInfo` from it.
  - Tool calls already work without `initialize` (a client that ignores the header "still works",
    per the `handleInitialize` Javadoc) — they just lose the client name and task grouping.
- **Deliverable:** design doc that answers:
  1. Era detection on HTTP: what marks a request as modern (`MCP-Protocol-Version: 2026-07-28`
     header / `_meta.protocolVersion`) and the exact legacy fallback (`400` without a modern error
     body) — this is where T2's lenient header policy turns strict.
  2. Telemetry without sessions: client name from each request's `_meta.clientInfo`; what replaces
     the session key for task grouping (B1) — candidate: a client-supplied id in `_meta`, or
     accept per-call rows only for modern clients.
  3. Response changes: `resultType: "complete"` everywhere; `ttlMs` / `cacheScope` on
     `tools/list`, `resources/list`, `resources/read`; deterministic `tools/list` order; modern
     error codes (`UnsupportedProtocolVersion` `-32022`, resource-not-found `-32602`).
  4. Methods: `server/discover` added; `ping` and `initialize` legacy-only.
  5. Implementation ticket breakdown and test plan (both eras against one servlet).
- **Depends on:** T2. **Trigger to schedule it:** the T1 WARN lines show which clients probe
  `server/discover`; when a major client (Claude, Cursor, ChatGPT) stops falling back, it is due.

### T6 — Fix unresolvable MCP parent scope for payment Lines and Transaction Adjustments
- **Type:** Bug · **Repo:** `com.etendoerp.go` · **Size:** S + S (two independent parts)
- **Context:** §6. 118 WARN/week from `McpParentScope.java:517`, still active on 2026-10-06. Besides
  the log noise, `etendo_discover` / `etendo_schema` publish these entities with `configError` /
  `parentProblem`, so the agent is told the parent cannot be determined.
- **Entities (verified in the local DB, 2026-10-06):**

  | Spec / entity | Table | Parent tab table | Existing `MCP_CONFIG` |
  |---|---|---|---|
  | `payment-in` / `finPaymentScheduleDetail`, `payment-out` / `lines` | `FIN_Payment_ScheduleDetail` | `FIN_Payment` | `verbs`: create/update/delete off |
  | `product` / `transactionAdjustments` | `M_Transaction_Cost` | `M_Costing_Transactions_HQL` | `verbs`: create off |

- **Part A — Transaction Adjustments: config only.** `M_Costing_Transactions_HQL` is an HQL table
  whose id is `trx.id`, i.e. the `M_Transaction` id, and the child has `inventoryTransaction`
  (`M_Transaction_ID`). A declared `parent.field` wins over the heuristic and a target mismatch is
  only a `debug` line (`McpParentScope.declaredScope`, `:446-466`). Fix: add
  `"parent": {"field": "inventoryTransaction"}` to the entity's `MCP_CONFIG`, then
  `export.database`. **This also fixes a silent read bug:** the tab's where clause is
  `costAdjustmentLine != null` with no parent placeholder, so today `etendo_list` with a `parentId`
  is not filtered by the parent at all (reads are served "without a parent gate" when the scope is
  unresolvable — `McpParentScope` Javadoc, `:95-97`). Owner: window-agent.
- **Part B — payment Lines: needs a small code change, not config.** The only link is two hops
  (`FIN_Payment_Detail_ID` → `FIN_Payment`), and `parent.field` accepts a direct FK only. Reads are
  nevertheless scoped correctly today: the tab's HQL where clause is
  `exists (select 1 from FIN_Payment_Detail pd where pd = e.paymentDetails and pd.finPayment.id = @FIN_Payment_ID@)`,
  and `NeoParentTabFilterResolver.resolveTabWhere` fills `@FIN_Payment_ID@` from `parentId` on
  the MCP channel too (ETP-5542). So the data is right; only `McpParentScope` does not recognise
  that shape. **Decided 2026-10-06:** when no link column resolves but the tab's where clause
  contains a parent placeholder, classify the scope as resolved-by-tab-where (reads gated on
  `parentId`, writes stay refused) instead of `UNRESOLVABLE`. Structural rule — tab metadata, no
  entity names — so it fits the shared-code criterion. `mode: unparented` is **not** an option: it
  would declare reads global, which they are not. Owner: schema-forge-developer + tester-go.
- **Acceptance:** no `Parent scope unresolvable` WARN for these three entities; `etendo_schema`
  shows no `parentProblem`; `etendo_list` with `parentId` returns only that parent's rows (payment
  lines of one payment; adjustments of one transaction).

### T7 — Clarify MCP routing error messages that are not about missing things
- **Type:** Task · **Repo:** `com.etendoerp.go` · **Owner:** schema-forge-developer + tester-go · **Size:** S
- **Context:** §6. `McpToolRouter.java:226` logs **every** `McpRoutingException` as "addressed
  something that does not exist", whatever its error code. In production that line also carries
  read-only fields (`read_only_field`, 16/week), entities that do not enable a write method,
  missing `view`, missing `parentId` (`parent_required`).
- **Scope:**
  1. Log line built from the exception's error code, e.g.
     `MCP tool 'etendo_update' rejected (read_only_field): Field 'x' is read-only on entity 'y'`.
     Same level (WARN), same single line.
  2. Child-entity hint (`McpRoutingException.java:581-583`): when the parent name is unknown the
     sentence renders "the id of the parent its parent record". Build it as "the id of its parent
     record" in that case.
  3. Agent-facing envelope (`buildRoutingErrorBody`) unchanged.
- **Acceptance:** one test per routing error code asserting the log wording; hint reads correctly
  with and without a known parent name.

### T8 — Do not strip 0 from foreign keys where 0 is a real record
- **Type:** Bug (to confirm at runtime) · **Repo:** `com.etendoerp.go` · **Owner:** schema-forge-developer + tester-go · **Size:** S
- **Context:** §6. `McpWriteRequestSupport.resolveFkSentinels` (`:607-646`) treats `"0"` in any FK as
  "not yet determined": it copies a sibling FK to the same entity or, failing that, **removes the
  field** (WARN `Removed FK sentinel '0'`).
- **Production evidence (Datadog, 2026-09-29 → 2026-10-01, 14 WARN):** 13 × `attributeSetValue`
  (`M_AttributeSetInstance_ID`), 1 × `organization` (`AD_Org_ID`).
- **The problem:** for those two targets `"0"` is not a placeholder, it is a real record —
  `M_AttributeSetInstance` `'0'` ("no attributes") and `AD_Org` `'0'` (`*`) exist in every Etendo
  database (verified locally). Stripping them turns an explicit value into `null` / the default
  org. Locally `M_InOutLine` holds both `'0'` (1 631 rows) and `null` (6 944) for the ASI, so the
  model tolerates both — but whether stock, reservations and costing treat them the same must be
  verified before calling the ASI case harmless. The `organization` case can write a record to an
  org the agent did not ask for.
- **Scope:** (1) reproduce on a create with `attributeSetValue: "0"` and `organization: "0"`
  and record what is persisted; (2) if confirmed (**fix decided 2026-10-06**), keep `"0"` when it resolves to an existing
  record of the target entity, apply the sentinel logic only otherwise. Structural (existence
  check), no entity names. (3) Align `McpSchemaFieldBuilder.addDefaultExpression` (`:848-866`),
  which tells the agent a `"0"` default is never a usable value.
- **Acceptance:** repro test first (failing), then fix; `"0"` on ASI / org persisted as `"0"`;
  the `C_DocType_ID` ← `C_DocTypeTarget_ID` sentinel case still resolved.

### T9 — Production tenant issues seen through MCP: vector source and accounting schema
- **Type:** Task (tenant) · **Owner:** tenant-fixer · **Size:** XS–S · **Priority:** low
- **Evidence (Datadog, last 14 days):** one burst each, nothing since —
  - `neo_vector_search` → `VECTOR_COLLECTION_NOT_FOUND` ×5, 2026-09-29 14:39–14:40, no client name.
  - `generate_profit_loss`, `generate_report_trial_balance`, `generate_balance_sheet` →
    `accounting_schema_unresolved` ×3, 2026-09-29 15:05, client `claude-code`.
- **Gap:** the telemetry log line carries no tenant, so the client is not identifiable from
  Datadog. The tenant is in the MCP usage rows (`McpUsageRow.clientId`) in the production DB.
- **Scope:** look the tenant up in the usage table at those timestamps; decide whether it is an
  onboarding gap (preventive fix: every tenant gets a vector source / an accounting schema) or a
  one-off test tenant (no action). **Decided 2026-10-06:** add `clientId` (the AD id, not a name) to
  the telemetry log line (`LogNeoTelemetrySink`) so the next occurrence is identifiable from
  Datadog alone.

### T10 — Fold Java stack traces into one Datadog log entry — OUT OF SCOPE (infra, not this team)
- **Type:** Task (infra) · **Owner:** infra · **Size:** XS
- **Context:** §6. Stack traces arrive one line per entry, status `info`, detached from their
  ERROR. Pipeline (from the log attributes): ECS `awslogs` driver → CloudWatch
  (`/ecs/etendo-production`) → Lambda `etendo-datadog-forwarder` → Datadog. The `awslogs` driver
  emits one CloudWatch event per stdout line, so the split happens before Datadog.
- **Scope:** in the ECS task definition's log configuration set
  `awslogs-datetime-format: "%Y-%m-%d %H:%M:%S,%f"` (or `awslogs-multiline-pattern:
  "^\d{4}-\d{2}-\d{2} "`) so lines not starting with a timestamp join the previous event.
  Alternative: JSON log layout in Log4j2.
- **Acceptance:** a stack trace arrives in Datadog as a single ERROR entry with the frames inside.

### T11 — Surface agent feedback in Datadog with a pointer to its usage row
- **Type:** Task · **Repo:** `com.etendoerp.go` · **Owner:** schema-forge-developer + tester-go · **Size:** S
- **Context (read 2026-10-06):** an `etendo_feedback` report is stored in the DB as the payload of
  its `ETGO_MCP_USAGE` row (`McpServlet.recordToolCall` → `McpFeedbackTool.payloadFor`), and the
  only log line is `etendo_feedback accepted for session {}` (`McpFeedbackTool.java:120`) — Datadog
  sees that a report arrived, not what it says nor where to find it. Getting something into
  Datadog needs no library: everything logged goes stdout → CloudWatch → `etendo-datadog-forwarder`
  → Datadog.
- **Decision (2026-10-06):** the report stays in the DB (source of truth). Datadog gets one `INFO`
  line with the essentials and the `ETGO_MCP_USAGE` id, so whoever spots it in Datadog reads the
  full report from the DB. No free text in the log (the report fields are agent-written free text
  that can carry tenant data).
- **Log line (shape):**
  `MCP feedback received: usageId=<ETGO_MCP_USAGE_ID> session=<sessionKey> clientId=<AD_Client_ID>
  client=<clientName> frictions=<n> failures=<n> wasted=<n> suggestions=<n> tools=[...]`
  — counts per section and the tool names involved, nothing else from the payload.
- **Code change needed:** the row id does not exist when the line would be logged — it is generated
  inside the async writer at insert time (`McpUsageLogger.java:371`, `SequenceIdData.getUUID()`).
  Generate it when the row is built (`McpUsageRow` gains an `id`), use it in the insert, and log
  it from `recordToolCall` once the row is enqueued.
- **Known edge:** the writer can drop a row (queue full, insert failed — `noteDrop`). The log line
  then points at a missing id; the drop already logs its own WARN. Accepted.
- **Correlation:** filter Datadog by `session=<sessionKey>` to see the session's WARN/ERROR lines
  next to its feedback. Full value needs the MCP WARN/ERROR lines to carry the session key too —
  check when doing T1/T7, which touch those lines.
- **Acceptance:** an accepted report produces exactly one INFO line with a `usageId` that matches
  the stored row; a rejected or rate-limited report logs no such line; no payload text in the log.
