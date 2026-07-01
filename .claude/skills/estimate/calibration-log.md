# Calibration Log

> Append-only record of **estimate vs. actual** for finished tasks. Each entry feeds the tuning of
> `points-table.md`. The `/estimate` skill writes here during a calibration pass (Step 6).
>
> Goal: over time the point values and risk factors converge on reality. When several entries point
> the same way (e.g. "we keep under-counting invoice generation"), update the table.

Format per entry:
- **Estimate** (original Jira) vs **Actual** (sum of worklogs)
- **Where the time went** (feature / rework / CI-quality / analysis)
- **What the model missed** (under-counted components, materialized risks, new failure modes)
- **Proposed table tweaks** (and whether applied)

---

## ETP-4033 — Sales Return Shipment window and return flow

- **Owner:** Irina Urricelqui
- **Estimate:** 16h (original Jira) · **Actual:** 30.5h logged (7 worklogs, 22-May → 08-Jun) · **191%**
- **Still not merged** at last worklog ("Aún no pude mergear").

**Where the time went:**
| Bucket | Approx | Evidence |
|--------|-------:|----------|
| New feature | ~15h | Window base, import modal, confirm modal, invoice auto-generation, Java handler |
| Rework / fixes | ~8h | 05-Jun corrections (default warehouse, autosave, qty step, documents section); bugs found 27-May |
| CI / quality gates | ~4h | 08-Jun: Vitest mock (MovementSummaryCard), SonarQube duplication ×2 rounds, architecture-check (CommonJS require in vi.mock) |
| Analysis / test cases | ~3.5h | 01-Jun + 02-Jun functional analysis and test-case authoring |

**What the model missed (vs. the original 16h estimate):**
1. **`document-auto-generation` (5 pts)** — the return-invoice creation with copied taxes/prices was a major chunk, not counted.
2. **`java-handler` (3 pts)** — handler enrichment for related documents in the response.
3. **All risk uplift** — the task touched shared components (`ConfirmDocumentModal`, `RelatedDocumentsCard`), which triggered the SonarQube/architecture battle that blocked merge. `shared-component-refactor` + `ci-quality-gates` were entirely absent from the estimate.
4. **Late-discovered functional bugs** — a whole 4h day of corrections after manual testing.

**Model check:** full-scope base sum ≈ 31 pts; with reuse from ETP-4031 (Sales Shipment pattern) the
effective build was lower, landing the honest estimate around **28–32 pts (≈ 28–32h)** — close to the
real 30.5h. The original 16h was ~half the realistic figure.

**Root cause of the overrun:** under-estimation (missing components + zero risk uplift), not slow work.

**Proposed table tweaks:**
- ✅ Seeded the initial table with `document-auto-generation` (5) and `java-handler` (3) as first-class items so they can't be forgotten.
- ✅ Added `shared-component-refactor` (+30%) and `ci-quality-gates` (+20%) risk factors.
- ⏳ Watch whether `ci-quality-gates` should be higher than +20% (the SonarQube duplication took 2 rounds). Revisit after the next shared-component task.

---

## Methodology note — the reuse cascade & the "flat-estimate" smell

> Not a single-task entry. A generic anti-pattern surfaced while estimating an *adaptation* task
> (improve an existing window + a few loose issues) that had been planned flat against a brand-new
> window. Captured here so the model corrects for it going forward.

**The smell:** a plan where a **new window**, an **adaptation of it**, and a **sibling adaptation of
another window** all carry the **same number** (e.g. 3/3/3 days). If three items of visibly different
size land on one figure, the estimator is only adding risk and never subtracting reuse.

**Three root causes of over-estimation** (all the mirror image of the ETP-4033 *under*-estimation —
the model must correct in both directions):

1. **Native-process reuse scored as new backend.** Behaviour that "looks like backend" (accounting
   inversion on confirm, payment-schedule, VAT register, balance/paid-state) is delivered by the
   existing posting/Complete chain that NEO Headless reuses. It is the *same button that already
   exists*, not a new `NeoHandler`. → reuse 0 pts, not `java-handler`. This single mis-classification
   was worth ~1.5 days of phantom work on the anchor task.
2. **"Fields to add" that already exist.** A column the ticket says to add is frequently already in
   the AD schema (a child tab / standard column). The work is to *surface* it (1 pt), not `alter-db`.
   Always check `schema-raw.json` before scoring a new field.
3. **The second-mover effect ignored.** The **first** implementation of a cross-window pattern pays
   the framework cost (variant selector, conditional wiring, shared component). The **second+** copies
   it with domain deltas. Charging both at full price is the core of the flat-estimate smell.

**Also seen:** a cross-window dependency can **reduce** scope, not only add risk — if the piece
(a generating action/popup) is owned by a sibling ticket, it's 0 here. Treat "depends on X" as a
routing question (who builds it?), not an automatic uplift.

**Estimate-evolution discipline:** on that task the figure walked 4 → 3 → 2 → 1.5 days as each reuse
was recognised. The lesson is to run the **reuse audit (SKILL Step 3.5) BEFORE** quoting a first
number — every downward correction above was a Step-3.5 question that should have been asked up front.

**Model tweaks applied as a result** (see `points-table.md`):
- ✅ New §1 row group "UI — adapting what already exists" (`surface-existing-field`,
  `conditional-field-visibility`, `list-display-rule`, `extend-shared-component`,
  `suppress-existing-behavior`, `wire-native-process-button`, `multi-variant-window-framework`).
- ✅ New §2b "Reuse / discount factors" (negative %): `second-mover-reuse`, `mature-scaffolding`,
  `behaviour-is-native-reuse`; conversion formula now uses a floored `net_factor` (can be < 1).
- ✅ Reuse warning blockquote on the backend table; `java-handler` / `document-auto-generation` notes
  now say "0 if a native process / a sibling ticket owns it".
- ⏳ Watch whether discounts and the 0.3 floor land correctly — revisit after the next adaptation task
  is closed with real worklogs (this entry is forward-looking, not yet backed by an actual).

---

## Model growth — provisional rows added during estimation (Step 3.6)

> Running list of item/risk/archetype rows the skill added to `points-table.md` **while estimating**,
> before any real worklog confirmed them. Each starts **provisional**; a later calibration pass (Step
> 6) that exercises the row should confirm or adjust its value and graduate it to a real finding above.

| Date added | Row added (section) | Provisional value | Rationale / analogy | Status |
|------------|---------------------|-------------------|---------------------|--------|
| 2026-06 | §1 "adapting what already exists" group + §2b discount factors | see table | reuse-cascade investigation (adaptation-task) | ⏳ awaiting first actual |

> _Append a row each time Step 3.6 fires. Graduate confirmed rows into a dated calibration entry above._

---

> _More entries get appended below as tasks complete._
