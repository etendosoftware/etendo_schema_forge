# Document Printables

How a document's printable is produced, **where each one is consumed**, and the rules any change
here must respect.

**If you are about to edit a template, a PDF hook or a print/email button, read §"Where the
printables are used" first and work through its checklist.** The same document is rendered from
five different places; changing one and assuming the rest follow is how a legally required QR
ended up missing from the copy customers receive.

Governing skill: `/document-printables`.

## The three designs

| | **Commercial** | **Movement** | **`print-*` artifact** |
|---|---|---|---|
| Template | `DOCUMENT_TEMPLATE` in `windows/custom/shared/documentPdf.js` — one, shared | `MOVEMENT_TEMPLATE_*` blocks in `pdfUtils.js`, composed per document | `artifacts/print-<doc>/template.hbs` — one per document |
| Documents | sales invoice, sales order, purchase order, quotation | goods shipment, both returns | all eight `print-*` |
| Shows | prices, discounts, tax, total | quantities + receiver signature, **no prices** | its own layout |
| Data | NEO | NEO | the artifact's own SQL (`report-contract.json`) |
| Rendered by | `renderDocumentPdf` / `renderDocumentHtml` | `generateXxxPdf` / `generateXxxHtml` per document | `POST /api/reports/<id>/render` |

The first two are what users see in the app. **Movement documents are not an oversight** — an
albarán carries quantities and a signature, not money, so forcing it into the commercial template
would be wrong.

The `print-*` artifacts are the third: a separate layout reached only when a window is **not** in
`documentPdfRegistry.js`. Today every document window is registered, so the artifacts are the
fallback path, still used by the report server and by anything outside the seven windows.

## Where the printables are used

**This is the checklist. Five consumption points, each wired in a different file.** When you
change what a document prints, verify every row for that window — a passing unit test proves
nothing about which of these five a user actually hits.

| # | Entry point | Wired in | How it gets the document |
|---|---|---|---|
| 1 | **Preview panel** (side panel / modal) | `windows/custom/shared/XxxPreview.jsx` | `useXxxPdf(id, base, token, cacheConfig)` — **reads the attachment cache** |
| 2 | **Download** inside the preview | same component, same blob | the blob from (1) |
| 3 | **Email — detail view** (envelope in the topbar) | the window's `artifacts/<window>/custom/*Actions.jsx` / `*TopbarExtra.jsx` → `SendDocumentModal pdfBlobUrl=` | its own `useXxxPdf` (no cacheConfig → always fresh) |
| 4 | **Email — grid row** (hover envelope) | each window's `index.jsx` → `useRowEmailModal({ usePdf })`, or `ReturnWindowShell`'s `emailAction.usePdf` | that hook; **without `usePdf` it silently falls back to `useNoPdf`** |
| 5 | **Print** — detail button and multi-select in the list | `DetailView` → `DocumentPrintDrawer`, `ListView` → `printDocuments()` | `documentPdfRegistry.js` (no hooks; works for N records) |

Plus two consumers that are easy to forget:

- **The emailed attachment.** `SendDocumentModal` → `cacheDocumentPreviewFile()` uploads the shown
  PDF as the record's marked attachment *before sending*. So `pdfBlobUrl` is not a preview detail:
  **it is the file the customer receives.**
- **Ad-hoc menu items**, e.g. goods shipment's kebab "Download PDF" → `generateShipmentPdf()`.

### Fast way to audit a window

```bash
W=sales-order
grep -rn "use.*Pdf(" tools/app-shell/src/windows/custom/$W artifacts/$W/custom   # 1-4
grep -n "'$W'" tools/app-shell/src/windows/custom/shared/documentPdfRegistry.js  # 5
grep -rn "pdfBlobUrl=" tools/app-shell/src/windows/custom/$W artifacts/$W/custom # 3-4 wired?
```

A window in the registry prints its own document; one that is missing prints the `print-*`
artifact instead — that is the single switch, and it changes only WHICH template is produced,
never WHETHER the Print button is offered.

### Two failure modes this layout produces

1. **A missing `usePdf`** (row 4) does not error — the modal just quietly shows and attaches the
   `print-*` artifact. It was exactly this in return-material-receipt.
2. **Rows 1 and 3 can disagree.** The preview reads the cache, the email path does not, so the
   same record can show two different PDFs. See §"The PDF cache".

## Criteria any change must meet

1. **One document, one design — across all five entry points.** Preview, download, both email
   paths and print must show the *same* PDF for the same record. A customer must never receive a
   different layout than the one the user reviewed. Two mechanisms carry it: the `pdfBlobUrl`
   prop (whoever owns the hook hands the rendered PDF to `SendDocumentModal`), and
   `documentPdfRegistry.js` (for the hook-free print flow, and as `SendDocumentModal`'s fallback
   when no caller supplied one).
2. **Legal content lives in the template the customer receives.** Adding a fiscal element (a QR, a
   mandated phrase) to only one design is a compliance bug even when it looks right on screen.
   Check every row of the table above before calling such a change done.
3. **No second copy of a formatter or a QR builder.** Reuse `computeDocumentQrDataUrl` /
   `buildDocumentQrText` from `templates/reports/helpers/report-html-helpers.js` — the browser
   already imports that module (`documentPdf.js`), so both designs can share it.
4. **Do not move or duplicate the Print button.** Visibility belongs to `decisions.json`
   (`hidePrint` / `hidePrintWhen`); a change here resolves *which template* the existing button
   produces. Re-deriving a window's visibility rule by hand is how quotation's four statuses got
   truncated to two in a first attempt (D8).
5. **Say which path produced the PDF.** Both paths end in an indistinguishable `pdfUrl`; keep the
   `[pdf]` and `[print-drawer]` console lines so a stale document can be diagnosed from the
   console instead of by reading code. `fetchCachedBlob` logs a third case — the cached
   attachment was discarded as stale — naming both timestamps.

## The PDF cache, and how it is invalidated

**Write** (`GenericPreviewModal.jsx`): opening the preview of a **non-draft** document uploads
the freshly rendered PDF as a real `AD_Attachment` and marks it *main*
(`C_File.EM_ETGO_IsPreviewMain='Y'`), once per document. Introduced by ETP-4315 to stop
re-rendering on every open.

The **draft gate** (`storeCondition: documentStatus !== 'DR'`; for quotations, "under evaluation
and beyond") survives the invalidation below on purpose — it is not a stand-in for it. A draft
has no document yet, and the marked attachment is the record's document: caching one would put a
provisional PDF in the "Adjuntos" tab and, since every edit invalidates, upload a fresh
attachment on essentially every open. The gate is about *whether the record has a document*;
invalidation is about *whether the stored one is current*.

**Read** (`pdfUtils.js` → `fetchCachedBlob`): when a marked attachment exists it is served and
**jsreport is never called**.

**Invalidation: by timestamp, since ETP-4787.** `fetchCachedBlob` compares when the cached
attachment's contents were written against the record's own `updated`; a file written *before*
the record's last change is ignored and the PDF is re-rendered. Nothing has to remember to evict
anything — whoever modified the record already moved `updated`.

"When it was written" is the attachment's own **`updatedAt`**, not `uploadedAt`, and that detail is
load-bearing: when a record already has a marked attachment the backend **overwrites that row in
place**, so `uploadedAt` (its `creationDate`) keeps pointing at the very first render while the
bytes are current. Comparing against it never converged — every open paid a re-render *and* an
upload, forever. Only running it against a live instance surfaced this; the unit tests were happy.
(`uploadedAt`/`createdAt`/`creationDate` remain as fallbacks for a payload without `updatedAt`,
not as alternatives: DAL stamps `updated` on insert too, so it is always the right answer when
present.)

```
lib/attachmentFreshness.js   isCachedRenderingStale(attachment, recordUpdated)
   │    ├── isAttachmentStale     : the record changed      (ETP-4787)
   │    └── isRenderedByOlderBundle : the renderer changed  (ETP-5125)
   ├── pdfUtils.js  → fetchCachedBlob   : stale ⇒ return null ⇒ render fresh
   └── useMainAttachment.js             : stale ⇒ storedFileIsStale: true
          └── GenericPreviewModal       : re-uploads the fresh blob (replaces the stale row)
```

`isCachedRenderingStale` is the predicate production code calls — **never one of the two
halves directly.** `isAttachmentStale` stays exported as the record-vs-file comparison
ETP-4787 shipped (and as its own spec); a consumer left on it would invalidate on one
half only, which is precisely the asymmetry that makes this bug class so confusing.

Both halves are needed. Without the second one the check would be permanent: the read side
would re-render on every open and nothing would ever refresh the cache, since the auto-store
only fires when *no* file is stored. `uploadAndMarkMainAttachment` deletes the previously
marked attachment in the same transaction, so the replacement converges after one open.

**How `updated` reaches the client.** `Updated` is an AD *column* on every table but not an AD
*field*, so `push-to-neo` cannot register it and no window can declare it in `decisions.json`.
`NeoFieldFilter.ALWAYS_READABLE_KEYS` therefore exempts it from GET filtering — read side only:
the same `includedFields` set gates `filterCreateRequest`, and a client that could write its own
`updated` could defeat the check. Each preview then passes it down as
`cacheConfig.recordUpdated` / `attachmentConfig.recordUpdated`.

**Everything about this is fail-open.** A missing or unparseable `recordUpdated` — a window that
does not pass it, a backend without the exemption — reads as "fresh", so the cache behaves
exactly as it did before ETP-4787 rather than silently switching itself off. The comparison is
strict, and both timestamps are truncated to whole seconds on the wire, so an edit landing in the
same second as the upload reads as fresh.

**Three windows deliberately opt out** by passing no `recordUpdated`: purchase-invoice,
goods-receipt and return-material-receipt. Their attachment slot holds the *counterparty's* own
document (the OCR source, the supplier's delivery note, the customer's signed receipt), not a
cache of something we rendered — no edit of ours can make it stale. They also pass no
`sourceBlob`, so the write half cannot fire either: two independent guards, because the failure
mode here is overwriting a real user file. **That opt-out is load-bearing for every future
invalidation rule added to this module — keep new checks behind the `recordUpdated` guard, never
above it.**

The bug this closes:

1. the document is completed → the preview is opened → a PDF is cached
2. something changes it (e.g. classic writes the Verifactu QR URL at *Registro de Facturación*
   time, **after** completion)
3. the preview kept serving the cached PDF — without the QR — forever

Note the asymmetry that made this confusing in practice: the **preview** passes a `cacheConfig`
and reads the cache, while the **email/print** path always renders fresh. So the same invoice
could show two different PDFs depending on which button you pressed. Sending an email is in fact
a cache *refresher*: `cacheDocumentPreviewFile` unconditionally overwrites the marked attachment
with the PDF it just sent.

Two accepted consequences, both deliberate:

- a change made by **raw SQL** does not move `updated`, so it will not invalidate the cache. That
  is the responsibility of whoever writes raw SQL, not of this mechanism.
- `updated` changes on *any* edit, so the cache is invalidated often. Regenerating more often is
  the desired trade-off: serving a stale document is worse than re-rendering.

### The second cause: the renderer changed (ETP-5125)

A rendered PDF is a function of **four** inputs — the record's data, the template, the
labels/locale and the Handlebars helpers. The timestamp check above covers only the first. The
other three live in the code, where a change moves **no timestamp at all**, so a completed
document cached under the previous design kept serving it forever.

That is exactly how ETP-5125 was observed: the tax labels were fixed, but a sales order whose
preview had been cached minutes earlier still printed `IVA%`. The cached file on disk proved it —
it carried the *new* template (the currency row was there) with the *old* dictionary
(`invoicePdfCurrency USD`, the raw key). Print and email looked correct the whole time, because
neither reads the cache.

**Bundle identity is the signal.** A renderer change can only reach a user through a new
frontend bundle, so `vite.config.js` injects the build instant
(`__RENDERER_BUILD_EPOCH_MS__` → `RENDERER_BUILD_EPOCH_MS`) and any cached file written before it
was produced by a different renderer. One re-render per document on its first open, then it
re-caches and stays cached.

Three properties worth knowing before touching it:

- **It is inert outside a Vite build.** The constant reads `0` under plain `node --test` and
  under Vitest (whose `vitest.config.js` is a separate config with no `define`), so the whole
  check disappears and no unit test changes behaviour. Same fail-open bias as the rest of the
  module — which also means a **renamed or dropped `define` silently disables it**, with no error
  anywhere. `src/lib/__tests__/rendererBuildEpoch.vitest.js` exists to catch precisely that.
- **It over-approximates on purpose.** A deploy that leaves the template untouched also
  invalidates. The cost is one cold cache per deploy, which is the same trade already accepted
  for `updated` just above. The exact alternative — a fingerprint of the renderer stored beside
  the attachment — needs a metadata field on the upload (the multipart carries only `file`), and
  the only free-text column that round-trips, `C_File.TEXT`, is user-editable in the Adjuntos
  tab. Rejected: it changes the upload path the OCR flow and the Adjuntos tab share.
- **It does not help during a live `make dev` session.** `define` is evaluated once per Vite
  process, so the epoch is the dev-server *boot* time: editing a template while the server runs
  invalidates nothing. Restart `make dev`, or unmark the attachment (see §3 of the
  `/document-printables` skill). This is the case that will still waste an afternoon.

### Known waste, separate from the cache

`InvoiceTopbarExtra` calls `useInvoicePdf` in the component body, so **opening a completed invoice
in edit mode renders a PDF nobody asked for** (visible as a `[pdf] … rendering fresh (cache
disabled)` line on load). It dates from ETP-4372. ETP-4315's design doc describes the same shape
for previews: *"jsreport itself still renders a PDF, in the background, every single time — pure
wasted compute"*. The fix is to trigger on modal open rather than on mount, which changes when the
PDF becomes ready — decide it deliberately, do not slip it into an unrelated change.

## Decisions on record

| # | Decision | Ticket | Why |
|---|---|---|---|
| D1 | The Verifactu QR encodes `C_Invoice.EM_Etvfac_Qr_Url` **verbatim**; we never rebuild the AEAT URL | ETP-4912 | classic owns it (`GenerateQR.encodeQR`), including the test/production host **and** the `ValidarQR` vs `ValidarQRNoVerifactu` choice |
| D2 | No AEAT URL → **no QR block at all**, never the internal fallback QR | ETP-4912 | a non-AEAT QR on a Verifactu invoice is wrong; and it makes a "is this document under Verifactu?" flag unnecessary |
| D3 | The QR label/caption are **hardcoded Spanish** | ETP-4912 | legal literals (Orden art. 20.1.b); classic's own AD messages carry an identical `en_US` translation |
| D4 | The VERI\*FACTU logo is **not** drawn | ETP-4912 | the article requires the phrase **or** the mark; the phrase alone complies, and no asset has to be sourced or versioned |
| D5 | QR geometry comes from the **AEAT spec**, not from classic's implementation | ETP-4912 | classic ships `margin: 1` (≈0.89 mm), below the spec's 2 mm minimum; and its placement (a prepended page) is not what the spec prefers |
| D6 | Print reuses the caller's PDF via `pdfBlobUrl` instead of a builder registry | ETP-4912 | the window already holds the hook; the registry was over-engineering for the single-document case |
| D7 | `default_qr` is **not** read | ETP-4912 | it only governs whether classic's `PrintControllerHook` stamps the QR on the *classic* PDF; our render path is never stamped, so we must always draw it |
| D8 | Print changes **which template**, never **whether the button shows** | ETP-4912 | an earlier attempt added a per-window print button and set `hidePrint`, which meant re-deriving each window's `hidePrintWhen` by hand — and got quotation's four statuses wrong on the first try. Visibility stays in `decisions.json`; only the template resolution moved |
| D9 | Movement documents keep their own template | ETP-4912 | quantities and a receiver signature, no prices. A registry entry therefore carries a renderer, not just a data builder |
| D10 | `SendDocumentModal` falls back to the registry when no caller supplies a PDF | ETP-4912 | the generic modal in `ListView` has no hook, so it used to preview **and attach** the artifact. One fix covers every present and future consumer |
| D11 | The PDF hook runs on demand, not on mount | ETP-4912 | `InvoiceTopbarExtra` rendered a full PDF just for opening a completed invoice in edit mode. Now the id is passed only once a consumer opens |
| D12 | The header's document currency comes from `header['currency$_identifier']` inside each builder, **never** from the `currencyData` argument | ETP-5125 | `currencyData` is `null` on the hook-free print path (`commercial()` in `documentPdfRegistry.js`), so reading it there would print a currency in the preview and none in the print — two PDFs for one record, against criterion 1. The header is fetched by every builder anyway |
| D13 | An unresolved currency prints **nothing**; there is no fallback to the org currency (`session.currencyCode`) | ETP-5125 | Stating the wrong currency on a customer-facing document is worse than stating none. `resolveDocumentCurrencyCode()` returns `null` and the template guards on it |
| D14 | The commercial template's tax labels are **generic** ("Impuesto" / "Impuestos" / "Subtotal (sin impuestos)"), not "IVA" | ETP-5125 | The lines-table tax column prints the tax *name* (`tax$_identifier`, e.g. "IVA 21%"), so a `%` header was wrong; and non-IVA taxes exist. The on-screen `DocumentTotalsPanel` already said "Impuesto", so the PDF contradicted the screen |
| D15 | The cache is invalidated by **bundle identity** too, not only by the record's `updated` | ETP-5125 | A PDF depends on the template/labels/helpers as much as on the data, and changing those moves no timestamp — a cached document served the old design forever. Deliberately over-invalidates (one cold cache per deploy): the same "re-rendering beats serving stale" trade this cache already takes for `updated` |
| D16 | The invalidation marker is the **build instant**, not a hand-bumped constant nor a stored renderer fingerprint | ETP-5125 | A constant has to be remembered on every future template change (this repo has shipped the same formatting bug 3× for exactly that reason) and leaves a deploy-slip window. A fingerprint is exact but needs a metadata field the upload cannot carry, and the only free-text column that round-trips is user-editable in the Adjuntos tab |

**Normative order for any conflict: the AEAT spec > the ticket's example images > classic's
implementation.** Applied three times in ETP-4912 (quiet zone, font size, placement).

## Anatomy of a printable

Each `artifacts/print-<doc>/` directory holds four files:

| File | Role |
|---|---|
| `report-contract.json` | `type: "document"`, page setup, parameters, and the SQL that produces `header` / `lines` / `taxes` |
| `template.hbs` | the Handlebars document, styles inlined in a `<style>` block |
| `helpers.js` | per-report Handlebars extras (most printables declare none) |
| `mock-data.json` | fixture used by dev preview and tests, so a printable can be worked on without DB access |

`report-contract.json → sql.header` runs as a plain query with `__DOCUMENTID__` substituted, so
every column it selects becomes a field on `header` in the template. That is the only data path
for a printable: it does **not** go through the window's `decisions.json` contract, which is why
a field discarded at window level can still appear on the printable.

## The `print-*` artifact path

Each `artifacts/print-<doc>/` directory holds `report-contract.json` (the SQL), `template.hbs`,
`helpers.js` and `mock-data.json`. Its `sql.header` runs with `__DOCUMENTID__` substituted, so
every column it selects becomes a `header` field — a data path completely separate from the
window's `decisions.json` contract, which is why a field discarded at window level can still
appear here.

Two different pieces of code render it, and both must agree:

| Path | Where | Used for |
|---|---|---|
| Vite dev plugin | `tools/app-shell/vite-plugins/report-api.js` (this repo) | local dev, HTML preview |
| report-server | `tools/report-server/server.js` (schema_forge_core) | server preview and the jsreport PDF |

Both delegate to `templates/reports/helpers/report-html-helpers.js`.

> ⚠️ **That helper file exists in BOTH repos and the copies must stay byte-identical.** Verify
> with `diff` after touching it. Do **not** sync by copying the whole file in either direction:
> the copies have drifted before, and a wholesale copy silently reverts whatever the other side
> fixed (it deleted ETP-4898's `-0,00` guard during ETP-4912; five tests caught it). Port hunks.

## Document QR codes

QR codes are **precomputed as plain data**, never Handlebars helpers (ETP-4908): Handlebars
compiles synchronously while `QRCode.toDataURL` is async, so the QR must exist before compile.
Both render paths call `computeDocumentQrDataUrl(header)` and assign the result to
`header.qrDataUrl`; templates consume it as `<img src="{{header.qrDataUrl}}">`.

`buildDocumentQrText(header)` decides the **content**, and `buildQrEncodeOptions(header)` the
**encoding**, both keyed off the header — never off caller-supplied arguments, so a new render
path cannot get it subtly wrong:

| `header.qr_mode` | QR content | Encoding |
|---|---|---|
| `'verifactu'` | `header.verifactu_qr_url` verbatim; empty → **no QR at all** | 400 px, level `M` (AEAT spec) |
| anything else | internal pipe-string `T:…|N:…|D:…|BP:…|$:…|C:…|TID:…|S:…` | 120 px, margin 1 (historical) |

`computeDocumentQrDataUrl` returns `''` when there is nothing to encode. Templates must guard
on `{{#if header.qrDataUrl}}` so an empty result renders nothing rather than `<img src="">`.

Only `print-sales-invoice` sets `qr_mode` today — see
`docs/generated-custom-windows/sales-invoice.md` (§ *Verifactu tax QR on the printable*) for the
AEAT rules it implements. Adding a fiscal QR to another document means emitting `qr_mode` from
that report's header SQL, not special-casing the helper.

### Why encoding options are derived, not passed

An earlier design threaded a `qrOptions` argument from each call site. Deriving them from the
header instead means `report-api.js`, `report-server` and any future path need no change at
all — one place decides, every output agrees. It also keeps the other seven printables' output
byte-identical, which their tests assert.

One trap worth knowing: **`QRCode.toDataURL` mutates the options object it receives** (it fills
in `color: {}` among others). `buildQrEncodeOptions` therefore returns a fresh object per call;
a shared module-level constant leaks that mutation into every later render.

## The registry — how print resolves a document without hooks

`windows/custom/shared/documentPdfRegistry.js` maps `windowName → { pdf, html }`.

The Print button lives in the generic `DetailView`/`ListView`, which know only a window name, and
the list prints several records at once — so hooks are unusable there. Each registry entry says
**how that document renders itself**, not how to build its data: that is what lets commercial and
movement documents coexist without bending one into the other's template.

```js
'sales-invoice':  commercial(buildInvoiceData, buildInvoicePdfLabels),   // DOCUMENT_TEMPLATE
'goods-shipment': movement(generateShipmentPdf, generateShipmentHtml, getShipmentPdfLabels),
```

`html` exists because the multi-record print concatenates markup and makes one PDF at the end;
asking jsreport for HTML (`recipe: 'html'`) keeps Handlebars server-side instead of adding a
template engine or a PDF-merging library to the browser bundle.

**Adding a window:** export from its `useXxxPdf` file the pieces its hook already composes (the
builder and a `buildXxxPdfLabels(ui)` / `getXxxPdfLabels(ui)` function, or a `generateXxxPdf` /
`generateXxxHtml` pair for a movement document), make the hook consume them so the labels are not
duplicated, add the entry, and verify the five rows of §"Where the printables are used".

## The commercial template's labels are one shared set

Every `{{labels.*}}` in `DOCUMENT_TEMPLATE` comes from **one** builder,
`buildDocumentPdfLabels(ui, overrides)` in `documentPdf.js`. The four
`buildXxxPdfLabels()` functions override only `title / documentNo /
documentSection / date / colQty / validUntil` — everything else is inherited.

Two consequences worth knowing before touching either side:

- **Changing a `genericLabels` value fixes (or breaks) all four documents at
  once, on all five entry points**, because the hook-free print path reuses the
  very same builders. That is the whole of ETP-5125's fix: three locale values.
- **The source of truth is `tools/app-shell/src/locales/{en_US,es_ES,es_AR}.json`.**
  `src/locales/generated/core.*.json` is gitignored build output regenerated
  from them by `vite-plugins/slice-labels.js` — never edit it. Editing a
  top-level locale while `make dev` runs does take effect (ETP-4830 wired the
  watcher); if you see a raw key in the PDF, restart the dev server.

The tax wording is deliberately generic. `labels.colTax` heads the column whose
cell prints `taxName` — the tax's **name**, not a rate — so it reads "Impuesto",
never "IVA%"; `labels.tax` / `labels.subtotal` read "Impuestos" /
"Subtotal (sin impuestos)", matching the on-screen `DocumentTotalsPanel`
(D14). The header's currency row is `labels.currency` + `currencyCode` (D12/D13).

## Changing a printable

1. Fill the five-row table in §"Where the printables are used" for that window, *before* editing.
2. Edit the template that document actually uses (commercial / movement / artifact). Never edit
   generated output.
3. If the change touches the shared report helpers, change **schema_forge_core** first, port the
   hunk here, and `diff` the two files.
4. Extend the mirrored suites: `tools/app-shell/test/report-qr.test.js` here and
   `cli/test/report-qr.test.js` in core.
5. Run `node --test 'tools/app-shell/test/*.test.js'`, `npx vitest run`, and
   `npx sf-validate-pipeline --scope=print-<doc>` when an artifact changed.
6. Verify in the app, reading the console: `[pdf] …`, `[print-drawer] …`,
   `[print-documents] …` say which template each path produced. Keep those lines — they are the
   only way to tell the designs apart from outside.
7. Update this document in the same change (a new decision goes in §"Decisions on record").
