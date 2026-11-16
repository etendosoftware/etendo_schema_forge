# ETP-6050 — Invoice Inbox review panel (plan)

Status: APPROVED rev. 3 (decisions closed 2026-11-12, section 8). Rev. 2 re-checked the plan against
the ETP-6047/6048/6049 code. Implementation starts with slice S1.
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
- S3: supplier and product resolution, reviewed (B4, B5, full F5).

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
