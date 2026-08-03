# MCP Comparison — Holded vs Etendo GO

> **Jira:** ETP-4601 (Epic ETP-3504) · Labels: `plataforma`, `validacion-agentica`
> **Method:** Both MCP servers were connected and exercised live (agentic validation) — schema, list, get, action-discovery, and error-path calls were run against each. Findings below cite the specific call that produced them (§11).
> **Date:** 2026-07-21

---

## 1. Executive Summary

Holded and Etendo GO expose two fundamentally different MCP philosophies:

- **Holded** — a **broad, purpose-built tool surface** (~180 explicit tools) spanning the whole business suite (CRM, sales, purchases, inventory, accounting, projects, HR, documents). Each tool ships **rich agent-facing prose**, **first-class document-lifecycle verbs** (approve / send / ship / accept / pipeline / tracking), **native document delivery** (PDF + attachments), and **human-friendly value resolution** (accepts names, not just IDs).
- **Etendo GO** — a **deep, metadata-driven tool surface** (~14 generic verbs over **56 specs**: 48 windows + 8 reports). It wins on **runtime introspection** (`neo_discover` / `neo_schema` / `neo_defaults` / `neo_selectors`), **uniform read/write across every entity**, **ERP/accounting depth**, **agentic-safety semantics** (`businessCritical` + confirm-with-user hints), and **EU/Spanish fiscal compliance** (SII, VeriFactu, TicketBAI/Batuz) — none of which Holded attempts.

**Bottom line:**
- Holded is easier for an agent to *use out of the box* and covers more operational domains.
- Etendo GO is more *powerful, self-describing and scalable* within finance/ERP, and is the only one viable in a regulated ES/EU tax context.
- The biggest Etendo GO wins are on **agent/developer experience of features it already has** — cleaner naming, leaner responses, richer query semantics, friendlier value resolution and clearer errors (§7). Broader operational domains (CRM pipeline, projects, HR) are a **roadmap item**, not a current gap (§8).
- **Easiest wins for "simpler to use":** most of the friction is already solved by assets that just aren't surfaced — a `docs` recipe tool the agent doesn't know to call, a `neo_defaults` that pre-fills everything but drowns it in compliance noise, and small argument/entity-naming inconsistencies that cost a guaranteed first-try failure (§7.8–§7.9). None require ERP work.

> **Delivery status (2026-08-03):** 7 of the 10 improvements in §12 shipped under **ETP-4601** — Wave 1 (IMP-1, IMP-5, IMP-8, IMP-10) and Wave 2 (IMP-2, IMP-3, IMP-7). Only **Wave 3** (IMP-4 FK-by-name, IMP-6 actions-only view, IMP-9 `primaryEntity`) remains. See §12 for per-item detail.

---

## 2. Method & Scope

Both servers were connected in Claude Code and driven with live calls:

- **Holded** (HTTP MCP, `https://mcp.holded.com/mcp`): full tool catalog enumerated; `list_taxes`, `list_invoices`, `get_invoice` (bad id → error path), and read/write catalog coverage for contacts/products verified.
- **Etendo GO** (`etendo-go-local`): `neo_discover` (56 specs), `neo_list` on `tax/tax` and `sales-invoice/header`, `neo_schema` on `sales-order/header` (97 fields + action discovery), `neo_get` (bad id → error path), `neo_defaults`/`neo_selectors` semantics on `sales-invoice`, and the `docs` recipe tool.

14 live calls back the findings (full log in §11). Out of scope: latency benchmarking, and any evaluation of the underlying products beyond what each MCP surfaces. No records were mutated in either tenant — every call was read-only or an intentional error probe.

---

## 3. Architecture Contrast

| Dimension | Holded | Etendo GO |
|---|---|---|
| Tool model | ~180 explicit, per-operation tools | ~14 generic verbs + 8 report generators |
| Generic verbs | — (each op is its own tool) | `neo_list / get / create / update / delete / action / batch / defaults / schema / selectors / discover / widget` |
| Adding a new entity | Requires shipping a **new tool** (static surface) | **Appears automatically** via metadata — no new tool needed |
| Runtime introspection | ❌ none (tools are fixed) | ✅ `neo_discover` + `neo_schema` + `neo_defaults` + `neo_selectors` |
| Read/write parity | ⚠️ **asymmetric** — contacts & products have write but **no get/list tool** | ✅ uniform `neo_get`/`neo_list` on every spec |
| Document actions | ✅ dedicated verbs (approve/send/ship/accept/set_pipeline/tracking) | ✅ **discoverable** via `neo_schema` (button fields expose `action` + `processName` + `processId`), executed via `neo_action` |
| FK value resolution | ✅ accepts human names inline, auto-resolves (e.g. tax `"IVA 21%"`) | ⚠️ requires exact ID via a separate `neo_selectors` round-trip |
| Document delivery (PDF / files) | ✅ `get_*_pdf`, attachments, inbox upload | ❌ not exposed in the MCP |
| Error signaling | ✅ RFC-7807 problem details (structured 404/400) | ⚠️ not-found returns `{data:[], status:0}` (ambiguous "success") |
| Response shape | Focused + inline aggregates (`payments_total/pending`) | Full row dump (~60 fields) + `$_identifier` labels; no field projection |
| Pagination | Cursor + `has_more` | Offset (`startRow`/`endRow`/`totalRows`) |
| Agentic-safety semantics | ⚠️ generic | ✅ `businessCritical` flag + "confirm with user before writing" hint |
| Permission / governance | ✅ declared per tool (`sales:invoices.read`, …) | ❌ not surfaced per verb |
| Extensibility cost | Grows linearly (one tool per op) | Near-zero (new specs ride existing verbs) |
| Guidance / recipes | ✅ prose baked into every tool description | ✅ **queryable** `docs(topic:…)` recipes — but under-surfaced + name drift (§7.9) |
| Onboarding friction | Low (tool name = operation) | Higher: unpredictable entity names, `column`-vs-`field` arg, verbose defaults (§7.8) |

**Reading of the trade-off:** Holded optimizes for *immediate, low-friction agent usability* at the cost of a large static surface and read/write gaps. Etendo GO optimizes for *scalability, uniformity and self-description* — one verb set over an unbounded metadata catalog — but ships rougher per-call ergonomics an agent must work through.

---

## 4. Holded Tool Inventory (by domain)

- **CRM — contacts:** create / update / delete, `bulk_archive`, `bulk_delete`, contact groups, tags, file attach. **No `get_contact` / `list_contacts`** (read gap).
- **CRM — leads & pipeline:** leads (create/update/delete/stage/dates), lead notes, lead tasks, funnels.
- **Sales — estimates / proformas / sales orders / waybills:** full lifecycle verbs — create/update/delete + **approve / accept / reject / send / ship / ship_by_lines / set_pipeline / update_tracking** + file attach.
- **Sales — invoices:** list (rich filters), get, **get_pdf**, attachments, `find_invoices_by_document_number` (fuzzy), recurring invoices + schedule.
- **Sales — receipts & credit notes:** list / get / **pdf** / attachments.
- **Purchases:** purchase orders (create/update/delete + **approve/send/receive** + pipeline + attach), purchase shipments, purchases/bills, receipt notes.
- **Inventory / production:** products (create / update / delete / **update_stock** / upload image — **no get/list**), warehouses, services (list/get), production orders.
- **Accounting / finance:** chart of accounts, ledger entries, expenses accounts, payments, payment methods, remittances, banking accounts + bank/cash movements, invoicing forecasts (cashflow), taxes, numbering series, price lists.
- **Projects & PM:** projects, project time, tasks, bookings, events.
- **HR:** employees, employee contracts, employee times.
- **Documents:** inbox upload/attach/update, per-document attachments and PDFs.
- **Platform:** account usage / usage-by-type, sales channels, tax-per-country.

---

## 5. Etendo GO Spec Inventory (56 specs)

**Windows (48)** — each typically exposes `header` + `lines` + `tax`/`lineTax` + `accounting` + payment-plan entities, all over the same generic verbs:

`amortization, asset-group, assets, bp-location, business-partner-category, chart-of-accounts, contacts, conversion-rate-downloader-log, conversion-rates, end-year-close, financial-account, fiscal-calendar, general-ledger-configuration, goods-movements, goods-receipt, goods-shipment, internal-consumption, match-rule, monitor-verifactu, not-posted-documents, open-close-period-control, payment-in, payment-out, payment-term, physical-inventory, price-list, product, product-category, purchase-invoice, purchase-order, return-from-customer, return-material-receipt, return-to-vendor, return-to-vendor-shipment, sales-invoice, sales-order, sales-quotation, sii-config, sii-monitor, simple-g-l-journal, tax, tax-category, tbai-config, tbai-facturas-enviadas, transaction-type, user, verifactu-config, warehouse`

**Reports (8):** aging-receivable, bank-reconciliation, bank-statements, financial-account-psd2, financial-accounts-page, financial-account-transactions, inventory-stock-report, tax-report.

**Depth examples** (live): `product` exposes 26 entities (costing, average-cost transactions, cost adjustments, BOM, manufacturing, characteristics, price-rule versions, stock, intrastat…); `sales-invoice` exposes 19 entities including `siiData`, `verifactu`, `ticketbai`, `resultadoValidación`; `sales-order/header` alone has **97 fields** and **~20 discoverable button actions** (Process Order, Create Invoice, Add Payment, Cancel and Replace, Post, Copy from Orders…).

---

## 6. Domain Coverage Matrix

Legend: ✅ strong · ⚠️ partial/shallow · ❌ absent from MCP

| Domain | Holded | Etendo GO | Notes |
|---|:--:|:--:|---|
| CRM — contacts | ✅ | ✅ | Etendo `contacts` deeper; Holded adds groups/tags/bulk ops |
| CRM — leads / funnels / pipeline | ✅ | ❌ | Holded-only today; Etendo roadmap (§8) |
| Sales cycle (estimate→order→waybill→invoice) | ✅ | ✅ | Holded richer *lifecycle verbs*; Etendo richer *data model* |
| Purchases cycle (PO→receipt→bill) | ✅ | ✅ | Both complete |
| Returns / RMA (both directions) | ⚠️ | ✅ | Etendo: structured customer & vendor returns + return shipments |
| Inventory / warehouses / stock / bins | ⚠️ | ✅ | Etendo: storage bins, physical inventory, goods movements |
| Costing / BOM / manufacturing | ❌ | ✅ | Etendo: costing rules, avg-cost, adjustments, BOM, production |
| Products — variants / characteristics / price rules | ⚠️ | ✅ | Etendo far deeper |
| Contacts / products — read (get/list) | ❌ | ✅ | Holded has write but **no get/list** for these two entities |
| Accounting — chart of accounts / ledger | ✅ | ✅ | Both |
| Accounting — posting engine / period control / year-close | ❌ | ✅ | Etendo: fiscal calendar, period control, end-year-close, not-posted docs |
| Fixed assets & amortization | ❌ | ✅ | Etendo: assets + amortization-plan generation |
| Banking — accounts & movements | ✅ | ✅ | Both |
| Banking — reconciliation / PSD2 / statement matching | ❌ | ✅ | Etendo: reconciliation, PSD2, match rules, cleared items |
| EU/ES fiscal compliance (SII / VeriFactu / TicketBAI) | ❌ | ✅ | **Major Etendo differentiator** |
| Tax engine sophistication | ⚠️ flat % | ✅ | Etendo: intracomunitarias, retenciones, bienes de inversión, `validFrom` |
| Payments — in/out with execution history | ⚠️ | ✅ | Etendo: payment-in/out, execution history, remittances, credit sources |
| Cashflow forecast / recurring documents | ✅ | ⚠️ | Holded: invoicing forecasts + recurring invoices |
| Projects & time tracking | ✅ | ❌ | Holded-only today; Etendo roadmap (§8) |
| HR / employees / contracts / time | ✅ | ⚠️ | Holded operational; Etendo has `user` + employee-as-BP |
| Document delivery (PDF) + attachments + inbox | ✅ | ❌ | Holded-only in the MCP |
| Usage / metering | ✅ | ❌ | Holded exposes account usage |
| Reports (aging, tax, stock, bank) | ⚠️ | ✅ | Etendo: 8 dedicated report generators |

---

## 7. Overlapping Features Where Holded Is Better — and How to Improve Etendo GO

These are **not "Holded has X, Etendo doesn't"**. They are capabilities **both have**, where Holded's implementation is more agent-friendly and Etendo GO's could be improved. All are DX/ergonomics — no new functional depth required.

### 7.1 Clean names & per-field prose vs raw AD columns
**Observed (`neo_schema sales-order/header`):** fields surface raw Etendo AD identifiers and cryptic labels — `EM_Aeatsii_Descripcion_Sii`, `RM_ReceiveMaterials`, `EM_Etpr_Remove_Payment` → label *"EM_ETPR_Remove Payment"*, `User1_ID` → *"1st Dimension"*. There is no per-field description text, only a (often cryptic) label + type. Holded fields have clean names **and** a prose description each (e.g. *"SEPA mandate reference for direct debit collections"*).
**Impact:** the agent must guess what many fields mean; higher error rate on writes.
**Improve:** map AD columns to clean functional names + a one-line description in `neo_schema` (Schema Forge already curates this in `decisions.json` — surface it through the MCP).

**Example — what each MCP tells the agent about a field:**
```jsonc
// HOLDED — create_contact field: name + human prose
"sepa_ref": { "description": "SEPA mandate reference for direct debit collections" }

// ETENDO GO — neo_schema sales-order/header fields (verbatim): no description, cryptic label
{ "name": "eTPRRemovePayment", "column": "EM_Etpr_Remove_Payment", "label": "EM_ETPR_Remove Payment", "type": "button" }
{ "name": "stDimension",       "column": "User1_ID",             "label": "1st Dimension",        "type": "foreignKey" }
{ "name": "aeatsiiDescripcionSii", "column": "EM_Aeatsii_Descripcion_Sii", "label": "EM_Aeatsii_Descripcion_Sii", "type": "string" }
```
The agent can act on `sepa_ref` immediately; it has to *guess* what `EM_Etpr_Remove_Payment` or `1st Dimension` mean.

### 7.2 Leaner responses / field projection
**Observed (`neo_list sales-invoice/header`):** every row returns ~60 fields, including many the agent rarely needs (`aeatsiiClaveTipo`, `etvfacSimpinvart7273`, `eTGOCurrencyRate`, …). No way to request a subset. Holded returns a focused shape and folds key aggregates inline (`payments_total`, `payments_pending`).
**Impact:** token cost and noise on every list call.
**Improve:** add a `fields`/projection parameter to `neo_list`/`neo_get`, and/or a curated "summary view" per spec.

**Example — one invoice row, same intent ("show me the invoice"):**
```jsonc
// HOLDED — list_invoices row: focused, aggregates inline
{ "docNumber": "F2026/014", "contact": "Juan Perez", "date": "2026-04-16",
  "total": 1355.20, "payments_total": 1000.00, "payments_pending": 355.20, "status": "partial" }

// ETENDO GO — neo_list sales-invoice/header row: ~60 fields (excerpt), incl. rarely-needed fiscal noise
{ "documentNo": "10000014", "businessPartner$_identifier": "Juan Perez", "invoiceDate": "2026-04-16",
  "grandTotalAmount": 1355.2, "outstandingAmount": 355.2, "paymentComplete": false,
  "aeatsiiClaveTipo": null, "aeatsiiEstado": "PE", "etvfacInvType": "F1", "etvfacSimpinvart7273": false,
  "eTGOCurrencyRate": null, "etgoTotalDiscount": null, "_computedColumns": "…", /* …~50 more… */ }
```
Both carry the answer; Etendo makes the agent pay for ~50 fields it did not ask for, on every row.

### 7.3 Business query semantics
**Observed:** Holded `list_invoices` offers documented business filters — `status = pending|partial|overdue|completed`, issue-date and due-date ranges, by-contact, by-accounting-account, sort — plus embedded guidance (*"to aggregate outstanding receivables include BOTH pending and partial"*). Etendo `neo_list` filters are generic `key=value` equality only; no documented statuses, no range operators surfaced. The raw data exists (`outstandingAmount`, `eTGODueDate`, `paymentComplete`) — the **query ergonomics** don't.
**Impact:** answering "what's overdue / outstanding?" is one call in Holded, multi-step reasoning in Etendo.
**Improve:** add documented business filters (status, date ranges, operators) to `neo_list` for the high-traffic document specs.

**Example — user asks "which invoices are overdue?":**
```jsonc
// HOLDED — one call, business concept is native
list_invoices({ status: "overdue" })
// → returns exactly the overdue set; sum payments_pending for the amount owed

// ETENDO GO — no "overdue" concept; agent must pull rows and reason client-side
neo_list({ spec: "sales-invoice", entity: "header", filters: { paymentComplete: false } })
// → then, per row, keep those where outstandingAmount > 0 AND eTGODueDate < today,
//    paginating manually via startRow/endRow. The data is there; the query is not.
```

### 7.4 Human-friendly value resolution
**Observed:** Holded `create_product`/`update_contact` accept a tax by **name or key** (*"Accepts the human tax name 'IVA 21%' or the internal key 's_iva_21'; resolved automatically"*) and offer fuzzy `find_invoices_by_document_number`. Etendo requires the exact 32-char FK ID, obtained via a separate `neo_selectors` call.
**Impact:** an extra round-trip (and more chances to pick the wrong ID) for every FK on a write.
**Improve:** let `neo_create`/`neo_update` accept a name/search string for FK fields and resolve server-side (reusing the selector logic), falling back to `neo_selectors` only when ambiguous.

**Example — "create a product taxed at 21% VAT":**
```jsonc
// HOLDED — 1 call, pass the human name; server resolves it
create_product({ name: "Widget", kind: "simple", has_stock: true,
                 for_sale: true, for_purchase: true, taxes: ["IVA 21%"] })

// ETENDO GO — 2 calls: resolve the FK id first, then create with the 32-char id
neo_selectors({ spec: "tax", entity: "tax", column: "tax", query: "21" })
// → [{ id: "FFA767684E234FCFB8A1CA24459B934B", name: "IVA 21% ..." }, …]  (pick the right one)
neo_create({ spec: "product", entity: "product",
             data: { name: "Widget", tax: "FFA767684E234FCFB8A1CA24459B934B" } })
```
Every FK on a write costs Etendo an extra round-trip and a chance to pick the wrong id.

### 7.5 Explicit not-found / error signaling
**Observed:** `get_invoice(bad id)` → Holded returns HTTP 404 RFC-7807 problem details (`type`, `title`, `status`, `detail`). `neo_get(bad id)` → Etendo returns `{data:[], status:0}` — indistinguishable from a legitimate empty result, and status 0 reads as success.
**Impact:** the agent can't reliably detect "not found" to self-correct.
**Improve:** return an explicit not-found status/error object from `neo_get`, and structured validation errors from writes.

**Example — fetch a record that does not exist (verbatim responses):**
```jsonc
// HOLDED — get_invoice("aaaaaaaaaaaaaaaaaaaaaaaa")
// → HTTP 404, machine-readable problem+json
{ "type": "https://api.holded.com/problems/not-found", "title": "Not found", "status": 404, "detail": "Not Found" }

// ETENDO GO — neo_get(sales-invoice, header, "NONEXISTENT123")
// → looks like a successful empty result; agent cannot tell "not found" from "no match"
{ "response": { "data": [], "status": 0 } }
```

### 7.6 Document actions: discoverable, but not first-class
**Observed:** Etendo actions **are** discoverable (`neo_schema` exposes each button's `action`, `processName`, `processId`, `invokeVia`) — this is good and corrects an earlier assumption. But the agent must (a) fetch the full 97-field schema, (b) locate button fields among data fields, and (c) call `neo_action` with the column name. Holded exposes each as a named verb with its own focused params.
**Improve:** add an actions-only view to `neo_discover`/`neo_schema` (list the callable actions per spec with names + params, without the full field dump).

**Example — "complete / process this sales order":**
```jsonc
// HOLDED — a named verb, self-evident
approve_sales_order({ salesOrderId: "…" })

// ETENDO GO — discover the button in the 97-field schema, then fire it by column name
neo_schema({ spec: "sales-order", entity: "header" })
// → find: { name: "documentAction", column: "DocAction", action: "DocAction",
//           processName: "Process Order", invokeVia: "neo_action" }
neo_action({ spec: "sales-order", entity: "header", id: "…",
             action: "DocAction", parameters: { docAction: "CO" } })
```
The action *is* discoverable (good) — but the agent pays a 97-field schema fetch and must know `docAction: "CO"` means "Complete".

### 7.7 End-to-end walk-through — "create a customer invoice for 1 product and mark it issued"

Counting the calls an agent needs from a cold start (no cached ids):

| Step | Holded | Etendo GO |
|---|---|---|
| Find/verify the customer | (contact id from context) | `neo_selectors businessPartner` |
| Find the product / tax | pass name → auto-resolved | `neo_selectors product`, `neo_selectors tax` |
| Learn required fields | (tool params are explicit) | `neo_schema` (97 fields) + `neo_defaults` |
| Create header + line | `create_invoice({...})` — names inline | `neo_create header` + `neo_create lines` (32-char ids) |
| Issue / complete | `approve_invoice` / `send_invoice` | `neo_action(action:"DocAction", {docAction:"CO"})` |
| **Typical call count** | **~2–3** | **~6–8** |

Same business outcome; Etendo GO asks the agent to do 2–3× the calls and to carry opaque 32-char ids between them. **Every §7 improvement shaves calls or ambiguity off this exact path** — and none of them require new ERP functionality, only MCP-layer ergonomics.

> Note (the other direction): the same generic verbs that cost extra calls here are *why* Etendo GO needs **zero** new tools when a 57th spec is added, and why it can enforce the `businessCritical` confirm-before-write guardrail uniformly (§8). The trade-off is deliberate, not accidental.

### 7.8 Onboarding friction — where an agent gets stuck before it even creates anything

Three smaller ergonomics gaps, each verified live, that raise the cost of the *first* successful call on any spec.

**(a) `neo_defaults` returns a near-complete draft — buried in compliance noise.**
`neo_defaults(sales-invoice, header)` returns a ready-to-post draft with `unresolvedFields: []` (a genuine strength — the agent barely has to invent anything). But it ships ~70 fields, and the vast majority are technical/compliance flags the agent must visually filter out to find the 4–5 that matter.
```jsonc
// ETENDO GO — neo_defaults(sales-invoice, header) — abridged, real response had ~70 keys:
{
  // ── the ~5 an agent actually reasons about ──
  "invoiceDate": "21-07-2026", "paymentTerms$_identifier": "30 Días",
  "priceList$_identifier": "Lista de venta (sin impuestos)", "currency$_identifier": "EUR",
  "documentAction": "CO",
  // ── the ~65 it must skip past ──
  "aeatsiiIssent": false, "aeatsiiClaveTipo": "F1", "aeatsiiIsauthorization": false,
  "aeatsiiSend": "N", "aeatsiiModif": "N", "aeatsiiDup": "N", "tbaiVoidxmlgenerator": "N",
  "etvfacSentToVerifac": "N", "etblkpBulkposting": "N", "etsgIsF3": "N", "printDiscount": true,
  "cashVAT": "N", "docbasetype": "ARI", "posted": "N", "selfService": false /* …and ~50 more… */
}
```
**Improve:** group the payload — `{ confirm: {…}, systemManaged: {…} }` — or expose a `neo_defaults(…, view:"minimal")` that returns only writable, non-system fields. Same data Holded gets for free because its `create_invoice` params *are* the short list.

**(b) Argument-name friction — the agent fails once before it learns the shape.**
`neo_selectors` returns exactly what you want — `{ id, label }`, searchable — but only after you learn the FK argument is called `column` (not `field`, not the FK's own name), and the failure message doesn't hint the correct key.
```jsonc
// ETENDO GO
neo_selectors({ spec:"sales-invoice", entity:"header", field:"businessPartner" })
// → Error: "Missing required argument: column"   ← agent must guess again
neo_selectors({ spec:"sales-invoice", entity:"header", column:"businessPartner", search:"" })
// → clean, exactly right:
{ "items": [ { "id":"203884…46", "label":"Juan Perez" }, { "id":"0ABDA2…11", "label":"Laura Morat" } ] }
```
**Improve:** accept `field` as an alias for `column`, and make the missing-arg error name the expected key (`"expected 'column'"`). Cheap, removes a guaranteed first-try failure.

**(c) Entity names have no convention across specs — the agent can't predict them.**
Holded's tool name *is* the operation (`create_invoice`). In Etendo GO the agent must know both the `spec` **and** its (unpredictable) entity name: `sales-order → header`, `payment-in → finPayment`, `financial-account → account` / `bankStatementLines`, others → `movement` / `internalConsumption`. There is no rule mapping spec → header-entity, so the agent must `discover`/`schema` every new spec just to learn what to call its root entity.
**Improve:** have `neo_discover` mark each spec's `primaryEntity` explicitly (derived from the existing parent/child hierarchy) so the agent never guesses — without renaming any entity. See IMP-9 for the concrete before/after.

### 7.9 The `docs` tool already fixes most of §7 — if the agent knows to call it first

The single biggest ease-of-use asset, under-credited until validated live: `docs(topic:"…")` is a **Context7-style semantic retrieval** over `etendo-go-docs`. It returns copy-paste-ready recipes — exact call sequences, the atomic `neo_batch` header+lines pattern with `parentRef`/`$ref`, FK resolution with `parentContext`, and confirm-before-action gating.
```jsonc
// ETENDO GO — docs(topic:"creating a sales invoice with lines") returns, among ~15 recipes:
{ "tool":"etendo_neo_batch", "arguments": { "operations": [
    { "id":"h1", "spec":"sales-order", "entity":"header", "body": { /* required FKs + dates */ } },
    { "id":"l1", "spec":"sales-order", "entity":"lines", "parentRef":"h1",
      "body": { "product":"<id>", "orderedQuantity":5, "unitPrice":12.50, "tax":"<id>" } }
] } }
```
This substantially neutralizes §7.1 (naming), §7.6 (action discovery) and §7.7 (call sequencing) — *for an agent that calls `docs` first.* Two problems keep it from paying off:
- **It isn't first-class.** Nothing in `neo_discover`/`neo_schema` points the agent to `docs`; a cold agent won't know the recipes exist. Holded ships the prose *inside every tool*, so there's nothing to discover.
- **Name drift.** The recipes reference `etendo_neo_create` / `etendo_neo_batch`, but the registered tools are `neo_create` / `neo_batch`. An agent copying a recipe verbatim calls a non-existent tool.

**Improve:** (1) surface a `docs` pointer in `neo_discover` output and in every not-found/validation error (`"see docs(topic:…)"`); (2) align the tool names in the docs corpus with the registered tool names. Together these turn an excellent-but-hidden asset into the default on-ramp.

---

## 8. Where Etendo GO Is Already Better Than Holded

1. **Runtime introspection & self-description.** `neo_discover` + `neo_schema` + `neo_defaults` + `neo_selectors` let an agent learn *any* entity — fields, required flags, computed defaults, valid FK values — at runtime. New windows appear **without any new tool**. Holded's surface is static and grows per feature.
2. **Uniform read/write on every entity.** `neo_get`/`neo_list` work on all 56 specs. Holded has no get/list for contacts or products — and its own `update_*` docs say *"first fetch the contact with GET"* while providing no GET tool.
3. **Agentic-safety semantics.** `neo_schema` flags `businessCritical` fields and instructs *"you MUST confirm these values with the user before creating or modifying records"*, plus `defaultHint`/`defaultSource` for server-resolved values. Holded has no equivalent guardrail.
4. **Callout-aware dependent selectors.** `neo_selectors` resolves valid values honoring business rules via `parentContext`/`recordContext` (e.g. line tax depends on `invoiceDate` + `priceList`).
5. **Readable FK labels inline.** List rows include `<fk>$_identifier` (e.g. `businessPartner$_identifier: "Juan Perez"`), so the agent gets human-readable references without extra lookups.
6. **True accounting engine.** Per-document double-entry (`accounting` on nearly every spec), GL journal, chart of accounts, fiscal calendar, period control, end-year-close, not-posted documents.
7. **EU/Spanish fiscal compliance.** SII, VeriFactu, TicketBAI/Batuz, Modelo tax report, real tax engine (intracomunitarias, retenciones, bienes de inversión). Holded taxes are flat percentages — disqualifying for regulated ES/EU use.
8. **Advanced inventory / costing / manufacturing**, **fixed assets & amortization**, **banking reconciliation / PSD2 / matching**, **structured returns/RMA** both directions.
9. **Generic batch & action** (`neo_batch`, `neo_action`) and **8 dedicated report generators** — extensibility and analytics without growing the tool surface.
10. **Semantic recipe retrieval (`docs`).** A Context7-style `docs(topic:…)` tool returns ready-to-run recipes (atomic batch header+lines, FK resolution, confirm-gated actions) from `etendo-go-docs`. Holded has no queryable recipe layer — its guidance is frozen into each tool's static description. (Caveat: today it's under-surfaced and the recipes use `etendo_neo_*` names vs the registered `neo_*` — see §7.9.)

**Example — read parity (where Holded has no tool at all):**
```jsonc
// "Show me contact X" / "show me product Y"
// HOLDED — no get_contact / get_product / list_contacts / list_products exist.
//          Ironically, update_contact's own docs say: "first fetch the contact with GET".
// ETENDO GO — uniform, works for every one of the 56 specs:
neo_get({ spec: "contacts", entity: "businessPartner", id: "…" })
neo_list({ spec: "product", entity: "product", filters: { name: "Widget" } })
```

**Example — agentic-safety guardrail (Etendo only):**
```jsonc
// neo_schema flags fields that must not be written blindly:
{ "name": "grandTotalAmount", "businessCritical": true }
// hint: "Fields with businessCritical=true carry core business data (amounts, categories,
//        key dates) — you MUST confirm these values with the user before creating or modifying records."
// Holded has no equivalent signal; the agent decides on its own what is safe to write.
```

---

## 9. Roadmap — Expose When the Functionality Ships

**Not current defects.** These are operational domains Holded already covers and that Etendo GO will expose in the MCP **as/when the corresponding product functionality lands in new versions.** Because the MCP is metadata-driven, most need **no new tools** — once the ERP exposes the window/spec it rides the existing `neo_*` verbs; the MCP work is confirming discoverability and adding semantic docs / dedicated actions.

| Capability | Trigger to expose in MCP | Suggested MCP shape |
|---|---|---|
| CRM — leads / funnels / pipeline stages | When the CRM/opportunity module ships | New spec(s) over generic verbs + a `set_pipeline`-style action |
| Projects & time tracking | When project management ships | `project` / `project-time` specs via generic verbs |
| HR — employees / contracts / time | When HR/payroll operational data is available | Extend `contacts`/`user` or new HR specs |
| Recurring documents & cashflow forecast | When recurring-doc & forecast engines are exposed | List/get verbs + a forecast report generator |
| Usage / account metering | When platform metering is exposed | Read-only platform verb |

---

## 10. Prioritized Recommendations (Etendo GO MCP)

### P1 — High impact, low/medium effort (DX parity on existing features — §7) — ✅ all DONE (ETP-4601)
- ✅ **Clean field/action names + per-field prose** in `neo_schema` (surface the `decisions.json` curation). [§7.1] — IMP-1
- ✅ **Business query semantics** on `neo_list` for high-traffic document specs (status, date/due ranges, operators). [§7.3] — IMP-3
- ✅ **Explicit not-found / structured validation errors** from `neo_get` and writes. [§7.5] — IMP-5
- ✅ **Make `docs` first-class + fix name drift** — point to it from `neo_discover` and every error, and align recipe tool names (`etendo_neo_*` → `neo_*`). Turns the best-but-hidden asset into the default on-ramp. [§7.9] — IMP-10

### P2 — Medium
- ✅ **Field projection / summary views** to cut response verbosity. [§7.2] — IMP-2 (ETP-4601)
- ✅ **Lean/grouped `neo_defaults`** — split `confirm` vs `systemManaged`, or a `view:"minimal"` returning only writable non-system fields. [§7.8a] — IMP-7 (ETP-4601)
- ✅ **Argument-name ergonomics** — `field` alias for `column`; missing-arg errors name the expected key. [§7.8b] — IMP-8 (ETP-4601)
- ⏳ **Human-friendly FK resolution** in `neo_create`/`neo_update` (accept names, resolve server-side). [§7.4] — IMP-4 (Wave 3, pending)
- ⏳ **Actions-only discovery view** in `neo_discover`/`neo_schema`. [§7.6] — IMP-6 (Wave 3, pending)
- ⏳ **Expose `primaryEntity` in `neo_discover`** — additive field derived from the existing entity hierarchy; no renaming. [§7.8c] — IMP-9 (Wave 3, pending)
- **PDF/print + attachment tools** (document delivery — currently absent).
- **Convenience lookups** (find-by-document-number) and **per-verb permission/role** in the schema.
- **Cursor pagination** alongside offset.

### P3 — Roadmap (expose as the ERP functionality ships — §9)
- CRM leads/funnels · projects & time tracking · HR/employees · recurring documents & cashflow forecast · usage metering.

---

## 11. Validation Evidence (live calls)

| # | Call | MCP | Result / finding |
|---|---|---|---|
| 1 | `list_taxes` | Holded | 8 flat percentage taxes (sales/purchases/employees) |
| 2 | `list_invoices` | Holded | cursor-paginated; documented `status`/date filters; inline payment summary |
| 3 | `get_invoice(bad id)` | Holded | HTTP 404 **RFC-7807 problem details** (structured error) |
| 4 | catalog scan | Holded | contacts & products have create/update/delete but **no get/list**; `update_*` docs tell agent to "GET first" with no GET tool |
| 5 | create/update schemas | Holded | rich prose per field; **tax accepted by name or key, auto-resolved** |
| 6 | `neo_discover` | Etendo GO | 56 specs (48 windows + 8 reports) with entities & methods |
| 7 | `neo_list tax/tax` | Etendo GO | Spanish fiscal tax rates (intracomunitarias, bienes de inversión, retenciones) w/ `validFrom` |
| 8 | `neo_schema sales-order/header` | Etendo GO | 97 fields; **actions discoverable** (`action`+`processName`+`processId`); `businessCritical` + confirm-with-user hint; **cryptic AD field labels** |
| 9 | `neo_list sales-invoice/header` | Etendo GO | ~60 fields/row (verbose), `$_identifier` labels, `outstandingAmount`/`eTGODueDate` inline, equality-only filters |
| 10 | `neo_get(bad id)` | Etendo GO | `{data:[], status:0}` — **ambiguous not-found** (reads as success) |
| 11 | `neo_defaults sales-invoice/header` | Etendo GO | near-complete draft, `unresolvedFields:[]` (**strength**) but **~70 fields**, ~65 compliance/system noise |
| 12 | `neo_selectors sales-invoice/header businessPartner` | Etendo GO | clean `{id,label}` searchable — but **failed first try**: arg is `column`, not `field`, error didn't name the key |
| 13 | `docs(topic:"create sales invoice with lines")` | Etendo GO | **Context7-style recipes** (atomic batch, FK resolution, confirm-gating) — but not first-class & recipes use `etendo_neo_*` vs registered `neo_*` |
| 14 | entity-name scan across specs | Etendo GO | no convention: `header` / `finPayment` / `account` / `movement` / `internalConsumption` — agent must `discover` per spec |

---

## 12. Improvement Backlog for Etendo GO — Before / After

Concrete, implementable improvements ordered by impact. Each item shows the **current** call + real response and the **proposed** call + target response, states explicitly whether the tool signature changes, **and names the repo(s) it touches.**

> **Repo picture:** the MCP is the Java servlet in **`com.etendoerp.go`** (`src/com/etendoerp/go/mcp/`), which serves responses from the `ETGO_SF_*` tables. Because every improvement here is about how that servlet *shapes requests/responses*, **8 of 10 are servlet-only in `com.etendoerp.go`.** Two are not: **IMP-10** also touches the recipe corpus in **`etendo-go-docs`**, and **IMP-1** *may* also need **`schema_forge_core`** (`push-to-neo`) if the curated label/description is not already stored in `ETGO_SF_FIELD`. No change here touches this `schema_forge` repo.
 `BEFORE` blocks are verbatim from the live calls in §11; `AFTER` blocks are the target we are proposing. Tick them off as they land.

Legend: **⚙️ Signature change** = the tool's arguments/name change · **♻️ Same call** = same arguments, richer/leaner response only.

---

### IMP-1 · Clean field names + per-field prose in `neo_schema` — ✅ DONE (ETP-4601, Wave 1)
**Priority: P1** · ref §7.1 · **Repo(s): `com.etendoerp.go` (MCP servlet emits it)** — *and* `schema_forge_core` (`push-to-neo`) **only if** the curated label/description is not already stored in `ETGO_SF_FIELD`. Verify the table first: if the data is there, this is servlet-only; if not, it's a two-repo change (push the curated text → emit it).

The call stays identical; only the per-field payload gains a clean `label` and a `description`.

```jsonc
// BEFORE — neo_schema({ spec:"sales-order", entity:"header" }) — verbatim field entries
{ "name": "eTPRRemovePayment",   "column": "EM_Etpr_Remove_Payment", "label": "EM_ETPR_Remove Payment", "type": "button" }
{ "name": "stDimension",         "column": "User1_ID",               "label": "1st Dimension",          "type": "foreignKey" }
{ "name": "aeatsiiDescripcionSii","column":"EM_Aeatsii_Descripcion_Sii","label":"EM_Aeatsii_Descripcion_Sii","type":"string" }

// AFTER — same call, curated label + one-line description surfaced from decisions.json
{ "name": "removePaymentOnReactivate", "column": "EM_Etpr_Remove_Payment", "label": "Remove Payment on Reactivate",
  "description": "When reactivating a completed document, also unlink its payment plan.", "type": "button" }
{ "name": "costCenter", "column": "User1_ID", "label": "Cost Center",
  "description": "Accounting dimension 1 — used for cost-center reporting.", "type": "foreignKey" }
{ "name": "siiDescription", "column": "EM_Aeatsii_Descripcion_Sii", "label": "SII Description",
  "description": "Free-text description reported to the Spanish SII tax authority.", "type": "string" }
```
**Done when:** ~~no field in a curated spec exposes a raw `EM_*`/`User1_ID`-style label, and every writable field has a non-empty `description`~~ ✅ — curated, localized AD_Field labels + one-line descriptions are surfaced in `neo_schema` (`McpSchemaFieldBuilder`, ETP-4601).

---

### IMP-2 · Field projection / summary view on `neo_list` & `neo_get` — ✅ DONE (ETP-4601, Wave 2)
**Priority: P2** · ref §7.2 · **Repo: `com.etendoerp.go` (MCP servlet)**

Add an optional `fields` (projection) parameter and/or a `view:"summary"`. Omitting it keeps today's full behavior (backward compatible).

```jsonc
// BEFORE — neo_list({ spec:"sales-invoice", entity:"header" }) → ~60 fields per row
{ "documentNo": "10000014", "businessPartner$_identifier": "Juan Perez", "invoiceDate": "2026-04-16",
  "grandTotalAmount": 1355.2, "outstandingAmount": 355.2, "paymentComplete": false,
  "aeatsiiClaveTipo": null, "aeatsiiEstado": "PE", "etvfacInvType": "F1", "etvfacSimpinvart7273": false,
  "eTGOCurrencyRate": null, "etgoTotalDiscount": null, "_computedColumns": "…" /* …~50 more… */ }

// AFTER — new optional arg; response carries only what was asked
neo_list({ spec:"sales-invoice", entity:"header", fields:["documentNo","businessPartner","invoiceDate","grandTotalAmount","outstandingAmount"] })
{ "documentNo": "10000014", "businessPartner$_identifier": "Juan Perez", "invoiceDate": "2026-04-16",
  "grandTotalAmount": 1355.2, "outstandingAmount": 355.2 }

// AFTER (alt) — curated summary view, no field list needed
neo_list({ spec:"sales-invoice", entity:"header", view:"summary" })
```
**Done when:** ~~an agent can retrieve a document list with ≤8 fields/row without post-filtering, and the default (no `fields`) still returns everything~~ ✅ — `fields` projection + `view:"summary"` (driven by `businessCritical`) implemented in `McpFieldProjection`; default (no `fields`/`view`) returns everything (ETP-4601).

---

### IMP-3 · Business query semantics on `neo_list` — ✅ DONE (ETP-4601, Wave 2 · config-driven)
**Priority: P1** · ref §7.3 · **Repo: `com.etendoerp.go` (MCP servlet) + `schema_forge` (authoring) + `schema_forge_core` (pipeline)**

Business filters (named statuses, date/range operators) for high-traffic document specs. Generic `key=value` still works. **Delivered as hand-authored, per-spec config** rather than hardcoded invoice logic — each spec authors its own named statuses in `decisions.json → entities.{name}.namedFilters` (an HQL `where` fragment per name), which flow through the contract and `push-to-neo` into `ETGO_SF_ENTITY.NAMED_FILTERS`; the MCP reads them, exposes them in `neo_schema`, and applies the matching fragment. See `docs/decisions-reference.md → Named Filters`.

```jsonc
// BEFORE — "which invoices are overdue?" — no "overdue" concept; pull + reason client-side
neo_list({ spec:"sales-invoice", entity:"header", filters:{ paymentComplete:false } })
// → agent must keep rows where outstandingAmount>0 AND eTGODueDate<today, paginating manually

// AFTER — business concept is native and spec-authored; one call returns exactly the set
neo_list({ spec:"sales-invoice", entity:"header", filters:{ status:"pending" } })
// discover the available statuses per spec (name/label/description, never the where):
neo_schema({ spec:"sales-invoice", entity:"header" })  // → { namedFilters: [ {completed}, {pending}, {partial} ], ... }
// unknown name → clean handled error with the valid list, not a 500:
neo_list({ ..., filters:{ status:"overdue" } })  // → "Unknown status 'overdue'... Available: completed, pending, partial"
// explicit range operators also honored:
neo_list({ spec:"sales-invoice", entity:"header", filters:{ outstandingAmount:{ gt:0 } } })
```
**Done when:** ~~named statuses + range operators documented and honored~~ ✅ — named statuses are **authored per spec** (`completed`/`pending`/`partial` on `sales-invoice`/`purchase-invoice`) and range operators (`gt/lt/gte/lte/between`) are honored; verified live against the running MCP. **`overdue` is intentionally not offered** on the invoice header — it would require a filter over the computed `eTGODueDate` column (unqueryable in HQL; the original source of the live HTTP 500). Overdue-by-date needs a payment-schedule subquery — out of scope for Wave 2.

---

### IMP-4 · Human-friendly FK resolution in `neo_create`/`neo_update` — ⚙️ Signature change (accepts name or id)
**Priority: P2** · ref §7.4 · **Repo: `com.etendoerp.go` (MCP servlet — reuses existing selector logic server-side)**

Let FK fields accept a search string; resolve server-side, fall back to `neo_selectors` only when ambiguous. Passing a 32-char id still works.

```jsonc
// BEFORE — 2 calls: resolve the FK id, then create with the 32-char id
neo_selectors({ spec:"tax", entity:"tax", column:"tax", query:"21" })
// → [{ id:"FFA767684E234FCFB8A1CA24459B934B", name:"IVA 21% ..." }, …]
neo_create({ spec:"product", entity:"product", data:{ name:"Widget", tax:"FFA767684E234FCFB8A1CA24459B934B" } })

// AFTER — 1 call: pass the human name, server resolves it
neo_create({ spec:"product", entity:"product", data:{ name:"Widget", tax:"IVA 21%" } })
// → 200 OK, or if ambiguous: { error:"ambiguous_fk", field:"tax", candidates:[{id,label},…] }
```
**Done when:** a create/update with a human-readable FK value succeeds in one call, and ambiguity returns a structured candidate list instead of failing blindly.

---

### IMP-5 · Explicit not-found + structured validation errors — ✅ DONE (ETP-4601, Wave 1)
**Priority: P1** · ref §7.5 · **Repo: `com.etendoerp.go` (MCP servlet)**

The happy path is unchanged; not-found and validation failures return an unambiguous error object instead of a success-looking empty result.

```jsonc
// BEFORE — neo_get(sales-invoice, header, "NONEXISTENT123") → looks like success
{ "response": { "data": [], "status": 0 } }

// AFTER — unambiguous, machine-detectable not-found
{ "response": { "status": 404, "error": "not_found",
                "detail": "No sales-invoice/header with id NONEXISTENT123" } }

// AFTER — write validation failure names the offending field(s)
neo_create({ spec:"sales-invoice", entity:"header", data:{ /* missing businessPartner */ } })
{ "response": { "status": 422, "error": "validation_error",
                "fields": [ { "name":"businessPartner", "message":"required" } ] } }
```
**Done when:** ~~an agent can distinguish "not found" from "empty match" and "invalid write" from "server error" purely from the response, without heuristics~~ ✅ — structured `{status:404, error:"not_found", detail:…}` implemented (`McpConstants`, `McpToolRouterSupport`, ETP-4601).

---

### IMP-6 · Actions-only discovery view — ⚙️ Signature change (additive mode)
**Priority: P2** · ref §7.6 · **Repo: `com.etendoerp.go` (MCP servlet)**

Add an actions-only projection so the agent lists callable actions without fetching the full 97-field schema.

```jsonc
// BEFORE — to find "how do I complete this order?" the agent fetches the whole schema
neo_schema({ spec:"sales-order", entity:"header" })   // → 97 fields, buttons buried among data fields

// AFTER — a focused actions view
neo_schema({ spec:"sales-order", entity:"header", view:"actions" })
{ "actions": [
    { "name":"DocAction", "label":"Process Order", "invokeVia":"neo_action",
      "parameters":{ "docAction":{ "type":"list", "values":{ "CO":"Complete","VO":"Void","CL":"Close" } } } }
] }
```
**Done when:** `neo_discover`/`neo_schema` can return the callable actions of a spec (name + params + human labels) without the field dump.

---

### IMP-7 · Lean / grouped `neo_defaults` — ✅ DONE (ETP-4601, Wave 2)
**Priority: P2** · ref §7.8a · **Repo: `com.etendoerp.go` (MCP servlet)**

`neo_defaults` already pre-fills everything (`unresolvedFields:[]`, a strength). Add grouping / a `view:"minimal"` so the agent sees the ~5 fields that matter, not ~65 compliance flags. Default (no `view`) stays as-is.

```jsonc
// BEFORE — neo_defaults(sales-invoice, header) → ~70 keys, ~65 of them compliance/system noise
{ "invoiceDate":"21-07-2026", "paymentTerms$_identifier":"30 Días", "currency$_identifier":"EUR",
  "documentAction":"CO", "aeatsiiIssent":false, "aeatsiiClaveTipo":"F1", "tbaiVoidxmlgenerator":"N",
  "etvfacSentToVerifac":"N", "etblkpBulkposting":"N", "docbasetype":"ARI", /* …~60 more… */ }

// AFTER — grouped payload separates what the agent reasons about from what the server manages
{ "confirm": {
    "invoiceDate":"21-07-2026", "paymentTerms$_identifier":"30 Días",
    "priceList$_identifier":"Lista de venta (sin impuestos)", "currency$_identifier":"EUR", "documentAction":"CO" },
  "systemManaged": { "aeatsiiIssent":false, "tbaiVoidxmlgenerator":"N", "docbasetype":"ARI", /* … */ },
  "metadata": { "unresolvedFields": [] } }

// AFTER (alt) — neo_defaults(sales-invoice, header, view:"minimal") → only the `confirm` block
```
**Done when:** ~~an agent can obtain the writable, non-system defaults of a spec without visually filtering compliance flags~~ ✅ — grouped `confirm`/`systemManaged` payload + `view:"minimal"` implemented (`McpDefaultsView`); default view unchanged (ETP-4601).

---

### IMP-8 · Argument-name ergonomics on `neo_selectors` — ✅ DONE (ETP-4601, Wave 1)
**Priority: P2 (cheap)** · ref §7.8b · **Repo: `com.etendoerp.go` (MCP servlet)**

Accept `field` as an alias for `column`, and make the missing-argument error name the expected key. Removes a guaranteed first-try failure.

```jsonc
// BEFORE — natural first attempt fails, error doesn't say what to use instead
neo_selectors({ spec:"sales-invoice", entity:"header", field:"businessPartner" })
// → Error: "Missing required argument: column"

// AFTER — alias accepted (works), OR the error is self-correcting
neo_selectors({ spec:"sales-invoice", entity:"header", field:"businessPartner", search:"" })
// → { items:[ { id:"203884…46", label:"Juan Perez" }, … ] }
// AFTER (if alias not added) — error names the key:
// → Error: "Missing required argument: 'column' (the FK field name, e.g. \"businessPartner\"). Did you mean column: \"businessPartner\"?"
```
**Done when:** ~~the natural first call shape succeeds, or the error message alone is enough to fix the call without guessing~~ ✅ — `field` accepted as an alias for `column` and the missing-argument error self-corrects (`McpToolRouter`, `McpConstants.PARAM_FIELD`, ETP-4601).

---

### IMP-9 · Expose `primaryEntity` in `neo_discover` — ⚙️ Signature change (additive field, non-breaking)
**Priority: P2** · ref §7.8c · **Repo: `com.etendoerp.go` (MCP servlet only)**

**Approach chosen: expose the root, do not rename anything.** Entity names stay exactly as they are today (`header`, `finPayment`, `account`, …) — nothing in the `ETGO_SF_*` tables or `push-to-neo` changes, so no integration breaks. The servlet simply **adds one field, `primaryEntity`, to each spec in the `neo_discover` response**, so the agent no longer has to call `neo_schema` on every entity just to learn which one is the root to create first.

**How the servlet derives it (no new data needed):** the parent/child hierarchy already exists in `ETGO_SF_ENTITY` — child entities (`lines`, `finPaymentScheduleDetail`, `bankStatementLines`) carry a parent FK to their header. The servlet computes `primaryEntity` = **the entity with no parent** (the top of the hierarchy) when building the discover response. Pure read-side derivation over data that is already there.

```jsonc
// BEFORE — neo_discover() lists entities, but no rule says which is the root; names vary per spec
{ "spec":"sales-order",       "entities":["header","lines"] }
{ "spec":"payment-in",        "entities":["finPayment","finPaymentScheduleDetail"] }
{ "spec":"financial-account", "entities":["account","bankStatementLines"] }
// → agent must call neo_schema on each entity to learn what to create first

// AFTER — servlet adds primaryEntity (derived from the existing parent/child hierarchy).
//         Entity names are UNCHANGED; the new field is purely additive.
{ "spec":"sales-order",       "primaryEntity":"header",     "entities":["header","lines"] }
{ "spec":"payment-in",        "primaryEntity":"finPayment", "entities":["finPayment","finPaymentScheduleDetail"] }
{ "spec":"financial-account", "primaryEntity":"account",    "entities":["account","bankStatementLines"] }
```

> **Not done:** renaming entities to a single convention (e.g. always `header`) was rejected — it would touch `schema_forge_core`/`push-to-neo` and **break every existing call** that uses the current names (`finPayment`, `account`, …). `primaryEntity` gives the agent the same benefit with zero breakage and zero work outside the servlet.

**Done when:** an agent can determine a spec's root entity from the `neo_discover` response alone, without a follow-up `neo_schema`, and no existing entity name has changed.

---

### IMP-10 · Make `docs` first-class + fix name drift — ✅ DONE (ETP-4601, Wave 1)
**Priority: P1 (highest leverage)** · ref §7.9 · **Repo(s): `com.etendoerp.go`** (servlet adds the `docs` pointer to `neo_discover` + error objects) **AND `etendo-go-docs`** (`github.com/etendosoftware/etendo-go-docs` — fix the recipe corpus: `etendo_neo_*` → `neo_*`). Two repos, no Schema Forge.

The `docs` tool already returns excellent recipes — the fix is to *point the agent to it* and to align the tool names inside the corpus.

```jsonc
// BEFORE — nothing routes the agent to docs; recipes reference non-existent tool names
docs({ topic:"creating a sales invoice with lines" })
// → recipe uses "etendo_neo_batch" / "etendo_neo_create"  ← registered tools are neo_batch / neo_create
//   and neither neo_discover nor any error mentions that docs exists

// AFTER — discover advertises docs; errors point to it; recipes use the real tool names
neo_discover()
// → { …, "guidance": { "tool":"docs", "hint":"Call docs(topic:…) for ready-to-run recipes per task." } }
neo_get(bad id)
// → { status:404, error:"not_found", "seeAlso":"docs(topic:\"reading records\")" }
docs({ topic:"creating a sales invoice with lines" })
// → recipe now uses "neo_batch" / "neo_create" verbatim-runnable
```
**Done when:** ~~a cold agent is routed to `docs` from `neo_discover`/errors, and every recipe in the corpus uses the registered `neo_*` tool names~~ ✅ — `neo_discover` guidance + error `seeAlso` point to `docs`; corpus tool names aligned to `neo_*` (ETP-4601).

---

### Prioritized rollout — what to take first

Ranked into three waves. The ordering weighs **leverage** (how many agent failures it removes), **risk** (breaking vs additive vs same-call), and **dependencies** (some items make later ones cheaper). Take the waves in order; within a wave, items are independent and can be parallelized.

#### 🟢 Wave 1 — ✅ DONE (ETP-4601) — the three ♻️ same-call items plus the cheapest quick win
**All four shipped under ETP-4601 (commit `b58e293c`).** No breaking changes to existing integrations.

| Order | # | Improvement | Repo(s) | Status / Why first |
|---|---|---|---|---|
| 1 | **IMP-10** ✅ | `docs` first-class + name drift | `com.etendoerp.go` + `etendo-go-docs` | **DONE.** `neo_discover` guidance + error `seeAlso` route cold agents to `docs`; corpus tool names aligned to `neo_*`. Highest leverage, lowest cost. |
| 2 | **IMP-5** ✅ | Explicit not-found / validation errors | `com.etendoerp.go` | **DONE.** Structured `{status:404, error:"not_found", detail:…}` (see `McpConstants`/`McpToolRouterSupport`); an agent can now tell failure from empty match. Prerequisite for IMP-10's `seeAlso` pointers. |
| 3 | **IMP-1** ✅ | Clean names + prose in `neo_schema` | `com.etendoerp.go` | **DONE.** Curated, localized AD_Field labels + one-line descriptions surfaced in `neo_schema` (`McpSchemaFieldBuilder`). |
| 4 | **IMP-8** ✅ | `neo_selectors` arg alias + error | `com.etendoerp.go` | **DONE.** `field` accepted as alias for `column` (`McpToolRouter` L619), missing-arg error self-corrects. |

#### 🟡 Wave 2 — ✅ DONE (ETP-4601) — high-value read/create ergonomics (additive)
**All three shipped under ETP-4601** (`c5b51c1f`). Signature changes are additive (omitting the new arg preserves today's behavior).

| Order | # | Improvement | Repo(s) | Status / Why next |
|---|---|---|---|---|
| 5 | **IMP-3** ✅ | Business query semantics on `neo_list` (config-driven) | `com.etendoerp.go` + `schema_forge` + `schema_forge_core` | **DONE.** Collapses the most common multi-step read into one call. Delivered as per-spec hand-authored `namedFilters` (see IMP-3 detail above). |
| 6 | **IMP-7** ✅ | Lean/grouped `neo_defaults` | `com.etendoerp.go` | **DONE.** `view:"minimal"`/grouped `confirm`+`systemManaged` payload (`McpDefaultsView`); default (no `view`) unchanged. |
| 7 | **IMP-2** ✅ | Field projection / summary view | `com.etendoerp.go` | **DONE.** `fields` projection + `view:"summary"` from `businessCritical` (`McpFieldProjection`); default returns everything. |

#### 🔵 Wave 3 — ⏳ PENDING — deeper convenience (P2, some breaking-ish, sequence last)
Waves 1 & 2 are done (ETP-4601); this is the only remaining wave. Valuable but either higher effort or best done once the foundations above are in place.

| Order | # | Improvement | Repo(s) | Why last |
|---|---|---|---|---|
| 8 | **IMP-4** | Human-friendly FK resolution | `com.etendoerp.go` | Removes a round-trip per FK, but reuses selector logic server-side — build it after IMP-8 has settled the selector arg shape. |
| 9 | **IMP-6** | Actions-only discovery view | `com.etendoerp.go` | Nice-to-have once IMP-10 already routes agents to action recipes via `docs`. |
| 10 | **IMP-9** | Expose `primaryEntity` in `neo_discover` | `com.etendoerp.go` | Additive field derived from the existing entity hierarchy; no renaming, no breakage. Lowest per-call impact (one lookup saved per new spec); safe to defer. |

**Status (2026-08-03):** Waves 1 & 2 (IMP-1, IMP-2, IMP-3, IMP-5, IMP-7, IMP-8, IMP-10 — 7 of 10) shipped under **ETP-4601**. Only **Wave 3** (IMP-4, IMP-6, IMP-9) remains. Those two same-call foundations (IMP-10 + IMP-5) that removed most of the "why did the agent get stuck?" failures are already live.
