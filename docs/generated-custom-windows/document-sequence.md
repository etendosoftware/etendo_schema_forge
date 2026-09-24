# Document Sequence

## Intent

Document Sequence (ETP-5190) lets a tenant define how its documents are numbered: the prefix, the
starting number and the number the next document takes. It is the target of the
**"Personaliza tus facturas"** First Steps step, which is the reason it exists — before it,
invoice numbering was the one thing on the onboarding checklist a tenant could not reach from
Etendo GO at all.

**ETP-5285 narrowed it to the product's own document series, and ETP-5364 completed it.** The
window used to show seven sequences and eleven fields; ETP-5285 cut it to five sequences and five
fields, and ETP-5364 added the sixth series — `AP Invoice` / `FC` — so it now shows **six
sequences and five fields**. Everything the ticket asked for that is not here has a reason stated
below — read "Which sequences the list shows" and "The sixth series" before adding anything
back.

## What this window should allow

Users should be able to:

- browse their tenant's six document series by name
- open a series and edit its **description**, **prefix**, **starting number** and **next assigned
  number**
- see, and not accidentally change, the series' identity or the internal fields Etendo maintains
  itself

## Interaction model

- **Route:** `/document-sequence`, `/document-sequence/:recordId`
- **Visibility:** visible in the **Configuración** menu as **Document Sequence** (EN) /
  **Secuencias de documentos** (ES), immediately after **Organización** (AD window ID `112`)
- **Implementation type:** generated window — `registry.js` resolves the slug straight to the
  generated entry point; there is no custom wrapper
- **Window shape:** header-only. `AD_Sequence` is a single AD tab (tab `146`) with no children,
  so there is no detail tab strip and no lines
- **List behavior:** sorted by name (`listSortBy: "name asc"`); the grid shows Name, Description,
  Prefix, Starting No. and Next Assigned Number — the five fields ETP-5285 specified, and no
  others. **The list is scoped** — see below; a tenant has ~145 sequences and the window shows
  six of them
- **The set of series is fixed: no create, no delete** — see below. The window reads and edits
  the six rows the onboarding dataset provisions; it cannot add a seventh or remove one
- **Reachability:** also linked from `/first-steps` — the checklist's numbering step navigates
  here rather than editing the values inline (see the "Why the step navigates" note below).
  It is **step 6 of 7**, after the product and contact imports and before the team
  invitations: a tenant picks its invoice series once its master data is in, and inviting the
  team is the last thing it does. The position is the array order in `firstStepsConfig.js` —
  nothing renders a step number, so reordering that array is the whole change.
  **The step is hidden while the tenant is on the free/trial plan** (`productiveOnly`), because
  a series a tenant abandons after 14 days numbers nothing — the window itself stays reachable
  from the Configuración menu either way. See `onboarding-flow.md` § "Which steps a tenant is
  shown (plan gate)"

## Field mapping

ETP-5285 fixed the visible set at exactly five, in both grid and form.

| Field | AD column | Classification |
|---|---|---|
| Name | `Name` | **readOnly**, grid 1 — rendered as a translated series name, see below |
| Description | `Description` | editable, grid 2 |
| Prefix | `Prefix` | editable, grid 3 — **validated**, see below |
| Starting No. | `StartNo` | editable (integer), grid 4 |
| Next Assigned Number | `CurrentNext` | editable (integer), grid 5 |
| Suffix | `Suffix` | **discarded** (ETP-5285) — not part of the product's series definition |
| Increment By | `IncrementNo` | discarded (ETP-5285) — always 1; AD requires it on insert, which is why `hideCreate` is set |
| Auto Numbering | `IsAutoSequence` | discarded (ETP-5285) |
| Restart sequence every Year | `StartNewYear` | discarded (ETP-5285) |
| Mask / Value Format | `Mask`, `VFormat` | discarded (ETP-5285) |
| Document Type | `C_Doctype_ID` | discarded — the real link runs the other way (`C_DocType.DocNoSequence_ID`), so exposing this column invites edits that change nothing |
| Current Next (System) | `CurrentNextSys` | discarded — Etendo's own counter for system-owned records |
| Used for Record ID, Table, Column | `IsTableID`, `AD_Table_ID`, `AD_Column_ID` | discarded — only meaningful for record-ID sequences, which are not document numbering |
| `EM_Etsg_Isrectificative`, `EM_Etask_Task_Type_ID` | — | discarded via `discardPatterns: ["EM_*"]` |
| Client, Organization, Active, audit columns | — | discarded |

### Why the window cannot create or delete a series

`entities.sequence.methods: ["GET", "GETBYID", "PUT", "PATCH"]` in `decisions.json`. That is an
**API-level** refusal, not a hidden button: it becomes `apiPrediction.crud.sequence.post: false` /
`delete: false` in `contract.json`, which `push-to-neo` writes as `ETGO_SF_ENTITY.ISPOST='N'` /
`ISDELETE='N'`, which `NeoCrudHandler` reads through `NeoMethodPolicy.isMethodEnabled` to answer
**`405 Method Not Allowed`**. The same flags are honoured by the MCP write path
(`McpToolRouterSupport`) and by `BatchService`, so all three write paths refuse together.

`window.hideCreate`, `window.hideDeleteButton` and `entities.sequence.hideDelete` remove the
buttons. They are the affordance half and are **not** the guard — on their own they would leave
`POST /sws/neo/document-sequence/sequence` wide open.

Why both are refused:

- **Create.** A sequence created here would carry a name outside `VISIBLE_SEQUENCE_NAMES` and
  vanish from the list on the next load. `AD_Sequence.IncrementNo` is also `required` with no DB
  default and is no longer on the form, so the insert could not succeed anyway. The six series
  are provisioned by the onboarding dataset (`GOClient/AD_SEQUENCE.xml`); adding a seventh is a
  product change that goes through the dataset and the allowlist, not through the UI — that is
  exactly the path ETP-5364 took to add `AP Invoice`.
- **Delete.** Each of the six is pointed at by a `C_DocType.DocNoSequence_ID`. Deleting one
  orphans that reference and breaks the numbering of every document of that type.

**This needs `push-to-neo` + `./gradlew export.database` to take effect.** Until the
`ETGO_SF_ENTITY` rows are updated the buttons are gone but the endpoints still answer — the
contract alone enforces nothing at runtime.

### Why Name is read-only, and why it is displayed translated

`AD_Sequence` has **no `_TRL` table**, so a Spanish series name can only come from the stored
`Name` — and `Name` is the key the window's own allowlist matches on. Renaming a row from the
window would therefore drop it out of `VISIBLE_SEQUENCE_NAMES` and make it unreachable, silently
and permanently. So the stored name stays the canonical English one and the **display** is done
in the frontend:

`decisions.json` declares `enumValues` on `name`, mapping each canonical value to a
`genericLabels` i18n key. The generator turns that into `enumLabels` on the grid column
(`renderEnumCell` → `tMenu` → `genericLabels`) and into a read-only `select` on the form, whose
read-only branch renders the option's label. One declaration, both surfaces, no custom component.

| `AD_Sequence.Name` | i18n key | es_ES | en_US |
|---|---|---|---|
| `Purchase Order` | `documentSequencePurchaseOrder` | Pedido de compra | Purchase Order |
| `Standard Order` | `documentSequenceSalesOrder` | Pedido de venta | Sales Order |
| `AR Invoice` | `documentSequenceSalesInvoice` | Factura de venta | Sales Invoice |
| `Factura Rectificativa (Ventas)` | `documentSequenceSalesCorrectiveInvoice` | Factura de venta rectificativa | Corrective Sales Invoice |
| `AP Invoice` | `documentSequencePurchaseInvoice` | Factura de compra | Purchase Invoice |
| `Factura Rectificativa (Compras)` | `documentSequencePurchaseCorrectiveInvoice` | Factura de compra rectificativa | Corrective Purchase Invoice |

The keys live in `tools/app-shell/src/locales/{en_US,es_ES,es_AR}.json` under `genericLabels`.
Adding a series means adding its name to `VISIBLE_SEQUENCE_NAMES`, to `enumValues`, and to all
three locale files — miss the last and the grid renders the raw English name, with no error. It
also means shipping the `AD_Sequence` row itself in `GOClient/AD_SEQUENCE.xml`: a name on the
allowlist that no row carries is simply a series that never appears, with no error either.

## Which sequences the list shows

`AD_Sequence` holds **~145 rows per provisioned tenant** (242 before ETP-5364 stopped the
duplicated `DocumentNo_*` rows reaching a tenant — see below; an already-provisioned tenant still
carries the higher figure). Almost all of them are record-ID counters and internal numbering that a
user opening this window has no reason to touch, so the full list would have been no shorter a path
to the invoice series than the Classic window was.

`DocumentSequenceHandler.applyListScope` narrows a list GET to the caller's own client and to
these six, by name (seven before ETP-5285, five after it, six since ETP-5364):

| `AD_Sequence.Name` | Series | Prefix | Start |
|---|---|---|---|
| `Purchase Order` | Pedido de compra | `PC` | 1000000 |
| `Standard Order` | Pedido de venta | `PV` | 1000000 |
| `AR Invoice` | Factura de venta | `FV` | 1000000 |
| `Factura Rectificativa (Ventas)` | Factura de venta rectificativa | `FVR` | 1000000 |
| `AP Invoice` | Factura de compra | `FC` | 1000000 |
| `Factura Rectificativa (Compras)` | Factura de compra rectificativa | `FCR` | 1000000 |

The allowlist is a **product decision** and lives in `VISIBLE_SEQUENCE_NAMES`; adding a sequence
to the product means adding its name there. Every one was verified to exist, by this exact name,
**exactly once per organization**, in a provisioned client — `AP Invoice` since ETP-5364 shipped
its row in the dataset, the other five since before.

**Four names were dropped by ETP-5285** — `AP Payment`, `AR Receipt`, `MM Shipment` and
`Secuencia TICKETBAI`. They are not document series a tenant defines on this screen. Dropping a
name only hides the row: nothing is deleted and the numbering those sequences drive is unchanged.
`DocumentSequenceHandlerTest.allowlistExcludesTheNamesEtp5285Dropped` fails if one reappears.

**The ticket's "delete every other record" cannot be taken literally.** The other ~235 rows are
record-ID counters `ad_sequence_doc` and the DAL depend on; deleting them breaks the ERP. Hiding
them from this window — which is what the allowlist does — is the executable reading of that
requirement.

### The sixth series: "Factura de compra" (`FC`) — ETP-5364

ETP-5285 listed six series and could ship only five. `FC` had no `AD_Sequence` to point at:
stock Openbravo gives `AP Invoice` `IsDocNoControlled='N'` and no sequence — measured at the time
as **76 of 76 doctypes across all 75 clients**, and still 107 of 107 before this change — because a
purchase invoice is numbered by the supplier. Its proposed number came from the shared
`DocumentNo_C_Invoice` fallback counter.

**ETP-5364 took that product decision.** A purchase invoice in Etendo GO is now numbered by the
tenant's own `FC` series, exactly like every other invoice doctype. That needed two dataset
changes, and BOTH are required — either alone is a silent no-op:

| Where | Change |
|---|---|
| `GOClient/AD_SEQUENCE.xml` | a new `AD_Sequence` named `AP Invoice`, prefix `FC`, `STARTNO`/`CURRENTNEXT` 1000000, mask `#######` (id `B1BF521B12684968B31531D88B9F20AB`) |
| `GOClient/C_DOCTYPE.xml` | the `AP Invoice` doctype flips to `ISDOCNOCONTROLLED='Y'` and points `DOCNOSEQUENCE_ID` at that sequence |

A sequence nothing points at shows a configurable prefix that governs no numbering; a doctype
flipped with no sequence to read falls back to the counter it was already using.

**Both fronts.** The two dataset rows above make every tenant provisioned from this change on born
with six series. Already-provisioned tenants are closed by
`cli/src/data-fixes/sql/20260922T120000Z__R39-ap-invoice-fc-series.sql` (gap `N7`), which inserts
the sequence with a **per-tenant** uuid — never the dataset's GOClient id — and then flips the
doctype to point at it.

That corrective was declined when this section was first written, and **the objection has not gone
away**: it starts a numbering series over purchase invoices numbered by the `DocumentNo_C_Invoice`
fallback, so the series both splits and moves backwards. It was accepted on 2026-09-22 on two
premises — no tenant is productive, and going productive creates a *new* tenant born from the
corrected dataset, so a split demo series never becomes a legal one. **Unlike R38 there is no guard
to restore** the day the first premise stops holding: a tenant with issued purchase invoices needs a
manual starting-number decision, not this file.

A tenant that has not run R39 shows five rows instead of six — the name filter matches nothing,
which is the entire failure mode — and its purchase invoices keep taking the fallback number. That
is the expected state, not a regression.

### Why no `DocumentNo_*` sequence is listed

An earlier revision also exposed four table-level fallback counters —
`DocumentNo_C_Invoice`, `DocumentNo_M_InOut`, `DocumentNo_M_Movement` and
`DocumentNo_A_Asset`. They were removed for two independent reasons.

**They were duplicated in the data until ETP-5364.** Provisioning created each of them twice:
**9888 surplus `AD_Sequence` rows across 103 of 125 clients** when re-measured, 96 duplicated
groups out of 242 sequences in a freshly provisioned tenant. (Rows differing only by organization
are NOT this — per-org numbering is legitimate. Only rows sharing client *and* org are
duplicates.)

The cause is two creation passes ~45s apart, and it is **not** the one an earlier revision of this
guide named. Openbravo's `InitialClientSetup` creates the 97 `DocumentNo_<table>` rows for the new
client (`createdby='0'`, no mask), and the GO onboarding dataset then imported 96 of those same
names again from `GOClient/AD_SEQUENCE.xml` (`createdby` = the tenant admin, mask `#######`) as
new rows with fresh ids. `generateOnboardingSequences` is not the culprit: Etendo's classic
*Create Sequences* names its rows `<Table>-<Column>` and sets `AD_Column_ID`, and there are only
**206 such rows fleet-wide** — it produced none of the duplicates.

**ETP-5364 fixed pass 2 — at import time, not in the source file.** A new sub-filter,
`OnboardingDatasetNormalizer.TableCounterSequenceFilter`, drops every `AD_SEQUENCE` row whose
`NAME` starts with `DocumentNo_`, except `DocumentNo_C_ExtBP_Config_Filter_Opt` and
`DocumentNo_C_ExtBP_Config_Prop_Opt` — the only two such names `InitialClientSetup` does **not**
create (verified: exactly one row per client, in all 105 clients that have them, versus two for
every other). 96 rows dropped, 46 imported. A tenant provisioned from here on gets one copy of
each.

**Deleting them from `GOClient/AD_SEQUENCE.xml` would have been wrong**, and quietly so. That file
has a second consumer: `install.source` → `import.sample.data` seeds the GOClient *sample* client
from all 121 dataset files **wholesale**, and never runs `InitialClientSetup` — so for that
consumer the XML is the only source of these counters, and the sample client would have been left
unable to number a document. Unlike ETP-5079's deletion (gap N4b) this one leaves no dangling
foreign key, so `OnboardingDatasetReferentialIntegrityTest` stays green and nothing would have said
so until someone created a document in GOClient. The filter is the mechanism that file's own
`OnboardingDemoMasterData` javadoc prescribes for exactly this split.

This is **preventive only** — the 103 already-provisioned tenants still carry both copies, so
everything below still describes them. And note the filter is Java, loaded once per JVM, while the
XMLs are re-read on every provisioning: **verifying it by hand needs a Tomcat restart** first.

Numbering survives it by accident. `ad_sequence_doc` increments **every** row matching the name
(`WHERE Name = ... AND ad_client_id = ...`, no org, no id) and then reads one back with a
non-`STRICT` `SELECT INTO`, so PL/pgSQL takes an arbitrary row rather than raising. Both copies
hold the same value, so either answer is correct — until someone edits ONE of them, at which
point they diverge, the function still returns an arbitrary one, and PostgreSQL relocates an
updated row, so a prefix would apply intermittently. 140 groups have already diverged.

**And for purchase invoices there is nothing to configure anyway.** `DocumentNo_C_Invoice` is
what numbers a purchase invoice — verified on the instance: the doctype contributes no sequence,
so the Java layer (`UtilitySequence`, implemented by `com.etendoerp.sequences`; *not*
`ad_sequence_doctype`, which returns NULL and does no fallback) falls back to
`ad_sequence_doc('DocumentNo_' || tableName, client)`. In one client `DocumentNo_C_Invoice.currentnext`
is `10000024` and the highest such invoice is `10000023` — an exact match.

That was the stock behaviour for `AP Invoice` too, until ETP-5364 gave it its own `FC` series —
see "The sixth series" above. On a tenant provisioned since that change the fallback no longer
numbers purchase invoices at all; on an older one it still does. Either way the fallback counter
supplies only a *proposed* number, shared with every other doctype that has no sequence, so a
prefix set on it would configure a series that belongs to no single document type.

**What it costs.** The doctypes still without a sequence of their own are not reachable here:
`AP CreditMemo`, `MM Receipt`, plus asset and internal-movement numbering. One fallback row is
SHARED by all of them, so that entry point would change them all at once.

**Putting any of these names back is still wrong**, and fixing the duplication does not change
that: the objection is that a fallback counter is not a document series. If a doctype needs a
configurable series, give it one — that is what ETP-5364 did for `AP Invoice`. Note the
duplication is fixed **only for new tenants**; on the 103 existing ones, editing one row of a pair
still makes the applied value non-deterministic. And it is fixed on the tenant path only: the
GOClient sample client still holds one copy of each by design, because that is where its counters
come from.

**Injected as criteria, not filtered out of the response.** The pre-hook shares its `NeoContext`
with the default CRUD that runs after it, so appending clauses to the request's `criteria`
parameter means the narrowed query is the one that executes — paging, sorting and the total count
stay honest. Filtering the response instead would have returned "page 1 of ~145" and thrown most
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

- **[Closed for new tenants — ETP-5364] Purchase invoices had no configurable series.** Stock
  Etendo makes `AP Invoice` `IsDocNoControlled='N'` with no sequence, so its number came from the
  shared `DocumentNo_C_Invoice` fallback. ETP-5364 ships an `AP Invoice` sequence (`FC`) and
  points the doctype at it, in the onboarding dataset — so this is closed for tenants provisioned
  from now on and **still open for the 107 existing ones**, which show five rows here instead of
  six. See "The sixth series" above.
- **Related loose end, still unverified.** `documentNo` is `readOnly` with
  `grid: false, form: false` in `artifacts/purchase-invoice/decisions.json`, so it is hidden from
  the UI entirely. With ETP-5364 that is now the right shape for a GO-numbered purchase invoice
  (the tenant's own series fills it), but on a pre-ETP-5364 tenant the supplier's number still
  cannot be typed anywhere; `orderReference` is editable and may be serving that role in
  practice — worth checking before assuming a gap.
- **No guard against renumbering a sequence already in use.** Lowering `CurrentNext` on a
  sequence whose numbers are already on issued documents re-issues them. The removed onboarding
  endpoint had a `409` guard for exactly this; the generic CRUD path has none. Worth a follow-up
  ticket rather than a silent assumption.
- **[Closed for new tenants — ETP-5364] Every `DocumentNo_*` sequence was duplicated per
  tenant** (9888 surplus rows across 103 of 125 clients). ETP-5364 drops the 96 colliding rows at
  import time (`OnboardingDatasetNormalizer.TableCounterSequenceFilter`), leaving the source
  dataset complete for the sample-client consumer, so a newly provisioned tenant gets one copy of
  each; the 103 existing tenants still carry both, and a corrective data-fix was deliberately not
  written. See "Why no `DocumentNo_*` sequence is listed" above for the measurements and the cause.
  The six names the window does show have exactly one row per organization either way.
- No callouts. `rules-raw.json` reports 4 validation rules and 9 display-logic rows on the AD tab
  and no callout rows.

## Manual verification

1. Open `/document-sequence` from the Configuración menu and confirm the list shows **exactly
   six rows**, each ONCE, NOT the tenant's full sequence table — and that the columns are exactly
   Nombre, Descripción, Prefijo, Número inicial, Próximo número. **On a tenant provisioned before
   ETP-5364 you will see five**, without *Factura de compra*: that tenant owns no `AP Invoice`
   sequence, and it is the expected result, not a regression (see "The sixth series").
2. In Spanish, confirm the Nombre column reads *Pedido de compra*, *Pedido de venta*, *Factura de
   venta*, *Factura de venta rectificativa*, *Factura de compra*, *Factura de compra
   rectificativa* — not the stored English names. Switch to English and confirm the same rows read
   *Purchase Order*, *Sales Order*, *Sales Invoice*, *Corrective Sales Invoice*, *Purchase
   Invoice*, *Corrective Purchase Invoice*. A raw English name in Spanish means a missing
   `genericLabels` key (or a stale Vite locale slice).
3. Confirm `AP Payment`, `AR Receipt`, `MM Shipment` and `Secuencia TICKETBAI` are **gone**, and
   that no row whose name starts with `DocumentNo_` appears.
4. Confirm there is **no Create/New button** in the list toolbar and no delete (trash) action on
   a row or in the detail toolbar.
   Then confirm the refusal is real, not cosmetic — with a valid NEO token:
   `POST /sws/neo/document-sequence/sequence` and
   `DELETE /sws/neo/document-sequence/sequence/<id>` must both answer **405**. A `200`/`201`
   means `push-to-neo` + `export.database` have not been run yet.
5. Type something into the list's own filter and confirm it narrows further rather than
   revealing sequences outside the allowlist. Open "Filtro por condicionales" on Nombre and
   confirm the value dropdown offers the six translated names.
6. Open a series and confirm the form shows those same five fields and nothing else — in
   particular no Suffix, Increment By, Auto Numbering, Mask, Value Format or Restart every year —
   and that **Nombre is read-only** and translated.
7. Confirm `Document Type`, `Current Next (System)`, `Used for Record ID`, `Table` and `Column`
   do **not** appear anywhere in the UI.
8. On a Spanish tenant, set the prefix to `fv-` and confirm the save is refused with the
   lowercase/accents message, translated.
9. Repeat with `FI-` (reserved letter), `FV_` (character set) and a 21-character prefix, and
   confirm each reports its own message rather than a generic one.
10. Set the prefix to `FV-` and confirm it saves.
11. Clear the prefix entirely and confirm that saves too.
12. Open `/first-steps`, expand "Personaliza tus facturas" and confirm **Configurar** navigates
   here.
13. On a **freshly provisioned** tenant, confirm the six rows already carry `PC` / `PV` / `FV` /
   `FVR` / `FC` / `FCR` with Número inicial and Próximo número both at 1000000 — that is the
   onboarding dataset, not the data-fix.
14. ETP-5364, same freshly provisioned tenant: in Classic, confirm the `AP Invoice` doc type has
   **Documento controlado = Y** and points at the `AP Invoice` sequence, then create a purchase
   invoice and confirm its number reads `FC1000000`. A number with no prefix means the doctype
   half did not arrive.
15. ETP-5364, same tenant, and the reason this is a separate check (**restart Tomcat first** —
   the import filter is Java and is loaded once per JVM, while the dataset XMLs are re-read on
   every provisioning): run
   `SELECT name, count(*) FROM ad_sequence WHERE ad_client_id = '<client>' GROUP BY name HAVING
   count(*) > 1;` and confirm it returns **zero rows**. On a tenant provisioned before ETP-5364
   the same query returns ~96 `DocumentNo_*` names, which is the pre-existing state, not a
   regression.

## Automated evidence

- `tools/app-shell/src/menu.json` places **Document Sequence** in the Settings group
  (`windowId: "112"`), right after Organización; the label is translated in `en_US`, `es_ES` and
  `es_AR` under `menus`.
- `cli/config/regen-windows.json` registers the window (`windowId: "112"`,
  `menuName: "Document Sequence"`) — required before `make regen ONLY=document-sequence` will
  process it.
- `artifacts/document-sequence/decisions.json` classifies the 26 extracted fields (five visible
  after ETP-5285) and maps the six series names to i18n keys via `enumValues`, declares `entities.sequence.methods: ["GET","GETBYID","PUT","PATCH"]` (no POST,
  no DELETE), sets `window.hideCreate` / `window.hideDeleteButton` /
  `entities.sequence.hideDelete`, and sets `entities.sequence.javaQualifier: "document-sequence"`.
- `cli/test/document-sequence.contract.test.js` pins all of it: the method allowlist, the
  `post: false` / `delete: false` contract flags, the five visible fields and their grid order,
  the read-only translated `name`, and the presence of the six `genericLabels` keys in all three
  locale files. The `enumValues` order is asserted against
  `DocumentSequenceHandler.VISIBLE_SEQUENCE_NAMES` byte for byte — these are `AD_Sequence.Name`
  values and a mismatch hides the row with no error anywhere.
- `artifacts/document-sequence/contract.json` carries that qualifier through to both the frontend
  and backend entity sections; the pipeline generated 70 contract tests, all passing at
  onboarding time.
- `DocumentSequenceHandlerTest` (`com.etendoerp.go`) covers the four prefix rules, their order,
  the guards that stop the handler before the country lookup, and — since ETP-5285, updated by
  ETP-5364 — the exact six-name allowlist, the four names that must stay out of it, the presence
  of the purchase-invoice series, and the guard that keeps every `DocumentNo_*` name out.

## Onboarding — ETP-5190

Window onboarded from scratch:

- Extracted with `sf-pipeline --menu-name "Document Sequence"` (AD window `112`, single tab `146`,
  26 columns).
- `decisions.json` written by hand: 11 user-facing fields, the rest discarded per the table above.
- `window.category` set to `"settings"`, matching the menu group the window lives in.
- Pushed to NEO at onboarding time (spec `A57F181BD15A458596F55A66084D6B29`). **`./gradlew
  export.database` is required** — without it the `ETGO_SF_*` rows only live in the DB and do not
  survive a rebuild.

## ETP-5285 — series cleanup

Three fronts, one ticket.

**The window** (`schema_forge`). `decisions.json` cut the visible set to the five fields the
ticket names, in both grid and form; fixed the set of series with
`entities.sequence.methods: ["GET","GETBYID","PUT","PATCH"]` plus the matching
`hideCreate`/`hideDeleteButton`/`hideDelete` affordance flags; made `name` read-only and gave it
the `enumValues` display map; and `make regen ONLY=document-sequence` regenerated
`contract.json` (0.1.0 → 0.2.0, breaking) and the components. The five `genericLabels` keys went
into all three locale files.

**The allowlist** (`com.etendoerp.go`). `VISIBLE_SEQUENCE_NAMES` went from seven names to five.

**The data** (`com.etendoerp.go` + `schema_forge`), on both fronts as usual:

- *Preventive*: `referencedata/sampledata/GOClient/AD_SEQUENCE.xml` now ships `PC` / `PV` / `FV` /
  `FVR` / `FCR`, and `AR Invoice` moved from `STARTNO`/`CURRENTNEXT` 10000000 down to 1000000. The
  two rectificativas' interim `REC-` prefix (ETP-4737) was replaced. A new tenant is born correct.
- *Corrective*: `cli/src/data-fixes/sql/20260919T120000Z__R38-document-sequence-series-prefixes.sql`
  (gap `N6`) applies the same five prefixes and numbers to already-provisioned tenants.

`ONBOARDING_PROVISIONED_THROUGH` is deliberately **not** bumped — a newborn tenant is already
correct, so R38's `@check` returns 0 rows for it and the runner records `SKIPPED_NOT_NEEDED`.

**R38 and R31 do not fight.** R31 (`20260902T120000Z`) also pins `AR Invoice`, at the old
10000000. Fixes run in lexical filename order, so R31 always runs first, and a fix that already
reached a `PROCESSED` state is never re-run — so a tenant needing both ends at R38's values. Do
not edit R31's `VALUES` to "agree": tenants have already applied it as written.

**Both R38 and R31 lower `CURRENTNEXT` in either direction, and R38 also sets a prefix on a series
that may already have issued documents.** Both rest on the same premise a human accepted on
2026-09-02: there are no production tenants yet. R38's header carries the restore instructions for
the day that stops being true — read them before running it anywhere real.

### The Description column carries no engineering notes (ETP-5364)

`Description` is the grid's second column and it is **editable**, so whatever the dataset writes
there is copy the tenant reads next to its own series. Three rows used to carry an internal note
instead: both rectificativas shipped `ETP-4737: sequence for the unified … rectificative invoice`
and `AP Invoice` briefly shipped `ETP-5364: sequence for the purchase invoice series`.

- *Preventive*: the `<DESCRIPTION>` element is gone from all three rows in
  `GOClient/AD_SEQUENCE.xml`, and R39's insert above writes `description` NULL so the N7 corrective
  cannot put one back.
- *Corrective*: `cli/src/data-fixes/sql/20260922T130000Z__R39-document-sequence-clear-descriptions.sql`
  (gap `N9`) nulls it on already-provisioned tenants.

The text reached a tenant by **two** routes — the dataset and `R17-rectificativa-doctype-sequence`,
which is immutable and already applied — so the fix matches by `NAME`. It is guarded by
`description LIKE 'ETP-%'` rather than the exact strings: the column is editable, so a
tenant-authored description has to survive, and a tenant does not start one with a ticket key.
`@risk: low` — it touches no prefix, no counter and no document.
