# ETP-4315 — Purchase Invoice / Goods Receipt Attachment-Preview Sync

**Status:** Investigation / Analysis — decision pending (iterative discussion with stakeholder)
**Date:** 2026-08-03
**Jira:** [ETP-4315](https://etendoproject.atlassian.net/browse/ETP-4315)
**Owner:** jortolano (assisted by Forge)
**Type:** plan

## Problem statement (from Jira)

In **purchase invoices** and **purchase goods receipts**, the form shows an attachment UI
(a right sidebar for purchase invoices, a tab for goods receipts) where the supplier's
attached document (PDF/XML) is loaded. This attachment and the one shown in the document
**preview** (the slide-over opened from the list view) are not in sync: the preview does not
show the file loaded in the sidebar/tab, or shows a different file entirely. Expected: both
must always point to the same file.

Scope per the ticket: purchase invoices and purchase goods receipts.

## Live reproduction (confirmed)

Reproduced against the local `etendocorepg` instance (`localhost:3100`, dev server pointed at
`localhost:8080/etendocorepg`) using `goadmin@etendo.software`.

1. **Purchase invoice #10000007** (`C_Invoice`, recordId `6A812B91F529463F915E2173A0DFA394`):
   - Uploaded `etp4315-sidebar-test.pdf` via the form's "Adjuntos" tab / "Archivo" sidebar.
     After a page reload both the sidebar (`OcrSidePanel`) and the "Adjuntos" tab correctly
     show the file (same backend, see [Root cause](#root-cause-two-disconnected-backends)).
   - List-view preview for the same record still showed the empty "Sube tu documento"
     drop-zone.
   - Uploaded a **second, different** PDF directly into the preview's own drop-zone
     (`etp4315-preview-different.pdf`). The preview then showed that file, while the
     sidebar/tab still showed the original `etp4315-sidebar-test.pdf`, unchanged — this is
     the exact "shows a different file" case described in the ticket.
   - Network trace confirmed the preview calls
     `GET /sws/neo/preview-file?specName=purchase-invoice&recordId=...` — a completely
     different endpoint from the one the sidebar/tab use.
2. **Goods receipt #10000007** (`M_InOut`, recordId `55CFA49448CF4751A491693CFCAD4380`):
   - Same pattern: uploaded a file via the "Adjuntos" tab, form correctly shows it; list-view
     preview still shows the empty drop-zone.
   - **Correction to the ticket's wording:** goods-receipt has **no sidebar** — only the
     "Adjuntos" tab (`AttachmentsTab`, `customTabs` in `goods-receipt/index.jsx`). Only
     purchase-invoice has the sidebar + tab combination described in the ticket.

## Root cause: two disconnected backends

| | Sidebar (`OcrSidePanel`, purchase-invoice only) / "Adjuntos" tab (`AttachmentsTab`, both windows) | Preview (list-view slide-over) |
|---|---|---|
| Storage | Real `AD_Attachment` (standard Etendo/Openbravo attachment grid) | Custom table `ETGO_PREVIEW_FILE` (client, org, `RECORD_ID`, `SPEC_NAME`, `FILE_NAME`, `MIME_TYPE`, `FILE_DATA` base64 CLOB), `UNIQUE(AD_CLIENT_ID, RECORD_ID, SPEC_NAME)` |
| Endpoint | `GET/POST/DELETE /sws/neo/attachments/{tableName}/{recordId}` — `com.etendoerp.go` → `NeoAttachmentsHelper.java` (façade over `AttachImplementationManager`) | `GET/POST/DELETE /sws/neo/preview-file?specName=&recordId=` — `com.etendoerp.go` → `NeoPreviewFileService.java` |
| Populated by | OCR ingestion (external `AttachFile` webhook, see below) or manual upload in the "Adjuntos" tab | Only whatever the user manually drops into the preview's own drop-zone, or a system-rendered PDF cache (see [Window inventory](#full-window-inventory)) |

Client code:
- `tools/app-shell/src/windows/custom/shared/OcrSidePanel.jsx` (purchase-invoice sidebar)
- `tools/app-shell/src/components/attachments/AttachmentsTab.jsx` + `useAttachments.js`
  (goods-receipt tab, and any other window's "Adjuntos" tab)
- `tools/app-shell/src/windows/custom/shared/usePreviewAttachment.js` +
  `GenericPreviewModal.jsx` (the preview's left panel, `ManagedLeftPanel`)
- `tools/app-shell/src/windows/custom/shared/InvoicePreview.jsx` /
  `goods-receipt/GoodsReceiptPreview.jsx` (per-window preview wiring)

Design history: `docs/plans/completed/2026-05-13/2026-05-11-generic-preview-infrastructure.md`
(branch `feature/ETP-3951`) documents `ETGO_PREVIEW_FILE` as a deliberate, generic,
document-type-agnostic cache, explicitly built to avoid coupling to `AD_Attachment`/`AD_Image`.
The doc's own problem statement (*"Purchase invoice attachment is lost on close"*) shows the
original ad-hoc drop-zone was never wired to the real attachment the OCR flow already stores —
instead a second, parallel store was built. That is the origin of ETP-4315.

## Full window inventory

| Window | What the preview should show | Real `AD_Attachment` UI elsewhere? | Conclusion |
|---|---|---|---|
| **purchase-invoice** | Supplier's real attachment | Yes — `OcrSidePanel` (sidebar) | **Bug — in scope** |
| **goods-receipt** | Supplier's real attachment | Yes — `AttachmentsTab` (tab), `tableName: 'M_InOut'` | **Bug — in scope** |
| return-material-receipt | Customer-supplied return receipt (optional) | No (no attachments tab wired today) | Same shape (pure drop-zone), but no visible divergence yet — out of scope for now |
| sales-invoice | System-rendered PDF (`useInvoicePdf`) | No | `ETGO_PREVIEW_FILE` is the right tool — do not touch |
| sales-order | System-rendered PDF (`useOrderPdf`) | No | Do not touch |
| purchase-order | System-rendered PDF (`usePurchaseOrderPdf`) — purchase-side but still 100% generated, no supplier scan involved | No | Do not touch |
| sales-quotation | System-rendered PDF | No | Do not touch |
| goods-shipment, return-to-vendor-shipment | System-rendered PDF, not even cached in `ETGO_PREVIEW_FILE` today | No | **In scope (2026-08-14): add caching now, for consistency** — see Open design question 6 |

**Key distinction:** the deciding factor is not "purchase vs. sales" — `purchase-order` is
purchase-side but 100% system-generated (no supplier scan to sync with), same shape as
sales-order/quotation. The real split is **externally-supplied document** (purchase-invoice,
goods-receipt) vs. **system-generated document** (everything else).

## Ownership clarification — `AttachFile` webhook vs. our own attachment REST surface

Two different write paths land in `AD_Attachment`, owned by two different modules:

1. **OCR ingestion on new-document creation**: `AttachFile` webhook
   (`com.etendoerp.copilot.toolpack.webhooks.AttachFileWebhook`) — owned by the **external**
   `com.etendoerp.copilot.toolpack` module (binary-only in this environment; no source checked
   out even after adding `com.etendoerp.copilot`, since `toolpack` is a separate module).
   Decompiled bytecode confirms it does nothing more than:
   ```java
   AttachImplementationManager m = WeldUtils.getInstanceFromStaticBeanManager(AttachImplementationManager.class);
   m.upload(new HashMap<>(), tabId, recordId, fileName, file);
   ```
   i.e. a thin wrapper around Etendo's own core attachment manager, used specifically for the
   "attach the scanned file when creating a brand-new invoice via OCR" flow. The metadata map
   passed is empty — no category/tag is set at write time either.

2. **General attachment CRUD** (list / manual upload / download / delete / update-description) —
   used by **both** `OcrSidePanel`'s read path and `AttachmentsTab` — is **100% ours**:
   `com.etendoerp.go` → `NeoAttachmentsHelper.java` / `NeoBuiltInEndpointHandler.java`, exposed
   at `/sws/neo/attachments/*`. Its own Javadoc: *"façade over `AttachImplementationManager` so
   the React Attachments tab can list, upload, download, delete and update-description without
   each window having to declare its own handler."*

**Implication:** making the preview read the real attachment requires zero dependency on the
external copilot module — it only needs to consume our own already-existing
`GET /sws/neo/attachments/{tableName}/{recordId}` and `GET /sws/neo/attachments/file/{id}`
endpoints, exactly like `OcrSidePanel` and `AttachmentsTab` already do.

## No real distinction between "the sidebar file" and "a regular attachment"

Verified byte-for-byte: `listAttachments.js` (used by `OcrSidePanel`) and `useAttachments.js`
(used by `AttachmentsTab`) hit the **exact same URL**,
`${base}/sws/neo/attachments/${tableName}/${recordId}`, with no query params, no category, no
filter. There is no field anywhere (write side or read side) tagging "this is the OCR-ingested
supplier document" vs. "this is just any other attachment."

`OcrSidePanel.jsx` (`AttachmentsView`, lines 61-96) decides what to render inline via a pure
client-side heuristic, with **no explicit sort**:
```js
const list = await listAttachments({ token, tableName, recordId, apiBaseUrl });
const firstPdf = list.find(a => /\.pdf$/i.test(a.name || ''));
```
If a second unrelated PDF is uploaded via "Adjuntos" and happens to sort earlier in whatever
order the backend returns, the sidebar itself could start showing the wrong file — a
pre-existing ambiguity, independent of ETP-4315, worth fixing in the same pass (e.g. add an
explicit sort by `creationDate` before the `.find()`).

## Update 2026-08-14 — full preview-mechanism deep dive (all document windows)

**Why:** stakeholder decided a fix scoped to purchase-invoice/goods-receipt only is not
enough — several other windows share the same preview infrastructure, so the redesign must
be general. This section maps exactly how every document window's preview currently decides
what to render and when it touches `ETGO_PREVIEW_FILE`, confirmed by fresh code reading
(file:line citations below).

### Shared plumbing (one mechanism, reused everywhere)

Every window's preview is wired through the same three pieces:
- `usePreviewAttachment.js` (`tools/app-shell/src/windows/custom/shared/`) — GET/POST/DELETE
  against `/sws/neo/preview-file`. Only active when the caller passes
  `storeCondition/documentId/specName/token` truthy (`usePreviewAttachment.js:44`); otherwise
  a pure no-op.
- `GenericPreviewModal.jsx` → `ManagedLeftPanel` — mounts `usePreviewAttachment` only when
  `attachmentConfig` is supplied at all (`shouldManagePanel`, `GenericPreviewModal.jsx:252`).
  Its auto-store effect (`GenericPreviewModal.jsx:44-58`) is the **only** write gate:
  `if (attachment.storedFile || attachment.isBusy) return;` — i.e. "don't POST twice per
  mount," nothing more.
- `usePdfGenerator` (`pdfUtils.js:287-331`) — fetches header+lines and renders a PDF via
  jsreport **unconditionally on every mount** (`useEffect` deps: `[recordId, apiBaseUrl,
  token]` only). It never checks the cache before rendering — confirmed independently by both
  sub-investigations, same lines as the 2026-08-03 side-finding.

Each window feeds this shared machinery an `attachmentConfig` object per-record. The object's
shape is what actually decides the behavior — there is **no separate "mode" concept**, only
which fields happen to be set:

| Field | Effect |
|---|---|
| `storeCondition` | Gates whether `usePreviewAttachment` does anything at all |
| `sourceBlob` | A freshly generated PDF blob to hand to the cache for storing (system-generated-PDF windows) |
| `autoFetch` | Whether to auto-GET the cache on mount |
| `specName` | The cache-tuple key (`ETGO_PREVIEW_FILE.SPEC_NAME`) |

### Per-window table

| Window | specName | Impreso / left panel | PDF hook | `attachmentConfig` | Cache read | Cache write |
|---|---|---|---|---|---|---|
| sales-order | `sales-order` (`sales-order/index.jsx:75`) | Client PDF, `useOrderPdf` (`useOrderPdf.js:5-20`, shared `documentPdf.js` template) | always rendered | `storeCondition:!isDraft, sourceBlob:pdfBlob` (`OrderPreview.jsx:97,148-150`) | only if not Draft | only if not Draft, once per mount |
| purchase-order | `purchase-order` (`purchase-order/index.jsx:95`) | Same `OrderPreview.jsx` component, `usePurchaseOrderPdf.js:5-20` | always rendered | identical draft gate, same file/lines | same | same |
| sales-quotation | `sales-quotation` (hardcoded, `QuotationPreview.jsx:135,142`) | `useQuotationPdf.js:82-98` (own `buildQuotationData`, shared template) | always rendered | identical draft-gate pattern (`QuotationPreview.jsx:96,129-145`) | only if not Draft | only if not Draft |
| sales-invoice | `sales-invoice` (`sales-invoice/index.jsx:212`) | `useInvoicePdf` → `usePdfGenerator` | always rendered | `storeCondition:!isDraft, sourceBlob` (`InvoicePreview.jsx:31,236-265`) | only if not Draft | only if not Draft |
| **purchase-invoice** | `purchase-invoice` (`purchase-invoice/index.jsx:226`) | **Should be** real supplier attachment; **is today** the cache drop-zone | — | `storeCondition:true` (unconditional), `autoFetch:false`, no source (`InvoicePreview.jsx:266-273`) | always (manual upload into the cache drop-zone) | always |
| **goods-receipt** | `goods-receipt` | Same bug shape as purchase-invoice | — | `storeCondition:true` unconditional, `autoFetch:false` (`GoodsReceiptPreview.jsx:120-127`) | always | always |
| goods-shipment | *(none found)* | `useShipmentPdf` → `usePdfGenerator`, shown directly | always rendered | **no `attachmentConfig` passed at all** (`GoodsShipmentPreview.jsx:118-126,228-237`) | never | never |
| return-to-vendor-shipment | *(none found)* | `useReturnToVendorPdf` → `usePdfGenerator` | always rendered | none (`ReturnToVendorShipmentPreview.jsx`) | never | never |
| return-material-receipt | `return-material-receipt` | Same bug shape as purchase-invoice (comment: *"Replaces the system-generated PDF"*) | — | `storeCondition:true` unconditional, `autoFetch:false` (`ReturnMaterialReceiptPreview.jsx:45-52`) | always | always — no real `AD_Attachment` UI wired elsewhere yet, so no visible divergence today, but same latent shape |

### What this changes about the fix design

1. **The abstraction we need already half-exists.** `attachmentConfig` is the single
   extension point every window already goes through. Today it's overloaded to mean two
   different things by omission/inference: "cache a client-generated PDF" (when `sourceBlob`
   is supplied) vs. "expect the user to drop an external file into this same drop-zone" (when
   it isn't). A general fix should make this an **explicit third mode** — e.g. a
   `source: 'generated-pdf' | 'external-attachment'` discriminator — rather than continuing to
   infer it from which fields happen to be set. `external-attachment` mode would point
   `usePreviewAttachment` (or a sibling hook with the same `{storedFile,isBusy,...}` shape) at
   `/sws/neo/attachments/{tableName}/{recordId}` instead of `/sws/neo/preview-file`.
2. **Three real categories exist, not two** (**resolved 2026-08-14, see Open design question 6**:
   goods-shipment/return-to-vendor-shipment get folded into the first category, in scope for this
   ticket, not deferred):
   - *Generated, cached when non-Draft*: sales-order, purchase-order, sales-quotation,
     sales-invoice, **+ goods-shipment, return-to-vendor-shipment (new wiring, not previously
     cached at all — added now for consistency)**.
   - *Externally-supplied, wrongly cached today*: purchase-invoice, goods-receipt,
     return-material-receipt — all three share the identical `storeCondition:true` unconditional
     wiring and all three need the new `external-attachment` mode. `return-material-receipt` has
     no visible bug yet only because nothing else attaches a real file to it today — it will
     surface the same divergence the moment it does, so it belongs **in scope**, not just
     purchase-invoice/goods-receipt.
3. **The Draft/Completed gate only ever controls the generated-PDF path.** It's irrelevant to
   the external-attachment category — those three windows cache unconditionally regardless of
   status, which is consistent with "there's no PDF to avoid re-rendering," but means whatever
   general design we land on must not accidentally introduce a draft gate on file uploads.
4. **The client-side PDF is always regenerated on every open even on a cache hit** (`pdfUtils.js:287-331`),
   for every generated-PDF window without exception — confirmed here across all of sales-order,
   purchase-order, sales-quotation, sales-invoice, goods-shipment, return-to-vendor-shipment.
   Only the *store* step is deduped. Not part of ETP-4315's fix, but worth folding into the same
   redesign if we're touching this shared code anyway (separate follow-up ticket otherwise).
5. **`OcrSidePanel.jsx`'s missing sort is still present** (`OcrSidePanel.jsx:77-81`,
   `list.find(a => /\.pdf$/i.test(a.name || ''))`, no explicit sort before `.find()`) —
   unchanged since 2026-08-03. Whatever the sidebar treats as "the" document, the new
   `external-attachment` mode must resolve **identically**, so this needs a fix in the same pass
   (e.g. sort by `creationDate` descending before picking) regardless of where the general
   redesign lands.
6. **Related backend finding (separate concern, own ticket candidate):** `NeoPreviewFileService`
   (`modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/NeoPreviewFileService.java:180-191`,
   in the `etendo_core_pg` backend repo) resolves `specName`/`recordId` with
   `setFilterOnReadableOrganization(false)` and no cross-check against the actual business
   record, fully trusting client-supplied query params. Doesn't block this redesign (we're not
   touching that code, just routing 3 more windows away from calling it), but worth a security
   ticket independent of ETP-4315.

## Design decision 2026-08-14 — replace `ETGO_PREVIEW_FILE` entirely with a marked real attachment

**Confirmed with stakeholder: this is not a purchase-invoice/goods-receipt-scoped fix anymore.
`ETGO_PREVIEW_FILE`, `NeoPreviewFileService`, `NeoDocumentDownloadService`, and
`DocumentDownloadTokenService`'s spec/record resolution are all slated for replacement, for
every window that currently uses them.** The replacement mechanism: mark the one real
`Attachment` row that represents "the document for this preview" with a new column, instead of
duplicating file bytes into a parallel cache table.

### The column

New extension column `EM_ETGO_ISPREVIEWMAIN` (CHAR(1), check `IN ('Y','N')`, default `'N'`) on
`C_FILE`, added via `modifiedTables/C_FILE.xml` — the exact same mechanism this
module already uses a dozen times for `C_Invoice`, `C_Order`, `M_InOut`, `AD_Role`,
`C_BPartner`, etc. (see `modules/com.etendoerp.go/src-db/database/model/modifiedTables/`,
`etendo_core_pg` repo). No precedent existed yet for extending `C_FILE` specifically, but
nothing about the table makes it special — same pattern, same risk profile.

**Boolean, not a spec-name string** — revised after stakeholder pushback. `ETGO_PREVIEW_FILE`
needed `SPEC_NAME` as a string because it's a flat table with no real FK to the business record —
`RECORD_ID` alone doesn't say what kind of document it is, so the string was the only namespacing
mechanism available. `C_FILE` already carries a real `AD_Table_ID` + `Record_ID` FK — the
document's type is already unambiguous from the record itself (a `C_Invoice` row with `SOTrx='N'`
is a purchase invoice, never simultaneously a sales invoice). A `(table, record)` pair never needs
two different "main documents" for two different specs at once, so a plain boolean fully captures
the invariant with nothing lost. One marked row per `(AD_Table_ID, RECORD_ID)` is the invariant we
need — see enforcement below. Add a non-unique index on `(AD_Table_ID, RECORD_ID,
EM_ETGO_ISPREVIEWMAIN)` for lookup speed; uniqueness itself is enforced at the application level
(see Complications).

### Endpoints (extend `NeoAttachmentsHelper`)

| Endpoint | Purpose |
|---|---|
| `GET /sws/neo/attachments/{tableName}/{recordId}/main` | Lookup: metadata of the marked attachment for this record, or `{}` if none |
| `POST /sws/neo/attachments/{tableName}/{recordId}?markAsMain=true` | Existing upload endpoint, extended: upload + mark atomically, **deleting** any previously-marked attachment for this record in the same transaction |
| `PATCH /sws/neo/attachments/file/{attachmentId}/main` body `{isMain: true\|false}` | Mark/unmark an **existing** attachment — covers "pick from list" and the OCR bridge (below). Marking (`isMain:true`) deletes the previously-marked attachment, if any, same transaction |
| `DELETE /sws/neo/attachments/file/{attachmentId}` | Unchanged — already deletes the file outright, reused as-is |
| `GET /sws/neo/attachments/{tableName}/{recordId}` (list) | Default changes to exclude `EM_ETGO_ISPREVIEWMAIN='Y'` rows, no query param needed |
| `GET /sws/neo/attachments/{tableName}/{recordId}/zip` (downloadAll) | Same exclusion — preview already has its own dedicated download button for that file |

The mark/unmark step (`PATCH .../main` and the `markAsMain` upload path) does "clear any other
row sharing `(AD_Table_ID, RECORD_ID)` → set this one" inside one transaction — the application-
level enforcement described below.

### Frontend — new hook, same contract

Replaces `usePreviewAttachment.js` with a sibling (e.g. `useMainAttachment.js`) exposing the
identical `{storedFile, isBusy, storeBlob, storeFile, storeUrl, deleteFile}` shape so
`GenericPreviewModal`/`ManagedLeftPanel` needs no structural change:
- Mount: `GET .../main` (no `specName` needed anymore) → `fetchAttachmentBlobUrl` (already
  exists, already verified) for the blob.
- `storeBlob(blob, fileName, mimeType)`: `POST .../{tableName}/{recordId}?markAsMain=true` with
  the blob as multipart — same call whether the blob came from jsreport (sales side) or a manual
  drop (purchase side).
- `deleteFile()`: existing `DELETE /sws/neo/attachments/file/{id}`, unchanged.

**Free side effect:** `OcrSidePanel.jsx`'s unsorted `list.find(/\.pdf$/)` heuristic becomes dead
code — the lookup now gives a definitive answer, so that pre-existing ambiguity bug disappears
without touching that file directly.

### Bridging `AttachFileWebhook` (OCR) into the mark

We don't control that webhook, so it can't set `EM_ETGO_ISPREVIEWMAIN` itself. But the moment a
new document is created from a scan is the one moment ambiguity is impossible: the record just
came into existence, so it cannot yet have more than one attachment. The frontend, once it knows
the newly created `recordId`, calls `GET .../{tableName}/{recordId}` (expects exactly one result)
and marks it via `PATCH .../main` — no heuristic needed, because at that instant there is only one
candidate.

### Consumer audit 2026-08-14 — confirmed exhaustive before writing the implementation plan

Full repo grep (`usePreviewAttachment`, `GenericPreviewModal`, `preview-file`, `ETGO_PREVIEW_FILE`)
across both `etendo_schema_forge` and `etendo_core_pg`/`modules/com.etendoerp.go`, to make sure no
consumer of the cache we're about to remove goes unaccounted for.

- **Window inventory confirmed complete** — the 9 windows in the per-window table above
  (`GenericPreviewModal` consumers) are the full list. `InvoicePreviewModal.jsx` is dead code
  (`// Replaced by InvoicePreview.jsx + useInvoicePreview.js + GenericPreviewModal.jsx`, a bare
  re-export) — not a real consumer, flag for deletion during cleanup, not a migration target.
- **Third write path found, not previously accounted for:** `documentEmailSend.js` →
  `cacheDocumentPreviewFile()` does `POST {neoBase}/preview-file` **directly**, bypassing
  `usePreviewAttachment.js`/`GenericPreviewModal.jsx` entirely. Called from `SendDocumentModal.jsx`
  (the "Enviar" button/modal) right before the email-send contract call, to guarantee the download
  link has the freshest blob at send time regardless of whether the list-view preview already
  cached it on open. Confirmed callers (grep on `SendDocumentModal`/`sendDocumentEmail`):
  `sales-invoice`, `sales-order`/`purchase-order` (via `OrderPreview.jsx`), `sales-quotation`,
  `goods-shipment` — all windows already in the inventory above, no new window introduced.
  Purchase-invoice never produces a `pdfBlob` (external-attachment category, no PDF hook), so this
  path is a no-op for it (`resolvePreviewBlob` returns `null` → `{skipped: true}`) — no special
  handling needed there.
  **Action item added to the implementation plan:** `cacheDocumentPreviewFile()` must be migrated
  to call `POST /sws/neo/attachments/{tableName}/{recordId}?markAsMain=true` instead of
  `/preview-file`, or the "Enviar" button breaks the moment `/preview-file` is retired.
- **Backend confirmed exhaustive too**: only three Java files ever reference
  `ETGO_PREVIEW_FILE`/`NeoPreviewFileService`/`preview-file` —
  `NeoBuiltInEndpointHandler.java` (routing), `NeoPreviewFileService.java` (the service itself),
  `NeoDocumentDownloadService.java` (email download links). No other backend consumer exists.

### Suggested implementation order

1. Column + index + `AD_COLUMN` seed (`com.etendoerp.go`).
2. Extend `NeoAttachmentsHelper`/`NeoBuiltInEndpointHandler` with the endpoints above + list/zip
   exclusion filter.
3. New frontend hook.
4. Rewire sales-side windows first (simplest — only the write/read target changes; includes
   adding `attachmentConfig` fresh to goods-shipment and return-to-vendor-shipment per open
   question 6), then purchase-side, then the OCR bridge.
5. Migrate `documentEmailSend.js`'s `cacheDocumentPreviewFile()` to the new mark endpoint —
   same time as step 4's affected windows (sales-invoice, sales-order, purchase-order,
   sales-quotation, goods-shipment), since it's the same call site's alternate write path.
6. Migrate `NeoDocumentDownloadService` (admin-mode carry-over, open question 9), only then retire
   `ETGO_PREVIEW_FILE`/`NeoPreviewFileService`.
7. Delete dead code: `InvoicePreviewModal.jsx` shim.

### Correction — `AttachFileWebhook` is not what we migrate onto

Initial framing conflated two different things. Clarified:

- `AttachFileWebhook` = `com.etendoerp.copilot.toolpack.webhooks.AttachFileWebhook`, owned by the
  **external, binary-only** `com.etendoerp.copilot.toolpack` module (distinct from
  `com.etendoerp.copilot`, which does have source in this repo and was already ruled out as
  unrelated). Decompiled bytecode: a thin wrapper that calls
  `AttachImplementationManager.upload(...)` — used specifically to attach the OCR-scanned
  document when a purchase-invoice/goods-receipt is created via the scan-first flow. We don't own
  it, don't have its source, and cannot extend it to also set `EM_ETGO_ISPREVIEWMAIN`.
- What we actually migrate onto is **the same underlying primitive `AttachFileWebhook` itself
  calls** — `AttachImplementationManager`, via **our own** `NeoAttachmentsHelper` (extended with
  the new mark/lookup logic). For the OCR-scan-first case, the frontend already has the file at
  hand when it triggers the OCR flow — it calls our own "mark as main" endpoint right after,
  independent of whatever `AttachFileWebhook` did. No dependency on the external module's
  internals either way.
- The **draft/completed caching gate itself is 100% preserved** — it's frontend logic deciding
  *when* to write, entirely independent of *where* it writes. Swapping the write target from
  `POST /sws/neo/preview-file` to `POST /sws/neo/attachments/{tableName}/{recordId}` + mark
  changes nothing about the gate condition.

### Q&A resolved this round

1. **Cache-gate migration** — possible, no complication; gate logic (`isDraft`) stays in the
   frontend unchanged, only the write target changes (see above).
2. **`AttachFileWebhook` location** — `com.etendoerp.copilot.toolpack`, external/binary, not core,
   not `com.etendoerp.copilot`.
3. **"Adjuntos" tab must not show the marked attachment** — confirmed, filter it out of
   `handleList()`'s response by default. **Stakeholder correction:** `handleDownloadAll` (the zip)
   must **also exclude it** — the preview already has its own dedicated download button for that
   specific document, no need to duplicate it into "download all."
4. **Generalize everything Preview supports (upload in purchase, render-only in sales) onto the
   new mechanism** — confirmed in scope. Sales-side keeps rendering via jsreport client-side
   unchanged; only the cache write/read target moves from `ETGO_PREVIEW_FILE` to a marked
   `Attachment`. Purchase-side keeps the upload-only UX; only the marking mechanism changes from
   implicit-by-upsert to an explicit mark call.

### Complications identified

- **Uniqueness enforcement**: Etendo's declarative table-model XML only expresses full-table
  `<unique>` constraints (see `ETGO_PREVIEW_FILE.xml`), not a partial/conditional unique index
  (`WHERE EM_ETGO_ISPREVIEWMAIN = 'Y'`) — no precedent found confirming the DB-model tooling
  supports that. **Decision: enforce at application level instead** — within one transaction,
  clear any other row sharing `(AD_Table_ID, RECORD_ID)` before setting the new one, same
  upsert-style pattern `NeoPreviewFileService` already uses safely today. Avoids depending on an
  unconfirmed DB feature.
- **Multi-file documents** (PDF + XML for SII/e-invoicing on purchase-invoice, per the rejected
  reverse-plan analysis below): the mark means "the file this preview renders," not "every
  compliance file for this document." Unmarked files (e.g. the SII XML) stay regular attachments,
  visible in the tab, untouched by any of this.
- **Race on simultaneous writes**: same clear-then-set transaction handles it; no partial index
  needed as a backstop.
- **Security**: net improvement — inherits `AttachImplementationManager`'s normal org/client
  filtering, unlike the disabled-filter bug found in `NeoPreviewFileService`
  (`setFilterOnReadableOrganization(false)`).
- **Replace UX — resolved 2026-08-14: always delete the superseded attachment**, both for the
  generated-PDF case (sales) and the manual-replace case (purchase). Preview and sidebar must be
  the same, single, unique document per record — no leftover unmarked copies allowed to
  accumulate as clutter in the "Adjuntos" tab. This matches `ETGO_PREVIEW_FILE`'s existing
  destructive-overwrite semantics exactly, so it's not a UX regression, just the same behavior on
  new storage. **Implementation detail:** the delete-old + mark-new step must happen in the same
  transaction as the mark/upload — if the delete fails, the whole operation must roll back rather
  than leaving a newly-marked attachment with the old one still dangling unmarked.
- **Email download links** (`NeoDocumentDownloadService` / `DocumentDownloadTokenService`): today
  these deliberately bypass org/client ACLs (`setFilterOnReadableOrganization(false)`) because the
  recipient clicking a signed email link has no logged-in Etendo session — only a validated token.
  Migrating this lookup to `Attachment`/`AttachImplementationManager` (which normally *does*
  enforce those filters) needs the download to explicitly run in admin mode inside
  `NeoDocumentDownloadService`, to preserve the same "anonymous but token-validated" capability.
  Not a blocker, but must be carried over explicitly, not assumed.
- **Bonus fix opportunity**: checking "does a marked attachment already exist" is a cheap lookup —
  this can gate whether jsreport is even called at all, not just whether the POST is deduped. Folds
  in open question #7 (unconditional PDF regeneration on every open) as a natural side effect of
  this migration, without extra scope.
- **Inherited, not new**: if a Completed document is reactivated and edited, nothing invalidates a
  stale marked attachment — same gap `ETGO_PREVIEW_FILE` already has today. Not introduced or
  fixed by this migration; still an open question whether to address it in the same pass.

## Reverse-plan analysis (rejected): flip the sidebar to read `ETGO_PREVIEW_FILE` instead

Considered because `ETGO_PREVIEW_FILE`'s caching behavior is valuable and already implemented
for all preview windows. Rejected for purchase-invoice/goods-receipt specifically, for concrete
reasons:

- The webhook that feeds the sidebar's data (`AttachFile`) is owned by an external module we
  don't even have the source for (see above) — redirecting its target would mean forking or
  patching a third-party binary dependency, or building new dual-write/dual-delete sync logic
  to keep two stores consistent forever.
- `ETGO_PREVIEW_FILE`'s `UNIQUE(client, record, specName)` constraint means **one file per
  document** — purchase invoices frequently need more than one file (PDF + XML for e-invoicing
  / SII compliance, see `docs/sii-description-autofill-investigation.md`). Moving to this model
  risks losing the second file.
- Goods-receipt has **no sidebar to flip** — only the generic `AttachmentsTab`, shared by the
  whole app. There's nothing to redirect there without inventing new UI from scratch.
- Even for purchase-invoice, flipping only the sidebar (not the "Adjuntos" tab, which stays on
  real `AD_Attachment` since it's the generic shared component used everywhere) would leave a
  **3-way divergence** (Adjuntos tab vs. sidebar vs. preview) instead of solving anything.

## Forward-plan cost analysis (current recommendation)

Point the preview's persistence at the same real-attachment REST surface the sidebar/tab
already use, **scoped to purchase-invoice + goods-receipt only**. Leave `ETGO_PREVIEW_FILE`
untouched for all system-generated-PDF windows.

**Frontend only, no backend work needed** (`NeoAttachmentsHelper` already exposes everything
required):
- `tools/app-shell/src/windows/custom/shared/InvoicePreview.jsx` — replace the purchase-invoice
  branch of `attachmentConfig` to read from real attachments (reuse
  `listAttachments`/`fetchAttachmentBlobUrl`) instead of `usePreviewAttachment`.
- `tools/app-shell/src/windows/custom/goods-receipt/GoodsReceiptPreview.jsx` — same, against
  `tableName: 'M_InOut'`.
- `usePreviewAttachment.js` / `GenericPreviewModal.jsx` — add a new "real attachment" mode to
  `attachmentConfig`, or a sibling hook with the same `{storedFile, isBusy, ...}` shape so
  `ManagedLeftPanel` doesn't need structural changes.
- Recommended: fix `OcrSidePanel`'s missing sort at the same time (same root ambiguity would
  otherwise resurface between sidebar and preview whenever a record has 2+ PDFs).

**Data migration concern:** existing `ETGO_PREVIEW_FILE` rows with
`SPEC_NAME IN ('purchase-invoice', 'goods-receipt')` become orphaned after the switch (not
auto-cleaned). Decision pending — see open questions below. Low priority per stakeholder: still
in development, no production data at stake yet.

**Out of scope / do not touch:** sales-invoice, sales-order, purchase-order, sales-quotation,
goods-shipment, return-to-vendor-shipment stay on `ETGO_PREVIEW_FILE`.

## Side finding: `ETGO_PREVIEW_FILE`'s caching only avoids duplicate writes/UI wait, not the underlying computation

Verified with a live network trace on **sales-order #1000012** (a system-generated-PDF window,
not in scope for the fix, but relevant to any future caching optimization): on both the first
*and* the second opening of the same order's preview, the network shows:
```
GET /sws/neo/preview-file?specName=sales-order&recordId=...   ← cache check
GET /sws/neo/sales-order/header/...                            ← still fires every time
GET /sws/neo/sales-order/lines?parentId=...                    ← still fires every time
```
`usePdfGenerator` (`pdfUtils.js:287-331`) unconditionally re-fetches and re-renders the PDF on
every mount — there is no check for an existing cached file before doing so. Only the *store*
step is gated (`GenericPreviewModal.jsx` `ManagedLeftPanel`, lines 44-58:
`if (attachment.storedFile || attachment.isBusy) return;`), which avoids re-POSTing a duplicate.
The perceived speed on a second open comes from `GET /preview-file` (a single fast row lookup)
winning the race against the slower header+lines+render pipeline, not from the render being
skipped. Not part of ETP-4315's fix, but worth a separate follow-up ticket if this
network/CPU waste is judged worth optimizing.

## Open design questions (pending stakeholder decision)

> **Superseded by the 2026-08-14 update above** — scope is now general, not
> purchase-invoice/goods-receipt only. Questions 1 and 3 below are answered by that update;
> 2, 4, and the new 5-7 remain open.

1. ~~**Scope confirmation**~~ — resolved: general fix, **purchase-invoice + goods-receipt +
   return-material-receipt** all belong to the same `external-attachment` category (see
   2026-08-14 update, point 2). return-material-receipt has no visible bug yet only because
   nothing attaches a real file to it today.
2. ~~**Single-file policy**~~ — resolved by the `EM_ETGO_ISPREVIEWMAIN` mark itself: there is
   never ambiguity to pick a heuristic for, since at most one attachment per record can be marked
   at any time (enforced by always deleting the superseded one, see Complications). No heuristic
   needed anywhere, including `OcrSidePanel.jsx`.
3. ~~**Orphaned `ETGO_PREVIEW_FILE` rows**~~ — applies now to three specs
   (`purchase-invoice`, `goods-receipt`, `return-material-receipt`) instead of two; same
   low-priority pre-production call still stands, decision still pending.
4. ~~**Should the preview still allow uploading/replacing the file directly**~~ — resolved
   2026-08-14: **keep it exactly as it is today**, the preview panel keeps its own upload/replace
   drop-zone. No longer a "dual-write into two stores" concern either way — sidebar, "Adjuntos"
   tab (pick-and-mark), and the preview's drop-zone all end up calling the same
   `storeBlob`/mark-as-main path against the single `Attachment` store, so all three stay in sync
   automatically by construction, regardless of which one the user happens to use.
5. ~~**`attachmentConfig` discriminator design**~~ — superseded by the 2026-08-14 design decision
   above: both modes (`generated-pdf`/`external-attachment`) converge on the same storage
   (marked `Attachment`), so the discriminator is now "does jsreport render it, or does the user
   upload it" — same distinction, different backing store on both sides now instead of one.
6. ~~**goods-shipment / return-to-vendor-shipment have no caching at all**~~ — resolved
   2026-08-14: **do it now, in this same pass.** These two windows currently pass no
   `attachmentConfig` at all to `GenericPreviewModal`, so removing `ETGO_PREVIEW_FILE` doesn't
   strictly require touching them — this is genuinely new wiring, not a migration, being bundled
   in deliberately for consistency rather than because the code is already being touched. Scope
   addition: `GoodsShipmentPreview.jsx` and `ReturnToVendorShipmentPreview.jsx` get
   `attachmentConfig` added (mirroring sales-invoice's draft-gated cache pattern) as part of this
   ticket.
7. ~~**unconditional PDF regeneration on every open**~~ — resolved as a natural side effect of the
   2026-08-14 design decision: checking "does a marked attachment exist" gates the jsreport call
   itself, not just the write.
8. **NEW — uniqueness enforcement is app-level, not DB-level** (no partial unique index found to
   be supported by Etendo's table-model tooling — see design decision above). Column ended up a
   plain boolean (`EM_ETGO_ISPREVIEWMAIN`) rather than a spec-name string after stakeholder review
   — `AD_Table_ID`+`Record_ID` already disambiguate document type, so no string namespace was
   needed. Confirm the app-level-only enforcement assumption before implementation, or find a
   precedent that proves partial indexes ARE expressible in the model XML.
9. ~~**email download links need admin-mode carry-over**~~ — resolved 2026-08-14: confirmed
   approach. `NeoDocumentDownloadService` must wrap the `Attachment`-based lookup+download in
   `OBContext.setAdminMode()`/`restorePreviousMode()`, scoped as tightly as possible around just
   that call, to preserve the anonymous-but-token-validated capability `NeoPreviewFileService`
   currently gets via disabled org/client filters. **Accepted behavior change:** since a
   superseded marked attachment is now hard-deleted (not overwritten in place), an email link
   sent before a document's document was replaced will 404 instead of silently serving the new
   (wrong) content — a fail-loud regression path is preferred over `ETGO_PREVIEW_FILE`'s current
   fail-silently-wrong behavior. No further action needed here beyond implementing it this way.
10. ~~**stale marked attachment after a Completed document is reactivated and edited**~~ —
    resolved: this is exactly [ETP-4787](https://etendoproject.atlassian.net/browse/ETP-4787)
    ("Vista previa y descarga del documento no se actualiza tras reactivar y reconfirmar"),
    already tracked separately (same epic ETP-3504, status Defined). **Out of scope for this
    migration** — leave the behavior as-is (matches today's pre-existing gap exactly), fix under
    ETP-4787 instead.

## Next steps

- Resolve the open questions above with the stakeholder.
- Once resolved, hand off to the Forge pipeline (DEV → REVIEW → QA → DOCS): Developer
  implements the scoped frontend change (+ `OcrSidePanel` sort fix), Tester covers it,
  Alex reviews, Sentinel QAs, Sage updates
  `docs/generated-custom-windows/purchase-invoice.md` and `goods-receipt.md`.
- Branch/PR creation delegated to Clerk per standard workflow, once implementation starts.
