# MCP Post-Audit Run — 2026-08-06

**Jira:** ETP-4793 (Epic ETP-3504) · **Labels:** `plataforma`, `validacion-agentica`
**Target:** `etendo-go-local` (`http://localhost:3100/mcp`), build `c597c7c2` · **Reference:** Holded
(`https://mcp.holded.com/mcp`), **demo** tenant
**Mode:** read probes + **human-authorised write probes on both sides**
**Registry:** [`mcp-improvements-registry.md`](mcp-improvements-registry.md) — the only place a status
may change. This document is evidence and delta.

---

## 1. What this run was for

The 2026-08-05 baseline scored **MARI 28** with two caveats stamped on it: Coverage stood at 2 of 6
probe surfaces, and M2 — 30 % of the index — had been measured on **two write calls**, the single
worst path in the product. Both caveats said the number was probably understated and that only a
measured run could settle it.

This run settles them. It probes the four untouched surfaces, re-measures M1 and M2 across the full
frozen 5-task suite, and recomputes MARI.

**It ships nothing.** No Java, no config, no generator changed. Every point of movement below is
measurement quality, and the registry's `earned` column is deliberately unmoved at 29.5.

## 2. Method & scope

**This run mutated data.** The 2026-08-05 claim that no records were mutated does **not** carry
forward. Records created and their disposition:

| Side | Record | Id | Tag | Disposition |
|---|---|---|---|---|
| `etendo-go-local` | Sales invoice header, `DR` (draft) | `F4136A8A5B5D473191BA7AC876E1D50A` (documentNo `10000020`) | `MCP-BENCHMARK 2026-08-06` in `description` | **Deleted** (B21, `{"deleted":true}`) |
| Holded demo | Contact | `6a748d8e30a6b6933805ee43` | `MCP-BENCHMARK 2026-08-06` in `name` | **Deleted** (B22) |
| Holded demo | Sales order | `6a748d9cedabb66f810e93d2` | `MCP-BENCHMARK 2026-08-06` in `description` | **Deleted** (B22) |

**Nothing was left undeleted.** No pre-existing record was modified — every write acted on a record
this run created. **No completion or posting action was fired** on either side: no `documentAction`,
no `posted`, no Holded `approve_*` / `send_*` / `ship_*` / `receive_*`. The `neo_action` surface was
scored on read-only inspection of its catalog and contract, as Step 0 requires.

**Not probed:** `neo_batch` (not authorised for this run). IMP-4's and IMP-15's `neo_batch` clauses
therefore still rest on 2026-08-05 evidence and were **not** re-verified — they are carried forward,
not re-confirmed.

Environment caveat: Holded's tenant contains only `s_tax_20 / s_tax_10 / s_tax_0`; the tax keys in
its own tool-schema examples do not exist there (see §5).

## 3. Evidence table (B-rows)

All Etendo rows are `etendo-go-local` @ `c597c7c2`; all Holded rows are the demo tenant.

| # | Call | Result |
|---|---|---|
| B1 | `neo_widget(kpis)` | ✅ 4 KPI objects, `{key,label,value,format,trend,icon}`. Compact, no projection needed |
| B2 | `neo_widget(pending-amounts)` | ✅ `{toCollect:{count:2,amount:5267.8}, toPay:{count:1,amount:327.5}}` |
| B3 | `generate_tax_report({}, format:"csv")` | ❌ `{"error":{"message":"dateFrom and dateTo are required","status":400}}` — flat envelope, and the tool schema declares `parameters` as an untyped object, so the first call cannot be right |
| B4 | `generate_tax_report({dateFrom,dateTo}, format:"csv")` | ✅ Rich nested JSON (`purchase`/`sales` × `summaryByCategory`/`summaryByRate`) with a `meta` block echoing every applied default. **`format:"csv"` ignored — JSON returned** |
| B5 | `generate_inventory_stock_report({}, format:"csv")` | ✅ 8 rows, warehouse × product × `qtyOnHand`/`unitCost`/`totalValuation`. Needs no parameters — undiscoverable from the schema. `format` ignored again |
| B6 | `neo_schema(sales-invoice, header, view:"required")` | ❌ **Call failed against the client token limit.** 61,963 chars / 157 fields. `view:"required"` is out of the declared enum (`["actions"]`); the response was the full dump. **0 of 157 fields carry `visibility`; 0 carry `userRequired`** — yet the response `hint` reads *"Fields with `userRequired=true`: MUST be provided in neo_create. Fields with `visibility=system` … omit them"*, and the tool description promises `visibility (editable/readOnly/system/discarded)`. The only usable signal is `required`, the raw AD `IsMandatory`: **52 fields**, including `id`, `documentNo` (both `readOnly`), **10 buttons**, 6 computed totals, and ~20 fields from unrelated localisation modules (`aeatsii*`, `etvfac*`, `tbai*`, `etblkp*`). Positives: 103/157 have `description`; labels curated; `businessCritical:true` on `businessPartner`; `hasSelector`/`selectorType` present; `namedFilters` present with prose |
| B7 | `neo_schema(sales-order, header, view:"actions")` | ✅ 19 actions. `documentAction` carries an outstanding `agentPrompt` (state machine, preconditions, which `actionValues` are out of flow) plus `actionValues` and `actionParameter:"docAction"`. **But** 13 of 19 `label`s are raw column names (`RM_ReceiveMaterials`, `EM_Psd2_Generate Bank Payment`, `RM_PickFromShipment`); 10 buttons carry `required:true`; **`businessCritical:false` on `documentAction` and `posted`** — the two that book accounting entries |
| B8 | `neo_list(product, product, fields:["name","salePrice","purchasePrice","stock"])` | ⚠️ Returned `id` + `name` only. The three unknown names were **dropped in silence** — no error, no `warnings`. Frozen task 3 is unanswerable on this spec and the agent has no way to learn that |
| B9 | `docs(topic:"creating records")` | ⚠️ Resolves to real, detailed recipes — but **every snippet uses `etendo_neo_*`** (`etendo_neo_create`, `_list`, `_batch`, `_action`, `_selectors`, `_defaults`); the real names are `neo_*`. Argument lists also omit the shipped `fields` and `view` params. Dates in the corpus are correctly ISO throughout |
| B10 | `neo_defaults(sales-invoice, header, view:"grouped")` | ✅ `confirm` / `systemManaged` / `metadata` with `$_identifier` sidecars. **But** `metadata.unresolvedFields` is `[]` while required `partnerAddress` is `""`, and `invoiceDate` is `"06-08-2026"` while `accountingDate` is `"2026-08-06"` — two date formats in one payload |
| B11 | `neo_create(sales-invoice, header)` — **first attempt**, values taken verbatim from B10 | ❌ `{"status":422,"error":"not_found","detail":"No match for 'currency'='102'. Use neo_selectors to search, or pass the exact record id instead.","field":"currency"}`. **`102` came from `neo_defaults` and *is* the exact record id** (`C_Currency_ID`, legacy numeric) — the hint's advice is impossible to follow |
| B12 | retry with `currency:"EUR"` | ❌ `validation_error`, `missingFields:[partnerAddress]` + `hint` + `seeAlso`. Excellent error; contradicts B10's `unresolvedFields:[]` |
| B13 | retry with `partnerAddress` resolved | ❌ **`La fecha de operación no puede ser posterior a la fecha de la factura.`** — a raw, untranslated Spanish callout string, no JSON envelope, no `status`, no `field`. Root cause: B10's `"06-08-2026"` was silently misparsed |
| B14 | retry with `invoiceDate:"2026-08-06"` | ✅ Created `F4136A8A…`, `documentNo 10000020`, `documentStatus:"DR"`. Response is ~80 fields incl. `_computedColumns`, `recordTime`. **It echoes `currency:"102"`** |
| B15 | `neo_update` passing back B14's own `currency:"102"` | ❌ Same `not_found` as B11. **The output of a write verb is not valid input to a write verb** — the round-trip is broken |
| B16 | retry with `currency:"EUR"` | ✅ Updated. FK-by-name confirmed on `neo_update` (previously credited only on `neo_create`) |
| B17 | `neo_get(sales-invoice, header, id:"DOES-NOT-EXIST-…")` | ✅ `{"status":404,"error":"not_found","detail":"No sales-invoice/header with id …","seeAlso":"docs(topic:\"reading records\")"}` |
| B18 | `neo_list(sales-invoice, header, filters:{status:"pending"})` | ✅ 3 rows. IMP-3 works as specified |
| B19 | `neo_list(…, filters:{status:"totally-not-a-filter"})` | ✅ `Unknown status '…' for entity 'header'. Available: completed, pending, partial` — self-correcting, exactly as IMP-3 specified |
| B20 | `neo_list(product, header, …)` | ⚠️ `Entity not found: header` — raw string, no envelope, **no list of valid entities** |
| B21 | `neo_delete(sales-invoice, header, F4136A8A…)` | ✅ `{"deleted":true,"id":"F4136A8A…"}` |
| B22 | Holded `create_contact` → `create_sales_order` → `delete_sales_order` → `delete_contact` | ✅ **Both creates succeeded on the first call**, from the tool schema alone. Both deletes returned **empty bodies** — an agent cannot distinguish success from a swallowed error |

### 3.1 A note on three findings I could not attribute

`view:"required"` (B6), `pageSize` (B8) and a `namedFilter` argument were all ignored, which initially
looked like one finding: *the server silently drops unrecognised arguments*. It does not hold up.
`pageSize` and `namedFilter` are **not declared parameters** (the real ones are `limit` and
`filters.status`), and `view` has a declared enum — so in all three cases the MCP client may have
stripped the argument before it reached the servlet. **Not attributable to Etendo GO, and not
registered.** Only B8's `fields` case survives, because `fields` is declared, was transmitted, and the
unknown names were dropped server-side (→ IMP-18).

## 4. Delta against the registry

* **Added IMP-16** — one date format across `neo_defaults` and the write verbs (P1, ⚙️) — B10, B13.
* **Added IMP-17** — wrap callout + routing errors in the IMP-5 envelope (P2, ♻️) — B13, B20.
* **Added IMP-18** — report unknown names in a `fields` projection (P2, ⚙️ additive) — B8.
* **Added IMP-19** — type the report-generator contract (P2, ⚙️) — B3, B4, B5.
* **Added IMP-20** — projection on write-verb responses (P2, ⚙️ additive) — B14, B16.
* **Added IMP-21** — curate the actions catalog (P2, ♻️) — B7.

**No status changed.** IMP-11, IMP-12, IMP-14 and IMP-15 were re-confirmed with live evidence;
IMP-7's ⚠️ was re-confirmed (the 7 compliance keys still leak from `view:"minimal"`, and
`partnerAddress:""` is still reported as resolved). IMP-2, IMP-3, IMP-5, IMP-6, IMP-8 and IMP-10 all
behaved exactly as the registry describes.

**Four findings were not new.** On first reading, the 62 kB schema, the missing
`userRequired`/`visibility`, the `etendo_neo_*` corpus drift and the broken FK round-trip each looked
like a discovery. All four are already registered — as IMP-12 (B6 reproduced the identical 61,963-char
figure), IMP-11, IMP-14 and IMP-4/IMP-15 respectively. They are recorded as re-confirmations so a
third run does not spend its budget rediscovering them.

## 5. Where Holded is better, and where it is not

**Better — the write path, decisively.** Creating a document took Holded **1 call, first attempt**,
twice. It took Etendo **9 calls and 4 corrections**. Holded's tool schemas carry per-field prose,
documented enums, format examples, and even a note explaining that api2 stores the line values you
send rather than reading them back from the product record. Nothing in Etendo's write path
communicates at that level.

**Not better — three findings for the base report's §8.**

1. **It accepted an invalid tax key in silence.** `create_sales_order` took `taxes:["s_iva_21"]` — the
   key from its *own* schema example — and returned `200`. That key does not exist in this tenant
   (`list_taxes` returns only `s_tax_20/10/0`). Etendo rejects an unresolvable FK with a structured
   422 naming the field.
2. **A created sales order cannot be read back.** The catalog has `create_`, `update_`, `delete_`,
   `approve_`, `ship_`, `send_`, `set_..._pipeline` and `attach_..._file` for sales orders — and no
   `get_sales_order` or `list_sales_orders`. Combined with (1), the run created a document with a
   probably-wrong total and had no way to verify it. Etendo's full read/write parity is a real
   strength.
3. **Deletes return empty bodies.** Etendo returns `{"deleted":true,"id":…}`.

**The two failure modes, stated plainly:** Etendo GO fails by **dropping input in silence** (B8) or by
rejecting its own output (B11, B15); Holded fails by **accepting bad input in silence** (1) and then
refusing to show you the result (2). Etendo's is the safer mode — a loud rejection costs calls, a
silent acceptance costs correctness — but B8 shows Etendo is not immune to the dangerous one.

## 6. MARI — the headline number

| Component | Weight | 2026-08-05 | 2026-08-06 | Contribution |
|---|---:|---|---|---:|
| **M2** — first-call success | 30 | 0 % | **40 %** | 12.0 |
| **M1** — calls-to-outcome | 30 | 2.4× | **2.1×** | 14.3 |
| **Delivery** — `earned / quota` | 25 | 29.5 / 73 → 40 | **29.5 / 97 → 30** | 7.6 |
| **Coverage** — probe surfaces | 15 | 2 / 6 | **6 / 6** | 15.0 |
| | | **28** | | **MARI = 49** |

**M2 = 2 of 5** on the frozen suite. Task 1 (create an invoice) fails on the first call — B11. Task 3
(product with sale price, purchase price, stock) fails — B8, and is in fact unanswerable. Task 2
(pending invoices) scores **0 despite B18 succeeding**, because the only documented way to learn the
valid filter names is `neo_schema`, and that call cannot complete (B6) — a chain failure counts as a
failure. Task 4 (action discovery) and task 5 (nonexistent read + invalid write) both succeed
first-call.

**M1 = 2.1×**, the mean of per-task ratios against an ideal call count: task 1 **4.5×** (9 vs 2),
task 2 2.0×, task 3 2.0× (and still unresolved), tasks 4 and 5 at 1.0×.

**Delivery fell while MARI rose.** That is the design working: the run registered 20 points of new
debt, the quota was re-based 73 → 97, and Delivery dropped 40 → 30 on unchanged earned points. At
25 % weight it cannot sink the index — which is the whole reason MARI exists.

**Read the 28 → 49 as measurement, not delivery.** No code changed. +10 came from Coverage and +15
from re-measuring M1/M2 on the full suite instead of two write calls. The honest sentence is *"we now
know where we stand"*, not *"the product improved"*.

### Diagnostics (§2.4) — every count-based line got worse

| Metric | 2026-08-05 | 2026-08-06 |
|---|---|---|
| M5 — open items | 10 of 15 | **16 of 21** |
| M5a — open P1 | 4 | **5** |
| M5b — resolved | 5 | **5** |
| M5c — added this run | 5 | **6** |
| M5d — cohort closure | C1 74 % · C2 0 % | C1 74 % · C2 0 % · **C3 0 %** |

This is the sharpest demonstration yet of why the M5 family cannot carry a KR. The run closed the
probe surface, re-confirmed the three worst P1 items with live evidence, and settled a caveat that had
been stamped on the baseline — and **every count got worse**. MARI records the same run as 28 → 49.

## 7. What to ship next

The run reorders the backlog. IMP-15 was the standing top priority; it is now second.

1. **IMP-11** — serialise `userRequired` and `visibility`. One change in the field builder. Right now
   the response `hint` and the tool description both instruct the agent to filter on two keys that do
   not exist, leaving `required` (52 fields, 10 of them buttons) as the only signal. This is the root
   cause of M2 on the write path.
2. **IMP-15** — unify the FK contract. B11 and B15 prove `neo_create`'s own output is not valid input
   to `neo_create` or `neo_update`. Fixing the legacy-numeric-id fallback closes the loop.
3. **IMP-12** — a create-shaped `neo_schema` projection. B6 is not merely wasteful; the call **fails**.
   Every downstream task that needs field names inherits that failure (see task 2's M2 score).
4. **IMP-16** — one date format. Cheap, and it removes an error that currently surfaces as an
   untranslated Spanish string about an unrelated field.

Shipping those four lifts Delivery to ~52/97 and, on the projections in registry §2.3, MARI to ~68 —
the KR target for the period.
