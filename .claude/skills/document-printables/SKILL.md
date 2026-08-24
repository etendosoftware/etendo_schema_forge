---
name: document-printables
description: >
  Work on what a document prints, previews, emails or downloads — invoices, orders, quotations,
  shipments, receipts, payments. Use when changing a printable's layout or data, adding anything
  to a printed document (a fiscal QR, a legal phrase, a totals row, a logo), wiring or moving a
  print/email button, touching the PDF cache, or diagnosing "the preview and the print look
  different", "the PDF is outdated", "my change is not showing on the PDF".
  ALWAYS load this before editing `artifacts/print-*/template.hbs`, `documentPdf.js`,
  `pdfUtils.js`, `documentPdfRegistry.js`, `DocumentPrintDrawer.jsx`, `SendDocumentModal.jsx`,
  `useRowEmailModal.jsx`, any `use*Pdf.js` hook, any `*Preview.jsx`, or a window's
  `custom/*Actions.jsx` / `*TopbarExtra.jsx` — the same document is rendered from FIVE places
  and THREE templates; changing one does not change the others.
  Triggers on: "imprimible", "printable", "diseño de la factura", "print button", "botón de
  imprimir", "preview del documento", "PDF desactualizado", "stale PDF", "el mail manda otro
  diseño", "QR en la factura", "print-sales-invoice", "template.hbs", "DOCUMENT_TEMPLATE",
  "pdfBlobUrl", "cache del PDF", "attachment principal", "IsPreviewMain".
argument-hint: "<what you want to change>  e.g. 'add the CSV code to the invoice PDF' | 'align print with preview for sales-order' | 'why is the PDF stale'"
---

# /document-printables — Changing what a document prints

**Reference doc: `docs/document-printables.md`. Read it before editing.** It carries the
mechanism, the acceptance criteria, the cache behaviour and every decision already taken. This
skill is the procedure; that doc is the contract.

## Why this skill exists

**Three templates, five entry points.** The same document is produced from five different places
in the UI, each wired in a different file, and it can come out of one of three templates:

- **commercial** — `DOCUMENT_TEMPLATE` (invoice, orders, quotation): prices, tax, total;
- **movement** — `MOVEMENT_TEMPLATE_*` (shipment, both returns): quantities and a signature, no
  prices — deliberately a different document, not an oversight;
- **`print-*` artifact** — the fallback when a window is not in `documentPdfRegistry.js`.

Every bug in this area has been someone changing one and assuming the rest followed — a legally
required QR that printed correctly but was missing from the copy emailed to the customer; a
row-hover envelope silently attaching the wrong layout because one window never passed `usePdf`.

**So the first question is never "how do I change the template". It is "which of the five entry
points does this affect, and which template does each of them produce?"**

## Procedure

### 1. Map before touching (mandatory)

Fill this for the window you are changing. Do not skip a row because it "should be obvious" —
these five live in five different files, and a missing wire fails **silently** (no error, just
the wrong document).

| # | Entry point | Template it produces | Wired in |
|---|---|---|---|
| 1 | Preview panel | ? | `windows/custom/shared/<Doc>Preview.jsx` — note it **reads the PDF cache** |
| 2 | Download inside the preview | ? | same component |
| 3 | Email — detail topbar envelope | ? | `artifacts/<window>/custom/*Actions.jsx` / `*TopbarExtra.jsx` |
| 4 | Email — grid row envelope | ? | the window's `index.jsx` → `useRowEmailModal({ usePdf })` (or `ReturnWindowShell`'s `emailAction`) |
| 5 | Print — detail button and list multi-select | ? | `documentPdfRegistry.js` (used by `DocumentPrintDrawer` and `printDocuments`) |

Audit a window in three greps:

```bash
W=sales-order
grep -rn "use.*Pdf(" tools/app-shell/src/windows/custom/$W artifacts/$W/custom   # rows 1-4
grep -rn "pdfBlobUrl=" tools/app-shell/src/windows/custom/$W artifacts/$W/custom # are 3-4 wired?
grep -n "'$W'" tools/app-shell/src/windows/custom/shared/documentPdfRegistry.js  # row 5
```

Also check the two easy-to-forget consumers: the **emailed attachment**
(`cacheDocumentPreviewFile` uploads the shown PDF — it is the file the customer receives) and any
**ad-hoc menu item** (e.g. goods shipment's kebab "Download PDF" → `generateShipmentPdf`).

`docs/document-printables.md` § *Where the printables are used* holds the filled-in table.

### 2. Apply the criteria

The five rules are in `docs/document-printables.md` § *Criteria any change must meet*. The two
that get violated most:

- **One document, one design.** If the change must reach the customer, it has to be in the design
  the email sends — not only the one the print button shows.
- **No second copy.** QR text/image, currency and date formatting all have canonical helpers.
  `grep` for the helper before writing one.

### 3. Check the cache before believing your own eyes

A non-draft document may serve a **cached** PDF instead of rendering yours
(`C_File.EM_ETGO_IsPreviewMain='Y'`), and there is **no invalidation** today (ETP-4787). If your
change does not appear:

```bash
# is there a cached PDF for this record?
psql … -c "select c_file_id, name, em_etgo_ispreviewmain, created from c_file where ad_record_id='<recordId>'"
# force a re-render without deleting anything
psql … -c "update c_file set em_etgo_ispreviewmain='N' where c_file_id='<id>'"
```

Then read the console — three lines name the template each path produced:

```
[pdf] C_Invoice/<id>: served from cached attachment (no re-render)   |  rendering fresh (cache miss|disabled)
[print-drawer] <id>: client-rendered PDF (same template as preview/email)  |  rendering the <id> artifact
[print-documents] <window> xN: client-rendered (…)  |  <id> artifact
```

They exist precisely so this is diagnosable without reading code — keep them. Note the asymmetry
they expose: the preview reads the cache and the email path does not, so the same record can show
two different PDFs.

### 4. Verify on every path that exists

A passing unit test proves nothing about which template a button produces. Verify **every row of
your step-1 table** in the running app — including both email paths, which are wired separately.
For the `print-*` artifact also verify its three render paths:

```bash
make dev                                    # :3100 — Vite plugin (dev)
make report-serve-detach                    # jsreport, needed for PDF
make report-server-verify                   # the deployed service's image
curl -s -X POST http://localhost:3100/api/reports/print-<doc>/render \
  -H 'Content-Type: application/json' -d '{"format":"html","params":{"documentId":"<id>"}}'
```

For the in-app templates the fastest check is the app itself: open the record, press each button,
read the console line, look at the document. Screenshot it. For the multi-record path, select two
rows in the list and print — that path is wired separately from the detail button.

### 5. Keep both repos honest

`templates/reports/helpers/report-html-helpers.js` exists in **schema_forge_core** and in this
repo and must stay **byte-identical**. Change core first, port the hunk here, then `diff`.
**Never sync by copying the whole file** — it silently reverts whatever the other side fixed
(this exact mistake deleted ETP-4898's `-0,00` guard during ETP-4912; five tests caught it).

Mirror any test in `cli/test/report-qr.test.js` (core) and
`tools/app-shell/test/report-qr.test.js` (here).

### 6. Update the reference doc in the same change

New decision, new wiring, new gap → it goes into `docs/document-printables.md` (§ *Decisions on
record*, or the relevant section) as part of the same commit. That file is the reason this area
is now explainable; a change that leaves it stale is incomplete.

## Fiscal / legal content

When the change is mandated by a norm (Verifactu QR, AEAT phrases, TicketBAI):

**Normative order: the official spec > the ticket's example images > classic's implementation.**

In ETP-4912 that order mattered three times — the quiet zone, the font size and the block
placement all followed the AEAT spec against what classic does. Do not treat the classic module
as the reference just because it is code that ships; read the spec.

And prefer reading a precomputed value over recomputing a legal string: `EM_Etvfac_Qr_Url` is
written by classic and already encodes the environment and the verifiable/non-verifiable endpoint
choice. Rebuilding it in JS would silently diverge.

## Known open items

Do not "discover" these again — they are tracked:

| Item | Ticket / status |
|---|---|
| No PDF cache invalidation (a stale document is served) | ETP-4787 — agreed fix needs `updated` in the NEO header payload, which requires a change in `com.etendoerp.go`: `Updated` is an AD column but **not** an AD field, so it cannot be exposed the usual way |
| `print-*` artifacts duplicate the in-app documents; 19 files hand-copied across repos | ETP-4980 |
| All seven document windows are aligned across the five entry points | done (ETP-4912) — re-verify with §1 when adding a window |
| A PDF was rendered on mount, unrequested | fixed for sales invoice (ETP-4912); other windows still call their hook eagerly |
