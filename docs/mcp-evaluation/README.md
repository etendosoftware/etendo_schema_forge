# MCP Evaluation

Everything about measuring and improving the **Etendo GO MCP server** as an agent-facing product:
the benchmark against a reference vendor MCP (Holded), the IMP-* improvement backlog, the MARI
readiness index, and one working file per improvement.

Refresh the measurement with the `/mcp-comparison` skill. **Never** write a status anywhere except
the registry.

## Layout

| Path | Role |
|---|---|
| [`mcp-improvements-registry.md`](mcp-improvements-registry.md) | **The registry — single source of truth.** Every IMP-* item with status, priority, class, repo, points, cohort and evidence pointer · **MARI** (§2.1–2.3) · M5 diagnostics (§2.4) · probe surfaces (§2.5) · changelog (§4). The only file where a status may change |
| [`mcp-comparison-holded-vs-etendo-go.md`](mcp-comparison-holded-vs-etendo-go.md) | **The baseline benchmark.** Architecture contrast, tool/spec inventories, coverage matrix, and each item's `BEFORE`/`AFTER`/`Done when:` specification. Reference material |
| `mcp-comparison-post-audit-<date>.md` | **One run report per execution.** Live evidence rows, defects, new proposals, preference verdict, M1–M4, and the delta against the registry |
| [`imps/`](imps/) | **One working file per improvement.** Written while the item is being worked, not before |

### Run reports

| Date | Report | Headline |
|---|---|---|
| 2026-08-05 | [`mcp-comparison-post-audit-2026-08-05.md`](mcp-comparison-post-audit-2026-08-05.md) | Baseline. Registered IMP-11…IMP-15. **MARI 28** |
| 2026-08-06 | [`mcp-comparison-post-audit-2026-08-06.md`](mcp-comparison-post-audit-2026-08-06.md) | Full-coverage run: all 6 probe surfaces closed, M1/M2 re-measured on the frozen suite, IMP-16…IMP-21 registered, quota re-based 73 → 97. **MARI 28 → 49** |

## What the `imps/` files are for

A registry row is one line: status, points, an evidence pointer. That is the right size for a
scoreboard and the wrong size for actually fixing something. The run reports, in turn, record what
was *observed* — not what the code turned out to be.

An `imps/IMP-n.md` file holds the third thing: **the investigation**. Where the responsible code
actually lives, what the DB actually contains, which of the competing hypotheses survived contact
with the data, and what the fix therefore has to touch. It is written **while the item is worked**,
so it is empty for every item nobody has opened yet — that is expected, not a gap.

The distinction that matters: a run report may say *"0 of 157 fields carry `visibility`"*. That is an
observation, and it is compatible with several very different root causes. The IMP file is where
those causes get discriminated with evidence, and where a wrong first guess gets recorded as wrong
rather than quietly replaced.

**Conventions:**

- Naming: `imps/IMP-<n>.md`, zero-padding not used (`IMP-11.md`).
- Numbers are permanent. Never renumber, never recycle — the registry, the run reports and the base
  report all cross-reference them.
- The file may contradict an earlier diagnosis. When it does, say so explicitly and keep the
  superseded claim visible with the evidence that killed it. Silent overwrites are how the old
  five-places-status problem started.
- **Status still lives only in the registry.** An IMP file describes the work; it never declares the
  item resolved.

| Item | File | State of investigation |
|---|---|---|
| IMP-11 | [`imps/IMP-11.md`](imps/IMP-11.md) | Root cause found and writer fixed in core `0c3f13d2b`; backfill + deploy pending, so the registry row is still ⏳ |
