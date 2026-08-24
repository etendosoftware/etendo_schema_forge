# Document Printables (`print-*`)

How a document printable is assembled, rendered and extended. Covers the eight
`artifacts/print-*/` reports (invoice, orders, quotation, shipments, receipts, payment) —
the jsreport/HTML **document reports**, not the in-app `useInvoicePdf.js` preview.

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

## The two render paths

A printable is rendered by two different pieces of code, and both must agree:

| Path | Where | Used for |
|---|---|---|
| Vite dev plugin | `tools/app-shell/vite-plugins/report-api.js` (this repo) | local dev, HTML preview |
| report-server | `tools/report-server/server.js` (schema_forge_core) | server HTML preview, and the payload sent to jsreport for PDF |

Both build the same `templateData` and both delegate shared logic to
`templates/reports/helpers/report-html-helpers.js`.

> ⚠️ **That helper file exists in BOTH repos and the copies must stay byte-identical.**
> Verify with `diff` after touching it — there is a contract test
> (`tools/app-shell/test/report-template-helpers-contract.test.js`) but it does not compare
> across repos. A drift means dev renders one thing and production PDFs render another.
> Do **not** "sync" by copying the whole file in either direction: the copies have drifted
> before, and a wholesale copy silently reverts whatever the other side had fixed. Port the
> individual change instead.

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

## Changing a printable

1. Edit `report-contract.json` (data) and/or `template.hbs` (layout). Never edit generated output.
2. If the change touches shared rendering, change `report-html-helpers.js` in **schema_forge_core**
   first, port the same hunk to this repo, and `diff` the two files.
3. Extend `tools/app-shell/test/report-qr.test.js` here and `cli/test/report-qr.test.js` in core —
   the suites mirror each other.
4. Run `node --test 'tools/app-shell/test/*.test.js'` and `npx sf-validate-pipeline --scope=print-<doc>`.
5. For a visual check, render `mock-data.json` through the template and screenshot it; the fixture
   exists precisely so this needs no database or tenant.
