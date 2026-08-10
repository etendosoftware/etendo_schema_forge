# MCP Evaluation

Everything about measuring and improving the **Etendo GO MCP server** as an agent-facing product:
the benchmark against a reference vendor MCP (Holded), the IMP-* improvement backlog, the MARI
readiness index, and one working file per improvement.

Refresh the measurement with the `/mcp-comparison` skill. **Never** write a status anywhere except
the registry.

## Layout

| Path | Role |
|---|---|
| [`mcp-improvements-registry.md`](mcp-improvements-registry.md) | **The registry — single source of truth.** Every IMP-* item with status, priority, class, repo, points, cohort and evidence pointer · **MARI** (§2.1–2.3) · M5 diagnostics (§2.4) · probe surfaces (§2.5) · **ACE** context-cost index (§2.6) · changelog (§4). The only file where a status may change |
| [`mcp-comparison-holded-vs-etendo-go.md`](mcp-comparison-holded-vs-etendo-go.md) | **The baseline benchmark.** Architecture contrast, tool/spec inventories, coverage matrix, and each item's `BEFORE`/`AFTER`/`Done when:` specification. Reference material |
| `mcp-comparison-post-audit-<date>.md` | **One run report per execution.** Live evidence rows, defects, new proposals, preference verdict, M1–M4, and the delta against the registry. **Must end with a closing snapshot** — current MARI broken into its four components, plus every registered item grouped Resolved / Pending P1 / Pending P2 with a one-sentence description each, so the report reads standalone. Read-only restatement of the registry; canonical example is the 2026-08-10 report §10 |
| [`imps/`](imps/) | **One working file per improvement.** Written while the item is being worked, not before |

### Run reports

| Date | Report | Headline |
|---|---|---|
| 2026-08-05 | [`mcp-comparison-post-audit-2026-08-05.md`](mcp-comparison-post-audit-2026-08-05.md) | Baseline. Registered IMP-11…IMP-15. **MARI 28** |
| 2026-08-06 | [`mcp-comparison-post-audit-2026-08-06.md`](mcp-comparison-post-audit-2026-08-06.md) | Full-coverage run: all 6 probe surfaces closed, M1/M2 re-measured on the frozen suite, IMP-16…IMP-21 registered, quota re-based 73 → 97. **MARI 28 → 49** |
| 2026-08-10 | [`mcp-comparison-post-audit-2026-08-10.md`](mcp-comparison-post-audit-2026-08-10.md) | IMP-15 wave verification, write-probe mode. First run where the number moved because the *product* moved: M2 40 % → 80 %, M1 2.1× → 1.4×. IMP-15 / IMP-10 / IMP-25 resolved; IMP-11 / IMP-12 / IMP-14 / IMP-16 advanced; IMP-22…IMP-25 registered, consuming the last of the quota (97/97). Two new P1s: **IMP-23** (`neo_batch` not atomic) and **IMP-24** (silent date corruption on write). Flags that the frozen suite now flatters the product (§6). **MARI 49 → 73 — KR met** |

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
| IMP-7 | [`imps/IMP-7.md`](imps/IMP-7.md) | The registry's one-line evidence cell bundles two defects of very different cost. **Half A** — a default resolved to `""` reported in `confirm` as if settled (`partnerAddress` on `sales-invoice/header`, with `metadata.unresolvedFields` empty) — root-caused to `apply()` classifying by key and never looking at the value, and to `NeoDefaultsService` populating `unresolvedFields` only from `catch` blocks. Fixed by routing blank `confirm` members into `unresolvedFields`, with the blank predicate shared with IMP-12 so the two views cannot drift. **Half B** — 7 localization compliance keys surviving `view:"minimal"` — is *not* a quick win: they are `editable` and structurally indistinguishable from a legitimate `confirm` member, so separating them needs a module-ownership criterion (a design decision, with three options weighed). Recommends splitting B out so A can be credited. Registry row stays ⚠️ until a `/mcp-comparison` run probes it |
| IMP-11 | [`imps/IMP-11.md`](imps/IMP-11.md) | Writer fixed (core `0c3f13d2b`) and backfill verified live on `etendo-go-local`; registry row stays ⏳ until the M2 measurement + staging re-verification |
| IMP-12 | [`imps/IMP-12.md`](imps/IMP-12.md) | Implemented and probed live twice (§9–§11): −89.1 % on `sales-invoice/header`, and the "omitting `view` changes nothing" half proved by `diff`. The specified filter rule was measured **wrong** (drags in 3 `readOnly` fields) and corrected to `editable ∧ mandatory ∧ no-default`. The probe then found `required` over-reporting 4 of 6 — `AD_Column.DefaultValue` is an incomplete proxy — so the view now cross-checks against `neo_defaults` (§12) — whose first attempt probed as a no-op because it read the wrong level of the response body (§13.1), re-fixed and confirmed live at 2 / 22 on two windows (§14). `fields:[…]` + `unknownFields` verified ✅ (§13.2). **6 of 7 done-when ✅ on local**; the last is a release. §14.3's divergence resolved by decision (option 3 — document the full dump's `userRequired` as a static approximation; no new IMP). §15 records a defect of the projection itself: on an uncurated entity `view:"create"` returns empty **and** its `hint` tells the agent not to look further — 89 of 230 MCP-exposed POST-able entities are in that state, 85 of them auxiliary sub-tabs that should lose `ispost` rather than be curated. Registry row stays ⏳ until a `/mcp-comparison` run re-measures M1/M2 |
| IMP-16 | [`imps/IMP-16.md`](imps/IMP-16.md) | Root-caused and **implemented** (§6) — not compiled, not deployed, verification owed (§7). The registry cell understates it three ways: there are **three** formats not two, `dd-MM-yyyy` is the *baseline* (not the outlier), and the write path does not "misparse" — it succeeds at producing **year 0012**. `@#Date@` never reads a session value: core `Utility.getContext:410` special-cases it to `DateTimeData.today`, whose generated `.xsql` hardcodes `"dd-MM-yyyy"` — so `NeoDefaultsService:719`'s ISO `#Date` override is dead code. The ISO fields are purely ETP-4244's callout return-path normalizer, which is why `sales-order` (no date callouts) is uniformly `dd-MM-yyyy` while the invoice windows are mixed. Silent corruption traced to lenient `JsonUtils.createDateFormat()`, with **neither** NEO coercer (`NeoTypeCoercionHelper`, `McpToolRouterSupport`) carrying a date branch — and it fires even when the agent sends no date, because both write paths re-run `injectMandatoryDefaults`. Fully explains B13's unrelated-field error. Seven hypotheses recorded as killed, including the two-`#Date` theory that held for most of the investigation. Fixed by ISO-out + tolerant-in through one shared `NeoDateFormat` helper applied at three points (defaults response + both write coercers), with unrecognized shapes passed through verbatim and the 422 deliberately phased to a later change; the lenient core parser is left to be raised upstream rather than patched here |
| IMP-18 | [`imps/IMP-18.md`](imps/IMP-18.md) | **Implemented** 2026-08-10 (§5) — not deployed, so C15 is unre-probed and the registry row stays ⚠️. The item was registered as a missing warning; it is really a consistency defect, since `unknownFields` already shipped on `neo_schema` under IMP-12. Two design points are load-bearing and both reject the cheap implementation: validation runs against the spec's **emittable keys** (post-`javaQualifier` rename), not the returned rows — otherwise the check goes silent on an empty result set, which is exactly when a typo makes an agent conclude the data is missing; and `view:"summary"` is deliberately never judged, since an unknown name there would be our bug. Fixing it exposed a second silent drop of the same kind in the supposedly-good path: `fields:["<fk>$_identifier"]` returned a row of nothing but `id`. **Verified live** the same day (§7, six read-only probes): C15 no longer reproduces, and the two design points above are now measured rather than argued — the typo is reported on an empty result set, and `fields:["dateAcct"]` is reported even though that property exists in the DAL, because the spec serves it as `accountingDate` |
