# MCP Improvements Registry (IMP-*) — single source of truth

**Jira:** ETP-4793 (Epic ETP-3504) · continues ETP-4601 · **Labels:** `plataforma`, `validacion-agentica`
**Scope:** every improvement item ever raised against the **Etendo GO MCP server**
(`com.etendoerp.go/src/com/etendoerp/go/mcp/`) by the Holded-vs-Etendo-GO agentic benchmark.
**Last updated:** 2026-08-10 · **MARI 73** (§2.1) · quota **fully consumed** at 97/97 (§2.2)
**ACE** (context-cost companion index, §2.6): **defined, first measurement owed by the next run**

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
| 🔧 **fix implemented** | The code is written, committed and unit-tested; **no live call has confirmed the behaviour** | Must name the commit and what verification is still owed. Worth the same as ⏳ — **zero** — until a live call lands |
| ⏳ **open** | Specified, not implemented | |
| ❌ **regressed** | Was ✅, no longer holds | Report to a human immediately; never downgrade quietly |
| 🗄️ **withdrawn** | No longer wanted | Keep the row; never recycle the number |

🔧 was added on 2026-08-11 because the vocabulary had no way to say *the code is written and the
product has not been measured*, and that gap is where this registry has misled itself most often:
IMP-14 passed three separate gates (commit → merge → reindex) each of which looked like delivery
from the inside, and IMP-23's own note had to be rewritten for conflating a status flip with a score.
🔧 is therefore **not** a partial ✅ — it scores zero, exactly like ⏳. It records that the remaining
work is a *measurement*, not an implementation, which is a different thing to schedule.

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

| Component | Weight | Normalization | 2026-08-05 | 2026-08-06 | 2026-08-10 | Contribution |
|---|---:|---|---|---|---|---:|
| **M2** — first-call success rate | 30 | the percentage itself | 0 % ¹ | 40 % ² | **80 %** ⁴ | 24.0 |
| **M1** — calls-to-outcome ratio vs Holded | 30 | `100 / M1` (1.0× → 100) | 2.4× → 42 | 2.1× → 48 | **1.4× → 71** | 21.4 |
| **Delivery** — weighted points earned | 25 | `earned / quota` | 29.5 / 73 → 40 | 29.5 / 97 → 30 ³ | **49.0 / 97 → 51** | 12.6 |
| **Coverage** — probe surfaces exercised (§2.5) | 15 | `probed / 6` | 2 / 6 → 33 | 6 / 6 → 100 | **6 / 6 → 100** | 15.0 |
| | | | **MARI = 28** | **MARI = 49** | | **MARI = 73** |

¹ Measured on the write suite only (2 attempts, 2 FK failures — see Appendix A.5). The read suite
was not scored per call. Flagged at the time as the least solid of the four inputs.

² Re-measured 2026-08-06 across the full frozen 5-task suite, as that flag required: tasks 1 and 3
fail on the first call, tasks 2, 4 and 5 succeed → 2/5. This supersedes the 0 % figure, which was
measured on the product's single worst path. **This is a correction, not an improvement** — no code
changed between the two columns (§2.4).

³ Delivery *fell* while MARI rose. The run registered IMP-16…IMP-21 and the quota was re-based
73 → 97 (§2.2), so the same 29.5 earned points now sit against a larger denominator. Intended
behaviour: registering debt costs Delivery honestly, but at 25 % weight it cannot sink the index.

⁴ Re-measured 2026-08-10 on the frozen suite after the IMP-15 wave was deployed: tasks 1, 2, 4 and 5
succeed on the first call, task 3 still fails → 4/5. **Unlike the 08-06 column this is a real
improvement — code changed** (IMP-15, IMP-12, IMP-11, IMP-16, IMP-25 shipped and were probed live).
But read [`mcp-comparison-post-audit-2026-08-10.md`](mcp-comparison-post-audit-2026-08-10.md) §6
before quoting it: the suite's create task runs on `sales-invoice`, the one spec where
`view:"create"` is complete, while the `sales-order` create still costs 2.5× because of IMP-12. The
shadow figures including that path are **M2 ≈ 67 % / M1 ≈ 1.5×**. M1 = 1.4× is already inside the
"registry closed" projection below (1.2×) while a third of the registry is open — the suite has
stopped discriminating and §13 of the run report proposes amending it.

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
73 quota. Quota re-based to **81 × 1.20 = 97**. At that point the re-base did
**not** move the scope-closed ceiling — it stayed at 88, because Delivery could only reach 81/97 = 84
while 16 points of reserve sat unspent. Delivery fell from 40 to 30 on the same
29.5 earned — that drop is the honest price of registering debt, and it is why Delivery is only 25 %
of the index.

**2026-08-10 spent the rest of the reserve.** IMP-22…IMP-25 added 16 points, taking known scope to
**exactly 97** — no overrun, so **the quota was not re-based and stays at 97**. But the ceiling moved
88 → 92 (§2.3), because a fully-spent reserve lets Delivery reach 97/97 = 100 where it previously
capped at 84. **That rise is a warning light, not headroom:** the registry now has no room for a new
finding, so the next run that discovers one must stop and ask for a re-base rather than quietly
widening the denominator. Read the ceiling together with §2.3's note, never on its own.

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
| Measurement correction (2026-08-06) | 40 % | 2.1× | 29.5 / 97 | 6 / 6 | **49** |
| ~~Next wave~~ *(projection, now superseded)* | ~75 % | ~1.5× | 52 / 97 | 6 / 6 | ~~68~~ |
| **Today** (2026-08-10) — IMP-15 + IMP-10 + IMP-25 resolved; IMP-11 + IMP-12 + IMP-14 + IMP-16 advanced to ⚠️ | **80 %** | **1.4×** | **49.0 / 97** | 6 / 6 | **73** |
| **Registry closed** — all 25 ✅, full probe surface, M1 at its target | 90 % | 1.2× | 97 / 97 | 6 / 6 | **92** |

The 2026-08-06 jump from 28 to 49 is **measurement, not shipped product**: no code changed. Coverage
went 2/6 → 6/6 (+10) and M1/M2 were re-measured across the full frozen suite instead of two write
calls (+15), while Delivery *fell* 40 → 30 because the run registered 20 points of new debt. Read it
as "we now know where we stand", not as "the product improved" — the two are different claims and
MARI deliberately lets the second one stay flat.

**The ceiling moved 88 → 92 on 2026-08-10, and that is not good news.** It rose only because the
2026-08-10 run consumed the last of the discovery reserve: known scope reached **exactly 97**, so
Delivery can now reach 97/97 = 100 where it previously capped at 81/97 = 84. Unspent reserve is not
credit, so a fully-spent reserve lifts the ceiling arithmetically — while meaning the registry has
no room left. **The next run cannot register a new IMP without re-basing the quota**, which is the
user's decision, not a run's (§2.2). Treat 92 as a warning light, not as headroom.

The M1/M2 figures in the forward row are **projections, not commitments** — only a measured run can
confirm them.

**As a KR:** `MARI 28 → 68` over the period, with 85 as the stretch. **Met on 2026-08-10 at 73**,
one wave earlier than projected. Do not read 85 as newly easy: the two items standing between 73 and
the stretch (IMP-23, IMP-24) are both P1 and both in the code, not in the paperwork.

> The KR target moved 66 → 68 when the quota was re-based. This is a **correction, not a goalpost
> shift**: the target is defined as "next wave shipped", and the same wave now sits against a larger
> denominator. The 28 baseline is unchanged.

### 2.4 M5 family — diagnostics, not targets

These remain useful for reading *what changed*, and are the inputs to Delivery. They are **not**
KR material, precisely because of the denominator problem MARI solves.

| Metric | Definition | 2026-08-03 | 2026-08-05 | 2026-08-06 | 2026-08-10 |
|---|---|---|---|---|---|
| **M5 — open items** | count(⚠️) + count(⏳) | 3 of 10 | 10 of 15 | 16 of 21 | **17 of 25** |
| **M5a — open P1** | the same, restricted to P1 | 0 | 4 | 5 | **7** (IMP-1, 5, 11, 12, 16, 23, 24) |
| **M5b — resolved** | count(✅) | 7 | 5 | 5 | **8** (IMP-2, 3, 6, 8, 9, 10, 15, 25) |
| **M5c — added this run** | new IDs registered | — | 5 (IMP-11…IMP-15) | 6 (IMP-16…IMP-21) | **4** (IMP-22…IMP-25) |
| **M5d — cohort closure** | `earned / weight`, denominator frozen per cohort | — | C1 74 % · C2 0 % | C1 74 % · C2 0 % · C3 0 % | **C1 80 %** (32/40) · **C2 55 %** (11.5/21) · **C3 13 %** (2.5/20) · **C4 19 %** (3/16) |

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

> **2026-08-10 makes the same point from the opposite direction.** It is the best run of the period —
> MARI 49 → 73, M2 doubled, three items resolved, four advanced — and **M5a still went 5 → 7**,
> because the run discovered two new P1 defects (IMP-23, IMP-24). Every count-based line either
> worsened or moved less than the product did. M5b's 5 → 8 is the only line that reads honestly, and
> only by accident. Read M5a as *"what is left to do at P1"*, never as *"how the period went"*.

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

| Surface | 2026-08-05 | 2026-08-06 | 2026-08-10 | Note |
|---|---|---|---|---|
| Read verbs (`neo_list`/`get`/`schema`/`defaults`/`selectors`/`discover`/`docs`) | ✅ | ✅ | ✅ | A1–A13; re-run as B1–B9, then as C1–C2, C13–C19 |
| Write, Etendo (`neo_create`, `neo_batch`) | ✅ | ✅ | ✅ | W1–W8; `neo_create` re-run as B10–B14, then C3–C8. **`neo_batch` was re-probed on 2026-08-10** (C9–C10), closing the 08-06 caveat that IMP-4/IMP-15's batch clauses rested on 08-05 evidence — and the probe found IMP-23 |
| Write, Holded (`create_*` / `delete_*`) | ❌ | ✅ | ✅ | B17–B20, then C12. **Deletion could not be verified on 2026-08-10** — Holded exposes no read verb for contacts or sales orders (run report §2) |
| `neo_update` | ❌ | ✅ | ✅ | B15–B16, then C11 — which is where IMP-24 was found |
| `neo_action` | ❌ | ✅ | ✅ | B7, then C16 — read-only verification of the catalog (19 actions on 08-06, **22** on 08-10) + its `agentPrompt`/`actionValues` contract. Firing a completion/posting action remains forbidden (Step 0); the surface is scoreable without it |
| `neo_widget` + the 8 report generators | ❌ | ✅ | ⚠️ | B1–B2, B3–B5. **Not re-probed on 2026-08-10** (job A, nothing in the wave touched them) — the surface still counts as covered by the 08-06 evidence, but IMP-19's clauses are 08-06-fresh, not 08-10-fresh |

A low discovery count is only evidence of maturity **at full coverage**. At 2 of 6 it meant four
surfaces had not been looked at — which is precisely how IMP-15 survived two runs undetected. Now at
6 of 6, the corollary applies: **Coverage cannot rise again**, so it is the one component that from
here on can only be lost (by a surface regressing or a new surface being added by amendment). Future
MARI movement has to come from M1, M2 and Delivery — that is, from shipping.

### 2.6 ACE — Agent Context Economy *(companion index, deliberately outside MARI)*

**Status: defined, not yet measured. The series starts with the first run after 2026-08-10.**

M1 counts **calls**. It is blind to what each call costs: two servers can tie at 1.0× while one
returns 400 bytes and the other 62 KB. That gap is not hypothetical — the 2026-08-10 run recorded a
`neo_schema` full dump at **61,963 chars** and IMP-12's projection cutting one response by **−89.1 %**,
both as asides, in a scorecard that has no place to put them. Context is the agent's scarcest
resource: a response that does not fit is a failed call regardless of its status code.

ACE has **two components that are never summed**, because the two servers pay in opposite ways:

| Component | What it measures | Unit | Who is structurally favoured |
|---|---|---|---|
| **ACE-p** — priming | Bytes of tool catalog (names + descriptions + input schemas) loaded into the agent's context **before it does anything**. Paid once per session, unavoidable, whether one task runs or fifty | bytes, absolute per server + ratio | **Etendo GO** — ~14 generic verbs + 8 generators against Holded's ~180 explicit tools (base §3) |
| **ACE-v** — variable | Bytes exchanged (request + response, summed) to complete one frozen-suite task, from a cold start | bytes per task + median ratio vs Holded | **Holded, probably** — Etendo GO pays introspection at runtime (`neo_discover`, `neo_schema`, `neo_defaults`) where Holded pre-paid it in ACE-p |

That asymmetry **is the finding**, and a single headline number would erase it. Holded front-loads a
large fixed cost and then runs cheap; Etendo GO starts nearly free and pays per outcome. So the two
components produce one genuinely actionable output: **the break-even task count** — how many tasks a
session must run before the generic-verb model stops being the cheaper one. Report it as
`ACE-p_holded − ACE-p_etendo ÷ (ACE-v_etendo − ACE-v_holded)` per task, and state which side of the
break-even a realistic session sits on. If the crossover is at 2 tasks, the priming saving is a
rounding error; if it is at 60, Etendo GO's model is the right one for every real session and the
per-call verbosity is a non-issue. Nobody currently knows which.

**Measurement rules — non-negotiable, same standard as any finding:**

1. **Bytes are the unit; tokens are a derived estimate.** Count bytes with `wc -c` on the response
   saved verbatim. Never report a token count as measured — this harness does not expose per-call
   token usage. When quoting tokens, label them estimates and state the divisor
   (`bytes ÷ 4`, the usual English approximation; JSON is denser, so treat it as a floor).
2. **Verbatim or not at all.** Save the payload to a file and measure the file. A byte count
   retyped from memory is fabricated data — the one failure mode that would make this index worse
   than not having it.
3. **Cold start per task**, matching M1's convention: count every call the task actually needed,
   including the discovery calls a cold agent cannot skip. Excluding them would score prior
   knowledge as economy, exactly the trap §3 of the 2026-08-10 report caught on task 2.
4. **Median, not mean, for the ACE-v ratio.** One 62 KB full dump would otherwise decide the index.
5. **Both sides or neither**, per task — same rule as write probes (Step 0.1).
6. **No retroactive figures.** The 08-05 / 08-06 / 08-10 runs did not save payloads, so they get no
   ACE column ever. Reconstructing them would be invention.

**Why it stays out of MARI** — and this is the load-bearing reason, not a formatting preference:
**verbosity is not monotonic with quality.** IMP-5 asks for *richer* error envelopes; IMP-18 asks
`neo_list` to *add* an `unknownFields` warning; IMP-12's whole value is a response that says more
with less. Fold bytes into the readiness index and shipping IMP-5 would lower the score — a metric
that punishes the fix it is meant to motivate. ACE is a **cost** measurement read *next to* MARI, and
a rising ACE is only a defect once MARI has stopped rising with it. Keep them adjacent and separate.

---

## 3. Master table

Environment for all 2026-08-05 statuses: **`etendo-go-local`**, build `c597c7c2`.
`Evidence` points at the run report row that justifies the mark.
`Pts` is `earned / weight` per §2.2 — it makes the Delivery component of MARI auditable row by row.
`C` is the cohort (the run that first registered the number, per §4).

| # | Improvement | P | C | Pts | Class | Repo(s) | Status | Evidence | Spec |
|---|---|---|---|---|---|---|---|---|---|
| **IMP-1** | Clean field names + per-field prose in `neo_schema` | P1 | C1 | 2.5 / 5 | ♻️ | `com.etendoerp.go` (+ `schema_forge_core`) | ⚠️ partial | A10 · 43/157 labels still raw AD columns, 54 without `description` · **root cause of one instance pinned 2026-08-07**: the fallback is per-*window*, not per-column. `EM_Aeatsii_Cause_Exemption_ID` on `C_Invoice` resolves to *"SII - Cause Exemption"* + a description on `sales-invoice/header` but to the raw column name with no description on `purchase-invoice/header` — because `AD_Field` has rows for that column only in the *Sales Invoice* and *Tax Rate* windows, none in *Purchase Invoice*. So part of the remaining 43 are missing `AD_Field` records rather than missing labels, and the two repos fix them differently (an AD record in `com.etendoerp.go` vs an `applyCuratedLabels` override in core) — see [imps/IMP-12](imps/IMP-12.md) §14.5 | base §12 |
| **IMP-2** | Field projection + `view:"summary"` on `neo_list`/`neo_get` | P1 | C1 | 5 / 5 | ⚙️ additive | `com.etendoerp.go` | ✅ resolved | A6, A7 · `McpFieldProjection` | base §12 |
| **IMP-3** | Business query semantics on `neo_list` (named filters + range ops) | P1 | C1 | 5 / 5 | ⚙️ additive | `com.etendoerp.go` + `schema_forge` + core | ✅ resolved | A5, A6 · mechanism verified; authoring coverage tracked as IMP-13 | base §12 |
| **IMP-4** | Human-friendly FK resolution on write verbs | P2 | C1 | 1.5 / 3 | ⚙️ | `com.etendoerp.go` | ⚠️ partial | W3, W8 · **both original clauses closed by IMP-15 and verified live 2026-08-10**: legacy numeric ids now resolve (`currency:"102"` → `102`, C8) and `neo_batch` resolves display names (C9's header op accepted `businessPartner` and `warehouse` by name; it failed on a deliberately bad tax). Stays ⚠️ because the mechanism still does not hold everywhere — a display name that `neo_selectors` returns is rejected by `neo_create` when the selector is **context-dependent**, registered as its own item **IMP-22**. The old evidence text ("rejects legacy numeric ids; absent from `neo_batch`") is historical and no longer reproduces **2026-08-11:** the blocker (IMP-22) now has a fix implemented, so IMP-4's path to ✅ 3/3 is open — but it stays ⚠️ 1.5/3 until IMP-22 is verified live, since IMP-4's remaining clause *is* IMP-22's behaviour. | base §12 |
| **IMP-5** | Explicit not-found + structured validation errors | P1 | C1 | 2.5 / 5 | ♻️ | `com.etendoerp.go` | ✅ resolved | A5, A8, W4 · excellent on single-record verbs (C17's 404 carries `status`/`error`/`detail`/`seeAlso`) · **the named gap closed: the raw DAL `status:-4` is gone from `neo_batch`** as of IMP-15, verified 2026-08-10 (C10 returns `{committed:false,failedAt:{index,id},error:{status,error,detail,seeAlso}}`). Held at ⚠️ because the same run found **three** remaining non-envelope paths rather than one: (i) an FK-resolution batch failure returns a *flattened* `{status,error:"not_found",detail,field,failedAt}` with **no `committed` key** and `error` as a bare string, so an agent branching on `committed` cannot read it (C9) — the envelope now differs **by failure class**; (ii) the unknown-named-filter error arrives as a raw `Error executing neo_list: …` string (C14); (iii) read-verb errors are wrapped `{"response":{…}}` while write-verb errors are bare. Folded here rather than given a new number — this is precisely this item's remit. **2026-08-11:** IMP-17 closes (ii) as a side effect of enveloping the router's catch-all — it had to, since C14's untyped exception would otherwise have been reclassified as a misleading `server_error` — **verified live** (422 with `available: ["completed","pending","partial"]`). **(iii) is now settled rather than guessed** (IMP-17 §8.6): every read *error* comes back flat while every read *success* is still `{"response":{startRow,…,status:0}}`, so the nesting this clause describes lives in the **success** body and was never the error funnel IMP-17 fixed — the error half is closed and measured, the success asymmetry survives and stays here. **(i) is untouched**: C9 comes from the FK-resolver → `handleBatch` funnel, which IMP-17 does not enter. **2026-08-12 adds a clause (iv)**, found while verifying IMP-19 ([`imps/IMP-19.md`](imps/IMP-19.md) §6.3): a report **handler's own** errors are not enveloped — `generate_aging_receivable({})` returns `{"error":{"message":"No accounting schema with currency is configured for organization 6184…","status":422}}`, the nested pre-IMP-5 shape with no branchable `error` code and no `seeAlso`, so an agent can neither classify it nor be told where to look. This is a **fourth** funnel beyond the three IMP-17 §3 enumerated: `validateReportRequest` uses the canonical envelope but runs *before* the handler, so the argument-validation half is enveloped and everything the handler raises after it escapes — which is why IMP-17's three-funnel closure was complete for what it enumerated and still left this open. Folded here rather than numbered, on the same reasoning as (ii) and as §9.4 → IMP-17: enveloping errors is literally this item's title, and a new number would force a quota re-base for one funnel of the same job. **Both (i) and (iv) implemented 2026-08-12** ([`imps/IMP-5.md`](imps/IMP-5.md)) — they are the same mistake twice: a failure body assembled by whichever path caught the failure instead of by the shape the tool description promises. (iv) is normalized inside `McpHookExecutor#neoResponseToMcpResult`, which covers **nine call sites** at once (report generation, `neo_process`, widget, amortization, and the four entity pre/post hook pairs); the normalization is additive and idempotent, so IMP-17's and IMP-24's richer bodies pass through untouched, and `NeoResponse.error`'s nested shape is deliberately left alone because the React UI reads `error.message` (IMP-17 §4.4 reasoning). **(iv) verified live 2026-08-12**: `generate_aging_receivable({})` now answers flat `{status:422, error:"validation_error", detail:"No accounting schema with currency is configured for organization 6184…"}`, with `seeAlso` deliberately omitted and pinned by a test (§4.6 — the only two topics would send the agent to a recipe that cannot help). (i) now returns the same outcome envelope as a failure inside `executeBatch`, through the same `wrapAsTextContent` wrapper, with `atomic:true`/`persisted:[]` true by construction because the FK pre-pass runs before the transaction opens (IMP-23 §1) and a hint that says so instead of reusing BatchService's "rolled back as a unit"; the batch outcome keys are now shared `public` constants on `BatchService` (`REF_PREFIX` precedent, IMP-15) since two spellings of `committed` drifting apart *is* this clause's failure. `ToolRegistry`'s `neo_batch` description needed no change — it already promised the full shape, so the fix makes an existing promise true. **(i) verified live the same day** (authorized write probe, IMP-5.md §6): the C9 vector now returns every key the description promises — `{committed:false, atomic:true, persisted:[], hint:"…rejected before the transaction opened…", failedAt:{index:0,id:"h0"}, error:{status:422,error:"not_found",detail,field}}` — with the resolver's `detail`/`field` preserved inside the nested `error`, so the outcome keys were gained without losing what the old flattened shape carried. §6.1 records why the two clauses converge on **different** shapes and why that is not a contradiction: a batch's branchable key is `committed` and its `error` is a documented sub-object, while a handler response's branchable key is `error` itself — a single global shape would have broken one of the two contracts. §6.2 records a deliberate non-measurement: the two-op case (a valid op preceding the failure) was **not** probed, because the pre-pass always ran before the transaction opened (IMP-23 §1), so the change touched the *reporting* and never the persistence — probing it would measure a property the fix did not alter while risking a real order. 11 unit tests cover both clauses. **Clause (iii) implemented the same day** (IMP-5.md §7), which closes the last one and moves the row to ✅. Two things came out of it, both from re-reading the call sites instead of trusting the clause text. **The clause was wrong about the write verbs**: "read-verb wrapped, write-verb bare" holds for the *error* bodies, but on the *success* bodies all four DAL-backed verbs (`neo_list`, `neo_get`, `neo_create`, `neo_update`) forward `DefaultJsonDataService`'s `{"response":{data,status:0,startRow,endRow,totalRows}}` untouched — the only bare success is `neo_delete`, and only because it discards core's response and builds its own `{deleted,id}`. Flattening the reads alone would have made the two write verbs the new outliers, i.e. moved the inconsistency rather than removed it, so the fix covers all four. **And a smaller find inside this item's own flagship envelope**: `buildNotFoundError` — the C17 404 the cell above calls "excellent on single-record verbs" — was itself returned *wrapped*, so on one `neo_get` call an unknown filter came back flat while a missing id came back nested; IMP-17 §8.6's "read errors are flat" was measured on the DAL vector and the not-found vector was never re-probed. Now flat, with a test asserting the wrapper's *absence* rather than only its keys. `flattenCoreResponse` runs **last**, after `filterGetResponse` and `applyProjection`, so IMP-2's projection and IMP-18's `unknownFields` are untouched code; it lifts **by rule, not allow-list**, which is why `unknownFields` reaches the top level without being named, and it is idempotent (no wrapper → returned as-is) and conservative (keys *beside* `response` → passed through, never merged). DAL's `status:0` is **dropped with nothing substituted**: every failure branch has already returned by then so it carries no information, and `status` on every other MCP body is an HTTP code, so an agent branching on it read `0` where it expected `200` — and the absence of `error` is already the success discriminator, a second one being a second thing to drift. Deliberately left wrapped: `neo_widget`'s `{response:{data,count}}`, which is the handlers' own published contract shared with the React dashboard, not core's DAL envelope (§4.4's boundary). **No tool description changed** — the `fields` description already promised `unknownFields` "alongside `data`", which the flatten makes literally true (§5.2's cheaper direction again). 7 further unit tests. **(iii) verified live the same day** (§7.6), all five CRUD verbs: `neo_list` with a bad projection name returns flat `{startRow,endRow,totalRows,data,unknownFields}` — no `status:0`, pagination intact, IMP-18's annotation at the **top level**, so the lift-by-rule works end to end; `neo_get` returns `{"data":[{…}]}` and a missing id returns the §7.2 envelope flat; and an authorized write probe on `sales-invoice` (created from `neo_defaults` + the two `unresolvedFields`, updated, then deleted in the same run, no pre-existing record touched) confirms `neo_create`/`neo_update` flat and `neo_delete`'s `{deleted,id}` — the five verbs now agree on one top-level shape, which is the clause's whole claim. §7.7 records what the probe made visible without fixing: the flattened write bodies are ~70 columns wide (audit flags, every `$_identifier`, `_computedColumns`, `recordTime`) — equally wide inside the wrapper, but now in plain sight, and that is **IMP-20**'s evidence confirmed rather than folded in. **All three clauses closed and verified; the item's only remaining debt is §6.2's deliberate non-measurement.** Score unchanged pending a `/mcp-comparison` re-measure | [imps/IMP-5](imps/IMP-5.md) · base §12 |
| **IMP-6** | Actions-only discovery view (`view:"actions"`) | P2 | C1 | 3 / 3 | ⚙️ additive | `com.etendoerp.go` | ✅ resolved | A12 · `McpActionsView`, commit `bbfce9db` | base §12 |
| **IMP-7** | Lean / grouped `neo_defaults` | P2 | C1 | 1.5 / 3 | ⚙️ additive | `com.etendoerp.go` | ⚠️ partial | A4 · `view:"minimal"` still returns 7 compliance keys; `partnerAddress:""` reported as resolved · investigated 2026-08-06 ([imps/IMP-7](imps/IMP-7.md)): the two halves differ ~10× in cost. **Half A** (blank reported as resolved) root-caused — `apply()` classified by key and never read the value, and `NeoDefaultsService` fills `unresolvedFields` only from `catch` blocks — **implemented (uncompiled, unprobed)**: blanks now route into `metadata.unresolvedFields`, predicate shared with IMP-12. **Half B** (the 7 keys) needs a module-ownership criterion, so [imps/IMP-7](imps/IMP-7.md) §3 recommends splitting it out rather than holding A hostage · half A **probed live 2026-08-06** (`5c0d4a4c`): `partnerAddress` leaves `confirm` for `metadata.unresolvedFields`, sibling metadata intact, default response untouched, no IMP-12 regression — and the probe exposed that `unresolvedFields` reports only fields defaults resolution *attempted*, so `businessPartner` is absent from the whole response ([imps/IMP-7](imps/IMP-7.md) §2.5) | [imps/IMP-7](imps/IMP-7.md) · base §12 |
| **IMP-8** | `neo_selectors` argument alias + self-correcting error | P2 | C1 | 3 / 3 | ⚙️ additive | `com.etendoerp.go` | ✅ resolved | A8 · `field` alias, `McpToolRouter` | base §12 |
| **IMP-9** | Expose `primaryEntity` in `neo_discover` | P2 | C1 | 3 / 3 | ⚙️ additive | `com.etendoerp.go` | ✅ resolved | A1 · commit `bbfce9db` | base §12 |
| **IMP-10** | Make `docs` first-class + fix tool-name drift | P1 | C1 | 5 / 5 | ♻️ | `com.etendoerp.go` + `etendo-go-docs` | ✅ resolved | A9, **C18** · server side done; the corpus half is now also done — `36740dc` (merged to `main`, PR #30) removed the `etendo_neo_*` drift and the **live Context7 index confirms 0 occurrences** as of 2026-08-07, so the clause behind this ⚠️ no longer reproduces. **flipped ✅ by the 2026-08-10 run**: `docs(topic:"creating records")` returns real per-spec recipes with source URLs and `neo_*` names only (C18), so both halves of *this* item hold live. The remaining corpus gap (`fields`/`view` params) stays with **IMP-14**, which is where it belongs — IMP-10's own clause is "make `docs` first-class + fix tool-name drift", and both are done. **One caveat worth carrying:** C18's create recipe is *more complete than `neo_schema view:"create"`* — it includes `invoiceAddress` and the parent FK `salesOrder`, which the machine-readable view omits (IMP-12). Two sources of truth for one contract, and the incomplete one is the one an agent introspects | base §12 |
| **IMP-11** | Close the `visibility` / `userRequired` contract | P1 | C2 | 2.5 / 5 | ⚙️ | `schema_forge_core` | ⚠️ partial | A10, A13, **B6**, C16 · 0/6,340 fields carry `visibility`; 0/157 on `sales-invoice/header` carry either key, while the response `hint` *and* the `neo_schema` tool description both instruct agents to filter on them · writer fixed in core `0c3f13d2b`; backfill landed 2026-08-06 (4,343 rows classified, sourcedata `356e77c5`) and `neo_schema` now emits both keys on curated entities — 157/157 on `sales-invoice/header`. Still ⏳ pending the M2 first-call measurement and staging re-verification; 1,892 fields in 105 **uncurated** entities still omit the keys (see [imps/IMP-11](imps/IMP-11.md) §4.2) — of which **1,422 in 89 entities are actually MCP-exposed**, and only 4 are root entities; re-measured and broken down in [imps/IMP-12](imps/IMP-12.md) §15.2 · **advanced to ⚠️ by the 2026-08-10 run**: the M2 measurement that was blocking the flip is done (40 % → 80 %), and `view:"actions"` now emits `visibility` **and** `userRequired` on all 22 actions (C16), so the contract holds on a second surface. **Not ✅**, for two reasons the registry's own rule forbids waiving: the 1,422 fields in 89 MCP-exposed uncurated entities still omit both keys — a ✅ that holds on a subset of specs is not a ✅ — and staging was never re-verified (2026-08-10 probed `etendo-go-local` only) | [imps/IMP-11](imps/IMP-11.md) · audit §5 |
| **IMP-12** | Projection for `neo_schema` (`view:"create"`, `fields:[…]`) | P1 | C2 | 2.5 / 5 | ⚙️ | `com.etendoerp.go` | ⚠️ partial | A10, **B6**, C2–C4 · 61,963 chars / 157 fields exceeds the agent's budget — reproduced byte-for-byte on 2026-08-06, where the call **failed outright** against the client token limit rather than merely being wasteful · root-caused 2026-08-06, IMP-11 dependency now satisfied; the specified filter rule was measured wrong and corrected in [imps/IMP-12](imps/IMP-12.md) §4–5 · **implemented 2026-08-06 (uncompiled, unprobed)**: `view:"create"` + `fields:[…]` written across 4 files, reclassified ♻️ → ⚙️ because `userRequired` narrowed in the default response too — see [imps/IMP-12](imps/IMP-12.md) §9 · probed live twice: −89.1 % (7,853 chars) and the ♻️ half proved by `diff`, but the probe exposed that 4 of the 6 `required` fields are already resolved by `neo_defaults` ([imps/IMP-12](imps/IMP-12.md) §11.2) — cross-check committed `977daf85` **and probed live: it had no effect** — it read the top level of a `{defaults:{…},metadata:{…}}` body, so `requiredCount` stayed 6; re-fixed in `fed3902a`, not re-probed. `fields:[…]` + `unknownFields` verified ✅ after an `/mcp` reconnect ([imps/IMP-12](imps/IMP-12.md) §12–§13) · **6 of 7 done-when ✅ on `etendo-go-local` as of `fed3902a`**: `view:"create"` returns 2 / 22 on both `sales-invoice` and `purchase-invoice`, agreeing with `neo_defaults` field-for-field ([imps/IMP-12](imps/IMP-12.md) §14). Remaining row is a **release**, not a code gap — flip needs a `/mcp-comparison` run with M1/M2 re-measured · §14.3's two-view divergence closed by decision (document the full dump's `userRequired` as a static approximation; no new IMP) · §15 records a defect **of the projection**: on an uncurated entity the view returns empty and its `hint` tells the agent to stop looking — 89 / 230 MCP-exposed POST-able entities, 85 of them auxiliary sub-tabs that should lose `ispost` · **advanced to ⚠️, not ✅, by the 2026-08-10 run.** The release happened and it works where the view is complete: `sales-invoice/header` returns 2 required / 22 optional and **the create succeeds on the first call** (C2, C3) — this single change is most of M2's 40 % → 80 %. But the 7th done-when row turned out **not** to be a pure release: the view still omits genuinely required fields on `sales-order`, so following it verbatim still fails there (C4). `partnerAddress` is fixed; **`invoiceAddress` on `sales-order/header`, `orderDate` on `sales-order/lines`, and the parent FK `salesOrder`** (accepted when sent, never advertised) are not. That is also the whole reason the frozen suite over-reports M2 — see [`mcp-comparison-post-audit-2026-08-10.md`](mcp-comparison-post-audit-2026-08-10.md) §6 · sharpened by C18: the **correct** field list already exists in the `docs` corpus, so this is now a divergence between two sources of truth rather than missing information | [imps/IMP-12](imps/IMP-12.md) · audit §5 |
| **IMP-13** | Backfill `businessCritical` + `namedFilters` authoring (+ validator rule F11) | P2 | C2 | 0 / 3 | ♻️ | `schema_forge` | ⏳ open | 3/246 and 2/246 entities authored | audit §5 |
| **IMP-14** | Realign `etendo-go-docs` with the real tool names | P2 | C2 | 1.5 / 3 | ♻️ | `etendo-go-docs` | ⚠️ partial | A9, **B9**, C18 · closing this also closes IMP-10 · **re-checked 2026-08-07: the item is half-resolved, and the resolved half no longer reproduces.** The tool-name drift was fixed by `36740dc` "Fix MCP tool name drift in agentic docs corpus" (2026-07-31, merged to `main` via PR #30): the checkout has 0 `etendo_neo_` occurrences and the **live Context7 index returns 0** `etendo_neo_*` and only `neo_*`, so the B9 observation is historical. The remaining half was confirmed still open by the same query — `view` count **0** across three topic queries, and every `"fields"` hit is a response key rather than the parameter. Addressed 2026-08-07 in `etendo-go-docs` `18eb0dd` on `feature/ETP-4793` (branched off `main`, since `feature/ETP-4601` is merged and stale): the shipped optional arguments are now in the tool table and a *Response-shaping arguments* section gives the wasteful call next to the narrowed one, with descriptions transcribed from `ToolRegistry` so the two cannot drift again. **Unpushed, no PR** — and the corpus is served by Context7 from `main`, so nothing changes for a live agent until it merges. The same commit also drops `neo_batch`'s unqualified atomicity claim, per the defect in [imps/IMP-15](imps/IMP-15.md) §9.2.1 — now registered as **IMP-23** and reproduced a fourth time · **advanced ⏳ → ⚠️ on 2026-08-10** for the half that is live: C18 confirms the corpus serves `neo_*` names and usable per-spec recipes. The other half is still worth **0** — `18eb0dd` remains **unpushed with no PR**, and Context7 serves from `main`, so no live agent sees the `fields`/`view` documentation yet. This is the cleanest example in the registry of *committed ≠ delivered* · **pushed and opened as PR #33 against `main` on 2026-08-10**, four days after the commit. Re-verified before pushing rather than trusted: `ToolRegistry.java` has not changed since `18eb0dd` (its last commit `12dd847f` landed 38 min earlier), all seven response keys the corpus promises exist in source (`serverDefaulted`, `unknownFields`, `unresolvedFields`, `"grouped"`, `"minimal"`, `"summary"`, `"actions"`), and the `field` alias matches `ToolRegistry.java:529` verbatim. One thing **had** aged and was added as `8da3260`: the `neo_batch` caveat warned that a failed batch may be dirty but not that the outcome depends on *when* it failed — pre-transaction FK/`$ref` failures roll back cleanly and look atomic, persist-time failures do not — so an agent verifying the caveat once with a bad FK name would have concluded the batch **is** atomic. **Still worth 0 until the merge**, and the score needs Context7 to reindex on top of that: an open PR is not delivery either · **PR #33 merged to `main` 2026-08-10 16:37 UTC (`9ba22cf4`) — and the item is *still* worth 0, now measured rather than assumed.** Querying the served corpus immediately after the merge returned the **old tool table**: `neo_list` with `filters, limit, offset, orderBy` and no `fields`/`view`, `neo_schema` with no optional arguments at all, and `neo_batch` still described as running its operations *"atomically"* — the precise unqualified claim `18eb0dd`/`8da3260` removed. That block is one the merge rewrote, so this is positive evidence of a stale index, not a retrieval miss; the `Source:` URLs confirm it serves `blob/main`, just an earlier snapshot of it. **So this item has three gates, not two — commit, merge, reindex — and each one looked like delivery from the inside.** That is the whole lesson of IMP-14 and it is worth carrying to every corpus change: the only measurement that counts is a query against the served index. Re-measure before crediting the 3 points **Separate finding, unregistered:** `develop` and `main` have diverged and `develop` still carries the `etendo_neo_*` drift PR #30 removed from `main` (5+ files), so a future `develop` → `main` merge would reintroduce the exact defect IMP-10/IMP-14 closed | audit §5 |
| **IMP-15** | Unify the FK contract across write verbs | P1 | C2 | 5 / 5 | ⚙️ | `com.etendoerp.go` | ✅ resolved | W3, W8, **B11, B15**, **C6–C10** · see **Appendix A** · **implemented 2026-08-07 (uncompiled, unprobed)**, commit `12dd847f` → [imps/IMP-15](imps/IMP-15.md): all three A.6 fixes plus the `uOM` secondary. `McpFkResolver` is id-first (`existsAsRecordId` probes the value as a record id of the target entity via read-access-checked `OBDal#get` **after** the free shape checks, so a UUID still costs no DB hit) and the *"pass the exact record id instead"* advice is gone; `neo_batch` bodies run through the same resolver before the transaction opens (`McpToolRouter#resolveBatchFkNames`, skipping `$ref:` placeholders — hence `BatchService.REF_PREFIX` widened to `public`); batch failures are rewritten into the IMP-5 envelope **in the MCP layer only** (`McpToolRouterSupport#toMcpBatchFailure`, mutating in place so the route test's static mock cannot NPE), adding `server_error` / `method_not_allowed` and dropping the raw DAL `status: -4` while the REST `/batch` contract stays untouched; `handleCreate` now runs `NeoCommercialLinePolicy#injectProductDerivedUomIfMissing`, the same injection `NeoCrudHandler#executePostCreate` does, removing the bare `500 "Unit of Measure mismatch"` on `sales-order/lines`. Unit coverage for A.7's format matrix lives in `McpFkResolverTest` (UUID / legacy numeric / display name / `$ref:` skip) and `McpToolRouterSupportTest` (envelope, status→code map, DAL-message extraction). Flip needs the user's compile + deploy and a `/mcp-comparison` run · **probed live 2026-08-07 on `etendo-go-local` under per-run write authorization** ([imps/IMP-15](imps/IMP-15.md) §9): **three of four clauses pass** — the legacy numeric id `currency:"102"` resolves on `neo_create`, the display name `currency:"EUR"` resolves on the batch header op, the new `not_found` wording is live (which is also what proves the deploy carried IMP-15, making the other verdicts attributable), and a batch failure returns `{committed:false,failedAt:{index:1,id:"l1"},error:{status:500,error:"server_error",detail:…,seeAlso:…}}` with no raw `status:-4`. The **`uOM` secondary failed three times** (AD message 20111 on *both* verbs) — against `12dd847f`, against `2df04cd1`, and against `b64af873`. The deployed bytecode was verified live on the last two rounds (`javap -c -p` showed the guard byte-for-byte), which ruled out a stale deploy twice over and still explained nothing; what settled it was `docker logs etendo-tomcat-1`, available all along despite an earlier session concluding log-based debugging was impossible because `$CATALINA_HOME/logs` is empty — Tomcat runs in a container and logs to stdout. Actual cause, fixed in `845e9363`: the body's `uOM` was **real, valid and wrong**. `C_UOM_ID` is mandatory on `C_OrderLine`, so `NeoDefaultsService#tryInjectFirstFromLookup` preselects the first combo option — alphabetically *Centimeter* — before the product callout runs; the callout then answers correctly (`"uOM":{"value":"100","_identifier":"Unit"}`) but the field is already in `protectedCalloutFields`, so the guess survives into the INSERT (`C_UOM_ID = 'ADF850C3E6E9413B9F9EEA5C87456073'`) and the trigger rejects it. All three earlier fixes widened the guard's notion of "absent" (`""`, then `"0"`, then `"null"`) against a value no widening could ever match. The fix inverts the question: "is the body's `uOM` non-empty?" is not a proxy for "did the caller choose one?", so the policy now takes an explicit `userProvidedUom` flag from the pre-defaults snapshot each call site already keeps — the product wins over anything the defaults pass guessed, and only a caller-supplied value wins over the product. This also retires `2df04cd1`'s premise that the batch path never ran the injection (it does, via `NeoCrudHandler.java:385`). **Re-probed green on 2026-08-07 after the `845e9363` deploy** ([imps/IMP-15](imps/IMP-15.md) §9.6): the line creates on the **first call with no `uOM` sent**, returning `"uOM":"100"` / `"Unit"`, on `neo_create` **and** on `neo_batch` — the first end-to-end `committed:true` batch of the exercise, with the display name `currency:"EUR"` resolving on the header op. **All four A.6 clauses are now credited live**; what remains for the flip is a `/mcp-comparison` run (and the module's unit suite, not yet run against either commit). The injection still deserves a regression test asserting the case that actually broke (override a defaults-injected id, preserve a caller-supplied one) rather than the sentinel cases the last two fixes over-fitted to. A further candidate defect: `tryInjectFirstFromLookup` preselecting the alphabetically first combo option for a mandatory FK is guaranteed wrong for any derivable one — `845e9363` fixes the `uOM` symptom, not the general case. The same probe surfaced **three defects awaiting registration by the next run** ([imps/IMP-15](imps/IMP-15.md) §9.2): `neo_batch` is **not atomic** despite documenting that it is (each op reaches `DefaultJsonDataService.add`, which ends in `commitAndClose`, so the later `rollbackQuietly` finds an empty session — two independent runs left orphan zero-line headers `1000017` and `1000020` under `committed:false`, which also contradicts the transactional-integrity *strength* in base §8); `neo_schema view:"create"` omits genuinely required fields — `invoiceAddress` **and** `partnerAddress` on `sales-order/header`, `orderDate` on `sales-order/lines`, observed across three rounds, so the first call fails even when the agent follows the create view exactly; and `neo_create`'s own line-create error still arrives raw, outside the IMP-5 envelope (IMP-17 scope). Round four added a **third independent reproduction of the non-atomicity defect**, and the most realistic one: a caller-side `$ref` typo (`$ref:h1.id` for `$ref:h1`) failed the batch at index 1 and still left orphan header `1000024` under `committed:false` — an unresolvable `$ref` is also not caught by the pre-pass, leaking as a raw DAL *"refered to but not present in the import set"* instead of naming the unknown op id · **✅ resolved by the 2026-08-10 run** against the deployed build `a4963b6b`. All four A.6 clauses hold live, and the `a4963b6b` narrowing is verified **from both sides**: a `sales-order/lines` create with **no `uOM` in the body** returns `"uOM":"100"` / `"Unit"` — the product's own base UOM, not the alphabetical *Centimeter* guess — with no trigger 20111 (C6), while `product/alternateUom` **abstains** and returns `missingFields:[{name:"uOM",column:"C_Uom_ID"}]` rather than injecting a semantically wrong value (C7), which is exactly what the `TRANSACTIONAL_QUANTITY_PROPERTIES` whitelist was added to guarantee. Legacy numeric and display-name resolution both hold (C8). **Two honest caveats on this ✅:** the module's unit suite has still **never been run** against `b64af873`, `845e9363`, `f0e488de` or `a4963b6b` — that is owed by the user and is a process gap, not a behavioural one, which is why it does not hold the flip; and the injection still lacks the regression test asserting the case that actually broke (override a defaults-injected id, preserve a caller-supplied one). **First caveat discharged 2026-08-10** (IMP-16 §9.3): the suite runs green at a HEAD that contains all four commits — after fixing nested Mockito stubbing in this item's own `NeoCommercialLinePolicyTest` (`f30cd598`), which had never compiled either. The second caveat stands: `NeoCommercialLinePolicyTest` covers the `userProvidedUom` flag, so the case is now asserted at unit level, but not the defaults-injected-id override end to end. The three defects this item's probes surfaced are now registered by the 2026-08-10 run: non-atomicity → **IMP-23**, the incomplete create view → folded into **IMP-12**, the raw line-create error → folded into **IMP-5** (the `$ref` leak lands there too). The general `tryInjectFirstFromLookup` candidate **did not reproduce** on C7 and is recorded unnumbered in the run report §8.3 rather than asserted either way | [imps/IMP-15](imps/IMP-15.md) · audit §5 |
| **IMP-16** | One date format across `neo_defaults` and the write verbs | P1 | C3 | 2.5 / 5 | ⚙️ | `com.etendoerp.go` | ⚠️ partial | B9, B13, **C11** · `invoiceDate` emitted `DD-MM-YYYY`, `accountingDate` ISO, same payload; `neo_create` misparses the former silently. **Persisted corruption confirmed on `etendo-go-local`: 14 rows, incl. 100 % of NEO-created `c_order.datepromised`.** Root-caused + fix implemented (not deployed) → [`imps/IMP-16.md`](imps/IMP-16.md): **three** formats, `dd-MM-yyyy` is the baseline (`@#Date@` → core `DateTimeData.today`, hardcoded), ISO only where an ETP-4244 callout normalized it, and the write path stores **year 0012** rather than failing (lenient `JsonUtils.createDateFormat()`; no date branch in either NEO coercer) · **the 2026-08-10 run splits this item in two and credits only one half.** The **read/emit half is fixed and verified**: every date came back ISO on `neo_defaults`, `neo_create` and `neo_update`, across `sales-order` and `sales-invoice` — the `DD-MM-YYYY` / ISO split in the same payload no longer reproduces. The **write-parse half is worse than this item specified**: it does not merely misparse, it **silently persists garbage under `status: 0`** and propagates it to sibling date fields the call never named — `orderDate:"09-08-2026"` stored `0015-02-16` on *both* `orderDate` and `accountingDate` (C11), confirmed in the DB and reproduced arithmetically (`date(9,8,1)+2025d`). That is the live root cause of the 14 corrupt rows, now demonstrated end to end rather than inferred. **It is registered separately as P1 IMP-24 rather than left inside this ⚠️**, deliberately: this item's mechanism (canonicalize on emit) shipped and works, so leaving the corruption here would let a half-credit conceal a data-destroying defect · **the write half is now closed at its real cause, and the 08-10 diagnosis was wrong about what that cause was** → [`imps/IMP-16.md`](imps/IMP-16.md) §9: the write-side coercer had shipped as well, it was simply **never invoked from `neo_update`** — `handleUpdate` mapped, resolved FKs, wrapped and persisted with no coercion pass, while the REST update path is protected only by the accident that `NeoTypeCoercionHelper.wrapForSmartclient` coerces internally and the MCP copy of that wrapper (Javadoc: *"identical"*) never gained it. Both coercers' unit tests assert `06-08-2026 → 2026-08-06` and neither could have failed on this, because a **missing call site** is invisible to any test of the callee (**corrected 2026-08-10:** an earlier wording said those tests *"passed throughout"* — they never ran at all, see below; the argument holds, the fact was wrong). Fixed by adding the pass to `handleUpdate` (before the pre-hook, so a date-mirroring hook copies a canonical value) plus a source-reading guard that fails when a method reaching `jsonService.add`/`update` does not coerce — verified to flag `handleUpdate` on the pre-fix source and pass on the fixed one · **compiled, redeployed and probed the same day — the write half is verified** → [`imps/IMP-16.md`](imps/IMP-16.md) §9.1: **C11 no longer reproduces.** `neo_update orderDate:"09-08-2026"` now returns and stores `2026-08-09`, with `accountingDate` mirrored as `2026-08-09` — proving by observation that coercing before the `NeoHandler` pre-hook is what keeps the sibling field canonical. A create with no dates stores three real 2026 dates. The log shows exactly the expected `INFO` normalization and one `WARN`, nothing else. Probed on a record created and deleted for the purpose (`MCP-BENCHMARK 2026-08-10 date-fix`), marker sweep clean. What is **still unrun** is §7's checks 1, 2 and 4 — the `neo_defaults` diff over ~8 windows and the React-form round trip, both on the read/emit half the 08-10 run had already credited behaviourally. **The score stays 2.5 / 5 here on purpose:** re-scoring is a `/mcp-comparison` measurement, not a bookkeeping edit · **the test half of this item is worth less than it looked** → [`imps/IMP-16.md`](imps/IMP-16.md) §9.2: the date tests mocked `Property#isTimestamp()`, **a method that does not exist** (`isTime()` is the accessor for `TimestampDomainType`). Three test classes named it, so `compileTestJava` had been failing since 2026-08-06 17:12 and **no date test of IMP-16 has ever run under Gradle** — newest results predate that commit by 7 h, `NeoDateFormatTest` has no result file at all, and the surviving coercer cases are boolean/numeric only. Fixed in `com.etendoerp.go@6a311a65`, no behaviour change (the domain type in the docs was already right). It survived a *"verified out-of-container 28/28"* claim because a stub `Property` cannot refuse a fabricated method — **the out-of-container shortcut cannot validate an API surface**, which is the reusable lesson. The live probes in §9.1 are unaffected · **that owed run happened the same day and the suite is green** → [`imps/IMP-16.md`](imps/IMP-16.md) §9.3: `NeoDateFormatTest`, the `McpToolRouterSupportTest` date cases and the new `McpWriteVerbCoercionCallSiteTest` have executed for the first time, so **the guard test is load-bearing from here on**. Two fixes were needed to get there, both consequences of the 4-day compile outage rather than new defects: nested Mockito stubbing in `NeoCommercialLinePolicyTest` (`f30cd598`), and — the one worth remembering — **three tests still verifying the ISO `#Date` session seeding that this item's own `926e4023` had removed** (`0566c8c4`, inverted into `never()` guards rather than deleted). A removal-without-test-update shipped inside this IMP and stayed invisible for four days: a broken compile does not merely delay feedback, it lets unrelated debt accumulate behind it | audit §5 |
| **IMP-17** | Wrap callout + routing errors in the IMP-5 envelope | P2 | C3 | 0 / 3 | ♻️ | `com.etendoerp.go` | ✅ resolved | B13, **B20** (the cell previously cited B6, which is IMP-12's token-limit failure; the 2026-08-06 run report line 90 registers this item from B13 + B20, and B20 is the case the cell itself quotes) · raw untranslated `"La fecha de operación…"` and `"Entity not found: header"` bypass the envelope entirely. **2026-08-11:** implemented (`3db3b4c5`, `08182a77`) — [`imps/IMP-17.md`](imps/IMP-17.md). Every raw error escaped through exactly **three** funnels (`checkJsonServiceError` returning a `String`, `route`'s single catch-all, `NeoCrudHandler.checkJsonServiceResponse`), so one change closes all of them: callout → 422, per-field failure → 422 + `fieldErrors` with the DAL transport dropped, duplicate key → 409, read failure → 500, unknown spec → 404, unknown entity → 404 **+ `available`**, report spec on a CRUD tool → 422, verb not enabled → 405, missing argument → 422. **Absorbs IMP-23 §9.4** on the human's instruction (§9.4 named IMP-17 as its home, and a new number would force a quota re-base for identical code): the omitted-FK 500 carrying a ~90-column Postgres failing-row dump is now the `MISSING_REQUIRED_FIELDS` 400 naming the property, with the dump stripped by shape (a parenthesised run ≥200 chars) rather than by its localised lead-in. **Also closes IMP-5's clause (ii)** — C14's raw unknown-named-filter string — which was not optional: tightening the catch-all would otherwise have reclassified that `IllegalArgumentException` as `server_error`, telling an agent to stop retrying a call one corrected word would fix. Clause (iii) (read/write envelope nesting) is *probably* closed since all five DAL call sites now render one flat envelope, but that was observed live and only a live re-probe identifies the path; clause (i) (C9's batch FK failure) is a different funnel and untouched. 7289 / 7291 tests (the 2 pre-existing `OnboardingDatasetNormalizerTest` classpath failures), plus 120 / 120 for `McpToolRouterTest`, which the harness silently skips on a false `OBBaseTest` match in a javadoc. **Verified live 2026-08-11 / 08-12** (§8, eight probes): B20's exact vector returns the 25 real entity names, C14 returns the 422 with `["completed","pending","partial"]`, B13's callout returns the 422 with its message intact and no invented `field`, the read-only entity returns a 405 with no `hint`, and the unknown spec returns the 404 **without** `available` — the deliberate omission of §4.3 measured rather than argued. **One probe failed and is the most useful part of the file**: §9.4's batch came back 500 with the dump correctly stripped, which localised the bug to `resolvePropertyNameForColumn` returning `null` — because core HTML-escapes messages, so the column arrives as `&quot;c_bpartner_location_id&quot;` and a pattern expecting a bare `"` matched nothing. **IMP-23 §9.4 had recorded that escaping** in the same sentence as the dump; I read it as cosmetic and fixed the loud half. Third commit `930e484f` (delimiter accepts `&quot;`/`&#34;`, unit test carries the live message verbatim); re-probe returns **422 `missingFields:["partnerAddress"]`**, the property rather than the column, no Postgres text. Two corrections fall out: §4.3's premise *"a spec exposes a handful of entities"* is **false** (`product` exposes 25, ~300 chars) though the decision survives on the round-trip argument instead; and **IMP-5 clause (iii) is settled** — read *errors* are flat, read *successes* are still `{"response":{…}}`, so that nesting is the success body and was never this funnel. Also confirms **IMP-22's C4/C5** for free (B13's probe sent both FKs as display labels; reaching the callout means both resolved). Row moves to ✅ on that evidence with the **score still 0 / 3**, the same split IMP-23 used — 3 / 3 waits on a `/mcp-comparison` re-measure. Still unprobed: the read-path 500, the 409 duplicate-key branch, the non-English `lc_messages` case, and the REST/React path | audit §5 |
| **IMP-18** | Report unknown names in a `fields` projection | P2 | C3 | 0 / 3 | ⚙️ additive | `com.etendoerp.go` | ⚠️ partial | B8, **C15** · `salePrice`/`purchasePrice`/`stock` dropped in silence, no `warnings` array · **re-confirmed unchanged 2026-08-10, and now sharper than when it was registered**: IMP-12 shipped `unknownFields` on `neo_schema`'s `fields` argument, so the same argument name on `neo_list` has two behaviours — this is a consistency defect with the fix pattern sitting one tool over, not a missing feature. It is also the **sole** reason frozen task 3 still fails, i.e. the cheapest item on the board relative to its effect: closing it alone takes M2 from 80 % to 100 % · **implemented 2026-08-10** ([IMP-18.md](imps/IMP-18.md)) — `unknownFields` on both `neo_list` and `neo_get`, validated against the spec's emittable keys rather than the returned rows so it fires on an empty result set too; fixing it also exposed a second silent drop, `fields:["<fk>$_identifier"]` returning only `id`. **Score stays 0 / 3**: not deployed, so C15 has not been re-probed, and the full `./gradlew test` is still owed (the 10 new tests were run standalone, 50/50 green) · **compiled, deployed and verified live the same day** ([IMP-18.md](imps/IMP-18.md) §7): **C15 no longer reproduces** — the three names come back in `unknownFields`. Six read-only probes, and two of them are the ones that matter: on an **empty result set** the typo is still reported (`data:[]` + `unknownFields:["salePrice"]`), the case where a row-inspecting implementation goes silent and the agent concludes the data is missing rather than that it asked wrong; and `fields:["dateAcct"]` **is** reported even though `dateAcct` is a real DAL property, because the spec serves it as `accountingDate` — so validating against `ModelProvider` would have passed it in silence. `neo_get` behaves identically, the `$_identifier` companion now returns the FK and its label, and a clean call adds no key. **Score still stays 0 / 3 here on purpose:** re-scoring is a `/mcp-comparison` measurement, not a bookkeeping edit — what this run establishes is that the fix works, not the new M2 number. The full `./gradlew test` remains owed | audit §5 |
| **IMP-19** | Type the report-generator contract | P2 | C3 | 0 / 3 | ⚙️ | `com.etendoerp.go` | ✅ resolved (score pending re-measure) | B3–B5 · registered 2026-08-06. **Implemented 2026-08-11 (`7282112e`), verified live 2026-08-12** — see the end of this cell. The cell's three clauses all hold, but it **mis-stated the cause of the first and missed a fourth defect larger than the other three together**. `parameters` was a bare `{"type":"object"}` not because the report specs were unconfigured but because they *cannot* be: `buildProcessParamSchema` emits a property only when `field.getADColumn() != null`, and a report's inputs (`dateFrom`, `recOrPay`, `glId`) are arguments to a query, not AD columns of any table — there is nowhere in `ETGO_SF_*` for them to live, so backfilling configuration could never have helped. The missing fourth: **5 of the 8 tools could never succeed at all**. Callability was `any entity declares a Java_Qualifier`, but a qualifier says a handler serves the entity, not that it generates a report — `financialAccountsPageHandler`, `reconciliationHandler`, `bankStatementsHandler`, `financialAccountTransactionsHandler` and `financialAccountBankConnectionHandler` are React UI handlers dispatching on an `action` **query** param, while `handleReport` POSTs a body with no query params, so each could only ever answer 405 or 400 — advertised, callable-looking, impossible to use. All four defects are one missing fact: nothing recorded *what a report generator accepts*, so it could be neither published, nor validated, nor used to tell a report generator from a page handler. Fixed by putting the declaration where the only authority is — the handler (`reportParameters()`/`reportFormats()`), the same argument `servesActions()` already makes for actions — resolved once into a `NeoReportContract` read by the tool schema, discover, the router's validation and the GET descriptor, so what an agent is shown and what it is judged against cannot drift. The load-bearing detail is `Optional.empty()` ("not a report generator", **no tool emitted** — this is how the five disappear, untouched, still serving the React UI over NEO REST, their only caller) versus `Optional.of(List.of())` ("a real report with no inputs" — B5's case, where an agent could not tell the two apart). Dates are typed as dates rather than strings **because IMP-16 recorded silent corruption from exactly that conflation**, closed sets become enums, and only genuinely mandatory inputs reach `required`. `format` is now an enum of what is served — `["json"]`, and that was **checked, not assumed**: the three real handlers return `NeoResponse.ok(json)` with zero mentions of pdf/xlsx/csv, Jasper is prohibited by ETP-4255, the only `application/pdf` path downloads an existing attachment, and `McpToolRouter` never read the string `"format"` — so `format:"pdf"` was answered with JSON and nothing said the argument was ignored; it is a 422 naming `supportedFormats` now. §4 records a **refused** fix: the Aging GET descriptor declared `recOrPay` required while the code defaults it to RECEIVABLES, so declaring it required would have rejected calls that work today — it is optional with a closed set and a documented non-neutral default. That descriptor is now rendered *from* the declaration, because the Aging contract had been written down in three places, no two agreed, and `glId`/`showDetails` were read by the code and appeared in none. Two obsolete tests were **rewritten rather than deleted**, and one of them (`isReportCallable` true from a qualifier alone) was the exact belief that shipped the five dead tools. 7269/7271 unit tests pass (2 pre-existing onboarding-resource failures). Unverified: nothing probed live — that the five leave the catalog, that typed dates and the 422 appear, and that the React UI is unaffected; and IMP-23 §9.3's stale-tool-description limit applies verbatim, since a connected MCP client keeps offering the five retired tools until it reconnects · **verified live 2026-08-12** ([`imps/IMP-19.md`](imps/IMP-19.md) §6, five probes) — and the stale-catalog limit above is what made the verification *possible* rather than blocking it: the session held the **pre-deploy** schemas, so every probe exercised the server's own validation instead of a schema the client had already been handed. `generate_tax_report({})` returns the 422 with `missingParameters:["dateFrom","dateTo"]`; `format:"pdf"` returns the 422 with `field:"format"` and `supportedFormats:["json"]`, §2.2's hint verbatim; a valid call returns real data with `meta` echoing 8 of the 12 declared parameters filled from the code's own defaults (`dateType:"acct"`, `transactionType:"B"`, `taxType:"tax"`, `bpNameType:"commercial"`, three booleans `false`) — which is the typed contract being *used*, not just published. `generate_bank_statements({})` answers `callable:false` / `not_configured_for_report_generation`, so the five dead tools are refused at the router even while a stale client still offers them; **catalog retirement itself is confirmed in code** (`ToolRegistry:143`, `resolveReportContract(...).ifPresent(...)` — no contract, no tool) because an unauthenticated `POST /mcp` `tools/list` returns 401 and this session cannot mint a bearer token, so the live listing is owed on a reconnected client. **§4's refusal measured right**: `generate_aging_receivable({})` passed validation, i.e. the phantom `recOrPay: required` from the old GET descriptor would have rejected a call that works. **One new defect, and it is the reason this probe set was worth running**: that same Aging call then failed *inside* the handler with `{"error":{"message":"No accounting schema with currency is configured for organization 6184…","status":422}}` — the nested pre-IMP-5 shape, no branchable `error` code, no `seeAlso`. Report handlers are a **fourth** error funnel beyond the three IMP-17 §3 enumerated: `validateReportRequest` uses the canonical envelope but runs *before* the handler, so everything the handler itself raises escapes. Routed to **IMP-5 as clause (iv)**, not a new number, on the IMP-23 §5.1 / §9.4 → IMP-17 precedent. Row moves 🔧 → ✅ on §6 with the **score still 0 / 3** — status and score move on different evidence, the same split IMP-17 and IMP-23 used. Still unprobed: `generate_inventory_stock_report`, Aging end to end (blocked by the missing accounting schema on org `61849243BE89460EB70866880A545D50`, an instance-data gap not a code one), the live `tools/list` retirement, and the React UI still driving the five retired handlers over NEO REST | audit §5 |
| **IMP-20** | Projection on write-verb responses | P2 | C3 | 0 / 3 | ⚙️ additive | `com.etendoerp.go` | ⏳ open | B14, B16 · `neo_create`/`neo_update` return ~80 fields incl. `_computedColumns`, `recordTime`; IMP-2 covers only `neo_list`/`neo_get` | audit §5 |
| **IMP-21** | Curate the actions catalog | P2 | C3 | 0 / 3 | 🔧 | `com.etendoerp.go` + `schema_forge` | 🔧 implemented, live verification owed | B7, **C16** · 13 of 19 labels are raw column names (`RM_ReceiveMaterials`); 10 buttons flagged `required:true`; `businessCritical:false` on `documentAction` and `posted` · **re-confirmed 2026-08-10 on a catalog that grew 19 → 22 actions**: raw labels persist (`EM_Aeatsii_Dup`, `EM_Aeatsii_Unsubscribe`, `EM_Psd2_Generate Bank Payment`), 8 buttons still flagged `required:true`, and `businessCritical` is still `false` on the two most consequential actions in the catalog — which is why **M4 did not move this run** even as M1 and M2 both did. Partial credit to IMP-11: every action now carries `visibility` and `userRequired` · **Implemented 2026-08-12** ([`imps/IMP-21.md`](imps/IMP-21.md)), row **⏳ → 🔧** on IMP-22's precedent (implemented, nothing probed live, worth zero until it is). All three clauses hold in direction; **two of the three counts are stale and the third understates the defect by a factor of eleven**. `businessCritical` is not merely uncurated on `documentAction` and `posted` — a `count(*)` over `ETGO_SF_FIELD` joined to `AD_Column` on `ad_reference_id='28'` with `isbusinesscritical='Y'` returns **0**, so the flag has **no producer for buttons anywhere** and was emitted `false` 22 times out of 22; that is not a neutral default, since `businessCritical:false` reads as "nobody needs to think before firing this" on the two actions that change a document's legal and accounting state. Raw labels are **3 of 22**, not 13 of 19, and `required:true` is back up to **10**, not 8. Four defects the cell never named, the first larger than any registered one: **17 of 22 actions were curated `visibility:"discarded"` and still advertised `invokeVia:"neo_action"`** — 22 entries all claiming to be callable, with nothing separating the handful the window exposes from the ones curation had deliberately excluded; the truth *was* in each object, sitting next to a contradicting claim, in a field-visibility value designed for form fields; plus `createLinesFrom` advertised callable with no process behind it at all, `aPRMProcessinvoice` duplicating `documentAction` (same 12 `actionValues`, same `actionParameter`, different `processId`) with nothing saying which to use, and `agentPrompt` on exactly one of the 22. The producer table (§2) is what makes the split defensible: the catalog was **not short of information**, it was carrying a second, unearned assertion beside the honest one — `required:true` sat next to `userRequired:false` on the same object 10 times — so most of the fix is subtraction. **Five of the seven defects are producer bugs in the generic Java layer**, on the criterion `McpSchemaFieldBuilder`'s own `addActionValues` javadoc already sets (*which* `docAction` value is legal in a given state is per-window judgement and travels in `agentPrompt`; *that* a `docAction` button is consequential is structural). `required` is **removed** rather than set `false`, because a button has no payload slot so both values are wrong and the honest report is the absent key. `invokeVia` becomes **a claim rather than a decoration** — emitted only when the button is really invokable, otherwise `invokable:false` plus a machine-readable `notInvokableReason` — while the action stays **in** the catalog (knowing an action exists but is out of scope is useful; being told it is callable when it is not is the unrecoverable case), and an *uncurated* button stays invokable because absence of curation is not a decision to exclude and the opposite would silently retire actions on the 89 entities IMP-11 counts as uncurated. `businessCritical` is derived only from the `docAction` list binding and the `Posted` accounting trigger — both readable off the column and true on every document window — because a derivation that flagged everything would fail the same way `false`-on-everything did in the other direction; curation always wins over it. The label chain is curated `AD_Field` label → process name → `EM_<module>_` stripped, firing only on `EM_`-prefixed columns, which is exactly the module-contributed case where no `AD_Field` exists to overlay. `invokableCount` joins `actionCount` so the split is visible without walking the array. The duplicate-action defect is answered **for free**: `aPRMProcessinvoice` is `discarded`, so one of the pair is now callable and the other says why it is not. **`neo_action` is deliberately left ungated** — the registered defect is a description defect, and a runtime gate would change behaviour on a path the React UI also drives. Three assertions were **rewritten rather than deleted**, and one of them (`buttonColumnWithNoProcessEmitsOnlyTrigger`) had been *pinning* the no-process defect; 15 tests added. Left open rather than guessed: `agentPrompt` for the other 21 actions, the AD duplication itself, and **which of the 17 discarded actions should be promoted** — the fix makes the current curation honestly reported, not right, and promoting one is a per-window product decision. Owed live: `invokableCount` well below `actionCount:22`, the three `EM_*` labels gone, no action carrying `required`, and `documentAction`/`posted` back as `businessCritical:true` — the last being the one that moves **M4**, which this item has been the sole blocker on | audit §5 |

| **IMP-22** | Resolve display names on **context-dependent** FK selectors | P2 | C4 | 0 / 3 | ⚙️ | `com.etendoerp.go` | 🔧 fix implemented, live verification pending | **C4, C5** · registered 2026-08-10. `neo_create` on `sales-order/header` rejected `partnerAddress` with 422 `not_found` using the exact `$_identifier` the read path returns — and `neo_selectors` on the same column with `recordContext:{businessPartner:…}` returns `label:"Madrid, Avenida Independiente 23"`, **byte-identical to the value the writer rejected**. So this is not a bad input: the write-path resolver does not consult selectors whose candidate set only exists relative to a parent field. **Distinct from IMP-4**, which is about *format* (UUID vs legacy numeric vs display name) and whose two clauses are now closed — this is about *scope*, and it is why IMP-4 stays ⚠️. Fix must feed the already-submitted sibling fields into the resolver as selector context, i.e. the same `recordContext` the read path already builds **Fix implemented 2026-08-11** (`com.etendoerp.go` `c3ce6c5e`), **not yet verified live** — status stays short of ✅ deliberately, because the only thing that can settle it is the same C4/C5 vector re-run against a deployed build, and the deploy is the user's. `McpSelectorContextHelper.withBodyContext()` feeds the body's own sibling fields in as selector context, reusing the body-key → classic-param mapping the read path already had — which is why the change is small. The hard part was **dependency order**: `partnerAddress` is only resolvable after `businessPartner`. `McpFkResolver` now runs a cheap pass 0 (id checks only, so a field already holding an id becomes context for free and never costs a selector call) then retries the remainder pass by pass, deferring failures; no dependency graph is modelled, order is discovered by trying, and *no progress* terminates the loop precisely because it is also the condition that makes an error final rather than an artefact of missing context. The **exclusion list is the whole design**: an unresolved search string copied into `C_BPartner_ID` would narrow the dependent selector to nothing and turn a resolvable field into a `not_found` — worse than the bug. Worst case O(n²) selector calls for n FK-by-name values in one body. Fixed inside the resolver, so all three `McpToolRouter` call sites (create :448, update :585, batch :1117 — each passing a literal `null` for args) benefit untouched. 39 unit tests pass (7 new); they pin *what context each selector call is given*, which is the claim a green end-result test would not have made. **2026-08-11: the C4/C5 vector passed live**, as a side effect of IMP-17's B13 probe (IMP-17 §8.4) — a `neo_create` on `sales-invoice/header` sent `businessPartner:"Juan Perez"` **and** `partnerAddress:"Madrid, Avenida Independiente 23"`, the byte-identical label `neo_selectors` had just returned, and the call reached the **callout** (rejected on an unrelated date rule), which it can only do if both FKs resolved. That is the exact failure this item registered, on the same spec family, now passing. Deliberately **not** promoted to ✅ on someone else's probe: the vector was `sales-invoice`, the registered one was `sales-order`, and the remaining gaps in IMP-22's own §8 (three-deep chain, O(n²) worst case, real-AD agreement beyond this one pair) are untouched — a dedicated re-run is still owed | 2026-08-10 §5.6 |
| **IMP-23** | Make `neo_batch` atomic, or stop documenting it as atomic | P1 | C4 | 0 / 5 | ♻️ | `com.etendoerp.go` | ✅ resolved (score pending re-measure) | **C9, C10** · registered 2026-08-10 after a **fourth** reproduction, this one with the mechanism finally isolated. Each op reaches `DefaultJsonDataService.add`, which ends in `commitAndClose`, so the later `rollbackQuietly` finds an empty session. **The discriminator that three prior runs missed:** FK-resolution failures happen in `McpToolRouter#resolveBatchFkNames` *before* the transaction opens, so they roll back cleanly and *look* atomic (C9); **persist-time** failures leave prior ops committed (C10 — a 281-char description against `c_order.description varchar(255)` returned `committed:false` and persisted order `1000027` anyway). That is why the defect appeared intermittent. It contradicts the tool's own documentation **and** the transactional-integrity strength claimed in base §8, which the 2026-08-10 run removes. It also **defeats this skill's cleanup discipline**: the 2026-08-05 run's orphan header `1000017` survived undeleted because that run had no reason to look for a record its batch reported as not committed — future write runs must sweep by marker, not by the ids they believe they created · **investigated and half-implemented the same day** ([`imps/IMP-23.md`](imps/IMP-23.md)): the mechanism is now read out of the code rather than inferred — `BatchService` is **correct**, and the unconditional `commitAndClose()` is four calls below it in core's `DefaultJsonDataService#update`, so each op commits itself and the batch's own `rollbackQuietly` rolls back an empty session. **§2 checked the cheap fix and it does not exist**: there is no parameter on `add()`, `SessionHandler#setDoRollback` is only read by `DalThreadHandler` at thread end, and `TriggerHandler.disable()` makes `commitAndClose` *throw*. Real atomicity therefore means not routing through that core method — registered as **option B, deferred but kept under this same row** — it is the first clause of this item's own title, so it closes IMP-23 rather than opening a new IMP, which matters because known scope already equals the quota exactly and filing it separately would force a re-base to 122 and cost ~3 MARI points for identical code (IMP-23.md §5.1). It is deferred because it forks ~90 lines of core into this module and puts the shipped React invoice-scan ingest in the blast radius of a change nobody asked for. **Two findings the row above did not have.** The REST endpoint `POST /sws/neo/batch` shares `executeBatch` verbatim and is non-atomic for the same reason, and has been since it shipped (`c56628f0`, ETP-3590) — so this is not an MCP-only defect. And the ids of the committed ops are **already in memory** in `opResults` at the moment the failure response is built, and `failureBody` never looked at them — which is precisely why orphan `1000017` went unnoticed for five days: the agent was told `committed:false` and given no reason to look. **Option A implemented**: the failure body now carries `atomic:false`, `persisted:[{id, ok, recordId}]` and a `hint` that those records exist and a plain retry duplicates them — emitted even when the array is empty, since “nothing survived” and “we are not telling you” must not look alike. The tool description and `docs/neo-headless.md` §4.12.4 stop promising all-or-nothing. **Zero change to the success path**, so nothing shipped can regress — and **the batch is still not atomic**, which is why the score stays 0 / 5 and the row is ⚠️ rather than ✅. Notably the tests had to be *inverted*, not just updated: `verify(obDal, never()).commitAndClose()` was passing because the mocked CRUD seam meant nothing downstream ever ran, and `ToolRegistryTest` asserted the description “must mention atomic transaction” — it did, and the claim was false. **deployed and verified live the same day** ([`imps/IMP-23.md`](imps/IMP-23.md) §9): the C10 vector re-run — a 281-char `description` on a two-op `sales-order` batch, chosen because it fails at persist time rather than FK-resolution time — returns `persisted:[{id:"h0", recordId:"CEDA7318…"}]`, and **the recovery loop was then executed rather than asserted**: `neo_get` confirmed the survivor (order `1000029`, still `DR`), `neo_delete` removed it using the id the failure body itself supplied, and a sweep by date returned 0 rows. That round trip is what was impossible on 2026-08-05, and it is why `1000017` sat for five days. **Both hint branches are confirmed, the empty one by accident and it is the better probe**: a first attempt failed on op 0 (omitted `partnerAddress`) and returned `persisted:[]` with the "not atomic anyway" wording — the case §7 argued must never be an absent key. **One limit found that no code change can reach:** the `neo_batch` schema this session received still carried the *old* atomicity promise while the server was already returning the new body, because the MCP client caches the tool list at session start — so an agent in an open session keeps reading the retired claim until it reconnects, which is an argument for having fixed the response body rather than the description alone. **Score still stays 0 / 5 and the row stays ⚠️:** A makes the failure recoverable, it does not make the batch atomic, and re-scoring is a `/mcp-comparison` measurement. `./gradlew test` is still owed · **option B is not a new IMP** — it is the first clause of this row's own title, so it closes this item (⚠️ → ✅, +2.5 earned) instead of adding 5 points of scope that would force a quota re-base to 122 and cost ~3 MARI points for identical code (IMP-23.md §5.1); its blocker is now cleared, since A is verified · **secondary finding, deliberately not registered:** the same tool answered two caller-input failures very differently — the over-length value came back as a clean `400 validation_error`, while the omitted required FK came back as a **`500 server_error`** carrying a raw Postgres not-null violation whose `detail` dumps the entire failing row (~90 columns, with `&quot;`-escaped quotes inside a JSON string). That is a `missingFields` 422 in IMP-24's shape, plus an internals leak and a real ACE cost; known scope already equals the quota, and it most likely belongs to IMP-17 rather than a new number · **option B implemented the same day, so the batch is now genuinely atomic** (`7159376c`, [`imps/IMP-23.md`](imps/IMP-23.md) §11) — **committed, not deployed, so the row stays ⚠️ at 0 / 5.** Three pieces: `NeoBatchJsonDataService extends DefaultJsonDataService` overriding `update()` to reproduce core's success and converter-error branches **minus the two lines that end the transaction** (`:1152 commitAndClose()`, `:1060 rollbackAndClose()`), delegating to the inherited `protected` hooks; a `ThreadLocal` in `BatchService` marking that a caller owns the transaction, with `currentJsonService()` choosing the fork or core per thread; and **one line** at `NeoCrudHandler:237` feeding the whole create path by parameter — which is why B turned out far cheaper than §4 estimated. Two constraints each cost a build and are now documented in the code: the subclass **must be a CDI bean** rather than `@Vetoed` + `new`, because core injects `cachedPreference` and `@Any Instance<JsonDataServiceExtraActions>` and `doPreAction` dereferences the latter — safe only because `WeldUtils.getInstanceFromStaticBeanManager` matches `getBeanClass()` **exactly**, so core's own lookup cannot see a subclass; and the flag had to live in `BatchService`, not the subclass, since merely loading the subclass runs core's Weld-dependent **static initializer** (`ExceptionInInitializerError` in the first test run). **The failure body had to change direction, not just value**: always reporting `atomic:false` with every op as `persisted` would now be the mirror image of the original bug — sending an agent hunting for records that were correctly rolled back — so `atomic = (survivors.length() == 0)` and survivors are detected **generically**, by comparing Hibernate `Session` identity after each op (a `commitAndClose()` underneath the batch closes the session), rather than from a maintained list of handlers that commit internally. That tracker is also **the only part of B a mocked test can observe**: atomicity itself cannot be, because the per-op commit lives inside the stubbed `NeoServletSupport.handleWithHooks` seam and `OBBaseTest` does not boot here — the same blindness that made the old atomicity assertions meaningless now applies to the fix, which is why the live probe is the acceptance gate. Tests rewritten accordingly, **19 successful / 0 failed** standalone; `ToolRegistryTest`'s description assertion has now been wrong in **opposite** directions twice, so it stopped checking the adjective and checks the caller-visible consequence (`atomically`, `'atomic':false`, `persisted`). **Two limits carried forward:** the batch is atomic but **not hermetic** — `ProcessInvoiceUtil#process` commits internally by design, which is exactly the case the new `atomic:false` + `persisted` reports — and `ADD_FLAG` / `getContentAsJSON` are duplicated from core's **private** surface, so a core signature change breaks the build while a behaviour change drifts silently. **Blast radius checked:** nothing in `tools/app-shell/src` or `cli/src` reads `atomic` / `persisted` (the React invoice-scan ingest checks only `committed`), so no consumer breaks and that path **silently gains atomicity** through the shared `executeBatch` — closing the wider blast radius IMP-23.md §1.2 identified. **⚠️ → ✅ (+2.5, quota untouched) is gated on two things**: the live probe (the C10 vector must now return `persisted:[]` / `atomic:true`) and a `/mcp-comparison` re-measure · **✅ B deployed and verified live 2026-08-11** ([`imps/IMP-23.md`](imps/IMP-23.md) §12), after the user compiled, redeployed and ran `./gradlew test` green at a HEAD whose tip is `7159376c` — which also discharges the unit-suite debt option A left owed. The C10 vector, run a **third** time and again chosen because it fails at persist rather than FK-resolution time, returns `{"committed":false,"atomic":true,"persisted":[]}` with the *"rolled back as a unit"* hint — where the identical call returned `persisted:[{recordId:"CEDA7318…"}]` twenty-four hours earlier. **The response was deliberately not taken at its word**, because *"nothing was persisted"* is the precise claim that was false before B: a marker-filtered `neo_list` and a sweep for headers dated ≥ 2026-08-11 both returned 0 rows, **with a positive control** (an unfiltered listing returns 7 headers, newest 2026-06-24) so that the zeros cannot be a filter that never matches. The same listing incidentally shows every earlier orphan (`1000017`, `1000024`, `1000027`, `1000029`) is gone and the top document number is back to `1000015` — option A's recovery loop cleaned up after itself. **Status flips ⚠️ → ✅ and the score deliberately does not**: the two move on different evidence, and treating *"⚠️ → ✅ (+2.5)"* as one gated event was a conflation this row and IMP-23.md §11.6 both made — status is what the product measurably does, which the probe settles; the 5 / 5 is credited by a `/mcp-comparison` run, never by a bookkeeping edit, exactly as IMP-14 sat at ⚠️ while explicitly *"still worth 0"* through three gates. **Two things the probe does not settle, recorded rather than glossed:** hermeticity — the failing op was plain CRUD, so the `atomic:false` + `persisted` branch that reports a `ProcessInvoiceUtil#process` commit underneath the batch has **only ever run against a mocked `Session` swap**, and is the one part of B still resting on a unit test; and §9.3's client-side caching limit **repeated verbatim** — the `neo_batch` description this session holds is still the *pre-A original* promising *"any failure rolls back everything"*, two deploys stale, now accidentally true yet still omitting `persisted` and the process-commit exception, so an agent trusting it would not know to check `atomic`. That is unreachable from the server and is the strongest argument in the file for having put the contract in the response body | 2026-08-10 §5.2 |
| **IMP-24** | Reject non-ISO dates on write instead of silently corrupting | P1 | C4 | 0 / 5 | ⚙️ | `com.etendoerp.go` | ⚠️ partial | **C11, C12** · registered 2026-08-10 · **the only open defect that destroys data rather than costing calls, and the highest-value item on the board.** `neo_update` accepted `orderDate:"09-08-2026"` with `status: 0` and stored `0015-02-16` on *both* `orderDate` and the sibling `accountingDate` the call never named. Mechanism: the lenient `JsonUtils.createDateFormat()` parses it as `yyyy-MM-dd` → year 0009, month 08, day **2026**, and the day overflow rolls forward 2,025 days — verified arithmetically (`date(9,8,1)+timedelta(days=2025) == date(15,2,16)`) and in the DB. This is the **live root cause of the 14 corrupt rows** recorded under IMP-16, now demonstrated end to end rather than inferred. Split out of IMP-16 on purpose: that item's emit-side mechanism shipped and works, so leaving the corruption there would let a ⚠️ half-credit conceal a P1. **Holded rejects the identical input with HTTP 400**, naming the value, the expected format and an example (C12) — that response is the target shape verbatim, and it is the one surface where base §8 wrongly claimed Etendo GO had the stronger validation · **scope narrowed, same day, without a probe:** the C11 vector itself was a missing `coerceFieldTypes` call in `McpToolRouter#handleUpdate`, closed under IMP-16 (see that row and [`imps/IMP-16.md`](imps/IMP-16.md) §9) — so what remains here is **only** the loud-rejection half: an unrecognised shape is still passed through with a `WARN` instead of a structured 422 naming the value, the expected format and an example. That is IMP-16 §6.1's deliberate phase 2, held back so a deploy could not turn an unknown number of lenient-but-working calls into hard errors at the same time as the normalization. **This item does not close on the C11 re-run** — a re-run that stores `2026-08-09` proves IMP-16's fix, not this one; closing it needs the 422 · **the C11 re-run happened (IMP-16 §9.1) and this item is confirmed still open, now with its target measured rather than assumed.** Probing `neo_update {"orderDate": "06/08/2026"}` post-deploy returns `Validation error: {"status":-4,"errors":{"orderDate":"java.text.ParseException: Unparseable date: \"06/08/2026\"", …}}`. So the **data-loss half is genuinely gone** — the value is refused, nothing lands in the first century — and what is left is exactly a presentation defect: a leaked raw DAL `status: -4` carrying a Java exception class name, on the MCP write path that IMP-5's envelope work was meant to cover. That makes this item's remaining scope narrower and cheaper than registered (it is now *reshape an existing rejection*, not *add rejection*), and couples it to IMP-5 · **the P1 label is now arguably too high** — with corruption closed, no call loses data here; it costs an agent a retry it cannot self-correct from. Downgrading is a `/mcp-comparison` re-score decision, not recorded here · **phase 2 implemented, deployed and probed 2026-08-10** → [`imps/IMP-24.md`](imps/IMP-24.md): the leaked `status:-4` is replaced by an IMP-5-shaped **422** with `invalidDates:[{name, received, expectedFormat, example}]` — C12's shape verbatim, mirroring the adjacent `missingFields` error rather than inventing a second one. The value is echoed back because the field name alone cannot distinguish a wrong *format* from a wrong *date* (`2026-02-30` is ISO-shaped and impossible). **The work is almost entirely in the two gates, not in the error**, and either one missing would make the rejection wrong: `toCanonical` returns `null` for **two unrelated reasons**, so a blanket “`null` → 422” would have broken `2026-08-06T14:30:00+02:00` — a value IMP-16 §6.2 refuses *because the DAL already parses it correctly* — hence a new `NeoDateFormat.isOffsetDateTime` classifier whose only job is telling the two apart, biased towards pass-through since a wrongly rejected value is a new error on working input while a wrongly passed-through one is the status quo; and only a **caller-supplied** value may be rejected, since `injectMandatoryDefaults` can itself inject `dd-MM-yyyy` (that being why IMP-16's coercer exists) and a 422 on a field the agent never sent is unactionable — witnessed by `userProvided` in `handleCreate` and, in `handleUpdate`, by the fact that it injects no defaults at all. **REST stays lenient on purpose** (IMP-15's line: the React form has a date picker and is not an agent), making this the one documented place where the two write stacks answer the same input differently. 147/147 + 27/27 standalone; `./gradlew test`, the deploy and the live probe are all **owed** · **the gate this phase was held behind is not satisfied and the file says so** ([§7](imps/IMP-24.md)): IMP-16 §6.1 asked for logs showing the `WARN` never fires on real traffic, and the 404-line window since the 17:17:14Z restart holds **0** of both date log lines — no date write traffic at all, so the evidence is **empty, not clean**. It ships on the stronger but different argument that the two gates exclude the at-risk population by construction rather than by observation · **verified live the same day** ([§7](imps/IMP-24.md)): `neo_create` with `orderDate:"06/08/2026"` now returns the 422 above and the `status:-4` + `ParseException` is gone; `2026-02-30` is reported rather than resolved to the 28th; two bad dates in one payload are both listed. **The discriminating probe is the negative one** — `scheduledDeliveryDate:"11-08-2026"` is *not* rejected but repaired by IMP-16's coercer, so the change is a split between reparable and irreparable rather than a blanket rejection, which is the shape of call that occurs most often. Every probe used a deliberately incomplete payload (the date 422 precedes the `missingFields` check), so nothing persisted and no record was touched. **Two gaps stated rather than glossed:** the §2 offset classifier is covered by unit tests only — the probe aimed at it hit a *date-only* property, `toCanonical` succeeded, and the classifier was never reached, because no editable datetime is exposed on that spec (`preparationDate` and `creationDate` came back in IMP-18's `unknownFields`, used here to answer its own question); and the `neo_update` call site was not probed live, blocked by the permission classifier. What the log *did* settle is the §3 gate's premise: **every** create logged `Normalized date 'accountingDate': '10-08-2026'` — server-injected `dd-MM-yyyy` defaults on every single call, precisely the population a blanket 422 would have blamed the agent for | 2026-08-10 §4 |
| **IMP-25** | Canonicalize boolean types in `neo_defaults` | P2 | C4 | 3 / 3 | ♻️ | `com.etendoerp.go` | ✅ resolved | **C19** · **promoted from the unnumbered candidate below on 2026-08-10, exactly as that entry instructed, and closed in the same run** — the fix (`NeoBooleanFormat` + `canonicalizeBooleanDefaults`, commit `fb503731`) was recorded as *"compiled locally, not deployed, not probed"* and is now deployed and verified: real JSON `true`/`false` on `neo_defaults` and on both create responses, with no `"Y"`/`"N"` and no per-spec inversion. Registering an item and resolving it in one run is legitimate here because the code predates the run; what the run added is the live evidence the candidate explicitly lacked. **`posted: "N"` is deliberately excluded** — it is a list reference with three or more values, so a string is the correct representation, not a boolean-normalization defect | 2026-08-10 §9 |

**Totals (2026-08-10):** earned **49.0** of a known scope of **97** (C1 32/40 · C2 11.5/21 ·
C3 2.5/20 · C4 3/16) against a quota of **97** (§2.2) → the Delivery component of MARI = **51**
(§2.1). Verify the column sums before publishing; a `Pts` cell that disagrees with its `Status` mark
makes MARI unauditable.

> ⚠️ **The discovery reserve is fully consumed.** Known scope now equals the quota exactly, so
> **the next run cannot register a new IMP without re-basing the quota** — which is the user's
> decision, not a run's (§2.2). A run that finds a new defect and has no room for it must stop and
> say so rather than quietly widening the denominator.

*Previous totals — 2026-08-06:* earned 29.5 of a known scope of 81 (C1 29.5/40 · C2 0/21 · C3 0/20)
against the same quota of 97 → Delivery = 30.

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

> **Boolean type inconsistency in `neo_defaults`** — raised 2026-08-07 while verifying IMP-16, whose
> twin it is. The same `c_invoice` columns come back with different JSON types per spec, and the
> direction **inverts**: `printDiscount` is `true` on `sales-invoice/header` and `"Y"` on
> `purchase-invoice/header`, while `etvfacSentToVerifac` is `"N"` on the former and `false` on the
> latter (`etvfacSimpinvart7273` and `etvfacInvNoIDArt61d` likewise). In JavaScript `"N"` is
> **truthy**, so an agent reads the opposite of what the ERP said. Same structural cause as IMP-16:
> normalization lived in one per-field call reachable only from pass 1
> (`NeoDefaultsService.coerceBooleanDefault`), so the callout writeback and combo preselection in
> `NeoDefaultsCascadeHelper`, `NeoHiddenMandatoryDefaultsResolver` and handler-injected values all
> bypassed it — and which fields a callout touches differs per window, hence the inversion.
> **Fix implemented 2026-08-07 (compiled locally, not deployed, not probed)**: `NeoBooleanFormat`
> util + a `canonicalizeBooleanDefaults` post-pass beside the date one, and the two write coercers
> unified (they disagreed on case — MCP accepted `"y"`, REST did not). Not MCP-only:
> `NeoDefaultsService` also backs the REST `/defaults` the React form reads, so one change covers
> both. React needs **no** change — every boolean it reads already passes an explicit
> `=== true || === 'Y' || === 'true'` guard at ~30 sites, so there is no user-visible defect today;
> the victim is the agent. Full analysis: `com.etendoerp.go/docs/neo-headless.md` §4.3.2. ~~Promote to
> an IMP and score it in the next `/mcp-comparison` run.~~ **Done: promoted to IMP-25 on 2026-08-10
> and resolved in the same run** — deployed and verified live (C19). Kept here as the record of how
> the item was raised.

---

## 4. Changelog

One entry per benchmark run. Append; never rewrite a past entry.

### 2026-08-10 — IMP-15 wave verification (`etendo-go-local`, build `a4963b6b`, write-probe mode)

Job A. Run report: [`mcp-comparison-post-audit-2026-08-10.md`](mcp-comparison-post-audit-2026-08-10.md).
Write probes authorized per-run by the user; Holded re-probed on the paired date comparison only.
**The first run of the period where the number moved because the product moved.**

**Resolved (3):**
* **IMP-15** — all four A.6 clauses credited live against the deployed build, and the `a4963b6b`
  uOM narrowing verified from both sides: the injection fires on `sales-order/lines` with no `uOM`
  sent (C6) and abstains on `product/alternateUom` (C7). ⏳ → ✅, 0 → 5.
* **IMP-10** — `docs` is first-class and the tool-name drift is gone from the live index (C18).
  ⚠️ → ✅, 2.5 → 5.
* **IMP-25** — boolean canonicalization, promoted from the unnumbered candidates and closed in the
  same run on live evidence (C19). New, ✅, 3/3.

**Advanced (4):** IMP-12 ⏳ → ⚠️ (`view:"create"` works on `sales-invoice`, still omits required
fields on `sales-order`) · IMP-11 ⏳ → ⚠️ (M2 measured, keys now on the actions view; 1,422 uncurated
fields still bare) · IMP-16 ⏳ → ⚠️ (emit half fixed, write half worse than specified) · IMP-14
⏳ → ⚠️ (drift half live; the `fields`/`view` half committed but unpushed).

**Added (4):** IMP-22 context-dependent FK selectors (P2) · **IMP-23 `neo_batch` not atomic (P1)** ·
**IMP-24 silent date corruption on write (P1)** · IMP-25 boolean types (P2, already ✅).

**Held at ⚠️ with rewritten evidence (2):** IMP-4 and IMP-5 both had *every* named clause close, and
both stay at half credit because the same run found the mechanism failing elsewhere — IMP-4 on
context-dependent selectors (→ IMP-22), IMP-5 on three further non-envelope paths. Recorded this way
deliberately: closing the specific sentence a row happens to contain is not the same as closing the
item, and moving the goalposts in the other direction would be just as dishonest.

**Re-confirmed, no change:** IMP-1, IMP-7, IMP-18 (now the sole blocker on frozen task 3), IMP-21
(catalog grew 19 → 22 actions, all three defects intact — which is why M4 alone did not move).

**Two findings about the exercise itself**, both in the run report: the frozen suite has become
unrepresentative and now flatters the product (§6 — shadow figures M2 ≈ 67 % / M1 ≈ 1.5×; amending a
frozen suite is a decision, so it is proposed, not done), and Holded **deletion cannot be verified
at all** because it exposes no read verb for contacts or sales orders (§2). The 2026-08-05 run's
orphan `1000017` was found and deleted — IMP-23 defeats this skill's own cleanup discipline.

**Corrections to the base report:** spec count is **54 = 46 + 8**, not 56 = 48 + 8; base §8 loses its
transactional-integrity and input-validation strengths (IMP-23, IMP-24) and gains Etendo GO's
read/write parity as a now-measured one.

**MARI 49 → 73.** M2 40 % → 80 % (24.0) · M1 2.1× → 1.4× (21.4) · Delivery 29.5/97 → 49.0/97 (12.6) ·
Coverage 6/6 (15.0). **The KR (`MARI 28 → 68`) is met, one wave earlier than projected** — and the
discovery reserve is now fully spent at 97/97, so the next run must re-base the quota before it can
register anything new.

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
