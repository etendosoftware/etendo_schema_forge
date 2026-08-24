# MCP Comparison — Post-Audit Run, 2026-08-19 (job B, blind-subagent)

**Targets:** `etendo-go-local` (`http://localhost:3100/mcp`), build **`00db2ba4`** on
`feature/ETP-4918` · **Holded** demo tenant, re-probed live this run.
**Jira:** ETP-4918 (Epic ETP-3504) · **Labels:** `plataforma`, `validacion-agentica`
**Mode:** write-probe, authorized by the human for **both** environments as test tenants.

> **Method change, and it is the reason this run matters.** Every previous column was measured by an
> operator who already knew the contract. This run executed the frozen suite through **one blind
> subagent per task** — no memory of prior sessions, no repo access, no database, MCP tools only.
> Each was told that if the contract does not surface a value it needs, **the task fails and that
> failure is the finding**. That instruction is what makes M2 mean what it claims to mean.

---

## 1. Headline

**MARI 80 → 90 (conservative) / 100 (measured).** Reported as a range because M1 is measurable on
only **2 of 5** suite tasks — see §6. The move is not bookkeeping: **M2 and M1 are both outcome
components**, and both improved on live evidence.

**Frozen task 3 passed for the first time since the suite was frozen.** A blind agent created a
product with a sale price, a purchase price and 100 units of stock, and verified all three by
reading them back. That was the point of ETP-4918 and it is done.

Two structural findings about the reference server, neither of which any previous run had reached:
**Holded cannot issue a sales invoice** (no write verb exists) and **cannot read a product back**
(no `get_product`/`list_products`). Both are §7 migrations — see §8.

---

## 2. Method & Scope

- **Etendo GO target:** `etendo-go-local` only. `etendo-go-exp` / `etendo-go-staging` were **not**
  probed, so nothing here says what is released.
- **Build:** `00db2ba4`, which carries four ETP-4918 commits: `writableVia` + readOnly invariant
  (`96fc95b5`), the child-entity `parentId` hint (`a544eb4f`), `metadata.notes` (`a6a2045c`), and the
  aging-report fix (`00db2ba4`).
- **Holded:** re-probed live (`list_taxes`, `list_invoices`, `get_invoice`, `create_contact`,
  `create_product`, `delete_*`, plus catalog scans).
- **Write mode.** The "no records were mutated" claim does **not** apply to this run.

**Records created and their disposition:**

| Record | System | Disposition |
|---|---|---|
| sales invoice `DF4CB011…` + line `1C84256D…` | Etendo | deleted |
| product `2F458B0B…` (`MCP-BENCH-T3-001`) | Etendo | **deletion refused** — referenced by the processed inventory |
| physical inventory `F437D88A…` + line | Etendo | **deletion refused** — processed document |
| product prices `BEFC7593…`, `06B24B98…` | Etendo | deleted |
| product `1525AE8D…` + inventory `F5EA2528…` | Etendo | **leftover from the operator's 08-19 pre-run**, deletion refused |
| contact `6a85da25…` (empty name) | Holded | deleted |
| product `6a85dad1…` | Holded | deleted |

Two undeletable Etendo leftovers per task, both blocked by the same FK rule once an inventory is
processed. That is a property of the ERP, not an MCP defect, and it is the known cost of measuring
the stock third of task 3 at all.

**One completion action was fired**, under narrow written authorization: `processNow` on a
physical-inventory document the run created. No `documentAction`, no posting, no Holded
`approve_*`/`send_*`.

---

## 3. Delta against the registry

* **Advanced IMP-28** — `writableVia` live on all three computed product fields; `readOnly` now agrees
  with `visibility`; frozen task 3 passes. Clause 2 (rejecting the read-only write) remains
  deliberately deferred, so the item stays **⚠️ 2.5/5** rather than closing. Evidence: rows E3, E7.
* **Added IMP-34** — `view:"create"` omits the parent FK on a child entity while `neo_create`
  requires it (P1, ♻️). Three confirmed instances. Evidence: rows E5, E8, E9.
* **Added IMP-35** — a derived field states where it is *written* but not where it is *read*, and its
  refresh is asynchronous, so an agent reads `null` and concludes failure (P2, ♻️). Evidence: row E7.
* **Added IMP-36** — `metadata.unresolvedFields` omits a field that failed to resolve without
  throwing, so the array reports "nothing unresolved" when something was (P2, ♻️). Evidence: row E6
  plus the `AgingReportHandler` investigation.

No regressions found.

---

## 4. Verification of the shipped wave

| Item | Verdict | The call that decided it |
|---|---|---|
| `writableVia` on computed fields | ✅ live | E3 — all three fields carry `{spec, entity, note}` |
| `readOnly` agrees with `visibility` | ✅ live | E3 — `readOnly:true` next to `visibility:"readOnly"` |
| child-entity `parentId` hint | ✅ live | E4 — clause present on `inventoryLine`, absent on headers |
| `metadata.notes` | ✅ live | E6 — names field, token and action; absent when nothing to say |
| aging-report schema resolution | ✅ live | E10 — 200 with buckets where it was 422 before |
| aging-report honest message | ⏳ unverified | cannot be triggered now that resolution succeeds |

That last row is worth stating plainly: **the fix removed the only way to observe the fix to the
message.** The message change is covered by unit tests only, and those have not been run.

---

## 5. Live evidence

All rows on `etendo-go-local` @ `00db2ba4` unless marked Holded.

| # | Call | Verbatim result (excerpt) | Establishes |
|---|---|---|---|
| E1 | `neo_discover()` | `count: 56` + `guidance.tool: "docs"` | spec inventory unchanged at 56 |
| E2 | `list_taxes()` (Holded) | 8 taxes, flat model | reference server healthy |
| E3 | `neo_schema product/product fields:[eTGOSalePrice,…]` | `"readOnly": true, "visibility": "readOnly", "writableVia": {"spec":"product","entity":"price","note":"Set on the sale price list…"}` | IMP-28 clause 1 + the pointer |
| E4 | `neo_schema physical-inventory/inventoryLine view:"create"` | hint ends *"This is a child/line entity: before calling neo_create, call neo_defaults with parentId…"* | the child-entity hint |
| E5 | same as E4 | `physInventory` absent from both `required` and `optional` | **IMP-34** |
| E6 | `neo_defaults …/inventoryLine` (no `parentId`) | `notes: ["storageBin: its default needs @M_WAREHOUSE_ID@ from the parent record, but no parentId was given…"]`, `unresolvedFields: []` | `notes` works · **IMP-36** |
| E7 | `neo_get product/product` after processing inventory | `eTGOSalePrice:35, eTGOPurchasePrice:20, eTGOStock:null` — stock found via sibling `product/stock` as `quantityOnHand:100` | **IMP-35** |
| E8 | `neo_create product/price` without `product` | `422 validation_error`, `missingFields:[{name:"product",…}]` | IMP-34, second instance |
| E9 | `neo_schema sales-invoice/lines fields:["invoice","salesInvoice","header"]` | only `invoice` exists, `readOnly:true`, `visibility:"system"` — the rest in `unknownFields` | IMP-34, third instance |
| E10 | `generate_aging_receivable({recOrPay:"RECEIVABLES", showDetails:true})` | `{"data":[],"count":0,"meta":{…activeBuckets:4…}}` — **was 422** | aging fix |
| E11 | `neo_list sales-invoice/header filters:{status:"bogus"}` | `422`, `available:["completed","pending","partial"]`, `hint`, `seeAlso` | IMP-3 self-correcting error holds |
| E12 | `neo_get` nonexistent id | `404 not_found`, detail names spec/entity/id, `seeAlso` | IMP-5 holds |
| E13 | `neo_create product/product` with `searchKey:""`, `name:""` | `422`, both fields in `missingFields` | empty-string guard **holds** |
| E14 | `create_contact({name:""})` (Holded) | **`200` + `{"id":"6a85da25…"}`** — a real contact with a blank name | Holded validates presence, not content |
| E15 | catalog scan (Holded) | no `create_invoice` anywhere; invoices are read-only | **structural gap** |
| E16 | catalog scan (Holded) | no `get_product` / `list_products`; products are write-only | **structural gap** |

---

## 6. Scorecard

| Metric | 08-13 (A) | **08-19 (blind)** | Note |
|---|---|---|---|
| **M1** — calls-to-outcome vs Holded | 1.0× carried | **0.75× on 2 of 5 tasks** | T1/T3 `n/m` (Holded cannot perform), T4 `n/m` (forbidden) |
| **M2** — first-call success | 67 % carried | **100 % (4/4)** | every executable task passes, blind |
| **M3** — payload signal ratio | — | ~11 % on `neo_create` product | 3 fields sent, ~50 returned. Approximate: keys counted by hand |
| **M4** — self-correctable errors | — | **100 % (5/5)** | E8, E11, E12, E13 + the T5 halves |
| **Delivery** | 77.5/126 → 62 | 77.5/126 → 62 | unchanged: IMP-28 stays ⚠️, new items enter at ⏳ = 0 |
| **Coverage** | 6/6 | 6/6 | reports surface re-probed live (E10) |

### MARI

```
MARI = 0.30×M2 + 0.30×M1 + 0.25×Delivery + 0.15×Coverage

measured      M2 100 · M1 133 (0.75×) · D 62 · C 100  ->  MARI 100
conservative  M2 100 · M1 100 (1.00×) · D 62 · C 100  ->  MARI  90   <- the defensible figure
pessimistic   M2 100 · M1  80 (1.25×) · D 62 · C 100  ->  MARI  84
```

**Why a range and not a number.** M1 is measurable on two tasks, and one of them is distorted:
Etendo answers T2 in a single call **because the tenant has no receivables** — the report returns
`count: 0`. Holded needs two calls **because it has data** and its model splits `pending` from
`partial`. Comparing 1 against 2 when one side returns nothing is not comparing the same work. The
same asymmetry ran *against* Etendo this morning (7 calls spent confirming an emptiness), so
accepting it now that it pushes the other way would be incoherent.

**Which components moved, in the skill's required words:** M2 **and** M1 moved — the product got
better for an agent. Delivery did not move at all; nothing here is bookkeeping.

### ACE

**ACE-v this run is estimated, not measured** — the subagents reported approximate byte totals
rather than `wc -c` on saved payloads, which the ACE rules require. Recorded as such and **not
carried into any ratio**: T1 ≈ 9–10 kB vs ≈ 6 kB, T2 ≈ 2.2 kB vs ≈ 2.3 kB, T3 ≈ 9–10 kB vs ≈ 1.5 kB.

**ACE-p, sampled estimate:** Etendo ≈ 38 kB / 17 tools (exact count) vs Holded ≈ 370 kB / ~180 tools
(count read off the catalogue). **Break-even is deliberately not reported** — the formula assumes both
catalogues are preloaded, and Holded's arrived **deferred** in this very session, needing `ToolSearch`
round trips before any call. Full reasoning in `/mcp-ace-comparison`.

---

## 7. New backlog items

### IMP-34 · `view:"create"` omits the parent FK that `neo_create` requires — P1, ♻️

**BEFORE** (`physical-inventory/inventoryLine`, E5): `required:[product]`, `optional:[lineNo,
quantityCount, cost, description, storageBin]`. `physInventory` appears in neither, yet the create
fails without it. Same on `product/price` (`product` omitted, E8) and `sales-invoice/lines` (`invoice`
omitted and marked `visibility:"system"`, E9) — **three entities, three specs**.

The hint added in `a544eb4f` tells the agent to send the parent FK but **does not name it**. A blind
agent probed three candidate names (`invoice`, `salesInvoice`, `header`) to find it.

**AFTER:** the parent FK appears in `view:"create"`'s `required` group, or the child-entity hint names
it explicitly (`"send physInventory with the parent's id"`). The server knows the field; the agent
should not have to guess it.

**Done when:** on all three entities above, a blind agent can assemble a valid `neo_create` body from
`view:"create"` + `neo_defaults(parentId)` alone, with no name-guessing round trip. **Moves M1.**

### IMP-35 · A derived field says where to write it, never where to read it — P2, ♻️

**BEFORE** (E7): after a processed inventory, `neo_get` on the product returns `eTGOStock: null`
while the stock is real — `product/stock` reports `quantityOnHand: 100`. `EM_ETGO_Stock` is
`refresh_mode='Q'` (asynchronous), unlike the prices (`'S'`, immediate). `writableVia` names where to
write and says nothing about where the value can be read now.

The blind agent survived only by exploring a sibling entity, and said so: *"an agent with less
patience would very plausibly report stock: unverifiable"*.

**AFTER:** the descriptor also carries the read location, and states that the value is refreshed
asynchronously so `null` is not evidence of failure.

**Done when:** an agent that writes stock can confirm it from the field descriptor alone, without
exploring sibling entities. **Moves M2** (it is a false-failure generator).

### IMP-36 · `unresolvedFields` omits what failed silently — P2, ♻️

**BEFORE** (E6): with no `parentId`, `storageBin` is absent from `defaults` **and** from
`unresolvedFields`, which reads `[]`. Root-caused in `NeoDefaultsService`: the array is populated only
from the `catch`, and the `@SQL=` default returns `null` cleanly without throwing.

**AFTER:** a field whose default expression was evaluated and produced nothing appears in
`unresolvedFields` — or the array is retired in favour of `notes`, which now covers the case in prose.

**Done when:** no response reports `unresolvedFields: []` while omitting a field the caller must
supply. **Moves M2.**

> **Same family, three times over.** IMP-36, the aging report's false 422, and IMP-28's original
> silent 200 are one defect class: **the server reports a cause it never verified**. Worth a design
> rule for the team — if you did not verify why, say "could not resolve X", never why.

---

## 8. Preference verdict — as a delta

**Moved from Holded's column to ours this run:**

- **Issuing a sales invoice.** Holded exposes no write verb for invoices at all (E15). `create_sales_order`
  even promises conversion "into invoices" with no conversion tool. Etendo completed the task with its
  first write succeeding. This was Holded's home ground and is now ours.
- **Verifying your own write.** Holded has no product read verb (E16): `create_product` returns an id
  and nothing else, so a caller cannot tell success from a silent no-op. Etendo read all three values back.
- **Guarding against a garbage value.** Holded accepted `name: ""` and created the record (E14); Etendo
  rejects the same shape with a 422 naming both fields (E13). Probed symmetrically on purpose.

**Still theirs, and not softened:**

- **Fewer calls on a read task with real data.** Two calls against seven this morning, and its tool
  *description* pre-warns about partial payments where Etendo hides the same subtlety inside
  `neo_schema`'s `namedFilters`. Cheap fix, named below.
- **Per-call payload.** Etendo remains materially heavier; a create returns ~50 fields for 3 sent.
- **Domains we do not expose** — CRM, projects, HR, recurring documents.

**Decision rule:** anything regulated, accounted, or where the agent must confirm its own work →
Etendo GO. Quick single-shot CRUD on a domain both cover, in a short session → Holded. **What would
take that second class too:** IMP-34 and IMP-35 (fewer round trips per outcome) plus trimming write
responses — not more tools.

**Cheapest win visible this run:** move the partial-payment warning from the `namedFilters`
description into the tool description, where the agent reads it *before* calling. One line.

---

## 9. What was NOT tested

- **`etendo-go-exp` / `etendo-go-staging`** — not probed. Nothing here describes what is released.
- **Frozen task 4** (complete a sales order) — forbidden in every mode; permanently `n/m`.
- **`neo_batch`** — not exercised, so IMP-24's batch clause stays unmeasured.
- **`neo_action` beyond `processNow`** — the actions worth probing complete or post documents.
- **The aging report's new message** — unobservable now that resolution succeeds (§4).
- **The 35 accumulated unit tests** across the four commits — **never executed**. The user reported
  the Java suite green earlier today, which predates `a6a2045c` and `00db2ba4`.
- **ACE-v with `wc -c`** — estimated only, see §6.

---

## 10. Closing snapshot

> Read-only restatement of the registry. If anything here disagrees with
> [`mcp-improvements-registry.md`](mcp-improvements-registry.md), the registry is right.

### 10.1 MARI

**MARI = 90 (conservative) · 100 (measured)** — previous: **80**.

| Component | Weight | Value | Contribution (conservative) |
|---|---|---|---|
| M2 — first-call success | 0.30 | **100** (was 67) | 30.0 |
| M1 — calls-to-outcome | 0.30 | **100** conservative / 133 measured | 30.0 |
| Delivery | 0.25 | 77.5 / 126 → 62 | 15.4 |
| Coverage | 0.15 | 6/6 → 100 | 15.0 |

**KR verdict: 88 met in the conservative scenario.** Both moved components are outcome components,
so this is a product claim, not bookkeeping — with the M1 base (2 of 5 tasks) stated as the caveat.

### 10.2 ACE — companion index, not part of MARI

ACE-p ≈ 38 kB vs ≈ 370 kB (sampled). ACE-v estimated only. **Break-even withheld** — Holded's
catalogue was deferred, so its priming was never paid.

### 10.3 The whole board — 36 registered items

**Resolved (16)** — IMP-2, 3, 5, 6, 8, 9, 10, 11, 12, 15, 17, 19, 21, 22, 23, 25.

**Pending — P1 (7)**

| Item | | What it is |
|---|---|---|
| IMP-34 | ⏳ 0/5 | The parent foreign key is required on a child create but never listed |
| IMP-30 | ⏳ 0/5 | Create accepts values on read-only fields; the rejection has no caller on the MCP path |
| IMP-31 | ⏳ 0/5 | One handler on an entity exempts every field on it from that rejection |
| IMP-26 | ⏳ 0/5 | MCP and NEO describe the same field from two different DB columns |
| IMP-1 | ⚠️ 2.5/5 | Field names are raw and carry no per-field prose |
| IMP-16 | ⚠️ 2.5/5 | Date format is not the same across defaults and the write verbs |
| IMP-24 | ⚠️ 2.5/5 | Non-ISO dates are rejected rather than misparsed — except on batch |
| IMP-28 | ⚠️ 2.5/5 | Visibility and read-only contradicted each other; clause 2 deferred |

**Pending — P2 (11)**

| Item | | What it is |
|---|---|---|
| IMP-35 | ⏳ 0/3 | A derived field says where to write it but not where to read it |
| IMP-36 | ⏳ 0/3 | The unresolved-fields list omits what failed without throwing |
| IMP-13 | ⏳ 0/3 | Nothing marks business-critical fields; named filters have no authoring path |
| IMP-20 | ⏳ 0/3 | Write verbs return the whole record with no way to ask for less |
| IMP-27 | ⏳ 0/3 | No per-field switch for how the MCP treats a field |
| IMP-29 | ⏳ 0/3 | Entity identifiers come from AD tab names, so they shift with language |
| IMP-32 | ⏳ 0/3 | The human-readable identifier prints dates in a format the write verbs refuse |
| IMP-4 | ⚠️ 1.5/3 | Foreign keys can be given as human names on write — partly |
| IMP-7 | ⚠️ 1.5/3 | Defaults response is leaner and grouped — partly |
| IMP-14 | ⚠️ 1.5/3 | The published docs match the real tool names — partly |
| IMP-18 | ⚠️ 1.5/3 | Unknown field names are reported on read, ignored on write |

**Pending — P3 (1)** — IMP-33 ⏳ 0/1: a failed write points at the docs topic for *reading*.

16 + 8 + 11 + 1 = **36**.

### 10.4 Owed by the human, not by a run

1. **Run the Java suite.** 35 tests across four commits have never executed. The green report earlier
   today predates the last two commits.
2. **Seed the tenant, or accept that read tasks measure the instance.** One customer, six products,
   one zero-total invoice. T2's distortion in both directions traces to this.
3. **Add comparable suite tasks.** M1 rests on 2 of 5. Until that widens, every MARI carries a
   16-point band.
4. **Four branches unpushed** on `feature/ETP-4918`; `etendo-go-docs` PR #36 open against `main`.
5. **Two undeletable Etendo leftovers** per §2, plus two from the operator's pre-run.
