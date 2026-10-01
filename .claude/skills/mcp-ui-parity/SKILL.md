---
name: mcp-ui-parity
description: >
  Validate, for one window, that the Etendo GO MCP lets an agent do everything the UI lets a
  person do, and hides everything the UI does not offer. Two modes: a black-box parity report
  (only an MCP connection + Playwright on the UI, no code needed) and a developer mode that also
  plans the MCP-layer fixes. Use when asked for a UI/MCP parity check or report on a window, when
  an agent cannot do something a person does in the UI (or does something the UI never offers),
  when deciding what to hide from the MCP, or when auditing whether the advertised MCP surface is
  honest (neo_discover, neo_schema, tool enums).
  Triggers on: "UI MCP parity", "parity check", "parity report", "paridad UI MCP",
  "validar paridad", "informe de paridad", "lo que la UI hace el MCP debe poder",
  "ocultar del MCP", "hide from MCP", "el agente no puede hacer lo que hace la UI",
  "honest surface".
---

# /mcp-ui-parity — UI ↔ MCP capability parity for one window

## The principle

**Capability parity, both ways — not route parity.**

- What the UI lets a person do, the MCP must let an agent do. The MCP route may differ (one action
  call instead of a modal's five requests) when that is better for an agent.
- What the UI does not offer, the MCP hides. An unvalidated route is where agents corrupt data: a
  hand-built payment (header + lines through the generic create) was no UI route, nothing validated
  it, and a line landed on an unrelated, already processed collection.
- The advertised surface is **honest**: an agent reading only the tool schemas, `neo_discover`,
  `neo_schema` and the `docs` tool must reach the right route, and must never believe it can do
  something it cannot. A clear refusal is the fallback for an agent that ignored the surface, not
  the design.

## Step 0 — Choose the mode

Look for the repos: a `schema_forge` checkout (`artifacts/`, `docs/generated-custom-windows/`) and
`modules/com.etendoerp.go/`. If neither is reachable, or the user only wants the report, it is
**report mode**. If both are, ask the user which one they want.

| Mode | Needs | Produces | Read next |
|---|---|---|---|
| **Report** (black-box) | MCP connection to an Etendo GO instance + Playwright on its UI | the parity report, with a *suggested fix area* per finding, no fixes | [`black-box-mode.md`](black-box-mode.md) |
| **Developer** | the report-mode needs + both repos | the report, then an implementation plan and the fixes through the pipeline | [`black-box-mode.md`](black-box-mode.md), then [`developer-mode.md`](developer-mode.md) |

Both modes fill [`template.md`](template.md), one report per window.

## Before every probe session

Run these at the start, and again after every MCP reconnect or server restart:

1. **Who is the MCP session.** `neo_list` a record you know belongs to the tenant under test (or
   read the session's tenant/user if the instance exposes it). A reconnect can authenticate as a
   different user or tenant without saying so. Log in to the UI as the same tenant user and role.
   A known record of another tenant answering 404 is a useful isolation check — record it.
2. **Which server answers.** The UI and the MCP must hit the same instance. Compare the base URL in
   the browser's network calls with the MCP's; when local, see the developer-mode pitfalls.
3. **Reload the tool schemas.** Tool enums and descriptions can change with the server; re-list the
   tools after a reconnect and measure against what is published now, not what you remember.

Done when the report's *Method* section names the tenant, user, role, instance URL and the time the
schemas were loaded.

## Safe-testing protocol

1. **Read-only probes first**: `neo_discover`, `neo_schema`, `neo_list`, `neo_get`, `neo_defaults`,
   `neo_selectors`, `docs`, and read actions. Most of the surface audit needs nothing else.
2. **Mutating probes only on test data the user approves**: name the records you will create or
   change and ask before the first write. Use a test tenant or clearly named test records
   (*Cliente Paridad*, *Banco Paridad*).
3. **Clean up**: list everything you created and delete or reverse it (through the route the UI
   uses) at the end; record what could not be undone.
4. **Production**: read-only only, and only when the user explicitly authorizes it for that run.

## Method (both modes)

1. **Inventory** what the UI offers and what the MCP advertises — how depends on the mode file.
   Every UI capability is a matrix row; every verb or action the MCP advertises that no UI path
   uses is a row too (UI ❌, MCP "must be hidden").
2. **Measure each row, UI first, then MCP.** UI: do it as a person would and capture the
   browser's network calls. MCP: as an agent without context would — discover first, then act —
   and note whether the route was **discoverable** or only reachable because you already knew it.
   - **Compare the real UI call, not the obvious one.** The UI often deletes, confirms or edits
     through a dedicated action (`…/action/deletePayment`, a re-sent `registerPayment` with
     `paymentId`) rather than the generic `DELETE`/`PUT`. Read the network call before concluding
     the UI and MCP paths are the same.
   - **Verify every reported success independently.** After a write answers `ok`, re-read the
     record (`neo_get`, the UI) and check the outcome the answer claims. A success for a write
     that did not persist is a bug.
3. **Audit the surface for honesty** (checklist below), independent of the rows.
4. **Classify** every finding: bug (with severity), friction (`FR-n`), or surface to hide.
5. **Decisions** are the user's: is a capability the UI lacks wanted, or hidden? Ask one question
   per turn; record each answer with its date.

Done when every row has both cells filled with cited evidence (or a recorded reason it cannot be
measured, e.g. a bank authorization only a person can give), and every checklist item is checked
on every spec the window reaches.

### Surface honesty checklist

- **Tool enums vs discovery.** The `spec` enums of `neo_create`, `neo_update` and `neo_delete`
  match `neo_discover`'s `methods`: a spec listed in `neo_delete` whose entities are all GET-only
  is a lie.
- **`neo_discover`**: `methods`, `readOnly`, `actions[]`, `actionsHint`, `configError`,
  `agentPrompt` agree with what the UI offers.
- **`neo_schema view:"actions"`**: every action the UI uses is listed and invokable; a discarded
  button points to the real route (`useInstead`); a list-backed button parameter offers only the
  values the UI sends (narrow it otherwise).
- **`neo_schema view:"create"`**: required / optional / `serverDefaulted` match what the server
  actually accepts and refuses.
- **Child entities that hand-write allocations** (payment details, installments, schedule
  details, reservations) offered writable while the UI only writes them through a parent action.
- **Cross-window contradictions**: a button offered on one entity that a related window's
  `agentPrompt` forbids.
- **Hidden create still answered**: `neo_defaults` / `neo_selectors` answering for a create the
  MCP hides, or an empty selector / a default that needs a parent the entity cannot have.
- **Errors**: `detail` names what was actually wrong; `hint` names a call that works.
- **`docs` tool**: every recipe runs as written, and every tool it names exists.

## Installing without the repo

The skill is self-contained for report mode. Copy the folder `mcp-ui-parity/` (all four files) to
`~/.claude/skills/mcp-ui-parity/`, connect the Etendo GO MCP and the Playwright MCP in Claude Code,
and ask for a parity report on a window. `developer-mode.md` is only read when the repos are
present.
