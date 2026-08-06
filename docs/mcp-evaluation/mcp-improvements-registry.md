# MCP Improvements Registry (IMP-*) — single source of truth

**Jira:** ETP-4793 (Epic ETP-3504) · continues ETP-4601 · **Labels:** `plataforma`, `validacion-agentica`
**Scope:** every improvement item ever raised against the **Etendo GO MCP server**
(`com.etendoerp.go/src/com/etendoerp/go/mcp/`) by the Holded-vs-Etendo-GO agentic benchmark.
**Last updated:** 2026-08-06 · **MARI 49** (§2.1)

---

## 0. Why this file exists

Before this registry, an item's status lived in **five** places at once (the base report's §1
delivery line, its §10 bullets, its §12 headings, its `Done when:` strikethroughs, and its wave
tables) — plus a sixth in every post-audit document. They drifted: the base report still claimed
"only Wave 3 remains" after Wave 3 had shipped, and claimed a global ✅ for items that were live on
2 of 246 entities.

**From now on, status lives here and only here.**

| Document | Role |
|---|---|
| **This file** | The registry. ID, title, priority, class, repo, **status**, points, cohort, evidence pointer — plus **MARI** (§2), the metric the OKR is set against. The only place a status may be changed. |
| [`mcp-comparison-holded-vs-etendo-go.md`](mcp-comparison-holded-vs-etendo-go.md) | The **baseline benchmark**: architecture contrast, inventories, coverage matrix, and the full `BEFORE`/`AFTER` specification of IMP-1…IMP-10. Reference material, not a status surface. |
| `mcp-comparison-post-audit-<date>.md` | One **run report** per benchmark execution. Live evidence + the run's deltas against this registry. Never restates a global status. |

A run report's status section is a **delta**, in exactly these three sentence shapes:

```
* Added IMP-15 — contradictory FK contracts across write verbs (P1, ⚙️).
* Advanced IMP-4 — FK-by-name now resolves display names on neo_create; still absent on neo_batch.
* Resolved IMP-6 — actions-only view shipped (McpActionsView, commit bbfce9db).
```

Anything else — "IMP-3 is done", a re-tallied scoreboard, a wave table — belongs here, not there.

A run report **does** carry its own MARI computation (the evidence for the number), but the
authoritative before → after series lives in §2.1 here.

---

## 1. Status vocabulary

| Mark | Meaning | Rule |
|---|---|---|
| ✅ **resolved** | The item's own `Done when:` clause is satisfied by a live call, on the named environment | Requires the verbatim response and the implementing class. A ✅ that holds on a subset of specs is **not** ✅ |
| ⚠️ **partial** | The mechanism shipped; the outcome does not hold everywhere | Must name what is missing and which subset works |
| ⏳ **open** | Specified, not implemented | |
| ❌ **regressed** | Was ✅, no longer holds | Report to a human immediately; never downgrade quietly |
| 🗄️ **withdrawn** | No longer wanted | Keep the row; never recycle the number |

**Numbers are permanent.** `ref §7.x` ↔ IMP-n is a two-way link across three documents — add, never
renumber, never reuse.

**Class:** ⚙️ signature change (arguments or name change) · ♻️ same call (same arguments, different
response shape only). ♻️ items cost nothing to existing integrations and are preferred at equal
leverage.

---

## 2. Metrics

### 2.1 MARI — the single headline number

**MARI (MCP Agent Readiness Index)** is a 0–100 composite. It exists because every count-based
metric in this file shares one defect: **discovering a new IMP makes it worse**, and discovery is
the work. A percentage whose denominator you are still finding cannot be a target.

MARI has four components, each normalized to 0–100 before weighting:

| Component | Weight | Normalization | 2026-08-05 | 2026-08-06 | Contribution |
|---|---:|---|---|---|---:|
| **M2** — first-call success rate | 30 | the percentage itself | 0 % ¹ | **40 %** ² | 12.0 |
| **M1** — calls-to-outcome ratio vs Holded | 30 | `100 / M1` (1.0× → 100) | 2.4× → 42 | **2.1× → 48** | 14.3 |
| **Delivery** — weighted points earned | 25 | `earned / quota` | 29.5 / 73 → 40 | **29.5 / 97 → 30** ³ | 7.6 |
| **Coverage** — probe surfaces exercised (§2.5) | 15 | `probed / 6` | 2 / 6 → 33 | **6 / 6 → 100** | 15.0 |
| | | | **MARI = 28** | | **MARI = 49** |

¹ Measured on the write suite only (2 attempts, 2 FK failures — see Appendix A.5). The read suite
was not scored per call. Flagged at the time as the least solid of the four inputs.

² Re-measured 2026-08-06 across the full frozen 5-task suite, as that flag required: tasks 1 and 3
fail on the first call, tasks 2, 4 and 5 succeed → 2/5. This supersedes the 0 % figure, which was
measured on the product's single worst path. **This is a correction, not an improvement** — no code
changed between the two columns (§2.4).

³ Delivery *fell* while MARI rose. The run registered IMP-16…IMP-21 and the quota was re-based
73 → 97 (§2.2), so the same 29.5 earned points now sit against a larger denominator. Intended
behaviour: registering debt costs Delivery honestly, but at 25 % weight it cannot sink the index.

**Weighting rationale — 60 % outcome / 40 % process.** M1 and M2 measure what happens to the agent
and cannot be moved by moving paperwork. Delivery and coverage are activity: they matter, but if
they dominated the index the incentive would be to close cheap items. With this split, the items
that hurt the agent most (IMP-15 breaks the first call on the documented happy path) score highest
on their own.

Coverage carries its own weight on purpose: **writing new probes is work**, and it is the component
that prevents self-deception. At 2 of 6 surfaces, a high score on the other three would have been
measured over a third of the product. The 2026-08-06 run closed it to 6 of 6 and immediately
justified the weighting: the four newly-probed surfaces yielded 20 points of previously invisible
debt.

### 2.2 The quota rule — why discovery does not dilute MARI

The Delivery denominator is **not** "the IMPs that exist". It is a **quota frozen when the OKR
period opens**: the known scope plus a reserve for what the period will discover.

```
weight(row)   = P1 → 5 · P2 → 3 · P3 → 1
credit(row)   = ✅ 1.0 · ⚠️ 0.5 · ⏳ 0 · ❌ 0 · 🗄️ excluded
earned        = Σ weight × credit
known scope   = Σ weight over all live rows
quota         = known scope at period open × 1.20   (20 % discovery reserve)
```

Period opened 2026-08-05: known scope = 61 (8 × P1 + 7 × P2), quota = 73.

**Re-based 2026-08-06** (first re-base of the period, human-authorised): the 6-of-6 coverage run
registered IMP-16…IMP-21 (+20 points), taking known scope to **81** — an overrun of 8 points past the
73 quota. Quota re-based to **81 × 1.20 = 97**. Because the 1.20 ratio is preserved, the re-base does
**not** move the scope-closed ceiling: it stays at 88 (§2.3). Delivery fell from 40 to 30 on the same
29.5 earned — that drop is the honest price of registering debt, and it is why Delivery is only 25 %
of the index.

Registering IMP-11…IMP-15 spent reserve without diluting the index. IMP-16…IMP-21 exhausted it. The
lesson for the next period: a 20 % reserve is too small for a run that probes a surface for the first
time — the first exhaustive pass on a surface finds more than a 20 % allowance anticipates. Only
overrunning the quota forces a re-base, and that conversation ("we found more debt than budgeted") is
a healthy one, not a number that silently sinks.

A ⚠️ earns **half credit**, deliberately: IMP-4 did ship name resolution on `neo_create`. Scoring it
zero is exactly what made the old count-based metrics feel punitive.

### 2.3 Current value and reachable value

| Horizon | M2 | M1 | Delivery | Coverage | **MARI** |
|---|---|---|---|---|---:|
| Period open (2026-08-05) | 0 % | 2.4× | 29.5 / 73 | 2 / 6 | **28** |
| **Today** (2026-08-06) | 40 % | 2.1× | 29.5 / 97 | 6 / 6 | **49** |
| **Next wave** — IMP-11 + IMP-12 + IMP-15 + IMP-16 resolved, IMP-5 lifted to ✅ (the `neo_batch` envelope ships with IMP-15) | ~75 % | ~1.5× | 52 / 97 | 6 / 6 | **68** |
| **Registry closed** — all 21 ✅, full probe surface, M1 at its target | 90 % | 1.2× | 81 / 97 | 6 / 6 | **88** |

The 2026-08-06 jump from 28 to 49 is **measurement, not shipped product**: no code changed. Coverage
went 2/6 → 6/6 (+10) and M1/M2 were re-measured across the full frozen suite instead of two write
calls (+15), while Delivery *fell* 40 → 30 because the run registered 20 points of new debt. Read it
as "we now know where we stand", not as "the product improved" — the two are different claims and
MARI deliberately lets the second one stay flat.

**88 is the practical ceiling of the current scope**, not 100. Delivery caps at 81/97 = 84 because
unspent discovery reserve is not credit — reaching 100 would require discovering *and* closing
another 16 points of improvements. That asymmetry is intentional: MARI should not read as "finished"
while the reserve is untouched.

The M1/M2 figures in the two forward rows are **projections, not commitments** — they follow from
what each item removes (IMP-15 removes the FK retry loop, IMP-12 removes the 62 kB schema read), but
only a measured run can confirm them.

**As a KR:** `MARI 28 → 68` over the period, with 85 as the stretch. Do not set 85 as the commitment
— it requires closing all twenty-one items *and* holding every surface probed.

> The KR target moved 66 → 68 when the quota was re-based. This is a **correction, not a goalpost
> shift**: the target is defined as "next wave shipped", and the same wave now sits against a larger
> denominator. The 28 baseline is unchanged.

### 2.4 M5 family — diagnostics, not targets

These remain useful for reading *what changed*, and are the inputs to Delivery. They are **not**
KR material, precisely because of the denominator problem MARI solves.

| Metric | Definition | 2026-08-03 | 2026-08-05 | 2026-08-06 |
|---|---|---|---|---|
| **M5 — open items** | count(⚠️) + count(⏳) | 3 of 10 | 10 of 15 | **16 of 21** |
| **M5a — open P1** | the same, restricted to P1 | 0 | 4 | **5** (IMP-1, IMP-11, IMP-12, IMP-15, IMP-16) |
| **M5b — resolved** | count(✅) | 7 | 5 | **5** |
| **M5c — added this run** | new IDs registered | — | 5 (IMP-11…IMP-15) | **6** (IMP-16…IMP-21) |
| **M5d — cohort closure** | `earned / weight`, denominator frozen per cohort | — | C1 74 % · C2 0 % | **C1 74 %** (29.5/40) · **C2 0 %** (0/21) · **C3 0 %** (0/20) |

> **2026-08-06 reads as a pure regression on every count-based line** — open items 10 → 16, added 6,
> resolved flat at 5, a brand-new cohort at 0 %. Yet the run probed four surfaces for the first time,
> re-confirmed the three worst P1 items with live evidence, and raised the honest readiness measure
> from 28 to 49. This is the clearest demonstration so far of **why the M5 family cannot carry a KR**:
> it scores an exhaustive audit as a failure. M5d's frozen cohorts contain the damage (C1 stays at
> 74 % rather than being diluted to 36 %) but cannot fix the direction of travel.

> The apparent regression from 7 resolved to 5 is **not** a code regression. It is the correction of
> two over-credited statuses (IMP-1, IMP-7) and three items whose `Done when:` clause was never
> actually met (IMP-4, IMP-5, IMP-10) — see §4 and the 2026-08-05 run report. No shipped behavior
> broke.

**Correction vs regression.** A correction **re-bases the past column** (with a footnote saying so);
a regression **breaks the series** and is reported to a human as an incident. Never let the two look
like the same fall.

**M5d cohorts** are the count-based answer to the dilution problem: the denominator freezes at the
run that registered the items, so IMP-11…15 open cohort C2 at 0 % instead of diluting C1's 74 %.
Cohort membership is read from §4 — the run that first registered the number.

A run that only flips marks without moving MARI has not improved the product.

### 2.5 Probe surfaces — the Coverage denominator

Six surfaces, fixed. A surface counts as probed when a run recorded a verbatim response from it in
its evidence table. **The list only grows by explicit amendment** — adding a surface is a decision,
not a side effect of a run.

| Surface | 2026-08-05 | 2026-08-06 | Note |
|---|---|---|---|
| Read verbs (`neo_list`/`get`/`schema`/`defaults`/`selectors`/`discover`/`docs`) | ✅ | ✅ | A1–A13; re-run as B1–B9 |
| Write, Etendo (`neo_create`, `neo_batch`) | ✅ | ✅ | W1–W8; `neo_create` re-run as B10–B14. **`neo_batch` not re-probed on 2026-08-06** — not authorised for that run, so IMP-4/IMP-15's `neo_batch` clauses rest on 2026-08-05 evidence |
| Write, Holded (`create_*` / `delete_*`) | ❌ | ✅ | B17–B20 — demo tenant, human-authorised. `create_contact` + `create_sales_order` both succeeded first call |
| `neo_update` | ❌ | ✅ | B15–B16 |
| `neo_action` | ❌ | ✅ | B7 — read-only verification of the 19-action catalog + its `agentPrompt`/`actionValues` contract. Firing a completion/posting action remains forbidden (Step 0); the surface is scoreable without it |
| `neo_widget` + the 8 report generators | ❌ | ✅ | B1–B2 (`neo_widget`), B3–B5 (report generators) |

A low discovery count is only evidence of maturity **at full coverage**. At 2 of 6 it meant four
surfaces had not been looked at — which is precisely how IMP-15 survived two runs undetected. Now at
6 of 6, the corollary applies: **Coverage cannot rise again**, so it is the one component that from
here on can only be lost (by a surface regressing or a new surface being added by amendment). Future
MARI movement has to come from M1, M2 and Delivery — that is, from shipping.

---

## 3. Master table

Environment for all 2026-08-05 statuses: **`etendo-go-local`**, build `c597c7c2`.
`Evidence` points at the run report row that justifies the mark.
`Pts` is `earned / weight` per §2.2 — it makes the Delivery component of MARI auditable row by row.
`C` is the cohort (the run that first registered the number, per §4).

| # | Improvement | P | C | Pts | Class | Repo(s) | Status | Evidence | Spec |
|---|---|---|---|---|---|---|---|---|---|
| **IMP-1** | Clean field names + per-field prose in `neo_schema` | P1 | C1 | 2.5 / 5 | ♻️ | `com.etendoerp.go` (+ `schema_forge_core`) | ⚠️ partial | A10 · 43/157 labels still raw AD columns, 54 without `description` | base §12 |
| **IMP-2** | Field projection + `view:"summary"` on `neo_list`/`neo_get` | P1 | C1 | 5 / 5 | ⚙️ additive | `com.etendoerp.go` | ✅ resolved | A6, A7 · `McpFieldProjection` | base §12 |
| **IMP-3** | Business query semantics on `neo_list` (named filters + range ops) | P1 | C1 | 5 / 5 | ⚙️ additive | `com.etendoerp.go` + `schema_forge` + core | ✅ resolved | A5, A6 · mechanism verified; authoring coverage tracked as IMP-13 | base §12 |
| **IMP-4** | Human-friendly FK resolution on write verbs | P2 | C1 | 1.5 / 3 | ⚙️ | `com.etendoerp.go` | ⚠️ partial | W3, W8 · works on `neo_create` for display names; rejects legacy numeric ids; absent from `neo_batch` | base §12 |
| **IMP-5** | Explicit not-found + structured validation errors | P1 | C1 | 2.5 / 5 | ♻️ | `com.etendoerp.go` | ⚠️ partial | A5, A8, W4 · excellent on single-record verbs; `neo_batch` leaks raw DAL `status:-4` | base §12 |
| **IMP-6** | Actions-only discovery view (`view:"actions"`) | P2 | C1 | 3 / 3 | ⚙️ additive | `com.etendoerp.go` | ✅ resolved | A12 · `McpActionsView`, commit `bbfce9db` | base §12 |
| **IMP-7** | Lean / grouped `neo_defaults` | P2 | C1 | 1.5 / 3 | ⚙️ additive | `com.etendoerp.go` | ⚠️ partial | A4 · `view:"minimal"` still returns 7 compliance keys; `partnerAddress:""` reported as resolved · investigated 2026-08-06 ([imps/IMP-7](imps/IMP-7.md)): the two halves differ ~10× in cost. **Half A** (blank reported as resolved) root-caused — `apply()` classified by key and never read the value, and `NeoDefaultsService` fills `unresolvedFields` only from `catch` blocks — **implemented (uncompiled, unprobed)**: blanks now route into `metadata.unresolvedFields`, predicate shared with IMP-12. **Half B** (the 7 keys) needs a module-ownership criterion, so [imps/IMP-7](imps/IMP-7.md) §3 recommends splitting it out rather than holding A hostage · half A **probed live 2026-08-06** (`5c0d4a4c`): `partnerAddress` leaves `confirm` for `metadata.unresolvedFields`, sibling metadata intact, default response untouched, no IMP-12 regression — and the probe exposed that `unresolvedFields` reports only fields defaults resolution *attempted*, so `businessPartner` is absent from the whole response ([imps/IMP-7](imps/IMP-7.md) §2.5) | [imps/IMP-7](imps/IMP-7.md) · base §12 |
| **IMP-8** | `neo_selectors` argument alias + self-correcting error | P2 | C1 | 3 / 3 | ⚙️ additive | `com.etendoerp.go` | ✅ resolved | A8 · `field` alias, `McpToolRouter` | base §12 |
| **IMP-9** | Expose `primaryEntity` in `neo_discover` | P2 | C1 | 3 / 3 | ⚙️ additive | `com.etendoerp.go` | ✅ resolved | A1 · commit `bbfce9db` | base §12 |
| **IMP-10** | Make `docs` first-class + fix tool-name drift | P1 | C1 | 2.5 / 5 | ♻️ | `com.etendoerp.go` + `etendo-go-docs` | ⚠️ partial | A9 · server side done; every corpus snippet still says `etendo_neo_*` | base §12 |
| **IMP-11** | Close the `visibility` / `userRequired` contract | P1 | C2 | 0 / 5 | ⚙️ | `schema_forge_core` | ⏳ open | A10, A13, **B6** · 0/6,340 fields carry `visibility`; 0/157 on `sales-invoice/header` carry either key, while the response `hint` *and* the `neo_schema` tool description both instruct agents to filter on them · writer fixed in core `0c3f13d2b`; backfill landed 2026-08-06 (4,343 rows classified, sourcedata `356e77c5`) and `neo_schema` now emits both keys on curated entities — 157/157 on `sales-invoice/header`. Still ⏳ pending the M2 first-call measurement and staging re-verification; 1,892 fields in 105 **uncurated** entities still omit the keys (see [imps/IMP-11](imps/IMP-11.md) §4.2) — of which **1,422 in 89 entities are actually MCP-exposed**, and only 4 are root entities; re-measured and broken down in [imps/IMP-12](imps/IMP-12.md) §15.2 | [imps/IMP-11](imps/IMP-11.md) · audit §5 |
| **IMP-12** | Projection for `neo_schema` (`view:"create"`, `fields:[…]`) | P1 | C2 | 0 / 5 | ⚙️ | `com.etendoerp.go` | ⏳ open | A10, **B6** · 61,963 chars / 157 fields exceeds the agent's budget — reproduced byte-for-byte on 2026-08-06, where the call **failed outright** against the client token limit rather than merely being wasteful · root-caused 2026-08-06, IMP-11 dependency now satisfied; the specified filter rule was measured wrong and corrected in [imps/IMP-12](imps/IMP-12.md) §4–5 · **implemented 2026-08-06 (uncompiled, unprobed)**: `view:"create"` + `fields:[…]` written across 4 files, reclassified ♻️ → ⚙️ because `userRequired` narrowed in the default response too — see [imps/IMP-12](imps/IMP-12.md) §9 · probed live twice: −89.1 % (7,853 chars) and the ♻️ half proved by `diff`, but the probe exposed that 4 of the 6 `required` fields are already resolved by `neo_defaults` ([imps/IMP-12](imps/IMP-12.md) §11.2) — cross-check committed `977daf85` **and probed live: it had no effect** — it read the top level of a `{defaults:{…},metadata:{…}}` body, so `requiredCount` stayed 6; re-fixed in `fed3902a`, not re-probed. `fields:[…]` + `unknownFields` verified ✅ after an `/mcp` reconnect ([imps/IMP-12](imps/IMP-12.md) §12–§13) · **6 of 7 done-when ✅ on `etendo-go-local` as of `fed3902a`**: `view:"create"` returns 2 / 22 on both `sales-invoice` and `purchase-invoice`, agreeing with `neo_defaults` field-for-field ([imps/IMP-12](imps/IMP-12.md) §14). Remaining row is a **release**, not a code gap — flip needs a `/mcp-comparison` run with M1/M2 re-measured · §14.3's two-view divergence closed by decision (document the full dump's `userRequired` as a static approximation; no new IMP) · §15 records a defect **of the projection**: on an uncurated entity the view returns empty and its `hint` tells the agent to stop looking — 89 / 230 MCP-exposed POST-able entities, 85 of them auxiliary sub-tabs that should lose `ispost` | [imps/IMP-12](imps/IMP-12.md) · audit §5 |
| **IMP-13** | Backfill `businessCritical` + `namedFilters` authoring (+ validator rule F11) | P2 | C2 | 0 / 3 | ♻️ | `schema_forge` | ⏳ open | 3/246 and 2/246 entities authored | audit §5 |
| **IMP-14** | Realign `etendo-go-docs` with the real tool names | P2 | C2 | 0 / 3 | ♻️ | `etendo-go-docs` | ⏳ open | A9, **B9** · closing this also closes IMP-10. `docs(topic:"creating records")` still returns `etendo_neo_create`/`_list`/`_batch`/`_action`/`_selectors`/`_defaults` throughout, and its argument lists omit the shipped `fields` and `view` params | audit §5 |
| **IMP-15** | Unify the FK contract across write verbs | P1 | C2 | 0 / 5 | ⚙️ | `com.etendoerp.go` | ⏳ open | W3, W8, **B11, B15** · see **Appendix A** | audit §5 |
| **IMP-16** | One date format across `neo_defaults` and the write verbs | P1 | C3 | 0 / 5 | ⚙️ | `com.etendoerp.go` | ⏳ open | B9, B13 · `invoiceDate` emitted `DD-MM-YYYY`, `accountingDate` ISO, same payload; `neo_create` misparses the former silently | audit §5 |
| **IMP-17** | Wrap callout + routing errors in the IMP-5 envelope | P2 | C3 | 0 / 3 | ♻️ | `com.etendoerp.go` | ⏳ open | B13, B6 · raw untranslated `"La fecha de operación…"` and `"Entity not found: header"` bypass the envelope entirely | audit §5 |
| **IMP-18** | Report unknown names in a `fields` projection | P2 | C3 | 0 / 3 | ⚙️ additive | `com.etendoerp.go` | ⏳ open | B8 · `salePrice`/`purchasePrice`/`stock` dropped in silence, no `warnings` array | audit §5 |
| **IMP-19** | Type the report-generator contract | P2 | C3 | 0 / 3 | ⚙️ | `com.etendoerp.go` | ⏳ open | B3–B5 · `parameters` is an untyped object (first call always fails); `format` documents `pdf/xlsx/csv` but JSON is always returned; flat error envelope | audit §5 |
| **IMP-20** | Projection on write-verb responses | P2 | C3 | 0 / 3 | ⚙️ additive | `com.etendoerp.go` | ⏳ open | B14, B16 · `neo_create`/`neo_update` return ~80 fields incl. `_computedColumns`, `recordTime`; IMP-2 covers only `neo_list`/`neo_get` | audit §5 |
| **IMP-21** | Curate the actions catalog | P2 | C3 | 0 / 3 | ♻️ | `com.etendoerp.go` + `schema_forge` | ⏳ open | B7 · 13 of 19 labels are raw column names (`RM_ReceiveMaterials`); 10 buttons flagged `required:true`; `businessCritical:false` on `documentAction` and `posted` | audit §5 |

**Totals (2026-08-06):** earned **29.5** of a known scope of **81** (C1 29.5/40 · C2 0/21 · C3 0/20)
against a re-based quota of **97** (§2.2) → the Delivery component of MARI = **30** (§2.1). Verify the
column sums before publishing; a `Pts` cell that disagrees with its `Status` mark makes MARI
unauditable.

> **No status changed on 2026-08-06.** The run re-confirmed IMP-11, IMP-12, IMP-14 and IMP-15 with
> live evidence and re-confirmed IMP-7's ⚠️ (the 7 compliance keys and the `partnerAddress:""`
> contradiction are both still present), but shipped nothing, so `earned` is unmoved at 29.5. Four
> findings that first looked new turned out to be already registered — the 62 kB schema is IMP-12
> (the run reproduced the identical 61,963-char figure), the missing `userRequired`/`visibility` is
> IMP-11, the `etendo_neo_*` corpus drift is IMP-14, and the FK round-trip is IMP-4/IMP-15. Only the
> six above are genuinely new.

**Unnumbered candidates** (raised, not yet specified — promote to an IMP before implementing):
PDF/print + attachment tools · find-by-document-number lookups · per-verb permission/role in the
schema · cursor pagination alongside offset · `overdue` named filter (needs a payment-schedule
subquery).

---

## 4. Changelog

One entry per benchmark run. Append; never rewrite a past entry.

### 2026-08-06 — full-coverage measurement run (`etendo-go-local`, build `c597c7c2`)

First run at **6 of 6 probe surfaces**. Human-authorised writes on `etendo-go-local` (create → update
→ delete) and on the Holded **demo** tenant. No code shipped: this run measures, it does not deliver.

* **Added IMP-16** — `neo_defaults` emits `invoiceDate` as `DD-MM-YYYY` and `accountingDate` as ISO in
  the same payload; `neo_create` silently misparses the former and surfaces an unrelated callout
  error. P1, ⚙️.
* **Added IMP-17** — raw untranslated callout strings and routing errors bypass the IMP-5 envelope.
  P2, ♻️.
* **Added IMP-18** — a `fields` projection drops unknown names in silence, with no `warnings` array.
  P2, ⚙️ additive.
* **Added IMP-19** — the 8 report generators take an untyped `parameters` object and ignore `format`.
  P2, ⚙️.
* **Added IMP-20** — write-verb responses carry no projection (~80 fields). P2, ⚙️ additive.
* **Added IMP-21** — the actions catalog is uncurated: raw column labels, buttons flagged
  `required:true`, and `businessCritical:false` on `documentAction`/`posted`. P2, ♻️.
* **Re-confirmed IMP-11, IMP-12, IMP-14, IMP-15** with live evidence; **re-confirmed IMP-7's ⚠️**.
  No mark moved. Four findings that looked new on first reading were already registered as these
  items — recorded in §3 so a future run does not re-discover them a third time.
* **Coverage closed 2/6 → 6/6** (§2.5): Holded writes, `neo_update`, the `neo_action` catalog
  (read-only), `neo_widget` and the report generators all probed for the first time. Coverage can no
  longer rise; future MARI movement must come from shipping.
* **M2 re-measured 0 % → 40 %** across the full frozen 5-task suite, discharging the ¹ caveat on the
  2026-08-05 baseline; **M1 2.4× → 2.1×**. Both are corrections to an under-sampled baseline, not
  product improvements.
* **Quota re-based 73 → 97** (§2.2, first re-base of the period, human-authorised) after the 20 new
  points overran the discovery reserve by 8. Delivery consequently fell 40 → 30 on unchanged earned
  points. Scope-closed ceiling unchanged at 88; KR target corrected 66 → 68.
* **MARI 28 → 49.**

Run report: [`mcp-comparison-post-audit-2026-08-06.md`](mcp-comparison-post-audit-2026-08-06.md)

### 2026-08-05 — post-audit run (`etendo-go-local`, build `c597c7c2`)

First run with **authorized write probes** enabled, which is what surfaced IMP-15.

* **Added IMP-11** — `neo_schema` promises `visibility` / `userRequired` in its own `hint` and never
  emits them. P1, ⚙️, cross-repo.
* **Added IMP-12** — no create-shaped projection for `neo_schema`; the full response is unconsumable.
  P1, ♻️.
* **Added IMP-13** — the metadata driving Waves 1–2 is authored on ~1% of the surface. P2, ♻️.
* **Added IMP-14** — `etendo-go-docs` still ships the pre-rename tool names. P2, ♻️.
* **Added IMP-15** — `neo_create` and `neo_batch` accept mutually exclusive FK formats. P1, ⚙️.
* **Advanced IMP-4** — display-name resolution confirmed live on `neo_create`; two gaps found
  (legacy numeric ids rejected; `neo_batch` not wired). Downgraded ✅ → ⚠️.
* **Advanced IMP-5** — `neo_create`'s `missingFields` error confirmed strictly better than Holded's;
  `neo_batch` bypasses the envelope entirely. Downgraded ✅ → ⚠️.
* **Advanced IMP-10** — server-side pointers confirmed; corpus drift unfixed. Downgraded ✅ → ⚠️.
* **Advanced IMP-1** — curated labels confirmed on the fields that have them; 43/157 still raw.
  Downgraded ✅ → ⚠️.
* **Advanced IMP-7** — `view:"minimal"` confirmed; 7 compliance keys still leak. Downgraded ✅ → ⚠️.
* **Resolved IMP-6** — `view:"actions"` shipped (`McpActionsView`, `bbfce9db`).
* **Resolved IMP-9** — `primaryEntity` shipped in `neo_discover` (`bbfce9db`).
* **Registry created.** Status moved out of the base report's five surfaces into this file.
* **MARI defined** (§2.1–2.3) and the OKR period opened with a known scope of 61 points and a quota
  of 73. Baseline **MARI = 28**; next-wave projection 66; scope-closed ceiling 88. The count-based
  M5 family was demoted to diagnostics (§2.4) because its denominator grows with discovery, so it
  cannot carry a KR target. Registered under **ETP-4793**.

Run report: [`mcp-comparison-post-audit-2026-08-05.md`](mcp-comparison-post-audit-2026-08-05.md)

### 2026-08-03 — Wave 2 close (`etendo-go-local`)

* **Resolved IMP-2, IMP-3, IMP-7** (Wave 2, commit `c5b51c1f`).

### 2026-07-21 — baseline benchmark

* **Added IMP-1…IMP-10.** Report: `mcp-comparison-holded-vs-etendo-go.md`.

---

## Appendix A — IMP-15 explained

This is the least intuitive item in the registry, so it gets a full walk-through. It is also the
only one that a **read-only** benchmark can never find: the contradiction only exists on the write
path.

### A.1 What a foreign key looks like to an agent

Every Etendo document references other records: an invoice references a currency, a business
partner, a price list, a warehouse. In the MCP body those come through as plain strings:

```jsonc
neo_create({ spec:"sales-order", entity:"header", fields:{
  businessPartner: "…",
  currency:        "…",      // ← a foreign key
  priceList:       "…"
}})
```

The agent has two possible things to put in that slot:

1. **the record id** — what Etendo actually stores. For legacy master data these are short numeric
   strings: `"102"` for EUR, `"19"`, `"130"`. For anything created in the last decade they are
   32-char uppercase hex: `"FFA767684E234FCFB8A1CA24459B934B"`.
2. **the display name** — `"EUR"`, `"IVA 21%"`. **IMP-4** was built so this works too, saving the
   agent a `neo_selectors` round-trip per FK.

Both should be accepted. That was the whole point of IMP-4.

### A.2 What actually happens

Two verbs create records. `neo_create` writes one record; `neo_batch` writes a header and its lines
in one transaction. They disagree — and they disagree in **opposite directions**:

| Value passed for `currency` | `neo_create` | `neo_batch` |
|---|---|---|
| `"EUR"` — the display name | ✅ resolves | ❌ `400`, raw DAL error |
| `"102"` — the exact record id | ❌ `422 not_found` | ✅ resolves |

So there is **no single body** an agent can write that works on both verbs. Discovering the format
for one teaches it the wrong thing about the other.

### A.3 Why `"102"` fails on `neo_create` — the actual bug

`McpFkResolver` (the IMP-4 implementation) resolves **name-first**: it takes the string, looks it up
as a display name, and fails if there is no match. A 32-char hex string is recognized as an id, so
it short-circuits correctly. A **short numeric** string is not — it goes down the name path, finds
no currency literally named `"102"`, and returns:

```json
{"status":422,"error":"not_found",
 "detail":"No match for 'currency'='102'. Use neo_selectors to search, or pass the exact record id instead.",
 "field":"currency"}
```

Read that `detail` carefully. It advises the agent to *"pass the exact record id instead"* — and
`"102"` **is** the exact record id. It is the value `neo_defaults` returned one call earlier, and it
is the value the created record ends up storing. The error tells the agent to do precisely what it
just did.

The reason this matters more than an edge case: **all Etendo `_ID` columns are `VARCHAR`**, and the
legacy master data every document touches — currency, UOM, document type, tax rate — still carries
numeric ids. So this breaks the documented happy path:

```
neo_defaults  →  returns currency: "102"
neo_create    →  reject "102"
```

An agent following the documentation, on the first try, hits it. That is why it is P1 rather than a
polish item.

**The fix is one ordering change:** resolve **id-first**. Try the value as a record id; only if no
record has that id, try it as a name. Nothing is lost — a display name that happens to look like an
id would resolve to the record it identifies, which is what the agent meant anyway.

### A.4 Why `"EUR"` fails on `neo_batch`

Different cause, same family. `neo_batch` was never routed through `McpFkResolver` at all — IMP-4
was wired into `neo_create` only. So `neo_batch` passes the string straight to Etendo's DAL import
layer, which knows only ids, and the failure surfaces as DAL internals:

```json
{"committed":false,"failedAt":{"index":0,"id":"h1"},
 "error":{"status":400,"message":"Operation 'h1' rejected by server",
 "detail":{"response":{"status":-4,
   "errors":{"id":"New object Currency(null)  (key: EUR_Currency) refered to but not present in the import set"}}}}}
```

There is no `error` code, no `field`, no `hint`, no `seeAlso` — none of the IMP-5 envelope. `status:
-4` is an internal DAL constant. An agent cannot self-correct from this, which is the exact failure
class IMP-5 exists to eliminate: **IMP-5 stops at the single-record verbs.**

### A.5 What the contradiction cost, measured

Creating **one** draft sales order:

| Path | Calls | Failed writes | First-call success |
|---|---|---|---|
| `neo_create` (header, then line) | 6 | 2 | 0% |
| `neo_batch` (header + line, atomic) | 4 attempts | 3 | 0% |

Both created records were deleted afterwards; nothing was booked or posted (run report §3b.5).

### A.6 The three fixes IMP-15 asks for

1. **Make `McpFkResolver` id-first**, so legacy numeric ids resolve. Fixes the `neo_defaults →
   neo_create` path.
2. **Route `neo_batch` bodies through `McpFkResolver`**, so both verbs accept the same formats.
3. **Give `neo_batch` failures the IMP-5 envelope**, so no raw `status: -4` can reach an agent — and
   fix the `"pass the exact record id instead"` text so it cannot be emitted to a request that did.

**Secondary, found in the same probe:** `sales-order/lines` requires `uOM`, but `neo_schema` does not
mark it required and omitting it returns a bare `500 "Unit of Measure mismatch
(product/transaction)"`. The value is only recoverable from `_aux._UOM` inside the product selector
response — an undocumented, private-looking key. It should either be auto-derived from the product
or reported as a `422` `missingFields` entry.

### A.7 `Done when:`

The identical `fields` body succeeds on both `neo_create` and `neo_batch`; a regression test asserts
resolution for a legacy numeric id, a UUID and a display name **on each verb**; no `neo_batch` error
path can return a raw DAL `status: -4` payload; and `uOM` on `sales-order/lines` never produces a
`500`.
