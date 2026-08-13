# MCP Ticket Feedback — Report for the External Validation-Bot Team

**Audience:** the team operating the agentic validation bot that files Etendo GO MCP tickets (external — we do not control its prompt).
**Purpose:** tell them, concretely, what information would make their tickets faster to triage, locate, and fix. Maintained by the `mcp-ticket-resolver` (Tracer) agent — one entry per resolved ticket, plus a distilled rubric they can adopt.

> **How to read this:** the per-ticket log is the evidence; the distilled rubric at the bottom is the actual hand-off — the recommended ticket template, ranked by what we most often had to reconstruct ourselves.

---

## Ticket Quality Rubric (the fields a good MCP ticket carries)

| # | Field | One-line ask to the bot |
|---|---|---|
| 1 | MCP tool called | State the exact tool name (`neo_create`, `neo_selectors`, `generate_<spec>`, …). |
| 2 | Spec / entity (kebab) + header vs lines | Use the name as it appears in `neo_discover`. |
| 3 | **Verbatim JSON-RPC request** | Paste the exact params payload sent. *(highest value)* |
| 4 | **Verbatim response / error** | Paste the exact error code + message or wrong payload. |
| 5 | Auth context (OAuth2 scope, AD role, user/org/client) | Include scope + role used. |
| 6 | Context params (recordContext/parentContext, session vars) | Include any context sent to selectors/defaults. |
| 7 | Contract/spec version + deployed? | State version and whether the spec is pushed (`export.database`). |
| 8 | Environment (instance URL, module commit/branch) | Identify the build. |
| 9 | Expected vs actual | Separate the two. |
| 10 | Minimal repro sequence | Ordered tool calls. |
| 11 | Self-classification hint | Pre-guess: code bug / config / RBAC / missing-module. |

---

## Per-Ticket Log

<!-- Newest first. Template:
### YYYY-MM-DD — ETP-XXXX — <one-line symptom>
- Tool/spec: <neo_create / sales-order header>
- Root-cause category: code-bug | upstream-config | RBAC | missing-module
- Time-to-locate: <fast / slow — why>
- Missing rubric fields: [#3, #5, ...]
- Highest-value field that was missing: <#N — the one that cost the most time>
- Note to bot team: <concrete: "include X next time">
-->

### 2026-07-23 — ETP-4287 — GET-only entities were not explicitly identified in discovery
- Tool/spec: `neo_discover`; entities `bp-stats`, `bp-trend`, and system-data `tax`.
- Root-cause category: **code-bug** (category 1) — discovery already returned the configured `methods` array, but omitted the established MCP `readOnly` semantic flag.
- Time-to-locate: **fast** — the ticket named the discovery builder, the relevant entity configuration columns, and the existing tests. The implementation could derive the flag generically from those configured methods.
- Missing rubric fields: **#3** verbatim JSON-RPC request, **#4** verbatim discovery response, **#5** auth context, **#7** deployment version, **#8** environment/commit, **#10** minimal repro sequence, **#11** root-cause pre-classification.
- Highest-value field that was missing: **#4 — the raw `neo_discover` entity entries.** It would have made the absent semantic flag and the actual `tax` method configuration immediately visible.
- Note to bot team: attach the before/after entity JSON (including `methods`) whenever discovery metadata is the issue. Also distinguish an entity that is *expected* to be read-only from one that the deployed configuration actually makes read-only: local `tax` entries allow writes, so the correct evidence is `readOnly: false`, while the generic rule will label any future GET-only tax entity correctly.

### 2026-07-23 — ETP-4280 — Card financial-account creation reported without a reproducible failure
- Tool/spec: `neo_create` on `financial-account` / `account`; intended minimum fields were `name`, `currency`, and `type: "CA"`.
- Root-cause category: **validator-side / diagnostic gap** (category 5) — the report did not retain the failing request or response, while the deployed code path already accepts `CA`: `FinancialAccountHandler.normalizeType` preserves it and the MCP `neo_create` route invokes that handler before persistence (ETP-4239).
- Time-to-locate: **slow** — there was no verbatim payload, error body, authentication context, deployment version, or reachable local server to distinguish a rejected field/default from an environment or validator failure.
- Missing rubric fields: **#3** verbatim JSON-RPC request, **#4** verbatim response/error, **#5** auth context, **#7** contract/deployment version, **#8** environment/commit, **#10** ordered repro sequence, **#11** root-cause pre-classification.
- Highest-value field that was missing: **#3/#4 — the exact request paired with the complete response.**
- Note to bot team: for every failed `neo_create`, persist and attach the full tool input plus raw MCP result (`isError`, text/body, and transport status when available). For this case, include the actual `currency` id and `type` string sent, since `"CA"` is valid but a missing/invalid currency, duplicate name, stale deployment, or different input cannot be distinguished after a prose-only summary.

### 2026-06-26 — ETP-4274 — `neo_create` drops resolvable defaults for non-mandatory columns (defaults/create asymmetry)
- Tool/spec: `neo_create` (and `neo_defaults`) on spec/entity `assets` header; column `C_Currency_ID` (`required:false`, `defaultExpression:@C_Currency_ID@`).
- Root-cause category: **code-bug** (category 1) — `NeoDefaultsService.injectMandatoryDefaults` iterated mandatory columns only, so genuine non-mandatory defaults that `/defaults` returns were silently dropped on create.
- Time-to-locate: **fast** — the ticket pinpointed the exact file and the offending `!col.isMandatory()` filter, gave a 4-step verbatim MCP repro (`neo_defaults` returns `currency:102`, `neo_create` persists `currency:null`), and named the trigger schema condition (non-mandatory FK with `@C_Currency_ID@` default). No reconstruction needed.
- Missing rubric fields: **none** — tool (#1), spec/entity (#2), verbatim request/response (#3/#4), expected vs actual (#9), minimal repro (#10), and self-classification (#11, code-bug) were all present.
- Highest-value field that was missing: **n/a — exemplary ticket.**
- Note to bot team: **This is the standard, and it carried the single most useful thing a code-bug ticket can have: the file + the exact offending condition, plus a before/after value diff between `/defaults` and `neo_create` on the same payload.** The verbatim `neo_defaults` vs `neo_create` comparison instantly proved the asymmetry and gave us the acceptance test for free. Keep emitting that read-vs-write value diff whenever a value present in one path is absent in the parallel path — it both localizes the bug and defines "done".

---

### 2026-06-24 — ETP-4255 — Remove runtime Jasper report generation; expose only NEO-callable reports
- Tool/spec: `neo_discover` + `generate_<report>` MCP tools and NEO HTTP `/sws/neo/<report-spec>`; report specs (`SPEC_TYPE=R`), e.g. `aging-receivable`, `tax-report`, `inventory-stock-report` (callable) vs. all other R specs (non-callable).
- Root-cause category: **code-bug** (category 1) — runtime Jasper execution (`ReportingUtils.exportJR`) was reachable from the live NEO/MCP request path; it had to be removed and replaced with a stable non-callable response.
- Time-to-locate: **fast** — the ticket enumerated the violating behaviors and pointed at the report path; tracing confirmed Jasper sinks in `NeoReportService`, `NeoProcessReportEndpoint`, `NeoRequestRouter`, and (independently) `McpToolRouter`.
- Missing rubric fields: **none** — ticket carried expected vs actual, the architectural rule (no Jasper at runtime), and concrete acceptance criteria.
- Highest-value field that was missing: **n/a — exemplary ticket.**
- Note to bot team: **This is the standard.** ETP-4255 stated the rule being violated, the expected end-state, and enumerated the specific behaviors to remove — which let us go straight to the code path without reconstruction. One subtlety the ticket got right and most don't: it scoped *out* what was NOT in scope (jsreport integration), which prevented scope-creep. Keep doing exactly this: rule + expected end-state + explicit out-of-scope.
- Resolution note (for our records, not the bot): MCP report tooling was **not** a passthrough mirror of NEO — it carried its own independent Jasper logic — so the fix had to touch both layers, consolidated behind `NeoReportCallability`.

### 2026-06-30 — ETP-4284 — `dashboard` spec "blocked" / widgets invisible to agent (gap G4) — investigation + plan only
- Tool/spec: `neo_discover` + (proposed) `neo_widget`; `dashboard` spec (type `W`) whose 9 widget entities fail with `No AD_Tab linked to entity` via the generic CRUD path.
- Root-cause category: **code-bug** (category 1) — handler-backed, AD_Tab-less entities were misrouted through the CRUD handler; the data handlers work. Fix = wrap them in a `neo_widget` enum tool + exclude `dashboard` from W discovery.
- Time-to-locate: **fast** — the ticket itself supplied the reframing (aggregate page consuming widget endpoints, 9 named handlers, ETP-3584 stabilization) and pointed at `widget-endpoints.md` and the gap doc.
- Missing rubric fields: **none material.** One refinement the ticket *implied but did not state*: the 9 widgets are not `widget-*` specs — they are 9 entities of the single `dashboard` spec, each keyed by `JAVA_QUALIFIER`. We had to confirm this in `ETGO_SF_ENTITY.xml`. Stating "the widgets are entities of the `dashboard` spec" would have saved that lookup.
- Highest-value field that was missing: **n/a — exemplary ticket** (clear scope, out-of-scope, acceptance criteria with evidence, design decisions pre-made).
- Note to bot team: **This is the standard** — like ETP-4255. It reframed the symptom into a precise root cause, named every handler, listed prior stabilization work, and split scope vs out-of-scope. The only nit: when a "blocked spec" is actually a handler-backed/aggregate spec, say so explicitly (spec type + that its entities are handler-backed with no AD_Tab) so the misrouting nature is unambiguous from the ticket alone.

### 2026-07-01 — ETP-4288 — `documentType` schema exposes `defaultExpression="0"` on sales-order/purchase-order — investigation + plan only
- Tool/spec: `neo_schema` (entity `header`) on `sales-order`/`purchase-order`, contrasted with `neo_defaults` on the same entity.
- Root-cause category: **code-bug** (category 1) — `McpToolRouterSupport.addDefaultExpression` (`mcp/McpToolRouterSupport.java:407-412`) echoes the raw `AD_Column.DefaultValue` with no handling of the legacy `"0"` FK sentinel, while the write path (`NeoDefaultsService.applyResolvedDefault` + `DocTypeResolver.resolveDefaultDocTypeId`) already special-cases it. **This corrects a prior misclassification** — the ticket was recorded as `upstream-config` in `mcp-ticket-knowledge.md` during Round 3 triage; tracing the code showed `defaultExpression` is computed live from `AD_Column`, with zero `decisions.json`/`ETGO_SF_FIELD`/generator involvement.
- Time-to-locate: **fast** — the ticket named the exact field, both specs, the exact symptom string, and contrasted it against the correct `neo_defaults` behavior, which pointed straight at the two candidate files it suggested.
- Missing rubric fields: **#3** (verbatim request/response) — the ticket describes the symptom in prose instead of pasting the actual `neo_schema` JSON for the `documentType` field; reconstructing it took one extra MCP round-trip (a single-field paste would have been cheap to include).
- Highest-value field that was missing: #3 verbatim response, but only marginally — the ticket was otherwise close to exemplary.
- Note to bot team: when you've already narrowed a bug to specific candidate files/services (this ticket named `NeoDefaultsService` and "how the schema reports defaultExpression" — both right in spirit), paste the verbatim tool output for the one field in question. That turns a good ticket into a same-pass-resolvable one.

---

## Batch Analysis — Round 3 (2026-06-19, 15 tickets, label `validacion-agentica`)

_Analysis only — these tickets were reviewed against the rubric, NOT resolved. Source for the ranked gaps below._

**Top feedback items for the bot team, ranked by cost:**

1. **Capture the failing call verbatim (rubric #3/#4).** The single most damaging gap. **ETP-4280** (Card financial-account create failed) is a ticket that is *itself about the missing diagnostic*: it carries no error message, HTTP status, or response body, so the root cause is unidentifiable from the ticket alone. The validator must attach the verbatim failing request and the exact response/error.

2. **The validator has MCP access — attach the raw tool output, don't make us reconstruct it.** Several tickets (ETP-4280, ETP-4279, ETP-4278, ETP-4254) carry a hand-added "Confirmación vía MCP" block — exactly the `neo_discover`/`neo_schema`/`neo_selectors` reconstruction we would otherwise do. Its presence proves the *raw bot finding* lacked it. The bot can run that confirmation itself and paste the output.

3. **Pre-classify into the 6 categories (rubric #11) — most findings are NOT product code bugs.** Round 3 breakdown: 7 code-bug, 4 upstream-config, 1 validator-side, 1 test-data-gap, plus 1 opaque and 1 under-specified. Crucially, **ETP-4279 is a defect in the validating bot itself** — it asserted "2 account types" from hardcoded source (`SeedReferenceDataStep.java`) instead of querying `neo_selectors` (which returns 3). The bot should never assert enum/list cardinality from source/docs; it must query the selector at runtime. This category costs us triage time on non-product issues.

4. **Always name the tool (#1), spec/entity (#2), and a minimal repro (#10).** Specificity is wildly uneven. ETP-4274 and ETP-4255 are exemplary (file:line, verbatim repro, enumerated violations) — *this is what good looks like*. **ETP-4242** is the opposite: "no W spec for ERP entities" names no entity, no tool, no repro — nearly un-actionable.

5. **When the origin is a chat (Discord), attach the transcript excerpt.** ETP-4279 and ETP-4242 link a Discord thread as origin but omit the agent conversation that triggered the finding. Include the minimal transcript.

---

## Distilled Rubric — Recommended Ticket Template (THE hand-off)

<!-- Update the ranking as more rounds are analyzed. This is the section we actually send to the bot team. -->

### Top recurring gaps (ranked by cost)
1. **Verbatim failing request + response/error** (rubric #3/#4) — most damaging when missing (ETP-4280).
2. **Raw MCP tool output the validator already saw** (#2/#6) — it has MCP access; paste `neo_discover`/`neo_schema`/`neo_selectors`, don't make us reconstruct it.
3. **Pre-classification into the 6 categories** (#11) — most findings aren't product bugs; one was a bug in the bot itself (ETP-4279).
4. **Tool + spec/entity + minimal repro always named** (#1/#2/#10) — ETP-4242 named none.
5. **Transcript excerpt when the origin is a chat thread.**

### Recommended ticket template the bot could emit
```
Title: [tool] [spec] — [one-line symptom]
MCP tool: neo_create | neo_list | ... | generate_<spec> | <process_spec>
Spec/entity: <kebab-name> (header|lines)
Request (verbatim JSON-RPC):
  { ... }
Response/error (verbatim):
  { "error": { "code": ..., "message": "..." } }
Auth: scope=<neo:write> role=<...> user=<...> client/org=<...>
Context params: recordContext/parentContext=<...>; session vars=<...>
Contract version: <x.y.z>  Deployed: yes/no
Environment: <instance URL>  module commit: <sha/branch>
Expected: <...>
Actual: <...>
Repro sequence:
  1. ...
Suspected category: code-bug | config | RBAC | missing-module
```
