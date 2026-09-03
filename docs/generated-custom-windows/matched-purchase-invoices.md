# Receipt-Invoice Link (Matched Purchase Invoices)

> **Read-only consultation window, with one exception: the accounting posting action.**
> No create/edit/delete of data; "Contabilizar"/"Descontabilizar" (Post/Unpost) are
> available from the kebab, single-record and in bulk over a list selection. ETP-5075.

## Purpose

Shows the system-generated match between purchase goods-receipt lines and purchase-invoice
lines (`M_MatchInv`), so a user can verify how a receipt was matched against an invoice
during the purchase-to-pay flow. This is the Etendo Go equivalent of Etendo Classic's
**Matched Purchase Invoices** window (`AD_Window_ID = 107`).

The linking mechanism itself is entirely internal — the system decides which invoice line
matches which receipt line. This window never lets a user create, edit or delete a match,
and it does not expose the Accounting tab or Classic's own `BULK POSTING` toolbar button
(the SMF Jobs / OBUIAPP mechanism, `com.smf.jobs.defaults.Post`) — see the "Bulk posting
from the list" section below for why: that mechanism is natively multi-record but NEO
Headless is single-record end to end, so this window's bulk posting is a generic per-row
loop over the same kebab action instead, not a port of that specific Classic button.

Per the revised requirement (*"la información mostrada será de solo lectura, excepto la
acción de contabilización, que podrá realizarse directamente desde esta ventana"*), both
**post and unpost** are available — single-record from the detail kebab (see
[Posting action](#posting-action)) and over a multi-row selection (see
[Bulk posting from the list](#bulk-posting-from-the-list)).

## Location

Menu: **Purchases**, last item, after *Return to Vendor Shipment*.
Spec/artifact name: `matched-purchase-invoices` (kebab-case of the AD window name, per
`toSpecName()`).

## Fields

| Field (EN) | Field (ES) | Type | Notes |
|---|---|---|---|
| Invoice Line | Línea de factura | Navigable reference | Opens the parent purchase invoice (header) |
| Goods Receipt Line | Línea de albarán | Navigable reference | Opens the parent goods receipt (header) |
| Product | Producto | Text | Read-only |
| Quantity | Cantidad | Numeric | Read-only |
| Transaction Date | Fecha de transacción | Date | Read-only |
| Processed | Procesada | Badge (Yes/No) | Read-only |
| Posted | Contabilizado | Badge (green/orange) | Read-only, grid only (not rendered inline in the form — `form: false`). Also rendered as a **status pill** in the detail top bar, next to Cancel, via `window.statusPills` — same declarative mechanism `goods-receipt` uses. Gated by `visibleWhenCapability: "showAccountingFields"` — only shown to roles with accounting visibility. Same `posted` field/badge config as `purchase-invoice`/`goods-receipt` (added after the initial 6-field scope). |

Not to be confused with **Accounting Status** (`etblkpAccountingstatus`, the field behind Classic's "Accounting Status: Pending Refresh" banner) — a 17-value enum, not a boolean, and not declared here (stays `discarded`, matching `purchase-invoice`/`goods-receipt`, which don't declare it either).

⚠️ **Known imprecision, accepted as-is.** `M_MatchInv.Posted` is not actually a plain Y/N
boolean at the DB level — live data shows `Y`, `T`, `E`, `D`, `p`, `i` (the same "Posted
status" domain behind `etblkpAccountingstatus`'s 17 values: Period Closed, Invalid Account,
Error, …). Declaring it `type: "boolean"` (matching `purchase-invoice`/`goods-receipt`
verbatim, human-confirmed) means every non-`Y` state renders as the orange "Sin
contabilizar" pill, not its real name. Accepted for consistency with the other Purchases
windows; a precise fix would render the enum's display text instead, breaking that
consistency.

**Field pushed to NEO separately from the initial window push** (ETP-5075 follow-up) —
`push-to-neo.js` must run again any time a field's `visibility` changes in `decisions.json`
after the first push; a local `--write` regen alone does **not** update `ETGO_SF_FIELD`, so
the field silently renders empty (`—` for every row) until the push runs. This exact gap
is what happened here: the field showed in the grid header but every cell was blank.

The `accounting` tab (journal entries posted by the match) is intentionally excluded via
`"exclude": true` in `decisions.json` — it never reaches the contract or the served API
surface (`ETGO_SF_ENTITY.ISINCLUDED = 'N'`).

## Read-only enforcement

`decisions.json` declares `window.readOnly: true`: NEO Headless restricts the
`matchedInvoice` entity to `GET`/`GETBYID` (`405` on `POST`/`PUT`/`PATCH`/`DELETE`), and
the React app hides create/delete affordances (`hideCreate`, `hideDelete`,
`hideDeleteButton`). Classic's own `BULK POSTING` toolbar button (the SMF Jobs/OBUIAPP
mechanism) is not exposed — this window's bulk posting is the generic per-row action loop
described in [Bulk posting from the list](#bulk-posting-from-the-list), not that button.

**This is unaffected by the posting action below**, because the two live behind different
gates. `NeoRequestRouter` dispatches sub-endpoints (`/action/…`, selectors, callout,
defaults) through `NeoSubEndpointDispatcher` **before** reaching `NeoCrudHandler`, and the
`ISPOST/ISPUT/ISPATCH/ISDELETE` gate (`NeoMethodPolicy`, whose javadoc states "the gate
covers entity CRUD only") lives exclusively inside that CRUD handler. Same shape as
`monitor-verifactu.facturasInválidas`, which serves `POST …/action/Correct_Invoice` with
every CRUD flag `N`.

## Posting action

The kebab exposes **Contabilizar/Post** and its reverse **Descontabilizar/Unpost**,
declared in `decisions.json`:

```json
"menuActions": [
  { "key": "post", "label": "Post", "labelKey": "post", "action": "post",
    "visibleWhenFieldFalse": "posted", "visibleWhenFieldTrue": "processed",
    "successKey": "documentPosted" },
  { "key": "unpost", "label": "Unpost", "labelKey": "unpost", "action": "unpost",
    "visibleWhenFieldTrue": "posted", "successKey": "documentUnposted",
    "destructive": true }
]
```

`destructive: true` matches `goods-receipt`'s `unpost` — same semantics (reversing an
accounting post), same red kebab styling. This surfaced a real, pre-existing contrast bug
in the shared `DetailMoreActionsMenu.jsx`: `destructive` items rendered
`hover:bg-destructive` (solid red) with `text-destructive` (red text) — red-on-red,
illegible on hover — affecting every window using `destructive: true`
(`goods-receipt`, `goods-movements`, `goods-shipment`, `sales-quotation`,
`simple-g-l-journal`). Fixed once, for all of them: the hover background is now
`hover:bg-destructive/10` (a tint), matching the dominant convention already used
elsewhere in `DetailView.jsx` for destructive-styled buttons.

`unpost` needed no backend change — `MatchedInvoiceHandler.handle()` already delegates
unconditionally to `DocumentPostingService.handleAction(context)`, which intercepts both
`post` and `unpost` generically. Only `post` was declared originally; `unpost` was added
once the requirement clarified users must be able to reverse a post from this window too.

`window.hideMoreMenu` must stay **absent** — `DetailMoreActionsMenu.jsx` returns `null`
before it ever reads `menuActions`, so declaring actions alongside `hideMoreMenu: true`
makes them dead code (this window originally had that flag; removing it was part of the
change).

Chain, end to end:

1. The generator emits `neoAction: 'post'` into the `menuActions` prop.
2. `DetailMoreActionsMenu.runNeoMenuAction` → `useNeoAction.execute(id, 'post')` →
   `POST {apiBaseUrl}/matchedInvoice/{id}/action/post`, then `toast.success` +
   `hook.fetchById` on success.
3. `MatchedInvoiceHandler.handle()` delegates to the shared
   `DocumentPostingService.handleAction(context)` (same one `PurchaseInvoiceHeaderHandler`
   uses — injected, with the same `setPostingService` test seam). It intercepts only the
   literal action names `post`/`unpost`.
4. That service resolves the accounting engine generically from the tab's `AD_Table_ID` —
   here `472` (`M_MatchInv`), which core's `AcctServer` dispatches to `DocMatchInv`
   (docbasetype `MXI`) — and calls `acct.post(recordId, false, …)`.

No `AD_Process_Access` row is involved: returning a non-null `NeoResponse` short-circuits
`NeoHookDispatcher` before the AD-button path where `hasProcessAccess` would be checked.

**Visibility gating.** The action shows only when `processed` is `Y` and `posted` is not
`Y`. Note `M_MatchInv.Posted` is not a plain boolean (see the Fields caveat): states
`T/E/D/p/i` all count as "not posted", so a record stuck in `Error` or `Period Closed`
still offers "Contabilizar" — which is correct, it genuinely is not posted. If a post
attempt leaves `posted` at `E`/`p`, the action ran and core's accounting engine rejected
it (accounting error / closed period) — that is engine behavior, not a wiring failure.

## Bulk posting from the list

Selecting rows in the list surfaces **Confirmar** in the floating selection toolbar; it
opens the same modal `purchase-invoice` uses, whose dropdown offers **Contabilizar** and/or
**Descontabilizar** depending on what is selected.

Declared with one `decisions.json` line — the window stays 100% pipeline-generated, no
hand-written window wrapper:

```json
"customComponents": { "bulkActions": "MatchedInvoiceBulkActions" }
```

`artifacts/matched-purchase-invoices/custom/MatchedInvoiceBulkActions.jsx` is deliberately
thin — it supplies only *which* actions to offer and *which* rows each may touch; the
button, modal, per-row loop and result toast are the shared
`components/contract-ui/BulkDocumentAction.jsx`.

- `buildPostActions(rows)` offers `post` if any selected row is unposted and `unpost` if
  any is posted, so a **mixed selection offers both** (same shape as the shared default's
  DR/CO logic).
- `rowFilter` pre-blocks the rows the chosen action does not apply to
  (`bulkRowAlreadyPosted` / `bulkRowNotPosted`), so a mixed selection reports a clear
  per-row reason instead of letting the backend reject them with an opaque accounting
  error. Those rows never reach the API.
- Only `posted === 'Y'` counts as posted — see the Fields caveat; `T/E/D/p/i` are all
  genuinely unposted and stay postable.

**`actionMode: 'neoAction'` — new generic capability on the shared component.**
`BulkDocumentAction` was DocAction-only: it always called
`POST …/{id}/action/documentAction` with a `{docAction}` body. This window has no
DocAction/`documentStatus` at all, so it gained an opt-in `actionMode` (default
`'documentAction'`, so the 8 existing windows are untouched) that retargets the per-row
call to the generic NEO action endpoint `POST …/{id}/action/{name}` — the same endpoint the
detail kebab already uses. Full reference:
[`../ui-customization.md`](../ui-customization.md).

> ⚠️ The `neoAction` adapter normalises a failure into a `throw` on purpose.
> `useNeoAction.execute` *resolves* with `{ success: false }` instead of rejecting, while
> `handleDone` detects failures via `Promise.allSettled`'s `'rejected'`. Drop the
> normalisation and every failed row is silently counted as a success — the toast would
> report "N ok, 0 failed" while nothing got posted. There is a dedicated test for this.

**Result toast.** After the run, `BulkDocumentAction` persists `{ok, failed}` to
`sessionStorage` and reloads; `useBulkActionToast()` reads it on mount and shows
`processExecuted` ("PROCESO EJECUTADO: {ok} registros procesados correctamente y {failed}
registros fallidos") — success / warning / error depending on the mix. That hook used to be
called per window inside each hand-written `windows/custom/<w>/index.jsx`, so a purely
generated window like this one ran the bulk correctly and then **reported nothing**. It is
now called once in the shared `ListView.jsx`, so every list gets it with no per-window
wiring. It cannot double-fire for the windows whose wrapper still calls it: the hook removes
the `sessionStorage` key *before* showing the toast, so whichever effect runs first consumes
the result.

Bulk runs **one request per row** (`Promise.allSettled`), not a batched call. Etendo's own
`com.smf.jobs.defaults.Post` *is* natively multi-record (it reads a `recordIds` array), but
NEO Headless is single-record end to end — the URL carries one `recordId` segment,
`executeButtonActionCore` takes one id, and `executeObuiappHandler` builds that `recordIds`
array with exactly one element — so a true batched call would require changing NEO's route
parser and helper signatures. The per-row loop is the pattern already proven across 8
windows.

## Save button hidden on read-only windows

`DetailView.jsx`'s Save-action gate now also checks `!windowReadOnly` (the same flag that
already drove `hideDeleteButton || windowReadOnly` for Delete — Save simply hadn't been
given the same treatment yet). This is a **shared-component change**, not a
`decisions.json` option: no window declares this, it is derived automatically from
`window.readOnly: true`, so it takes effect only for windows that already declare that
(today: this window and `sii-monitor`). Every other window is unaffected — confirmed by
the full app-shell test suite (14369 tests) before and after.

Before this, Save rendered but was merely `disabled` (via `isDocumentReadOnly`, which
already folds in `windowReadOnly`) — visible, grayed out, unclickable. Now it does not
render at all, matching Delete's existing behavior for the same flag.

## Navigation — clickable FK fields

**Invoice Line** and **Goods Receipt Line** are click-throughs: the value itself is a link
(underline + `ArrowUpRight`) that opens the parent document. It works in **both** the
detail form and the list grid.

This window is the first consumer of the generic FK-navigation feature — it is not
window-specific code. The registry
`tools/app-shell/src/components/contract-ui/fkNavigation.js` maps an **AD column name** to
a target window, and the shared renderers (`EntityForm.renderReadOnlyFk` for the form,
`DataTable.renderCellValue` for the grid) consult it. Any window showing a read-only FK on
a registered column inherits the behavior with no config of its own. Full reference:
[`../ui-customization.md`](../ui-customization.md) § FK click-through navigation.

Navigation reaches the document **header**, never a specific child line — the app-shell
has no line-level deep link. Landing on the exact line inside the target document is out
of scope.

### Where the header ids come from

Both FKs point at a LINE (`C_InvoiceLine`, `M_InOutLine`), and a line has no window of its
own. An FK's response shape carries only the line id plus a `$_identifier` label, so the
parent document id is not in the payload, and Schema Forge has no declarative server-side
derivation that could compute one (see [`../possible-limitations.md`](../possible-limitations.md)).

So the entity declares `javaQualifier: "matchedInvoiceHandler"` and
`com.etendoerp.go`'s `MatchedInvoiceHandler` injects two extra keys into every GET row
(list and detail alike) with one batched query joining
`M_MatchInv → C_InvoiceLine → C_Invoice` and `M_MatchInv → M_InOutLine → M_InOut`:

| Injected key | Resolves to | Read by |
|---|---|---|
| `invoiceHeaderId` | `C_Invoice_ID` of the matched invoice line | `C_InvoiceLine_ID` registry entry |
| `receiptHeaderId` | `M_InOut_ID` of the matched receipt line | `M_InOutLine_ID` registry entry |

A null side is left absent rather than written as null, so `resolveFkNavigation` treats it
as not-navigable and the field stays a plain read-only value.

Modeled on `PaymentScheduleDetailHandler` (same line→header shape). **The qualifier must be
wired on both sides** — `decisions.json` AND
`src-db/database/sourcedata/ETGO_SF_ENTITY.xml` — or it is silently wiped by the next
`update.database` / `push-to-neo` (ETP-4670). And the bean must be `@Named`-only, never
`@ApplicationScoped`: a normal-scoped bean resolves to a Weld proxy whose subclass does not
carry the non-`@Inherited` `@Named`, and `lookupHandler()` skips it without a word.

This deliberately replaced an earlier two-hop frontend design that required exposing the
parent-link column as a `system` field on the `purchase-invoice` and `goods-receipt`
windows — one link is not worth coupling three windows together, and regenerating those two
windows dragged in ~1800 lines of unrelated contract-format drift.

## Roles

**Admin** needs no grant at all: `SFWindowAccessMap` gives every admin/client-admin role a
bypass to `"full"` on any window backed by an active `SPEC_TYPE='W'` `ETGO_SF_SPEC` —
which this window has had since it was first pushed to NEO. That is also why "you don't
have access to this window" showed up mid-development: it meant the spec hadn't been
pushed yet, not a roles problem. The map is fetched once at role-selection time and is not
persisted, so a first push still needs a re-login (or role re-select) to be picked up.

**Finanzas/Compras** are granted **FULL** (`full("107")`) on the two *system template*
roles, `com.etendoerp.go`'s `TemplateRoleWindowAccess.purchasingGrants()` /
`financeGrants()` — mirrored in `EnsureSystemRoleTemplatesScript`'s inlined copy, both
required (ETP-4878's own contract: the script does not import the `src/` class, so the two
literal lists must be kept in sync by hand) and applied by `update.database`.

**Why FULL on a read-only window** (it started as `readOnly("107")` and had to change):
the posting action is a `POST`, and `NeoRequestRouter` gates every window request through
`NeoAccessHelper#hasWindowAccess`, which for a write method requires
`AD_Window_Access.IsReadWrite='Y'`. A read-only grant makes the post fail with **403 before
process access is even evaluated** — and an admin never sees it, because
`isAdminOrClientAdmin` bypasses window *and* process access alike. FULL here opens the
action channel only; the data stays read-only through the independent `ETGO_SF_ENTITY` gate
(verify with a `POST`/`PUT`/`DELETE` on the entity — must still be `405`).

Side effect worth knowing: `reconcileProcessAccess` now includes window 107 in its
FULL-grant loop and grants its button process (`57496FB9CF9E4E8F847224017941570E`, Bulk
Posting). In practice a no-op — both roles already had that row via window 183, which
shares the same process id.

> Order matters when applying this: `./gradlew compile.modulescript -Dmodule=com.etendoerp.go`
> **before** `update.database`. The latter runs the already-compiled `ModuleScript` bytecode
> and does not compile Java itself, so skipping the compile step silently applies the old
> matrix.

⚠️ **Known limitation, not fixed by this change.** `AD_Window_Access` in this DB is
per-client, and only ~90 clients actually have Purchase Order/Goods Receipt granted at all.
Of those, only roles composed via `AD_Role_Inheritance → <template>` ("Personal"-style
roles) actually receive this grant automatically. The pre-existing, non-inherited per-tenant
role copies that most real production tenants use today (e.g. `F&B España, S.A - Finance`,
`GOClient Purchasing`) are **not** wired to the template and do **not** receive this grant —
reaching those needs a separate, tenant-scoped SQL data-fix (the `R16`/`R23`/`R26` pattern
in `docs/etendo-ad/tenant-remediation-knowledge.md`), explicitly deferred, owned by the
tenant-fixer domain rather than this window's onboarding.

## Not Posted Documents integration

This window's document type (`MI`, table `M_MatchInv` / `472`) already surfaces in
**Documentos no contabilizados** (`not-posted-documents`) — its filter dropdown lists any
document type whose table has active accounting (`c_acctschema_table`), and table 472
qualifies. Two label/enrichment gaps had to be closed (ETP-5075):

- **Filter option label.** `NotPostedDocumentsHandler#refListDocumentTypes()` translates
  each option from core's own `AD_REF_LIST_TRL` (shared with Classic) — `MI` reads
  "Facturas cuadradas" there, this window's own name. Overridden in the frontend,
  `windows/custom/not-posted-documents/NotPostedDocumentsPage.jsx`'s `DOC_TYPE_LABEL_KEYS`
  (keyed by the `MI` code), so no core AD data is touched and Classic is unaffected.
- **Row badge label.** Each grid row's `documentType` is a *different* string entirely —
  core's raw `NoPostedDocumentDS` label, confirmed live to be `"Matched Invoice"`
  (singular) — rendered with no i18n at all. Same file, a second map
  `ROW_DOC_TYPE_LABEL_KEYS` (keyed by that raw label, a different keyspace from the filter's
  short code — the two must not be conflated).
- **Row `tableId` — the one that actually broke posting.** `buildRow()`
  (`com.etendoerp.go`'s `NotPostedDocumentsHandler.java`) enriches each row via a *third*
  map, `DOCUMENT_TYPE_TO_TABLE_ID` — also keyed by the raw `"Matched Invoice"` label, and it
  had **no entry for this table at all**, a pre-existing gap unrelated to ETP-5075's own
  work (nobody had tried posting an `M_MatchInv` row from this window before). Every row's
  `tableId` resolved to `null`, and `postRow()` in the frontend short-circuits on that with
  `"unknown tableId for Matched Invoice"` before ever reaching the API. Fixed with one map
  entry: `DOCUMENT_TYPE_TO_TABLE_ID.put("Matched Invoice", "472")`.

Three maps, three different keyspaces (`MI` code / raw row label / raw row label again),
two of them in this repo and one in `com.etendoerp.go` — worth re-reading this section
before assuming a fourth document type "just works" here without checking all three.
