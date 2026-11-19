# ETP-6050 — Invoice Inbox review panel (plan)

Status: APPROVED rev. 3 (decisions closed 2026-11-12, section 8). Rev. 2 re-checked the plan against
the ETP-6047/6048/6049 code. Implementation starts with slice S1.
Rev. 4 (2026-11-13): S1 is merged; section 9 details slice S2, which now absorbs S3 (edit, autosave, totals, `ADJUSTED`,
line discount, vendor/product resolution, mark-reviewed); the "Decisions S2" list closes section 8. Nothing else changed.
Jira: ETP-6050 (story 4 of 5), epic ETP-6046. Functional design: etendo-ai #3 (comment 1).
Prototype: the "Bandeja de facturas de compra" design file (click a row to open the panel).
Repos: `com.etendoerp.go` (backend) and `etendo_schema_forge` (SPA). Base: `develop`, no epic branch;
stories 1-3 (ETP-6047/6048/6049) are already merged there.

## 1. What the story is

A drawer, opened from the inbox, that shows the original document next to an editable form
(supplier, header, lines, totals). It autosaves, resolves ambiguous or new suppliers and products,
and lets the user mark the document as reviewed. Every manual adjustment turns on the sticky
`ADJUSTED` flag (the epic KPI).

Out of scope: confirming and creating the invoice (ETP-6051) and the real creation of suppliers and
products, which happens on confirm.

Inherited commitment: `flags-registry.json` → `invoice-inbox.deferredItems[revalidate-on-edit]`
names ETP-6050 as the caller of `InvoiceInboxValidator` / `InvoiceInboxStatusPolicy` on every edit.
Until this story ships, an edited row keeps a stale verdict. Closing that item is part of the done
definition.

## 2. Prototype inventory

Drawer header: file name, status tag, sender/origin and reception date, save indicator
("Guardando..." / "Guardado"), "n de N", previous/next arrows.
Left pane: original document viewer with zoom (100 %) and download.
Right pane: Supplier, Header, Lines, totals card, fixed footer.
Footer: red discard button, "N mandatory pending" counter, "Marcar como revisada", "Confirmar factura".

| State | What the prototype shows |
|---|---|
| Pending, supplier linked | Card with "Vinculado por NIF" and "Cambiar"; lines linked ("Por referencia del proveedor") or new |
| Ambiguous supplier | "Etendo AI propone 3 proveedores", radios with "Más probable", "Ninguno · crear proveedor nuevo"; footer buttons disabled; error "Elige uno de los proveedores propuestos" |
| Ambiguous product | 3 candidates, "Ninguno · crear producto nuevo", search "Vincular a un producto existente"; a new product asks name, category, unit of measure |
| Error, missing data | Date in red with a "Revisar" tag, tax "—" in red, "Asigna el impuesto a todas las líneas" |
| New supplier | Block with name, NIF/CIF, address and "Buscar existente" |
| Possible duplicate | Banner "Ya existe la factura FC1000131 ... Puedes confirmar igualmente" (does not block) |
| Unreadable | Banner "No se pudo leer el documento", supplier to pick, 0 lines, total 0,00 |
| Ready to confirm | "Revisada por ti" in the footer, Confirm enabled |
| Confirmed | Green banner "FC1000140 registrada en Etendo · Completada", read only |
| Discarded | Read only, no footer |

Observed behaviour: changing a quantity recalculates the amount and totals and shows "Guardando...";
previous/next is limited to the current filter and skips processing documents; the drawer closes by
clicking outside it (Escape does not). Icons did not render in the embed, so the line-delete icon and
the viewer toolbar icons are unknown.

## 3. Prototype vs description vs code

| # | Finding | Recommendation |
|---|---|---|
| D1 | "Vencimiento" and "Moneda" are in the prototype, but the OCR schema (`ocr-config.json`) extracts neither and `CURRENT_DATA` has no such fields | See decision 1 |
| D2 | Checkbox "Recordar esta equivalencia..." and label "Equivalencia guardada" | Remembered equivalences are Phase 2 per the design: do not build. `product.matchedBy` is only `exact` / `similarity` |
| D3 | "El total no cuadra con el documento" warning (also shown with Confirm enabled) | Not in the description; build as a non-blocking warning (decision 4) |
| D4 | Highlight of the source region on the document | OCR returns no coordinates: out of scope |
| D5 | "Se elimina en 30 días" in the prototype list | Already decided in ETP-6049: no purge, no such text |
| D6 | Prototype candidates carry city, code, category and unit; the contract keeps only id, name, tax id or similarity | Enrich candidates at read time (not in the worker) so old rows work too |
| D7 | No visible line-delete affordance although the acceptance criteria say lines are removable | See decision 5 |
| D8 | The validator does not require category/unit for a new product; the story does | Extend `productComplete` |
| D9 | Unreadable documents are completed by hand ("Completa los datos a mano"), but `InvoiceInboxStatusPolicy.isMovable` only moves validation errors | Allow `UNREADABLE` to move after a user edit |
| D10 | `UNREADABLE` and `SERVICE_FAILURE` rows have NO `CURRENT_DATA`: the worker only calls `store.fail` | The review read builds an empty v1 skeleton (not persisted until the first edit) |
| D11 | The in-inbox duplicate check (`addInboxDuplicates` / `issuerQuery`) is `private static` in `InvoiceInboxProcessor` | Extract it to a shared class used by the worker and the editor (behaviour-preserving refactor) |
| D12 | The new-supplier block in the prototype has one "Dirección" field; the description wants "datos extraídos (nombre, NIF, dirección), categoría Proveedor, país España por defecto"; ETP-5654 lists "dirección no precargada" and "categoría del nuevo contacto" as open bugs of the single-invoice flow | Store the extracted address structured (`address`, `postalCode`, `city`, `country`), plus category Proveedor and country Spain as defaults (decision 8) |
| D13 | `ProductResolverPopup` (single-invoice flow) creates the product immediately; the story defers creation to confirm | Reuse its search (`ocrQuery.js`), not its creation |

## 4. What already exists (verified in the code)

Backend (`com.etendoerp.go`):
- `ETGO_INCOMING_DOCUMENT` with `CURRENT_DATA`, `EXTRACTED_DATA`, `REVIEWED`, `ADJUSTED`,
  `DUPLICATE_INVOICE_ID`; statuses `PROCESSING`, `PENDING_REVIEW`, `ERROR`, `READY`, `CONFIRMED`,
  `DISCARDED`. Nothing sets `READY` yet; discard already accepts it.
- `InvoiceInboxValidator.validate(document)` (pure), `InvoiceInboxStatusPolicy.apply(row, result)`,
  `InvoiceInboxSummary.syncFrom(document, row)`: their javadoc names ETP-6050 as the caller.
- `OcrLookups` (bound per document type, `PurchaseInvoiceOcrLookups`) already offers what an edit
  needs: `vendorById`, `vendorAddress`, `duplicates(vendorId, documentNo)`,
  `defaultTax(locationId, invoiceDate, rate)`, `productCandidates`, `vendorsByTaxId`. Missing:
  `productById` and the enrichment data (city, search key, category, unit).
- `InboxLineMatcher.tax` and `InboxVendorMatcher` are package-private helpers: the editor calls the
  lookups directly instead.
- `InvoiceInboxHeaderHandler` (`@NeoExtension(spec = "invoice-inbox", entity = "header")`) gates the
  whole spec by the flag and serves `discard` (hidden from MCP).

Framework facts checked (step B0 of rev. 1, now resolved):
- A POST to `/{spec}/{entity}/{id}/action/{name}` parses the body as JSON (`NeoSubEndpointDispatcher`
  → `NeoContext.getRequestBody()`; bad JSON answers 400).
- GET actions exist and keep the record id; `NeoActionRecordGuard.refusalFor` runs for every action
  method (another tenant's id answers 404 before the handler).
- `apiFetch` injects the optimistic-lock token only into PUT/PATCH, so actions must carry their own
  version token.

Gaps: the spec is read only (POST/PUT/PATCH/DELETE off) and `currentData` / `extractedData` are
`discarded`, so nothing reaches the browser: no way to read or edit a document.

SPA (`etendo_schema_forge`): the list page is done; a row click does nothing and the pencil is inert,
waiting for this story. Reusable: `ui/sheet`, `react-pdf`, `/sws/neo/attachments/{table}/{id}/main`
(`listAttachments.js`), `useRecordWriteQueue`, `InlineSearchCombo`, `date-field`, `status-tag`,
`formatCurrency`, `parseCalendarDate`, `ocrQuery.js` (selector search), and from the inbox module:
`STATUS_LABEL_KEYS` / `STATUS_TONES`, `errorCodeLabelKey`, `runDiscardQueue`,
`InvoiceInboxDiscardDialog`, `isImageFileName`. Guardrail: `invoiceInboxLocales.test.js`.

## 5. Plan

### Design

- Read: a GET action `GET /invoice-inbox/header/{id}/action/review` instead of `afterHandle` on
  GETBYID (rev. 1). Reasons: an `afterHandle` would also push up to 1 MB into MCP `etendo_get`
  (agent context cost) and would need `responseEnrichedFields`; the action sits next to `discard`,
  reuses the record guard, and is hidden from MCP the same way.
- Writes: POST actions on the same handler; the spec stays read only (no PUT/PATCH, so no arbitrary
  column can be written).
- The client sends a list of operations, not the whole document: `setHeader`, `selectVendor`,
  `newVendor`, `setLine`, `selectProduct`, `newProduct`, `addLine`, `removeLine`. The server alone
  recomputes taxes, duplicates, validation, status, summary and `ADJUSTED`. Operations are used
  because the `ADJUSTED` rules depend on the kind of action: choosing among candidates marks, an
  unmodified creation does not.
- Concurrency: the read returns the row's `updated`; every write carries it and a mismatch answers
  409 `stale_document`.

### Backend (`com.etendoerp.go`)

- B1 `review` (GET action): document (or the D10 skeleton), recomputed validation, enriched
  candidates (D6), main attachment metadata, `updated`, status, `reviewed`, `adjusted`, invoice
  identifier for `CONFIRMED`.
- B2 `apply` (POST action, operations):
  - Editable only in `PENDING_REVIEW`, `ERROR`, `READY`; 409 `not_editable` otherwise.
  - Recompute after the operations, through `OcrLookups`: `selectVendor` → `vendorAddress` and
    `defaultTax` per line; a date or rate change → `defaultTax` for the affected lines; vendor or
    document number change → `duplicates` plus the shared in-inbox check (D11).
  - Total: `totalSource = lines` follows the lines; `printed` keeps the printed value, and the D3
    warning compares both.
  - Chosen vendor/product must resolve through `vendorById` / a new `productById` (client plus the
    role's readable organizations): an id that does not resolve answers 422.
  - Input caps: lines count, text lengths, numeric bounds, JSON depth (`NeoRequestBodyParser`).
  - Then `InvoiceInboxValidator.validate`, `InvoiceInboxStatusPolicy.apply`,
    `InvoiceInboxSummary.syncFrom`, one transaction.
- B3 `ADJUSTED`: sticky; set by the operation kind and a diff against the stored value (even if
  later reverted); covers the ten cases of the description.
- B4 Validator and status: category and unit required for a new product (D8); `UNREADABLE` (and
  `SERVICE_FAILURE`, decision 9) may move after an edit (D9); an edited `READY` document goes back
  to `PENDING_REVIEW` and `REVIEWED=N` (decision 3).
- B5 `mark-reviewed` (POST action): only a valid `PENDING_REVIEW` → `READY`, `REVIEWED=Y`.
- B6 Shared pieces: extract the in-inbox duplicate check from `InvoiceInboxProcessor` (D11, no
  behaviour change); add `productById` and the enrichment lookups to `OcrLookups` as default methods
  (the precedent is `vendorsByTaxId`), implemented in `PurchaseInvoiceOcrLookups`.
- B7 New actions hidden from MCP (`agentExcludedActions`), declared in neo-headless.md 4.12.9 like
  discard; `actionContracts` if the framework requires them.
- B8 Docs: neo-headless.md 4.6b (review, apply, mark-reviewed, the operation contract, error codes).

### SPA (`etendo_schema_forge`)

- F1 API in `invoiceInboxApi.js`: `fetchReview`, `applyOperations`, `markReviewed`, all through
  `apiFetch` (reads with the default timeout; writes `timeout: 0`).
- F2 `useInvoiceInboxReview`: `useRecordWriteQueue` per document, debounce, "Guardando.../Guardado"
  (`aria-live`), 409 handling (reload and notice), rollback on error, flush before closing or moving
  to another document.
- F3 Drawer on `ui/sheet`: header (reusing the status tag and tones), navigation, closing.
- F4 Viewer: reuse `windows/custom/shared/useMainAttachment.js` (main attachment as a blob, with
  the session) and `UploadedFileViewer.jsx` (PDF through the shared `PdfViewer` + `usePdfZoom`, or an
  image), the same pair the single-invoice OCR side panel (`OcrSidePanel` → `DocumentView`) uses.
  Read only: the inbox must never replace or delete the main document, so none of the hook's write
  operations are wired. Check the image branch for zoom (the PDF one has it).
- F5 Form: supplier (linked, ambiguous, new, none), header, lines (linked, ambiguous, new), totals,
  banners (duplicate with invoice and inbox matches, unreadable, mismatch, confirmed), per-field
  errors from `validation.missing` and the "Revisar" tag. Vendor and product search reuse
  `ocrQuery.js` against the purchase-invoice selectors; category and unit pickers open on the
  committed value (`selectorSelection`).
- F6 Navigation: previous/next over the loaded rows of the current filter (plus "Cargar más" at the
  end), skipping processing rows. Enable row click and the pencil; the kebab stays inert.
- F7 Read-only mode for `CONFIRMED` / `DISCARDED`, with the green banner and invoice link.
- F8 Footer: discard reuses the ETP-6049 dialog and queue; "Confirmar factura" stays disabled with
  "Próximamente" until ETP-6051.
- F9 Repo rules: i18n in `en_US`, `es_ES`, `es_AR`; amounts with `formatCurrency`; quantities with
  `formatGroupedNumber` (explicit fraction digits); dates with `parseCalendarDate`; `data-testid`
  everywhere; after closing, refresh the row and the counters.

### Config, docs and pipeline

- `decisions.json`: the `currentData` / `extractedData` reason now points at the `review` action;
  `make regen ONLY=invoice-inbox` and `sf-validate-pipeline --scope=invoice-inbox`.
- `flags-registry.json`: new backend and frontend paths and test specs; remove the
  `revalidate-on-edit` deferred item; run `make flag-debt` before delivering.
- `docs/generated-custom-windows/invoice-inbox.md` in the same change (intent, data architecture,
  the panel, the new test ids, manual verification).
- Pipeline DEV -> Alex -> Sentinel -> Sage. Branches and PRs through Clerk: `feature/ETP-6050` in
  both repos, target `develop`.

### Tests (testers of each repo, reuse-first: `make find-tests`)

- JUnit (extend `InvoiceInboxValidatorTest`, `InvoiceInboxStatusPolicyTest`,
  `InvoiceInboxHeaderHandlerTest`, `InvoiceInboxProcessorTest` for D11; new only where no file
  covers the unit): `ADJUSTED` matrix, operations, transitions, 409 stale and not editable, tenant
  and organization, flag off, skeleton for `UNREADABLE`, input caps, untrusted text.
- Vitest (extend `invoiceInboxApi.vitest.js`, `InvoiceInboxRowActions.vitest.jsx`,
  `InvoiceInboxPage.vitest.jsx`, `invoiceInboxLocales.test.js`): operations builders, totals math,
  the autosave hook, the ten drawer states, navigation.
- Playwright mocked (reference `e2e/tests/flows/platform/row-quick-actions.mocked.spec.js`): open,
  correct, resolve, mark reviewed, navigate.

### Delivery order (three slices, each behind the `invoice-inbox` flag)

- S1: read, viewer, navigation, read only (B1, B6 lookups, F1, F3, F4, F6, F7).
- S2: edit, autosave, totals, `ADJUSTED` (B2, B3, B6 refactor, F2, partial F5).
- S3: supplier and product resolution, reviewed (B4, B5, full F5). [Rev. 4: absorbed into S2, see section 9.]

## 6. Acceptance criteria to steps

- Panel (drawer, viewer, previous/next, read only): F3, F4, B1, F6, F7.
- Autosave, add and remove lines, totals: B2, F2, F5.
- Errors on the field, duplicate and unreadable warnings: B1, B4, F5.
- Mark as reviewed: B5.
- Supplier ambiguous/new, product ambiguous/new: B2, B6, F5.
- `ADJUSTED` (sticky, the listed cases): B3.

## 7. Risks and what is not verified

- Estimate: Jira says 2d 4h with 2h logged; the scope is much larger.
- Verified in code and in the ETP-6050 database (rev. 2):
  - `GET /sws/neo/attachments/{table}/{id}/main` is not role-checked, only tenant-checked
    (`NeoAttachmentsHelper.handleGetMain`), so a Compras user reads it; the six inbox rows of the
    environment all have a main attachment and `CURRENT_DATA` (usable as test data).
  - PDF from a session blob is already rendered in production by `useMainAttachment` +
    `UploadedFileViewer` + `PdfViewer` (OCR side panel).
  - Compras and Financiero templates grant FULL on Purchase Invoice (183), Product (140) and the
    Invoice Inbox (`TemplateRoleWindowAccess`), which covers the vendor, product, category and unit
    selectors.
- Verified live in the ETP-6050 environment as `goadmin@etendo.software` (Admin role):
  - `GET /sws/neo/invoice-inbox/header/{id}` answers without `currentData` and with `updated`
    (usable as the version token);
  - `GET /sws/neo/attachments/ETGO_Incoming_Document/{id}/main` answers the main attachment and
    `GET /sws/neo/attachments/file/{attachmentId}` downloads it (200, `application/pdf`);
  - selectors answer: `purchase-invoice/header/selectors/C_BPartner_ID` and
    `purchase-invoice/lines/selectors/M_Product_ID` (`?q=&limit=`), and
    `product/product/selectors/M_Product_Category_ID` and `.../C_UOM_ID` (the product spec's entity is
    `product`, not `header`; the answer is `{items, totalCount, hasMore}`).
- Still not verified: the same calls with a Compras role (GOClient has no Compras user; the admin
  bypass does not exercise the role grants).
- Real OCR depends on the isolated copilot container of the ETP-6050 environment.
- The prototype was opened in reader mode; interactions made there were not saved.

## 8. Decisions (user, 2026-11-12)

1. Currency: shown read only, the organization currency. Due date ("Vencimiento"): OUT of this
   story. Recorded debt: the OCR does not extract a due date yet and how to handle it is still open
   (to be treated later). Register it as a deferred item of the `invoice-inbox` feature in
   `flags-registry.json` and in the window guide when the story is delivered.
2. Remembered equivalences (D2): out of Phase 1.
3. Editing a `READY` document sends it back to `PENDING_REVIEW` and clears `REVIEWED`.
4. Total-mismatch warning (D3): included, non-blocking.
5. Line deletion (D7): a trash icon per line, following the existing pattern of `DataTable` row
   delete (`Trash2`, destructive colour, visible on row hover and on keyboard focus,
   `aria-label` `deleteRowTooltip`, spinner while it runs).
6. `FOREIGN_RECEIVER`: discard only. The panel shows the document read only with its reason and
   the only action is Discard (`editable: false`), the same as the single-invoice OCR flow, where a
   receiver tax id mismatch is blocking with no override (`useOcrFlow` → `receiverTaxId`).
7. Execution: `schema-forge-developer` sub-agents this time (plus the testers for tests).
8. New-supplier address: follow the single-invoice OCR criterion (`CreateContactModalAdapter`,
   ETP-5654): structured `address`, `postalCode`, `city`, and the country as a NAME
   (`countryName`) resolved to the country selector, falling back to Spain (ETP-5103,
   `@/lib/defaultCountry.js`); region never seeded; email and phone kept; the category is the one
   the document nature implies (`useContactCategorySeed`, flag `contact-category-type`). In the
   inbox these values are only stored in `CURRENT_DATA`; the contact is created on confirm
   (ETP-6051), which must apply the same criterion.
9. `SERVICE_FAILURE` documents are editable by hand like `UNREADABLE`.

### Decisions S2 (product owner, 2026-11-13; they extend the list above, none of it is edited)

- S2-D1. S2 ABSORBS S3: vendor and product resolution (`selectVendor`, `newVendor`, `selectProduct`,
  `newProduct`), D8, D9, `mark-reviewed` and the full F5 are all in S2. There is no S3 slice any more.
- S2-D2. Discount: taken from the printed document when printed (percent, or an amount the server converts to
  a percent), otherwise typed by the user. GO stores a percent only. Rows read before the change are not re-read.
- S2-D3. A PRINTED total stays printed after the user edits lines (the warning keeps showing the gap).
- S2-D4. Autosave only: 700 ms debounce plus blur; a 409 reloads and drops the unsaved local edits with a notice.
- S2-D5. A NEW line inherits the tax rate of the previous line; with no previous line it takes the vendor's
  `defaultTax` (no rate asked).
- S2-D7. (2026-11-13, replaces the N1 recommendation) Choosing category and/or unit for a NEW product DOES count as modifying the alta and therefore marks `ADJUSTED`: `newProduct` always marks; `newVendor` marks only when its data differ from the extracted data. The SPA only shows the server's `adjusted`.
- S2-D6. Vendor and product search reuse `ocrQuery.js` and the purchase-invoice selectors; the data of a NEW
  vendor follows exactly how the single-invoice OCR flow creates the contact and its address (9.1).

## 9. S2 — edit, autosave, totals, ADJUSTED, line discount, vendor/product resolution, reviewed

Scope: the whole of sections 5 B2-B6 and F2-F8 that S1 left, in one slice (the old S2 and S3 together). Sections
1-7 stay as approved. This section adds the detail and marks what changes in section 5:

| Section 5 item | What S2 does |
|---|---|
| B2 `apply` | All eight operations: `setHeader`, `setLine`, `addLine`, `removeLine`, `selectVendor`, `newVendor`, `selectProduct`, `newProduct`; line `discount` added to `setLine` |
| B3 `ADJUSTED` | The complete matrix (9.3), S1's columns unchanged |
| B4 validator/status | D8 (category and unit of a new product), D9 and decision 9 (`UNREADABLE`/`SERVICE_FAILURE` movable after an edit), decision 3 (edited `READY` goes back) |
| B5 `mark-reviewed` | Its own POST action |
| B6 shared pieces | Duplicate-check extraction (D11); `productById`/enrichment exist from S1; new lookups for category and unit |
| F2 / F5 | Autosave hook, every editable field, ambiguous/new vendor and product, pickers, banners, errors, add/remove line, live totals, Descuento column |
| New | Line discount end to end (9.4); stable line `index` (9.2) |
| `flags-registry.json` | `revalidate-on-edit` closes; `review-edit-and-resolution` closes too (only the confirm remains, ETP-6051) |

Still NOT in S2: confirm and the creation of the vendor/product/invoice (ETP-6051), due date, remembered equivalences,
the document-level discount, the batch "Marcar para revisión".

### 9.1 Vendor and product resolution (what the panel does)

Search reuses the single-invoice OCR flow's helpers, no new query shape (a raw `_neoWhere` is blocked by the WAF):
`ocrQuery.js` (`deriveSelectorUrl`, `buildSearchUrl`, `readSearchRows`) against `purchase-invoice/header/selectors/C_BPartner_ID`
(params `isSOTrx=N`, `isVendor=Y`, as `ocrDocTypes.js` vendor field) and `purchase-invoice/lines/selectors/M_Product_ID`;
category and unit pickers use `product/product/selectors/M_Product_Category_ID` and `.../C_UOM_ID` and open on the committed
value (`selectorSelection.js`, `useLocateCommittedValue`; `committed-selection-policy.test.js` guards it); the new-vendor
country uses `contacts/locationAddress/selectors/C_Country_ID` (the URL `contactApi.js` documents). The server re-validates every id
it receives (`vendorById`, `productById`, new category/unit lookups): the browser only proposes.

Vendor states in the panel (all of S1's markup becomes live): linked (card, "Cambiar" opens the search; the radios of candidates
stay available), ambiguous (radios + "Ninguno · crear proveedor nuevo con los datos extraídos" + error "Elige uno de los proveedores propuestos"),
new (fields name, NIF/CIF, address, postal code, city, country, e-mail, phone, all editable; "Buscar existente"), none (search, or "crear nuevo"
when extracted data exists). Product states per line: linked (chip, "Cambiar" panel with search), ambiguous (candidates, "Ninguno · crear producto nuevo", search),
new (name, category and unit pickers, "Vincular a un producto existente"), none.

**New vendor data = exactly the single-invoice OCR flow's** (decision 8, checked in code): `CreateContactModalAdapter.jsx`
seeds the Contacts window with `buildOcrContactSeed` (`name`, `taxID`, `etgoEmail`, `etgoPhone`) and the `locationAddress` tab with
`buildOcrContactAddressSeed` (`address`, `postalCode`, `city`, and the extracted `country` as `countryName`; region NEVER seeded;
null when all four are empty); the mapping comes from `ocrDocTypes.js` `vendor.createPrefilledFrom`; the country resolves to the selector option by name and
falls back to Spain (`lib/defaultCountry.js`, ETP-5103, aliases España/Spain, never a guessed id); the category is the one the document nature
implies (`useContactCategorySeed` / `useContactCreateTypeGate`, flag `contact-category-type`; with the flag on no customer/vendor flag is seeded). In the inbox NOTHING
is created: S2 stores those fields in `vendor.extracted` (`name`, `taxId`, `address`, `postalCode`, `city`, `countryName`, `email`, `phone`; `country` keeps the
raw printed text) and ETP-6051, on confirm, must apply the same seed (header seed + address child seed + category by nature + country by name with the Spain fallback).
The category is not stored in S2 (it derives from the document nature at confirm). An empty `countryName` is shown as Spain in the panel and stored empty (the fallback is applied at confirm).

### 9.2 CONTRACT (backend and SPA implement against this, in parallel)

All three routes are NEO actions of `InvoiceInboxHeaderHandler` (the spec stays read only). Each is judged after the flag, so a user without the flag
sees 403 `feature_disabled`. All three are hidden from MCP (`agentExcludedActions()`: `discard`, `review`, `apply`, `mark-reviewed`; declared in
neo-headless.md §4.12.9). Wrong verb: 405. Texts are never shown: the SPA translates by `error.code`.

| Route | Verb | Body | Answer |
|---|---|---|---|
| `/sws/neo/invoice-inbox/header/{id}/action/review` | GET | none | review body (below); unchanged from S1 plus the additions of 9.2.4 |
| `.../action/apply` | POST | `{updated, operations[]}` | the review body of the saved row |
| `.../action/mark-reviewed` | POST | `{updated}` | the review body of the saved row |

**9.2.1 Review body** (S1 shape, unchanged): `id, status, errorCode, reviewed, adjusted, updated, editable, fileName, sender, source, created, invoice,
attachment, currency, document`. `updated` is the optimistic-lock token (`NeoDateFormat.toAuditToken`, milliseconds); every answer of `apply` and
`mark-reviewed` carries the NEW one; the SPA sends it back in the body (`apiFetch` injects tokens only into PUT/PATCH).

**9.2.2 Operations** (`operations`: 1 to 50, applied in order on a working copy, the request is atomic; unknown `op`, unknown key or non-object: 400 `invalid_request`):

```json
{ "updated": "2026-11-13T10:12:44.581+01:00",
  "operations": [
    { "op": "setHeader", "documentNo": "FC-0042", "invoiceDate": "2026-11-02" },
    { "op": "setLine", "index": 0, "description": "Tornillo M8", "quantity": 12, "unitPrice": 0.35, "taxRate": 21, "discount": 10 },
    { "op": "addLine" },
    { "op": "removeLine", "index": 3 },
    { "op": "selectVendor", "id": "<C_BPartner_ID>" },
    { "op": "newVendor", "fields": { "name": "ACME SL", "taxId": "B12345678", "address": "Calle Mayor 1",
        "postalCode": "28001", "city": "Madrid", "countryName": "España", "email": "a@acme.es", "phone": "+34 600 000 000" } },
    { "op": "selectProduct", "index": 0, "id": "<M_Product_ID>" },
    { "op": "newProduct", "index": 1, "name": "Tornillo M8", "categoryId": "<M_Product_Category_ID>", "uomId": "<C_UOM_ID>" }
  ] }
```
- `setHeader` (patch: only keys present): `documentNo` (cleaned like `OcrSanitizer.text`, at most 200 chars; over 20 is a validation, `REFERENCE_TOO_LONG`, not a refusal),
  `invoiceDate` (`yyyy-MM-dd`, year 1900-2100; `null`/`""` clears). Any other key (`totalAmount`, `vendor`, `currency`...): 400.
- `setLine`: `index` plus any of `description` (cleaned, at most 200), `quantity`, `unitPrice` (within +/-1e9), `taxRate` (0-100 or null), `discount` (0-100 or null = 0). Scales, HALF_UP:
  quantity 4, unitPrice 4, taxRate 2, discount 4. Out of range or non-number: 422 `invalid_value` `{field, index}`. Editing the description never re-matches the product.
- `addLine`: no payload. New line `{index: max+1 (0 if none), description:"", quantity:1, unitPrice:0, discount absent, product:{state:'none', candidates:[]}}`; `taxRate` = the rate of the
  PREVIOUS line (the last one) when it has one; with no previous line the server asks `defaultTax(locationId, invoiceDate, null)` of the vendor's address and takes the chosen tax and its rate
  (S2-D5; `pending_vendor` and a null rate when the vendor has no address; DEV verifies `PurchaseInvoiceLineHandler.resolveOwned` answers a chosen tax for a null rate). More than 100 lines: 422 `too_many_lines`.
- `removeLine`: `index`; absent: 422 `line_not_found`.
- **Line `index` is a stable id**: never renumbered, a new line takes `max+1`; the validator codes become `line[<index>].tax|product` (position fallback when a document has no `index`), which is what the S1 SPA already assumes.
- `selectVendor {id}`: the id must resolve through `lookups.vendorById` (tenant + readable organizations, a vendor), else 422 `unknown_vendor`. Result `vendor = {state:'linked', matchedBy:'manual', id, name, candidates (kept), extracted (kept), addressState, locationId}`; `vendor_address_missing` notice added/removed; every line with a `taxRate` has its `tax` rebuilt for the new address.
- `newVendor {fields?}`: patch of `vendor.extracted` with the keys `name, taxId, address, postalCode, city, countryName, email, phone` (each cleaned, at most 200; any other key 400). Result `vendor = {state:'new', candidates (kept), extracted (merged), addressState:'UNKNOWN', locationId:null}` (id, name and matchedBy removed); every line's `tax` becomes `{state:'pending_vendor'}`. With no `fields` it is the unmodified creation with the extracted data. Calling it on a `new` vendor is the edit of its data.
- `selectProduct {index,id}`: the id must resolve through `lookups.productById`, else 422 `unknown_product`. Result `product = {state:'linked', matchedBy:'manual', id, name, candidates (kept)}`, any `new` block removed.
- `newProduct {index, name?, categoryId?, uomId?}`: patch of `product.new = {name, categoryId, category, uomId, uom}` (`name` defaults to the line description the first time; `category`/`uom` are the names, resolved server-side in the session language and stored as display copies, ids are the truth; `null` clears). Ids must resolve (new lookups `productCategoryById`, `uomById`), else 422 `unknown_category` / `unknown_uom`. Result `product = {state:'new', id:null, candidates (kept), new}`.
- After the operations, the recompute of 9.2.5 runs.

**9.2.3 `mark-reviewed`** (FINAL case table; checks in order: flag, access, org and tenant, `processing`, the token, then the status):

| Row | Answer |
|---|---|
| valid `PENDING_REVIEW` (validation RECOMPUTED, the stored one is not trusted) | 200: `status = READY`, `REVIEWED = Y`, `updated` moves, `ADJUSTED` and the summary untouched |
| invalid `PENDING_REVIEW` (legacy rows or a lagging status) | 422 `not_valid` with the recomputed `missing`, `updated` (the NEW token) and `documentStatus = ERROR`; the stored status moves to ERROR |
| `ERROR` | 409 `not_reviewable` `{documentStatus}` |
| `READY` with the current token | 200 unchanged (idempotent, nothing written); with an old token: 409 `stale_document` |
| `CONFIRMED`, `DISCARDED`, `FOREIGN_RECEIVER` | 409 `not_editable` `{documentStatus}` |

SPA on `not_valid`: adopt `updated` WITHOUT a reload, set the document status to ERROR and the validation to the answered `missing`, so the footer counter, the field errors and the "Revisar" tag agree; the error is shown with a retry that only re-reads (no write loop).

**9.2.4 Document shapes** (additive over the v1 contract; version stays 1; every reader tolerates the absence):
- line: `discount` (number percent 0-100, scale 4, optional, absent = 0); `index` stable.
- `vendor.matchedBy` may be `manual`; `product.matchedBy` may be `manual`; `product.new = {name, categoryId, category, uomId, uom}` (all optional strings; `category` / `uom` are NAMES resolved from the ids at read time in the request language and present ONLY when the id resolves, the SPA sends ids only, never echoes the names, and shows a committed id without a name as "Desconocido"; S1's SPA already reads `product.new.category/uom` as text);
  `vendor.extracted` gains `countryName` and keeps `country`, `email`, `phone`.
- Validator (D8): a line with `product.state = 'new'` is complete only with a non-blank effective name (`new.name`, else the line description), quantity > 0, price >= 0, AND non-blank `new.categoryId` and `new.uomId`. Existing `new` lines
  written by the worker have no `new` block, so they report `line[i].product` until the user picks category and unit (intended).

**9.2.5 Server recompute** (one transaction; order): (1) operations on a working copy of `CURRENT_DATA`, or the S1 skeleton (persisted by the first effective operation; `EXTRACTED_DATA` is never touched);
(2) tax: lines whose `taxRate` changed, every line with a rate when `invoiceDate` or the vendor address changed, the new line (above), once per distinct rate (`resolved`, `no_tax_at_rate`, `unknown`, `pending_vendor`), using ONE public static
extracted from `InboxLineMatcher.tax`; tax is chosen by RATE only; (3) duplicates when `documentNo` or the vendor changed (`lookups.duplicates` for a linked vendor, `none` otherwise, plus the shared in-inbox check, D11) and the `notices`
(`duplicate_in_inbox`, `duplicate_check_unknown`, `vendor_address_missing`); (4) total: `totalSource = lines` follows the lines (9.4c), `printed` never changes (S2-D3); (5) `validation` recomputed and persisted; (6) status: an
edited `READY` goes back to `PENDING_REVIEW`, `REVIEWED = N` (decision 3), then `InvoiceInboxStatusPolicy.applyAfterEdit` (movable: `PENDING_REVIEW`, and `ERROR` with any code but `FOREIGN_RECEIVER`, so D9, decision 9 and `CONFIRM_FAILED`;
valid -> `PENDING_REVIEW` with `errorCode` null, invalid -> `ERROR` with the verdict's code); (7) `ADJUSTED` (9.3), `setCurrentData`, `InvoiceInboxSummary.syncFrom` (vendor, number, date, total, duplicate), save, flush. A request whose operations are all no-ops writes nothing and `updated` does not move.

**9.2.6 Errors** (NEO envelope; `error.code`):

| HTTP | `error.code` | When |
|---|---|---|
| 400 | `invalid_request`, `missing_updated` | malformed body, unknown op/key, 0 or more than 50 operations, no token |
| 403 | `feature_disabled` | flag off (judged first) |
| 403 | `access_denied` | no write access to the window: `NeoAccessHelper.hasWindowAccess(WINDOW_ID, "POST")` as the upload endpoint does (not verified for `discard`; reported, not widened) |
| 403 | `org_not_allowed` | the row's organization is not writable by the role |
| 404 | `not_found` | another tenant's id or no row |
| 409 | `processing`; `not_editable` `{status}` (CONFIRMED, DISCARDED, FOREIGN_RECEIVER); `not_reviewable` `{status}`; `stale_document` | see 9.2.7 |
| 413 | `document_too_large` | resulting `CURRENT_DATA` over 1 MB |
| 422 | `invalid_value` `{field,index}`, `line_not_found`, `too_many_lines`, `unknown_vendor`, `unknown_product`, `unknown_category`, `unknown_uom`, `not_valid` `{missing}` | operation-level or reviewed refusals |

**9.2.7 Concurrency and order of checks**: flag, verb, access, tenant/org, `processing`, `not_editable`, then the row is locked (`SELECT ... FOR UPDATE`, `InvoiceInboxWorkStore.lockIfProcessing` pattern), THEN loaded and the token judged
(`NeoRecordVersion.isStale(IncomingDocument.ENTITY_NAME, id, token)` if usable for a non-CRUD caller, else string equality at millisecond precision: DEV decides), then the operations. Nothing is written before every operation validated. `discard` bumps
`updated` natively, so a discard racing an edit makes the edit 409. Body cap 64 KB in the handler. SPA on `stale_document`: reload, drop local edits, notice (S2-D4).

### 9.3 `ADJUSTED` (matrix and diff)

Persisted in the existing column `ETGO_INCOMING_DOCUMENT.ADJUSTED` (CHAR(1), `Y`/`N`, default `N`, check constraint, `IncomingDocument.isAdjusted/setAdjusted`): no schema change. S1's `review` already answers it (`adjusted`) and the unreadable banner already hides when it is `Y`.
Sticky: only ever set to `Y`. Rule from the issue ("se activa en el primer ajuste del usuario después de la extracción y no se desactiva"; story 4: "un ajuste (incluso revertido) o una elección entre candidatos marca el documento, un alta sin modificar no"): an operation marks when it CHANGES
what is stored, or when it is one of the decisions the issue lists; reverting is another change, so "even reverted" needs no history. Diff: computed on the working copy BEFORE the recompute, against the stored `CURRENT_DATA` (never `EXTRACTED_DATA`, or reverting would un-mark);
within one request each operation compares with the state left by the previous one; the skeleton is the baseline of a row with no `CURRENT_DATA`.

| Operation (case of the issue) | Marks `ADJUSTED` |
|---|---|
| `setHeader.documentNo` / `invoiceDate` (change header data) | yes if the cleaned value differs from the stored one (null equals `""`) |
| `setLine.description` / `quantity` / `unitPrice` / `taxRate` / `discount` (change line data) | yes if it differs after rounding to the stored scale, compared numerically (10 equals 10.0000); null differs from a number; ABSENT `discount` equals 0 |
| `addLine` / `removeLine` | always |
| `selectVendor` (choose among candidates; change a linked vendor; replace none/new by an existing one) | yes, except re-selecting the id that is already linked |
| `selectProduct` (same, per line) | yes, except re-selecting the id already linked |
| `newVendor` (alta) | NO when it is the unmodified creation (no `fields`, or every field equals the stored `extracted` value) from `ambiguous`, `none` or `new`; YES when any field differs, or when the previous state was `linked` (changing an auto-linked vendor) |
| `newProduct` (alta) | UPDATED in ETP-6051: `NEW_PRODUCT_ALWAYS_MARKS` is now `false`. The server pre-fills a new product's category and unit (from the OCR unit, else the tenant default) and stores each with its source (`ocr` / `default` / `manual`). A `newProduct` marks `ADJUSTED` only when it CHANGES a stored value (a different `categoryId` / `uomId` / name); re-sending the same id is a no-op, and switching ambiguous / none to "create new" without changing the pre-fill does not mark. A user change flips that field's source to `manual` |
| no-op (same value, blur without change, retry), server-derived changes (tax, duplicates, total, status, validation), a refused request | no (nothing written) |
| `mark-reviewed`, confirm, discard, the `review` read | no (not edits) |

Decided by the product owner (S2-D7, 2026-11-13) a `newProduct` always marked `ADJUSTED`; ETP-6051 replaced that (see the row above) so the written KPI ("an alta with the extracted data unmodified does not count") holds; `newVendor` marks only when its data differ from the extracted data (or the previous state was `linked`). The SPA never computes `adjusted`: it only shows what the server returns.

### 9.4 The line discount, end to end

The design gap: the prototype's lines have no discount, so for a discounted line the sum differs from the
printed document. Decided with the product owner and the design author: a per-line discount in
percent, read by the OCR when printed, shown and editable in the panel.

**(a) OCR schema** (`ocr/ocr-config.json`, `purchase-invoice` doc type, `line_items[].items`): two new
properties, both `["number","null"]`:
- `discount_percent`: "Discount percentage printed for THIS line (for example 10 for 'Dto. 10%'). `unit_price`
  stays the price exactly as printed in the price column, before this discount. Null if the line prints no
  per-line discount. NOT a document-level discount."
- `discount_amount`: "Discount amount printed for THIS line, in the document currency, when the discount is
  printed as an amount and not as a percentage. Null otherwise."
Both go in the line's `required` list (strict schema, see the verification below). The `question` string
and the existing keys' descriptions are NOT touched (the question has a test on its first and last words, and
the `unit_price` description would change what the shared flows read).

Server conversion (`InboxLineMatcher.line`, never the LLM): read both through `OcrJson.decimal`
(bounded). Percent wins when it is in (0,100]; else, when the amount is in (0, quantity x unitPrice] and
`quantity x unitPrice` > 0, `percent = amount / (quantity x unitPrice) x 100`, scale 4, HALF_UP; else no
discount. Percent 0, negative, above 100, an amount larger than the gross or a line without quantity or
price: ignored (no discount, no notice: nothing in the SPA renders notices today; the raw values stay in
`EXTRACTED_DATA`). Printing both prefers the percent (the amount is derived from rounded values on the
document). The residual of scale 4 is under half a cent per 10,000 of gross; the 1-cent tolerance covers it.

**What is shared and what the change touches** (verified in the code):
- `ocr-config.json` is read by `OcrConfig` and served by `GET /sws/neo/ocrconfig` (`NeoOcrConfigEndpoint`) to the
  SPA's `purchase-invoice` "Extraer y completar" (`useOcrFlow`, `purchaseInvoiceDescriptor.js`, which reads
  `line.unit_price` by key and ignores the rest), to the MCP OCR tools (`McpOcrTools`, `McpOcrToolDefinitions`,
  same schema, the extraction service) and to the inbox worker; `OcrSanitizer.sanitize` builds the cleaned
  payload FROM the schema's property list, so the two keys appear (null when not read) in every consumer's
  payload and nothing unknown can leak.
- "A new OPTIONAL key is safe" holds only in the strict sense this schema already uses: not optional but
  REQUIRED and nullable. `OcrConfigTest.strictSchema` asserts `additionalProperties:false` on every object
  and every property in `required`, with nullable values; ETP-6048 added `total_amount` exactly that way
  (flags-registry `$gatingComment`: verified manually and by the 577 SPA vitests, no behaviour change). The strict
  structured-output rule of the external extraction service (`structured_output_schema` of
  `CopilotOcrServiceClient`) is not visible from this repo; the evidence is that precedent. A key
  that is in `properties` but not in `required` would likely be refused by a strict service: do not do it.
  First live check of S2: run the single-invoice "Extraer y completar" and one inbox upload against the
  environment's copilot container after the schema change.
- Tests: `OcrConfigTest` (extend `strictSchema` and `schemaEmitsEveryKeyTheSpaReads` with the new line keys),
  `OcrSanitizerTest` (the new keys come out null/number), `InboxLineMatcherTest` (the conversion),
  `NeoOcrConfigEndpointTest` (the served schema carries them). Single-invoice flow: no change of
  behaviour (it keeps ignoring the discount: a known gap of that flow that the new key makes fixable,
  out of this story, to be reported).
- Registry: `$gatingComment` item (b) lists the shared schema additions; add the two keys.

**(b) `CURRENT_DATA` / `EXTRACTED_DATA` v1.** `EXTRACTED_DATA` is the sanitized OCR payload, write-once: new
rows carry `line_items[i].discount_percent` and `discount_amount` (null when not printed); old rows do not
have the keys. `CURRENT_DATA` line: new OPTIONAL number `discount` (percent 0-100, scale 4), emitted only
when greater than 0 and ABSENT meaning 0. The `version` stays 1: the addition is optional and every reader
tolerates its absence (validator ignores it; the S1 SPA ignores unknown keys). `neo-headless.md` §4.6b contract
table gets the line key; `InboxDocument.K_DISCOUNT = "discount"`.

**(c) One formula, both sides: the REAL GO rule.** Verified in the code: a GO invoice/order line holds `listPrice`
(the grid's "Precio"), `etgoDiscount` (percent 0-100, `min 0, max 100` in `artifacts/*/decisions.json`) and
`unitPrice = listPrice x (1 - etgoDiscount/100)` rounded to `PRICE_SCALE = 6` HALF_UP
(`InvoiceLineAmountSupport.applyDiscount`; SPA twin `computeUnitPriceForPost` in `useLineGrossAmount.js`:
`parseFloat((list x (1 - d/100)).toFixed(6))`); `lineNetAmount = quantity x unitPrice` at the currency
precision, `LineAmountSupport.AMOUNT_SCALE = 2` HALF_UP. GO stores a PERCENT only; there is no discount-amount
column. The inbox follows it (inbox `unitPrice` = the price BEFORE discount = `listPrice`):
- `unit6 = round6( unitPrice x (1 - discount/100) )`; `lineNet = round2( quantity x unit6 )`. TWO roundings, in
  that order. It is NOT `round2(quantity x unitPrice x (1 - d))` (my earlier draft), which differs by a cent on
  large quantities of cheap, long-decimal prices.
- `base = sum(lineNet)`; per tax rate: `taxBase = sum(lineNet of the lines with that rate)`,
  `taxAmount = round2(taxBase x rate/100)`; lines without a rate add to the base only (S1 behaviour);
  `linesTotal = base + sum(taxAmount)`. (Tax per rate on the sum of nets is the S1 SPA rule; still to be compared with
  a posted invoice, 9.8 step 4.)
- Java: `BigDecimal`, `setScale(6, HALF_UP)` then `setScale(2, HALF_UP)`. JS: `BigInt` on the inputs scaled to
  their capped decimals (`qS`, `pS`, `dS` = value x 10^4; rate x 10^2), `divRoundHalfAway`:
  `u6 = divRoundHalfAway(pS x (10^6 - dS), 10^4)` (micro-units) and `cents = divRoundHalfAway(qS x u6, 10^8)`;
  `tax cents = divRoundHalfAway(baseCents x rateS, 10^4)`. `Number` arithmetic is not used (the GO SPA's own
  `toFixed(6)` float path is the reason the inbox does not copy it: it can differ from the server by a micro-unit).
- Rate rule (decided with the backend): a line's effective rate is its `taxRate` when it is a number, else `tax.rate` of its resolved `tax` block, else none; the rate is rounded HALF_UP to 2 decimals (RATE_SCALE = 2) BEFORE grouping, so 10.555 and 10.56 are one row; a line with no rate adds to the base only. The shared fixture has cases for the fallback and the rounding.
- OCR schema effect: the `discount_percent` / `discount_amount` descriptions in the SHARED `ocr-config.json` say the unit price is the price BEFORE discount; the single-invoice 'Extraer y completar' flow and the MCP OCR tools ignore the discount, so for a discounted invoice those lines may now show at the gross printed price (known effect; mapping the discount in the single-invoice flow is a follow-up).
- Mismatch (decision 4): a PRINTED total matches when `|printed - linesTotal| <= 1 cent`, in integer cents; only the
  SPA judges it, non-blocking. Re-check: the tolerance already absorbs the per-line rounding of a document
  printed by another system; the second rounding (round6) moves a line by at most `quantity x 5e-7` (0.005 at quantity 10,000), so it
  flips a cent only in a rare near-tie case (the fixture cases); a printed total can therefore differ by one cent from
  the lines total with no real discrepancy, and 1 cent stays (no per-line tolerance scaling).
- Where: new pure `InvoiceInboxTotals` (Java: `unit6`, `lineNet`, `totals(lines)`; used by `apply` for
  `totalSource = lines` and by `InboxMatcher.totalOfLines`, which replaces its own unrounded sum: a declared
  worker behaviour change, cents at most) and `invoiceInboxReviewModel.js` (`lineAmount`, `computeTotals`,
  `documentTotal`, `totalMismatch`). The shared fixture
  `tools/app-shell/__tests__/fixtures/invoice-inbox-totals.json` (SPA repo; read by the Vitest and by the JUnit test, which skips when
  the SPA is not beside the module, the `OcrConfigTest` precedent; superseded 2026-11-18: the Java test now reads its own copy, `invoice-inbox-totals-cases.json`, from its classpath, and the two case files are independent copies that nothing keeps in sync automatically, so a rounding change must update both) must contain: no discount; a plain 10 %; two rates;
  a half-cent line (HALF_UP away from zero) and its negative twin; discount absent vs 0; and the ORDER cases: quantity
  48324, price 0.2771, discount 77.1721 -> real rule 3056.78, exact product 3056.79 (a regression to the one-rounding
  formula fails it); quantity 88782, price 0.5049, discount 26.3805 -> 33000.71 (exact 33000.70); quantity 80422,
  price 0.3477, discount 63.6278 -> 10170.65 (exact 10170.66), each with the expected `unit6` too.

**(d) The Descuento (%) column** (`InvoiceInboxReviewLines.jsx`). S1 grid: `minmax(0,1fr) 62 84 78 86 34` with
`gap-1` (4px): fixed 344 + 20 of gaps = 364px. The form pane is `min(560px, 55%)`, at least 420px, with 20px
padding each side: inner width 380 at the minimum, so TODAY the description already gets 16px there and 156px
at 560. S2 order: Descripción | Cant. | Precio | **Dto. %** | IVA | Importe | action, widths
`minmax(0,1fr) 54 74 52 56 80 30` (= 346 + 24 of gaps = 370): description 150px at 560 (about 6px less than
today), and the stacked layout below. Changes:
- the cell: an input, right aligned, shows `formatGroupedNumber(discount, {maximumFractionDigits: 2})` + `%`, the
  full value in `title`, empty look when 0/absent (placeholder `0`); while focused it shows the plain value
  (`formatPlainDecimal`, ungrouped) and parses with `parseLocaleNumber`; blur normalizes. All numeric cells
  of S2 behave so (money with `formatCurrency` only when not focused). Never `toLocaleString`.
- narrow panes: when the form pane's inner width is below 460px the row stacks (a ResizeObserver, the tool
  the viewer already uses): description on its own row (with the trash), under it Cant. | Precio | Dto. |
  IVA | Importe in a 5-column grid, each cell with a small visible label (the header row is hidden). This
  fixes the 16px description at 420 and absorbs the new column; it is part of S2 and is verified at 1280,
  1024, 768 and the 420 pane.
- the header row gets `Dto.` (`invoiceInboxReviewColDiscount`, "Dto." es / "Disc." en); the read-only compact list
  (confirmed/discarded) adds "Dto. {rate} %" to its detail line only when the line has a discount
  (`invoiceInboxReviewLineDiscountDetail`); the `Importe` cell is `formatCurrency(currency, lineNet)`.
- test ids: `-line-{i}-discount`; i18n keys in `en_US`, `es_ES`, `es_AR` (guarded by `invoiceInboxLocales.test.js`).

**(e) Rows read before the change.** No `discount` and `EXTRACTED_DATA` without the new keys: they read as
0, render an empty Dto. cell, and nothing breaks; if the document printed a discount the printed total
differs from the lines and the non-blocking warning shows. No re-read is planned (the OCR is write-once and
costs AI spend; S2-D2): the user types the discount, which marks `ADJUSTED`. Only documents uploaded after the
schema deploys carry the extracted discount.

**(f) ETP-6051 (confirm) mapping, design note.** Same rule as (c), verified in `InvoiceLineAmountSupport` /
`LineAmountSupport` and `artifacts/purchase-invoice/decisions.json` (`lines.listPrice`, `lines.etgoDiscount`;
`basicDiscounts.discount` is the unrelated promotions tab; `C_InvoiceLine.EM_Etgo_Discount`). Confirm maps inbox
`unitPrice` -> `listPrice`, inbox `discount` -> `etgoDiscount`, and must NOT send `unitPrice` (or send exactly
`listPrice`): a distinct non-zero `unitPrice` wins over the discount (the rule's "U != L" case). The server then
derives `unitPrice` (6 decimals) and `lineNetAmount` (currency precision HALF_UP), which equals (c) for 2-decimal
currencies, so the created invoice total should equal the inbox lines total (a guard for ETP-6051, not S2).

**Document-level discount (out of S2, recorded).** GO also has a header discount, `etgoTotalDiscount` (percent over
the lines subtotal after line discounts; `documentTotals.js` `resolveTotalDiscountPct`, purchase-invoice
`decisions.json`). S2 does not read, show or apply it: the OCR schema has no key for it, the inbox header has no
field. A printed invoice with a global (footer) discount will therefore still show a gap between its printed total
and the lines total in the inbox (the non-blocking warning). A later story would add an OCR key, a header field and
the same percent rule on confirm.

**(g) Doc, registry and KPI.** `neo-headless.md` §4.6b (contract line key, `apply`), the OCR section of the
module docs where `ocrconfig` is described, §4.12.9 (apply hidden from MCP); the window guide
`docs/generated-custom-windows/invoice-inbox.md`; `flags-registry.json` (S2-F8 in 9.6). KPI: the extracted discount keeps
discounted invoices from being counted as "adjusted" only because the AI missed a column; from S2 on every
effective edit marks `ADJUSTED`, so the KPI (invoices generated without adjustments) only starts to be
meaningful with S2. Nothing new to emit (no telemetry event is planned for edits).

### 9.5 Totals (shared decisions)

- Live in the SPA from the effective lines (server value + pending local edits) with the formula of 9.4(c);
  the server recomputes `header.totalAmount` only for `totalSource = lines`.
- `totalSource = printed` (the usual case when the document prints a total) keeps the printed value after any
  edit; the totals card shows the printed total as the document's, the mismatch banner compares both
  (S2-D3). The total cannot be edited in S2 (not in the prototype either).
- Currency precision: 2 decimals as in S1 and the list; a currency with another standard precision is a risk
  (section 9.9), not solved in S2.

### 9.6 Steps (backend and SPA are independent: they meet only at the CONTRACT of 9.2)

Backend (`com.etendoerp.go`), one commit per step:
- B1 OCR + discount read: `ocr-config.json` (two keys, in `required`), `InboxDocument.K_DISCOUNT`, `InboxLineMatcher` conversion and `discount` emission (9.4).
- B2 `InvoiceInboxTotals` (pure, 9.4c) + `InboxMatcher.totalOfLines` delegating + the shared fixture.
- B3 Extract `InvoiceInboxDuplicates` from `InvoiceInboxProcessor` (D11, no behaviour change).
- B4 Validator: line codes by `index`; D8 (`productComplete` with `new.categoryId`/`new.uomId`); `InvoiceInboxStatusPolicy.applyAfterEdit`.
- B5 `OcrLookups` default methods `productCategoryById`, `uomById` (same pattern as `productById`), implemented in `PurchaseInvoiceOcrLookups` (tenant and readable, session-language name through `NeoTrl`); make the `InboxLineMatcher.tax` rebuild a public static.
- B6 `InvoiceInboxApply`: guards, lock, token, the eight operations, recompute, `ADJUSTED` diff, persist; route and `agentExcludedActions` in `InvoiceInboxHeaderHandler`; `InvoiceInboxMessages` keys (new `AD_MESSAGE` rows, ids from `make uuid`, English text, module sourcedata, `export.database`).
- B7 `InvoiceInboxMarkReviewed` (9.2.3) and its route.
- B8 Docs: neo-headless.md §4.6b (contract of 9.2, the `ocrconfig` note) and §4.12.9 (hidden actions); SonarQube on the Java touched (`./cli/sonar-check.sh -q`).

SPA (`etendo_schema_forge`):
- F1 `invoiceInboxApi.js`: `applyOperations(apiFetch, id, updated, operations, signal)` and `markReviewed(apiFetch, id, updated)` -> `{status:'ok', review}` | `{status:'failed', code, httpStatus, field, index, missing}`; `POST`, `timeout: 0`, `apiFetch` only.
- F2 `invoiceInboxReviewModel.js`: exact-decimal `lineAmount`/`computeTotals` with `discount` (9.4c); operation builders; `applyOperationsLocally(document, ops)` (optimistic copy, no derived state); `isReviewReadOnly` driven by `editable`; helpers for `new` product completeness.
- F3 `useInvoiceInboxReviewEditor` (new, wraps `useInvoiceInboxReview`): `useRecordWriteQueue({write})` per document; ONE operation per write; field keys `header:documentNo`, `line:<index>:<field>` (last value wins while a write is open) and unique keys for structural and resolution operations (`add:<n>`, `remove:<index>:<n>`, `vendor:<n>`, `product:<index>:<n>`; they must not coalesce); token in a ref refreshed from every success; text/number inputs commit on blur, Enter and a 700 ms debounce through ONE commit path; a `draft` layer rendered over the last server answer and adopted when the queue is idle; state machine `idle|saving|saved|error` (`saved` returns to idle after 2 s); `write` returns `false` on failure; `flush()` = pending commits + `waitUntilIdle`; 409 `stale_document` / `processing` / `not_editable`: reload, drop drafts, dismissible notice; other refusal or network error: rollback to the last server answer, state `error` with the reason by code, retry re-reads; `beforeunload` guard while saving; `markReviewed()` flushes first.
- F4 Drawer: `readOnly` from the model, `saveStatus` in the header slot (`Guardando…` / `Guardado` / error, `aria-live="polite"`, `data-state`), close and previous/next await `flush()` (on failure stay open and show the error; the X while saving waits), the header status tag follows the answer.
- F5 Header and lines: Nº factura text; date with the shared `date-field` (`parseCalendarDate`/`formatCalendarDate`); lines editable with the Descuento column, the stacked layout (9.4d), the live trash (`Trash2`, `deleteRowTooltip`, hover and focus visible, spinner, no confirmation), "Añadir línea" (`Plus`; focuses the new description); numeric cells show the plain value on focus (`formatPlainDecimal`, `parseLocaleNumber`), `formatCurrency`/`formatGroupedNumber` otherwise.
- F6 Vendor section: search (9.1, `ocrQuery.js`), candidate radios, "Ninguno · crear nuevo", the new-vendor fields (country picker over the contacts selector, empty shown as Spain), "Cambiar", "Buscar existente", per-field errors and the "Revisar" tag from `validation.missing`.
- F7 Product per line: chip + panel live (candidates, search, create new with name, category and unit pickers opening on the committed value, the red per-line error); banners (duplicate, unreadable, mismatch, error codes) unchanged from S1 but now fed by the saved answers.
- F8 Footer: counter from the server's `validation`; "Marcar como revisada" enabled only when `PENDING_REVIEW` and valid, "Revisada por ti" when `READY`; Confirm stays disabled ("Próximamente") until ETP-6051; Discard as ETP-6049.
- F9 i18n (en_US, es_ES, es_AR; `invoiceInboxLocales.test.js`): `invoiceInboxReviewColDiscount`, save states, one key per error code, notices, vendor/product resolution texts not already present.
- F10 Config/docs/registry: `decisions.json` reason text for `currentData`/`extractedData` ("read through `review`, edited through `apply`"), `make regen ONLY=invoice-inbox`, `sf-validate-pipeline --scope=invoice-inbox`; the window guide (editing, resolution, reviewed, discount, new test ids); `flags-registry.json`: remove `revalidate-on-edit` and `review-edit-and-resolution`, add the new files to `paths` and tests to `testSpecs`, add the two OCR keys to the shared-schema list of `$gatingComment`; `make flag-debt`.

### 9.7 Tests (testers, reuse-first: `make find-tests`, `Extended · Rewritten · New` line in the report)

`tester-go` (JUnit, Mockito by default; DB-backed only where noted). Existing files to extend (from `make find-tests`):
- `InvoiceInboxHeaderHandlerTest`: routes and verbs of `apply` and `mark-reviewed`, flag first, `agentExcludedActions` has four names.
- `InvoiceInboxReviewTest` and `InvoiceInboxDiscardIntegrationTest` (WeldBaseTest, extend, do not duplicate): a real row through apply/mark-reviewed, lock and token against a concurrent discard. A NEW `InvoiceInboxApplyTest` and `InvoiceInboxMarkReviewedTest` only because `find-tests InvoiceInboxApply` finds nothing (new units): every refusal of 9.2.6, atomicity, caps, the `ADJUSTED` table row by row (changed, same value, reverted, absent discount = 0, `10` equals `10.0000`, add, remove, `selectVendor` same id vs another, `newVendor` unmodified from ambiguous/none/new vs modified vs from linked, `newProduct` always marks (S2-D7), no-op writes nothing), READY -> PENDING_REVIEW with `REVIEWED = N`, transitions both ways, skeleton persisted by the first edit, index stability after remove + add, tax rebuilt on rate/date/vendor change, new line tax (previous rate; no previous line -> vendor default; no address -> pending), duplicates and notices, summary sync (vendor, number, date, total), `totalSource` lines vs printed, untrusted text, unknown vendor/product/category/unit, `mark-reviewed` (READY idempotent, ERROR 409, invalid 422 with `missing`, valid -> READY/REVIEWED Y, `ADJUSTED` untouched).
- `InvoiceInboxValidatorTest`: codes by `index`, D8 matrix. `InvoiceInboxStatusPolicyTest`: `applyAfterEdit`, `apply` unchanged. `InvoiceInboxSummaryTest`: columns after an edit.
- `PurchaseInvoiceOcrLookupsTest` (+ the vendor-tax-id integration test for the DB side): `productCategoryById`, `uomById` (tenant, inactive, translation fallback).
- `InboxLineMatcherTest`: discount percent, amount -> percent (scale 4, HALF_UP), both present, 0/negative/over 100, amount over gross, no quantity or price, absent = no key. `InboxMatcherTest`: total with discount and the new rounding. `OcrConfigTest`, `OcrSanitizerTest`, `NeoOcrConfigEndpointTest`: the two keys (strict, required, nullable, served). `InvoiceInboxProcessorTest` / `...InboxDuplicatesIntegrationTest`: unchanged behaviour after D11. A NEW `InvoiceInboxTotalsTest` only if no file fits: the shared fixture (9.4c).

`tester-functional` (Vitest, Node test runner, Playwright; extend):
- `invoiceInboxReviewModel.test.js`: exact-decimal amounts, discount, rounding orders (the fixture), mismatch cents, operation builders, `applyOperationsLocally` for all eight operations, `isReviewReadOnly`, `new` product completeness. `invoiceInboxLocales.test.js`: new keys, 3 locales.
- `invoiceInboxApi.vitest.js`: `applyOperations` and `markReviewed` request shape (token in body, POST, `timeout: 0`) and outcomes by code.
- `useInvoiceInboxReview.vitest.jsx` (the editor hook gets its own file only if this would double in size): one write in flight, field coalescing, structural/resolution ops never coalesced, debounce and blur through one path, token refresh, draft over answer, 409 reload + notice, rollback, network error, flush, no write after unmount, `markReviewed` flushes first.
- `InvoiceInboxReviewDrawer.vitest.jsx` (it covers Vendor, Lines, Footer, Banners today; a NEW `InvoiceInboxReviewResolution.vitest.jsx` for vendor/product resolution is justified by size): editable only when `editable`, save states and `aria-live`, Descuento formatting and parse under a comma locale, add/remove line, stacked layout under 460px, vendor ambiguous/new/linked flows, product ambiguous/new flows with committed-value pickers, footer counter and "Marcar como revisada", closing and previous/next wait for the flush, read-only for CONFIRMED/DISCARDED/FOREIGN_RECEIVER. `ocrQuery.vitest.js`: only if a helper is added.
- Playwright mocked (extend `e2e/tests/flows/purchases/invoice-inbox-review-panel.mocked.spec.js`; reference `row-quick-actions.mocked.spec.js`; from `e2e/`, `CI=1`, `--project=mocked`): (1) edit a quantity: "Guardando…" then "Guardado", request body as 9.2.2, amounts and totals live; (2) discount cell with the fixture; (3) add then delete lines, indexes stable; (4) clear the date: answer `ERROR`, "Revisar" tag and status tag; (5) 409 `stale_document` notice + reload; (6) 422 rollback; (7) close while saving waits; (8) previous/next flush; (9) 768px: stacked lines, no horizontal scroll; (10) ambiguous vendor: choose a candidate -> `selectVendor`, address-dependent taxes, error clears; (11) new vendor: edit fields -> `newVendor`; (12) ambiguous product: choose; (13) new product: pick category and unit; (14) valid document: "Marcar como revisada" -> READY, "Revisada por ti", Confirm still disabled; edit afterwards -> back to PENDING_REVIEW; (15) CONFIRMED/DISCARDED/FOREIGN_RECEIVER read only.

### 9.8 Verification plan (live local env, ETP-6050 database, as `goadmin@etendo.software` and a Compras user)

Announce before pipeline steps (the user syncs the sibling modules first); the schema change and the new Java need a Tomcat restart.
1. Data: real OCR needs the isolated copilot container. If it is down, seed rows by SQL (`current_data` with discounted lines, a PRINTED total, ambiguous/new/none vendor and product states; `extracted_data` with the new keys). With the container: upload a PDF with a percent discount and another with an amount; check `extracted_data` and `current_data.lines[].discount`. Run the single-invoice "Extraer y completar" once after the schema change.
2. After every edit: `SELECT status, error_code, reviewed, adjusted, updated, c_bpartner_id, order_reference, invoice_date, grand_total_amount, current_data FROM etgo_incoming_document WHERE ...`. Expect `adjusted = 'Y'` on the first effective edit, still `Y` after reverting, `N` after a blur without change and after an UNMODIFIED vendor/product creation, `Y` after choosing a candidate.
3. Resolution: pick each candidate; search an existing vendor/product (`purchase-invoice` selectors, no 403 from the WAF); create a new vendor unmodified, then edit one field; create a new product with category and unit; confirm no business partner, product or invoice row is created (`c_bpartner`, `m_product`, `c_invoice` counts unchanged); compare the stored `vendor.extracted` address with what the single-invoice OCR flow prefills for the same PDF (same fields, `countryName`, Spain when empty, region absent).
4. Corner cases: `READY` (via `mark-reviewed`) edited -> `PENDING_REVIEW`, `reviewed = 'N'`; `mark-reviewed` with a missing field -> 422 and the footer stays disabled; `UNREADABLE` row completed by hand (vendor created, lines added) -> reaches `PENDING_REVIEW`; `FOREIGN_RECEIVER` 409 and read only; `CONFIRMED`/`DISCARDED`; another tenant's id 404; read-only role 403; flag off 403; two tabs on one document (409 + notice); discard in tab B while A edits; 100 lines then one more; typed `1,5`, `1.5`, `1.000,50`, `abc`, `1e12`, negative and over-100 discount; a 5,000-character description; rapid typing and rapid add/remove (one write in flight, order kept); vendor changed after taxes were resolved (taxes rebuilt); Escape and outside click while saving; reload with an unsaved change; a document number of 21 characters.
5. Totals parity: build by hand, in the purchase invoice window, an invoice with the same lines (discount, two rates, a half-cent line, one of the fixture's order cases) and compare nets, tax rows and total with the panel (verifies the rounding order, 9.4c).
6. Widths: viewport 1280, 1024, 768 and a 420px pane; description never at 0px, no horizontal scroll, full values in tooltips; vendor/product panels usable at 420.
7. After closing: list row, counters and status reflect the edit.

### 9.9 Risks

- Rounding of the tax per rate follows the S1 SPA and is not yet compared with a posted invoice (step 5); the line rule follows `InvoiceLineAmountSupport`.
- The strict extraction schema of the external service is not testable here (9.4a); the precedent is `total_amount`.
- Documents with a document-level discount (`etgoTotalDiscount`), shipping, retentions or tax-inclusive prices still mismatch the printed total; the warning is the only signal.
- A 2-decimal currency is assumed.
- One document (up to 1 MB plus two enrichment lookups) travels per saved field; accepted, reducible later.
- Caps and bounds live in the backend and are mirrored as SPA constants; a drift gives a translated 422 the SPA did not prevent.
- A removed line is not recoverable (no undo, no confirmation).
- The worker's `totalOfLines` moves to the shared calculator: totals shift by cents on documents read after deploy.
- D8 changes the verdict of existing rows with a `new` product and no category/unit: the READ verdict recomputes (S1 behaviour) while the stored status of rows read before deploy stays until their next edit. The feature is unreleased behind the flag, so no data-fix is planned.
- Store-and-forget: the new-vendor/product data is only stored; ETP-6051 must apply the same seed on confirm (9.1) or the two flows will diverge again (ETP-5654 history).
- `discard` was not verified to check the window write access; `apply` and `mark-reviewed` check it themselves. Reported, not widened.

### 9.10 Open questions

Decided by the product owner (2026-11-13), closed: autosave and 409 (S2-D4), printed total (S2-D3), new-line tax (S2-D5), discount source (S2-D2), S2 absorbs S3 (S2-D1), the earlier "S2 not exposed before S3" question is moot. Q6 (rows read before the discount keys: no re-read) is agreed in S2-D2.

No open questions remain. N1 (does choosing category and unit of a NEW product mark the alta?) was decided by the product owner on 2026-11-13: yes, see S2-D7 and 9.3.

## Open findings after live verification (2026-11-13)

Recorded, NOT fixed; the product owner decides later.

1. A second identical `newProduct` on a line that already has the `new` block is a no-op and does not mark `ADJUSTED` (the flag is sticky and the first `newProduct` already marked it, so there is no practical effect). Option: accept it and reword matrix 9.3 ("`newProduct` always marks" becomes "marks when it changes what is stored").
2. A negative `quantity` (-1, -0.5) is accepted by `apply` with 200; the validator requires quantity > 0, so the line is reported invalid. Open question: credit-note lines.
3. `new.category` is stored with the name in the user's DEFAULT session language, not the `Accept-Language` header, so the panel may show "Beverages" in a Spanish UI until the product is re-saved.

NOT verified live:
- MCP `etendo_action` for `discard`, `review`, `apply` and `mark-reviewed` answers HTTP 405 with `error: method_not_allowed` and the message "... is not available through MCP: its customization keeps it for people only. Nothing was run." (`McpRoutingException.actionHidden` is only the Java factory's name, not a wire code).
- A discount given as an AMOUNT in the OCR.
- The unit of measure name in the session language (`c_uom_trl` equals the English name in the test database).
- The 422 `not_valid` of `mark-reviewed` (reconciled in 9.2.3: an ERROR row answers 409 `not_reviewable`, an invalid PENDING_REVIEW row answers 422 and moves to ERROR; the SPA handles both).
- Rows read before the discount keys were deployed.

What the live run DID verify:
- The build, and the DB JUnit tests (27 tests).
- Concurrency and the row lock (a discard racing an edit).
- A non-admin role (`S2 Compras Test`), including the access refusals.
- OCR of a discounted PDF, autosave, and the 409 reload with its notice.
- The `ADJUSTED` matrix (24 cases), and that nothing was created in `c_bpartner`, `m_product` or `c_invoice`.

SPA fixes made after the live run: a code-less 403 on `apply` / `mark-reviewed` (the generic NEO spec gate, "Access denied to spec for current role") is mapped to `access_denied` and shown as a translated no-permission message without a retry button; at 420px and below the form pane is no longer wider than the drawer (`min-w-[min(420px,100%)]`), the footer wraps, and the new-supplier block wraps its header and its postal code / city / country row.


## S2 contract update: validator alignment and tax by id (2026-11-16)

- `validation.missing` may contain `line[i].quantity` and `line[i].unitPrice` (every line needs a numeric quantity and unit price, ANY sign, zero included); it no longer contains `amount` for a zero or negative total, nor `line[i].product` for a new product with quantity <= 0 or a negative price. A skeleton row reports `["vendor","invoiceDate","lines"]`. The SPA maps the two codes to red cells, a translated line error and the footer counter, and keeps no rule against negative / zero quantity or price (credit and return lines; the +-1e9 and scale caps stay).
- Tax by id: `setLine {index, taxId: <id>|null}`; the server validates (active, ValidFrom <= document date or today, SOPOType P/B, tenant) and answers 422 `unknown_tax` with `error.index`; the answer gives `lines[i].tax = {state, matchedBy: 'manual', id, name, rate}` and sets the line's `taxRate` to the tax's rate. The SPA uses the purchase-invoice lines' tax selector (`purchase-invoice/lines/selectors/C_Tax_ID`, `InlineSearchCombo`), shows the tax name, keeps the effective rate `line.taxRate ?? line.tax.rate`, never sends a typed rate, and never guesses the rate of a chosen tax (shown as "…" until the answer unless the option exposes it). A new line inherits the previous line's tax by id.

### Currency scale and tax mode (2026-11-16)

Answers (`review`, `apply`) carry `currency = {id, isoCode, symbol, scale}` (scale = the invoice currency's StdPrecision: 0 for JPY-like currencies, 2 usually; the currency is the vendor's purchase price list currency, else the organization / client currency, stored as `document.header.currencyId`; read only in S2) and `lines[i].tax.docTaxAmount` (`D` document-based amount by rate, `L` line-based). Totals (9.4c amended): `net = round_scale(quantity x unit6)` with `scale = currency.scale`; D lines are grouped per rate and rounded once on the sum of the nets, L lines are rounded per line and summed, a rate may have a D row and an L row (ascending by rate, D before L); effective rate = `taxRate`, else `tax.rate`, scaled to 2 decimals HALF_UP before grouping; default D. Input scales: quantity 4, unit price 6, discount 4, rate 2. The shared fixture has 20 cases with an optional `scale` per case and optional `tax.docTaxAmount` per line; the SPA model test reads the whole file. The mismatch tolerance is one minimal unit of the scale. The SPA formats amounts through `formatCurrency` with the document scale as min / max fraction digits (`invoiceInboxMoney.js`); the list's total cell keeps the organization currency because the list payload has no currency.

## Open findings of this story, status after ETP-6051 (2026-11-17)

Decided by the product owner: the leftovers of ETP-6050 are fixed inside ETP-6051.

- Second identical `newProduct` is a no-op: now expected and documented (matrix 9.3). Closed.
- Narrow viewport (360 / 390 / 420 px): fixed (header wraps the status tag, line inputs in four columns with the
  amount on its own row, footer actions full width under 480px). Checked with screenshots against a mocked
  backend only.
- SPA/backend parity on a non-numeric `taxRate` (`lineRate`): fixed in the SPA (falls back to the resolved tax's rate) and
  pinned by a fixture case; the backend mirrors it.
- SPA fixture in CI: `ETGO_REQUIRE_SPA_FIXTURE=true` is still to be set in the CI job that checks out the SPA repo
  (the totals parity must not skip silently). Open, owned by CI.
  Superseded 2026-11-18: dropped. The JUnit test no longer reads the SPA fixture and the flag no longer exists; closed as dropped.
- W6 (single-invoice "Extraer y completar" and MCP OCR show discounted lines at the gross price): open, a
  separate small follow-up (map `discount_percent` / `discount_amount` in those flows).
- Lines without product, the global two-decimal `formatCurrency` / `round2` assumption, the `Rendered more hooks`
  console error seen once, and the stored language of `new.category`: open, unchanged.
- New in ETP-6051: the printed-total warning rule is aligned (`totalMismatch`, see `ETP-6051-invoice-inbox-confirm.md`).

Superseded 2026-11-18 (S2-D3 and 9.5, "the totals card shows the printed total as the document's"): the big Total of the review panel is now ALWAYS the total computed from the lines, so it matches the invoice that will be created; the printed total only feeds the non-blocking mismatch banner. For a CONFIRMED row the Total (panel and list) is the grand total of the created invoice. See `docs/generated-custom-windows/invoice-inbox.md` and `neo-headless.md` 4.6b.

> Superseded 2026-11-18: the list column Total of a PENDING row is the LINES total (owner decision "the lines always win"), no longer the header/printed total mentioned in 9.5 and the `totalSource = printed` notes above for the list. The panel and the banner rules are unchanged.
