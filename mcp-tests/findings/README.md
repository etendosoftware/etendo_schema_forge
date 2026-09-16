# Findings

Defects in the **Etendo GO MCP product** that a harness run surfaced.

This folder is not the IMP registry and never competes with it. The registry
(`docs/mcp-evaluation/mcp-improvements-registry.md`) remains the single source of truth for an
improvement's **status**; nothing here may declare an item resolved, scored, or prioritised.

What these files are: the raw, dated evidence a run produced, written while it is fresh. A human
decides later whether a finding graduates into an IMP — and if it does, the IMP cites this file.

**Conventions**

- One file per finding: `YYYY-MM-DD-<slug>.md`. No numbers — numbering belongs to IMP-*, and a
  parallel numbering scheme would eventually be mistaken for it.
- Every finding must carry: the run id it came from, the verbatim request and response, and an
  explicit answer to the **UI test** (D22): *could a person do this in the Etendo GO UI?* A finding
  that fails the UI test is a broken probe, not a defect — say so and keep the file as a record of
  the false alarm.
- Record what was **not** verified. An unverified claim stated as fact is how a benchmark loses
  credibility.
