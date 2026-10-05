# Developer mode — report, then fix

Run [`black-box-mode.md`](black-box-mode.md) first; this file adds the code-side inventory, the
constraint, where each fix lives, and the delivery pipeline. Worked example, read it before the
first run: `docs/plans/ETP-5558-treasury-parity-diagnosis.md` (treasury: sales/purchase invoice
payments, payment-in, payment-out). The report goes to `docs/plans/ETP-XXXX-<window>-parity-diagnosis.md`.

## The constraint

REST and SPA behaviour stay unchanged. Fixes live in the MCP layer
(`modules/com.etendoerp.go/src/com/etendoerp/go/mcp/`, `MCP_CONFIG` data) or in contracts the
handler owns (`NeoHandler#actionContracts()`). A fix that must touch REST/SPA (ETP-5558 BUG-4: the
write-off limit enforced only in the SPA) is an exception the **user** accepts explicitly and the
report records under *Decisions*. Every intentional REST↔MCP divergence is declared in
`modules/com.etendoerp.go/docs/neo-headless.md` §4.12.9 in the same change.

## Extra inventory from the code

- Guide: `docs/generated-custom-windows/INDEX.md` → `docs/generated-custom-windows/<window>.md`.
- `artifacts/<spec>/decisions.json → window.*`: `hideCreate`, `hideDeleteWhenComplete`,
  `hideSaveStatuses`, `hideFormCard`, `processOverrides`, `menuActions`, `customComponents`,
  `layoutType`.
- `artifacts/<spec>/custom/*.jsx` and `tools/app-shell/src/windows/custom/<spec>/`: every
  `apiFetch(.../action/<name>)`. A component nothing mounts is dead code, not a capability
  (ETP-5558 `ApplyToInvoices.jsx`).
- The entities' `NeoHandler`s (`@NeoExtension` / `Java_Qualifier`): the actions they serve, and
  which of them have a declared contract.
- `ETGO_SF_ENTITY` method flags (`ISPOST/ISPUT/ISPATCH/ISDELETE`) and `MCP_CONFIG` per entity.

The black-box rows still decide the matrix; the code explains them and finds the actions the UI
reaches but the browser walk missed.

## Fix toolbox

Reference: `neo-headless.md` §4.12.1.3 (declared actions on window entities), §4.12.6
(`MCP_CONFIG` sections and the `parent_unresolvable` gate), §4.12.9 (declared divergences).

| Suggested fix area | Fix | Where |
|---|---|---|
| Hide create / update / delete from MCP | `MCP_CONFIG.verbs` `{create/update/delete:false, reason, instead}` — 405 with `instead` as hint; never widens a flag | entity (or spec) `MCP_CONFIG` |
| Hide action from MCP | `MCP_CONFIG.actions.hidden` + `reason` | entity `MCP_CONFIG` |
| Redirect button to action | `MCP_CONFIG.actions.redirect` (+ `redirectReason`) — listed `invokable:false` with `useInstead` | entity `MCP_CONFIG` |
| An action an agent must never run, whatever the data says | `NeoHandler#agentExcludedActions()` | the handler |
| Declare the action / fix the action contract / narrow the allowed values | `NeoHandler#actionContracts()` → `NeoActionContract` (typed params, required, enums, `withHttpMethod`); merged with AD buttons on window entities, validated before dispatch (422 with correction keys) | the handler (shared support class if several entities serve it) |
| Field curation wrong for agents only | `MCP_CONFIG.fields` (`visibility`, `included`, `readOnly`, `reason`) | field / entity / spec |
| Child write whose parent cannot be mapped | `MCP_CONFIG.parent` when a genuine link exists; otherwise the `parent_unresolvable` gate refuses, and `verbs` hides the write so it is not advertised | entity `MCP_CONFIG` |
| Agent guidance | `ETGO_SF_ENTITY.AGENT_PROMPT` / field `AGENT_PROMPT` — after the machine-readable fix, never instead | entity / field |
| Business rule outside the UI | move the rule into the service the handler calls (single source) — a REST exception, needs the user's acceptance | the service |

Applying `MCP_CONFIG` data: SQL `UPDATE` locally, mirror the value in
`modules/com.etendoerp.go/src-db/database/sourcedata/ETGO_SF_ENTITY.xml` (or the spec/field XML),
assert it in `McpConfigSourcedataTest`, and restart Tomcat — the `MCP_CONFIG` cache loads on
startup. Hide an MCP verb through `MCP_CONFIG.verbs`, never through the `ISPOST/ISPUT/ISPATCH/ISDELETE`
flags: REST and the SPA read them. Only `McpMethodPolicy` reads the write flags on the MCP side.

**Enriched write answers.** When a write action returns an enriched outcome (new outstanding,
credit used, refund created), the outcome is built only after the transaction is known to commit:
check the rollback-only state before answering, and test that a write rolled back answers an error,
never a success.

## Local environment pitfalls

- **Two vite dev servers on `:3100`.** `localhost` resolves to `::1` first, so the browser and the
  MCP may reach different backends. Check `lsof -nP -iTCP:3100` and confirm your calls in the
  Tomcat access log.
- **Accounting period** must be open for the document/payment date, or posting-related steps fail
  for reasons unrelated to parity.
- **After a Tomcat restart** (needed to reload `MCP_CONFIG`) the SPA session and the MCP connection
  drop: log in again, run `/mcp` to reconnect, and redo *Before every probe session*.

## Production data check

When a bug may have written bad data, check production **read-only**:

- Usage: `make mcp-metrics PROFILE=<name>` and `scripts/mcp-usage-dump.sh <profile>` — without
  `--mark-reviewed`, which updates rows — to find which tenants called the affected tool/entity,
  when, and what followed.
- Data: a `SELECT` through `scripts/lib/remote-etendo-psql.sh` (`resolve_remote_target`, then
  `remote_psql -At`) across all tenants, testing the invariant the bug breaks (ETP-5558: no schedule
  detail linking an invoice to a payment of the opposite direction or another partner; amounts
  reconcile).

Record the query, counts and conclusion in the report. Wrong rows go to Remedy
(`cli/src/data-fixes/`), not into this task.

## Plan and pipeline

- Write *Implementation plan* as ordered steps, data corruption first, each with its tests and doc
  update, each fix placed with the toolbox above; close with *Follow-ups*.
- One Jira task per window; branches, Jira and PR through Clerk.
- DEV → REVIEW → QA → DOCS; tests delegated to Tester; docs updated in the same change:
  `neo-headless.md` for engine behaviour, `docs/generated-custom-windows/<window>.md` for the window.
- Commits: `Feature ETP-XXXX: <description>` (≤ 80 chars), no `Co-Authored-By`, hooks never
  bypassed.
