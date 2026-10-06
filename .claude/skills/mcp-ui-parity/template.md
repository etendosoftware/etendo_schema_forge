# <TICKET> — MCP <window> capability parity

Parity report for the *<window>* window. It is filled in as each capability is reproduced, first in
the UI and then through MCP.

## Origin

What triggered the check: an agent failing in production (tool calls, counts, dates), a support
report, or a planned parity pass. Quote the failing calls.

## Principle

- **Capability parity, not route parity.** The MCP must let an agent do everything the UI lets a
  person do; the route may differ when that is better for an agent.
- **The MCP surface equals the UI surface — both ways.** What the UI does not offer, the MCP does
  not expose.
- **The advertised surface is honest.** An agent reading only the MCP's own tools must reach the
  right route and never believe it can do something it cannot.

## Decisions (YYYY-MM-DD)

| Topic | Decision |
|---|---|
| Row N — <capability> | <decision of the user, dated> |

## Method

For every capability: reproduce it in the UI (Playwright) and capture the network calls; then
through the MCP the way an agent would (discover first, then act); record the result and every
friction; re-read the record to confirm the outcome.

| Item | Value |
|---|---|
| Instance (UI and MCP) | <URL — confirmed the same for both> |
| Tenant / user / role | <…> — MCP identity checked with `neo_list` on <record> |
| Tool schemas loaded | <time; reloaded after each reconnect> |
| Windows / specs covered | `<spec>`, … |
| Safe-testing | read-only first; writes approved by <who> on test data below |

Test data (setup, not measured) and its cleanup:

| Record | Id | Cleaned up |
|---|---|---|
| <record> | `<id>` | yes / no — <why> |

## Capability matrix

Legend: ✅ works · ⚠️ works with friction · ❌ not possible · ⏳ pending.
MCP notes say whether the route is **discoverable** or **hidden** (reachable only if known).

| # | Capability | UI | MCP | Notes | Suggested fix area |
|---|---|---|---|---|---|
| 1 | <capability> | ✅ | ⚠️ | <document numbers, hidden/discoverable, link to evidence> | Declare the action |
| N | <verb or action the MCP offers and the UI does not> | ❌ | must be hidden | <why it is not a UI route> | Hide create from MCP |

## Evidence

### Row 1 — UI, <capability>

Click path, screenshot, then the network calls:

```
POST /sws/neo/<spec>/<entity>/<id>/action/<name>  → <status>
<request body>
→ <response, trimmed>
```

### Row 1 — MCP, <capability>

1. `neo_schema(<spec>, <entity>, view:"actions")` → <what is listed>.
2. `neo_action(...)` → <answer>.
3. Re-read: `neo_get(...)` → <the outcome actually persisted>.

## Bugs found

| Id | Severity | Bug | Evidence | Suggested fix area |
|---|---|---|---|---|
| BUG-1 | Critical — data corruption / High / Medium / Low | <wrong result> | Row N | <area> |

## Surface to hide from MCP (UI does not offer it)

| Spec / entity | MCP advertises | UI route | MCP should |
|---|---|---|---|
| `<spec>/<entity>` | create, update, delete | <none / which> | hide create / hide writes / hide action |

The UI check that justifies each row (state, screenshot, missing button).

## Surface honesty findings

| Check | Finding | Suggested fix area |
|---|---|---|
| Tool enums vs `neo_discover` methods | <…> | <area> |
| `neo_schema view:"actions"` / `view:"create"` | <…> | <area> |
| Writable allocation children | <…> | <area> |
| Cross-window `agentPrompt` contradictions | <…> | <area> |
| `neo_defaults` / `neo_selectors` on hidden creates | <…> | <area> |
| List-backed parameters vs values the UI sends | <…> | <area> |
| Error `detail` / `hint` | <…> | <area> |
| `docs` tool recipes and referenced tools | <…> | <area> |

## Frictions found

| Id | Where | Friction | Impact on an agent | Suggested fix area |
|---|---|---|---|---|
| FR-1 | <tool / action> | <what> | <what the agent does wrong because of it> | <area> |

## Open observations (to verify)

- <observation, struck through with the resolution once checked>

## Production-reported items still to reproduce

- <item from the origin report> → reproduced as BUG-n / FR-n, or still open.

**Data check for BUG-n (YYYY-MM-DD, read-only, authorized by <who>).** What was checked, counts,
conclusion; correction needed or not.

## Open decisions for the product team

1. <question — one per line, in the order they block work>

## Implementation plan (developer mode only)

Ordered steps (data corruption first); each ships with its tests and its doc update.

### Step 1 — <fix>

- What and where, which bug or friction it closes.
- Tests: the refusal or the new behaviour, plus a case that must keep working.
- Docs updated in the same change.

### Follow-ups

- <gap found but out of scope>
