# Expirable (Time-Dependent) Stored Computed Columns — Draft Proposal

> **STATUS: DRAFT — FOR ITERATION.** This is a first-draft feature request / design sketch, not a
> finished spec and not a mandated design. Everything below (especially the three design directions
> in §6) is offered as options with trade-offs, for the maintaining team to react to, reshape, or
> reject. Please treat named field/table/process names as *placeholders* — they follow the engine's
> existing conventions but are not proposed as final.

**Originated from:** Etendo Go / Schema Forge design work on **ETP-4603** (product Sale/Purchase Price
stored computed column on `M_Product`).
**Addressed to:** the core team maintaining the Stored Computed Columns engine (epic **EPL-1807**).
**Priority:** low / not urgent — see §2 and §8. We hit the *edge* of this limitation while designing
a feature and worked around it; we are raising it so the gap is on record before a consumer who
*cannot* dodge it hits it in production.
**Reference read:** this proposal uses the terminology of
`com.etendoerp.go/docs/STORED-COMPUTED-COLUMNS.md` exactly (Computation_Mode `S`/`Q`/`M`,
`Refresh_Mode`, `AD_COLUMN_COMP_DEPENDENCY`, dirty rows in `AD_STOREDCOLUMN_DIRTY`, the target-id
resolver, the `ad_scd_*` objects, `StoredColumnQueueProcessor`, **Rebuild Stored Column**,
`ad_scd_check`, `Computation_Sequence_Number`, validator rules V1–V17).

---

## 1. TL;DR

The stored computed column engine refreshes a value **only when a source table is written**
(INSERT/UPDATE/DELETE fires the Phase-1 dirty-collection trigger). It has **no notion of time
passing**. Any computed value whose correctness depends on *"as of today / as of now"* — a temporal
boundary crossed by the **clock**, not by a **DML write** — silently goes stale the moment that
boundary elapses, and stays stale until some unrelated source write happens to re-dirty the target.

We propose an **"Expirable" (time-dependent) stored computed column**: a way to declare that a
column's value has a **validity horizon**, and let the engine automatically re-dirty the affected
target rows when that horizon elapses — draining through the **existing** async queue
(`StoredColumnQueueProcessor`) rather than inventing a new code path. The natural fit is the **`Q`
(queued)** drain, because temporal wake-ups are inherently *eventually consistent*.

This is **additive** and **opt-in**, exactly like the original engine: a column that does not opt
into expiry behaves precisely as today.

---

## 2. The limitation

The engine's freshness contract is, verbatim from the reference: *"the column is calculated once,
when the data it depends on actually changes."* "Changes" means **a write to a declared source
table**. Phase 1 (dirty collection) is an `AFTER` trigger on the source table — no write, no trigger,
no dirty row, no recompute.

Time is not a source table. When a value's correctness is a function of `now()` / `CURRENT_DATE`, the
inputs can become stale **without any row anywhere being written**:

- A price-list version with a future `ValidFrom` becomes effective at midnight → no row is written.
- A contract's end date passes → no row is written.
- An invoice's due date passes → no row is written.

The stored value keeps serving yesterday's answer until the *next* unrelated source write on a
declared dependency happens to re-dirty that target. There is no upper bound on that lag — it could be
days or never for a rarely-touched record.

**This is not a bug in the engine.** It is a deliberate and correct design boundary ("stored columns
reflect **transaction-boundary** state only", §14 of the reference). We are asking to *extend* the
boundary to include an explicitly-declared temporal trigger, not to change the existing semantics.

---

## 3. The driving example (ETP-4603)

Etendo Go wants a product **Sale Price** / **Purchase Price** stored computed column on `M_Product`.
The natural formula walks:

```
M_ProductPrice.PriceStd
  └─▶ M_PriceList_Version.ValidFrom          ← the temporal boundary
        └─▶ M_PriceList.IsSOPriceList (Y = sales / N = purchase), IsDefault
```

The "correct" price is the `PriceStd` from the price-list **version whose `ValidFrom <= today`, most
recent** (for the default sales or purchase price list). That is time-dependent: when a version with a
**future** `ValidFrom` becomes effective at midnight, **no source row is written** — so a stored
column would keep serving the *previous* version's price until someone next edits `M_ProductPrice`
for that product. A grid sorted/filtered by price, a KPI, or an API read would all be quietly wrong
for that window.

### Why the price case did NOT force this on us — and why that is not the general rule

Etendo Go **dodged** the price case in ETP-4603. Our deployment uses a **single** price-list version
(hidden from the UI, no future-dated versions), so `ValidFrom` never crosses a boundary at runtime.
With no temporal boundary in play we can safely use **`S` (synchronous)** and the value is always
correct. That dodge worked only because the time-dependence lived in *data we control the shape of*:
we removed the future-dated versions, and the `ValidFrom <= today` test stopped mattering.

So we are explicitly filing this as *"not required so far,"* **not** *"blocking."* But the reason it
was not required is specific to this column: we could flatten the price-list versions. **There is a
whole class of values where no such flattening exists** — where the formula is *inherently*
`now()`-relative, so the value must be re-evaluated simply because *now() is a moving point in time*,
with no write anywhere to trigger it. The next subsection is exactly that case.

### The case you cannot dodge: overdue amount on `C_BPartner`

The most instructive example (column names below **verified against the live DB**, like the price
example): a stored **"overdue amount"** on the business partner — the sum of what a customer owes on
sales invoices whose payment is **past due as of today**:

```sql
-- Overdue amount for one business partner. The temporal boundary is fps.duedate < now().
SELECT COALESCE(SUM(fps.outstandingamt), 0)
FROM   fin_payment_schedule fps
JOIN   c_invoice i ON i.c_invoice_id = fps.c_invoice_id
WHERE  i.c_bpartner_id = <target>          -- the C_BPartner target row
  AND  i.issotrx   = 'Y'                    -- sales
  AND  i.docstatus = 'CO'                    -- completed
  AND  fps.outstandingamt > 0                -- still owed
  AND  fps.duedate  < now();                 -- ← the temporal boundary
```

> **Modern payments model.** Due date and outstanding amount live on **`FIN_Payment_Schedule`**
> (`outstandingamt`, `duedate`, `c_invoice_id`, `amount`) — the current Etendo payments model — **not**
> on a legacy `C_InvoicePaymentSchedule` table. Invoice-side columns used: `c_invoice.c_bpartner_id`,
> `c_invoice.issotrx`, `c_invoice.docstatus` (plus `grandtotal` / `ispaid` available if the formula
> wants them).

**This one column genuinely needs BOTH trigger kinds at once** — that is exactly why it is the sharpest
motivator:

| Trigger kind | Fires when | Covered by |
|--------------|-----------|------------|
| **Source-write dependency** | A payment schedule is written — e.g. a payment is allocated, `outstandingamt` drops. | **Today's engine.** Source table `FIN_Payment_Schedule`, watched columns `outstandingamt` (+ `duedate`); target-id resolver walks `FIN_Payment_Schedule.c_invoice_id → C_Invoice.c_bpartner_id` to the affected partner. Pay a schedule → the partner's overdue total recomputes. Standard behavior. |
| **Temporal dependency** | A schedule's `duedate` crosses `now()` at midnight. The amount was *not yet* overdue yesterday and *is* overdue today. | **The gap this proposal closes.** No row is written anywhere — the `duedate` value did not change, *today* changed — so nothing re-dirties the partner, and the stored total stays wrong until the next unrelated payment/status write on one of that partner's invoices, which for a quiet delinquent account may be a long time. |

So the same stored column requires the **existing** mechanism (react to payments) **and** the
**proposed** one (react to the clock). And there is **no "single-version"-style dodge**: unlike the
price case — where we flattened the price-list versions so `ValidFrom` never crossed — the boundary
here is `now()` itself, which is intrinsic and cannot be flattened away. A collections dashboard, a
credit-limit check, or an overdue KPI reading this stored value would quietly serve yesterday's number
every morning until an unrelated write happened to correct it.

The classic **aging bucket** (0–30 / 31–60 / 61–90 / 90+) is the same shape one step further — bucketed
by `now() - fps.duedate` instead of a single past-due sum — and shifts a partner (or invoice) from one
bucket to the next purely on a midnight rollover, again with no DML.

### Other cases (one-liners, to show generality)

The same shape recurs across the domain:

| Domain | Time-dependent value | Boundary crossed by the clock |
|--------|----------------------|-------------------------------|
| Subscriptions / contracts | "is active as of today" | contract `StartDate` / `EndDate` passes |
| FX-derived amounts | "current" amount from a valid-from/valid-to rate | rate's valid-from becomes effective |
| Pricing (the ETP-4603 case) | effective price from a dated price-list version | `M_PriceList_Version.ValidFrom` becomes effective |

All share one shape: **the formula reads `now()`/`CURRENT_DATE`, and a temporal boundary (a stored date,
or *today itself*) crosses it with no accompanying DML.**

---

## 4. Why the existing mechanisms fall short

| Mechanism | Why it does not cover time-only drift |
|-----------|----------------------------------------|
| **Phase-1 source-write triggers** | Fire only on INSERT/UPDATE/DELETE of a declared source table. A clock tick is neither — no trigger arms, no dirty row is created. |
| **`Refresh_Mode = S / Q / M`** | All three answer *when the dirty rows drain*, never *what marks a row dirty*. The drain is downstream of dirty collection; the problem is that nothing marks the row dirty in the first place. |
| **Rebuild Stored Column** (`StoredColumnRebuild`) | Correct, but **table-wide** and **manual/scheduled-blunt**: it re-derives *every* target row of the column, with no way to target only the rows whose validity boundary actually elapsed today. Scheduling it "daily to be safe" recomputes 100% of rows to fix the <1% that expired. |
| **`ad_scd_rebuild(<col>)` (raw SQL)** | Same blunt full-table scope, plus no client filter (§15 Q3). |
| **`ad_scd_check(<col>)`** | *Detects* drift (counts rows where stored value ≠ recompute) — and because the recompute itself reads `now()`, it **would** flag time-only drift **if run**. But it only counts; it does not re-dirty or fix, and it too is a table-wide scan. |

### The "poor-man's" interim workaround (available today, no core change)

Because `ad_scd_check` *would* see time-only drift (the recompute uses `now()`), a consumer can today
approximate expiry with **a scheduled job that runs a targeted rebuild**: on a cadence (e.g. nightly),
recompute the affected targets. The closest low-effort version is **a scheduled Rebuild Stored Column
Process Request** for the temporal column. It works, but it is exactly the blunt table-wide instrument
above — no per-row targeting, cost proportional to table size not to the number of rows that actually
expired. We call this out as the honest interim option, and as the baseline this proposal aims to
improve on.

---

## 5. Proposed capability (overview)

Introduce an **Expirable** attribute on a stored computed column: the column declares that its value
has a **validity horizon**, and the engine is responsible for **re-dirtying the affected target rows
when that horizon elapses**, feeding them into the *existing* two-phase model at the dirty-collection
point (Phase 1), so the *existing* drain (Phase 2 / Phase 2′) carries them the rest of the way.

Design principles we would ask the team to preserve:

- **Reuse, don't reinvent.** Temporal wake-ups should produce ordinary rows in
  `AD_STOREDCOLUMN_DIRTY` and drain through `StoredColumnQueueProcessor` exactly like source-driven
  dirt. No parallel recompute path.
- **`Q` is the natural drain.** A temporal boundary is inherently "eventually consistent" — the value
  becomes correct shortly after midnight, not at a transaction commit. Expiry pairs naturally with
  **`Q`**; pairing it with `S` is arguably meaningless (there is no transaction to be synchronous
  with). We would suggest the validator treat "Expirable + `S`" as at least a warning (see §7).
- **Additive & opt-in.** A column that does not set the new attribute is byte-for-byte unchanged.
- **Pure functions preserved.** The computation function stays `IMMUTABLE`/`STABLE` (V7). Reading
  `now()`/`CURRENT_DATE` makes a function `STABLE` (stable within a statement), which is still
  permitted — so no change to the purity contract.
- **Granularity: date-level by default, fine timestamp as a per-column option.** The common case is a
  **midnight / date-boundary** rollover (overdue, aging, `ValidFrom` pricing) — one sweep per day
  covers it cheaply, so **date-level is the sensible default**. But some values turn on an arbitrary
  `timestamptz` boundary (an FX rate effective at a specific time, an hourly SLA), so we would want the
  horizon to be **configurable per column down to the second**. Finer granularity simply forces more
  frequent sweeps — the cost falls on whoever configures it, not on the default. (Note this widens the
  §9 scope statement — arbitrary timestamp boundaries are *in* scope as an option; only true
  real-time/streaming re-evaluation stays out.)

### The sweep mechanism (orthogonal to which storage/trigger option is chosen)

Whichever option needs a periodic wake-up (Options 1, 3, and 4 all do — see §6), the **leading
approach is to extend the existing `StoredColumnQueueProcessor`** so that, on each run, it *also*
enqueues/refreshes the expired targets — rather than standing up a new dedicated sweep process. This is
the cleanest fit because it inherits, for free, every operational guarantee the queue already enforces:

- the **"one drainer per client"** rule,
- the **`AD_Client_ID`** partitioning (disjoint clients may run concurrently),
- the **`Computation_Sequence_Number`** drain ordering that chained columns depend on,

with **no new process, no new scheduling surface** — an installation's existing Process Request for the
queue processor simply gains temporal wake-ups. This is a lean on the *sweep mechanism only*; it says
nothing about which of the four Option §6 designs is chosen (they remain presented evenly). The
processor's cadence would also set the effective temporal resolution (run it daily for date-level, more
often for finer horizons — see the granularity principle above).

---

## 6. Design directions (options — trade-offs, not a decision)

Four sketches, roughly least-to-most integrated with the existing dependency model. They are not
mutually exclusive (e.g. Option 3 could be *implemented on top of* Option 1's storage, and Option 4's
timestamp could sit beside any of them). They are presented **evenly, with no recommendation** — the
choice is the maintaining team's.

### Option 1 — Per-row next-expiry timestamp

**Idea.** Alongside the value, the engine learns *when this row could next change on its own*. Either
the computation function returns it as a second output, or a companion **"next-expiry" function**
`f_next(target_id) → timestamptz` is declared on the column. For the pricing example:

```sql
-- next moment this product's price could change with no DML:
SELECT MIN(plv.validfrom)
FROM   m_pricelist_version plv
JOIN   m_pricelist pl ON pl.m_pricelist_id = plv.m_pricelist_id
WHERE  pl.isdefault = 'Y'                    -- + IsSOPriceList per column
  AND  plv.validfrom > now();                -- the next boundary in the future
```

The engine persists `next_expiry` per target. A **scheduled sweep** enqueues a dirty row for every
target whose `next_expiry <= now()` (and, on recompute, recomputes the next horizon).

| Aspect | Detail |
|--------|--------|
| Plug-in point | Sweep does a Phase-1-equivalent `INSERT … ON CONFLICT DO NOTHING` into `AD_STOREDCOLUMN_DIRTY`; existing drain handles the rest. |
| New AD fields | A `Next_Expiry_Function` on `AD_Column` (or a flag saying "value function also returns expiry"). |
| New schema | A per-target `next_expiry timestamptz` — either a side table `AD_STOREDCOLUMN_EXPIRY (AD_Column_ID, Target_Record_ID, Next_Expiry)` (no target-table DDL, engine-owned, matches the `AD_STOREDCOLUMN_DIRTY` shape) **or** a generated companion column on the target table. The side table keeps the target schema clean and stays within engine-owned objects; the companion column keeps the value and its horizon physically together — trade-off for the team. |
| New process | Preferably **none** — the sweep runs as a mode of the existing `StoredColumnQueueProcessor` (see §5 "The sweep mechanism"), selecting due targets and enqueuing them on each run. A standalone "Stored Column Expiry Sweep" process is the fallback if a separate cadence is wanted. |
| Initial population | On first activation / rebuild, populate `next_expiry` alongside the value. `> LARGE_TABLE_THRESHOLD` behaves like today (enqueue sentinel, populate off-line). |
| Oracle | Fine — Oracle is already queue-only; the sweep enqueues, the Java recomputer drains. No PG-specific machinery needed. |
| **Precision** | **High** — targets *only* the rows that actually expire today. Best cost profile at scale. |
| **Cost** | Highest to build — new field(s), new storage, a sweep, and expiry-recompute wiring. |

### Option 2 — Declarative "expires on a cadence" flag

**Idea.** A coarse `Expirable = 'Y'` plus an optional cadence (e.g. `Expiry_Cadence = DAILY`, at
rollover). On each cadence tick the engine re-dirties **all** of the column's targets (per client),
which then drain normally.

| Aspect | Detail |
|--------|--------|
| Plug-in point | A scheduled tick enqueues the column's null-sentinel-style dirt (or all targets) into `AD_STOREDCOLUMN_DIRTY`; existing drain handles the rest. |
| New AD fields | `Expirable`, `Expiry_Cadence` on `AD_Column`. No new tables. |
| New schema | None. |
| New process | A small scheduler tick; could reuse the null-sentinel path already used for `Q` initial population. |
| Initial population | Unchanged. |
| Oracle | Trivial — same null-sentinel + queue path already exists. |
| **Precision** | **Low** — recomputes every target on every tick regardless of whether its boundary elapsed. Functionally the "poor-man's scheduled rebuild" from §4, but formalized, declarative, and surviving pipeline re-runs. |
| **Cost** | Lowest to build. Honest downside: barely better than a scheduled Rebuild — its value is being *declarative* (in metadata, not an ops-owned Process Request) and *per-column*. |

### Option 3 — Watched date-columns as first-class temporal dependencies

**Idea.** Extend `AD_COLUMN_COMP_DEPENDENCY` so a dependency row can name a **temporal column** (e.g.
`M_PriceList_Version.ValidFrom`) as the thing to watch *against the clock*, rather than watching for a
DML write. The engine derives per-row wake-ups from those column values: "for each distinct future
`ValidFrom`, schedule a re-dirty of the targets that resolve from it."

| Aspect | Detail |
|--------|--------|
| Plug-in point | Same dependency model as today — a new *kind* of dependency (temporal) sitting beside the existing source-table dependencies, reusing `Target_ID_Resolver_SQL` to map a boundary row back to its targets. |
| New AD fields | On `AD_COLUMN_COMP_DEPENDENCY`: e.g. `Dependency_Kind = SOURCE / TEMPORAL` + `Temporal_Column_ID`. |
| New schema | Likely the same per-target (or per-boundary) `next_expiry` store as Option 1 to make it efficient; otherwise a scan of the temporal column each tick. |
| New process | A sweep, as Option 1. |
| Initial population | As Option 1. |
| Oracle | Fine (queue-only). |
| **Precision** | **High** — like Option 1, but the temporal trigger is expressed *within* the existing dependency abstraction, which module authors already understand. Most conceptually integrated. |
| **Cost** | High — and it stretches the meaning of "dependency" (currently "a source table whose writes matter") to also mean "a date column whose crossing matters," which the team may or may not want to overload. |

### Option 4 — Expiry by last-computed timestamp (TTL / staleness)

**A different philosophy.** Options 1 and 3 **predict when the value expires** — the author (or a
temporal column) tells the engine the *next future boundary*, and the engine wakes the row exactly
then. Option 4 flips this: it records **when each row was last computed** and re-evaluates based on
**staleness**, never needing to know the boundary in advance.

**Idea.** Store `last_computed_at timestamptz` per target — engine-owned, alongside the value or in a
side table like the Option-1 expiry store (`AD_STOREDCOLUMN_EXPIRY`-shaped). A scheduled sweep
re-dirties every target whose `last_computed_at < start_of_today` (or older than a configurable TTL),
so **each row is refreshed at least once per period**. This catches *any* midnight boundary crossing
without knowing in advance when it happens — the row is simply recomputed because it hasn't been
touched since the last period, and the recompute (reading `now()`) naturally picks up whatever
boundary elapsed.

**Wins vs Option 1:**

- **No author-provided `f_next(target_id)` function.** That was Option 1's biggest author burden and
  a real consistency risk (a next-expiry function that disagrees with the value function silently
  wakes rows at the wrong time). Option 4 needs none — staleness is engine-observed, not
  author-predicted.
- **Self-correcting.** A row missed by one sweep (transient failure, dead-letter, a bug in a
  predicted boundary) is caught by the *next* sweep. There is no reliance on having predicted the
  boundary correctly — the worst case is a one-period delay, not permanent staleness.
- **The timestamp is useful on its own.** `last_computed_at` can be surfaced to consumers ("price as
  of X") — observability that no other option gives for free, and a natural audit trail.

**Honest cost.** On the first tick after midnight, "everything not computed today" is ≈ **every row**,
so per-day cost sits at **Option-2 level** (blunt cadence), **not** Option-1 level (which touches only
the rows that actually expire). The `last_computed_at` guard only avoids redundant recompute *within*
a period; it does **not** give fine per-row targeting. So Option 4 is best understood as **an improved
Option 2**: it swaps "recompute all blindly each tick" for "recompute what hasn't been touched since
the last boundary," plus an auditable timestamp. It gains **author simplicity + observability** and
loses **precision-at-scale** versus Option 1.

**Sub-variant (surface-only).** Store `last_computed_at` and do **not** auto-fix the drift — just
expose staleness to the reader so they decide whether to trust or refresh. Cheapest of all, but it
only makes the gap *visible*, it does not close it.

| Aspect | Detail |
|--------|--------|
| Plug-in point | Sweep does a Phase-1-equivalent `INSERT … ON CONFLICT DO NOTHING` into `AD_STOREDCOLUMN_DIRTY` for every target whose `last_computed_at` is older than the period/TTL; existing drain handles the rest. On recompute, stamp `last_computed_at = now()`. |
| New AD fields | `Expirable` + a TTL/cadence (e.g. `Expiry_TTL` or reuse `Expiry_Cadence` from Option 2). No next-expiry function. |
| New schema | A per-target `last_computed_at timestamptz` — engine-owned side table (keeps target schema clean) or a generated companion column on the target table. |
| New process | A **staleness sweep** (or a mode of `StoredColumnQueueProcessor`) that selects targets older than the period and enqueues them. |
| Initial population | On first activation / rebuild, stamp `last_computed_at` as rows are computed. `> LARGE_TABLE_THRESHOLD` behaves like today (sentinel, off-line population). |
| Oracle | Fine — queue-only; the sweep enqueues, the Java recomputer drains and stamps. No PG-specific machinery. |
| **Precision** | **Low–medium** — per-period, not per-row. Same recompute volume as Option 2 at each boundary; the TTL only prevents *redundant* recompute within a period. |
| **Cost** | **Low** — no author function, no boundary prediction. Slightly more than Option 2 (needs the timestamp store + stamping), but far less than Option 1/3. |

### How the options compare (no recommendation)

The four sit on two axes, and the doc deliberately makes no pick between them:

| Option | Precision (per-row vs per-period) | Build cost | Author burden | Extras |
|--------|-----------------------------------|-----------|---------------|--------|
| **1 — next-expiry timestamp** | Per-row (only rows that expire today) | Highest | Author writes/maintains `f_next` (consistency risk) | — |
| **2 — cadence flag** | Per-period (all targets each tick) | Lowest | None | — |
| **3 — temporal dependency** | Per-row | High | Declared in `AD_COLUMN_COMP_DEPENDENCY` (familiar model) | Reuses the dependency abstraction |
| **4 — last-computed TTL** | Per-period (all not-yet-computed-this-period) | Low | None (no `f_next`) | Auditable "as-of" timestamp; self-correcting |

Read the axis, not a verdict: Options 1/3 buy **precision-at-scale** at the price of predicting the
boundary; Options 2/4 accept **per-period** recompute volume for far less machinery, with Option 4
adding a self-correcting sweep and an as-of timestamp. Which trade-off is right depends on target-table
size, tolerated lag, and whether an as-of timestamp is independently valuable — all judgements for the
maintaining team.

---

## 7. Validator implications (possible new rules)

Sketch only — for the team to accept/refine/renumber:

| Candidate | Check | Suggested severity |
|-----------|-------|--------------------|
| Vx | If a next-expiry function is declared, it must exist, be arity-1, return a timestamp/date type, and be `STABLE`/`IMMUTABLE` (mirrors V4–V7 for the value function) | HARD (existence/arity/return) / SOFT (volatility) |
| Vy | `Expirable` column should be `Q` (or `M`), not `S` — synchronous has no temporal transaction to attach to | SOFT (warn) |
| Vz | A temporal dependency (Option 3) must name a valid date/timestamp column on its source table (analogue of V10) | HARD |
| Vw | A temporal dependency must still resolve to targets (`Target_ID_Resolver_SQL` / link column present — analogue of V11) | HARD |

Drift detection (V15) would need to also cover the sweep/expiry objects if new `ad_scd_*` objects are
generated.

---

## 8. Impact if not addressed

- **Etendo Go / Schema Forge (us), price column:** no impact today — we dodged it with a single
  price-list version (§3). The dodge holds only as long as we never need future-dated versions; if a
  functional requirement (multiple / future-dated price lists) reopens it, our interim path is the §4
  scheduled targeted rebuild.
- **Any consumer using future-dated `M_PriceList_Version` rows:** an effective-price stored column is
  wrong from midnight until the next `M_ProductPrice` write. This is standard Etendo pricing, so the
  exposure is real for the wider install base, not just us.
- **The undodgeable class — inherently `now()`-relative values** (overdue / aging, subscription
  "active as of today", effective FX amount): here there is **no shape-of-data workaround** at all
  (§3) — you cannot flatten *time*. Today these are simply **not viable** as stored columns and must
  fall back to virtual `SQLLogic` (paying the per-read cost the engine exists to remove) or to a
  scheduled blunt rebuild. This is where the gap bites hardest, and where a real consumer will hit it
  the day they want overdue/aging as an indexable stored column.

Net: without this, the engine's reach stops at the boundary of time-dependent values. Some of that
class is dodgeable by reshaping data (our price case); a large part of it (anything intrinsically
`now()`-relative) is not — a meaningful and recurring shape in ERP data.

---

## 9. Non-goals / out of scope

- **Not** changing existing `S`/`Q`/`M` semantics or the source-write path. Purely additive.
- **Not** true real-time / streaming (continuous sub-second) re-evaluation. Arbitrary `timestamptz`
  boundaries **are** in scope as a per-column configurable option (§5); what stays out is a promise of
  continuous, always-current re-evaluation between sweep runs. The model is "eventually consistent
  within the sweep interval," with the interval as coarse (daily default) or fine (down to the
  configured horizon) as the column needs — not a live feed.
- **Not** a general-purpose scheduler or cron surface inside the engine — reuse Process Request
  scheduling, as `StoredColumnQueueProcessor` already does.
- **Not** making computation functions time-*aware* on the engine's behalf — the module author still
  writes the `now()`/`CURRENT_DATE` logic; the engine only learns *when to re-run* it.
- **Not** a synchronous ("exact at this instant") guarantee for temporal values.

---

## 10. Open questions for the maintaining team

1. **Appetite & horizon:** is this worth a backlog slot at all, and if so is the cheap Option 2 the
   right v1, or is precision (Option 1/3) worth doing once?
2. **Where does expiry come from?** A separate `f_next(target_id)` function, a second return value
   from the existing function, or derived by the engine from a declared temporal column (Option 3)?
3. **Storage:** engine-owned side table (`AD_STOREDCOLUMN_EXPIRY`) vs. a generated companion column on
   the target table — any precedent/preference from the EPL-1807 design?
4. **Sweep ownership:** we lean toward **a mode of the existing `StoredColumnQueueProcessor`, not a new
   process** (§5) — it inherits the per-client partitioning, one-drainer-per-client rule, and
   sequence-number ordering for free. Open part: exactly how the temporal-wake-up pass interleaves with
   the source-driven drain within a single run, and whether a very fine horizon warrants a separate
   cadence after all.
5. **Granularity:** we lean toward **date-level (midnight) as the default, with a per-column
   configurable fine `timestamptz` horizon** for the cases that need it (§5). Open part: what the
   configuration surface looks like, and whether sub-daily horizons are worth supporting in v1 or
   deferred.
6. **`S` + Expirable:** reject, normalize to `Q`, or allow with a warning?
7. **`ad_scd_check` semantics:** should it (or a sibling) become the canonical "is any temporal row
   overdue?" probe, given it already detects time-only drift?
8. **Oracle:** we believe expiry is *simpler* on Oracle (queue-only, no deferred-trigger machinery) —
   is that the team's read too?
9. **Which philosophy?** *Predict expiration* (Option 1/3 — `f_next` / temporal column, precise but
   author-predicted) vs *track last-computed* (Option 4 — TTL / staleness, per-period but
   self-correcting and author-simple)? And, independent of which drives the refresh: is an auditable
   **last-computed / as-of timestamp** worth exposing to consumers regardless?

---

## 11. Suggested next step

No action requested beyond a **triage read**. If the gap is deemed real, we would:

1. File a Jira on the core/EPL-1807 side referencing this document and ETP-4603.
2. Join a short design conversation to pick an option (§6) before any implementation.

We are happy to contribute the pricing use case as a concrete test scenario (it already exercises the
`M_ProductPrice → M_PriceList_Version.ValidFrom → M_PriceList` walk end to end).

---

> **Open for iteration.** This is a first draft written from the downstream consumer's vantage point.
> Names, option boundaries, validator rules, and even the framing are all up for revision — please
> mark it up, push back, or redirect. We would rather converge on the *right* shape with the engine
> owners than over-specify from outside.
