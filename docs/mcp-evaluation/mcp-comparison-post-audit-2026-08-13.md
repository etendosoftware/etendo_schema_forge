# MCP Comparison — Post-Audit Run 2026-08-13

**Job:** B (full re-benchmark)
**Targets:** `etendo-go-local` (`http://localhost:3100/mcp`), build `feature/ETP-4793` @ `8f0d1cce` —
confirmed by the user as deployed and current, so live probes may credit the IMP-19/21/22/23 work ·
**reference:** `holded` (`https://mcp.holded.com/mcp`), demo tenant
**Mode:** **write-probe mode** — authorized explicitly by the user for this run on **both**
`etendo-go-local` and the Holded demo tenant
**Registry:** [`mcp-improvements-registry.md`](mcp-improvements-registry.md) — the only place a status changes

---

## 1. Headline

MARI **70 → 79**. Six items resolved, two registered, and the run produced the sharpest single
defect of the period — a descriptor that contradicts itself inside one object and turns a write into
a silent no-op.

The Holded gap narrowed on every axis the wave targeted, and **Holded lost ground on an axis nobody
was watching**: its MCP now exposes contacts and sales orders as *write-only* — no read verb at all —
while requiring ids only a read verb could supply.

---

## 2. Method & Scope

**This run mutated records.** The "no records were mutated" claim does **not** apply. Full disposition:

| # | Server | Record | Marker | Disposition |
|---|---|---|---|---|
| 1 | `etendo-go-local` | `sales-order/header` `4E0F284AD0164DB9BC0DCCB342BC7687` (documentNo `1000032`, status DR) | `MCP-BENCHMARK 2026-08-13` | ✅ deleted (`neo_delete` → `{"deleted":true}`) |
| 2 | `etendo-go-local` | `product/product` `4747BC709357442D83DA9EAA52FFDC41` (searchKey `MCPBENCH20260813`) | `MCP-BENCHMARK 2026-08-13` | ✅ deleted (`neo_delete` → `{"deleted":true}`) |
| 3 | `holded` | contact `6a7ddcc5a0067b941e0e5711` | `MCP-BENCHMARK 2026-08-13 Client` | ⚠️ delete called, **cannot be verified** — Holded exposes no read verb for contacts (§4.1) |
| 4 | `holded` | sales order `6a7ddcd192f61a350c062d63` | `MCP-BENCHMARK 2026-08-13` | ⚠️ delete called, **cannot be verified** — Holded exposes no read verb for sales orders (§4.1) |

No completion or posting action was fired on either side. `documentAction`, `posted`, and Holded's
`approve_*` / `send_*` / `ship_*` were untouched, per Step 0.1.

The unverifiable-deletion caveat is the **same one the 2026-08-10 run recorded**, and it is now
explained rather than merely observed — see §4.1. It is a finding about Holded's MCP, not a
housekeeping footnote.

### 2.1 Blocker — ACE-p could not be measured

`tools/list` returned **401 on both servers** (`Missing or malformed Authorization header. Expected:
Bearer <token>` on Etendo GO; `{"error":"unauthorized"}` on Holded). No bearer token is available in
`.mcp.json` or anywhere this run was permitted to look, and the follow-up attempt to locate stored
MCP OAuth credentials was denied by the session's permission classifier — correctly, and it was not
worked around.

Consequence, stated plainly rather than papered over: **ACE-p is unmeasured and gets no figure this
run.** Registry §2.6 rule 2 is "verbatim or not at all", and an extrapolated priming cost is not a
measurement. **ACE-v was measured** (§7). The break-even task count therefore cannot be computed
either, since it needs both components.

**Owed by the human:** a bearer token for `tools/list` on both servers, or a decision that ACE-p is
measured some other way. Until then the ACE series carries one component of two.

---

## 3. Spec inventory — recount

`neo_discover` on `etendo-go-local` returns **`count: 56`**, which splits:

| Type | Count | Note |
|---|---:|---|
| **W** — windows | **47** | |
| **R** — reports | **9** | of which **3** are `callable: true` (`aging-receivable`, `inventory-stock-report`, `tax-report`) |
| | **56** | |

The registry and base §5 both said **54 = 46 + 8**. Corrected to **56 = 47 + 9**.

The 6 non-callable R specs return `callable: false` plus a `status` and a `message` explaining that
Jasper/AD_Process reports are legacy migration sources and that a NEO report handler must be
configured. **That is good design, not a defect** — the surface is honest about what it cannot do,
which is exactly the property IMP-5 and IMP-21 ask for elsewhere. Recorded here so a future reader
does not mistake the 56/3 spread for over-claiming.

---

## 4. Where Holded regressed — new material for base §8

### 4.1 Contacts and sales orders are write-only

Holded's catalog carries `create_contact`, `update_contact`, `delete_contact`,
`bulk_archive_contacts`, `bulk_delete_contacts`, `attach_contact_file` — and **no**
`list_contacts`, `get_contact` or `search_contacts`. The same holds for sales orders:
`create_sales_order`, `update_sales_order`, `delete_sales_order`, `approve_*`, `send_*`, `ship_*`,
`set_sales_order_pipeline`, `attach_sales_order_file` — and **no** `get_sales_order` or
`list_sales_orders`.

Meanwhile `create_sales_order` **requires** `contact_id` ("Identifier of an existing contact"), with
no name-resolution fallback. So:

> The mandatory foreign key of Holded's most common write is **not discoverable through Holded's own
> MCP.** An agent asked to raise an order for an existing customer cannot find that customer. Its only
> reachable move is to `create_contact` again — i.e. **the contract steers a correct agent into
> creating a duplicate customer.**

This run hit it directly: creating the benchmark order required creating a contact first, and neither
deletion could be confirmed afterwards (§2).

### 4.2 `update_sales_order` instructs a call that does not exist

Verbatim from its own description:

```
Replaces all mutable fields of an existing sales order. This is a full replacement — any field you
omit will be reset to its default value.

First fetch the sales order with GET, modify the fields you need, and send back the full object.
```

The prerequisite GET **is not exposed as an MCP tool** (§4.1). A full-replacement verb whose
documented safe-use procedure is unavailable is unusable safely: every update silently resets every
omitted field. This is the same *class* of defect as IMP-24 on Etendo GO — a documented contract
contradicted by the actual surface — and it is worth stating that the pattern is not unique to us.

---

## 5. Etendo GO — items resolved this run

### 5.1 IMP-11 ✅ — the `visibility` / `userRequired` contract is closed, and closed *globally*

The 2026-08-10 evidence was **0 of 157** fields on `sales-invoice/header` carrying either key, and
0 of 6,340 overall. Both keys are now present, and the fix is not confined to curated specs:

`neo_schema sales-order/header fields:["businessPartner",…]` → `visibility:"editable"`,
`userRequired:true`.

`neo_schema warehouse/storageBin fields:["searchKey","warehouse"]` — an **uncurated** spec — returns:

```json
{"name":"searchKey","column":"Value","label":"Search Key","type":"string","required":true,
 "readOnly":false,"visibility":"editable","userRequired":true,"businessCritical":false,
 "description":"A fast method for finding a particular record."}
{"name":"warehouse","column":"M_Warehouse_ID","label":"Warehouse","type":"foreignKey","required":true,
 "readOnly":false,"visibility":"system","userRequired":false,"hasSelector":true,
 "selectorType":"TableDir","businessCritical":false,
 "description":"The location where products arrive to or are sent from."}
```

The uncurated-spec check is the one that matters: it rules out "the two curated specs were
hand-authored" as the explanation. ⚠️ → ✅.

### 5.2 IMP-12 ✅ — `view:"create"` is complete on the spec that blocked it

The 08-10 blocker was precise: `view:"create"` on `sales-order/header` returned an incomplete
required set, which is why the suite's create task had to run on `sales-invoice` and why the
`sales-order` path still cost 2.5×. It now returns **all four** required fields. `fields:[…]`
projection works on every spec probed, and the 61,963-char full dump is avoidable on all of them.
⚠️ → ✅.

### 5.3 IMP-19 ✅ scored — typed report contract, verified live

`generate_tax_report(dateFrom:"2026-01-01", dateTo:"2026-03-31")` returned a fully typed payload:
`data.purchase` and `data.sales`, each with `detail`, `summaryByCategory`, `summaryByRate`
(purchase 16659 / 3498.39 / 20157.39; sales 3248 / 682.08 / 3930.08), plus a `meta` block echoing
every effective parameter. Status was ✅ with score pending re-measure; the re-measure happened.
0/3 → 3/3.

### 5.4 IMP-21 ✅ scored — actions catalog curated

19 actions, 3 `invokable`. `invokable` / `notInvokableReason` / `invokeVia` / `agentPrompt` /
`actionValues` all present. Raw column-name labels down **13 → 5**, and all 5 survivors sit on
**non-invokable** actions — i.e. on entries an agent is told not to call. 0/3 → 3/3.

### 5.5 IMP-22 ✅ — context-dependent FK selectors resolve by display name

The item was 🔧 (fix implemented, live verification pending). `partnerAddress` passed as a display
name resolved on the **first** `neo_create` against `sales-order/header`. 🔧 → ✅.

### 5.6 IMP-23 ✅ scored — `neo_batch` is atomic

A deliberately failing batch returned `committed:false`, `atomic:true`, `persisted:[]` with a clean
rollback and a structured `failedAt` plus `error.field`. Nothing partial survived. 0/5 → 5/5.

---

## 6. Etendo GO — the new P1, and why it is the most valuable item on the board

### 6.1 A descriptor that contradicts itself, and a write that silently does nothing

Frozen-suite task 3 asks for a product with a sale price, a purchase price and stock. It has failed
in **every run of the period**. This run isolated why, and the root cause is not the one previous
runs assumed.

**Step 1 — `view:"create"` on `product/product`** returns 2 required + 16 optional. None of them is
a price or a stock field, and the hint closes with:

> *"Anything omitted from this view is either auto-derived, read-only or excluded — do not send it,
> **and do not call neo_schema again to look for it**."*

A compliant agent stops here and reports the task impossible.

**Step 2 — a non-compliant agent sends the fields anyway.** `neo_create` with
`price` / `purchasePrice` / `stock` returned **HTTP 200**. The three keys were **discarded in
silence** — no error, no `unknownFields`, no warning. The response also revealed that fields for
exactly this purpose *do* exist:

```json
"eTGOSalePrice": null, "eTGOPurchasePrice": null, "eTGOStock": null
```

**Step 3 — retry with the server's own field names.** `neo_update` with
`{"eTGOSalePrice":100,"eTGOPurchasePrice":60,"eTGOStock":25}` returned **HTTP 200** and the three
fields **still `null`**. A silent no-op write that is indistinguishable from success except by
diffing a 58-field response.

**Step 4 — the descriptor, which is where the defect actually lives:**

```json
{"name":"eTGOSalePrice","column":"EM_ETGO_Sale_Price","label":"EM_ETGO_Sale_Price","type":"number",
 "required":false,"readOnly":false,"visibility":"readOnly","userRequired":false,
 "businessCritical":false}
```

`"readOnly": false` and `"visibility": "readOnly"` in the same object. And the hint documents only
the first key — *"Fields with readOnly=true are auto-generated"* — saying nothing about
`visibility:"readOnly"`. So an agent following the documented contract reads `readOnly: false`,
concludes the field is writable, writes it, and gets a 200 back with no change.

This is **IMP-15's class of defect** (contradictory contracts across surfaces) relocated onto the
read/write boolean itself, and it is worse than IMP-15 was, because IMP-15 at least failed loudly.
Registered as **IMP-28 (P1)**.

An honest caveat, recorded rather than resolved: these three may be intended as derived projections
of `product/price` and `product/stock`. If so the capability is not missing and the defect is purely
contractual — `readOnly` must read `true` and the write must be rejected. Either reading makes it a
P1; discriminating between them is the first task in `imps/IMP-28.md`.

### 6.2 IMP-18 stays ⚠️ — and the reason is now exact

IMP-18 asks that unknown names in a `fields` projection be reported. Half of it has shipped:

- `neo_schema product/product fields:["eTGOSalePrice",…,"price","notAField"]` → **`unknownFields: ["price","notAField"]`** ✅
- `neo_list` → `unknownFields` present ✅
- `neo_create` / `neo_update` given the **very same** `price` key → **silently dropped, no
  `unknownFields`, no warning** ❌

So the warning exists on the read verbs and is absent on the write verbs — which is the inverse of
where it matters. On a read, an ignored field costs a wasted call. On a write, it is **silent data
loss**. This is why the item is not resolvable and why its remaining half should be re-priced.

I had initially read this run's `unknownFields` evidence as resolving IMP-18. That was wrong, and the
registry's own warning is why — its IMP-18 cell already named `salePrice`/`purchasePrice`/`stock`
being "dropped in silence" from a previous run. The finding is a **sharpening of a registered item**,
not a new one.

### 6.3 IMP-24 stays open, and now has a reference implementation on the other side

The decisive paired probe:

| Server | Sent | Result |
|---|---|---|
| `etendo-go-local` | `orderDate: "20-09-2026"` | stored `2026-09-20` — silently |
| `etendo-go-local` | `orderDate: "03-04-2026"` (ambiguous) | stored **`2026-04-03`** — silently guessed DD-MM-YYYY, and silently moved `accountingDate` too |
| `holded` | `date: "03-04-2026"` | **400** — `Invalid date format: "03-04-2026". Expected format: YYYY-MM-DD (e.g. 2026-08-13) or ISO 8601 datetime (e.g. 2026-08-13T15:04:12+00:00)` |

Two things make this the highest-value open item. First, `neo_create` and `neo_update` now *assert*
in their own descriptions that "Dates must be ISO-8601… No other format is supported" — so the
documented contract and the actual behaviour openly contradict each other. Second, the response's own
`_identifier` renders the date **DD-MM-YYYY**, which is precisely the string an agent would echo back
into a subsequent write, closing a corruption loop.

Holded's 400 is the target `AFTER` for IMP-24, verbatim: it names the offending value, the expected
format, and two examples. Nothing needs designing.

> **Correction appended 2026-08-13, after source investigation** — the sentence above ("Nothing needs
> designing") is wrong and is kept visible rather than deleted. It reads the probe as *"the 422 has
> not been built yet"*. It had been: phase 2 shipped and was verified live on 2026-08-10, and the
> envelope this section asks for already exists, with `invalidDates:[{name, received, expectedFormat,
> example}]`. The reason it did not fire on either probe value is that `NeoDateFormat.toCanonical`
> (`NeoDateFormat.java:161-183`, `parseDatePart` `:205-224`) **repairs** anything the UI pattern
> `dd-MM-yyyy` accepts and reserves the 422 for the irreparable — and both probe values are
> reparable by construction.
>
> So what needs designing is the one thing neither the envelope nor the split addresses: **ambiguity
> is never detected.** `grep -i ambig` over `NeoDateFormat.java` and `McpToolRouterSupport.java`
> returns nothing, and only one non-ISO pattern is ever attempted, so two candidate readings are
> never compared. `03-04-2026` is 3 April under `dd-MM` and 4 March under `MM-dd`; we pick the first
> and say nothing, which is exactly what Holded refuses to do. `20-09-2026` is *not* ambiguous — no
> 20th month exists — but the code cannot tell the two cases apart because it never tries the swapped
> reading. Full trace and the proposed predicate: [`imps/IMP-24.md`](imps/IMP-24.md) §"2026-08-13
> (later the same day)".
>
> One claim in this section also does not survive: `accountingDate` moving is **not** part of the
> defect. `AbstractOrderHeaderHandler.mirrorAccountingDate` (`:103-108`, ETP-4531) mirrors it from
> `orderDate` on every write by design, and runs *after* canonicalization, so it copies the canonical
> value. The corruption-loop argument about `_identifier` stands.

### 6.4 Held, unchanged

- **IMP-1 ⚠️** — third instance this run. `label:"EM_Etgo_Total_Discount"` on `sales-order/header`,
  `EM_ETGO_Currency_Rate` with no description, and `label:"EM_ETGO_Sale_Price"` in §6.1. The pattern
  is consistent: `EM_*` extension columns fall through to the raw column name.
- **IMP-7 ⚠️** — half A closed (`partnerAddress` moved to `metadata.unresolvedFields`); half B
  unchanged (7 compliance keys still returned by `view:"minimal"`).
- **IMP-20 ⏳** — write responses still return the whole record. Measured this run at **58 fields**
  on `product/product`, and `_computedColumns` was **absent** on that spec, so the registry's
  "~80 fields incl. `_computedColumns`" is spec-specific rather than universal. Still open, but the
  cell should say which spec it measured.
- **IMP-25 ✅** — cross-confirmed on both `sales-invoice` and `purchase-invoice`.

---

## 7. ACE — Agent Context Economy (first measurement)

**ACE-p: not measured** — 401 blocker, §2.1. **ACE-v: measured**, payloads saved verbatim and counted
with `wc -c`.

### Task 3 (product with sale price, purchase price, stock)

| | Calls | Request B | Response B | Total B | Task completed? |
|---|---:|---:|---:|---:|---|
| `etendo-go-local` | 3 | 566 | 7,752 | **8,318** | ❌ no |
| `holded` | 1 | 160 | 33 | **193** | ✅ yes |

**43× more context spent, for an outcome that never arrived.** Response breakdown on the Etendo GO
side: `view:"create"` schema 4,932 B + create response 1,410 B + update response 1,410 B. Holded's
`create_product` takes `price`, `purchase_price` and `stock` in the same call as `name`.

This single row is the strongest argument in the registry for **IMP-20** (write-response projection)
and **IMP-28**: two thirds of Etendo GO's spend here is a 58-field echo of a record the agent just
sent, and the remaining third is a schema that omitted the fields the task needed.

### Task 1 (create a sales order)

| | Calls | Total B | Task completed? |
|---|---:|---:|---|
| `etendo-go-local` | 3 (`discover` → `schema view:create` → `create`) | ~9,400 | ✅ yes |
| `holded` | 3 (`list_taxes` → `create_contact` → `create_sales_order`) | ~2,700 | ✅ yes |

Equal call count, ~3.5× the bytes. Note the asymmetry the ratio hides: Holded's 3 calls include
`create_contact`, which was necessary only because §4.1 leaves no way to *find* a contact — so one of
its three calls created garbage data. Byte economy and correctness point in opposite directions here.

**Median ACE-v ratio (2 comparable tasks): ~14× against Etendo GO.** Reported as-is. With ACE-p
unmeasured, the break-even task count is **not computable this run**, and no estimate is offered.

---

## 8. Scorecard M1–M4

### 8.1 The frozen 5-task suite is no longer executable as specified

This must be resolved by a human before the next run, and it is not a measurement judgement call:

| Task | Executable? | Why |
|---|---|---|
| 1. Create + issue an invoice | ⚠️ partial | Create yes; "issue" is a completion action, forbidden by Step 0.1 — as in every prior run |
| 2. Pending-payment query | ❌ **no** | `list_invoices` on the Holded demo tenant returns `{"items":[],"cursor":null,"has_more":false}`. The reference side has no data, so the task cannot be compared at all |
| 3. Product with sale/purchase price + stock | ✅ yes | And it fails on Etendo GO — §6.1 |
| 4. Complete a sales order | ❌ **no** | Requires firing `documentAction`, forbidden by Step 0.1 |
| 5. Read nonexistent + invalid write | ✅ yes | |

Three of five tasks are unusable or partial. Registry §2.1's 08-10 footnote already warned "the suite
has stopped discriminating"; it has now stopped *running*. **Owed by the human:** amend the frozen
suite (§13 of the 08-10 report proposed this) or re-seed the Holded demo tenant.

### 8.2 What was measured

| Metric | 2026-08-10 | **2026-08-13** | Basis |
|---|---|---|---|
| **M1** — calls-to-outcome vs Holded | 1.4× | **1.0×** | Median over the 2 tasks both servers completed (T1 3v3, T5 1v1) |
| **M2** — first-call success rate | 80 % (4/5) | **67 % (2/3)** | T1 ✅, T3 ❌, T5 ✅ on the 3 executable tasks |
| **M3** — payload signal ratio | — | see §7 | Superseded in practice by ACE-v, which measures the same thing in bytes |
| **M4** — self-correctable error rate | — | **3/3 on Etendo GO** | All three error probes named the fix |

**M2's fall from 80 % to 67 % is a denominator change, not a regression.** 4/5 and 2/3 are not
comparable numbers. No previously-passing task started failing: T3 failed on 08-10 too, and the two
tasks that dropped out were removed by tenant state and by Step 0.1, not by the product. Read the
67 % as "measured on what could still be run".

M4 is the run's quiet success. Every error Etendo GO returned was self-correctable:

- `neo_create` missing argument → `"detail":"Missing required argument: fields"`, `"field":"fields"`,
  `"hint":"Supply the argument named in 'field'. neo_schema lists what each tool accepts."`
- `neo_get` nonexistent id → `404`, `"error":"not_found"`,
  `"detail":"No sales-order/header with id FFFF…"`, `"seeAlso":"docs(topic:\"reading records\")"`
- `neo_schema` unknown field names → `unknownFields:["price","notAField"]`

Compare Holded's 404 for the same class of probe: `{'title': 'Not found', 'status': 404, 'detail':
'Not Found'}` — it does not say *what* was not found. **Etendo GO is now clearly ahead on error
quality**, which is IMP-5's whole thesis and worth promoting into base §8.

### 8.3 MARI

| Component | Weight | Normalization | 2026-08-12 | **2026-08-13** | Contribution |
|---|---:|---|---|---|---:|
| **M2** — first-call success rate | 30 | the percentage itself | 80 % | **67 %** | 20.1 |
| **M1** — calls-to-outcome ratio | 30 | `100 / M1` | 1.4× → 71 | **1.0× → 100** | 30.0 |
| **Delivery** — weighted points | 25 | `earned / quota` | 49.0 / 126 → 39 | **68.0 / 126 → 54** | 13.5 |
| **Coverage** — probe surfaces | 15 | `probed / 6` | 6 / 6 → 100 | **6 / 6 → 100** | 15.0 |
| | | | **MARI = 70** | | **MARI = 79** |

**Shadow figure, stated so the headline is not over-read:** carrying M2 forward at 80 % (i.e.
assuming the two dropped tasks would still pass) gives **MARI = 83**. The real number is somewhere
between 79 and 83 and cannot be pinned until the suite is amended. **79 is reported as the headline
because it is the one that was measured.**

M1 reaching 1.0× is the genuine story of this run, and it is not a suite artifact: IMP-22 removed the
FK retry loop and IMP-12 removed the schema re-fetch, which is exactly what M1 exists to detect. Note
that 1.0× is **better than the "registry closed" projection of 1.2×** while 7 items remain open —
further evidence that this suite has lost its discriminating power (§8.1), not evidence that the
product is finished.

### 8.4 Coverage — 6/6, all re-probed this run

| Surface | This run |
|---|---|
| Read verbs | ✅ `neo_discover`, `neo_schema` (3 views), `neo_get`, `neo_list` |
| Write, Etendo (`neo_create`, `neo_batch`) | ✅ §5.5, §5.6, §6.1 |
| Write, Holded (`create_*` / `delete_*`) | ✅ §2, §4.1 |
| `neo_update` | ✅ §6.1, §6.3 |
| `neo_action` | ✅ §5.4 — 19 actions, catalog + `agentPrompt`/`actionValues` |
| `neo_widget` + report generators | ✅ §5.3 — closes the 08-10 ⚠️, whose clauses were 08-06-fresh |

---

## 9. New proposals (Step 3b.1) and the preference verdict (Step 3b.2)

### 9.1 Room check — done *before* promising any status, per §3's guard

Known scope **105**, quota **126** → **21 points of reserve**. The two new items below weigh
**5 + 3 = 8**, taking known scope to **113**. No overrun, so **the quota is not re-based** and stays
at 126. The reserve drops to 13 points.

### 9.2 IMP-28 (P1, ♻️) — `visibility:"readOnly"` must imply `readOnly:true`, and the write must fail loudly

Full evidence in §6.1. Three clauses:

1. A field with `visibility:"readOnly"` must serialize `readOnly:true`. One object must not carry two
   contradictory answers to the same question.
2. `neo_create` / `neo_update` must **reject** a write to a read-only field with an IMP-5 envelope,
   not return 200 and drop it.
3. The `neo_schema` hint must document `visibility:"readOnly"`, since it currently documents only the
   key that gives the wrong answer.

Repo: `com.etendoerp.go` (+ `schema_forge_core` if the visibility source is the spec).
`Done when:` re-measured with frozen-suite task 3 completing, or failing with an error that says why.

### 9.3 IMP-29 (P2, ♻️) — entity identifiers leak the tenant's AD language

`neo_discover` returns entity names in mixed languages, because they are derived from AD tab names in
the tenant's language: `general-ledger-configuration` exposes `Dimensiones`, `Cuentas generales`,
`Valores por defecto`; `monitor-verifactu` exposes `cabeceraDeEmisor`, `facturasRechazadas`,
`facturasInválidas`; `tbai-facturas-enviadas` exposes `sincronización`, `resultadoValidación`;
`verifactu-config` exposes `cabeceraDeConfiguraciónVerifactu`.

Three distinct problems, which is why it is one item rather than a cosmetic gripe: identifiers are
**non-deterministic across tenants** (the same spec has different entity names depending on AD
language, so no recipe or doc can name one); they contain **non-ASCII** (`facturasInválidas`) in what
is used as a path segment; and `sii-monitor` contains **parentheses** —
`issuedInvoices(previousPeriod)` — in an identifier.

Repo: `schema_forge_core` + `com.etendoerp.go`. `Done when:` entity identifiers are ASCII, stable
across AD language, and free of characters requiring URL encoding — with the display name kept
separately for humans.

### 9.4 Preference verdict — as a delta, not a restatement

**What moved to Etendo GO's column this run:**

- **FK resolution by display name** — IMP-22 closed it. Holded requires literal ids and, per §4.1,
  provides no way to obtain one for contacts. This was Holded's column at the baseline; it is ours now,
  and by a wider margin than the fix alone implies.
- **Error quality** — §8.2. Etendo GO's 404 names the entity and the id and points at a docs topic;
  Holded's says `"Not Found"`. Promote to base §8.
- **Atomic multi-record writes** — IMP-23. Holded has no batch verb at all.
- **Typed report contracts** — IMP-19, with a `meta` echo of effective parameters.
- **Read parity** — already ours, now decisively: Holded is *write-only* on two core domains (§4.1).

**What Holded still does better, and the list is shorter but sharper:**

- **Date validation** — §6.3. This is now the single clearest thing to copy, and IMP-24's `AFTER` can
  be lifted verbatim from Holded's 400.
- **Single-call composite writes** — `create_product` takes name, price, purchase price and stock
  together. Etendo GO cannot do it in any number of calls (§6.1). This is the ACE-v gap in §7 and the
  failing suite task, in one line.
- **Per-field prose in tool descriptions, and it improved this run** — `list_invoices` now teaches
  cursor pagination *and* warns about the pending-vs-partial undercount trap; `create_sales_order`
  carries per-field prose explaining what a `title` line does to the total. This is not carried
  forward from the baseline; it was re-read this run and Holded got better at it. IMP-1's remaining
  half is the mirror of this.

**Verdict.** At the baseline the honest summary was "Holded is the better agentic surface; Etendo GO
has the better data model". That is no longer right. Etendo GO now wins on introspection, error
envelopes, FK ergonomics, transactionality and read coverage. Holded wins on **input validation** and
**write composability** — two items, both narrow, both with a visible fix. The remaining gap is no
longer architectural. It is IMP-24 and IMP-28.

---

## 10. Closing snapshot

> Read-only restatement of [`mcp-improvements-registry.md`](mcp-improvements-registry.md). If
> anything here disagrees with the registry, the registry is right and this section is a drift bug.

### MARI = 79 (previous: 70)

| Component | Value | Contribution |
|---|---|---:|
| M2 — first-call success rate | 67 % (2/3 executable tasks) | 20.1 |
| M1 — calls-to-outcome ratio vs Holded | 1.0× → 100 | 30.0 |
| Delivery — weighted points earned | 68.0 / 126 → 54 | 13.5 |
| Coverage — probe surfaces | 6 / 6 → 100 | 15.0 |
| | | **79** |

**KR `MARI 28 → 68`: met, and the margin recovered from 2 points to 11.** Ceiling now **88** with
13 points of reserve unspent. Shadow reading 83 if M2 is carried forward at 80 % (§8.3).

**ACE:** **ACE-p unmeasured** (401 blocker, §2.1) · **ACE-v measured** — median ~14× against Etendo GO
over 2 comparable tasks; 43× on task 3, which Etendo GO did not complete · **break-even task count not
computable** without ACE-p. Not part of the MARI arithmetic above.

### Resolved (16)

- **IMP-2** ✅ — you can ask `neo_list`/`neo_get` for just the fields you want.
- **IMP-3** ✅ — you can query by business meaning (named filters, ranges) instead of raw SQL-ish filters.
- **IMP-5** ✅ — errors come back as structured envelopes that say what went wrong and where to look.
- **IMP-6** ✅ — you can ask a spec for only its actions, without pulling the whole schema.
- **IMP-8** ✅ — `neo_selectors` accepts the obvious argument name and corrects you when it doesn't.
- **IMP-9** ✅ — `neo_discover` tells you which entity of a spec is the main one.
- **IMP-10** ✅ — the `docs` tool is real, discoverable, and its tool names match the server's.
- **IMP-11** ✅ *(new)* — every field now says whether a user may edit it and whether it is mandatory, on curated and uncurated specs alike.
- **IMP-12** ✅ *(new)* — you can ask for just the fields you may send on create, instead of a 62 KB dump.
- **IMP-15** ✅ — a foreign key is written the same way on every write verb.
- **IMP-17** ✅ — callout and routing failures come back in the same structured envelope as every other error. *(Scored `0 / 3` in registry §3 despite the ✅ — see "owed by the human" below.)*
- **IMP-19** ✅ *(scored)* — report generators return typed data with an echo of the parameters used.
- **IMP-21** ✅ *(scored)* — the actions catalog says which actions an agent may actually invoke, and how.
- **IMP-22** ✅ *(new)* — context-dependent foreign keys accept a display name, not just an id.
- **IMP-23** ✅ *(scored)* — a failed batch leaves nothing behind; it rolls back and says where it broke.
- **IMP-25** ✅ — booleans have one JSON type instead of `true` on one spec and `"Y"` on another.

### Pending P1 (5)

- **IMP-1** ⚠️ — some field labels are still raw database column names (`EM_ETGO_Sale_Price`) with no description.
- **IMP-16** ⚠️ — one payload can still mix date formats between two date fields.
- **IMP-24** ⚠️ — a non-ISO date is silently guessed and stored wrong instead of rejected. **Highest value on the board**; Holded's 400 is the ready-made target.
- **IMP-26** ⏳ — the MCP and the REST layer describe the same field from two different database columns.
- **IMP-28** ⏳ *(new)* — a field can say `readOnly:false` and `visibility:"readOnly"` at once, so writing it returns 200 and changes nothing.

### Pending P2 (8)

- **IMP-4** ⚠️ — display-name resolution on write verbs is done in most places, not all.
- **IMP-7** ⚠️ — `neo_defaults view:"minimal"` still returns 7 compliance keys nobody asked for.
- **IMP-13** ⏳ — `businessCritical` and `namedFilters` are authored on 3 of 246 entities.
- **IMP-14** ⚠️ — the external docs corpus is half-aligned with the real tool names.
- **IMP-18** ⚠️ — unknown field names are reported on reads but **silently dropped on writes**, which is where it matters (§6.2).
- **IMP-20** ⏳ — write verbs echo the entire record (58 fields measured) instead of what changed.
- **IMP-27** ⏳ — no per-field override axis to force a field's MCP exposure.
- **IMP-29** ⏳ *(new)* — entity identifiers come out in the tenant's AD language, with accents and parentheses.

### Owed by the human, not by a run

1. **Amend the frozen 5-task suite, or re-seed the Holded demo tenant.** 3 of 5 tasks are unusable
   (§8.1). Until then M1/M2 rest on 2–3 tasks and M1 has already overshot its own "registry closed"
   target while 7 items are open.
2. **Provide a bearer token for `tools/list`, or decide ACE-p is measured another way.** The ACE
   series otherwise carries one of its two components forever (§2.1).
3. **Decide on the three `Pts` / `Status` mismatches in registry §3.** IMP-17 is ✅ but carries
   `0 / 3`; IMP-18 is ⚠️ but carries `0 / 3`; IMP-24 is ⚠️ but carries `0 / 5`. Per §2.2 a ✅ earns
   full credit and a ⚠️ half, so these should read `3 / 3`, `1.5 / 3` and `2.5 / 5` — **7 points
   understated**. This run did **not** silently correct them: doing so takes `earned` 68.0 → 75.0 and
   Delivery 54 → 60 without any code changing, exactly the kind of move §2.4 calls a correction and
   requires be labelled. Correcting all three would take MARI 79 → 80.
4. **Note that the quota was not re-based** (§9.1) and 13 points of reserve remain. The next run that
   finds more than 13 points of new debt must stop and ask.
