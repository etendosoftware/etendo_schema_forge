# ETP-4315 Implementation Plan — Unify sidebar/preview on a marked real attachment

**Goal:** Eliminate `ETGO_PREVIEW_FILE` entirely. Every document window's preview (system-generated
PDF or externally-supplied file) is backed by exactly one real `AD_Attachment` row per record,
flagged with a new boolean column, instead of a parallel CLOB cache. Fixes the purchase-invoice /
goods-receipt sidebar-vs-preview sync bug as a side effect of removing the second store.

**Design doc:** `docs/plans/2026-08-03-etp-4315-attachment-preview-sync.md` — read it first, it has
the full investigation, rejected alternatives, and the Q&A trail that produced every decision
below. This plan only encodes the *how*; the design doc has the *why*.

**Jira:** [ETP-4315](https://etendoproject.atlassian.net/browse/ETP-4315)

**Repos touched:** `com.etendoerp.go` module in `etendo_core_pg` (backend) + `etendo_schema_forge`
(frontend). Both already have a `feature/ETP-4315` branch checked out.

**Related, explicitly out of scope:** [ETP-4787](https://etendoproject.atlassian.net/browse/ETP-4787)
(stale PDF after reactivate+reconfirm) — pre-existing gap, not touched here.

## Global constraints

- All versioned content (code, comments, commit messages, docs) in **English**.
- Backend: Java 11+, JUnit 4 (`org.junit.Test`), matches sibling tests under
  `modules/com.etendoerp.go/src-test/`. Run via `./gradlew test --tests "..."` from the
  `etendo_core_pg` root — no per-module test task.
- Frontend: Vitest, matches sibling `__tests__/*.vitest.jsx` files already present next to every
  file this plan touches.
- **The human runs all Gradle builds, all `npx`/`make` frontend builds, and all commits.** Every
  "commit" step below is a hand-off: state the staged files and the exact message, then stop.
  Never run `git commit`, `./gradlew`, or `make deploy` on the human's behalf.
- Commit format: `Feature ETP-4315: <description>`, first line ≤ 80 chars, no `Co-Authored-By`
  (Git Police rejects it).
- After any DB model change in `com.etendoerp.go`, remind to run `./gradlew update.database` then
  `./gradlew export.database` (export must follow update, or the model change is lost on rebuild).
- No data migration from `ETGO_PREVIEW_FILE` — pre-production, stakeholder accepted discarding
  existing rows (design doc, Open design question 3).

## Phase 1 — Backend: the column (`etendo_core_pg`) — ✅ DONE (2026-08-14)

- [x] Column `EM_ETGO_IsPreviewMain` (`CHAR(1)`, required, default `'N'`, check `IN ('Y','N')`)
      created on `C_File` (the real physical attachment table — corrected from the doc's earlier
      placeholder name `AD_ATTACHMENT`) via the `CreateColumn` webhook + the mandatory
      `CheckTablesColumnHook` follow-up, per `dev-assistant:etendo-alter-db`. `AD_ELEMENT` had to
      be linked manually (one SQL fallback, per that skill's documented gap for webhook-created
      columns) — see commit `011e796a` in `com.etendoerp.go` for the exact steps.
- [x] Non-unique index `c_file_previewmain_idx` on `(ad_table_id, ad_record_id,
      em_etgo_ispreviewmain)` — added via direct SQL (no webhook for indexes), per the skill's own
      "manual SQL" guidance for that operation.
- [x] Exported to XML (`modules/com.etendoerp.go/src-db/database/model/modifiedTables/C_FILE.xml`
      + `AD_COLUMN.xml`/`AD_ELEMENT.xml`/`AD_TABLE.xml` sourcedata) via `export.database`, reviewed
      line-by-line to strip an unrelated dirty change (`ETGO_ACCOUNT.xml`) that export swept in
      from the same dev DB — committed clean.
- [x] Verified live against the running Postgres instance (`\d c_file`, `pg_indexes`,
      `pg_constraint`) before and after export.

## Phase 2 — Backend: endpoints (`etendo_core_pg`, `NeoAttachmentsHelper.java` /
`NeoBuiltInEndpointHandler.java`) — ✅ DONE (2026-08-14)

- [x] `GET /sws/neo/attachments/{tableName}/{recordId}/main` — `handleGetMain`.
- [x] `PATCH /sws/neo/attachments/file/{attachmentId}/main` body `{isMain: true|false}` —
      `handleMarkMain` / `markAsMain` — delete-old-then-mark-new in one native-SQL transaction.
- [x] `POST /sws/neo/attachments/{tableName}/{recordId}?markAsMain=true` — `handleUpload` extended
      with a `markAsMain` param, resolves the just-created row via
      `findLatestUploadedAttachment` (table+record+name, latest `creationDate`) since
      `AttachImplementationManager.upload()` has no return value.
- [x] `handleList()` excludes `EM_ETGO_ISPREVIEWMAIN='Y'` rows.
- [x] `handleDownloadAll()` rewritten (no longer delegates to `aim.downloadAll`) to build the zip
      itself via `ZipOutputStream`, excluding the main-marked attachment.
- [x] Unit tests — 9 new cases in `NeoAttachmentsHelperTest.java`
      (`handleGetMain*`, `handleMarkMain*`, `handleListExcludesAttachmentMarkedAsMain`,
      `handleDownloadAllExcludesAttachmentMarkedAsMain`) + fixed one pre-existing test that
      asserted the now-removed tab-resolution error path in the old `handleDownloadAll`.
      **42/42 tests pass.** Compiles clean (`./gradlew compileJava`).
- Native SQL used throughout for the new column (no generated DAL property exists yet for
  `EM_ETGO_ISPREVIEWMAIN` — regenerating it would require a build step outside this session's
  scope) — matches `NeoPreviewFileService`'s existing pattern, so no new idiom introduced.

## Phase 3 — Frontend: the new hook (`etendo_schema_forge`) — ✅ DONE (2026-08-14)

- [x] `tools/app-shell/src/windows/custom/shared/useMainAttachment.js` — same public shape as
      `usePreviewAttachment.js` (`{storedFile, isBusy, storeFailed, storeFile, storeBlob,
      storeUrl, deleteFile}`, plus an extra `markExisting` used only by the Phase 6 OCR bridge).
      Takes `tableName` instead of `specName` (table+record already disambiguate — no string
      namespace needed, per the design doc's boolean-column pivot).
  - Mount: `fetchMainAttachment` (new helper in `listAttachments.js`) → `fetchAttachmentBlobUrl`.
  - `storeBlob`/`storeFile`/`storeUrl`: `uploadAndMarkMainAttachment` (new helper, multipart
    `POST .../{tableName}/{recordId}?markAsMain=true`).
  - `deleteFile()`: existing `deleteAttachment` helper (new thin wrapper around the existing
    `DELETE /attachments/file/{id}`, added to `listAttachments.js` for reuse).
  - `GenericPreviewModal.jsx`'s `ManagedLeftPanel` calls **both** hooks unconditionally (Rules of
    Hooks) and picks one via `cfg.useMainAttachment`, passing `documentId: null` to the unselected
    hook so it's a true no-op — zero behavior change for every other window's `attachmentConfig`.
  - **Bug found and fixed during E2E verification:** `shouldManagePanel`'s gate checked only
    `cfg.specName`; purchase-invoice/goods-receipt's new config uses `cfg.tableName` instead, so
    the panel never mounted until the gate was updated to `(cfg.specName || cfg.tableName)`.
- [ ] Dedicated Vitest unit test for `useMainAttachment.js` itself (ported from
      `usePreviewAttachment.vitest.jsx`) — **not yet written**. Current coverage is indirect, via
      the E2E spec and `InvoicePreview.vitest.jsx`/`GoodsReceiptPreview.vitest.jsx`'s existing
      `attachmentConfig` assertions. Still worth adding for fast, isolated coverage.
- [x] `usePreviewAttachment.js` left untouched — still used by every other window.

## Phase 4 — Rewire sales-side windows (`etendo_schema_forge`)

Simplest first: only the write/read target changes, draft-gate logic (`isDraft`) is untouched.

- [ ] `OrderPreview.jsx` (sales-order + purchase-order): swap `usePreviewAttachment` →
      `useMainAttachment` in `attachmentConfig` wiring.
- [ ] `QuotationPreview.jsx` (sales-quotation): same swap.
- [ ] `InvoicePreview.jsx`, sales-invoice branch only (`isSalesInvoice`): same swap. Leave the
      purchase-invoice branch for Phase 5.
- [ ] `GoodsShipmentPreview.jsx`: **new wiring**, not a swap — this window never had
      `attachmentConfig` at all (design doc, Open design question 6, resolved "do it now"). Add
      it mirroring sales-invoice's draft-gated pattern (`storeCondition: !isDraft, sourceBlob:
      pdfBlob`), using `useMainAttachment`.
- [ ] `ReturnToVendorShipmentPreview.jsx`: same new wiring as goods-shipment.
- [ ] Run each window's existing `__tests__/*Preview.vitest.jsx` + add a case for the new
      goods-shipment/return-to-vendor-shipment caching behavior.

## Phase 5 — Rewire purchase-side windows (`etendo_schema_forge`) — ✅ DONE for purchase-invoice
+ goods-receipt (2026-08-14); return-material-receipt still pending

- [x] `InvoicePreview.jsx`, purchase-invoice branch: now `useMainAttachment: true, tableName:
      'C_Invoice'` — the actual bug fix, reads/writes the same `Attachment` row the sidebar uses.
- [x] `GoodsReceiptPreview.jsx`: same swap, `tableName: 'M_InOut'`.
- [ ] `ReturnMaterialReceiptPreview.jsx`: same swap (no visible bug yet, but same latent shape per
      design doc — fix now while touching this code). **Not done this session** — out of the
      literal reported-bug scope (purchase-invoice + goods-receipt only); still on the backlog for
      full parity.
- [x] `OcrSidePanel.jsx` (`AttachmentsView`): removed the `list.find(a =>
      /\.pdf$/i.test(a.name || ''))` heuristic. Now calls `fetchMainAttachment` — sidebar and
      preview resolve identically by construction, no heuristic anywhere.
- [x] Fixed 2 pre-existing test files broken by the `AttachmentsView` change:
      `OcrSidePanel.vitest.jsx` (mock had no `fetchMainAttachment` export — 5 unhandled rejections)
      and `OcrSidePanel.test.js` (regex asserted the old `listAttachments(...)` call shape).
      **10/10 and 16/16 pass.**
- [x] New E2E spec `e2e/tests/flows/attachment-preview-sync.mocked.spec.js` — reproduces the bug
      live-tested against the real dev instance first (uploaded via the sidebar, confirmed the
      preview stayed empty), then automated as a RED test, then confirmed GREEN after the fix.
      **4/4 pass.** Regression-checked against `invoice-preview-persistence.spec.js`,
      `invoice-preview-modal.spec.js`, `attachments.mocked.spec.js`, and the Vitest suites for
      `InvoicePreview`, `GoodsReceiptPreview`, `GenericPreviewModal` (53 + 73 tests, all pass).
- [ ] `invoice-preview-persistence.spec.js` has 4 purchase-invoice-specific test cases still
      asserting the OLD `/preview-file` behavior (correctly, since that's what they were written
      against) — need updating now that purchase-invoice no longer uses `/preview-file` at all.
      **In progress** — delegated to Tester, not yet confirmed green.

## Phase 6 — OCR bridge — ✅ DONE (2026-08-14)

- [x] `OcrInlineUploader.jsx` (the OCR-scan-first document-creation flow, triggered from
      `DetailView`'s `sidePanel` slot for new purchase-invoice records): after `attachFile(...)`
      (the external `AttachFileWebhook` call) succeeds, calls `listAttachments` for the
      newly-created record (expects exactly one result — the record just came into existence, so
      no heuristic is needed) and marks it via `markAttachmentAsMain`. Both steps non-fatal, same
      as the pre-existing `attachFile` failure handling.
- [x] Verified the pre-existing `OcrInlineUploader.vitest.jsx` suite (23 tests) still passes
      unmodified — the new code path isn't exercised by its current mocks (they mock `attachFile`
      itself), so no regression, but:
- [ ] **Not yet added:** a dedicated test covering "new record with exactly one unmarked
      attachment → gets marked automatically" (the actual new behavior). Still on the backlog.

## Phase 7 — Migrate the email-send cache write (`etendo_schema_forge`)

- [ ] `documentEmailSend.js` → `cacheDocumentPreviewFile()`: replace the `POST {neoBase}/preview-file`
      call with `POST {neoBase}/attachments/{tableName}/{recordId}?markAsMain=true`
      (multipart, not JSON — adjust the body construction accordingly, dropping the
      `blobToBase64` round-trip entirely since multipart upload takes the blob directly).
      `tableName` needs resolving from `windowName` (check how other call sites already do this
      mapping — likely a small lookup table already exists somewhere near `useAttachments`
      call sites, since `tableName` and `windowName`/`specName` are different things throughout
      this codebase).
- [ ] Update `documentEmailSend.test.js` / `.vitest.js` and `SendDocumentModal.vitest.jsx`
      accordingly.

## Phase 8 — Migrate the email download link resolution (`etendo_core_pg`)

- [ ] `NeoDocumentDownloadService.handle()`: replace the
      `NeoPreviewFileService.findPreviewFileForClient(...)` lookup with a lookup of the
      `EM_ETGO_ISPREVIEWMAIN='Y'` attachment for `(clientId, tableId, recordId)` from the validated
      token's claims, then stream it via the same `AttachImplementationManager.download()` path
      `handleDownload` already uses.
- [ ] Wrap the lookup+download in `OBContext.setAdminMode()` / `restorePreviousMode()`, scoped as
      tightly as possible around just that call — this preserves the anonymous-but-token-validated
      capability `NeoPreviewFileService` currently gets via disabled org/client filters (design
      doc, Open design question 9). Restore the previous mode even on the error paths (finally
      block).
- [ ] Confirm/accept in the test: an email link sent before a document's marked attachment was
      replaced now 404s (the old attachment was hard-deleted per Phase 2) instead of silently
      serving the new file — this is the accepted behavior change from the design doc, write a
      test asserting the 404, not the old silent-wrong-content behavior.
- [ ] `DocumentDownloadTokenService`: check whether its claims payload needs any adjustment now
      that resolution no longer goes through `specName`+`recordId` against `ETGO_PREVIEW_FILE` —
      likely no change needed (the token still carries `specName`/`recordId`/`clientId`, only the
      *lookup* changes what table it queries), but verify by reading `Claims` usage end to end
      before assuming.

## Phase 9 — Retire the old system

Only after Phases 1-8 are verified working (no more real consumers of the old cache):

- [ ] Delete `NeoPreviewFileService.java` and its test.
- [ ] Delete the `preview-file` routing block in `NeoBuiltInEndpointHandler.java`.
- [ ] Delete `modules/com.etendoerp.go/src-db/database/model/tables/ETGO_PREVIEW_FILE.xml` and run
      `./gradlew update.database` to drop the table (confirm with the human before dropping — this
      is a destructive DB change, even against a dev instance).
- [ ] Delete `usePreviewAttachment.js` and its test.
- [ ] Delete the dead `InvoicePreviewModal.jsx` shim (found during the 2026-08-14 consumer audit —
      already unreferenced, safe to remove independently of the rest of this plan if preferred
      earlier).
- [ ] Final repo-wide grep for `preview-file`, `ETGO_PREVIEW_FILE`, `usePreviewAttachment` to
      confirm zero remaining references before closing the ticket.

## Documentation (MANDATORY per this repo's self-documentation policy)

- [ ] Update `docs/generated-custom-windows/purchase-invoice.md`, `goods-receipt.md`,
      `return-material-receipt.md`, `goods-shipment.md`, `return-to-vendor-shipment.md` to describe
      the new attachment-based preview mechanism where relevant.
- [ ] Update `modules/com.etendoerp.go/docs/neo-headless.md` (backend API reference) with the new
      `/main` endpoints.
