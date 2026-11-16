# Invoice Inbox

"Bandeja de facturas" in Spanish. Epic ETP-6046; this guide covers ETP-6049 (list, upload and
discard) and slice S1 of ETP-6050 (the read-only review panel).
Backend: ETP-6047 (table, flag, upload endpoint) and ETP-6048 (background reading) in
`com.etendoerp.go`, `docs/neo-headless.md` §4.6b.

## Intent

A single place where supplier invoices arrive before they become purchase invoices. The user
drops or picks PDF/JPG/PNG files, the server stores each one as an `ETGO_INCOMING_DOCUMENT` row in
status `PROCESSING` and reads it in the background (OCR, vendor and line matching, validation).
The list shows every document with its status, the vendor and the data read, and refreshes the
rows that are still being read. A document that is not wanted is discarded: it moves to
"Descartadas", read-only, and nothing is created in Etendo.

Not in this story:
- editing a document, resolving suppliers and products, "Mark as reviewed" — ETP-6050 slices S2 / S3.
  S1 only OPENS the panel (read only): see "Review panel (ETP-6050, S1)";
- Confirm, single and batch — ETP-6051. The batch bar shows Confirm disabled and the row's kebab is
  shown inert ("Próximamente");
- "Mark for review" batch action — logic not in this story. The button is in the batch bar, shown
  disabled ("Próximamente"), as in the design;
- inbound e-mail — out of phase 1. The e-mail card is a mockup (example address, Copy disabled);
- purge of discarded documents — not built, so no "deleted in 30 days" text is shown.

## Access gate

Two independent axes, both required, checked by the menu AND by the page:

| Axis | Source | Menu (`menu.json`) | Page (`windows/custom/invoice-inbox/index.jsx`) |
|---|---|---|---|
| Rollout (per account) | `capabilities.invoiceInbox` from `SFWindowAccessMap`, the backend evaluation of the `invoice-inbox` flag | `"capability": "invoiceInbox"` | `isCapabilityVisible(useCapabilitiesSafe(), INVOICE_INBOX_CAPABILITY)` |
| Role | `windowAccess['81AC659E93504927B459E0CAE80CE923']` from the same access map | `"accessWindowId"` (admins exempt) | `useWindowAccess(INVOICE_INBOX_WINDOW_ID) !== 'none'` |

- While the access maps are still loading (`accessLoaded === false`, reload or deep link) the page
  shows a progress bar (`invoice-inbox-access-loading`), not the denied screen; once loaded it fails
  closed.
- Either axis missing → `AccessDeniedMessage` (`window-access-denied`), which does not reveal whether
  the feature exists.
- The browser never evaluates the flag: there is no key in `flag-keys.js`. The backend is the one
  evaluator, for the capability and for the upload endpoint (`docs/feature-flags.md`, backend-only flags).
- The capability is NOT access control, but the API is gated too (ETP-6049): with the flag off the
  read of the spec (`GET /sws/neo/invoice-inbox/header`, list and by id, and MCP `etendo_list` /
  `etendo_get`), the upload, the `discard` action and the review read all refuse with `403 feature_disabled`
  (`InvoiceInboxHeaderHandler`).
- Roles: Compras and Financiero get the window through their template grant
  (`TemplateRoleWindowAccess`); admins through the admin bypass of `SFWindowAccessMap`; automatic roles
  through `NeoAccessStartup` (standard for every Etendo GO window). Ventas and Almacén have no grant.
- Known gap (pre-existing, also Smart Scan): `CommandPalette` filters items by `capability` but not by
  `accessWindowId`, so a role without the window but with the capability sees the entry in the
  palette and then lands on the access-denied screen.

## Menu entry, breadcrumb & i18n

- Last item of the existing Purchases ("Compras") group, after "Relación albarán-factura"
  (`menu-item-invoice-inbox`). Like its siblings it has no icon of its own.
- The item uses `accessWindowId`, never `windowId`: the window has no `AD_Menu`, and `windowId` is
  checked against the `AD_Menu` tree, which would hide it from everyone, admins included (ETP-5240).
- Title `tMenu('Invoice Inbox')` → "Bandeja de facturas"; breadcrumb "Compras / Bandeja de facturas"
  (`tMenu('Purchases') / title`, as the other Purchases windows). The TopBar count next to the
  title is Pendientes + Con error (what still needs work); hidden until the counters load.
- Every text is in `genericLabels` (`invoiceInbox*` keys) of `en_US`, `es_ES` and `es_AR`. Backend codes
  are translated in the SPA by code (`invoiceInboxMessages.js`): the `Status` reference list
  translations are English in every language, `Error_Code` has no identifier, and the upload messages
  (`ETGO_InvoiceInbox*`) are English only.

## Data architecture

- NEO spec `invoice-inbox` (`artifacts/invoice-inbox/decisions.json`, `layoutType: "custom"`), entity
  `header` over `ETGO_INCOMING_DOCUMENT`, methods `GET` / `GETBYID` only: every CRUD write (POST,
  PATCH, DELETE on the entity) still answers 405 on REST, batch and MCP. `currentData` and
  `extractedData` (JSON up to 1 MB) are `discarded`, so they never travel in the list.
- Discard is a NEO **action**, not a CRUD write: `POST /sws/neo/invoice-inbox/header/{id}/action/discard`
  (no body), served by `InvoiceInboxHeaderHandler` (`@NeoExtension`). Actions are not gated by the
  spec's methods, so the spec stays read-only. It is kept for people only: MCP `etendo_action`
  answers 405 for it (`agentExcludedActions`) until it is exposed together with Confirm (ETP-6051).
- The review panel reads one document through the NEO **GET action**
  `GET /sws/neo/invoice-inbox/header/{id}/action/review` (ETP-6050; `fetchReview` in
  `invoiceInboxApi.js`, always through `apiFetch`): the document (`CURRENT_DATA` v1 plus the review
  enrichment), its recomputed validation, `status`, `reviewed`, `adjusted`, `updated`, `editable`,
  the currency and the invoice identifier. A document still being read answers 409
  `processing`. `currentData` / `extractedData` stay `discarded` in the spec: they never travel in
  the list.
- The upload is a NEO built-in endpoint (`POST /sws/neo/invoice-inbox/upload`), dispatched before the
  spec router; the read-only spec does not affect it.
- `apiBaseUrl` of the window is the spec (`/sws/neo/invoice-inbox`): the list is `apiFetch('/header?…')`,
  the upload `apiFetch('/upload', …)`, the discard `apiFetch('/header/{id}/action/discard', …)`. Every
  call goes through `useApiFetch`.
- Row keys used: `fileName`, `source`, `created` (reception timestamp; there is no `creationDate`
  key), `businessPartner` + `businessPartner$_identifier` + `businessPartner$taxID`
  (`_extraProperties=businessPartner.taxID,invoice.documentNo,duplicateOfInvoice.documentNo`), `extractedName`, `extractedTaxID`, `orderReference`,
  `invoiceDate` (date-only), `grandTotalAmount`, `status`, `errorCode`, `invoice$documentNo` (+ `invoice$_identifier` as fallback), `duplicateOfInvoice`
  (+ `duplicateOfInvoice$documentNo`, `$_identifier` as fallback), `discardedAt` (timestamp; served in the list as a `readOnly` field).
- Columns are real AD columns (`File_Name`, `C_BPartner_ID`, `POReference`, `DateInvoiced`,
  `GrandTotal`, `Status`), `filterable: false` (the page filters by status tabs), on the shared
  `DataTable`. Nothing is injected in `afterHandle`.

## Filters, counters and order

| Tab | Criteria |
|---|---|
| Todas | every status except `DISCARDED` |
| Pendientes | `PROCESSING`, `PENDING_REVIEW`, `READY` |
| Con error | `ERROR` |
| Confirmadas | `CONFIRMED` |
| Descartadas | `DISCARDED` |

Definitions live in `invoiceInboxFilters.js` (pure).

- Counters: four requests in parallel (`pending`, `error`, `confirmed`, `discarded`) with
  `_startRow=0&_endRow=1&_noCount=false`, reading `response.totalRows`. `_noCount=false` is required:
  without it core estimates `totalRows` as rows read + 1. Todas = Pendientes + Con error + Confirmadas.
  A counter shows only once known (never a placeholder 0).
- Order: newest first (`_sortBy=-created`). In Todas, `ERROR` rows come first. `_sortBy` only takes
  property paths, so Todas reads two disjoint streams in order: `status = ERROR`, then
  `status inSet [PROCESSING, PENDING_REVIEW, READY, CONFIRMED]`; paging walks the first until it runs
  out, then the second (`fetchNextPage` in `invoiceInboxApi.js`).
- Pages of 50 with a "Cargar más" button; an appended page skips rows already on screen (offsets
  shift when documents arrive between pages). Each page asks for one row more than it keeps
  (`_endRow` is inclusive in core) to know whether more exist without a count.
- Changing tab clears the selection and reloads from the first page. "Actualizar" reloads the list
  and the counters and restarts polling.

## Rows and cells

| Column | Shows |
|---|---|
| Documento | image or document icon by extension, file name; second line: reception date and time, preceded by the origin ("Correo" with its icon) only when the document did not come from a manual upload — an uploaded document shows the date alone, same line height |
| Proveedor | linked partner: name + its tax id; else extracted name + extracted tax id (grey, no badge); else "Sin datos" |
| Nº factura | number or "—"; amber copy icon "Posible duplicado de {docNo}" (the duplicate invoice's plain document number, `duplicateOfInvoice$documentNo`, the identifier only as a fallback) when `duplicateOfInvoice` is set and the row is not CONFIRMED/DISCARDED |
| Fecha | `formatCalendarDate(invoiceDate)`; red "—" when missing |
| Total | `formatCurrency(organization currency, grandTotalAmount)` — the row has no currency column yet; the user corrects it in review (ETP-6050) |
| Estado | status tag by code; ERROR adds the reason by `errorCode`; CONFIRMED adds "{docNo} · Completada" with the invoice's plain document number (`invoice$documentNo`, the identifier only as a fallback) when served; DISCARDED adds "Descartada el {date}" from `discardedAt` (wall-clock timestamp, `parseWallClockInstant`, date only; nothing when absent). Never a "deleted in 30 days" text |

- Text that can be clipped — file name, vendor name and tax id, the status reason (error or created
  invoice) — ellipsises and shows the full text in a tooltip on hover and on keyboard focus (shared
  `TruncatedText`, `tabIndex` 0, opens only when the text is actually clipped).
- `PROCESSING` rows show animated placeholders in Proveedor, Nº, Fecha and Total, cannot be selected
  and cannot be opened.
- Selectable rows: `PENDING_REVIEW`, `READY`, `ERROR` (`isRowSelectable`). The batch bar shows
  "{n} seleccionada(s)", then, in the design's order, "Marcar para revisión" (disabled,
  "Próximamente"), Descartar (enabled, see Discard) and Confirmar (disabled, "Próximamente"),
  and the close button clears the selection.
- A row click, or the row's Edit (pencil), opens the review panel (PROCESSING rows do not open).
- Row hover actions, in the reserved space at the end of the row (as in `/sales-order`): Edit
  (pencil, opens the panel) and More (kebab, shown inert with a "… · Próximamente" tooltip), and the red trash
  (Descartar) only on `PENDING_REVIEW` / `ERROR` / `READY` rows. CONFIRMED and DISCARDED rows show
  pencil and kebab only; PROCESSING rows show no action. They render through DataTable's
  `rowQuickActions.render` slot (`InvoiceInboxRowActions.jsx`, `buttonCount: 3`) with the shared
  row-action visuals and icons of `RowQuickActions` (`rowVisuals.js`); the canonical
  `RowQuickActions` cannot express inert buttons or a "Discard" trash.
- Empty states: Todas with no document at all → "Aún no hay facturas"; any other empty view → "No hay
  facturas en esta vista"; a failed load → error text + "Reintentar".

## Upload

Client rules (`invoiceInboxUploadPolicy.js`), mirroring the endpoint limits:

| Selection | Result |
|---|---|
| more than 20 files | warning, NOTHING uploaded |
| some files with another format, empty or over 10 MB | the valid ones are uploaded; one warning per reason names the refused files |
| no valid file | warnings, nothing uploaded |

- Triggers: the drop card, "Cargar facturas", or dropping files anywhere on the page (overlay "Suelta
  para cargar las facturas"; a depth counter avoids flicker, only drags that carry files count).
- One request per file, two at a time (`useInvoiceInboxUpload`), so "Cargando X de N" counts files the
  server answered for. Each file: En cola → Enviando… → Entregada, or refused with its reason. There is
  no percentage: `fetch` reports no upload progress and XHR would bypass `apiFetch`.
- A 200 answer with `results[0].status = rejected` → reason by `code` (`unsupported_type`,
  `empty_file`, `invalid_content`, `store_failed`). A non-2xx answer → reason by `error.code`;
  `feature_disabled`, `access_denied`, `org_not_allowed` and a network error (no HTTP answer) stop the
  rest of the queue (marked refused with the same reason) and show ONE toast per upload batch, even
  with two requests in flight; the network error shows its own translated message. An `AbortError`
  is NOT a failure: `apiFetch` throws it when the session changed while the request was in flight
  (role/organization switch, a refresh that changed the access maps, the auth provider remounting),
  and it does so after the server answered, so the document may exist. That file is marked
  unconfirmed (amber: "No pudimos confirmar si el archivo se cargó. Revisa la lista antes de volver a
  subirlo."), does not stop the queue, is not recorded in the result panel (no id arrived) and
  refreshes the list. Any other unexpected error only fails that file. Leaving the page stops the
  queue: nothing more is sent and no refresh is scheduled after unmount. The queue is paused, not
  emptied, so an effect re-run that keeps the state (React Fast Refresh in development) resumes it
  instead of leaving files "En cola" forever.
- Every delivered file refreshes the list and the counters (debounced 500 ms), so its `PROCESSING` row
  appears; reading happens afterwards on the server.
- The tray shows while files are sent and reports the upload only. While any file is still queued or
  sending it shows an inline notice ("No salgas de la página hasta que termine el envío ({n} en cola)";
  navigation is not blocked). Once delivery is over the "Resultado de tus cargas" panel takes its place
  and the tray keeps only the refused and unconfirmed files, with their reasons, until the user closes it (X); a new
  upload adds lines. Each line's file name and message are truncated with the full text in a tooltip
  (hover and keyboard focus).

## Upload result ("Resultado de tus cargas")

What became of the documents THIS browser uploaded, read from the server, so the user can leave the
page while they are read and find the outcome when they come back.

- Record (`invoiceInboxUploadLog.js`): every accepted `incomingDocumentId` is written to `localStorage`
  under `sf:invoice-inbox:uploads:<clientId>:<FNV-1a hash of the account id>`, value
  `{"v":1,"entries":[{"id","at"}]}`; entries expire after 7 days, newest 100 kept. The write happens
  in the upload hook outside React state, so a request still in flight when the user leaves the page
  is recorded too. No company or account (e.g. a bearer session with no account) → no record, no
  panel. Every storage access is in try/catch: with storage blocked the panel simply does not show.
  Not cleared at logout (the key is per company and account). Limit: this browser only; another device
  does not see it (a server-side summary per user is the v2 option). E-mail documents never enter it.
- Reading (`useInvoiceInboxUploadResult`): recorded ids not read yet are fetched with `id inSet` in
  chunks of 50 (`fetchRowsByIdChunked`, URL length). There is no second poller: the page's PROCESSING
  poll also re-reads the recorded documents still being read and hands the answer to the panel. Other
  tabs' writes arrive through the `storage` event.
- Buckets: read (`PENDING_REVIEW`, `READY`), with error (`ERROR`, one line per `errorCode` with the
  translated reason), still being read (`PROCESSING` or not read yet), already handled (`CONFIRMED`,
  `DISCARDED`), no longer available (not returned).
- Panel (`InvoiceInboxUploadResult.jsx`, `aria-live="polite"`), hidden with an empty record and while
  files are being sent:

  | State | Headline |
  |---|---|
  | reading | "Leyendo tus facturas · {done} de {total}" + "Puedes seguir trabajando: te mostraremos aquí el resultado." |
  | mixed | "{read} leídas · {failed} con error · {pending} leyéndose" + the same hint |
  | done | "{n} factura(s) leída(s)" + "Revísalas y confírmalas desde Pendientes." ("Resultado de tus cargas" when none was read) |
  | done with errors | "{read} leídas · {failed} con error" |
  | load error | "No se pudo comprobar el resultado de tu carga." + "Reintentar" |

  Detail lines: "{n} · {reason}" per error code, "{n} ya gestionadas (confirmadas o descartadas)",
  "{n} ya no están disponibles". The panel has no navigation of its own: the user goes to the tabs
  (e.g. "Con error"). A close X at its right (`close` label) drops the finished documents from the
  record; it is offered only once nothing is being read. "Actualizar" re-reads it.

## Discard

From the batch bar (the selected rows) or a row's trash (that row), both through the same
confirmation (`InvoiceInboxDiscardDialog.jsx`):

- Title "¿Descartar esta factura?" / "¿Descartar {n} facturas?"; body "No se creará ninguna factura
  de compra. Quedará(n) en el filtro Descartadas, en solo lectura. Esta acción no se puede
  deshacer." Buttons Cancelar and Descartar (destructive). The focus opens on Cancelar.
- One request per document, three at a time (`useInvoiceInboxDiscard`); only `PENDING_REVIEW` /
  `ERROR` / `READY` rows are sent. While it runs the dialog is busy (`aria-busy`, spinner, both
  buttons disabled, no X, Escape and outside clicks ignored) and the bar's Descartar is disabled, so
  a double click sends one batch.
- Answers: 200 (also for an already discarded document — idempotent) counts as discarded. 409
  `not_discardable` (PROCESSING or CONFIRMED meanwhile), 404 (unknown or other tenant), 403
  `org_not_allowed` fail that document only. `feature_disabled`, a code-less 403 (role without write
  access to the window) or a network error stop the batch: the rest is not sent. Reasons are
  translated by code (`invoiceInboxMessages.js`); the backend text is never shown.
- Toasts: all OK → "Factura descartada. La encontrarás en Descartadas." / "{n} facturas
  descartadas"; partial → warning "{ok} de {total} facturas descartadas. {failed} no se pudieron
  descartar: {reason}"; none → error "No se pudieron descartar las facturas: {reason}". The reason is
  the stopping one, the common one, or a generic text when failures differ.
- Afterwards, always: the dialog closes, the selection is cleared, and the list, the counters and the
  polling reload, so the documents leave Todas / Pendientes / Con error and Descartadas grows; a
  failed one shows its real status. Leaving the page during a batch stops sending and nothing is
  updated afterwards.
- Discarded documents are read-only, cannot be selected and keep no expiry (no purge exists).

## Review panel (ETP-6050, S1)

Read only. A drawer (`InvoiceInboxReviewDrawer.jsx`), its own shell used only by this window, built
from the shared `Sheet` pieces (root, portal, overlay, title, close) plus the Radix content, to
follow the design: flush to the right edge and the full viewport height, width
`min(1280px, 100vw - 48px)`, 16px radius on the left corners, a 260 ms slide-in over a veil of
`rgba(27, 26, 31, .45)` with a 200 ms fade. It is NOT `GenericPreviewModal` and shares nothing with
it. Closes on an outside click, on the X of its header and on Escape (kept for accessibility). The
document is on the left (the remaining width, `border-subtle` background); the form on the right
(`min(560px, 55%)`, at least 420px, left border, own scroll with 18/20/24 padding, fixed footer).
Typography is the system's (no font family is set); colours are the system's tokens. Text taken
from the document (banners, "En el documento: «…»", names) wraps anywhere, so the form pane never
scrolls horizontally; the numeric line cells keep the design widths and carry the full value in
`title`.

- **Header** (`InvoiceInboxReviewHeader.jsx`, 60px): file-type icon (file for PDF, image for
  JPG/PNG), file name (17px bold, the dialog title), status tag (`STATUS_LABEL_KEYS` /
  `STATUS_TONES`), the origin line "Correo de {sender} · {date time}" (e-mail) or "Carga manual ·
  {date time}" (`formatReceived`), an empty `aria-live` save-status slot (S2 fills it), "{n} de
  {total}", previous / next (chevron icon buttons) and the close X (the Sheet's absolute close
  button is not drawn). The header shows the list row's data until the read arrives.
- **Viewer** (`InvoiceInboxReviewViewer.jsx`): a toolbar "DOCUMENTO ORIGINAL", zoom out, "{zoom}%",
  zoom in, download (30px icon buttons), above the document. `useMainAttachment` on table
  `ETGO_Incoming_Document` plus the shared `PdfViewer` (`zoom` prop, `hideToolbar`, no floating
  bar) for a PDF, or the image with the same percentage. Zoom 40-160, step 15, and the readout is
  TRUE: 100 % is a fixed A4 sheet of 595px, so the page renders `595 * zoom / 100` px wide on any
  pane width (scrolling inside the pane when wider). It starts at 100, or, when the pane's inner
  width (pane width minus its side gaps, tracked with a ResizeObserver) is below 595, at
  `max(45, floor(w / 595 * 20) * 5)` (`initialZoom`). The shared `PdfViewer` takes a scale
  relative to the pane, so it gets `scale = (595 * zoom / 100) / basis` through its `zoom`
  prop, where `basis` is the width the shared viewer fits a page to (its own scroll box minus the side
  gaps, read from the DOM after the document loads; it is narrower than the pane by the scroll
  gutter) (`usePdfZoom`'s own steps and range are not used); an image gets the width in px. READ
  ONLY: no upload / mark-as-main / delete is wired.
- **Form** (`InvoiceInboxReviewForm.jsx` and its sections; all `readOnly` in S1; sections 22px
  apart, a 11px uppercase letter-spaced bold section title, 12px below it):
  - Banners at the TOP (`InvoiceInboxReviewBanners.jsx`, rules in `reviewBanners`): confirmed
    (green: "{docNo} registrada en Etendo · Completada" with the invoice's `documentNo`, falling back to
    its identifier only when absent; no link), unreadable (only while the document is not
    `adjusted`), other error codes (`errorCodeLabelKey`) and possible duplicate (invoice and other
    inbox documents; never blocks; not on confirmed / discarded).
  - Proveedor (`InvoiceInboxReviewVendor.jsx`): linked (card: 36px building avatar, name, mono
    "{taxId} · {city}", the "Vinculado por NIF / nombre" tag inline, ghost inert "Cambiar");
    ambiguous (one row: the "Etendo AI propone {n} proveedores" chip ("… propone 1 proveedor" for one) with sparkles and the muted
    "En el documento: «…»" with ", sin NIF legible" when no tax id was extracted; full-row
    candidate buttons with a custom radio, "Más probable" on the first, "Ninguno · crear
    proveedor nuevo con los datos extraídos" in primary; the destructive error "Elige uno de los
    proveedores propuestos"; disabled in S1); new (solid-border block on a muted background, user-plus
    icon, bold "Proveedor nuevo." + hint, ghost inert "Buscar existente", then name, NIF/CIF and
    the address STRUCTURED: dirección, código postal, ciudad, país — the extracted country by
    name, Spain when empty, decision 8); none (an inert field "Selecciona un proveedor de Etendo…"
    and "Indica el proveedor"). A confirmed / discarded document shows the vendor as plain text.
  - Cabecera: a 2-column grid: Nº factura | Fecha de factura * (calendar icon inside the input,
    `formatCalendarDate`; red border, the amber "Revisar" tag and "Indica la fecha de factura"
    when `validation.missing` has `invoiceDate`), then Moneda. No Vencimiento (decision 1).
    Moneda is the shared `CurrencyRatePicker` in `isReadOnly` mode, fed `value` = the
    currency id, `displayValue` = its ISO code, `formData {eTGOCurrencyRate: 1}` (the invoice is
    created in the organization currency, no conversion) and NO `apiBaseUrl`, so it shows
    "EUR — 1,00" like the purchase / sales documents and requests no currency options (the spec
    has no `currencyOptions` action). It still reads the organization's rate precision through
    its own `useCurrencyPrecision` (`GET /sws/neo/session`), as it does in every window.
    Confirmed / discarded: the fields are disabled.
  - Líneas · {n} (`InvoiceInboxReviewLines.jsx`): columns Descripción | Cant. 62 | Precio 84 |
    IVA 78 | Importe 86 | 34, header 12/600; each line has a second full-width row: the product
    chip, a BUTTON (chevron at the right) that toggles an expandable panel. Chip: linked (package
    icon, name, mono search key, "· Coincidencia exacta / Por similitud"; no "saved equivalence",
    decision 2), ambiguous (AI chip "{n} productos posibles" ("1 producto posible" for one) + "Elige uno" in warning colour;
    starts expanded), new ("Producto nuevo" pill + "{category} · {uom} · se creará al confirmar"),
    none (red alert + "Sin producto · vincúlalo o créalo"). Panel: "En el documento: «…»", the
    candidate list ("Más probable" on the first), "Ninguno · crear producto nuevo" and the inert
    catalogue search ("Vincular a un producto existente", "Cambiar por otro producto" when
    linked). A missing tax shows "—" in red. ONE red line below the table joins the active errors
    (unresolved products, missing tax, "La factura no tiene importe") with " · "; with no lines the
    table shows only its header. "Añadir línea" (ghost, plus
    icon) and each line's trash (the `DataTable` row-delete pattern, decision 5: visible on hover
    and keyboard focus) are inert. Confirmed / discarded: the compact list (description, muted
    "{searchKey} · {qty} × {price} · IVA {rate}%", amount).
  - Totals card (`InvoiceInboxReviewTotals.jsx`): base and one "IVA {rate}% s/ {base}" row per
    rate at 14px, then the Total on a muted band with top border ("Total" 15/700, a red asterisk,
    the amount at 20px extra-bold), from the lines (`computeTotals`); always shown, with zeros when
    there are no lines. Amounts use `formatCurrency` with the document currency,
    quantities `formatGroupedNumber`, dates `formatCalendarDate`.
  - Total mismatch banner (`InvoiceInboxReviewMismatchBanner`) at the BOTTOM, after the totals
    (decision 4: non-blocking, only when `totalSource` is `printed` and the printed total differs
    from the lines total by more than ONE cent, compared in integer cents; never on confirmed /
    discarded).
- **Footer** (`InvoiceInboxReviewFooter.jsx`): an icon-only danger Descartar (32px, trash,
  label "Descartar"; only when the document can be discarded; the ETP-6049 dialog and queue),
  the "{n} obligatorios pendientes" counter taking the free space (right-aligned, destructive
  while pending), "Marcar como revisada" (secondary, hidden when READY) and "Confirmar factura"
  (primary, check icon), both DISABLED ("Próximamente"). A READY document shows "Revisada por ti"
  as muted text in the counter slot. CONFIRMED and DISCARDED have no footer. Discarding from the
  panel closes it (only when that document was actually discarded: a failed discard keeps the
  panel open, with its error toast) and always reloads the list and counters.
- **Navigation** (`useInvoiceInboxReviewNav.js`): "{n} de {total}" uses the current filter's counter
  as the total only while more pages exist (never less than the loaded openable rows); at the end of
  the list the total is exactly the loaded OPENABLE rows (the counter also counts PROCESSING rows). On close, focus returns
  to the element that opened the panel (the pencil, or the clicked row's pencil), unless it left
  the DOM. Previous / next walk the rows of the CURRENT
  filter already loaded in `useInvoiceInboxList`, skipping PROCESSING. They stop at the ends (not
  circular): at the end of the loaded rows, with `hasMore`, "next" loads the next page and moves
  to its first openable row (it keeps loading while a page brings only PROCESSING rows, and stops
  at a load error or the end). On close the page re-reads the rows opened and the counters.
- **Read errors** (`useInvoiceInboxReview.js`): 409 `processing`, `not_found`, `feature_disabled`,
  `org_not_allowed` and a network error show a message and "Reintentar" in the form pane; the
  viewer is independent.
- Not built (out of scope): the sparkles icon next to field labels, the "Editado" chip, the
  history tab, source-region highlighting on the document.
- The pure rules (totals, mismatch, neighbours, banners, vendor view, zoom) live in
  `invoiceInboxReviewModel.js`.

### Deferred (registered in `flags-registry.json`, feature `invoice-inbox`)

- `due-date-extraction`: the panel shows no Vencimiento; the OCR schema does not extract a due date
  and how to handle it is still open (to be treated later; user decision 2026-11-12, ETP-6050
  decision 1).
- `review-edit-and-resolution`: S1 is read only; editing with autosave, `ADJUSTED`, supplier and
  product resolution and mark-as-reviewed are slices S2 / S3 of ETP-6050.
- `revalidate-on-edit` stays open: the review read recomputes the validation at read time only; it
  is persisted on edit in S2.

## Polling of PROCESSING rows

`useProcessingRowsPoll`: while at least one loaded row is `PROCESSING` and the browser tab is visible,
re-read those rows by id (`criteria [{fieldName:'id', operator:'inSet', value:[ids]}]`, chunks of 50) and
replace them in place. The same poll also re-reads the "Resultado de tus cargas" documents still being
read (one poller for both). Backoff 3, 5, 8, 13, 20, then every 30 s; reset by any change, an upload or
"Actualizar" or a tab change; stops after 15 minutes without change (the server sweeper retries stalled rows every
2 minutes). A changed row also refreshes the counters. A row that leaves the current tab's filter stays
visible until the next reload, so the table does not jump under the cursor.

## Telemetry

One frontend event, `invoice_inbox_opened` (ETP-6050), makes the backend-only `invoice-inbox` flag measurable.
The inbox is a custom page, so the generic `window_opened` of `ListView` never fires for it, and the flag is
evaluated only by the backend, so the browser never emits `feature_flag_evaluated` for it.

- Hook: `useInvoiceInboxOpenedTracking.js`, called from `InvoiceInboxPage.jsx`; it calls `trackInvoiceInboxOpened`
  (`lib/productUsageTelemetry.js`). Catalog entry: `INVOICE_INBOX_OPENED` in `lib/observability/events.js`.
- Fires once per mount of the page (it is mounted only while shown). A ref guards the StrictMode double effect;
  list refreshes, the review drawer, polling and locale changes do not re-fire it. Leaving and returning is a new opening.
- Properties: `account_id` (tenant), `category` = `product_usage`, `specName` = `invoice-inbox`. No file names,
  vendors, amounts or document ids.
- Adoption = `invoice_inbox_opened` over `session_started` in Mixpanel (report not created yet, tracked in
  etendo-kpis). Emission table: `docs/ops/mixpanel-kpi-emission-spec.md`.
- Caveats: adoption = `invoice_inbox_opened` over `session_started` in Mixpanel; demo tenants (tenant_type D) and test accounts are NOT excluded yet (the ETGO_Account test-account indicator is pending with Platform); `account_id` carries the tenant `clientId`, as in ETP-5889, while etendo-kpis notes that `etgo_account_id` replaces `account_id` for backend events (a frontend migration, if any, must move ETP-5889 and this event together).
- Hosted Datadog setting `invoice-inbox`: created 2026-11-13, boolean, default false, team Plataforma, server only,
  no targeting rules, disabled in Production.

## Files

`tools/app-shell/src/windows/custom/invoice-inbox/`: `index.jsx` (route guard), `InvoiceInboxPage.jsx`,
`InvoiceInboxToolbar.jsx`, `InvoiceInboxTable.jsx`, `InvoiceInboxCells.jsx`, `InvoiceInboxDropZone.jsx`
(drop card, hidden input, e-mail mockup), `InvoiceInboxDragOverlay.jsx`, `InvoiceInboxUploadTray.jsx`,
`InvoiceInboxSelectionBar.jsx`, `InvoiceInboxRowActions.jsx`, `InvoiceInboxDiscardDialog.jsx`,
`invoiceInboxFilters.js`, `invoiceInboxApi.js`, `invoiceInboxMessages.js`,
`invoiceInboxUploadPolicy.js`, `invoiceInboxUploadLog.js`, `invoiceInboxUploadResult.js`,
`InvoiceInboxUploadResult.jsx`, `useInvoiceInboxUploadResult.js`, `useInvoiceInboxList.js`, `useInvoiceInboxUpload.js`,
`useInvoiceInboxDiscard.js`, `useProcessingRowsPoll.js`, `useInboxFileDrop.js`. Review panel (ETP-6050):
`InvoiceInboxReviewDrawer.jsx`, `InvoiceInboxReviewHeader.jsx`, `InvoiceInboxReviewViewer.jsx`,
`InvoiceInboxReviewForm.jsx`, `InvoiceInboxReviewVendor.jsx`, `InvoiceInboxReviewLines.jsx`,
`InvoiceInboxReviewTotals.jsx`, `InvoiceInboxReviewBanners.jsx`, `InvoiceInboxReviewFooter.jsx`,
`InvoiceInboxReviewParts.jsx`, `invoiceInboxReviewModel.js`, `useInvoiceInboxReview.js`,
`useInvoiceInboxReviewNav.js`. Telemetry (ETP-6050): `useInvoiceInboxOpenedTracking.js`. Shared touch points:
`SegmentedTabs.jsx` (optional `count` per item), `menu.json` (Purchases item),
`lib/capabilityVisibility.js` (`INVOICE_INBOX_CAPABILITY`), `windows/registry.js` (`customLoaders`).

## Test ids

`invoice-inbox-page`, `invoice-inbox-dropzone`, `invoice-inbox-file-input` (use `setInputFiles()`),
`invoice-inbox-upload-button`, `invoice-inbox-drag-overlay`, `invoice-inbox-email-card`,
`invoice-inbox-email-copy`, `invoice-inbox-upload-tray`, `invoice-inbox-upload-progress`,
`invoice-inbox-upload-item-{index}` (with `data-status`), `invoice-inbox-upload-item-name-{index}`, `invoice-inbox-upload-item-message-{index}` (tooltips: `…-tooltip`), `invoice-inbox-upload-close`,
`invoice-inbox-upload-stay-notice`, `invoice-inbox-result`, `invoice-inbox-result-title`,
`invoice-inbox-result-hint`, `invoice-inbox-result-reason-{CODE}`, `invoice-inbox-result-handled`,
`invoice-inbox-result-gone`, `invoice-inbox-result-dismiss` (close X), `invoice-inbox-result-retry`,
`invoice-inbox-refresh`, `invoice-inbox-filter-{all|pending|error|confirmed|discarded}`,
`invoice-inbox-filter-count-{key}`, `invoice-inbox-table`, `row-{id}` (DataTable),
`invoice-inbox-document-{id}`, `invoice-inbox-received-{id}`, `invoice-inbox-source-{id}` and `invoice-inbox-source-icon-{id}` (e-mail only), `invoice-inbox-file-name-{id}`, `invoice-inbox-vendor-name-{id}`,
`invoice-inbox-vendor-tax-id-{id}`, `invoice-inbox-status-reason-{id}` (each tooltip: `<id>-tooltip`), `invoice-inbox-discarded-at-{id}`, `invoice-inbox-duplicate-{id}`, `invoice-inbox-status-{id}`,
`invoice-inbox-load-more`, `invoice-inbox-empty`, `invoice-inbox-load-error`, `invoice-inbox-retry`,
`invoice-inbox-selection-bar`, `invoice-inbox-selection-count`, `invoice-inbox-bulk-mark-review`,
`invoice-inbox-bulk-discard`, `invoice-inbox-bulk-confirm`; row actions (inside DataTable's quick-actions cell):
`invoice-inbox-row-actions-{id}`, `invoice-inbox-row-edit-{id}`, `invoice-inbox-row-more-{id}`
(both `aria-disabled`), `invoice-inbox-row-discard-{id}`; dialog: `invoice-inbox-discard-dialog`,
`invoice-inbox-discard-dialog-title`, `invoice-inbox-discard-dialog-body`, `invoice-inbox-discard-cancel`,
`invoice-inbox-discard-confirm`, `invoice-inbox-discard-spinner`; menu: `menu-item-invoice-inbox`.

Review panel (prefix `invoice-inbox-review-`): `-drawer`, `-veil`, `-header`, `-title`, `-status`,
`-origin`, `-save-status`, `-position`, `-prev`, `-next`, `-close`, `-left`, `-right`, `-scroll`,
`-loading`, `-error`, `-error-text`, `-retry`, `-advancing`; viewer: `-viewer`, `-viewer-loading`,
`-viewer-empty`, `-viewer-toolbar`, `-viewer-label`, `-viewer-zoom-out`, `-viewer-zoom`,
`-viewer-zoom-in`, `-viewer-download`, `-viewer-file`, `-viewer-image`; form: `-form`, `-banners`,
`-banner-{confirmed|unreadable|duplicate|duplicate-inbox|mismatch|error-{CODE}}` (+ `-title`,
`-body`), vendor: `-vendor` (`data-state`), `-vendor-title`, `-vendor-linked`,
`-vendor-plain`, `-vendor-name`, `-vendor-meta`, `-vendor-matched-by`, `-vendor-change`,
`-vendor-ambiguous`, `-vendor-ambiguous-title`, `-vendor-in-document`, `-vendor-candidate-{id}`,
`-vendor-likely-{id}`, `-vendor-none-option`, `-vendor-error`, `-vendor-new`, `-vendor-new-title`,
`-vendor-new-hint`, `-vendor-search-existing`, `-vendor-new-{name|taxid|postalcode|address|city|country}`,
`-vendor-none`, `-vendor-none-hint`; header section: `-header-section`, `-header-title`,
`-invoice-no`, `-invoice-date` (+ `-tag`, `-error`, `-icon`; each field also `…-field`), the
currency picker (`field-currency`, `currency-rate-readonly`); lines: `-lines`, `-lines-title`,
`-lines-head`, `-lines-list`, `-lines-error`, `-line-{i}`,
`-line-{i}-{description|quantity|price|tax|amount|detail|product|product-tag|product-name|panel|candidates|in-document|candidate-{id}|likely|none-option|search}`,
`-line-delete-{i}`, `-add-line`; totals: `-totals`, `-total-base`,
`-total-tax-{rate}`, `-total`, `-total-label`; footer: `-footer`, `-discard`, `-pending`,
`-reviewed`, `-mark-reviewed`, `-confirm`.

## Next steps (inside ETP-6049, not in the base)

| # | Gap | Proposal |
|---|---|---|
| N1 | Vendor state (new / ambiguous / N matches) | `VENDOR_STATE` + `VENDOR_CANDIDATES` columns written by `InvoiceInboxSummary.syncFrom`; badges "Proveedor nuevo" / "{n} coincidencias" |
| N2 | Duplicates inside the inbox (`duplicate.inbox[]`) | a column in `InvoiceInboxSummary.syncFrom`; recomputed on edit by ETP-6050 |
| N3 | One-request "errors first" | stored computed `SORT_PRIORITY` (S/S, pure function of `STATUS`) → one `_sortBy`, drop the two streams |
| N4 | Row currency | `C_Currency_ID` filled by the reader |
| N5 | Detailed error reason ("missing vendor, date and amount") | `MISSING_FIELDS` column, or leave it to the review panel |
| N6 | Counters in one request | `@NeoExtension(spec="invoice-inbox", entity="header")` + `NeoListAggregateQuery.groupBy(status)` |
| N7 | Counter in the menu | a global count from the side menu |

## Manual verification

Prerequisites: `etendo.go.flags.invoice-inbox=true` (Tomcat restart) and the spec pushed.

1. Admin with the flag on: "Bandeja de facturas" as the last item of Compras; flag off or a Ventas role: no entry, and
   `/invoice-inbox` typed by hand shows the access-denied screen.
2. Title and breadcrumb "Bandeja de facturas"; e-mail card with Copy disabled.
3. Pick 3 files: tray "Cargando X de 3", one `POST …/upload` per file in Network, close button only at
   the end, three `PROCESSING` rows with placeholders.
4. 21 files → warning, no request. A `.webp` next to a PDF → the PDF uploads, the warning names the
   `.webp`. A file over 10 MB → refused by name.
5. Rows move from Procesando to Pendiente revisión / Con error without reloading; polling requests
   space out and stop when no row is `PROCESSING`; a hidden browser tab sends none.
6. Counters match the rows of each tab; Todas lists Con error first; empty tabs show their empty state.
7. Selecting rows shows the bar with "Marcar para revisión" and Confirmar disabled ("Próximamente") and Descartar enabled;
   PROCESSING/CONFIRMED/DISCARDED rows cannot be checked.
8. Organization `*` → uploading shows "Elige una organización concreta para cargar facturas".
9. English and Spanish: no untranslated text.
10. Select 2 → Descartar → "¿Descartar 2 facturas?" (no "30 días"), focus on Cancelar → Descartar →
    two `POST …/header/{id}/action/discard` in Network, toast "2 facturas descartadas", selection
    empty, counters updated; in Descartadas the rows show "Descartada el {fecha}" and cannot be checked.
11. Hover a Pendiente revisión row: pencil opens the panel, kebab inert with "Próximamente", red trash → dialog
    "¿Descartar esta factura?". A Confirmada / Descartada row: no trash. A Procesando row: no action.
12. Double click on Descartar → one batch. Escape during the batch does not close the dialog.
13. Click a row (or its pencil): the panel opens with the document on the left and the form on the
    right; a PROCESSING row does not open. Next/previous skip PROCESSING rows, stay within the
    current tab, and at the end of the loaded rows load the next page. Escape and an outside click
    close it. A CONFIRMED row shows the green banner with the invoice link and no footer; a
    DISCARDED row, no footer. "Marcar como revisada" and "Confirmar factura" are disabled. Discard
    from the footer uses the same dialog and closes the panel. English and Spanish: no untranslated
    text. (Needs the backend `review` action deployed.)
