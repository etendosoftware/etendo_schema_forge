# MCP Comparison — Post-Audit Run, 2026-10-06 (job B, blind-subagent)

**Targets:** `etendo-mcp-local` (`http://localhost:3100/mcp`), `com.etendoerp.go` build **`a43ea075`** on
`feature/ETP-5639` (carries the `feature/ETP-5602` rename, squash-merged to `develop` as PR #1291 the same day, `neo_*` → `etendo_*`) · **Holded**
demo tenant, re-probed live this run.
**Jira:** ETP-5639 (Epic ETP-3504) · **Labels:** `plataforma`, `validacion-agentica`
**Mode:** write-probe, authorized by the human for `etendo-mcp-local` and the Holded demo tenant only.
`etendo-go` (`app.etendo.ai`, production) was **not** probed.

> Same method as 2026-08-19: one blind subagent per frozen task, MCP tools only, no repo, no
> database, told that a value the contract does not surface means the task fails. The tool names
> changed since then (`neo_*` → `etendo_*`); this report uses the names the probed build serves.

---

## 1. Headline

**MARI 90 → 79 (conservative) · range 74–87.** The fall is on the outcome half (M1, M2) and it is a
**correction, not a regression**: on 08-19 frozen task 2 was measured against a tenant with no
receivables, so Etendo answered "nothing outstanding" in one call (footnote ¹² of the registry flagged
it as flattering). This run the tenant has two open invoices, one of them partially paid, and the
honest count is **2 calls against Holded's 1** — Holded now ships `status=outstanding` as a first-class
filter and its tool description says what it means. Delivery rose 62 → 86 on items closed by other
tickets between runs, which is bookkeeping and is said as such.

**One regression, pre-release:** on this branch the `docs` tool serves recipes naming `neo_create`,
`neo_selectors` and `neo_batch` — tools that no longer exist on the server that serves them (§5 E13).
IMP-10's tool-name drift is back. It is on `develop` (ETP-5602, PR #1291) but not released, so nothing in production is affected yet; it is a release blocker, not an
incident.

**One item closed:** IMP-34 — every child `view:"create"` now says *send `parentId`, not the parent
FK* and names the FK it means; two blind agents wrote child rows (`sales-invoice/lines`,
`product/price`) on the first attempt.

---

## 2. Method & Scope

- **Etendo GO target:** `etendo-mcp-local` only. `etendo-go` (production) was deliberately excluded
  from writes and, by the human's choice, from reads too. Nothing here says what is released.
- **Build:** `com.etendoerp.go` `a43ea075` (`feature/ETP-5639`), which merges `feature/ETP-5602`
  (`5ed59111d`, the tool rename). ETP-5602 was squash-merged to `develop` (PR #1291) the same day; ETP-5639 is not. **Correction, same day:** `feature/ETP-5602` was squash-merged to `develop` as com.etendoerp.go PR #1291 (2026-10-06 16:43 UTC), so the rename is on `develop` awaiting release — the earlier "unmerged" wording came from a `--contains` check that a squash merge cannot satisfy. The docs fix (etendo-go-docs `feature/ETP-5602-docs`) must therefore ship with that release.
- **Spec inventory (recounted from `etendo_discover`, E1):** **66 = 51 windows + 15 reports**, of
  which 6 reports are not callable generators (`bank-reconciliation`, `bank-statements`, `cash-close`,
  `financial-account-bank-connection`, `financial-accounts-page`, `financial-account-transactions`).
  The 08-19 figure was 56. **153** entities across the 51 windows.
- **Holded:** re-probed live by a blind subagent (T1, T2, T3, T5) plus `list_taxes` in the smoke test.
  Catalog: **169** tools.
- **Write mode.** The "no records were mutated" claim does **not** apply.

**Records created and their disposition — nothing left behind:**

| Record | System | Disposition |
|---|---|---|
| sales invoice `E08666ED…` (FV1000033) + line `0CDE6DBD…` | Etendo | deleted |
| product `D92E49D2…` (`MCP-BENCH-T3-20261006`) + prices `DAFD3AB0…`, `CBDD48A8…` | Etendo | deleted |
| sales order `04697A60…` (PV1000000, from the T5 unknown-field probe) | Etendo | deleted |
| proforma `6ac51c6c…` | Holded | deleted |
| product `6ac51c8b…` | Holded | deleted |

No completion, posting, approval or send action was fired on either side. Frozen task 3's stock third
was therefore **not** exercised (it needs a processed inventory); the contract's answer to "where does
stock come from" was recorded instead (E9).

---

## 3. Delta against the registry

* **Resolved IMP-34** — every child `view:"create"` hint now ends *"Do NOT name the parent by its own
  foreign key instead (salesOrder on sales-order/lines, physInventory on inventoryLine) … Send
  parentId, not the parent FK"*, and `etendo_discover` carries `parentField` on 90 child entities.
  Blind agents created `sales-invoice/lines` (T1) and `product/price` (T3) children on the first
  attempt; the third entity (`physical-inventory/inventoryLine`) was verified on the contract (E12).
  ⏳ → ✅. Evidence: E10, E11, E12.
* **Regressed IMP-10** — `docs(topic:"create sales invoice with lines")` returns `neo_create`,
  `neo_selectors`, `neo_batch` on a server whose tools are `etendo_*` (E13). `Context7DocsClient`
  passes the corpus through unchanged, so the rename of `feature/ETP-5602` re-opened the drift the
  item closed. ✅ → ❌ **on `etendo-mcp-local` only**; released environments still serve `neo_*`
  tools and `neo_*` docs, which agree.
* **Added IMP-50** — no `outstanding` named filter; the natural first call answers T2 incompletely
  without an error (P1, ♻️). Evidence: E6, E7, T2.
* **Added IMP-51** — `view:"create"` and `etendo_create`'s `missingFields` disagree on which header
  fields are required (P1, ♻️). Evidence: T5(b).
* **Added IMP-52** — `product/price` lists answer in the legacy `{"response":{…,"status":0}}`
  envelope while every other list answers bare (P2, ♻️). Evidence: E14.
* **Added IMP-53** — `etendo_discover` is 76.5 KB, 41 % of it indentation, with no filter; it does
  not fit an agent's inline result budget (P2, ♻️). Evidence: E1, T3.
* **Added IMP-54** — `etendo_selectors` reports `totalCount: 4` with 2 items and `hasMore: false`
  (P2, ♻️). Evidence: E15.

Re-checked, unchanged: IMP-1 ⚠️ (`eTGOCurrencyRate` still labelled `EM_ETGO_Currency_Rate`, no
description — E3), IMP-7 ⚠️ (`view:"minimal"` still puts `tbaiIsreverseinvoice`, `aeatsiiClaveTipo`
and five more compliance flags in `confirm` — E8), IMP-49 ⚠️ (`sales-order/header` `view:"actions"`
lists 19 AD buttons and no handler named action — E4).

---

## 4. Verification of the shipped wave

| Item | Verdict | The call that decided it |
|---|---|---|
| IMP-3 self-correcting status error | ✅ holds | E7, T5(d) — `available:["completed","pending","partial"]`, `hint`, `seeAlso` |
| IMP-5 structured not-found | ✅ holds | T5(a) — `404 not_found`, id echoed, `seeAlso` |
| IMP-8 selector arg + self-correcting error | ✅ holds, with a caveat | E15/T5(e) — `unknown_selector_column` + `available`. The tool schema now marks `column` **required** and `field` "compatibility-only", so an agent sending only `field` is stopped client-side; sending both with an empty `column` reports `Column ''` |
| IMP-18 unknown fields on write | ✅ holds | T5(f) — `unknownFields:["fooBar"]` + `unknownFieldsHint` on a successful create |
| IMP-24 non-ISO date | ✅ on `etendo_create` | T5(c) — `invalidDates[{name,received,expectedFormat,example}]`. The hint mentions `candidates`, which is not returned for the ambiguous `06/10/2026` |
| IMP-28 `writableVia` | ✅ holds | T3 — `eTGOStock.writableVia` names `physical-inventory/inventoryLine` and the process step |
| IMP-34 parent FK on child create | ✅ resolved this run | E10–E12 |
| IMP-10 docs tool names | ❌ regressed (branch) | E13 |

---

## 5. Live evidence

All rows on `etendo-mcp-local` @ `a43ea075` unless marked Holded. Blind-agent payloads are saved per
task under the session scratchpad; `T1–T5` rows cite the agent's call log.

| # | Call | Verbatim result (excerpt) | Establishes |
|---|---|---|---|
| E1 | `etendo_discover()` | `count: 66` · 76 541 bytes as served, 45 051 compacted · `guidance.tool:"docs"` · `parentField` on 90 entities | inventory 66 · **IMP-53** · IMP-34 |
| E2 | `list_taxes()` (Holded) | 8 taxes, flat model | reference healthy |
| E3 | `etendo_schema sales-order/header view:"create"` | 3 required, 8 optional; `{"name":"eTGOCurrencyRate","label":"EM_ETGO_Currency_Rate"}` with no `description` | IMP-1 still ⚠️ |
| E4 | `etendo_schema sales-order/header view:"actions"` | `actionCount: 19`, `invokableCount: 3`, no handler named action; 16 non-invokable actions returned in full | IMP-49 still ⚠️ · candidate (payload) |
| E5 | `etendo_list tax/tax fields:[…,"salesPurchaseType"]` | rows + `"unknownFields":["salesPurchaseType"]` | IMP-18 read side holds |
| E6 | `etendo_list sales-invoice/header filters:{outstandingAmount:{gt:0}}` | `totalRows: 2` — FV1000009 (60), FV1000002 (60.5) | range op answers T2 in one call — but no blind agent found it |
| E7 | `etendo_list sales-invoice/header filters:{status:"overdue"}` | `422`, `"available":["completed","pending","partial"]` | **IMP-50** — no `outstanding` / `overdue` |
| E8 | `etendo_defaults sales-invoice/header view:"minimal"` | `confirm` holds `tbaiIsreverseinvoice`, `etvfacInvType`, `aeatsiiClaveTipo`, `aeatsiiTipoRectif`, `aeatsiiMotivoRectif`, … ; `unresolvedFields:["tbaiReverseinvoicecode","partnerAddress"]` | IMP-7 still ⚠️ |
| E9 | T3 — `etendo_schema product/product view:"full" fields:[eTGOStock]` | `"writableVia":{"spec":"physical-inventory","entity":"inventoryLine","note":"…then process the document — stock is never written directly."}` | IMP-28 holds |
| E10 | T1 — `etendo_create sales-invoice/lines parentId:<header> {product, invoicedQuantity:1}` | first attempt `ok`, tax `Entregas IVA 21%` resolved | IMP-34 |
| E11 | T3 — `etendo_create product/price parentId:<product> {priceListVersion, standardPrice, listPrice}` ×2 | both first attempt `ok`; read-back `eTGOSalePrice: 35`, `eTGOPurchasePrice: 20` | IMP-34 · T3 passes |
| E12 | `etendo_schema physical-inventory/inventoryLine view:"create"` | hint: *"Do NOT name the parent by its own foreign key instead (… physInventory on inventoryLine) … Send parentId, not the parent FK."* | IMP-34, third entity |
| E13 | `docs(topic:"create sales invoice with lines")` | `"tool": "neo_selectors"`, `"tool": "neo_create"` with `"fields": {"parentId": …}`; batch recipe: *"a failed batch is not guaranteed to be clean"* | **IMP-10 regressed** · recipe puts `parentId` inside `fields` (the tool takes it top-level) · contradicts IMP-23 |
| E14 | `etendo_list product/price parentId:…` | `{"response": {"data": [], "startRow": 0, "endRow": 0, "totalRows": 0, "status": 0}}` | **IMP-52** |
| E15 | T1 — `etendo_selectors sales-invoice/lines column:"product" parentContext:{…}` | 2 items, `"totalCount": 4, "hasMore": false` | **IMP-54** |
| T5(b) | `etendo_create sales-order/header {orderDate, description}` | `missingFields:[businessPartner, invoiceAddress, partnerAddress]` — `view:"create"` listed `businessPartner, warehouse, partnerAddress` | **IMP-51** |
| H-T1 | Holded catalog | no `create_invoice`; `create_proforma` works but there is no `get_proforma` to read it back | structural gap (unchanged) |
| H-T2 | `list_invoices({status:"outstanding"})` (Holded) | 2 items, `payments_pending` each, `has_more:false`; description: *"`status=outstanding` returns the two together"* | Holded's T2 in 1 call |
| H-T3 | `create_product` (Holded) | `{"id":"6ac51c8b…"}` only; no `get_product` / `list_products` | write-only products (unchanged) |
| H-T5 | `get_invoice(000…)` / `create_sales_order(bad contact)` / `create_estimate(items:[])` | RFC-7807 `404` (no id echoed) · `422 'Contact "fff…" not found.'` · `400 'The items field is required and must not be empty.'` | Holded error quality |

---

## 6. Scorecard

### Frozen suite, task by task

| Task | Etendo (calls · first-call) | Holded (calls · first-call) | Comparable? |
|---|---|---|---|
| T1 draft sales invoice + line | 12 (1 failed read: guessed `product/header`) · writes ✅ | **cannot** — no `create_invoice`; proforma substitute in 2, unreadable | no |
| T2 outstanding receivables | **2** necessary (`pending` + `partial`), 3 issued · ❌ first call silently incomplete | **1** · ✅ | **yes** |
| T3 product + 2 prices, read back | 10 · ✅ (stock not exercised) | 1 write, **no read verb** | no |
| T4 complete a sales order | forbidden | forbidden | `n/m` |
| T5 error paths | 6 / 6 self-correctable | 2 / 3 (bad-contact 422 unrecoverable: no `list_contacts`) | yes, 1:1 per probe |

| Metric | 08-19 (blind) | **10-06 (blind)** | Note |
|---|---|---|---|
| **M1** — calls-to-outcome vs Holded | 0.75× on 2 tasks (T2 distorted) | **1.5×** conservative (T2 2:1, T5 1:1) · 2.0× pessimistic (T2 as issued, 3:1) | the T2 distortion is gone — both tenants now have data |
| **M2** — first-call success | 100 % (4/4) | **75 % (3/4)** — T1, T3, T5 pass; T2 fails | T2's first call returns a *wrong* answer with no error, which is worse than a 422 |
| **M3** — payload signal ratio | ~11 % on a product create | not re-counted | — |
| **M4** — self-correctable errors | 100 % (5/5) | **100 % (6/6)** · Holded 67 % (2/3) | — |
| **Delivery** | 77.5 / 126 → 62 | **108.5 / 126 → 86** | +5 IMP-34, −5 IMP-10 regression, the rest closed by other tickets between runs |
| **Coverage** | 6/6 | 6/6 | `etendo_update`, `etendo_batch` and the report generators were not re-probed this run; covered by past runs |

### MARI

```
MARI = 0.30×M2 + 0.30×(100/M1) + 0.25×Delivery + 0.15×Coverage

conservative  M2 75 · M1 1.5× → 67 · D 86 · C 100  ->  MARI 79   <- the figure to quote
pessimistic   M2 75 · M1 2.0× → 50 · D 86 · C 100  ->  MARI 74
optimistic    M2 100 (T2 counted as pass) · M1 67 · D 86 · C 100  ->  MARI 87
```

**Variance caveat (added after review the same day).** M1 and M2 rest on **one blind agent per
task**, and T2 alone swings MARI by ~17 points. The 08-19 agent passed T2 in one call through
`generate_aging_receivable`; this run's agent chose `etendo_list` named filters and needed two.
Re-checked live after the run: `generate_aging_receivable({showDetails:true})` still answers T2
completely in **one** call (FV1000002 60.5 + FV1000009 60, `total: 120.5`). The fall therefore measures
*which route a blind agent finds*, not a lost capability — a real discoverability gap (IMP-50), but a
fragile number until T2 runs with several agents.

**T2 re-run, same day, 3 more blind agents per server (same prompt, read-only):** Etendo first-call
complete in **1 of 4** samples (only the agent that opened with `generate_aging_receivable`; three of
four opened with `status:"pending"` and needed a second call), calls to a complete answer **2 · 2 · 1 · 2
→ median 2**. Holded first-call complete in **4 of 4**, all with `status:"outstanding"` → median 1.
**The number holds: T2 is 2:1 and fails M2 on the majority route; MARI 79 stands.** The 08-19 pass was
the minority route. Two agents also noted the named filters are visible only in `etendo_schema
view:"full"`, which the tool description itself calls ~40 kB, so they guessed `partial` rather than look
it up — further evidence for IMP-50.

**Which components moved, in the skill's required words.** M1 and M2 **fell** — and no code
regressed to cause it: the 08-19 T2 measurement compared an empty Etendo tenant with a populated
Holded one. With data on both sides Etendo needs two calls where Holded needs one, and its first call
is silently incomplete. That is the real gap, and IMP-50 closes it. Delivery **rose** 62 → 86; that is
bookkeeping (items closed by ETP-5306, ETP-5447, ETP-5468 and others between runs), not a product
claim.

### ACE (companion index, outside MARI)

Bytes are `wc -c` on the subagents' saved payloads, request + response, cleanup excluded. **Etendo T1
and T5 payloads were transcribed by hand from the tool output** (whitespace partly normalized), so
those two are a floor, not an exact figure. T2, T3 and all Holded figures are raw.

| Task | Etendo | Holded | Ratio |
|---|---|---|---|
| T1 | ≥ 26 193 B | 3 004 B (substitute path) | ~8.7× |
| T2 | 2 094 B | 2 736 B | **0.77×** |
| T3 | 96 858 B (76 541 of it `etendo_discover`) | 228 B (no read-back) | — |
| T5 | ≥ 22 652 B (6 probes + setup) | 915 B (3 probes) | ~25× |

The only like-for-like task (T2) is **cheaper on Etendo**. The heavy tasks are heavy for two causes,
both registered: `etendo_discover` alone (IMP-53) and write-side schema dumps. **ACE-p:** Holded
**169** tools; Etendo's catalog bytes not measured (no `tools/list` dump this run) — break-even
withheld, as on 08-19.

---

## 7. New backlog items

### IMP-50 · No `outstanding` named filter; the natural first call answers T2 incompletely — P1, ♻️

**BEFORE** (T2, E7): the blind agent's first call `filters:{status:"pending"}` returned **one** invoice
(FV1000002, 60.50) and no error; the partially paid FV1000009 (60.00 still owed) needs a second call
with `status:"partial"`. The `etendo_list` description names the filters only as examples (*"e.g.
\"pending\", \"partial\", \"completed\""*) and never says that `pending` excludes partials. An agent
without the benchmark's warning reports 60.50 instead of 120.50. `status:"overdue"` → `422`. The
one-call answer exists (`outstandingAmount:{gt:0}`, E6) and no blind agent found it.
Holded: `list_invoices({status:"outstanding"})`, described as *"returns the two together"*.

**AFTER:** `sales-invoice/header` and `purchase-invoice/header` offer `outstanding` (= `pending` ∪
`partial`); each named filter carries a one-line meaning that `etendo_list`'s 422 `available` list and
`etendo_schema` both surface (or the tool description states the `pending`/`partial` split). `overdue`
stays out until the due-date subquery exists — say so in the 422 rather than silently.

**Done when:** a blind agent answers T2 correctly in **one** call with no warning in its prompt. **Moves
M1 (2:1 → 1:1) and M2 (T2 fail → pass)** — on its own worth ~+13 MARI.

### IMP-51 · `view:"create"` and `etendo_create` disagree on what is required — P1, ♻️

**BEFORE** (T5(b)): `etendo_schema sales-order/header view:"create"` → `required:[businessPartner,
warehouse, partnerAddress]`. `etendo_create` with neither → `missingFields:[businessPartner,
invoiceAddress, partnerAddress]`. `invoiceAddress` is listed by the error but absent from the view;
`warehouse` is required by the view but not by the error (the server resolved it). The follow-up create
with the view's three fields succeeded, deriving `invoiceAddress` from `partnerAddress`.

**AFTER:** one source of truth: the 422 lists only what `view:"create"` lists as required, and a field
the server derives once another is set (`invoiceAddress` from `partnerAddress`) is reported as such
rather than as missing.

**Done when:** on `sales-order/header`, `sales-invoice/header` and `purchase-invoice/header`, the
`missingFields` of an empty create equals `view:"create"`'s `required` set. **Moves M2.**

### IMP-52 · `product/price` lists answer in the legacy envelope — P2, ♻️

**BEFORE** (E14, T1 call 09): `etendo_list product/price parentId:…` →
`{"response": {"data": [], "startRow": 0, "endRow": 0, "totalRows": 0, "status": 0}}`. Every other list
in this run answered bare `{startRow, endRow, totalRows, data}`. `{…,"status":0}` is the ambiguous
shape the 2026-07-21 baseline already flagged (§7.5).

**AFTER:** the same bare envelope on every `etendo_list` / `etendo_get`, whatever handler serves the
entity.

**Done when:** a scan of `etendo_list` over every child entity of `product` and the other specs with
handler-served children returns no `response` wrapper. **Moves M2** (a parser keyed on `data` finds
nothing).

### IMP-53 · `etendo_discover` does not fit an agent's result budget — P2, ♻️

**BEFORE** (E1, T3): 76 541 bytes, 2 868 lines. Compacted the same JSON is 45 051 bytes: **41 % is
indentation**. The harness refused it inline (*"exceeds maximum allowed tokens"*), so the T3 agent had
to grep a spilled file to find `product`'s entities — a step an agent without a filesystem cannot
take. It was 79 % of T3's bytes. `etendo_discover` takes no arguments.

**AFTER:** compact JSON on every MCP response, and `etendo_discover({spec?})` (or a names-only default
plus per-spec detail).

**Done when:** `etendo_discover()` is under ~25 KB and a per-spec call exists. **Moves ACE-v and M1**
(the T1 agent guessed `product/header` because it skipped discover).

### IMP-54 · `etendo_selectors` reports a count it does not return — P2, ♻️

**BEFORE** (E15): `items` has 2 entries, `"totalCount": 4, "hasMore": false`. The tenant had two
products at that moment; 4 is plausibly the price rows joined under them (two per product) — a
hypothesis, not verified.

**AFTER:** `totalCount` counts what `items` enumerates; `hasMore` is true whenever `totalCount >
items.length`.

**Done when:** on the product selector of `sales-invoice/lines` with `parentContext`, `totalCount`
equals the number of distinct products the selector can return. **Moves M2** (an agent told "2 of 4,
no more" cannot reach the other two).

> **IMP-50 follow-up, same day. an `outstanding` filter was added to `sales-invoice` and `purchase-invoice` (`decisions.json → namedFilters`, pushed and exported) and answers T2 in one call when asked. Re-measured with 3 blind agents on the deployed build: **0 of 3 used it** — all opened with `status:"pending"`, because `etendo_list` lists only example names and the real list lives in `etendo_schema view:"full"` (~40 kB). The item stays ⏳: the remaining half is discoverability (catalog description generated from NAMED_FILTERS + a `namedFilters` block in filtered responses), in progress on `feature/ETP-5639`.**

### Unnumbered candidates (not specified to the IMP standard yet)

- `sales-invoice/lines view:"create"` → `required: []`; `product` is optional and not
  `serverDefaulted`. A line without a product is accepted by the contract.
- `etendo_discover` says `product/price` has `parentRequiredFor: [… "delete"]`, yet the delete
  without `parentId` succeeded (T3).
- The IMP-24 date hint promises `candidates` for an ambiguous value; `06/10/2026` returns none.
- `view:"actions"` on `sales-order/header` returns 16 non-invokable actions in full beside 3
  invokable ones; `pickfromreceipt` (return-material pick) is invokable on a sales order.
- `etendo_create sales-invoice/header` accepts a header with no lines and returns
  `documentAction:"CO"`, with nothing saying the draft cannot be completed yet.
- Data, not MCP: both tenant products default to the UOM *Centímetro* and have a sale price of 0, so
  T1 produced a zero-total invoice.

---

## 8. Preference verdict — as a delta

**Moved this run:** nothing moved into our column. **One thing moved into Holded's:** answering
*"what is outstanding"*. Holded added `status=outstanding` and `overdue` to `list_invoices` and
explains in the tool description that partials still owe a balance; Etendo answers in two calls and
its first call is silently short. On 08-19 this looked like a win only because our tenant was empty.

**Still ours, re-verified live:**

- **Issuing an invoice and verifying your own write.** Holded still has no `create_invoice`, no
  `get_proforma`, no `get_product`/`list_products` (H-T1, H-T3). Etendo wrote and read back a priced
  product and a draft invoice with every write succeeding first time (T1, T3).
- **Error quality.** 6/6 self-correctable vs 2/3; Holded's bad-contact 422 names the value but the
  agent has no `list_contacts` to recover.
- **Unknown-field honesty.** A misspelt field comes back in `unknownFields` on a successful write.
- **Child rows without guessing** — IMP-34 closed this run.

**Still theirs:** fewer calls on read questions with real data (T2); named verbs and in-description
prose (the `outstanding` semantics live in the tool text, where the agent reads them before calling);
per-call payload (`etendo_discover` 76 KB vs nothing to discover); domains we do not expose (CRM,
projects, HR, recurring).

**Decision rule:** regulated, accounted, or "confirm your own work" → Etendo GO. Quick read questions
on invoices in a short session → Holded today. **What takes the second class:** IMP-50 (one line of
config plus a description), IMP-53 (compact output) and IMP-51 (one required-set truth) — not new
tools.

---

## 9. What was NOT tested

- **`etendo-go` (production) and any other remote environment** — not probed; nothing here describes
  what is released, including whether production still serves `neo_*`.
- **Frozen task 4** — forbidden in every mode.
- **Stock on T3** — needs a processed inventory; no completion action authorized this run.
- **`etendo_update`, `etendo_batch`, `etendo_action`, `etendo_widget` and the report generators** — not
  re-probed; Coverage rests on earlier runs for those surfaces.
- **ACE-p for Etendo** — catalog bytes not dumped.
- **The Java suite of `feature/ETP-5639`** — not run by this skill.

---

## 10. Closing snapshot

> Read-only restatement of the registry. If anything here disagrees with
> [`mcp-improvements-registry.md`](mcp-improvements-registry.md), the registry is right.

### 10.1 MARI

> **Update, same afternoon — MARI 79 → 98.** After deploying IMP-50 (outstanding filter + catalog
> description generated from NAMED_FILTERS + `namedFilters` response block) and IMP-53 (compact JSON,
> `etendo_discover({spec})`, opt-in `_indentResponse`) on `etendo-mcp-local`, T2 was re-run with 3 blind
> agents: **3/3 answered in one call with `status:"outstanding"`, first call complete**, ~1.1 KB each
> vs Holded's 2.7 KB. M2 75 → 100, M1 1.5× → 1.0×, Delivery 86 → 91. The filter alone (deployed
> earlier, invisible in the catalog) moved nothing: 0/3. Registry §2.1 footnote ¹⁵ has the detail; the
> figures below are the morning measurement, kept as the record.

**MARI = 79 (conservative) · range 74–87** — previous: **90** (conservative).

| Component | Weight | Value | Contribution (conservative) |
|---|---|---|---|
| M2 — first-call success | 0.30 | **75** (was 100) | 22.5 |
| M1 — calls-to-outcome | 0.30 | **1.5× → 67** (was 0.75×/1.0× carried) | 20.0 |
| Delivery | 0.25 | 108.5 / 126 → **86** (was 62) | 21.5 |
| Coverage | 0.15 | 6/6 → 100 | 15.0 |

**KR verdict:** below 88. The drop is a measurement correction on M1/M2, not a code regression;
IMP-50 alone would put it at ~92.

### 10.2 ACE — companion index, not part of MARI

T2 (the only like-for-like task) 0.77× — Etendo cheaper. T1 ~8.7×, T5 ~25×, T3 dominated by a 76.5 KB
`etendo_discover`. Etendo T1/T5 bytes are hand-transcribed floors. ACE-p: Holded 169 tools, Etendo not
measured; break-even withheld.

### 10.3 The whole board — 53 registered items (IMP-38 withdrawn, not counted)

28 resolved + 1 regressed + 8 partial + 16 open = 53.

**Resolved (28)** — IMP-2, 3, 5, 6, 8, 9, 11, 12, 15, 17, 18, 19, 21, 22, 23, 25, 30, **34**, 39,
40, 41, 42, 43, 44, 45, 46, 47, 48.

**Regressed (1)**

| Item | | What it is |
|---|---|---|
| IMP-10 | ❌ 0/5 | The `docs` recipes name tools that no longer exist on the renamed branch |

**Pending — P0/P1**

| Item | | What it is |
|---|---|---|
| IMP-37 | ⏳ 0/5 (P0) | Rejecting read-only fields also rejects the link to the parent, blocking child rows |
| IMP-50 | ⏳ 0/5 | No single filter for "still owes money"; the first answer is silently short |
| IMP-51 | ⏳ 0/5 | The schema and the create error disagree on which fields are required |
| IMP-26 | ⏳ 0/5 | MCP and NEO describe the same field from two different DB columns |
| IMP-31 | ⏳ 0/5 | One handler on an entity exempts every field on it from read-only rejection |
| IMP-1 | ⚠️ 2.5/5 | Some field labels are still raw column names with no description |
| IMP-16 | ⚠️ 2.5/5 | Date format is not the same across defaults and the write verbs |
| IMP-24 | ⚠️ 2.5/5 | Non-ISO dates are rejected rather than misparsed — except on batch |
| IMP-28 | ⚠️ 2.5/5 | Read-only fields are flagged right but a write to them is not refused |

**Pending — P2**

| Item | | What it is |
|---|---|---|
| IMP-52 | ⏳ 0/3 | One child entity answers lists in a different, legacy envelope |
| IMP-53 | ⏳ 0/3 | The discovery call is too large to read inline and cannot be narrowed |
| IMP-54 | ⏳ 0/3 | A selector says there are more options than it returns, and that there are no more |
| IMP-35 | ⏳ 0/3 | A derived field says where to write it but not where to read it |
| IMP-36 | ⏳ 0/3 | The unresolved-fields list omits what failed without throwing |
| IMP-13 | ⏳ 0/3 | Nothing marks business-critical fields; named filters have no authoring path |
| IMP-20 | ⏳ 0/3 | Write verbs return the whole record with no way to ask for less |
| IMP-27 | ⏳ 0/3 | No per-field switch for how the MCP treats a field |
| IMP-29 | ⏳ 0/3 | Entity names come from AD tab names, so they shift with language |
| IMP-32 | ⏳ 0/3 | The readable identifier prints dates in a format the write verbs refuse |
| IMP-4 | ⚠️ 1.5/3 | Foreign keys can be given as human names on write — partly |
| IMP-7 | ⚠️ 1.5/3 | The lean defaults view still carries compliance flags |
| IMP-14 | ⚠️ 1.5/3 | The published docs match the real tool names — partly (now drifted again on the branch) |
| IMP-49 | ⚠️ 1.5/3 | Handler named actions are discoverable on two specs, not on orders/invoices |

**Pending — P3** — IMP-33 ⏳ 0/1: a failed write points at the docs topic for *reading*.

### 10.4 Owed by the human, not by a run

1. **Before merging `feature/ETP-5602` / `feature/ETP-5639`:** realign the `etendo-go-docs` corpus to
   `etendo_*` (or have `Context7DocsClient` rewrite the names), or the merge ships IMP-10's regression.
2. **Decide whether production should be probed read-only** next run, so a column describes what is
   released.
3. **Seed the tenant with priced products** (both current products sell at 0, UOM centimetre).
4. **Authorize a processed inventory** if T3's stock third should be measured again.
