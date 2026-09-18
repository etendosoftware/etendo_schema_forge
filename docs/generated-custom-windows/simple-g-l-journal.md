# Simple G/L Journal (Manual Journals)

## Intent

Use this window to record simplified manual accounting journals ("Asientos Manuales") in Etendo GO. It ports the Classic `Simple G/L Journal` window (AD id `B917E8A7B0864ACEA9D941E3B7494E53`) as a 2-level master-detail surface: a journal header plus debit/credit lines. The defining domain rule is that an entry must be **balanced** — the sum of the debit column must equal the sum of the credit column — before it can be saved. Completing (confirming) the journal additionally requires the total to be greater than zero.

This is **slice 1 of workstream C (Manual Journals Simplified)** under ETP-4244. It provides full CRUD over journals and lines. Posting and completion, originally planned for a later workstream D, have since shipped — see "Posting & completion status correction (ETP-4917)" near the end of this doc.

## What this window should allow

- Create and review journal headers with a focused 6-field form, in order: Accounting Date, Period, Description, Currency, Opening, and Multi-Ledger. (Document Date is hidden — see below.)
- **Single date:** the form exposes only **Accounting Date**. Document Date is hidden (`system`); the backend derives `DateDoc` from the accounting date via its AD default (`to_date(@HeaderDateAcct@)`), so the user never maintains two dates.
- Add one or more journal lines under a header, each with an account, a debit amount, and a credit amount. **Lines no longer carry their own Description field** (ETP-5210, revised scope — see "Line description column removed" below); the journal's header `Description` remains the single place to annotate the entry.
- Optionally flag a line as **Open Items** to reveal the **Asset** dimension in the add-row form. **Business Partner**, **Product**, **Project**, and **Cost Center** are reached separately, per saved line, via the grid's "Añadir dimensiones" hover action, gated by the client's accounting-dimension configuration (ETP-4529 — see "Accounting dimension visibility per section" below).
- See a live **balance footer** below the lines: total debit and total credit (see ETP-4917 note below — the difference amount and the balanced ✓/✗ badge were trimmed from the display).
- Be prevented from saving the document while the entry is unbalanced (the Save button is disabled with an explanatory tooltip).
- See **two independent status chips** in the header: the accounting-posted pill (Sin contabilizar/Contabilizado) and a document lifecycle chip (Borrador/Completado) — see ETP-4917 note below.

## Interaction model

- **Route:** `/simple-g-l-journal`, `/simple-g-l-journal/:recordId`.
- **Visibility:** visible from the **Finance** menu as **Manual Journals** (es: **Asientos Manuales**), wired via `menus["Manual Journals"]` in both locales.
- **Implementation type:** fully generated window (no custom components). CRUD runs through NEO Headless generic CRUD. A `GlJournalHeaderHandler` (`@Named("glJournalHeaderHandler")`) injects `C_AcctSchema_ID` from the session on POST and routes document-completion (CO) through `FIN_AddPaymentFromJournal`.
- **Window shape:** master-detail. The header entity is `gLJournal` (table `GL_Journal`) and the line entity is `gLJournalLine` (table `GL_JournalLine`). The two Classic auxiliary tabs — `Fact_Acct` (posting result) and `C_Conversion_Rate_Document` (document rates) — are **dropped** (`exclude: true`) for V1.
- **Lines tab layout:** `decisions.json` does not declare `window.linesLayout`, but `DetailView.jsx` defaults the prop to `'inlineEditable'` when a window omits it, so at runtime this window renders lines through `InlineLinesPanel` — inline cell editing on the grid — not a classic `DataTable` + side-panel `DetailForm` (`shouldShowDetailFormSidebar` never mounts a side panel once `linesLayout === 'inlineEditable'`). The lines table shows the four core columns (ETP-5210 dropped Description — see "Line description column removed" below); existing rows are edited inline via the pencil hover action, per-line dimensions are edited via the row's "Add dimensions" hover action, and the Open Items / Asset fields are set at line-creation time through the add-row form.
- An **Attachments** tab is available in the detail tab strip.

## Header fields

The header form shows **6 always-visible editable fields**, in this order: Accounting Date, Period, Description, Currency, Opening, Multi-Ledger (`seq` drives the ordering — description sits after the date/period block). Four more fields — the accounting dimensions `businessPartner`, `product`, `project`, `costCenter` — are also `visibility: editable`, but config-gated (ETP-4529): they render on the main form only when the client's accounting-dimension display configuration enables them for GL Journal headers. See "Accounting dimension visibility per section — ETP-4529" below. Everything else is hidden (system) or discarded.

| Field (curated) | Column | Visibility | Notes |
|---|---|---|---|
| `accountingDate` | DateAcct | editable | `seq: 10`. The only date shown. Defaults to today. Grid column + searchable (ETP-4917). Displays as **Fecha**/**Date** in this window via a `labels` override on the field — see the ETP-4917 note below for why the shared `accountingDate` locale key was left untouched. `dot: false` (ETP-5210) — the grid's past-date red-dot ("overdue") indicator is suppressed: an accounting date is historical by nature, not a due date, so the overdue signal does not apply here. |
| `period` | C_Period_ID | editable | `seq: 20`. Accounting period. Grid column + searchable (ETP-4917). |
| `description` | Description | editable | `seq: 30` — placed after the dates. Required. Grid column + searchable (pre-existing). |
| `documentDate` | DateDoc | system | **Hidden.** Unified into Accounting Date — not on the form and not sent; the backend resolves `DateDoc` from its AD default (`to_date(@HeaderDateAcct@)`). |

**ETP-4531 note (redefined 2026-07-17 — unified accounting date):** `GL_Journal.DateDoc` and `GL_Journal.DateAcct` both carry `AD_Column.AD_Callout_ID = org.openbravo.erpCommon.ad_callouts.SL_Journal_Period`, whose `execute()` unconditionally copies `DateDoc → DateAcct` when `DateDoc` is the field that changed. Today this is **dormant, not absent**: it never fires because `documentDate` stays hidden (`visibility: system`), so no interactive edit can trigger it, and the create-time cascade is a no-op since both dates already default to `@#Date@`. This window's "single date" design (`documentDate` hidden, `accountingDate` the one visible field) already matches the redefined ETP-4531 goal — a single visible date, with both DB columns kept in sync — so no guard is needed here. If `documentDate` were ever exposed as an editable field alongside `accountingDate`, the two should be explicitly **mirrored** (matching the `AbstractInvoiceHeaderHandler#mirrorAccountingDate` pattern used for the invoice windows), not guarded apart — unification, not independence, is the current intent.
| `currency` | C_Currency_ID | editable | Journal currency. Grid column + searchable (ETP-4917). |
| `opening` | IsOpening | editable | Marks an opening-balance journal. |
| `multigeneralLedger` | Multi_Gl | editable | Multi-ledger flag. |
| `documentNo` | DocumentNo | system | Auto-sequenced by NEO on POST; not shown on the form. |
| `documentType` | C_DocType_ID | system | Hidden but still defaulted under the hood (`DocBaseType='GLJ'`) — needed for posting/sequencing later. **Not discarded.** |
| `posted` | Posted | readOnly | Accounting-status pill (`statusPills`): **Sin contabilizar** / **Contabilizado**. `form: false` (not on the form), but shown as a badge, plus a grid column + searchable (grid/searchable added ETP-4917). Not a document lifecycle status — see `documentStatus` below for the second, independent chip. |
| `documentStatus` | DocStatus | readOnly | **ETP-4917.** Second, independent header status chip — document lifecycle: **Borrador** (DR) / **Completado** (CO). `form: false` (not on the form), grid column + searchable. Promoted from `discarded`; the badge label mapping comes from `statusBadge.js`'s built-in DR→`statusDraft`/CO→`statusComplete` default fallback (no window-specific `badgeLabels` override and no new i18n keys needed). Auto-detected as the `statusField` for `draftMode` completion (falls back to `documentStatus` when the window doesn't declare `draftMode.statusField` explicitly). |
| `rate` | CurrencyRate | system | Derived currency rate, hidden. |
| `businessPartner`, `product`, `project`, `costCenter` | C_Bpartner_ID, M_Product_ID, C_Project_ID, C_Costcenter_ID | editable | **ETP-4529 reversal.** No longer discarded — `section: "principal"`, config-gated by the raw AD `@ACCT_DIMENSION_DISPLAY@` (no `displayLogic` override). See "Accounting dimension visibility per section — ETP-4529" below. |
| header dimensions (remaining) | A_Asset_ID, C_Campaign_ID, User1_ID, User2_ID | discarded | Not part of the ETP-4529 reversal — stay removed from the header form / "Others" section. |
| `documentAction`, `accountingSchema`, `totalDebitAmount`, `totalCreditAmount`, `controlAmount`, `currencyRateType`, `gLCategory`, `postingType` | — | discarded | Posting/completion-flow and header-total fields not needed in the simplified UI (totals are replaced by the live balance footer). |

## Line entry

**Lines grid columns (exactly four):** `lineNo` (LineNo, read-only), `accountingCombination` (Account), `foreignCurrencyDebit` (Debit), `foreignCurrencyCredit` (Credit). No dimension columns appear in the grid. `description` was a fifth grid column through ETP-5210's first pass but is now fully discarded — see "Line description column removed" below.

The add-row form exposes the **Open Items** checkbox, which gates the `asset` field. `businessPartner`, `product`, `project`, and `costCenter` are reached instead through the grid's "Añadir dimensiones" hover action (an expand-row panel, not the add-row form) and are gated by the client's accounting-dimension configuration — see "Accounting dimension visibility per section — ETP-4529" below for the full per-field breakdown, including `businessPartner`'s additional Open-Items OR condition.

| Field (curated) | Column | Grid? | Visibility | Notes |
|---|---|---|---|---|
| `lineNo` | Line | grid | readOnly | Auto-sequenced line number, displayed read-only (label **LineNo**). |
| `accountingCombination` | C_ValidCombination_ID | grid | editable | Accounting-combination selector (label **Account**, lookup, `columnWidth: 280`). |
| `foreignCurrencyDebit` | AmtSourceDr | grid | editable, amount, required | **Debit** — feeds the balance footer Σ debit. |
| `foreignCurrencyCredit` | AmtSourceCr | grid | editable, amount, required | **Credit** — feeds the balance footer Σ credit. |
| `openItems` | Open_Items | form-only | editable | **Open Items** checkbox in the add-row form; toggling it reveals the `asset` field below. `businessPartner`/`product`/`project`/`costCenter` are reached via the grid's hover action instead — see below. |
| `businessPartner` | C_Bpartner_ID | expand-row | editable | Per-line accounting dimension. No `displayLogic` override — raw AD `@Open_Items@='Y' \| @ACCT_DIMENSION_DISPLAY@` passes through (visible on an Open-Items line **or** when config-enabled; ETP-4529). Reached via the grid's "Añadir/Editar dimensiones" hover action → expand-row panel (`dimensionsPanel: true`), not the add-row form. |
| `product`, `project`, `costCenter` | M_Product_ID, C_Project_ID, C_Costcenter_ID | expand-row | editable | Per-line accounting dimensions. No `displayLogic` override — raw AD `@ACCT_DIMENSION_DISPLAY@` passes through (config-gated only; ETP-4529). Same expand-row hover-action rendering surface as `businessPartner`. |
| `asset` | A_Asset_ID | form-only | editable | Per-line dimension, **only visible when Open Items is ticked** in the add-row form — carries `displayLogic: "@Open_Items@='Y'"`. Not part of the ETP-4529 dimensionsPanel/config-gating group. |
| `description` | Description | — | discarded | **ETP-5210 (revised scope).** Line-level description column removed entirely — no grid column, no line-editor field. The header `description` (see Header fields above) remains the only place to annotate the journal; it is unaffected by this change. |
| `gLItems` | Account_ID | — | discarded | Multi-G/L account selector — only relevant under Multi-General Ledger, out of scope for the simplified single-ledger journal. |
| `activity`, `salesCampaign`, `salesRegion`, `stDimension`, `ndDimension` | C_Activity_ID, C_Campaign_ID, C_Salesregion_ID, User1_ID, User2_ID | — | discarded | Extra accounting dimensions not requested for the simplified line editor. |
| `debit` / `credit` | AmtAcctDr / AmtAcctCr | — | system | Posting-derived accounted amounts, hidden from the user. |
| `rate` | CurrencyRate | — | system | Line currency rate, derived. |
| `financialAccount`, `paymentMethod`, `paymentDate`, `relatedPayment`, `aPRMAddPayment`, `gLItem` | FIN_Financial_Account_ID, FIN_Paymentmethod_ID, Paymentdate, FIN_Payment_ID, EM_Aprm_Addpayment, C_Glitem_ID | — | discarded | Payment-integration fields dropped for V1 (spec §2). `EM_*` also caught by `discardPatterns`. |

### Line description column removed; Account absorbs the freed space (ETP-5210)

This ticket shipped in two steps as its scope was revised mid-flight:

1. **First pass — widen Account past Description.** `accountingCombination` and `description`
   neither set an explicit grid width, so both fell back to the type-based defaults in
   `tools/app-shell/src/lib/linesColumnWidth.js`: `accountingCombination` (a `foreignKey`/selector)
   defaulted to 192px while `description` (a plain `string`) defaulted to 224px elastic — leaving
   the Account column narrower than Description, backwards from the intended emphasis. Fixed by
   adding `"columnWidth": 280` to `accountingCombination` in `decisions.json` (the same
   `columnWidth` mechanism already used by `physical-inventory`'s `etgoQtydiff`), which the
   generator carries through `contract.json` and renders as `minWidth: 280` in the generated
   `GLJournalLineTable.jsx` columns array. At this point `description` itself was left unchanged,
   still a grid column, just narrower than Account.
2. **Revised scope — discard Description entirely.** The ticket's scope was then widened: rather
   than just narrowing the Description column, it is removed from the lines entity altogether.
   `lines.fields.description` in `decisions.json` is now `visibility: "discarded"` — gone from
   both the grid and the line editor. The header's own `description` field (see Header fields
   above) is untouched and still covers journal-level notes; only the per-line column disappears.
   Safety-checked before discarding: the raw AD column (`GL_JournalLine.Description`) is
   `ismandatory = false`, and its only behavior — the `fromConfig`/`@DESCRIPTION1@` pre-fill from
   the header description — has no other consumer, so dropping it has no side effects.

With `description` gone, `accountingCombination`'s `columnWidth: 280` (kept, untouched by this
second step) is now the *only* column with a `minWidth` set on this grid — per
`linesColumnWidth.js`'s `columnFlex()`, a column with `minWidth` always gets `flex: 1 1 <minWidth>px`
(grow enabled) regardless of any explicit `grow` flag. None of the other three lines columns
(`lineNo`, `foreignCurrencyDebit`, `foreignCurrencyCredit`) set `grow`, so `accountingCombination`
is the sole growing column in the row and absorbs all space freed by Description's removal — no
generator change was needed for this to happen; it falls out of the existing flex mechanism.
Verified directly in the regenerated `GLJournalLineTable.jsx`: the columns array has no
`description` entry and no other column carries a `grow` key.

## Balance rule (core behavior)

This window declares `window.balanceFooter = { "debitField": "foreignCurrencyDebit", "creditField": "foreignCurrencyCredit" }`.

- **ETP-5210 — totals now render as a column-aligned row inside the lines grid, not a separate summary block (current behavior).** For the `inlineEditable` `linesLayout` this window uses, `InlineLinesPanel` renders an extra row directly below the last line (`data-testid="balance-footer-row"`), pixel-aligned with the grid's own columns via the same `columnFlex()`/`visibleColumns` the header row uses — no parallel width math. Every column renders a blank cell except **Débito**, which shows Σ debit (`data-testid="balance-footer-debit"`), and **Crédito**, which shows Σ credit (`data-testid="balance-footer-credit"`), both right-aligned like any other amount cell. `detailViewHelpers.jsx`'s `buildBalanceFooterGridTotals()` pre-formats both sums through the canonical `formatCurrency` from the same `balanceState` `computeBalanceGate()` already produced for the save/complete gates below — so the displayed totals can never disagree with what gates Save/Complete. This replaced the old standalone "Total debe"/"Total haber" labeled block, which sat below the grid unaligned with the Débito/Crédito columns it summarized — the literal bug ETP-5210 fixed. `window.balanceFooter` stayed a generic, config-driven key (`debitField`/`creditField`, not hardcoded to this window) the whole way through — any other `inlineEditable` double-entry window can opt in the same way.
- **`BalanceFooterPanel` (the old standalone component) is kept, not deleted** — `renderTotalsBlock()` in `detailViewHelpers.jsx` now early-returns before mounting it whenever `linesLayout === 'inlineEditable'` (this window's case), but still renders it for a hypothetical future `balanceFooter` window on the classic (`DataTable`) lines layout, which has no column-aligned equivalent yet. If one appears, extend `renderBalanceFooterRow`'s approach to `DataTable` instead of reviving the unaligned panel for it.
- **ETP-4917 — display trimmed (superseded by ETP-5210 above for this window, kept for history).** The old `BalanceFooterPanel` block used to also render the **Difference** amount and a balanced ✓ / unbalanced ✗ badge; both were removed from the visible UI before this window stopped using the panel at all. Neither the aligned totals row (ETP-5210) nor the old panel (its remaining classic-layout fallback role) render `difference`/`isBalanced`/`hasAmounts` — the save/complete blocking logic below has never read from what either renders; it reads `computeBalanceGate()`'s `balanceState` directly in `DetailView.jsx`.
- The totals sum the saved lines plus any in-progress add-row and any sidebar editing snapshot, so they reflect the live state as the user types.
- **Save gate** (`blockSaveForBalance`): the **Save** button is disabled while `Σ debit ≠ Σ credit` (difference ≠ 0), even though the difference is no longer displayed. An all-zero journal (0 = 0) is treated as balanced and is savable.
- **Completion gate** (`blockCompleteForBalance`): the **Complete/Confirm** button additionally requires the total to be greater than zero — an all-zero set cannot be completed.
- While the save gate is active, the Save button shows the tooltip "El debe y el haber deben ser iguales antes de guardar" / "Debit and credit must be equal before saving".
- Validator rule **F17** enforces that the `debitField` / `creditField` named here exist on the line entity in the generated contract.

## Gap assessment

- **~~Posting is out of scope for this slice~~ — superseded, see "Posting & completion status correction" below.** This bullet described the V1 slice at the time it was written; posting, completion, and both status chips have since shipped for this window. `documentType` is still a hidden **system** field (defaulted under the hood); `DocAction` (`documentAction`) is hidden from the form but wired to the Complete action, not discarded.
- **Multi-currency document rates** (`C_Conversion_Rate_Document`) and the **posting result view** (`Fact_Acct`) are dropped for V1.
- **Payment integration** on lines (`FIN_*`, add-payment, payment date/id) is dropped for V1. The **Open Items** checkbox is kept — but in this slice it only gates the visibility of the per-line accounting dimensions; it does not wire up payment creation.
- The balance footer enforces debit = credit at the UI level; it does not assert that NEO's generic CRUD performs any additional server-side accounting validation beyond persisting the rows.
- **Line description pre-fill — removed (ETP-5210, superseded).** This bullet used to describe a shipped feature: the backend resolving `@DESCRIPTION1@` to the header description in the line `/defaults` response and the inline add-row seeding the empty per-line `Description` on open. That per-line field no longer exists — `lines.fields.description` is now `visibility: "discarded"` (see "Line description column removed" above) — so there is nothing left for the pre-fill to seed on this window. The header's own `description` field is unaffected.

## Manual verification

1. Open `/simple-g-l-journal` and create a new header. Confirm the form shows the six base fields, in order — Accounting Date (labeled **Fecha**/**Date**), Period, Description, Currency, Opening, Multi-Ledger — that no Document Date appears, and that no Document No, Document Type, or the four non-reversed dimension fields (Asset, Campaign, User1, User2) appear. Save the header and confirm it persists (no "Completá todos los campos requeridos" toast).
2. (Config-dependent, ETP-4529) With the client's accounting-dimension display config enabled, confirm Business Partner, Product, Project, and Cost Center also render on the main form; with it disabled, confirm they do not.
3. Open the saved record and add a line: pick an account and enter a debit of 100 (leave credit empty), then submit the row. Confirm the line saves (no false "required fields" toast — Open Items unchecked and the empty credit must not block it). Confirm the lines grid shows exactly four columns — LineNo, Account, Debit, Credit — with **no Description column** (ETP-5210, revised scope), and that **Account** visibly fills the space Description used to occupy (it is the sole growing column via its `columnWidth: 280`). Confirm the totals row directly below the line (`data-testid="balance-footer-row"`) shows 100.00 under the **Débito** column (`"balance-footer-debit"`), a blank cell under **Crédito**, and that both cells are pixel-aligned under their grid columns — and that the Save button is disabled.
4. Add a second line with a credit of 100 (debit 0). Confirm the totals row now shows 100.00 under both **Débito** and **Crédito**, still column-aligned, and that Save becomes enabled.
5. Save successfully, then edit a line to make the totals differ (e.g. credit 60). Confirm the totals row updates to the new, unequal sums and Save is blocked again, with the tooltip "El debe y el haber deben ser iguales antes de guardar" / "Debit and credit must be equal before saving".
6. Rebalance the entry and save. Open the Complete action: confirm it is blocked while the total is zero and available once it is greater than zero. Confirm both status chips update independently — the document lifecycle chip (Borrador → Completado on Complete) and the accounting `posted` pill (Sin contabilizar → Contabilizado via the Post menu action, and back via Unpost).
7. On a saved line, use the row's "Añadir dimensiones"/"Editar dimensiones" hover action and confirm it opens an expand-row panel (not a side panel) showing Business Partner, Product, Project, and Cost Center per their config-gating. Separately, on the add-row form, tick **Open Items** and confirm the **Asset** field appears; untick it and confirm it hides again.
8. Confirm the window appears in the Finance menu as **Manual Journals** (es: **Asientos Manuales**).
9. Confirm the list/grid view is filterable by Fecha, Periodo, Descripción, Moneda, and both status chips (`posted`, `documentStatus`), and that the Fecha column shows no red "overdue" dot even for past dates (`dot: false`, ETP-5210).

## Accounting dimension visibility per section — ETP-4529

The ETP-4529 matrix asks for all four dimensions (Contacto, Producto, Proyecto, Centro de costo) to
be **Por config** on both Cabecera and Líneas — the only window in the matrix with a uniform
"Por config" row.

**Header — intentional design reversal (confirmed by ETP-4529's acceptance criteria,
approved through REVIEW and QA):** `businessPartner`, `product`, `project`, and `costCenter`
were previously all `visibility: "discarded"` with the reason "Header accounting dimension —
not part of the simplified 7-field header form" (a deliberate prior scope decision). ETP-4529's
own matrix (`Asientos Manuales | Cabecera` = Por config for all four) explicitly supersedes
that prior decision: all four are now `visibility: "editable", section: "other"` with no
`displayLogic` override, so the raw AD `@ACCT_DIMENSION_DISPLAY@` passes through and each field
is shown only when the client's accounting-dimension configuration enables it for GL Journal
headers. This reverses the "simplified 7-field header" decision — the reversal is the ticket's
literal requirement, not an incidental side effect, and both REVIEW and QA passed it.

**Lines — latent bug fixed:** all four dimension fields previously shared the identical override
`"displayLogic": "@Open_Items@='Y'"` (visible only when the line's Open Items checkbox is ticked),
copied across all four regardless of each field's actual raw AD display logic. Checking the raw
schema:
- `businessPartner`: raw AD `displayLogic` is `@Open_Items@='Y' | @ACCT_DIMENSION_DISPLAY@` (an OR
  of the Open-Items rule and the dimension macro) — the override was accidentally discarding the
  macro branch. Removed the override so the real compound expression passes through: the field now
  shows on Open-Items lines **or** when config-enabled (strict superset of the old behavior).
- `product`, `project`, `costCenter`: raw AD `displayLogic` is plain `@ACCT_DIMENSION_DISPLAY@` —
  these were never actually tied to Open Items at the AD level; the shared override was a
  copy-paste that didn't match. Removed for all three; they are now purely config-gated.

**Runtime evaluator — fixed (ETP-4529 follow-up), fully effective for this window.** Three
generic bugs (the `EntityForm.jsx` visibility filter never actually consulting the
evaluate-display result, the `principal` section hardcoding empty visibility, and no
lines-scoped `useDisplayLogic` call existing at all) were found and fixed — full write-up in
`sales-invoice.md`. Both `header.*` and `lines.*` dimension fields are now genuinely
config-gated at runtime. This window resolves to the same `inlineEditable` `linesLayout` as
sales-invoice, purchase-invoice, goods-shipment, goods-receipt, physical-inventory and
goods-movements — via `DetailView.jsx`'s default, since `decisions.json` doesn't declare
`window.linesLayout` here — so the lines-scoped evaluator fix reaches this window through
`InlineLinesPanel`'s dimension expand-row (see the ETP-4610 note below), not a `LinesForm.jsx`
sidebar.

### Header section placement fix (ETP-4529 follow-up)

All four header dimension fields — `businessPartner`, `product`, `project`, `costCenter` (all
already present and config-gated, confirmed — no AD-level gap) — had `"section": "other"`
instead of `"section": "principal"`, making them render in the secondary/collapsed area instead
of the main visible form, even though the header design reversal above intentionally promoted
them from `discarded`. Fixed by changing `section` to `"principal"` for all four fields in
`decisions.json` and regenerating; confirmed in `contract.json` (`section: "principal"`) and in
the generated `GLJournalForm.jsx`.

### Lines dimensions had no rendering surface at all (ETP-4529 gap fix)

Confirmed by direct inspection: despite the `displayLogic` fix above, `businessPartner`,
`product`, `project`, and `costCenter` on the `lines` entity were `{"visibility": "editable",
"grid": false}` with **no `grid` and no `dimensionsPanel` key set to `true`**. Since the
generator only emits a lines-grid entry for a field when either `grid: true` or
`dimensionsPanel: true` is set, these four fields had **no rendering surface whatsoever** in the
generated `GLJournalLineTable.jsx` — not hidden-but-present, entirely absent from the columns
array. TC-106 ("Asientos Manuales header and lines: all four dimensions follow global config in
both sections") could not pass on the lines side because there was nothing to show or hide.

Fixed by adding `"dimensionsPanel": true` to all four fields in `decisions.json` (keeping
`grid: false` and the raw-AD-passthrough `displayLogic`/`reason` as-is). Regenerated
`GLJournalLineTable.jsx` now emits a synthetic `dimensions` column
(`type: 'dimensionsPanel'`, `label`/`labels: {"Dimensiones contables"}`) listing all four fields
as `dimensionFields`. This column definition is passed to both `InlineLinesPanel` and
`DataTable`, so the expand-row "Dimensiones contables" panel renders in this window's
`InlineLinesPanel` lines grid too — in addition to (not instead of) the add-row form, which
still separately gates `asset` behind the Open Items checkbox.

### Regen gap re-closed + "Añadir dimensiones" moved to a hover action (ETP-4610)

The regeneration described above had not actually landed in the committed `contract.json`/
`GLJournalLineTable.jsx` (zero `dimensionsPanel` references found there while validating
ETP-4610) — likely lost across the `epic/ETP-3504` merges preceding this branch. Re-ran
`make regen ONLY=simple-g-l-journal SKIP_EXTRACT=1 LOCAL_CORE=1`; confirmed clean
(`sf-validate-pipeline`, 0 violations, additive version bump, no unrelated translation drift).
Separately, `InlineLinesPanel` no longer renders the `dimensionsPanel` type as a grid column in
its own `inlineEditable` layout — "Añadir dimensiones" is now a hover action next to Edit/Delete,
gated on at least one visible dimension field, with the expand-chevron column unchanged. The
label/icon is adaptive: "Añadir dimensiones" while the line has no dimension values, "Editar
dimensiones" once at least one is set. (`GLJournalLineTable.jsx` also mounts a hidden,
data-less `DataTable` block solely to host the add-row form's callouts/selectors when
`addRow?.active` — that block does not render `dimensionsPanel` at all — pre-existing behavior,
unrelated to and unchanged by ETP-4610.) See
`docs/ui-customization.md` §14b/§14c and `docs/feedback.md`'s ETP-4610 entry.

## DF Contabilidad §2.1 corrections — ETP-4917

Four decisions.json-level changes, all header-scoped, none touching the balance/save-gate logic:

- **Header date label override.** `accountingDate` now carries a window-scoped `labels` override
  (`{"en_US": "Date", "es_ES": "Fecha"}`). This is a **field-level label override on this window's
  `accountingDate` only** — the shared `accountingDate` i18n locale key is untouched and still
  used, unchanged, by every other window that shows an Accounting Date field. Do not "fix" this by
  editing the shared locale key; if a future window needs the same relabel, give it its own
  `labels` override in its own `decisions.json`.
- **Second, independent status chip.** `documentStatus` (DocStatus) was promoted from `discarded`
  to `visibility: "readOnly"`, `form: false`, `grid: true`, `searchable: true` — see the header
  fields table above. The window now shows **two** status chips side by side: the pre-existing
  accounting `posted` pill (Sin contabilizar/Contabilizado) and this new document lifecycle chip
  (Borrador/Completado). No `badgeLabels` override was added for `documentStatus` — the DR→
  `statusDraft`/CO→`statusComplete` mapping comes from `statusBadge.js`'s built-in default
  fallback, and both i18n keys already existed in `en_US.json`/`es_ES.json` before this change, so
  no new locale keys were needed. `documentStatus` is also the field `draftMode` completion
  auto-detects as its `statusField` when the window doesn't declare one explicitly (this window
  didn't, and still doesn't — `draftMode` has no explicit `statusField` key in `decisions.json`;
  the runtime falls back to `documentStatus` by name).
- **Grid/searchable widened.** `grid: true` + `searchable: true` (plus explicit `gridOrder`) were
  added to `accountingDate`, `period`, `currency`, and `posted`. Before this change only
  `description` (and, incidentally, `posted`) were grid columns, and only `description` was
  searchable. The list view is now filterable by Fecha, Periodo, Descripción, Moneda, and both
  status chips (`posted`, `documentStatus`).
- **Balance footer trimmed.** See "Balance rule" above — the Difference amount and balanced ✓/✗
  badge were dropped from the visible totals. Display-only change; `computeBalance` and the
  save/complete blocking gates are unchanged. (ETP-5210 later moved the totals themselves from
  `BalanceFooterPanel` into a column-aligned row inside the lines grid — see "Balance rule" above
  — but did not reintroduce Difference/balanced-badge display.)
- **Date-dot indicator suppressed (follow-up, ETP-5210).** Making `accountingDate` a grid column
  above (ETP-4917) had an unwanted side effect: `DataTable.cellRenderers.jsx`'s generic
  `getDateDotColor` paints a red dot on any `type: 'date'` grid column whose value is in the past,
  which reads as an "overdue" signal. That does not make sense for a Manual Journal's accounting
  date — it is historical by nature, not a due date. Fixed at the `decisions.json` level with the
  existing, already-precedented `"dot": false` opt-out (see the header fields table above) — no
  generator or component change needed.

### Posting & completion status correction (doc fix, spotted during ETP-4917 documentation pass)

The original "Gap assessment" bullet above ("Posting is out of scope for this slice … no Post
action, no posting integration … Posted and documentType are kept as hidden system fields …
Posting arrives in workstream D") described the window's **V1** scope and had gone stale — it
predates this ticket and is **not** part of the ETP-4917 change set, but it is flatly wrong
against the `decisions.json` this documentation pass read in full, so it is corrected here rather
than left standing. Current state, verified directly against `artifacts/simple-g-l-journal/decisions.json`
and `com.etendoerp.go`'s `DocumentPostingService`:

- **`window.draftMode`** is enabled: `{"processField": "documentAction", "processValue": "CO",
  "label": "complete", "disableWhenEmpty": true}`. The header exposes a **Complete** action that
  dispatches `DocAction=CO` through the hidden `documentAction` field — completion is not deferred,
  it ships today.
- **`window.menuActions`** declares real **Post** and **Unpost** actions (`action: "post"` /
  `"unpost"`), gated by `visibleWhenFieldFalse: "posted"` / `visibleWhenFieldTrue: "posted"`
  respectively, with `unpost` marked `destructive: true`. These route through NEO Headless's
  generic `DocumentPostingService` (`com.etendoerp.go.schemaforge.handlers.DocumentPostingService`,
  which dispatches on `"post"`/`"unpost"` and calls the classic `post()`/`unpost()` accounting
  routines) — this is a real, working posting integration, not a stub reserved for a later
  workstream.
- **`posted`** is `visibility: "readOnly"` (not `system`), rendered as a status pill via
  `window.statusPills` (Sin contabilizar/Contabilizado) plus, as of this ticket, a grid column.
  `documentType` remains a hidden `system` field, and `documentAction` remains hidden from the
  form — but `documentAction` is actively wired to the Complete button above, not merely
  "discarded" or dormant.
- Net effect: this window already has a functioning document lifecycle (Draft → Complete →
  Post/Unpost) with two independent, visible status chips. Anyone reading the "Gap assessment"
  section for the current state of posting/completion should treat this note, not the original
  bullet, as authoritative. The genuinely-still-open gaps from that section — multi-currency
  document rates, the `Fact_Acct` posting-result view, and line-level payment integration — remain
  accurate and unaffected by this correction.
