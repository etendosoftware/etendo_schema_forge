# MCP Comparison — Post-Audit Run, 2026-08-10

**Job:** A — verify the IMP-15 wave (four A.6 clauses + the `a4963b6b` uOM narrowing), then Step 3b.
**Etendo GO target:** `etendo-go-local` (`http://localhost:3100/mcp`), build **`a4963b6b`** on
`feature/ETP-4793` — compiled and deployed by the user immediately before this run.
**Holded:** `https://mcp.holded.com/mcp`, demo tenant — re-probed on the paired write comparison
only (§4). Its catalog rows in base §4/§6 were **not** re-enumerated; they are not fresh.
**Probe mode:** **write-probe mode**, authorized per-run by the user in this conversation
("Sí, write probes en local" / "Ambos MCPs"). The "no records were mutated" claim does **not** hold
for this run — see §2.

> **Headline: MARI 49 → 73.** Driven by outcome, not by activity: M2 40 % → 80 % and M1 2.1× → 1.4×.
> The KR target (`MARI 28 → 68`) is met. Read §6 before believing the M2 number — the frozen suite
> has become unrepresentative in a way that flatters the product.

---

## 1. What changed, in the registry's three sentence shapes

* **Resolved IMP-15** — all four A.6 clauses credited live; the `a4963b6b` narrowing verified from
  both sides. ⏳ → ✅.
* **Resolved IMP-10** — `docs` is first-class and the `etendo_neo_*` drift is gone from the live
  Context7 index. ⚠️ → ✅.
* **Resolved IMP-25** — boolean type normalization in `neo_defaults` (promoted from the registry's
  unnumbered candidates, as that entry instructed). Registered and closed in the same run.
* **Advanced IMP-12** — `view:"create"` ships and works; it still omits required fields on
  `sales-order`. ⏳ → ⚠️.
* **Advanced IMP-11** — `visibility` / `userRequired` now emitted on curated entities and on the
  actions view; 1,422 fields in 89 MCP-exposed uncurated entities still omit them. ⏳ → ⚠️.
* **Advanced IMP-16** — the read/emit half is fixed (every date ISO, everywhere probed); the
  write-parse half is **worse than the item specified**. ⏳ → ⚠️.
* **Advanced IMP-14** — the tool-name-drift half is live-confirmed; the `fields`/`view` half is
  committed but unpushed, so nothing changed for a live agent. ⏳ → ⚠️.
* **Added IMP-22** — display-name resolution fails on **context-dependent** FK selectors (P2, ⚙️).
* **Added IMP-23** — `neo_batch` is not atomic: it reports `committed:false` after committing
  earlier ops (P1, ♻️).
* **Added IMP-24** — write verbs silently misparse non-ISO dates into corrupt values under
  `status: 0` (P1, ⚙️).
* **Added IMP-25** — boolean fields typed as strings in `neo_defaults` (P2, ♻️) — already ✅.
* **Re-confirmed, no change:** IMP-1, IMP-4, IMP-5, IMP-7, IMP-18, IMP-21.

IMP-5's named gap (`neo_batch` leaking raw DAL `status:-4`) **did** close. It stays ⚠️ because the
same run found two further non-envelope paths in the same tool — see §5.3. IMP-4's two named gaps
also closed, and it stays ⚠️ for the reason that became IMP-22. Both evidence cells are rewritten.

---

## 2. Method & scope — records created and their disposition

Write probes ran on `etendo-go-local` and on the Holded demo tenant. Every Etendo record carried
`MCP-BENCHMARK 2026-08-10` in `description`. No pre-existing record was mutated except by the
date probe in §4, which acted on a record **this run created**. No completion or posting action was
fired on either side.

| # | Side | Record | Purpose | Disposition |
|---|---|---|---|---|
| 1 | Etendo | `sales-order` header `1000026` / `355FE1F4925741368C875967523FFC17` | uOM clause, create-view probe | **deleted** |
| 2 | Etendo | `sales-order` line `B9FE249620D24F88A797F5C580D0806B` | uOM injection with no `uOM` sent | **deleted** |
| 3 | Etendo | `sales-order` header `1000027` / `7DDA5EA66DFB436B9681D2E574700445` | left committed by the non-atomic batch (§5.2); later the target of the date probe (§4) | **deleted** |
| 4 | Etendo | `sales-invoice` header `10000021` / `EECD3AC6853B45C1A635E1934E72D274` | frozen-suite task 1 | **deleted** |
| 5 | Holded | contact `6a79c267a3c1abe640070b42` | paired counterpart for the order | delete issued, **unverifiable** |
| 6 | Holded | sales order `6a79c273175fad85e005c5d4` | paired date probe | delete issued, **unverifiable** |

**Etendo cleanup verified** by `SELECT`-only SQL: 0 rows matching `%MCP-BENCHMARK%` in `c_order`,
`c_orderline`, `c_invoice`, `c_invoiceline`.

**Two disposition findings, not footnotes:**

1. **Holded deletion cannot be verified.** `delete_contact` and `delete_sales_order` return empty
   bodies, and Holded exposes **no read verb** for either object type — no `get_contact` /
   `list_contacts`, no `get_sales_order` / `list_sales_orders`. There is no call in its catalog that
   can confirm rows 5 and 6 are gone. This is recorded as a Holded gap in base §8, not as an Etendo
   one.
2. **The 2026-08-05 run left an undeleted record and did not know it.** This run's cleanup sweep
   found `sales-order` header `1000017`, tagged `MCP-BENCHMARK 2026-08-05 batch`, still in `DR`.
   That is exactly the orphan header IMP-23 predicts: the batch reported `committed:false`, so the
   run had no reason to look for it. Deleted here. **The non-atomicity defect actively defeats this
   skill's own cleanup discipline** — any future write run must sweep by marker, not by the ids it
   believes it created.

---

## 3. Scorecard — M1–M4 against the frozen 5-task suite

The suite is frozen in `mcp-comparison-post-audit-2026-08-06.md` §13 (lines 143–151). Every number
below was re-measured on 2026-08-10; **nothing was carried forward**.

| Task | Outcome 08-06 | Outcome 08-10 | Calls (ideal) 08-10 | Ratio 08-06 | Ratio 08-10 |
|---|---|---|---|---|---|
| 1 — create an invoice | ❌ | **✅ first call** | 2 (2) | 4.5× | **1.0×** |
| 2 — pending invoices via named filter | ❌ | **✅ first call** | 1 (1), 2 cold | 2.0× | **2.0×** |
| 3 — product with sale price + purchase price + stock | ❌ | ❌ | unanswerable | 2.0× | **2.0×** |
| 4 — action discovery | ✅ | **✅ first call** | 1 (1) | 1.0× | **1.0×** |
| 5 — nonexistent read + invalid write | ✅ | **✅ both halves** | 1 (1) | 1.0× | **1.0×** |

* **M2 — first-call success rate: 40 % → 80 %** (4 of 5).
* **M1 — calls-to-outcome ratio: 2.1× → 1.4×** (mean of per-task ratios).
* **M3 — introspection depth:** unchanged in kind, materially cheaper in cost — `view:"create"`
  returns 2 required / 22 optional where the full dump was 61,963 chars.
* **M4 — agentic-safety signals:** unchanged. `businessCritical` is still `false` on
  `documentAction` and `posted` (IMP-21).

Task 2 is scored **2.0×, not 1.0×**, deliberately. The single call succeeded, but only because this
run already knew `"pending"` was a valid value. A cold agent needs a discovery call. Crediting 1.0×
would be scoring my own prior knowledge as a product improvement. The discovery path is now cheap
and self-correcting, which is the real gain: `filters:{"status":"nonexistent-status-probe"}` returns
`Unknown status 'nonexistent-status-probe' for entity 'header'. Available: completed, pending,
partial` — one call, names the valid set. (It arrives as a raw string, not the IMP-5 envelope; see
§5.3.)

Task 3 keeps its 2.0× because it remains unanswerable, not because the cost is known — see §5.4.

---

## 4. The strongest comparative finding: silent date corruption on write

One malformed input, `"09-08-2026"` (unambiguously day-month-year to a human, and exactly what a
Spanish-locale agent produces), sent to both MCPs on the same task.

**Etendo GO** — `neo_update` on `sales-order` header `7DDA5EA66DFB436B9681D2E574700445`:

```json
{ "status": 0, "orderDate": "0015-02-16", "accountingDate": "0015-02-16" }
```

Accepted. `status: 0`. Stored **year 0015**, and propagated the corruption to a sibling date field
the call never mentioned. Confirmed in the DB, and reproduced arithmetically: the lenient
`yyyy-MM-dd` parse reads year 0009, month 08, day **2026**, and the day overflow rolls forward
2,025 days — `date(9,8,1) + timedelta(days=2025) == date(15,2,16)`.

**Holded** — `create_sales_order` with the same string:

```
HTTP 400 — Invalid date format: "09-08-2026". Expected format: YYYY-MM-DD
(e.g. 2026-08-10) or ISO 8601 datetime …
```

Rejected. Nothing created. The error names the offending value, the expected format, and a concrete
example.

This is the **live root cause** of the 14 corrupt date rows recorded under IMP-16, now demonstrated
end to end rather than inferred. It is registered as **IMP-24** at P1 rather than folded into
IMP-16, because IMP-16's mechanism (canonicalize on emit) shipped and works — leaving the corruption
inside IMP-16 would let a ⚠️ half-credit conceal a P1 data-integrity defect.

**It also inverts the 2026-08-06 report's summary of the two failure modes.** That run wrote:
*"Etendo GO fails by dropping input in silence or by rejecting its own output; Holded fails by
accepting bad input in silence and then refusing to show you the result."* On this probe the
polarity is reversed — Holded rejected loudly and correctly; Etendo GO accepted silently and
corrupted. The generalization does not survive, and base §8's transactional-integrity and
input-validation strengths need correcting, not merely extending.

---

## 5. Defects — verified live this run

### 5.1 IMP-12 is partially fixed, not closed

`view:"create"` ships and is a real improvement: on `sales-invoice/header` it returns 2 required /
22 optional and **the create succeeds on the first call**. On `sales-order` it still under-reports:

| Spec / entity | Field genuinely required | In `view:"create"`? |
|---|---|---|
| `sales-order/header` | `partnerAddress` | ✅ (fixed since 2026-08-07) |
| `sales-order/header` | `invoiceAddress` | ❌ — rejected the create with `validation_error` |
| `sales-order/lines` | `orderDate` | ❌ — rejected the create |
| `sales-order/lines` | `salesOrder` (parent FK) | ❌ — accepted when sent, never advertised |

Following the create view verbatim therefore still fails on `sales-order`. Sharpening the finding:
**the correct field list already exists in the docs corpus.** `docs(topic:"creating records")`
returns a `sales-order/header` recipe that *does* include `invoiceAddress`, and a lines recipe that
*does* include `salesOrder`. Two sources of truth for the same contract, and the machine-readable
one is the incomplete one.

### 5.2 `neo_batch` is not atomic — IMP-23, reproduced a fourth time with the mechanism isolated

The first probe was **inconclusive and is reported as such**: a batch failed, nothing persisted, and
that proves nothing — it is equally consistent with real atomicity and with a validation pre-pass
that never opened a transaction. The discriminating probe: `information_schema` gives
`c_order.description` as `varchar(255)`, so a 281-character description forces a failure at
**persist** time rather than at FK-resolution time. Result: `committed: false` returned, and order
`1000027` persisted anyway.

**The mechanism, which matters more than the headline:**

| Failure class | Where it happens | Atomic? |
|---|---|---|
| FK resolution (unknown display name) | `McpToolRouter#resolveBatchFkNames`, **before** the transaction opens | rolls back cleanly — *looks* atomic |
| Persist (constraint, trigger, DAL) | inside the op, after `DefaultJsonDataService.add` → `commitAndClose` | **prior ops stay committed** |

So "`neo_batch` is not atomic" is true but under-describes it: the tool is atomic for the failure
class the pre-pass catches and non-atomic for every other, which is precisely why three prior runs
saw it intermittently.

### 5.3 The batch failure envelope differs by failure class — folded into IMP-5

IMP-5's named gap closed: the raw DAL `status:-4` is gone. Two non-envelope paths remain in the
same tool, so IMP-5 stays ⚠️ with a rewritten evidence cell rather than earning a new number.

* Persist-time failure → the documented shape:
  `{committed:false, failedAt:{index,id}, error:{status,error,detail,seeAlso}}`.
* FK-resolution failure → flattened `{status, error:"not_found", detail, field, failedAt}` — **no
  `committed` key at all**, and `error` is a bare string where the other path nests an object. An
  agent branching on `committed` cannot read this response.
* The unknown-named-filter error (§3) arrives as a raw `Error executing neo_list: …` string.
* Read-verb errors are wrapped as `{"response":{…}}`; write-verb errors are bare. Same envelope,
  two nestings.

### 5.4 IMP-18 re-confirmed — `neo_list` still drops unknown projection names in silence

`fields:["salePrice","purchasePrice","stock"]` returns the rows with those keys simply absent. No
`warnings`, no `unknownFields`, no error. **The fix pattern now exists one tool over:** IMP-12
shipped `unknownFields` on `neo_schema`'s `fields` argument. Same argument name, same tool family,
two behaviors — this is now a consistency defect, not just a missing feature. It is the sole reason
frozen task 3 still fails.

### 5.5 IMP-21 re-confirmed

Of 22 actions on `sales-invoice/header`: raw column labels (`EM_Aeatsii_Dup`,
`EM_Aeatsii_Unsubscribe`, `EM_Psd2_Generate Bank Payment`), 8 buttons flagged `required: true`, and
`businessCritical: false` on both `documentAction` and `posted` — the two most consequential
actions in the catalog. Partial credit to IMP-11: every action now carries `visibility` and
`userRequired`.

### 5.6 IMP-22 — display-name resolution fails on context-dependent selectors

`neo_create` on `sales-order/header` rejected `partnerAddress` with 422 `not_found`, using the exact
`$_identifier` string the read path returns. It is not a bad input: `neo_selectors` for the same
column with `recordContext:{businessPartner:…}` returns `label: "Madrid, Avenida Independiente 23"`
— byte-identical to what the writer rejected. Root cause: the resolver does not consult
**context-dependent** selectors, whose candidate set only exists relative to a parent field. This is
distinct from IMP-4 (which is about *format* — UUID vs legacy numeric vs display name) and gets its
own number.

---

## 6. Honesty caveat — the frozen suite now flatters the product

**M2 = 80 % is correct for the suite and misleading about the system.** The suite's create task is
on `sales-invoice`, which is exactly the spec where `view:"create"` is complete. The `sales-order`
create — multi-entity, line-bearing, the realistic agentic case — **still costs 3 creates plus 2
discovery calls against an ideal of 2**, i.e. 2.5×, because of §5.1. The suite measures the one
write path that works.

Folding that path in as a sixth task gives a shadow **M1 ≈ 1.5×** and **M2 ≈ 67 %**. Those are the
numbers to trust operationally; 1.4× / 80 % are the numbers that keep the series comparable.

Amending a frozen suite is a decision, not a side effect, so this run does not do it. **Recommended
for the next run:** add the `sales-order` header-plus-line create as task 6 and re-baseline both
metrics, accepting a one-time discontinuity in the series. Note also that M1 = 1.4× is already
inside the "registry closed" projection (1.2×) while a third of the registry is open — further
evidence the suite has stopped discriminating.

---

## 7. MARI — 49 → 73

| Component | Weight | 2026-08-06 | 2026-08-10 | Contribution |
|---|---|---|---|---|
| **M2** — first-call success rate | 30 | 40 % | **80 %** | 24.0 |
| **M1** — calls-to-outcome ratio | 30 | 2.1× → 48 | **1.4× → 71** | 21.4 |
| **Delivery** — weighted points earned | 25 | 29.5 / 97 → 30 | **49.0 / 97 → 51** | 12.6 |
| **Coverage** — probe surfaces (§2.5) | 15 | 6 / 6 → 100 | **6 / 6 → 100** | 15.0 |
| | | | | **MARI 73** |

**The quota was not re-based.** It stays frozen at **97**, as required. Four new items add 16 points
of scope (3 + 5 + 5 + 3), taking known scope from 81 to **exactly 97** — the quota is now fully
consumed. It was not trimmed to fit: two further candidates were deliberately **not** given numbers
on merit (§8.3), and folding them in would have overrun it. **The next run cannot register a new IMP
without re-basing the quota, which requires the user's decision.**

Coverage stays 6/6 and the 2026-08-06 caveat is now closed: **`neo_batch` was re-probed this run**,
so IMP-4's and IMP-15's batch clauses no longer rest on 2026-08-05 evidence.

**Spec count corrected:** `neo_discover` returns **54 specs = 46 windows + 8 reports**, all 46
carrying `primaryEntity` (IMP-9 holds). Base §5 says "56 = 48 + 8"; that number is stale and must be
recounted, never carried forward.

---

## 8. Step 3b — new proposals and the preference verdict

### 8.1 Proposals

Registered as IMP-22 … IMP-25; specifications go in base §12. In priority order:

1. **IMP-24 (P1)** — reject non-ISO dates loudly. One strict parser on the write path, an error
   naming the value, the expected format and an example, in the IMP-5 envelope. Holded's HTTP 400 is
   the target shape verbatim. This is the highest-value item in the registry: it is the only open
   defect that **destroys data** rather than costing calls.
2. **IMP-23 (P1)** — make `neo_batch` atomic or stop documenting it as atomic. The honest short-term
   move is the documentation fix (already committed in `etendo-go-docs` `18eb0dd`); the real fix is
   one transaction spanning the ops, which means not routing each through `commitAndClose`.
3. **IMP-22 (P2)** — feed parent-field context into the write-path FK resolver, so a display name
   that `neo_selectors` returns is a display name `neo_create` accepts.
4. **IMP-18 (existing, P2)** — port `unknownFields` from `neo_schema` to `neo_list`. Cheapest item
   on the board relative to its effect: it is the sole blocker on frozen task 3, so closing it moves
   M2 to 100 %.

### 8.2 What this wave took from Holded's column — promote to base §8

* **No read verbs for contacts or sales orders.** Holded has no `get_contact`/`list_contacts` and no
  `get_sales_order`/`list_sales_orders`, yet `update_sales_order`'s own description instructs the
  agent to *"First fetch the sales order with GET"* — a documented prerequisite its own catalog
  cannot satisfy. Consequences: "create an order for an existing customer" is not completable
  without already knowing the id; a created order cannot be verified; a deletion cannot be verified
  (§2). Etendo GO's read/write parity is a genuine, now-measured strength.
* **Strict date validation is Holded's, not ours** (§4) — this must be *removed* from base §8's
  input-validation strength, not added to it.
* **Transactional integrity must come out of base §8 too** (§5.2). It cannot be claimed while a
  documented-atomic verb leaves committed orphans.

### 8.3 Candidates deliberately left unnumbered

Recorded so the next run does not rediscover them, and *not* registered because the evidence does
not yet support a claim:

* **`sales-order/lines` `warehouse` does not inherit from the header** — the line came back
  `"Almacen GO"` where the header was `"Almacén Secundario"`. One observation, no root cause, and a
  line warehouse legitimately defaults from the session in Etendo. Needs investigation before it is
  a defect.
* **`tryInjectFirstFromLookup`'s alphabetical preselect for mandatory FKs** — IMP-15's write-up
  flags this as wrong in general, not just for `uOM`. **It did not reproduce** on
  `product/alternateUom` this run: the entity abstains and returns
  `missingFields:[{name:"uOM", column:"C_Uom_ID"}]` rather than guessing. State that carefully —
  the probe shows the `a4963b6b` guard working, not that the general defect is absent.

### 8.4 Preference verdict

**Unchanged in direction, materially narrowed in margin.** For an agent driving a *single* business
document end to end, Etendo GO is now the better MCP on the measured suite: read/write parity,
first-call creates on `sales-invoice`, structured errors on the single-record verbs, self-correcting
filter errors, and a real actions catalog — against a Holded catalog that cannot read back what it
writes.

Two things keep the verdict from being comfortable, and both are Etendo GO's:

* **IMP-24.** An ERP integration that silently stores year 0015 is disqualifying for unattended
  agentic use, whatever the call-count metrics say. Holded gets this right and we do not.
* **IMP-23.** `neo_batch` is the tool an agent reaches for precisely when partial failure is
  unacceptable, and it is the one tool whose failure mode is undocumented and inconsistent.

Holded's advantage remains breadth of domain (CRM, projects, HR, remittances) — base §9 territory,
not a defect. Etendo GO's advantage is depth and uniformity within a domain. **That trade is now
decided by the two P1 items above rather than by the ergonomics gap the wave just closed.**

---

## 9. Live calls — evidence index

All against `etendo-go-local`, build `a4963b6b`, 2026-08-10, unless the row says Holded.

| # | Call | Result | Backs |
|---|---|---|---|
| C1 | `neo_discover()` | 54 specs = 46 windows + 8 reports; 46/46 with `primaryEntity` | §7, IMP-9 |
| C2 | `neo_schema sales-invoice/header view:"create"` | 2 required / 22 optional | IMP-12 |
| C3 | `neo_create sales-invoice/header` | ✅ first call → `10000021` | task 1, IMP-12 |
| C4 | `neo_create sales-order/header` ×3 | 422 `not_found` on `partnerAddress` → 422 `validation_error` on `invoiceAddress` → ✅ | IMP-22, IMP-12 |
| C5 | `neo_selectors sales-order/header partnerAddress` + `recordContext` | returns the identifier the writer rejected | IMP-22 |
| C6 | `neo_create sales-order/lines`, **no `uOM` sent** | ✅ `"uOM":"100"` / `"Unit"`; no trigger 20111 | **IMP-15** |
| C7 | `neo_defaults product/alternateUom` | abstains — `missingFields:[{name:"uOM"}]` | `a4963b6b` guard |
| C8 | `neo_create` with `currency:"EUR"` / `"102"` | both resolve to `102` | IMP-15, IMP-4 |
| C9 | `neo_batch`, unknown display name | flattened `not_found`, **no `committed`**; nothing persisted | IMP-5, IMP-23 |
| C10 | `neo_batch`, 281-char description on `varchar(255)` | `committed:false` **and** order `1000027` persisted | **IMP-23** |
| C11 | `neo_update sales-order/header orderDate:"09-08-2026"` | `status:0`, stored `0015-02-16`, propagated to `accountingDate` | **IMP-24** |
| C12 | Holded `create_sales_order date:"09-08-2026"` | **HTTP 400**, names value + format + example | **IMP-24**, §8.2 |
| C13 | `neo_list sales-invoice filters:{"status":"pending"}` | ✅ first call | task 2, IMP-3 |
| C14 | `neo_list … filters:{"status":"nonexistent-status-probe"}` | names `completed, pending, partial`; raw string, not enveloped | task 2, IMP-5 |
| C15 | `neo_list … fields:["salePrice","purchasePrice","stock"]` | keys silently absent, no `warnings` | **IMP-18**, task 3 |
| C16 | `neo_schema sales-invoice/header view:"actions"` | 22 actions; raw labels, 8 `required:true`, `businessCritical:false`; `visibility`+`userRequired` present | task 4, IMP-21, IMP-11 |
| C17 | `neo_get sales-invoice/header id:"000…0"` | clean 404 envelope with `seeAlso` | task 5, IMP-5 |
| C18 | `docs(topic:"creating records")` | real recipes, source URLs, `neo_*` names only — and **more complete than `view:"create"`** | **IMP-10**, IMP-12 |
| C19 | `neo_defaults` boolean fields | real JSON `true`/`false`, not `"Y"`/`"N"` | **IMP-25** |
| C20 | `neo_delete` ×4 + `SELECT` sweep | 0 `%MCP-BENCHMARK%` rows in 4 tables | §2 |

`posted: "N"` is **not** a boolean defect — it is a list reference with three or more values, and a
string is the correct representation. It is excluded from IMP-25 on purpose.

---

## 10. Closing snapshot — every item at a glance

> **MARI 73** — M2 80 % (24.0) · M1 1.4× (21.4) · Delivery 49.0/97 (12.6) · Coverage 6/6 (15.0).
> Previous run: **49**. KR `28 → 68`: **met**.
> Quota **fully consumed at 97/97** — the next run must re-base it before registering anything new.

Statuses and points are the registry's (§3 there); this is a read-only restatement so the report can
be read standalone. **Every run report must end with this section** — see the mandate in the skill.

### Resolved — 8 items, 32 of 97 points

| # | What it is | Closed |
|---|---|---|
| **IMP-2** | Field projection + `view:"summary"` on `neo_list`/`neo_get` | 2026-08-03 |
| **IMP-3** | Business query semantics on `neo_list` — named filters + range operators | 2026-08-03 |
| **IMP-6** | Actions-only discovery view (`view:"actions"`) | 2026-08-03 |
| **IMP-8** | `neo_selectors` argument alias + self-correcting error | 2026-08-03 |
| **IMP-9** | `primaryEntity` exposed in `neo_discover` | 2026-08-03 |
| **IMP-10** | `docs` as a first-class tool + tool-name drift removed from the corpus | **2026-08-10** |
| **IMP-15** | One FK contract across every write verb — ids, legacy ids and display names all resolve | **2026-08-10** |
| **IMP-25** | Booleans emitted as real JSON `true`/`false`, not `"Y"`/`"N"` | **2026-08-10** |

### Pending — P1, 7 items

| # | Status | What it is |
|---|---|---|
| **IMP-24** | ⏳ | Write verbs accept non-ISO dates and silently store garbage (`09-08-2026` → year 0015). **The only open defect that destroys data.** |
| **IMP-23** | ⏳ | `neo_batch` is not atomic despite documenting that it is — ops before the failure stay committed. |
| **IMP-16** | ⚠️ | The write half is missing: strict date parsing. Same wound as IMP-24, seen from the emit side. |
| **IMP-12** | ⚠️ | `view:"create"` omits genuinely required fields on `sales-order` (`invoiceAddress`, `orderDate`, the parent FK `salesOrder`). |
| **IMP-11** | ⚠️ | 1,422 fields across 89 uncurated MCP-exposed entities still carry neither `visibility` nor `userRequired`; staging unverified. |
| **IMP-5** | ⚠️ | The error envelope is not uniform — a batch FK failure returns a flattened shape with no `committed` key. |
| **IMP-1** | ⚠️ | 43 of 157 field labels are still raw AD column names; part of the cause is missing `AD_Field` records, not missing labels. |

### Pending — P2, 10 items

| # | Status | What it is |
|---|---|---|
| **IMP-18** | ⏳ | `neo_list` drops unknown names in a `fields` projection in silence. **Cheapest item on the board** — sole blocker on frozen task 3, so closing it alone takes M2 from 80 % to 100 %, and the fix pattern already exists on `neo_schema`. |
| **IMP-21** | ⏳ | Actions catalog uncurated: raw column labels, 8 buttons flagged `required`, `businessCritical:false` on `documentAction` and `posted`. The reason M4 did not move. |
| **IMP-22** | ⏳ | The write-path FK resolver ignores **context-dependent** selectors, so it rejects a display name `neo_selectors` itself returns. |
| **IMP-17** | ⏳ | Callout and routing errors arrive raw, outside the IMP-5 envelope. |
| **IMP-19** | ⏳ | The report-generator contract is untyped — `parameters` is a free-form object, so the first call always fails. |
| **IMP-20** | ⏳ | `neo_create`/`neo_update` return ~80 fields with no way to project. |
| **IMP-13** | ⏳ | `businessCritical` and `namedFilters` authored on 3 and 2 of 246 entities; validator rule F11 missing. |
| **IMP-14** | ⚠️ | The remaining half is committed but **unpushed with no PR**, and Context7 serves from `main` — no live agent sees it. |
| **IMP-4** | ⚠️ | Both original clauses closed; held at half credit for what became IMP-22. |
| **IMP-7** | ⚠️ | Half B open: 7 compliance keys survive `view:"minimal"`, and separating them needs a module-ownership criterion — a design decision, not a code fix. |

### Owed by the user, not by a run

* Run the module's unit suite — it has **never** run against `b64af873`, `845e9363`, `f0e488de` or
  `a4963b6b`, including `f0e488de`'s regression test. This is why IMP-15's ✅ carries a caveat.
* Push all three repos (`schema_forge` and `etendo-go-docs` both need `-u` on `feature/ETP-4793`).
* Decide on the two items in §6 and §7: amending the frozen suite, and re-basing the quota.
* The data-fix for the 14 corrupt date rows is deliberately **not** run — test environment.
