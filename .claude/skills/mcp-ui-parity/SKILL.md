---
name: mcp-ui-parity
description: >
  Validate, for one window, that the Etendo GO MCP lets an agent do everything the UI lets a
  person do, and that it hides everything the UI does not offer — then plan the MCP-layer fixes.
  Use when asked for a UI/MCP parity check on a window, when an agent in production cannot do
  something a person does in the SPA (or does something the SPA never offers), when deciding what
  to hide from the MCP, or when auditing whether the advertised MCP surface is honest
  (neo_discover, neo_schema, MCP_CONFIG verbs/actions). Produces
  `docs/plans/ETP-XXXX-<window>-parity-diagnosis.md`.
  Triggers on: "UI MCP parity", "parity check", "paridad UI MCP", "validar paridad",
  "lo que la UI hace el MCP debe poder", "ocultar del MCP", "hide from MCP",
  "el agente no puede hacer lo que hace la UI", "honest surface".
---

# /mcp-ui-parity — UI ↔ MCP capability parity for one window

Worked example, read it before the first run: `docs/plans/ETP-5558-treasury-parity-diagnosis.md`
(treasury: sales/purchase invoice payments, payment-in, payment-out).

## The principle

**Capability parity, both ways — not route parity.**

- What the UI lets a person do, the MCP must let an agent do. The MCP route may differ (one
  `neo_action` instead of a modal's five calls) when that is better for an agent, but business rules
  keep a single source (the service the handler calls).
- What the UI does not offer, the MCP hides. An unvalidated route is where agents corrupt data:
  in ETP-5558 the hand-built payment-out route (`neo_create` header + lines) was no UI route,
  nothing validated it, and a line landed on an unrelated processed collection.
- The advertised surface is **honest**: an agent reading only tool metadata, `neo_discover` and
  `neo_schema` — no docs, no SPA source — must reach the right route, and must never believe it can
  do something it cannot. A clear refusal is the fallback for an agent that ignored the surface, not
  the design.

## The constraint

REST and SPA behaviour stay unchanged. Fixes live in the MCP layer
(`modules/com.etendoerp.go/src/com/etendoerp/go/mcp/`, `MCP_CONFIG` data) or in contracts the
handler owns (`NeoHandler#actionContracts()`). A fix that must touch REST/SPA (ETP-5558 BUG-4: the
write-off limit enforced only in the SPA) is an exception the **user** accepts explicitly and the
diagnosis records under *Decisions*. Every intentional REST↔MCP divergence is declared in
`modules/com.etendoerp.go/docs/neo-headless.md` §4.12.9 in the same change.

## Steps

Copy [`template.md`](template.md) to `docs/plans/ETP-XXXX-<window>-parity-diagnosis.md` and fill it
as you go. One Jira task per window.

### 1. Orient

- Guide: `docs/generated-custom-windows/INDEX.md` → `docs/generated-custom-windows/<window>.md`.
- Specs: the window's spec(s) and every spec the UI reaches from it (treasury touched four:
  `sales-invoice`, `purchase-invoice`, `payment-in`, `payment-out`).
- Environment: see *Environment pitfalls* below; fix each one before measuring anything.

Done when the doc's *Method* section names the specs, tenant, role, server and base-data ids.

### 2. Inventory what the UI offers

Read, per spec:

- `artifacts/<spec>/decisions.json → window.*`: `hideCreate`, `hideDeleteWhenComplete`,
  `hideSaveStatuses`, `hideFormCard`, `processOverrides`, `menuActions`, `customComponents`,
  `layoutType`.
- `artifacts/<spec>/custom/*.jsx` and `tools/app-shell/src/windows/custom/<spec>/`: every button,
  modal and kebab item, and the backend call each makes (`apiFetch(.../action/<name>)`). A component
  nothing mounts is dead code, not a capability (ETP-5558 `ApplyToInvoices.jsx`).
- The entities' `NeoHandler`s (`@NeoExtension` / `Java_Qualifier`): the actions they serve.
- `ETGO_SF_ENTITY` method flags (`ISPOST/ISPUT/ISPATCH/ISDELETE`) per entity.

Done when every UI capability is a matrix row, and every verb or action the MCP advertises that no
UI path uses is a row too (UI cell ❌, MCP cell "must be hidden").

### 3. Measure each row — UI first, then MCP

For every row:

1. **UI** (Playwright against the local SPA): do it as a person would. Record the network calls
   (method, path, body, status, answer) and the resulting record (document number, status).
2. **MCP**, the way an agent without context would: discover first (`neo_discover`,
   `neo_schema view:"actions"` / `view:"create"`), then act with `neo_*`. Note whether the route
   was **discoverable** or only reachable because you already knew it from the SPA.
3. Fill the matrix row: UI ✅/⚠️/❌, MCP ✅/⚠️/❌, hidden or discoverable, and the evidence.

Evidence format: one subsection per row, the exact call and body, the answer (trimmed), a DB query
when the outcome is in the data, the Tomcat log line when the server warned. A claim without a cited
call is not evidence.

Classify every finding as it appears:

- **Bug** — wrong result. Severity: *Critical — data corruption* (wrong rows written), *High*
  (wrong data stored, a business rule bypassed, a capability impossible), *Medium*, *Low*.
- **Friction** (`FR-n`) — works, but an agent stumbles: undiscoverable action, misleading error,
  contract that lies about what the handler reads, shape only learnable from SPA source, silent
  default where the UI asks, terse answer that forces a re-read.
- **Surface to hide** — the MCP advertises or executes what the UI does not offer.

Done when every row has both cells filled with cited evidence, or a recorded reason it cannot be
measured locally (e.g. PIS needs a person to authorize at the bank).

### 4. Audit the surface for honesty

Independent of the rows, read the surface as an agent would and list every place it promises what
the server does not do, or hides what it does:

- Tool metadata: `neo_create` / `neo_update` / `neo_delete` spec enums, tool descriptions.
- `neo_discover`: `methods`, `readOnly`, `actions[]`, `actionsHint`, `configError`, `agentPrompt`.
- `neo_schema view:"actions"`: every action listed, `invokable` / `notInvokableReason` /
  `useInstead` right, discarded AD buttons with a redirect to the real route.
- `neo_schema view:"create"`: required/optional/`serverDefaulted` match what the handler actually
  reads and refuses.
- Error answers: `detail` names what was actually wrong, `hint` names a call that works.
- `docs` tool topics and `etendo-go-docs` agentic pages: no documented route that fails.
- `neo_defaults` / `neo_selectors` on entities that should be hidden: no empty selector or default
  that only works with a parent the entity cannot have.

Done when each item is checked on every spec of step 1 and each lie is a bug, friction or
surface-to-hide row.

### 5. Decide, one question at a time

Product decisions belong to the user: is a capability the UI lacks wanted, or hidden? Is a REST
exception accepted? Ask one question per turn, record each answer with its date in *Decisions*, and
update the matrix row.

### 6. Plan

Write *Implementation plan* as ordered steps, data corruption first, each with its tests and doc
update, each fix placed with the toolbox below. Close with *Follow-ups* outside the task.

## Fix toolbox

Reference: `neo-headless.md` §4.12.1.3 (declared actions on window entities), §4.12.6
(`MCP_CONFIG` sections and the `parent_unresolvable` gate), §4.12.9 (declared divergences).

| Gap | Fix | Where |
|---|---|---|
| A verb the UI never uses (`hideCreate`, no editable header, generic delete the UI never calls) | `MCP_CONFIG.verbs` `{create/update/delete:false, reason, instead}` — 405 with `instead` as hint; never widens a flag | entity (or spec) `MCP_CONFIG` |
| An action/button the UI never offers to an agent's use case | `MCP_CONFIG.actions.hidden` + `reason` | entity `MCP_CONFIG` |
| A discarded/Classic button with a real equivalent | `MCP_CONFIG.actions.redirect` (+ `redirectReason`) — listed `invokable:false` with `useInstead` | entity `MCP_CONFIG` |
| An action an agent must never run, whatever the data says | `NeoHandler#agentExcludedActions()` | the handler |
| A handler action the UI uses that agents cannot discover or call correctly | `NeoHandler#actionContracts()` → `NeoActionContract` (typed params, required/enums, `withHttpMethod`); merged with AD buttons on window entities, validated before dispatch (422 with correction keys) | the handler (shared support class if several entities serve it) |
| Field curation wrong for agents only | `MCP_CONFIG.fields` (`visibility`, `included`, `readOnly`, `reason`) | field / entity / spec |
| Child write whose parent cannot be mapped | `MCP_CONFIG.parent` when a genuine link exists; otherwise the `parent_unresolvable` gate refuses, and `verbs` hides the write so it is not advertised | entity `MCP_CONFIG` |
| Prose the contract cannot express | `ETGO_SF_ENTITY.AGENT_PROMPT` / field `AGENT_PROMPT` — last resort after the machine-readable fix | entity / field |

Applying `MCP_CONFIG` data: SQL `UPDATE` locally, mirror the value in
`modules/com.etendoerp.go/src-db/database/sourcedata/ETGO_SF_ENTITY.xml` (or the spec/field XML),
assert it in `McpConfigSourcedataTest`, and restart Tomcat — the `MCP_CONFIG` cache loads on
startup. Never flip the `ISPOST/ISPUT/ISPATCH/ISDELETE` flags to hide an MCP verb: REST and the SPA
read them. Only `McpMethodPolicy` reads the write flags on the MCP side.

## Environment pitfalls

- **Which server answers the MCP.** Two vite dev servers can both hold `:3100`, and `localhost`
  resolves to `::1` first, so the browser and the MCP may talk to different backends. Check
  `lsof -nP -iTCP:3100` and confirm your calls in the Tomcat access log before trusting a result.
- **Accounting period** must be open for the document/payment date, or posting-related steps fail
  for reasons unrelated to parity.
- **Tenant user.** Log in to the SPA and connect the MCP as the same tenant user and role; a System
  or other-tenant session measures a different surface.
- **After a Tomcat restart** the SPA session and the MCP connection drop: log in again and run
  `/mcp` to reconnect before the next call.
- Base data (accounts, partners, products) may be created through MCP; it is setup, not a measured
  row — say so in *Method*.

## Production data check

When a bug may have written bad data, check production **read-only** before closing it:

- Usage: `make mcp-metrics PROFILE=<name>` and `scripts/mcp-usage-dump.sh <profile>` (never
  `--mark-reviewed` for this — it updates rows) to find which tenants called the affected
  tool/entity, when, and what followed.
- Data: a `SELECT` through `scripts/lib/remote-etendo-psql.sh` (`resolve_remote_target`, then
  `remote_psql -At`) across all tenants, testing the invariant the bug breaks (ETP-5558: no schedule
  detail linking an invoice to a payment of the opposite direction or another partner; amounts
  reconcile).

Record the query, the counts and the conclusion in *Production-reported items*. If rows are wrong,
the corrective fix goes to Remedy (`cli/src/data-fixes/`), not into this task.

## Pipeline

- One task per window; branches, Jira and PR through Clerk.
- DEV → REVIEW → QA → DOCS; each fix ships with its tests (delegated to Tester) and its doc update:
  `neo-headless.md` for engine behaviour, `docs/generated-custom-windows/<window>.md` for the window.
- Commits: `Feature ETP-XXXX: <description>` (≤ 80 chars), no `Co-Authored-By`, hooks never
  bypassed.
