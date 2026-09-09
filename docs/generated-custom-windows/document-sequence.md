# Document Sequence

## Intent

Document Sequence (ETP-5190) lets a tenant define how its documents are numbered: the prefix, the
suffix, the number the next document takes, and whether the count restarts each year. It is the
target of the **"Personaliza tus facturas"** First Steps step, which is the reason it exists —
before it, invoice numbering was the one thing on the onboarding checklist a tenant could not
reach from Etendo GO at all.

## What this window should allow

Users should be able to:

- browse the sequences of their tenant by name
- open a sequence and edit its **prefix**, **suffix**, **next assigned number**, **starting
  number**, **increment**, and whether it **restarts every year**
- set the numbering mask / value format for the sequences that use one
- see, and not accidentally change, the internal fields Etendo maintains itself

## Interaction model

- **Route:** `/document-sequence`, `/document-sequence/:recordId`
- **Visibility:** visible in the **Configuración** menu as **Document Sequence** (EN) /
  **Secuencias de documentos** (ES), immediately after **Organización** (AD window ID `112`)
- **Implementation type:** generated window — `registry.js` resolves the slug straight to the
  generated entry point; there is no custom wrapper
- **Window shape:** header-only. `AD_Sequence` is a single AD tab (tab `146`) with no children,
  so there is no detail tab strip and no lines
- **List behavior:** sorted by name (`listSortBy: "name asc"`); the grid shows Name, Prefix,
  Suffix, Next Assigned Number, Starting No. and Restart every year. **The list is scoped** —
  see below; a tenant has 242 sequences and the window shows eleven of them
- **Reachability:** also linked from `/first-steps` — the checklist's numbering step navigates
  here rather than editing the values inline (see the "Why the step navigates" note below).
  It is **step 6 of 7**, after the product and contact imports and before the team
  invitations: a tenant picks its invoice series once its master data is in, and inviting the
  team is the last thing it does. The position is the array order in `firstStepsConfig.js` —
  nothing renders a step number, so reordering that array is the whole change

## Field mapping

| Field | AD column | Classification |
|---|---|---|
| Name | `Name` | editable, grid 1 |
| Prefix | `Prefix` | editable, grid 2 — **validated**, see below |
| Suffix | `Suffix` | editable, grid 3 |
| Next Assigned Number | `CurrentNext` | editable (integer), grid 4 |
| Starting No. | `StartNo` | editable (integer), grid 5 |
| Restart sequence every Year | `StartNewYear` | editable, grid 6 |
| Increment By | `IncrementNo` | editable (integer), form only |
| Auto Numbering | `IsAutoSequence` | editable, form only |
| Description | `Description` | editable, form only |
| Mask / Value Format | `Mask`, `VFormat` | editable, form only |
| Document Type | `C_Doctype_ID` | **discarded** — the real link runs the other way (`C_DocType.DocNoSequence_ID`), so exposing this column invites edits that change nothing |
| Current Next (System) | `CurrentNextSys` | discarded — Etendo's own counter for system-owned records |
| Used for Record ID, Table, Column | `IsTableID`, `AD_Table_ID`, `AD_Column_ID` | discarded — only meaningful for record-ID sequences, which are not document numbering |
| `EM_Etsg_Isrectificative`, `EM_Etask_Task_Type_ID` | — | discarded via `discardPatterns: ["EM_*"]` |
| Client, Organization, Active, audit columns | — | discarded |

## Which sequences the list shows

`AD_Sequence` holds **242 rows per provisioned tenant** (measured on the instance). Almost all
are record-ID counters and internal numbering that a user opening this window has no reason to
touch, so a 242-row list would have been no shorter a path to the invoice series than the
Classic window was.

`DocumentSequenceHandler.applyListScope` narrows a list GET to the caller's own client and to
these eleven, by name:

| | |
|---|---|
| `AR Invoice` | sales invoice |
| `AP Payment` | supplier payment |
| `AR Receipt` | customer receipt |
| `MM Shipment` | goods shipment |
| `Standard Order` | sales order |
| `Purchase Order` | purchase order |
| `DocumentNo_C_Invoice` | table-level invoice fallback |
| `Secuencia TICKETBAI` | TicketBAI chaining counter |
| `DocumentNo_M_InOut` | table-level goods movement in/out |
| `DocumentNo_M_Movement` | table-level internal movement |
| `DocumentNo_A_Asset` | table-level asset |

The allowlist is a **product decision** and lives in `VISIBLE_SEQUENCE_NAMES`; adding a sequence
to the product means adding its name there. Every one of the eleven was verified to exist, by
this exact name, in a provisioned client.

**Injected as criteria, not filtered out of the response.** The pre-hook shares its `NeoContext`
with the default CRUD that runs after it, so appending clauses to the request's `criteria`
parameter means the narrowed query is the one that executes — paging, sorting and the total count
stay honest. Filtering the response instead would have returned "page 1 of 242" and thrown most
of it away, so the first page could legitimately have come back empty. Top-level criteria clauses
are ANDed, so a filter the user typed still applies; it is narrowed, not replaced.

**Tenant scoping.** An explicit `client equals <session client>` clause is added alongside. It is
redundant today — the instance has no sequences at client `0`, so DAL's readable-clients filter
already yields tenant-only rows — but stated so that a module which later ships System-level
sequences cannot leak them into a tenant's window.

**List only.** A GET by id is left unscoped: these are the tenant's own records and the point is
a shorter list, not access control, so a deep link into a sequence the list does not show still
resolves.

## Prefix validation (Spanish localizations)

`DocumentSequenceHandler` (`Java_Qualifier` `document-sequence` on the `sequence` entity) rejects
a prefix the Spanish fiscal localizations would refuse, **on write**:

| Rule | Rejects |
|---|---|
| length | more than 20 characters |
| lowercase / accents | `[a-záéíóúüñ]` |
| reserved letters | `[IOYWÑ]` |
| character set | anything outside `A-Z0-9-` |

The four messages are mapped in `lib/backendErrors.js`, so they render translated in both
locales.

**Why here and not in classic.** The identical rules exist in `com.smf.ticketbai`'s
`ProcessInvoiceTbaiHook.preProcess`, but that hook only fires when a *rectificative* invoice is
completed in a TicketBAI-configured organization — so a prefix chosen during onboarding went
unchecked until the tenant happened to issue its first corrective invoice, by which point the
numbering is in use and the prefix can no longer be changed without breaking the series.

**Applied only for Spain.** Resolved through `AD_OrgInfo` → `C_Location` → `C_Country` by
`OrganizationCountrySupport` (shared with the tax-identifier handler). These are localization
rules, not Etendo ones — `W` is an ordinary prefix letter in most of the world — and a tenant
whose country cannot be established is not subjected to them. Widening or narrowing that gate is
a Localization-team decision.

Clearing the prefix is always allowed: the rules constrain its content, not its presence.

## Why the First Steps step navigates here

An earlier iteration of the checklist edited the sales and purchase prefixes inline, through
`GET`/`POST /sws/go/onboarding/invoice-sequence`. Both endpoints and
`OnboardingInvoiceSequenceService` were removed when this window landed: a form that reached
exactly two of a tenant's sequences was a narrower answer than the window, and keeping both meant
two code paths writing the same rows. See
`{etendo_root}/modules/com.etendoerp.go/docs/onboarding-flow.md` § "Invoice numbering".

## Gap assessment

- **Purchase invoices ship without a sequence of their own.** Verified against the instance: all
  73 provisioned `ARI` (sales invoice) document types have a `DocNoSequence_ID`; **none** of the
  73 `API` (purchase invoice) ones do. Etendo falls back to the table-level
  `DocumentNo_C_Invoice` sequence, which is SHARED by every invoice document type lacking one.
  So a tenant that edits `DocumentNo_C_Invoice` here to set a purchase prefix changes numbering
  for every other doctype on that fallback. This window does not create or assign sequences —
  that is Etendo's "Create Sequences" process — so the gap is exposed, not closed.
- **No guard against renumbering a sequence already in use.** Lowering `CurrentNext` on a
  sequence whose numbers are already on issued documents re-issues them. The removed onboarding
  endpoint had a `409` guard for exactly this; the generic CRUD path has none. Worth a follow-up
  ticket rather than a silent assumption.
- **Four of the eleven appear TWICE per tenant.** `DocumentNo_C_Invoice`,
  `DocumentNo_M_InOut`, `DocumentNo_M_Movement` and `DocumentNo_A_Asset` each have two active
  rows in the same client, both at organization `*`, same `startno`, different `currentnext`
  (e.g. `10000001` and `10000009`) — Etendo created the table-level sequence more than once. Both
  are shown rather than one being guessed at, because which one is live is a data question and
  picking the wrong one would mean the user edits a row that changes nothing. Worth a data-fix
  ticket; not something this window should decide.
- No callouts. `rules-raw.json` reports 4 validation rules and 9 display-logic rows on the AD tab
  and no callout rows.

## Manual verification

1. Open `/document-sequence` from the Configuración menu and confirm the list shows **only the
   eleven allowlisted sequences** (with four of them appearing twice — see Gap assessment), NOT
   the tenant's full 242, sorted by name and with Prefix, Suffix and the two number columns.
2. Type something into the list's own filter and confirm it narrows further rather than
   revealing sequences outside the allowlist.
3. Open a sequence and confirm the form exposes Increment By, Auto Numbering, Description, Mask
   and Value Format in addition to the grid fields.
4. Confirm `Document Type`, `Current Next (System)`, `Used for Record ID`, `Table` and `Column`
   do **not** appear anywhere in the UI.
5. On a Spanish tenant, set the prefix to `fv-` and confirm the save is refused with the
   lowercase/accents message, translated.
6. Repeat with `FI-` (reserved letter), `FV_` (character set) and a 21-character prefix, and
   confirm each reports its own message rather than a generic one.
7. Set the prefix to `FV-` and confirm it saves.
8. Clear the prefix entirely and confirm that saves too.
9. Open `/first-steps`, expand "Personaliza tus facturas" and confirm **Configurar** navigates
   here.

## Automated evidence

- `tools/app-shell/src/menu.json` places **Document Sequence** in the Settings group
  (`windowId: "112"`), right after Organización; the label is translated in `en_US`, `es_ES` and
  `es_AR` under `menus`.
- `cli/config/regen-windows.json` registers the window (`windowId: "112"`,
  `menuName: "Document Sequence"`) — required before `make regen ONLY=document-sequence` will
  process it.
- `artifacts/document-sequence/decisions.json` classifies the 26 extracted fields and sets
  `entities.sequence.javaQualifier: "document-sequence"`.
- `artifacts/document-sequence/contract.json` carries that qualifier through to both the frontend
  and backend entity sections; the pipeline generated 70 contract tests, all passing at
  onboarding time.
- `DocumentSequenceHandlerTest` (`com.etendoerp.go`) covers the four prefix rules, their order,
  and the guards that stop the handler before the country lookup.

## Onboarding — ETP-5190

Window onboarded from scratch:

- Extracted with `sf-pipeline --menu-name "Document Sequence"` (AD window `112`, single tab `146`,
  26 columns).
- `decisions.json` written by hand: 11 user-facing fields, the rest discarded per the table above.
- `window.category` set to `"settings"`, matching the menu group the window lives in.
- Pushed to NEO at onboarding time (spec `A57F181BD15A458596F55A66084D6B29`). **`./gradlew
  export.database` is required** — without it the `ETGO_SF_*` rows only live in the DB and do not
  survive a rebuild.
