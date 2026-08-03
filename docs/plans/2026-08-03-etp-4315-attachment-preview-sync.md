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
| goods-shipment, return-to-vendor-shipment | System-rendered PDF, not even cached in `ETGO_PREVIEW_FILE` today | No | Do not touch |

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

1. **Scope confirmation** — purchase-invoice + goods-receipt only, vs. also covering
   return-material-receipt (no visible bug today, same shape).
2. **Single-file policy** for the preview when a record has multiple real attachments — reuse
   `OcrSidePanel`'s existing heuristic (first `.pdf` match) for consistency, vs. most-recent by
   `creationDate`, vs. a picker UI. Leaning towards reusing the existing heuristic (and fixing
   its missing sort) so sidebar/tab/preview are guaranteed to agree.
3. **Orphaned `ETGO_PREVIEW_FILE` rows** for the two in-scope specs — delete via a data-fix,
   migrate content into a real `AD_Attachment` first, or leave alone (low priority — no
   production data yet).
4. **Should the preview still allow uploading/replacing the file directly** (dual-write into
   real `AD_Attachment`), or become read-only and redirect users to the sidebar/tab to upload.

## Next steps

- Resolve the open questions above with the stakeholder.
- Once resolved, hand off to the Forge pipeline (DEV → REVIEW → QA → DOCS): Developer
  implements the scoped frontend change (+ `OcrSidePanel` sort fix), Tester covers it,
  Alex reviews, Sentinel QAs, Sage updates
  `docs/generated-custom-windows/purchase-invoice.md` and `goods-receipt.md`.
- Branch/PR creation delegated to Clerk per standard workflow, once implementation starts.
