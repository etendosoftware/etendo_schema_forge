# MCP usage telemetry — batch 2 review (ETP-5852)

Second review of production `ETGO_MCP_USAGE`, exported on 26/10/2026. It covers everything that
was pending since batch 1 ([2026-09-18-mcp-usage-batch-1-fixes.md](2026-09-18-mcp-usage-batch-1-fixes.md)).

## What changed in the tooling

- **The review marker is now `Status`.** `scripts/mcp-usage-dump.sh` reads `Status IS NULL` as
  pending, and `--mark-reviewed` writes `Status = 'R'` and `Reviewed_By = <name>`. These are the
  ETP-5594 columns, and `--reviewer` is now required. The script no longer reads or writes
  `isactive`. In make: `make mcp-usage PROFILE=production MARK_REVIEWED=1 REVIEWER="Name"`.
- **Batch 1 was migrated in place.** Its 661 production rows (`isactive = 'N'`) were set to
  `Status = 'R'` and `Reviewed_By = 'Valentin Vivaldi'`, then reactivated (`isactive = 'Y'`).
  No row in the table now uses `isactive` as a review flag.
- **This batch was exported and marked in one statement:** 345 feedback rows and 13,634
  tool calls. The exported file is gitignored, like every dump.
- **Next review:** run `make mcp-usage PROFILE=production MARK_REVIEWED=1 REVIEWER="Name"` with
  no `SINCE`. It returns exactly what nobody has reviewed yet, whatever its age.

## Batch at a glance

| | production |
|---|---|
| Window | 18/09 – 26/10 (5.5 weeks; no review in between) |
| Rows | 13,979 (13,634 tool calls + 345 feedback) |
| Sessions / tenants | 783 / 24 |
| Tool-call errors | 1,136 (8.3 %) |
| Feedback outcome | 210 OKAY · 104 MIXED · 30 ERROR · 1 rejected call |
| Feedback sources | Agroquímicos SA 235, System 51, one internal tenant 44, others ≤ 3 |

Weekly trend, computed on the live `etendo` database. The week of 26/10 is partial:

| Week of | Tool calls | Errors | Error % | Feedback | Sessions | Tenants |
|---|---:|---:|---:|---:|---:|---:|
| 14/09 (batch 1) | 657 | 39 | 5.9 | 7 | 7 | 2 |
| 21/09 | 1,856 | 307 | 16.5 | 31 | 81 | 5 |
| 28/09 | 3,014 | 254 | 8.4 | 28 | 270 | 6 |
| 05/10 | 3,957 | 259 | 6.5 | 207 | 262 | 11 |
| 12/10 | 685 | 36 | 5.3 | 21 | 26 | 7 |
| 19/10 | 3,638 | 231 | 6.3 | 57 | 92 | 11 |
| 26/10 (partial) | 562 | 56 | 10.0 | 1 | 65 | 5 |

The error rate fell from 16.5 % in the first full week to about 6 % from October on, while
volume and the number of tenants grew. The feedback spike in the week of 05/10 (207 reports)
comes almost entirely from one tenant's agent, which filed a report after every task.

Top tool-call error codes: `not_found` 329, `validation_error` 294, no code 144, `forbidden` 92,
`read_only_field` 71, `unknown_filter_field` 43, `parent_required` 39, `unknown_argument` 24,
`server_error` 19, `method_not_allowed` 19, `view_required` 17.

## How it was triaged

1. **Per report.** Each of the 345 feedbacks was read in full, together with the failed calls
   of its own session. The reports produced 1,034 distinct problem statements, classified as
   CODE, METADATA, DOCS, GAP (the UI can do it, the MCP cannot) or NOISE. Every feedback id
   is accounted for.
2. **Per root cause.** The statements were grouped into 248 issues: 88 GAP, 75 METADATA,
   53 CODE, 22 DOCS and 10 NOISE. 151 of them come from a single report.
3. **Verified live.** 56 issues were checked against a local environment running
   `com.etendoerp.go` `origin/develop` through its MCP endpoint. These are the 40 CODE/METADATA
   issues with at least 3 reports and the 16 GAPs with at least 5.

As in batch 1, the telemetry says what happened, not what is still true. Of the 56 issues
checked, 19 no longer reproduce on develop.

Kinds: **CODE** means the server behaves wrongly. **METADATA** means the server works as
designed, but what it advertises misleads the agent. **GAP** means the UI can do it and the
MCP cannot. **DOCS** means the information exists nowhere the agent can reach.

---

## 1. Reproduced on develop — fix

| Key | Kind | Reports | Issue | Evidence on develop | Fix / where |
|---|---|---:|---|---|---|
| M-14 | CODE | 18 | Empty stock result does not tell "no stock" from "unknown product/warehouse" | `generate_inventory_stock_report` with a non-existent product id and with a non-existent warehouse id both return `{data:[],count:0}` | Validate the requested ids in `InventoryStockReportHandler` and return a status per filter (`found` / `noStock` / `notFound`) |
| M-7 | METADATA | 17 | `includeZeroStock:true` still omits products with no storage/transaction rows | Fresh product, report with `includeZeroStock:true` → `{data:[],count:0}` | `InventoryStockReportHandler`: emit an explicit zero row for each requested product even without history |
| M-12 | METADATA | 15 | Invoice defaults ignore the partner's payment terms/method | `etendo_defaults(sales-invoice/header, recordContext:{businessPartner})` returns the generic terms; that partner's invoices use a different term | Apply partner (and source order/receipt) precedence in the invoice defaults (`McpDefaultsView` context → header defaults) |
| M-9 | CODE | 14 | Order lines keep `grossUnitPrice` / `lineGrossAmount` at 0 | Seed purchase-order line: `lineNetAmount:1089`, `grossUnitPrice:0`, `lineGrossAmount:0` with VAT set | Recompute gross unit/line amounts on line create/update; cover sales and purchase |
| M-22 | CODE | 12 | `product/stock` list returns `{response:{data…}}` instead of the standard list envelope | `etendo_list(product, stock, parentId)` → nested `response` object | `ProductHandlerUtils` (used by `ProductStockWarehouseHandler`): return the canonical envelope |
| M-8 | GAP | 24 | No partial-text operator on list filters (`contains`) | `filters:{description:{contains:…}}` → 422 `unknown_filter_field`; only `gt,gte,lt,lte,between` | Add an escaped, documented `contains`/`iContains` for string fields in the `etendo_list` filter parser |
| M-39 | GAP | 7 | No set operator (`in`) on list filters | `filters:{searchKey:{in:[…]}}` → 422 `Unknown filter operator 'in'` | Same parser: add `in` for scalar fields |
| M-44 | METADATA | 4 | Invoice line `view:create` says prices are optional; `view:full` says they are user-required | `required:[]` and `unitPrice` `serverDefaulted` in create; `required:true, userRequired:true` in full (sales and purchase) | Align both views and say in `decisions.json` (sales-invoice, purchase-invoice) what the caller sends and what is derived |
| M-42 | METADATA | 4 | Widget results have no as-of time / freshness | `etendo_widget(kpis)` and `pending-tasks` carry no `measuredAt` or as-of field | `McpWidgetHandler`: add as-of / freshness metadata to every widget response |
| M-54 | METADATA | 3 | Period control returns raw `openClose`/`status` codes with no meaning | `etendo_list(open-close-period-control, periodControl)` → `openClose:"O"`, `status:"N"`, no labels | `artifacts/open-close-period-control/decisions.json`: describe the codes and which field governs posting |
| M-57 | CODE | 3 | `payment-out/header.documentType` selector returns nothing | `etendo_selectors(...)` → `items:[]` | Pass the receipt direction (`IsReceipt=false`) into the selector context. The invoice-owned creation route stays as it is |
| M-76 | CODE | 3 | `etendo_get` wraps the single record in `data:[…]` | `etendo_get(product, product, id)` → `{data:[{…}]}` | Return one object, or document the array envelope consistently across specs |

**Partially reproduced: the reported core is fixed, but a smaller defect remains.**

| Key | Reports | Still wrong on develop | Fix |
|---|---:|---|---|
| M-1 | 83 | `financial-account` `listMovements` takes no parameters (`limit`/`fromDate` rejected) and returns no paging or truncation metadata. Large-list truncation could not be exercised on the seed | Add date/row bounds and continuation metadata to `FinancialAccountMovementActions`. Re-test truncation on a tenant with volume |
| M-2 | 54 | Shipment **detail** returns `linkedInvoices`; the shipment **list** returns `invoice:null` with `invoiced:true` | Expose `linkedInvoices` (or the first invoice) on the list projection of `GoodsShipmentHeaderHandler` |
| M-11 | 16 | `documentAction` has labeled values; `documentStatus` has no code → label options | Add status options to the sales-order header field metadata |
| M-29 | 9 | `etblkpAccountingstatus` is returned as an opaque code | Add a label/description in the payment-in/out field metadata |
| M-30 | 9 | `eTGOStock` / `eTGOCost` are read-only with no description of what they mean | Field descriptions in `artifacts/product/decisions.json` |
| M-38 | 5 | Invalid `range` silently falls back to 12 months; KPI labels omit the period | Reject unknown ranges and put the period in the KPI label (`McpWidgetHandler`) |
| M-24 | 5 | `pending-amounts` carries no as-of date, no overdue/current split and no credit-note note | Add the definitions to the response; verify VAT and netting with paired records before changing numbers |
| M-36 | 5 | Aging reports have no cross-partner total per bucket | Add a totals row per bucket to `AgingReportHandler` |
| M-51 | 5 | `etendo_get(sales-invoice, header, <AP invoice id>)` succeeds and returns the purchase invoice | Refuse or redirect wrong-direction reads, and return the canonical spec |
| M-33 | 6 | Shipment lines link `salesOrderLine` but expose no price/amount | Add the persisted price/amount, or say where to read it |

## 2. Capability gaps confirmed

| Key | Reports | Gap | Note |
|---|---:|---|---|
| M-6 | 20 | No canonical/duplicate relation between products with the same name | Decide whether this is product data hygiene (a tenant problem) or an MCP field |
| M-13 | 13 | `sales-order/lines` is parent-scoped; there is no cross-order line query | Same root as M-28 and M-46: a global line read filtered by product |
| M-28 | 7 | Sales-order lines expose no stock/availability | Point to `product/stock` or the inventory report in the line's agentPrompt |
| M-23 | 8 | Shipment/receipt lines expose no lot/expiry fields | Needed for traceability tenants; check the attribute-set support first |

## 3. Already fixed on develop — close

| Key | Reports | Reported | Develop today |
|---|---:|---|---|
| M-4 | 47 | Payment actions on invoices undiscoverable | `registerPayment` and its siblings are listed by `etendo_discover` with full parameters; only catalog paging is left (see M-5) |
| M-5 | 45 | Entity names undiscoverable | Per-spec `etendo_discover` returns real entity and action names; catalog-wide paging is not verified |
| M-3 | 48 | Valid fields reported in `unknownFields` | Only the bogus field is reported (ETP-5714) |
| M-18 | 10 | `hasLinkedDocuments` not projectable | Projectable |
| M-16, M-32 | 7, 4 | Invoice-from-receipt produced a *sales* invoice | `createPurchaseInvoice` is exposed; the classic action is non-invokable and says so |
| M-19 | 9 | Shipment completion not invokable | `documentAction` with `docAction:"CO"` is declared and invokable |
| M-20 | 9 | Payment action schema lacked semantics | Parameters, enums and the return payload are documented |
| M-21, M-26 | 6, 7 | Inapplicable actions reported success | Legacy action → 405 "Nothing was run"; state-aware guidance in place |
| M-25, M-60 | 5, 5 | No return-to-vendor from receipt lines; currency deadlock on create | `availableReceipts` / `importReceiptLines` work; currency is server-defaulted |
| M-17 | 10 | Payment status ambiguous | `paymentComplete` and `outstandingAmount` exposed |
| M-15 | 16 | Stock only one product per call | The inventory report accepts several product ids |
| M-27, M-40, M-45, M-53, M-63 | 7, 5, 4, 7, 3 | Tax on PO lines, sale vs purchase prices, posted flag, per-warehouse stock, GET envelope on receipts | Correct on develop |

## 4. Could not be decided on the local seed

M-31 (date defaults: tenant date vs. machine date), M-47 (purchase-order discount
recalculation), M-55 (journal/ledger vs. UI), M-72 (product deactivation blocker message),
M-10 and M-56 (partner-specific defaults; country label on writes), M-50 (due-date range
filters), M-64 (supplier reference field), M-52 (vector search: the local env has no
embedding key). Each needs a tenant with the right data, or a controlled record created for
the test.

## 5. Out of scope / noise

- **M-48, M-74:** these are reports about another MCP server (*Fyso Business*: `crear_solicitud`,
  `buscar_contexto`) that an agent used in the same session. They are not about Etendo.
- **NOISE (10 issues):** agent mistakes it recovered from, business-rule refusals that work as
  designed (for example, cancelling a processed document), duplicate test reports, and one
  `etendo_feedback` call rejected by validation. The reason for each is recorded with the
  issue in the gitignored master list.

## Actions for this week

All fixes below ship under **ETP-5852** (this review's ticket). No separate tickets are opened.

1. **Stock report contract** (M-14, M-7): distinguish not-found from zero, and emit zero rows
   for requested products. Together they cover 35 reports, all from the tenant with the most
   traffic.
2. **List filter operators** (M-8, M-39): add `contains`/`iContains` and `in`. They cover 31
   reports, and partial-text search was already a batch-1 finding
   (`mcp-tests/findings/2026-09-14-product-lookup-has-no-partial-text-search.md`).
3. **Invoice header defaults from the partner** (M-12), and **gross amounts on order lines**
   (M-9).
4. **Response envelopes** (M-22, M-76): one shape for lists and one for gets.
5. **Metadata batch** in `decisions.json` (M-44, M-54, M-11, M-29, M-30): descriptions and
   option labels only, no Java.
6. Record M-14, M-7, M-8, M-9 and M-12 as findings in `mcp-tests/findings/`, so the harness
   keeps checking them after the fix.

## Appendix — issues not verified in this batch

These issues came from fewer reports (CODE/METADATA with fewer than 3, GAP with fewer than 5)
and were not checked live. Per-issue detail lives in the gitignored triage folder: reports,
tenants, dates, quote, code check and proposed fix. Promote an issue from this list when it
shows up again in the next batch.

| Key | Kind | Feedbacks | Title |
|---|---|---:|---|
| M-34 | GAP | 4 | Bank reconciliation lacks an agent-compatible match route |
| M-35 | GAP | 4 | Tax records and selectors do not provide usable lookup |
| M-37 | NOISE | 5 | Noise: unavailable capability, recovered transient, or no friction |
| M-41 | GAP | 3 | Financial-account transactions have no supported create operation |
| M-43 | GAP | 4 | Fiscal calendar and open periods are not navigable |
| M-46 | GAP | 4 | Movement-line history cannot be filtered globally by product |
| M-49 | GAP | 4 | Sales order fulfillment actions and delivery visibility are insufficient |
| M-58 | GAP | 3 | Period opening is unavailable to finance agents |
| M-59 | GAP | 3 | Purchase-order receipt-from-order action is unavailable or undocumented |
| M-61 | METADATA | 2 | Aging bucket labels and time horizon are misleading |
| M-62 | CODE | 2 | Goods-receipt/shipment totalRows disagrees with returned rows |
| M-65 | DOCS | 4 | Payment or customer-contact capability guidance is inaccurate |
| M-66 | GAP | 4 | Purchase-order document handling operations are unavailable |
| M-67 | GAP | 4 | Record IDs cannot be resolved to accessible spec and entity |
| M-68 | NOISE | 5 | NOISE: tenant data and input mistakes were reported as MCP defects |
| M-69 | NOISE | 4 | Noise: omitted/malformed input or no actionable payload |
| M-70 | GAP | 3 | Account balances are not available per account and as-of date |
| M-71 | GAP | 3 | Goods-shipment header does not expose its document total |
| M-73 | GAP | 3 | Purchase invoices lack general attachment and document output actions |
| M-75 | GAP | 3 | Requests cannot be amended or cancelled |
| M-77 | CODE | 2 | Dashboard widget activity and business-date output is inaccurate |
| M-78 | METADATA | 2 | Financial-account action parameters are undocumented or UI-bound |
| M-79 | CODE | 2 | Invoice line tax auto-resolution selects a mismatched tax |
| M-80 | GAP | 2 | Product replenishment thresholds and actions are undiscoverable |
| M-81 | GAP | 2 | Sales invoice accounting entries are not readable through MCP |
| M-82 | GAP | 2 | Vendor-return shipment has no MCP operation to create its linked credit note |
| M-83 | CODE | 2 | Widget seller ranking returns products instead of sellers |
| M-84 | GAP | 2 | Batch operations omit follow-up actions or created-record summary fields |
| M-85 | GAP | 2 | Invoice get lacks a compact record shape and document-flow summary |
| M-86 | METADATA | 2 | MCP skill and tool naming guidance is inconsistent |
| M-87 | GAP | 2 | No compact document status/dates read view exists |
| M-88 | METADATA | 2 | Posting errors do not explain asynchronous inventory costing readiness |
| M-89 | GAP | 2 | Product stock transactions cannot be queried across products or dates |
| M-90 | METADATA | 2 | Product-price schemas do not expose the needed price amount |
| M-91 | GAP | 2 | Related-document and date filters are missing or silently ambiguous |
| M-92 | GAP | 2 | Stock API does not expose net availability after commitments |
| M-93 | GAP | 2 | Stock entities lack lot identity and expiration dates |
| M-94 | METADATA | 2 | Tax field and selector labels are unclear |
| M-95 | METADATA | 2 | Widget catalog does not map API widgets to dashboard titles |
| M-96 | CODE | 1 | Best-products ranks quantities on zero-total invoice lines |
| M-97 | GAP | 1 | buscar_contexto: Relevant current decisions are not discoverable before creating work, allowing duplicate or misroute |
| M-98 | GAP | 1 | buscar_contexto: Shared-context notes cannot be fetched by ID with their full body, preventing agents from verifying |
| M-99 | CODE | 1 | crear_solicitud: Creating a request fails with an invalid-or-revoked MCP token and blocks the workflow |
| M-100 | GAP | 1 | etendo_get: The MCP has no direct business-partner lookup by ID for customer terms and receivables status |
| M-101 | GAP | 1 | explicar_kpi: KPI explanation omits the measurement configuration id and finance surface lacks the configuration-l |
| M-102 | CODE | 1 | G/L journal completion fails while initializing process context |
| M-103 | CODE | 1 | Invoice line discount overwrites explicit price or is not applied |
| M-104 | METADATA | 1 | Journal line create schema omits description |
| M-105 | CODE | 1 | neo_action: Document actions/read-after-write are asynchronous or stale, causing contradictory status and amount |
| M-106 | CODE | 1 | neo_create: Business-partner create reports defaults applied although price/payment fields persist as null |
| M-107 | CODE | 1 | neo_create: Business-partner searchKey is silently replaced by a sequence value |
| M-108 | CODE | 1 | neo_create: Organization creation requires searchKey but rejects that same field as not allowed |
| M-109 | CODE | 1 | Other distinct order metadata or capability gap: changing order currency leaves the price-list currency |
| M-110 | CODE | 1 | Other distinct order metadata or capability gap: header totals remain unconverted when order currency di |
| M-111 | CODE | 1 | Other distinct order metadata or capability gap: header updated timestamp does not change when line edit |
| M-112 | GAP | 1 | Other distinct order metadata or capability gap: live order commitments cannot be queried by product wit |
| M-113 | GAP | 1 | Other distinct order metadata or capability gap: no purchase quotation document type is exposed, prevent |
| M-114 | METADATA | 1 | Other distinct order metadata or capability gap: parallel line writes under the same order can deadlock, |
| M-115 | GAP | 1 | Other distinct order metadata or capability gap: purchasing-role sessions cannot read sales demand neede |
| M-116 | GAP | 1 | Other distinct order metadata or capability gap: the mcp surface exposes no sales-side demand records, s |
| M-117 | GAP | 1 | Payment GL-posting action is unavailable |
| M-118 | CODE | 1 | Period-control child documents reject the parent filter |
| M-119 | CODE | 1 | Product callouts can choose an unrelated operative UOM |
| M-120 | CODE | 1 | Projected product `id` can identify a different record |
| M-121 | CODE | 1 | Recent-invoices widget returns zero despite reported sales |
| M-122 | CODE | 1 | Return-invoice creation can duplicate an existing return invoice |
| M-123 | GAP | 1 | Sales-order lines cannot be cancelled independently |
| M-124 | CODE | 1 | sincronizar_ahora: Measurement synchronization fails when the validator accesses a missing config |
| M-125 | CODE | 1 | Superseded context notes lack current-state labeling |
| M-126 | CODE | 1 | Widget KPI returns no results |
| M-127 | NOISE | 2 | Agent call used unsupported arguments or wrong record state |
| M-128 | NOISE | 2 | Duplicate test feedback adds no distinct invoice defect |
| M-129 | METADATA | 1 | Account references do not explain the accounting-combination ID |
| M-130 | CODE | 1 | Accounting access metadata leaks hidden finance entities |
| M-131 | DOCS | 1 | agent skills: Operational skills use neo_* tool names while the available MCP exposes etendo_* names, forcing agen |
| M-132 | GAP | 1 | Best-products has no category filter |
| M-133 | METADATA | 1 | buscar_contexto: Replaced context notes are returned alongside current notes without clear status prioritization |
| M-134 | DOCS | 1 | Chart account references do not expose hierarchy setup |
| M-135 | GAP | 1 | Chart-of-accounts create omits classification and hierarchy fields |
| M-136 | DOCS | 1 | contacts/vendorCreditor: Supplier delivery-term fields are absent or null without metadata distinguishing unsupported capabil |
| M-137 | CODE | 1 | crear_nota: Similarity rejection blocks a distinct stock-and-price note because it resembles an existing note ab |
| M-138 | METADATA | 1 | crear_solicitud: Every create_solicitud response includes the full shared context, causing large, truncated responses |
| M-139 | CODE | 1 | crear_solicitud: Large tool responses are silently truncated without returned byte count, offset, or continuation mec |
| M-140 | METADATA | 1 | crear_solicitud: Similar-looking order identifiers are presented ambiguously in task requests, increasing the risk of |
| M-141 | DOCS | 1 | docs: Agent-accessible documentation lacks instructions for customizing invoice and other document print t |
| M-142 | DOCS | 1 | docs: docs search covers agentic/API references but has no general Etendo Go UI/product documentation for |
| M-143 | DOCS | 1 | docs: No accessible documentation describes the business logic behind standard dashboard widgets, preventi |
| M-144 | GAP | 1 | etendo_action: The MCP exposes no way to record a payment commitment with its expected date |
| M-145 | METADATA | 1 | etendo_action: Tool spec enum does not distinguish nonexistent specs from platform specs unavailable to the current |
| M-146 | GAP | 1 | etendo_create: There is no ERP entity or record type for storing a replenishment list |
| M-147 | GAP | 1 | etendo_get: A document cannot be resolved by ID without guessing its spec and entity first |
| M-148 | GAP | 1 | etendo_get: No operation searches across accessible specs to identify which document type owns a record ID |
| M-149 | METADATA | 1 | etendo_get: Not-found responses from etendo_get omit the available entity names, unlike corresponding list error |
| M-150 | GAP | 1 | explicar_kpi: No tool lists open signals for a department with active or resolved status |
| M-151 | GAP | 1 | explicar_kpi: Open signals can only be discovered by querying KPI transitions individually |
| M-152 | GAP | 1 | Fiscal calendar does not expose periods |
| M-153 | METADATA | 1 | generate_aging_receivable: Aging report lacks SPA labels, header settings, and document due dates |
| M-154 | METADATA | 1 | generate_aging_receivable: An authorization denial is reported as validation_error instead of forbidden |
| M-155 | GAP | 1 | intenciones: There is no way to close or archive an already fulfilled unregistered intent, so it recurs daily |
| M-156 | METADATA | 1 | Invalid-filter errors truncate valid product field names |
| M-157 | METADATA | 1 | Invoice posting errors omit the missing variance-account context |
| M-158 | METADATA | 1 | listar_acciones: Action metadata identifies fetch but does not describe the response payload shape |
| M-159 | GAP | 1 | listar_acciones: Aging report data is not exposed as a consumable endpoint for KPI measurement |
| M-160 | GAP | 1 | listar_conexiones: The role cannot configure measurements for stock valuation and overdue-debt KPIs |
| M-161 | GAP | 1 | MCP cannot record invoice collection follow-up activity |
| M-162 | GAP | 1 | MCP does not expose a discoverable stock-reservation action |
| M-163 | GAP | 1 | MCP has no safe operation to correct a stock movement date |
| M-164 | GAP | 1 | MCP lacks invoice sales-by-product and period analysis |
| M-165 | DOCS | 1 | motor: The agent cannot tell that motor-server tools are unavailable or that evidence-text workflow is the |
| M-166 | METADATA | 1 | Movement quantity metadata implies an unsafe default source |
| M-167 | METADATA | 1 | Movement-date defaults use server date instead of tenant business date |
| M-168 | CODE | 1 | neo_create: Address creation saves a period as the name when no name is provided |
| M-169 | GAP | 1 | neo_create: Compliance records cannot be created for a chosen organization or session organization switched thro |
| M-170 | GAP | 1 | neo_get: Agents cannot read whether a valid signing certificate is configured or when it expires |
| M-171 | CODE | 1 | neo_get: Returned record URLs sometimes use app |
| M-172 | CODE | 1 | neo_list: The customer entity returns suppliers when no customer-role filter is supplied, contrary to its enti |
| M-173 | CODE | 1 | neo_selectors: The etsgSifTerritory selector fails with a server error instead of returning territory choices |
| M-174 | GAP | 1 | neo_vector_search: Global search cannot be exercised because no active vector source is configured for the tenant |
| M-175 | GAP | 1 | No bulk price-list-version update/read workflow exists |
| M-176 | CODE | 1 | OAuth discovery: OAuth protected-resource metadata advertises a different host than the user-facing MCP endpoint |
| M-177 | GAP | 1 | Order read capabilities are absent for purchasing/demand workflows |
| M-178 | GAP | 1 | Order records omit creation timestamps |
| M-179 | METADATA | 1 | Other distinct order metadata or capability gap: action handlers such as shipment creation are buried an |
| M-180 | METADATA | 1 | Other distinct order metadata or capability gap: actions schema has no compact view of action names and |
| M-181 | METADATA | 1 | Other distinct order metadata or capability gap: both sales-order and purchase-order resolve the same re |
| M-182 | GAP | 1 | Other distinct order metadata or capability gap: cannot list lines across sales orders in one query; eac |
| M-183 | CODE | 1 | Other distinct order metadata or capability gap: changing orderdate also changes accountingdate without |
| M-184 | METADATA | 1 | Other distinct order metadata or capability gap: document status responses expose codes without human-re |
| M-185 | GAP | 1 | Other distinct order metadata or capability gap: order commitments cannot be queried by product without |
| M-186 | GAP | 1 | Other distinct order metadata or capability gap: order demand cannot be queried by product without openi |
| M-187 | METADATA | 1 | Other distinct order metadata or capability gap: order lines omit lineamount, silently accept unsupporte |
| M-188 | CODE | 1 | Other distinct order metadata or capability gap: ordering by a non-unique date yields arbitrary selectio |
| M-189 | METADATA | 1 | Other distinct order metadata or capability gap: parallel child-list results lack parent identifiers, ri |
| M-190 | GAP | 1 | Other distinct order metadata or capability gap: purchasing workflow cannot read open sales-order demand |
| M-191 | METADATA | 1 | Other distinct order metadata or capability gap: sales order and invoice results omit business-partner s |
| M-192 | METADATA | 1 | Other distinct order metadata or capability gap: supported-field metadata is unavailable until after an |
| M-193 | METADATA | 1 | Period-closed validation omits the rejected date and period |
| M-194 | METADATA | 1 | Product active status is not explained in stock descriptions |
| M-195 | METADATA | 1 | Product code/value is missing from schema guidance |
| M-196 | CODE | 1 | Product creation ignores the configured unit-of-measure default |
| M-197 | GAP | 1 | Product listing lacks a category filter |
| M-198 | GAP | 1 | Product records cannot be fetched by multiple IDs in one call |
| M-199 | GAP | 1 | Purchase orders expose no change history |
| M-200 | GAP | 1 | Purchase-order status field definitions and named filters are unclear |
| M-201 | GAP | 1 | Role/user records or access metadata are missing |
| M-202 | GAP | 1 | Sales-order lines omit product stock context |
| M-203 | METADATA | 1 | Schema responses exceed useful limits and truncate relationships |
| M-204 | METADATA | 1 | Selector failures do not direct callers to exact list lookup |
| M-205 | DOCS | 1 | Shipment invoicing guidance omits the source of invoice quantities |
| M-206 | DOCS | 1 | skill continuar-el-flujo-operativo: Operational-flow and escalation skills conflict on whether to copy the source-chain item into a foll |
| M-207 | DOCS | 1 | skill continuar-el-flujo-operativo: Operational-flow guidance does not explain what to declare when a completed document is terminal and |
| M-208 | DOCS | 1 | skill continuar-el-flujo-operativo: Workflow guidance does not say whether to create a self-assigned request when the next step belongs |
| M-209 | DOCS | 1 | skill escalar-y-coordinar: Request format guidance conflicts with the workflow requirement to carry the originating item when t |
| M-210 | GAP | 1 | solicitudes: There is no way to add an instruction or comment to an existing request |
| M-211 | CODE | 1 | Widget KPI trend is always zero |
| M-212 | METADATA | 1 | Best-products trendPct lacks stable documented semantics |
| M-213 | NOISE | 1 | buscar_contexto: A context search timed out once but succeeded when retried with a different query; no persistent cap |
| M-214 | CODE | 1 | buscar_contexto: A long context-search query timed out while a shorter retry succeeded |
| M-215 | METADATA | 1 | crear_nota: Tool schema does not disclose that department_id or alcance is required |
| M-216 | GAP | 1 | crear_solicitud: There is no MCP mechanism to record pending human customer-contact work as an owned task or request |
| M-217 | METADATA | 1 | declarar_razonamiento: Schema fails to mark motivo as required for every option, including the selected option |
| M-218 | METADATA | 1 | Discovery product/environment identity is missing |
| M-219 | DOCS | 1 | docs: Agent documentation search has no relevant guidance for opening or closing accounting periods |
| M-220 | DOCS | 1 | docs: Documentation search does not surface guidance for diagnosing a closed accounting period |
| M-221 | DOCS | 1 | docs: Instructions do not say what to enter for an intent when a request item has no bracketed identifier |
| M-222 | NOISE | 1 | docs: User asked for API documentation URL but the feedback reports no MCP friction or actionable product |
| M-223 | METADATA | 1 | etendo_*: Tool responses are double-encoded as JSON text inside content[0] |
| M-224 | METADATA | 1 | etendo_schema: The schema does not identify valid contact fields or point to the contact child entity when requeste |
| M-225 | METADATA | 1 | generate_aging_receivable: When agents investigate overdue or aging payment schedules, the existing aging report is not surface |
| M-226 | METADATA | 1 | generate_inventory_stock_report: Inventory stock report category labels are not localized to the product category label |
| M-227 | GAP | 1 | Goods-receipt duplicate/copy operation is unavailable |
| M-228 | GAP | 1 | Inventory report cannot combine category stock and purchase prices |
| M-229 | METADATA | 1 | Inventory report rows omit the requested product record ID |
| M-230 | METADATA | 1 | Invoice payment schedules cannot be enumerated across documents |
| M-231 | DOCS | 1 | listar_conexiones: No tool or documentation directly reports whether a customer-contact channel is configured |
| M-232 | METADATA | 1 | listar_equipos: Department listings provide identifiers without department names, requiring separate lookups to map |
| M-233 | GAP | 1 | MCP: The MCP has no browser/UI interaction capability for validating visual or interactive UI behavior |
| M-234 | NOISE | 1 | navigate_to: The requested roles window is unavailable for the current role; no MCP defect or actionable exposure |
| M-235 | NOISE | 1 | neo_list: Successful contact lookup with no reported friction or actionable issue |
| M-236 | NOISE | 1 | None: The feedback reports that the agent lacked a separate motor server for verifying declarations, a too |
| M-237 | CODE | 1 | Other distinct order metadata or capability gap: a failed create consumes a document-number sequence val |
| M-238 | DOCS | 1 | Other distinct order metadata or capability gap: action-schema documentation does not clarify the meanin |
| M-239 | METADATA | 1 | Other distinct order metadata or capability gap: child-entity schema suggests parentid generally, but ge |
| M-240 | DOCS | 1 | Other distinct order metadata or capability gap: documentation does not explain that canceled orders ret |
| M-241 | DOCS | 1 | Other distinct order metadata or capability gap: documentation lookup provides no purchase-order-to-good |
| M-242 | METADATA | 1 | Other distinct order metadata or capability gap: the api does not flag an order date later than the rela |
| M-243 | METADATA | 1 | Other distinct order metadata or capability gap: the maximum length of order.description is not exposed |
| M-244 | METADATA | 1 | Other distinct order metadata or capability gap: tool example uses capitalized header although entity na |
| M-245 | METADATA | 1 | Other distinct order metadata or capability gap: validation error field label is english while the schem |
| M-246 | DOCS | 1 | Product creation auto-seeds zero-price rows |
| M-247 | GAP | 1 | Product-family summaries for variants are missing |
| M-248 | DOCS | 1 | Stock workflow guidance omits the product stock filter |
