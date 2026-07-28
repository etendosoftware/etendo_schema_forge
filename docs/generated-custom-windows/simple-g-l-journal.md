# Simple G/L Journal (Manual Journals)

## Intent

Use this window to record simplified manual accounting journals ("Asientos Manuales") in Etendo GO. It ports the Classic `Simple G/L Journal` window (AD id `B917E8A7B0864ACEA9D941E3B7494E53`) as a 2-level master-detail surface: a journal header plus debit/credit lines. The defining domain rule is that an entry must be **balanced** — the sum of the debit column must equal the sum of the credit column — before it can be saved. Completing (confirming) the journal additionally requires the total to be greater than zero.

This is **slice 1 of workstream C (Manual Journals Simplified)** under ETP-4244. It provides full CRUD over journals and lines. **Posting is deferred** to workstream D (see Gap assessment).

## What this window should allow

- Create and review journal headers with a focused 6-field form, in order: Accounting Date, Period, Description, Currency, Opening, and Multi-Ledger. (Document Date is hidden — see below.)
- **Single date:** the form exposes only **Accounting Date**. Document Date is hidden (`system`); the backend derives `DateDoc` from the accounting date via its AD default (`to_date(@HeaderDateAcct@)`), so the user never maintains two dates.
- Add one or more journal lines under a header, each with an account, an optional description, a debit amount, and a credit amount. A new line's `Description` is **pre-filled with the header description**: the line `Description` carries the AD default `@DESCRIPTION1@` (the tab auxiliary input `DESCRIPTION1` = the parent journal's description), NEO Headless resolves it in its defaults pipeline, and the inline add-row fetches the line `/defaults` on open (HandleDefaults) and seeds the empty field. The user can still edit it per line.
- Optionally flag a line as **Open Items**, which reveals per-line accounting dimensions (Business Partner, Product, Project, Cost Center, Asset) in the line editor.
- See a live **balance footer** below the lines: total debit, total credit, the difference, and a balanced ✓ / unbalanced ✗ badge.
- Be prevented from saving the document while the entry is unbalanced (the Save button is disabled with an explanatory tooltip).

## Interaction model

- **Route:** `/simple-g-l-journal`, `/simple-g-l-journal/:recordId`.
- **Visibility:** visible from the **Finance** menu as **Manual Journals** (es: **Asientos Manuales**), wired via `menus["Manual Journals"]` in both locales.
- **Implementation type:** fully generated window (no custom components). CRUD runs through NEO Headless generic CRUD. A `GlJournalHeaderHandler` (`@Named("glJournalHeaderHandler")`) injects `C_AcctSchema_ID` from the session on POST and routes document-completion (CO) through `FIN_AddPaymentFromJournal`.
- **Window shape:** master-detail. The header entity is `gLJournal` (table `GL_Journal`) and the line entity is `gLJournalLine` (table `GL_JournalLine`). The two Classic auxiliary tabs — `Fact_Acct` (posting result) and `C_Conversion_Rate_Document` (document rates) — are **dropped** (`exclude: true`) for V1.
- **Lines tab layout:** classic grid + side-panel editor (no `linesLayout` declared). The lines table shows the five core columns; clicking a row opens a side panel for editing, where the Open Items toggle and its dependent dimensions live.
- An **Attachments** tab is available in the detail tab strip.

## Header fields

The header form shows **exactly 6 editable fields**, in this order: Accounting Date, Period, Description, Currency, Opening, Multi-Ledger (`seq` drives the ordering — description sits after the date/period block). Everything else is hidden (system) or discarded.

| Field (curated) | Column | Visibility | Notes |
|---|---|---|---|
| `accountingDate` | DateAcct | editable | `seq: 10`. The only date shown. Defaults to today. |
| `period` | C_Period_ID | editable | `seq: 20`. Accounting period. |
| `description` | Description | editable | `seq: 30` — placed after the dates. Required; the only header field also shown in the journal list grid + searchable. |
| `documentDate` | DateDoc | system | **Hidden.** Unified into Accounting Date — not on the form and not sent; the backend resolves `DateDoc` from its AD default (`to_date(@HeaderDateAcct@)`). |

**ETP-4531 note (redefined 2026-07-17 — unified accounting date):** `GL_Journal.DateDoc` and `GL_Journal.DateAcct` both carry `AD_Column.AD_Callout_ID = org.openbravo.erpCommon.ad_callouts.SL_Journal_Period`, whose `execute()` unconditionally copies `DateDoc → DateAcct` when `DateDoc` is the field that changed. Today this is **dormant, not absent**: it never fires because `documentDate` stays hidden (`visibility: system`), so no interactive edit can trigger it, and the create-time cascade is a no-op since both dates already default to `@#Date@`. This window's "single date" design (`documentDate` hidden, `accountingDate` the one visible field) already matches the redefined ETP-4531 goal — a single visible date, with both DB columns kept in sync — so no guard is needed here. If `documentDate` were ever exposed as an editable field alongside `accountingDate`, the two should be explicitly **mirrored** (matching the `AbstractInvoiceHeaderHandler#mirrorAccountingDate` pattern used for the invoice windows), not guarded apart — unification, not independence, is the current intent.
| `currency` | C_Currency_ID | editable | Journal currency. |
| `opening` | IsOpening | editable | Marks an opening-balance journal. |
| `multigeneralLedger` | Multi_Gl | editable | Multi-ledger flag. |
| `documentNo` | DocumentNo | system | Auto-sequenced by NEO on POST; not shown on the form. |
| `documentType` | C_DocType_ID | system | Hidden but still defaulted under the hood (`DocBaseType='GLJ'`) — needed for posting/sequencing later. **Not discarded.** |
| `posted` | Posted | system | Posting status, hidden (posting deferred to workstream D). |
| `rate` | CurrencyRate | system | Derived currency rate, hidden. |
| header dimensions | C_Bpartner_ID, M_Product_ID, C_Project_ID, C_Costcenter_ID, A_Asset_ID, C_Campaign_ID, User1_ID, User2_ID | discarded | Accounting dimensions removed from the header form / "Others" section. |
| `documentAction`, `accountingSchema`, `totalDebitAmount`, `totalCreditAmount`, `controlAmount`, `currencyRateType`, `gLCategory`, `postingType`, `documentStatus` | — | discarded | Posting/completion-flow and header-total fields not needed in the simplified UI (totals are replaced by the live balance footer). |

## Line entry

**Lines grid columns (exactly five):** `lineNo` (LineNo, read-only), `accountingCombination` (Account), `description`, `foreignCurrencyDebit` (Debit), `foreignCurrencyCredit` (Credit). No dimension columns appear in the grid.

The side-panel line editor additionally exposes the **Open Items** checkbox and, when it is ticked, the five per-line dimensions.

| Field (curated) | Column | Grid? | Visibility | Notes |
|---|---|---|---|---|
| `lineNo` | Line | grid | readOnly | Auto-sequenced line number, displayed read-only (label **LineNo**). |
| `accountingCombination` | C_ValidCombination_ID | grid | editable | Accounting-combination selector (label **Account**, lookup). |
| `description` | Description | grid | editable | Pre-filled with the parent journal's description: AD default `@DESCRIPTION1@` resolves in the NEO `/defaults` response and the inline add-row seeds it on open (HandleDefaults). Editable per line. |
| `foreignCurrencyDebit` | AmtSourceDr | grid | editable, amount, required | **Debit** — feeds the balance footer Σ debit. |
| `foreignCurrencyCredit` | AmtSourceCr | grid | editable, amount, required | **Credit** — feeds the balance footer Σ credit. |
| `openItems` | Open_Items | form-only | editable | **Open Items** checkbox in the side panel; toggling it reveals the dimensions below. |
| `businessPartner`, `product`, `project`, `costCenter`, `asset` | C_Bpartner_ID, M_Product_ID, C_Project_ID, C_Costcenter_ID, A_Asset_ID | form-only | editable | Per-line dimensions, **only visible when Open Items is ticked** — each carries `displayLogic: (record) => record['openItems'] === true` so `EntityForm` shows/hides them against the editing record. |
| `gLItems` | Account_ID | — | discarded | Multi-G/L account selector — only relevant under Multi-General Ledger, out of scope for the simplified single-ledger journal. |
| `activity`, `salesCampaign`, `salesRegion`, `stDimension`, `ndDimension` | C_Activity_ID, C_Campaign_ID, C_Salesregion_ID, User1_ID, User2_ID | — | discarded | Extra accounting dimensions not requested for the simplified line editor. |
| `debit` / `credit` | AmtAcctDr / AmtAcctCr | — | system | Posting-derived accounted amounts, hidden from the user. |
| `rate` | CurrencyRate | — | system | Line currency rate, derived. |
| `financialAccount`, `paymentMethod`, `paymentDate`, `relatedPayment`, `aPRMAddPayment`, `gLItem` | FIN_Financial_Account_ID, FIN_Paymentmethod_ID, Paymentdate, FIN_Payment_ID, EM_Aprm_Addpayment, C_Glitem_ID | — | discarded | Payment-integration fields dropped for V1 (spec §2). `EM_*` also caught by `discardPatterns`. |

## Balance rule (core behavior)

This window declares `window.balanceFooter = { "debitField": "foreignCurrencyDebit", "creditField": "foreignCurrencyCredit" }`.

- A generic `BalanceFooterPanel` renders below the lines, showing **Total debit**, **Total credit**, **Difference**, and a balanced ✓ / unbalanced ✗ badge.
- The footer sums the saved lines plus any in-progress add-row and any sidebar editing snapshot, so it reflects the live state as the user types.
- **Save gate** (`blockSaveForBalance`): the **Save** button is disabled while `Σ debit ≠ Σ credit` (difference ≠ 0). An all-zero journal (0 = 0) is treated as balanced and is savable.
- **Completion gate** (`blockCompleteForBalance`): the **Complete/Confirm** button additionally requires the total to be greater than zero — an all-zero set cannot be completed.
- While the save gate is active, the Save button shows the tooltip "El debe y el haber deben ser iguales antes de guardar" / "Debit and credit must be equal before saving".
- Validator rule **F17** enforces that the `debitField` / `creditField` named here exist on the line entity in the generated contract.

## Gap assessment

- **Posting is out of scope for this slice.** There is no Post action, no posting integration, and no scheduled auto-posting. `Posted` and `documentType` are kept as hidden **system** fields (defaulted under the hood so a later posting slice can use them); `DocAction` and posting-only fields are discarded. Posting arrives in workstream D (which itself depends on the predefined accounting schema, ETP-4245).
- **Multi-currency document rates** (`C_Conversion_Rate_Document`) and the **posting result view** (`Fact_Acct`) are dropped for V1.
- **Payment integration** on lines (`FIN_*`, add-payment, payment date/id) is dropped for V1. The **Open Items** checkbox is kept — but in this slice it only gates the visibility of the per-line accounting dimensions; it does not wire up payment creation.
- The balance footer enforces debit = credit at the UI level; it does not assert that NEO's generic CRUD performs any additional server-side accounting validation beyond persisting the rows.
- **Line description pre-fill (shipped).** The backend resolves `@DESCRIPTION1@` to the header description in the line `/defaults` response (via `NeoAuxiliaryInputResolver`), and the inline add-row fetches `/{detailEntity}/defaults?parentId=…` on open and seeds the empty `Description` (HandleDefaults — generic, on by default, opt out per entity with `handlesDefaults: false` or per field with `skipDefault: true`).

## Manual verification

1. Open `/simple-g-l-journal` and create a new header. Confirm the form shows exactly six fields, in order — Accounting Date, Period, Description, Currency, Opening, Multi-Ledger — that no Document Date appears, and that no Document No, Document Type, or accounting-dimension fields appear. Save the header and confirm it persists (no "Completá todos los campos requeridos" toast).
2. Open the saved record and add a line: pick an account and enter a debit of 100 (leave credit empty), then submit the row. Confirm the line saves (no false "required fields" toast — Open Items unchecked and the empty credit must not block it). Confirm the balance footer shows the entry as **unbalanced** and the Save button is disabled.
3. Add a second line with a credit of 100 (debit 0). Confirm the footer flips to **balanced ✓**, the difference reads 0, and Save becomes enabled.
4. Save successfully, then edit a line to make the totals differ (e.g. credit 60). Confirm the footer returns to **unbalanced ✗** and Save is blocked again.
5. Confirm no Post/Complete action is offered and no posting status field is shown (posting deferred; `Posted` is hidden).
6. Open a line in the side panel, tick **Open Items**, and confirm the five dimension fields (Business Partner, Product, Project, Cost Center, Asset) appear; untick it and confirm they hide again.
7. Confirm the window appears in the Finance menu as **Manual Journals** (es: **Asientos Manuales**).

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
config-gated at runtime. Unlike the inlineEditable windows (sales-invoice, purchase-invoice,
goods-shipment, goods-receipt, physical-inventory, goods-movements), this window uses the
classic `linesLayout`, so `LinesForm.jsx`'s sidebar always mounts and the lines-scoped evaluator
fix is fully effective here — no residual UI-surface limitation.

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
`DataTable`, so the expand-row "Dimensiones contables" panel renders in the lines grid for this
window's classic grid + side-panel layout too — in addition to (not instead of) the existing
side-panel editor, which still separately gates `asset` behind the Open Items checkbox.

### Regen gap re-closed + "Añadir dimensiones" moved to a hover action (ETP-4610)

The regeneration described above had not actually landed in the committed `contract.json`/
`GLJournalLineTable.jsx` (zero `dimensionsPanel` references found there while validating
ETP-4610) — likely lost across the `epic/ETP-3504` merges preceding this branch. Re-ran
`make regen ONLY=simple-g-l-journal SKIP_EXTRACT=1 LOCAL_CORE=1`; confirmed clean
(`sf-validate-pipeline`, 0 violations, additive version bump, no unrelated translation drift).
Separately, `InlineLinesPanel` no longer renders the `dimensionsPanel` type as a grid column in
its own `inlineEditable` layout — "Añadir dimensiones" is now a hover action next to Edit/Delete,
gated on at least one visible dimension field, with the expand-chevron column unchanged. (The
`DataTable`-driven classic-grid path this window also uses does not render `dimensionsPanel` at
all — pre-existing behavior, unrelated to and unchanged by ETP-4610.) See
`docs/ui-customization.md` §14b/§14c and `docs/feedback.md`'s ETP-4610 entry.
