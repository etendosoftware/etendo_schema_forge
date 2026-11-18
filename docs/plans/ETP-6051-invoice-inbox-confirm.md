# ETP-6051 — Invoice Inbox: confirm and discard (analysis, plan and as-built record)

Status: implemented behind the `invoice-inbox` flag (backend in `com.etendoerp.go`, SPA in `etendo_schema_forge`). Sections 1-9 are the original analysis, kept for the reasoning; section 10 records what was really built and decided and supersedes them where they differ.
Sources read: Jira ETP-6051 / ETP-6046, etendo-ai#3 functional design, the Claude design prototype
(batch confirm dialog + result toast, walked live in Chrome), the S2 plan (sections 9.1, 9.2) and the code.

## 1. What the story asks (acceptance criteria)

Confirm
- C1 Confirm documents in PENDING_REVIEW or READY, from the panel or in batch from the list.
- C2 Batch dialog: total amount, number of new products to create, number of documents skipped for errors.
- C3 Per document: create new vendor and new products -> create the purchase invoice with the original file
  attached -> COMPLETE it -> document CONFIRMED, linked to the invoice.
- C4 A failure creating/completing: the document goes back to ERROR with the reason, NO half-created invoice, the rest
  of the batch continues.
- C5 Result toast: invoices created (numbering range), products created, failures.
- C6 Confirming from the panel moves to the next pending document.
- C7 The confirmed document keeps `ADJUSTED` and the link to its invoice (KPI), no double count on retries.

Discard
- D1 Individual or batch, from PENDING_REVIEW / ERROR / READY. D2 confirmation dialog. D3 creates nothing in Etendo,
  read-only afterwards. D4 no restore / purge in phase 1.

Design prototype (what the screens show): batch bar `N seleccionadas | Marcar para revisión | Descartar | Confirmar`;
dialog "Confirmar N facturas" ("se crearán ... en estado Completado, con el PDF original adjunto", row `Importe total`,
"Se darán de alta N productos nuevos en el catálogo", Cancelar / Confirmar); toast
`2 facturas registradas en Etendo · FC1000143 a FC1000144 · 2 productos creados`; a confirmed row shows the badge
"Confirmada" plus `<invoice documentNo> · Completada` as a link.

## 2. What already exists (verified)

DISCARD IS ALREADY DONE end to end (ETP-6049): `InvoiceInboxDiscard` (atomic conditional UPDATE, idempotent),
`useInvoiceInboxDiscard` (3 at a time, partial-failure toast), `InvoiceInboxDiscardDialog`, row kebab, selection bar,
review footer. ETP-6051's discard half is only: confirm the acceptance criteria are met and wire the missing pieces
(see section 6). The real work is CONFIRM.

Confirm scaffolding already in place:
- `ETGO_INCOMING_DOCUMENT` has `C_INVOICE_ID`, `ADJUSTED`, `REVIEWED`, `STATUS` (CONFIRMED exists), `ERROR_CODE`
  (`CONFIRM_FAILED` is already named in `InvoiceInboxStatusPolicy`), `EXTRACTED_DATA`, `CURRENT_DATA`.
- The row lock pattern (`SELECT ... FOR UPDATE`), `updated` token, `InvoiceInboxEditGate`, `InvoiceInboxValidator`,
  the review read (`invoice = {id, documentNo, identifier}` once `C_INVOICE_ID` is set), the CONFIRMED/DISCARDED
  read-only behaviour, the `agentExcludedActions` set (confirm must join it, "all declared together").
- SPA: "Confirmar factura" (footer) and `invoice-inbox-bulk-confirm` (bar) are disabled "Próximamente" buttons; the
  dialog, queue hook and toast pattern of discard are the template for confirm.
- Server pieces to reuse: `BatchService` (atomic, runs the NEO create pipeline: defaults pass, callouts, cascades;
  `beginCallerOwnedTransaction` lets a caller own one transaction), `InvoiceCompletionService.completeInvoiceOrThrow`
  (package-private, same package as the inbox classes), `NeoAttachmentStore` / `NeoStagedAttachment` (attach a stored
  file to a record, `markAsMain`), `CreatePurchaseInvoiceHandler` (precedent: creates AND completes a purchase invoice
  in one call, ETP-5381).

KEY FINDING — the single-invoice OCR flow does NOT do what ETP-6051 needs. It is browser-orchestrated and stops at a
DRAFT: product creation is a separate popup (POST `/sws/neo/product/product/defaults` then create), vendor +
address are batch ops (`contacts/businessPartner`, `contacts/locationAddress`) built from the OCR seed, the invoice is
`purchase-invoice/Header` + `Lines` ops in `/sws/neo/batch`, and nothing completes it. ETP-6051 must run the whole chain
(vendor -> products -> invoice -> complete -> attach -> link) per document, server-side, atomically.

## 3. Recommended design

One new NEO action, same shape as discard / mark-reviewed: `POST /sws/neo/invoice-inbox/header/{id}/action/confirm`
(no body or `{updated}` token), served by `InvoiceInboxHeaderHandler`, hidden from MCP (`agentExcludedActions`, with a
reason, together with the others). Batch = the SPA sends one request per document (concurrency to decide, see Q3),
exactly like `runDiscardQueue`. One document per request keeps failures isolated (C4) and the toast easy.

Server flow per document (`InvoiceInboxConfirm`, split from the start into small classes: guard, vendor/product plan,
invoice builder, attach+link; the repo has Sonar cognitive-complexity gates, S2 needed three refactors):
1. Guard: flag, org writable, row lock, status in {PENDING_REVIEW, READY} (else 409 `not_confirmable`; already
   CONFIRMED -> 200 with the same invoice, `alreadyConfirmed:true`, idempotent), re-run `InvoiceInboxValidator` on the
   stored `CURRENT_DATA` (a stale PENDING_REVIEW must not confirm: 422 `not_valid` + `missing`), edit gate (foreign
   receiver), optional `updated` token (409 `stale_document`).
2. Build the work from `CURRENT_DATA` only (never from the browser): vendor (linked id | new seed), per-line product
   (linked id | new `{name, categoryId, uomId}`), per-line tax id, quantity, unit price / list price / discount, header
   `documentNo` (`orderReference`), date, currency from the vendor's purchase price list.
3. Execute in ONE transaction: vendor + address (if new) -> products (if new) -> invoice header -> lines -> complete
   (`completeInvoiceOrThrow`) -> attach the original file (main) -> set `C_INVOICE_ID`, `STATUS = CONFIRMED`,
   clear `ERROR_CODE`.
4. On any failure: roll back everything, then in a separate transaction set `ERROR` / `CONFIRM_FAILED` + the reason
   (C4), answer 422 with code + translated message. A quota refusal (`NeoQuotaCreateCheck.Refused`, ETP-6060) must be
   mapped to its own 403 like the other creation handlers.
5. After the commit only: emit `backend_invoice_inbox_document_confirmed` with `adjusted` (once, on the first
   transition; a retried/idempotent call emits nothing) and return `{id, status, invoice:{id, documentNo}, createdProducts,
   createdVendor, adjusted}`.

Why server-side and not "SPA orchestrates the existing batch": atomicity of create+complete (a browser crash between
batch and complete would leave a draft), a single authority for the claim (two tabs, a double click, a batch plus the
panel), no client-trusted payload, and the same pipeline still applies because the server calls `BatchService` ops.

## 3b. KPI contract (etendo-ai#3, "KPIs" section; same text as ETP-6046) and what it adds to the design

KPI: % of invoices generated with no adjustment since the scan, target > 50 %. Denominator: only documents that reached an
invoice (discarded and "Con error" never enter). Counts as adjustment: any header/line change (even if reverted), adding
or removing a line, changing an auto-linked vendor or product, choosing one among candidates, creating a vendor/product
with modified data. Does NOT count: an unchanged auto link, an alta with the extracted data unmodified, marking as
reviewed, confirming (single or batch).

Rules this puts on confirm (new in this plan):
- K1 Confirm NEVER writes or changes `ADJUSTED`. Everything the server decides at confirm (country fallback to Spain,
  tax resolved by the server, category by nature, defaults of the new vendor/product, rounding) is not an adjustment.
  A test must assert the flag is identical before and after confirm for both values.
- K2 The value that the KPI reads is the row's `ADJUSTED` at the moment of the first transition to CONFIRMED, kept on the
  row together with `C_INVOICE_ID` (the row is never deleted). So the KPI is computable from the table alone
  (`status = CONFIRMED`, `adjusted`), and the `backend_invoice_inbox_document_confirmed` event is a convenience that
  can be re-derived if it is lost. The event carries `adjusted` and is emitted once, after the commit, only on the
  first transition (idempotent confirm and failed attempts emit nothing: "sin doble conteo en reintentos").
- K3 A document that failed to confirm (ERROR / CONFIRM_FAILED) and is later confirmed counts once, with its final
  `ADJUSTED`. Editing it to get out of the error (Q2 option a) is an edit like any other and marks `ADJUSTED`
  (consistent with "any change since the scan"). A failed attempt itself changes nothing.
- K4 The batch must not create a second counting path: the batch is N single confirms, so no batch-level event.

One real tension found (needs the owner, Q9): the KPI text says an alta with the extracted data UNMODIFIED does not
count, but S2 decided (`NEW_PRODUCT_ALWAYS_MARKS = true`, user decision 2026-11-13) that choosing category/unit of a new
product always marks `ADJUSTED`, and D8 makes both mandatory because the OCR never extracts them. Result: every document
with at least one NEW product is adjusted by construction, so "alta sin modificar" can only be true for a new vendor.
For a month-end batch from suppliers whose products are not in the catalogue yet this pushes the KPI down without any
real correction by the user. Options: (a) keep, and tell the KPI owner so the 50 % target is read with this in mind;
(b) pre-fill category and unit from `product/defaults` / the line tax category (what the single-invoice popup already
does for unit and tax category) and count the alta as unmodified while the user keeps the pre-filled values, marking only
when they change them; (c) split the metric (docs with new products vs without). (b) matches the written KPI best and is
a small change in the S2 `newProduct` rules (fix it here, not in ETP-6050, per the agreed approach).

## 3c. New product: OCR unit + defaults (owner proposal 2026-11-17, verified against the code)

Facts: the OCR line schema (`ocr-config.json`, Go side, passed as `structured_output_schema`, so NO change in
`com.etendoerp.copilot` is needed) has only description, quantity, unit_price, discount_percent/amount, tax_label,
tax_rate: no unit, no category. The single-invoice popup never asks for the product category: it comes silently from the
AD column default (`@SQL` = the client's category with `IsDefault='Y'`, none if the tenant has none; local DB has exactly
one default row in the whole table); UoM and tax category are preselected by `ProductDefaultsHandler` (IsDefault, tenant
first then System) and the user may change them; the tax category follows the line tax (ETP-5585).

Proposal: (1) add `unit` (printed unit of measure of the line) to the OCR line schema, match it server-side to `C_UOM`
(symbol / EDI code / name, es+en aliases) and use it ONLY for a NEW product (a linked product keeps its own unit);
category is not extracted (invoices rarely print a category and ids are tenant-specific). (2) when the worker builds a
`new` product it pre-fills `uomId` (OCR unit, else tenant default) and `categoryId` (tenant default) and stores them as
the base value, tagged by source (`ocr|default|manual`). `ADJUSTED` then marks only when the user changes a stored
value (the S2 stored-value diff already works that way; `NEW_PRODUCT_ALWAYS_MARKS` becomes false). (3) the validator
still requires both: if the tenant has no default and OCR gave none, the product stays pending and the user picks.
(4) the panel shows pre-filled values as such ("por defecto") so a reviewer sees what will be created. Confirm derives the
tax category from the line tax (else default), never counted as adjustment.

## 4. Spikes that decide the design (do first, all read-only/local)

S1. One transaction for create + complete. `BatchService.executeBatch` commits at the end of its loop, so completion
    after it would be a second transaction (draft committed, completion fails -> orphan draft). Check how
    `CreatePurchaseInvoiceHandler` achieves "created AND completed, atomically" and whether
    `beginCallerOwnedTransaction()` + `createRecord` + `completeInvoiceOrThrow` + the attachment store can share one
    transaction. Fallback if not: delete the draft on completion failure (compensation) and prove it leaves nothing.
S2. Attaching the file. The intake stored the file against `ETGO_INCOMING_DOCUMENT`. Decide copy vs move vs re-use
    (`NeoStagedAttachment` is the existing "attach a staged file to the created record" mechanism). The bytes live on
    disk (not transactional): an orphan file after a rollback is acceptable (same as `warnOrphan` in the intake) but a
    committed invoice without its attachment is not (C3). Must be marked main so the invoice preview shows it.
S3. Vendor creation parity. The SPA seed: header `name`, `taxID`, `etgoEmail`, `etgoPhone`; address child `address`,
    `postalCode`, `city`, country by NAME with the Spain fallback (`lib/defaultCountry.js`, aliases España/Spain, region
    never seeded); category by document nature (flag `contact-category-type`). The server cannot import the SPA helper:
    port the mapping to Java and pin it with a shared fixture (the totals fixture pattern from S2), plus the vendor
    flags (supplier / vendor group / price list / payment terms defaults that `contacts` create applies).
    A vendor with NO usable address cannot carry an invoice (`partnerAddress` NOT NULL): decide the rule (the S2
    validator already reports `addressState`).
S4. New product parity. SPA popup: name from the line description, UoM (we store `uomId`), tax category = the line
    tax's category (ETP-5585) else `product/defaults`, everything else from `product/defaults`. In the inbox the panel
    stores `categoryId` = PRODUCT category (D8: category + unit required), so confirm maps: productCategory=categoryId,
    uom=uomId, taxCategory from the tax. Verify the product create pipeline gives purchase=Y, stocked etc. as the
    popup does, and what the price list / `ETGO_*` side effects are (a new product with no price in the vendor price
    list: the invoice line sets `unitPrice` and `listPrice` explicitly, as the descriptor does).
S5. Line price semantics. Descriptor sends `unitPrice = listPrice = price`. S2 stores printed price + `discount`
    percent; the invoice line must carry `listPrice` (printed), `etgoDiscount`, and the net unit price the totals
    model uses (unit6 = round6(price*(1-d/100))). Prove header grand total equals the document total to the cent in
    EUR / USD / JPY and in D (header) vs L (per line) tax modes — S2 already has the fixture and a live parity harness
    to reuse. Also line tax: send `tax.id` (never the rate) and confirm the invoice tax lines match.
S6. Concurrency and numbering. Completion posts accounting and takes the document sequence. Confirm in parallel (3 at
    a time like discard) may deadlock or interleave numbers; the toast shows "FC...143 a FC...144" so contiguous
    numbers per batch are expected. Measure with 5-10 documents; default to sequential if it is not clean.
S7. Duplicates at confirm. S2 marks a duplicate (vendor + number exists). Confirm must decide: block, warn, or allow
    (design only says the validation flags it). Re-check at confirm time, because another invoice may have been
    created since.

## 4b. Spike results (2026-11-17, read-only)

S1 DONE — one transaction create + complete: FEASIBLE, and the repo already does it. Precedent:
`CreateDraftInvoiceHandler.handleCreate` and `CreatePurchaseInvoiceHandler.createAndCompleteInvoice` (ETP-5381). Creation
only `flush()`es (no commit); `InvoiceCompletionService.completeInvoiceOrThrow` -> core `ProcessInvoiceUtil.process`
does `commitAndClose()` on success and `rollbackAndClose()` on error, so the completion is the SINGLE commit point of
everything flushed before it (header, lines, and anything else in the session) and a failed completion reverts all of it
("no half-created invoice" comes for free). Consequences for confirm:
- Everything must be written BEFORE the completion and flush-only: vendor + address, products, header, lines, the
  attachment, and the inbox row update (`C_INVOICE_ID`, `STATUS = CONFIRMED`, error code cleared). After the completion the
  session is closed (entities detached; re-read by id) and NOTHING may be written in the same unit any more. So the
  link and the CONFIRMED status are written pre-completion, and are rolled back with it on failure.
- On failure the handler marks the row `ERROR` / `CONFIRM_FAILED` (+ reason) in a NEW transaction, after the rollback.
- The in-process creation of vendor/products/invoice through the NEO pipeline cannot use `BatchService.executeBatch` as
  is (it commits at the end of the loop, so the completion would be a second transaction). `BatchService` already has
  the mechanism, package-private: `beginCallerOwnedTransaction()` / `endCallerOwnedTransaction()` (the write path then
  defers its commit, `NeoBatchJsonDataService`); the inbox classes are in the same package. The create primitive
  (`createRecord`) is private, so DEV adds ONE small package-private entry on `BatchService` (run ops under the
  caller-owned transaction, no commit, same checks and hooks) and keeps its REST/MCP behaviour untouched; the alternative
  (calling the entity handlers directly) would skip the access/method/preflight/extension gates and is rejected.
  `finally` MUST always end the claim (pooled thread).
- Fixed order before completing: `DocumentCurrencyRate.requireRateForCompletion`, `NeoQuotaCreateCheck.requireAllowedDocument`,
  `InvoiceSifPreset.applyBeforeCompletion`, as the two precedents do; map `NeoQuotaCreateCheck.Refused`,
  `InvoiceSifPreset.Refused`, `MissingRateException` to refusals that become CONFIRM_FAILED with their own message.
- The invoice documentNo is assigned at completion: read it after, by id, for the answer and the toast.
- Admin mode: the precedents run the whole creation inside `OBContext.setAdminMode(true)`; confirm must keep the user's
  organization/role checks (`isWritableOrganization`, window access) BEFORE entering admin mode.

S2 DONE — attaching the file: FEASIBLE with existing pieces. `InvoiceInboxProcessor` already reads the inbox file with
`NeoAttachmentsHelper.copyMainAttachmentToTemp(IncomingDocument.TABLE_NAME, id)` (owner-only temp copy through the
configured attach handler, never a hand-built path). Confirm hands that copy to
`NeoAttachmentStore.store(new NeoAttachmentUpload("C_Invoice", invoiceId, tabIdHint, fileName, size, materializer,
markAsMain = true))`, the same call `NeoStagedAttachment.attach` (the OCR staged-document precedent) uses, so policy,
storage and main-document marking are identical to the SPA upload. Core's `AttachImplementationManager.upload` only
`flush()`es (no commit), so the attachment row joins the same unit and is committed or rolled back with the completion.
Caveats: (a) the bytes go to disk, which is not transactional: a rollback leaves an orphan file (the intake already
accepts and logs that, `warnOrphan`); (b) `NeoAttachmentStore.store` catches errors and calls `rollbackAndClose()` itself
and answers >= 400 instead of throwing, so confirm must treat any >= 400 as failure and stop (the unit is already rolled
back) instead of continuing to complete; (c) the original stays attached to the inbox row too (copy, not move: the
inbox row is the audit trail of the extraction); (d) the temp copy is removed with `cleanupTempFile` in a `finally`;
(e) the header needs `recordExists` to see the invoice, which holds after the flush in the same session.

OCR `unit` (proposal 3c) — no change in `com.etendoerp.copilot` needed: `SimpleOcrTool.py` forwards the inline
`structured_output_schema` unchanged (`_structured_schema_dict`), and the question text is the Go side's
(`ocr-config.json` `question`, which today lists only "description, quantity, unit price" and should name the unit and
the discount). The change is: `ocr-config.json` (`unit` in `line_items` properties + `required`, nullable, description
"printed unit of measure of THIS line, as printed, e.g. kg, ud, h; null if none"), `InboxLineMatcher` (keep it in the line
JSON), a unit matcher (`OcrLookups`) and the SPA mapping. It reaches the single-invoice flow and the MCP OCR through the
shared schema (nullable, so harmless, but both need a smoke test). The copilot module is only touched if a real
limitation shows up in the tool itself (file reading, model, system prompt); then the branch is cut from
`epic/ETP-3504` (module policy "fixed on epic").

## 5. Changes by repo

`com.etendoerp.go` (backend)
- `InvoiceInboxConfirm` (+ small collaborators), wired in `InvoiceInboxHeaderHandler`, added to `agentExcludedActions`.
- Status policy: `CONFIRM_FAILED` is "decided elsewhere" today, so an ERROR/CONFIRM_FAILED row is stuck (not editable
  back to PENDING_REVIEW, not confirmable). Decide the exit (Q2) and implement.
- Where the failure reason lives: the table has `ERROR_CODE` only. A dynamic reason (the completion message) needs a new
  column (`ERROR_DETAIL`, model change + `update.database`) or a stored field in `CURRENT_DATA`. Recommendation: column.
- Summary data for the batch dialog: new products count and total per currency (see section 6) — new summary
  column(s) synced by `InvoiceInboxSummary` on every save, following the "list columns must be real columns" rule.
- Messages (`InvoiceInboxMessages`, es/en), docs `docs/neo-headless.md` 4.6b, KPI event, `flags` unchanged.
- Tests (tester-go): mock tests for every refusal and the rollback; DB-backed `goIsolatedDalTest` for the full chain
  (new vendor + new product + discount + tax D/L + attachment + completion + failure rollback leaves nothing).

`etendo_schema_forge` (SPA)
- `confirmInboxDocument` in `invoiceInboxApi.js`, `useInvoiceInboxConfirm` (queue, like discard), confirm dialog
  (copy of the prototype), confirm toast with the numbering range, enable footer + bar buttons, panel goes to the next
  pending document after a confirm (C6, `useInvoiceInboxReviewNav`), confirmed row shows `documentNo · Completada`
  linking to the purchase invoice (`/purchase-invoice/<id>`), keep `ADJUSTED` visible.
- Batch bar rules: "Marcar para revisión" stays out of scope (listed as out of phase in the design); Confirm is
  enabled only if at least one selected row is PENDING_REVIEW/READY; other rows are counted as "omitidos".
- i18n keys in en_US, es_ES, es_AR; `data-testid`s; `docs/generated-custom-windows/invoice-inbox.md`; flag registry
  unchanged (same `invoice-inbox` flag).
- Tests (tester-functional): vitest for queue/toast/dialog, Playwright mocked spec extension (confirm single, batch
  with skipped + failed rows, retry), reuse `invoice-inbox-review-panel.mocked.spec.js` and the upload-and-status spec.

## 6. Product questions (answered, see section 10.1)

Q1. Batch dialog numbers: "importe total" with mixed currencies (each document has its currency from the vendor price
    list; the list column today assumes the organization currency). Sum per currency, or one line per currency?
Q2. Exit from ERROR/CONFIRM_FAILED: (a) editing the document re-validates and returns it to PENDING_REVIEW (recommended,
    matches the design state diagram "Con error -> se corrige -> Pendiente revisión"), and/or (b) confirm accepted
    directly from that error ("Reintentar"). Today it is stuck.
Q3. Confirm concurrency: 1 at a time (contiguous numbering, safe, slower for 20 files) or 3 like discard.
Q4. Duplicates at confirm: block, ask, or allow? (S2 only flags them.)
Q5. Vendor without any address, and vendor creation defaults (group, price list, payment terms, category by nature):
    which default does the product owner want, or do we block "confirm" with a clear missing-data message?
Q6. Lines without product (financial lines) are blocked in S2; keep blocked at confirm (recommended) or open a ticket.
Q7. "Marcar como revisada" is optional in the flow (PENDING_REVIEW can confirm directly): keep as is?
Q8. Batch toast numbering range: min..max of the documentNo created, or list when not contiguous?
Q9. New product and the KPI (section 3b): keep "always adjusted", or pre-fill category/unit and count an unmodified alta
    as not adjusted (matches the written KPI)?

## 7. Findings of ETP-6050 to fix here (user decision: fixed in ETP-6051)

- Narrow viewport (<=390 px) input truncation and crowded drawer header (and the footer will gain a second primary
  action, so recheck at 360/390/420 px with the confirm button).
- SPA/backend parity on a non-numeric `taxRate`: SPA `lineRate` when `taxRate` is a non-numeric string (fallback to `tax.rate` like the backend) + fixture
  case `taxRate: ""`.
- `ETGO_REQUIRE_SPA_FIXTURE=true` in the CI job that has the SPA repo (totals parity must not skip silently).
  Superseded 2026-11-18: dropped. The cross-repo fixture read was removed and the flag no longer exists; each repo owns its own cases.
- Single-invoice "Extraer y completar" and MCP OCR show discounted lines at the gross printed price (W6): map
  `discount_percent` / `discount_amount` there too (separate small change, same shared schema).
- Mapping facts ETP-6051 depends on (already recorded): `tax.id`, `listPrice` / `etgoDiscount` (not `unitPrice`),
  vendor seed, new-product defaults, currency, `backend_invoice_inbox_document_confirmed`.
- Lines without product, global `formatCurrency`/`round2` 2-decimal assumption (ticket), `Rendered more hooks` console
  error seen once, the second identical `newProduct` no-op (accept or reword matrix 9.3), the stored language of
  `new.category`.

## 8. Proposed slicing (each behind the existing `invoice-inbox` flag)

C1 Backend: spikes S1-S7 -> contract (section 9 of a new plan doc, like S2) -> `confirm` action (single document,
   full chain, rollback, idempotent) + KPI event + docs. Independent of the SPA once the contract is fixed.
C2 SPA: confirm single from the panel (+ next document) and the confirmed row link; dialog/toast shared with C3.
C3 SPA + backend summary columns: batch confirm (dialog numbers, skipped rows, queue, partial-failure toast).
C4 Hardening: failure ladder (completion refusal, quota, org not writable, vendor without address, duplicate), live
   verification in the isolated env (parity to the cent with a real purchase invoice, as in S2), ETP-6050 leftovers.
Pipeline as always: DEV -> Alex -> testers -> live verification -> Clerk (commits/PRs) with the user doing any
`--no-verify` push. Both repos need a `feature/ETP-6051` branch cut from `develop` after ETP-6050 merges (or stacked on
`feature/ETP-6050` if the user prefers not to wait; stacking needs a rebase when #1643 / #2212 merge).

## 9. Risks

- Highest: the transaction boundary of create + complete + attach (S1/S2). If it cannot be one transaction we need an
  explicit compensation and a test that proves "no half-created invoice".
- Completion has many hooks (quota, Verifactu / TBAI fiscal hooks, accounting). A completion that fails after the
  vendor/products were created must not leave them behind (they roll back with the transaction; the toast must say so).
- Numbers shown in the dialog before the user confirms must equal what confirm creates (same fixture, same code path).
- A second tab or a worker race: the claim (row lock + status guard) is the only protection, test it with two threads.
- Fiscal tenants (Verifactu/SII) will emit fiscal records at completion: verify at least one fiscal tenant in the
  isolated env before declaring done.

## 10. As built and decided (2026-11-17)

### 10.1 Decisions (product owner)

- Q1 Mixed currencies: the batch dialog shows the total PER CURRENCY, one line each (normally one). The list Total
  column uses the row's own currency (a real read-only column), never the organization's.
- Q2 Exit from ERROR: confirm accepts a `CONFIRM_FAILED` row (retry, "Reintentar") and also a `MISSING_FIELDS`
  row (the verdict is recomputed after the claim, so a document completed meanwhile succeeds and an incomplete one
  is refused with its missing codes). Editing a failed document moves it back to PENDING_REVIEW.
- Q3 Concurrency: ONE request per document, sequential (contiguous numbering), with progress; a stopping refusal
  (`feature_disabled`, `access_denied`, `QUOTA_EXCEEDED`, network) stops the queue, any other failure is isolated.
- Q4 Duplicates: `duplicate_invoice` (422, with the existing invoice) refuses that document.
- Q5 Vendor without address: refused (`vendor_address_missing`, shown as the `vendorAddress` blocker in
  `validation.missing`); the exchange rate likewise (`missing_exchange_rate` / `exchangeRate`).
- Q6 Lines without product stay blocked (follow-up: concept / financial lines).
- Q7 "Marcar como revisada" is optional: PENDING_REVIEW confirms directly.
- Q8 Toast numbering: a range ("FC1000143 a FC1000145") only when the created numbers are contiguous, otherwise the
  list (at most 5, then an ellipsis); products created; failures with the reason (single or "several"); documents
  never sent after a stop are reported apart ("N sin confirmar").
- Q9 New product and the KPI: option (b), implemented as proposal 3c (pre-fill, mark only on a user change).
- Total policy: a printed total different from the lines total WARNS and never blocks. The dialog warns, the toast
  adds a neutral note, the invoice is created with the lines total; the rule is aligned between SPA and backend
  (scale from `currency.scale`, strictly more than one minimal unit, half-up symmetric, a missing / non-numeric
  printed total never warns; fixture `invoice-inbox-total-mismatch.json`).
- Tax-included price lists are refused: 422 `price_list_tax_included` (the row is not moved, nothing created; the
  user must change the vendor's purchase price list). It does not stop a batch.
- Next pending document after a panel confirm: PENDING_REVIEW / READY only, loading more pages when needed. The row
  kebab stays inert.

### 10.2 Spikes

- S1 (one transaction: create + complete + attach) and S2 (attachment copy): real and live-verified.
- S3 (vendor seed parity): lives in the backend `InvoiceInboxConfirmSeeds.java`, with a backend-only fixture
  `invoice-inbox-vendor-seed.json` and its test. The SPA has no seed logic.
- S4 (new-product parity) and S5 (EUR / USD / JPY and D-vs-L tax parity): backed by the 22-case totals fixture plus
  live spot checks (EUR and USD invoices completed to the cent; a JPY invoice verified by the backend developer).
  There is no dedicated live matrix.
- S6 (numbering / concurrency): NOT guaranteed by the backend (no server-side serialization). Contiguity comes only
  from the SPA sending one confirm at a time; another user completing an invoice in between breaks it, and
  `contiguousRange` / `numberingText` list the numbers in that case. Only batches of 5 and 2 documents were run
  live; the 5-10 document benchmark was NOT run.
- S7 (duplicates): decided and implemented. Blocked at confirm for a linked vendor as 422 `duplicate_invoice` with
  `error.invoice {id, documentNo}` (no override).

### 10.3 Contract and columns

`POST /sws/neo/invoice-inbox/header/{id}/action/confirm`, optional `{updated}`. 200: `{id, status: 'CONFIRMED',
invoice: {id, documentNo, identifier}, adjusted, createdVendor, createdProducts, alreadyConfirmed, totalMismatch}`.
Errors: 400 `invalid_request`; 403 `feature_disabled`, `access_denied`, `org_not_allowed`, `QUOTA_EXCEEDED`; 404
`not_found`; 409 `not_confirmable`, `stale_document`; 422 `not_valid`, `duplicate_invoice`, `missing_exchange_rate`,
`vendor_address_missing`, `price_list_tax_included`, `confirm_failed` (+ `detail`). New read-only list / review
fields (real columns, declared in `decisions.json`): `currency` (`C_CURRENCY_ID`), `newProducts`
(`NEW_PRODUCTS`), `errorDetail` (`ERROR_DETAIL`), `totalMismatch` (`TOTAL_MISMATCH`, Y/N, empty on rows saved
before the column). The review answer carries `currency {id, isoCode, symbol, scale}`, `errorDetail` and, per
line, `unitPrinted` and `product.new.categorySource` / `uomSource` (`ocr` | `default` | `manual`).

### 10.4 OCR unit and defaults, as implemented

The OCR line schema gained the printed `unit`; the backend matches it to a unit of measure and uses it ONLY for a new
product, else the tenant default; category comes from the tenant default. Each value is stored with its source and
the panel shows "del documento" / "por defecto" beside the pickers (the printed text of the unit as secondary
text). The pickers stay required when nothing could be pre-filled. `ADJUSTED` marks only a user change.

### 10.5 Verification status and follow-ups

Verified live against the real backend and a real browser: single confirm + jump to next, retry, refusal banners
(duplicate, tax-included, missing exchange rate), batch with per-currency totals and contiguous range, a USD
invoice, the click race (one apply + one confirm), narrow widths 360 / 390 / 420.

NOT verified live: `QUOTA_EXCEEDED`, the real OCR extraction of `unit` (Docker / copilot down), a second user
completing invoices concurrently.

Follow-up tickets:

- Numbering / concurrency benchmark (5-10 documents, concurrent users).
- `ETGO_REQUIRE_SPA_FIXTURE=true` in the CI job that checks out the SPA. (Superseded 2026-11-18: dropped, the flag no longer exists.)
- Row kebab with Confirm / Retry.
- Concept (non-product) lines.
- Tax-included price lists via `grossUnitPrice`.
- Show the invoice's real total in confirmed rows (the row keeps the printed total; `TOTAL_MISMATCH` is only a flag).
- Translate `ERROR_DETAIL`.
- Resolve the pending owner decision "null -> value counts as ADJUSTED".
- Collapse the two reason-key maps (`SAVE_ERROR_LABEL_KEYS` and `CONFIRM_ERROR_LABEL_KEYS`) into one.
- Shared `DataTable.jsx` `toggleRow` setState-in-updater warning (pre-existing, other ticket).
