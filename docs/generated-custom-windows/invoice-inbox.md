# Invoice Inbox

"Bandeja de facturas" in Spanish. Epic ETP-6046; this guide covers ETP-6049 (list, upload and
discard).
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
- opening a document (review panel, edit, "Mark as reviewed") — ETP-6050. A row click does nothing
  and the row's Edit (pencil) is shown inert ("Próximamente");
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
  `etendo_get`), the upload and the `discard` action all refuse with `403 feature_disabled`
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
- The upload is a NEO built-in endpoint (`POST /sws/neo/invoice-inbox/upload`), dispatched before the
  spec router; the read-only spec does not affect it.
- `apiBaseUrl` of the window is the spec (`/sws/neo/invoice-inbox`): the list is `apiFetch('/header?…')`,
  the upload `apiFetch('/upload', …)`, the discard `apiFetch('/header/{id}/action/discard', …)`. Every
  call goes through `useApiFetch`.
- Row keys used: `fileName`, `source`, `created` (reception timestamp; there is no `creationDate`
  key), `businessPartner` + `businessPartner$_identifier` + `businessPartner$taxID`
  (`_extraProperties=businessPartner.taxID`), `extractedName`, `extractedTaxID`, `orderReference`,
  `invoiceDate` (date-only), `grandTotalAmount`, `status`, `errorCode`, `duplicateOfInvoice`
  (+ `$_identifier`), `discardedAt` (timestamp; served in the list as a `readOnly` field).
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
| Nº factura | number or "—"; amber copy icon "Posible duplicado de {doc}" when `duplicateOfInvoice` is set and the row is not CONFIRMED/DISCARDED |
| Fecha | `formatCalendarDate(invoiceDate)`; red "—" when missing |
| Total | `formatCurrency(organization currency, grandTotalAmount)` — the row has no currency column yet; the user corrects it in review (ETP-6050) |
| Estado | status tag by code; ERROR adds the reason by `errorCode`; CONFIRMED adds "{invoice} · Completada" when the invoice identifier is served; DISCARDED adds "Descartada el {date}" from `discardedAt` (wall-clock timestamp, `parseWallClockInstant`, date only; nothing when absent). Never a "deleted in 30 days" text |

- Text that can be clipped — file name, vendor name and tax id, the status reason (error or created
  invoice) — ellipsises and shows the full text in a tooltip on hover and on keyboard focus (shared
  `TruncatedText`, `tabIndex` 0, opens only when the text is actually clipped).
- `PROCESSING` rows show animated placeholders in Proveedor, Nº, Fecha and Total, cannot be selected
  and cannot be opened.
- Selectable rows: `PENDING_REVIEW`, `READY`, `ERROR` (`isRowSelectable`). The batch bar shows
  "{n} seleccionada(s)", then, in the design's order, "Marcar para revisión" (disabled,
  "Próximamente"), Descartar (enabled, see Discard) and Confirmar (disabled, "Próximamente"),
  and the close button clears the selection.
- Row hover actions, in the reserved space at the end of the row (as in `/sales-order`): Edit
  (pencil) and More (kebab), both shown inert with a "… · Próximamente" tooltip, and the red trash
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

## Polling of PROCESSING rows

`useProcessingRowsPoll`: while at least one loaded row is `PROCESSING` and the browser tab is visible,
re-read those rows by id (`criteria [{fieldName:'id', operator:'inSet', value:[ids]}]`, chunks of 50) and
replace them in place. The same poll also re-reads the "Resultado de tus cargas" documents still being
read (one poller for both). Backoff 3, 5, 8, 13, 20, then every 30 s; reset by any change, an upload or
"Actualizar" or a tab change; stops after 15 minutes without change (the server sweeper retries stalled rows every
2 minutes). A changed row also refreshes the counters. A row that leaves the current tab's filter stays
visible until the next reload, so the table does not jump under the cursor.

## Files

`tools/app-shell/src/windows/custom/invoice-inbox/`: `index.jsx` (route guard), `InvoiceInboxPage.jsx`,
`InvoiceInboxToolbar.jsx`, `InvoiceInboxTable.jsx`, `InvoiceInboxCells.jsx`, `InvoiceInboxDropZone.jsx`
(drop card, hidden input, e-mail mockup), `InvoiceInboxDragOverlay.jsx`, `InvoiceInboxUploadTray.jsx`,
`InvoiceInboxSelectionBar.jsx`, `InvoiceInboxRowActions.jsx`, `InvoiceInboxDiscardDialog.jsx`,
`invoiceInboxFilters.js`, `invoiceInboxApi.js`, `invoiceInboxMessages.js`,
`invoiceInboxUploadPolicy.js`, `invoiceInboxUploadLog.js`, `invoiceInboxUploadResult.js`,
`InvoiceInboxUploadResult.jsx`, `useInvoiceInboxUploadResult.js`, `useInvoiceInboxList.js`, `useInvoiceInboxUpload.js`,
`useInvoiceInboxDiscard.js`, `useProcessingRowsPoll.js`, `useInboxFileDrop.js`. Shared touch points:
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
11. Hover a Pendiente revisión row: pencil and kebab inert with "Próximamente", red trash → dialog
    "¿Descartar esta factura?". A Confirmada / Descartada row: no trash. A Procesando row: no action.
12. Double click on Descartar → one batch. Escape during the batch does not close the dialog.
