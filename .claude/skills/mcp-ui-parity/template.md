# ETP-XXXX — MCP <window> capability parity: diagnosis

Working diagnosis for ETP-XXXX. It is filled in as each capability is reproduced, first in the UI
and then through MCP, and it becomes the input of the implementation plan.

## Origin

What triggered the check: production MCP feedback (`etgo_mcp_usage_id`, tenant, `client_name`,
agent), a support report, or a planned parity pass. Quote the failing calls and their counts.

## Principle and constraint

- **Capability parity, not route parity.** MCP must let an agent do everything the UI does. The
  route may differ when that is better for an agent; business rules keep a single source
  (`<Service>`).
- **The MCP surface equals the UI surface — both ways.** What the UI does not offer, MCP does not
  expose.
- **REST and UI behaviour do not change.** Every change lives in the MCP layer. Any intentional
  divergence is declared in `com.etendoerp.go/docs/neo-headless.md` §4.12.9. Accepted exceptions
  are listed under *Decisions*.

## Decisions (YYYY-MM-DD)

| Topic | Decision |
|---|---|
| Row N — <capability> | <decision of the user, dated> |

## Method

For every capability:

1. Reproduce it in the UI (Playwright against the local SPA) and record the backend calls.
2. Reproduce it through MCP the way an agent would: discover first (`neo_discover`,
   `neo_schema view:"actions"` / `view:"create"`), then act.
3. Record the result and every friction.

Environment: <server and port verified with `lsof -nP -iTCP:3100` + Tomcat access log>, tenant
*<tenant>* (role *<role>*), accounting period open for <dates>. Specs covered: `<spec>`, …
Base data created through MCP (setup, not measured):

| Record | Id |
|---|---|
| <record> | `<id>` |

## Capability matrix

Legend: ✅ works · ⚠️ works with friction · ❌ not possible · ⏳ pending.
MCP notes say whether the route is **discoverable** or **hidden** (reachable only if known).

| # | Capability | UI | MCP | Notes |
|---|---|---|---|---|
| 1 | <capability> | ✅ | ⚠️ | <document numbers, hidden/discoverable, link to evidence> |
| N | <verb or action the MCP offers and the UI does not> | ❌ | must be hidden | <why it is not a UI route> |

## Evidence

### Row 1 — UI, <capability>

Click path, then the calls:

```
POST /sws/neo/<spec>/<entity>/<id>/action/<name>  → <status>
<body>
→ <answer, trimmed>
```

### Row 1 — MCP, <capability>

1. `neo_schema(<spec>, <entity>, view:"actions")` → <what is listed>.
2. `neo_action(...)` → <answer>.

DB check / Tomcat log when the outcome is in the data or the server warned.

## Bugs found

| Id | Severity | Bug | Evidence |
|---|---|---|---|
| BUG-1 | Critical — data corruption / High / Medium / Low | <wrong result> | Row N |

## Surface to hide from MCP (UI does not offer it)

| Spec / entity | Table | `ISPOST/ISPUT/ISPATCH/ISDELETE` | UI route | MCP should |
|---|---|---|---|---|
| `<spec>/<entity>` | `<table>` | Y/Y/Y/Y | <none / which> | hide create / hide writes / hide action |

Mechanism per row (`MCP_CONFIG.verbs`, `MCP_CONFIG.actions`, `agentExcludedActions`, …) and the UI
check that justifies it.

## Frictions found

| Id | Where | Friction | Impact on an agent |
|---|---|---|---|
| FR-1 | <tool / action> | <what> | <what the agent does wrong because of it> |

## Open observations (to verify)

- <observation, struck through with the resolution once checked>

## Production-reported items still to reproduce

- <item from the origin report> → reproduced as BUG-n / FR-n, or still open.

**Production data check for BUG-n (YYYY-MM-DD, read-only).** Query, counts, conclusion; data-fix
needed or not.

## Implementation plan

All work in ETP-XXXX (`feature/ETP-XXXX` in `schema_forge` and `com.etendoerp.go`). Steps are
ordered (data corruption first); each ships with its tests and its doc update. REST/SPA behaviour
does not change, except the accepted exceptions above.

### Step 1 — <fix>

- What, where (class / `MCP_CONFIG` section / handler contract), which bug or friction it closes.
- Tests: the refusal or the new behaviour, plus a case that must keep working.
- Doc: `neo-headless.md` §…, `docs/generated-custom-windows/<window>.md`.

### Step N — Docs and validation

- One MCP test per matrix row plus the refusals.
- Re-run the originating agent and measure with `make mcp-metrics`.

### Follow-ups outside ETP-XXXX

- <gap found but out of scope>
