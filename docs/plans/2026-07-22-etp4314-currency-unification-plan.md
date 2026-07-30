# ETP-4314 — Currency Display Unification: Root Cause & Solution Plan

**Ticket:** [ETP-4314](https://etendoproject.atlassian.net/browse/ETP-4314) — [Global] Unificar representación de moneda — símbolo (€) vs código (EUR) en resumen de documentos
**Branch:** `feature/ETP-4314` (from `epic/ETP-3504`)
**Date:** 2026-07-22
**Status:** ✅ **Tier A implementation complete** (§12) — visually re-verified in the browser, full test suite green. Tiers B and C remain explicitly **not built** — see §9 for the full scope breakdown, §11 for the Jira comment logged at kickoff, and §12 for the completion evidence and a few new findings caught only during implementation.

## 1. What ETP-4314 asks for

> Usar **exclusivamente el símbolo** `€` en todos los importes de la aplicación, en formato español: `1.250,00 €` (símbolo al final, separado por espacio).

Scope declared in the ticket: sales/purchase orders, sales/purchase invoices, sales/purchase delivery notes (albaranes), sales quotations, and "any other document that shows monetary amounts." The reported symptom is symbol (`€`) vs ISO code (`EUR`) inconsistency in document totals/summaries. `EUR` as a code should only appear where multi-currency context requires distinguishing currencies.

## 2. Where this started: ETP-3726

The file the team picked as canonical, `tools/app-shell/src/lib/formatCurrency.js`, was created by [ETP-3726](https://etendoproject.atlassian.net/browse/ETP-3726) — *"Add shared frontend currency formatting utility"* (Ivan Robledo, done 2026-04-13). Reading that ticket's original description matters because it explains **why** the file is the way it is today — none of its current limitations are accidental oversights, they were explicit, scoped decisions:

- **The `en-US` locale was intentional and always meant to be temporary.** Direct quote from the ticket: *"This version should keep a fixed internal default locale for now (for example `en-US`) so the team can establish a consistent baseline before introducing application-level locale resolution... The implementation must be ready to evolve later toward locale-aware behavior without changing the current call sites."* ETP-3726 explicitly deferred the locale decision — it did not get it wrong, it punted it to a future ticket. **ETP-4314 is that future ticket.**
- **The duplication problem was already known in April 2026.** ETP-3726 named the exact files to watch: `formatAmount.js`, `components/related-documents/helpers.js`, `KPIHeader.jsx`, `useDashboardData.js`, `DashboardPage.jsx` — and said: *"This task does NOT need to refactor the whole app, but it should avoid introducing yet another disconnected money formatter. If possible, existing overlapping helpers should be aligned, wrapped, or marked for future consolidation."* That consolidation never happened — the helpers were left as-is, and (per the findings below) more were added since.
- **Scope was deliberately minimal.** The only required migration target was `DashboardPage.jsx`. Multi-currency business rules, exchange-rate conversion, and "refactoring every app-shell page" were explicitly out of scope for ETP-3726.
- **Suggested implementation shape** (from the ticket's technical appendix) is essentially what exists today: `Intl.NumberFormat(DEFAULT_LOCALE, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 })` with `DEFAULT_LOCALE = 'en-US'`.

**Conclusion:** `formatCurrency.js` is the right file to centralize on — that was always its stated purpose — but its `en-US` locale is stale baseline debt that ETP-3726 flagged and left for later. Closing that gap is squarely what ETP-4314 is for.

## 3. Findings: independent, duplicated currency formatters (as of 2026-07-21)

Investigation of `tools/app-shell/src` found **at least 10 independent currency-formatting implementations**, none delegating to a single source, each with different locale / symbol-vs-code / separator behavior:

| # | Implementation | Locale | Symbol or code | Consumers |
|---|---|---|---|---|
| 1 | `lib/formatCurrency.js` | `en-US` | Symbol (via `SYMBOL_AFTER_CURRENCIES` whitelist) | PDF/report artifacts (aging, balance sheet, trial balance, print-order/invoice/quotation, profit-loss, journal entries, inventory stock, tax report...), `KanbanBoard`, `financial-accounts/AccountsTable`, `AccountsSidebar`, contacts widgets, `PurchaseOrderActions`, `WarehouseSummary`/`WarehouseProductsTab`, `AmortizationLinesTable`, `AssetsSidebar`/`AssetsAmortizationPanel`, `Sales/Purchases/ContactsPage` |
| 2 | `lib/formatAmount.js` | `en-US` | Symbol (hardcoded `if (isoCode === 'EUR')` special case) | **`DetailView.jsx` → `DocumentTotalsPanel` / `BalanceFooterPanel`** — the actual totals of orders/invoices/delivery notes/quotations named in ETP-4314; also `SummaryBar`, `DataTable`, `PaymentForm`, `related-documents`, fiscal-monitor, several `windows/custom/*` |
| 3 | `lib/formatSigned.js` | `es-ES` (native Intl) | Symbol | Bank reconciliation panels (`ReconciliationSplitPanel`, `AutoMatchSuggestionModal`, `ReconciledTxnsModal`) |
| 4 | `lib/dashboardNumberFormat.js` → `formatDashboardAmount` | `en-US` | **Literal ISO code** (`EUR 1,234.56`, code extracted via regex from a label) | `KPIHeader`, Dashboard cards (`FinancialSummaryCard`, `CollectionsPaymentsCard`, `TopClientsList`, `BestProductsList`, `RecentSalesList`, `FinancialTrendChart`), `ProductSidebar`, `BPChartSVGContent` |
| 5 | `components/ui/money-amount.jsx` (`MoneyAmount`) | Was `es-ES` native; **now delegates to `formatCurrency()`** (`en-US`) as of ETP-4504 — see §4 | Symbol | Reconciliation, payment history, account movements (`NewPaymentEntryModal`, `InvoicePaymentHistoryModal`, `MovementsTable`, `ReconciledTxnsModal`, `AccountSummaryStrip`, `StatementLinesTable`) |
| 6 | `windows/custom/shared/PaymentHeaderTableBase.jsx` (local `currencySymbol()` + `AMOUNT_FMT`) | `es-ES` | Symbol | Payment table inside invoices |
| 7 | `windows/custom/shared/NewPaymentEntryModal.jsx` (inline ternary) | — | Only maps `EUR`→`€`; anything else returns the raw code | Payment/collection modal (partially touched by ETP-4504, see §4) |
| 8 | `windows/custom/financial-account/ManualStatementModal.jsx` (local `currencySymbol()`) | `es-ES` | Symbol | Financial account statements |
| 9 | `windows/custom/financial-account/FundsTransferModal.jsx` (local `currencySymbol()`) | `es-ES` | Symbol | Funds transfer modal |
| 10 | `fiscalModelsUtils.js`, `FmOverlays.jsx`, `InvoicePaymentHistoryModal.jsx` (inline `Intl.NumberFormat('es-ES', { currency: 'EUR' })`, hardcoded EUR) | `es-ES` | Symbol | Fiscal models (303/349), invoice payment history |
| 11 | `SummaryCard.jsx` — calls `formatAmount()` (confirmed by source read, §8.6) | `en-US` (inherited from `formatAmount.js`) | Symbol (its `EUR`/`USD` badge is a separate, intentional "converted from" indicator, not part of the amount string — see corrected §8.1b) | Order/Invoice/Quotation preview drawers (side panel opened from list view) when the document currency differs from the org currency |
| 12 | `components/contract-ui/LinesBottomSection.jsx` (local `fmt()`, plain string concat `${number} ${currencyCode}`) | Browser-default (`toLocaleString(undefined, ...)`) | **Literal code, always** — no symbol lookup of any kind | **The actual document-totals renderer for 12 windows**: `sales-invoice`, `purchase-invoice`, `sales-order`, `purchase-order`, `sales-quotation`, `goods-shipment`, `goods-receipt`, `goods-movements`, `internal-consumption`, `physical-inventory`, `return-to-vendor-shipment`, `return-material-receipt` — see §8.4 |
| 13 | `artifacts/payment-in/custom/PaymentSummaryCard.jsx` (local `fmtAmount()`) | Browser-default, `style:'currency'`, **no explicit `useGrouping`** | Symbol | Payment detail sidebar summary card — a live second instance of the exact `useGrouping` bug from §5, found in source (not yet visually confirmed with a ≥1000 value) |
| 14 | `artifacts/payment-in/custom/ApplyToInvoices.jsx` (local `formatAmount()`, shadows the shared lib name — naming collision risk) | Browser-default, hardcoded `CURRENCY_SYMBOLS` lookup map | Symbol, but **placed BEFORE the amount with a space** (`"€ 1,234.56"`) — the opposite convention from every other implementation and from what the ticket requires (symbol after) | "Aplicar a facturas" modal inside Payment In |
| 15 | `artifacts/payment-in/custom/NewPaymentModal.jsx` (local `fmt()`) | Browser-default, `style:'currency'`, no explicit `useGrouping` | Symbol | New payment modal — another live `useGrouping`-bug candidate, not yet visually confirmed |
| 16 | `windows/custom/product/ProductListCells.jsx` (`PriceText`, `{value.toFixed(2)} €`) | — (no Intl at all, plain `toFixed`) | **Hardcoded literal `€`, always** — not even the document/price-list's actual currency (§8.7) | Product list "Venta"/"Compra" columns. Worse than a formatting bug: mislabels the currency entirely for any non-EUR price list. |
| 17 | `windows/custom/shared/usePaymentBalance.js` (`formatPlain()` + local `groupThousands()`) | Hand-rolled `en-US` (comma thousands, period decimal) — no Intl at all, a deliberate hand-rolled workaround for the `useGrouping` bug | Symbol appended separately by the caller | `NewPaymentEntryModal.jsx`'s `fmtCur()` (plain-text/toast contexts) composes this with `currencySymbol()` below |
| 18 | `windows/custom/shared/NewPaymentEntryModal.jsx` (`currencySymbol()` / `curSuffix()` / `fmtCur()`, lines 124-139) | Symbol via `Intl.NumberFormat('es-ES', {..., currencyDisplay:'narrowSymbol'}).formatToParts(0)` (correct, narrow-symbol lookup only) + `formatPlain()` (#17) for the number | Symbol, placed after (`"6.420,00 €"`-shaped once combined — but currently `en-US` numerics from `formatPlain`) | Plain-text spots inside the New Payment modal (toasts, `ui()`-interpolated strings) — **not** the JSX amounts, which go through `<MoneyAmount>` (#5) instead |
| 19 | `windows/custom/shared/InvoicePaymentHistoryModal.jsx` (`fmtAmount()`, line 19) | `Intl.NumberFormat('es-ES', {style:'currency', currency: currency \|\| 'EUR', currencyDisplay:'narrowSymbol'})`, **no explicit `useGrouping`** | Symbol | Delete-draft-payment confirm dialog message only — another live §5 `useGrouping`-bug instance |
| 20 | `components/forms/fields.jsx` (`AmountInput`, line 140: `<span>€</span>`) | Hardcoded literal `€` — the component doesn't even accept a `currency` prop | **Always `€`, regardless of the actual account/document currency** | Amount input fields in `NewTransactionModal.jsx` and `NewMovementWizard/index.jsx` (financial account movements), `PaymentForm.jsx`, `ReversedInvoicesPanel.jsx` (sales-invoice). Visually confirmed on a real **USD** test account (§8.8) — input showed `€` suffix the whole time. |
| 21 | `components/contract-ui/AutoMatchSuggestionModal.jsx` (`formatSignedAmount()`, line 43-46: `` `${sign}${Math.abs(amount).toFixed(2).replace('.', ',')} €` ``) | Hand-rolled Spanish-style number (correctly `es-ES`-shaped) but **takes no currency parameter at all** — always appends literal `€` | **Always `€`, regardless of account currency** — and provably inconsistent *within the same dialog*: the sibling column (`StatementContent`, which does receive `currency` correctly) renders the real symbol | "Operaciones del sistema" column of the reconciliation auto-match suggestion dialog. Visually confirmed on the USD test account (§8.9) — **within the same modal**, the statement-line side showed `+$500.00` while the system-operation side showed `+500,00 €` for what is meant to be the identical currency context. The clearest single piece of evidence in this whole investigation for why centralizing on one function matters. |

**Correction after the visual pass (§8):** reading the source predicted only implementation #4 (`formatDashboardAmount`) would show the literal code. Live testing found literal `EUR` in several places the static map hadn't reached — but the actual mechanism differs per surface: Sales Invoice/Quotation/Order totals and the quotation confirm-dialog trace to the newly-found implementation #12 (`LinesBottomSection.jsx`'s `fmt()`), not to `formatAmount.js` or `SummaryCard.jsx` as first assumed (§8.4 has the full trace). `SummaryCard.jsx`'s `EUR` badge, initially misread as a formatting bug, is confirmed by source to be an intentional "converted-from" indicator (corrected in §8.1b) — its actual amount strings go through `formatAmount()` correctly (just wrong locale). Everywhere else the symbol is shown correctly, just with the wrong (English) number separators — which also violates the ticket's explicit requirement of Spanish format, even though the ticket text only calls out the symbol/code axis.

## 4. What ETP-4504 changed (PR #925, merged into `epic/ETP-3504` 2026-07-21)

While this investigation was underway, PR #925 (*"Feature ETP-4504: Unify currency formatting, restore refund"*, Agustín Calderón) modified the same area:

- `formatCurrency.js`: added a `compact` option (`formatCurrency(currencyCode, value, { compact })`) — additive, no locale change. Still `DEFAULT_LOCALE = 'en-US'`.
- `money-amount.jsx`: `MoneyAmount` was rewritten to **delegate to `formatCurrency()`** instead of its own native `Intl.NumberFormat('es-ES', ...)` call. The component's own docstring documents the regression this caused:
  - Before: `<MoneyAmount value={12450} currency="EUR" /> → "+12.450,00 €"` (Spanish separators)
  - After: `<MoneyAmount value={12450} currency="EUR" /> → "+12,450.00 €"` (English separators)
  - The new comment in the file states `formatCurrency()` is *"the ONE true currency-formatting implementation in the app"* — reinforcing it as the centralization point (consistent with the team's decision in §2), but without fixing its locale.

**Net effect of merging ETP-4504:** it moved `MoneyAmount`'s consumers (bank reconciliation, payment history, account movements) from correct Spanish formatting to incorrect English formatting. This is not a criticism of that PR's own goal (it unified two things: `MoneyAmount` and `formatCurrency`) — it just means the locale fix was never in scope for ETP-4504, and merging it made the blast radius of the still-open locale bug larger. ETP-4314 must fix this as part of its own scope.

## 5. Technical verification (Node 24 / V8, matches the app's runtime engine in Chromium-based browsers)

Before designing the fix, the native `Intl` behavior under `es-ES` was verified directly (not assumed):

```
EUR -> 1234,50 €     ARS -> 1234,50 $     USD -> 1234,50 $     GBP -> 1234,50 £     CHF -> 1234,50 CHF     JPY -> 1.235 ¥
```

Findings:
- **Native `es-ES` Intl formatting already places the symbol AFTER the number for every currency tested** (`narrowSymbol`, separated by a space) — Spanish typographic convention is applied automatically by `Intl`. This means `formatCurrency.js`'s manual `SYMBOL_AFTER_CURRENCIES` whitelist becomes **unnecessary** once the locale switches to `es-ES` — it can be deleted rather than extended.
- **Critical gotcha, reproduced locally:** under `es-ES` (and `en-US`), `Intl.NumberFormat({ style: 'currency', ... })` **silently drops the thousands separator** unless `useGrouping: true` is passed explicitly:
  ```
  default:            1234,50 €   (WRONG — missing "1.234,50")
  with useGrouping:true: 1.234,50 €  (correct)
  ```
  This is the exact issue the *original* (pre-ETP-4504) `money-amount.jsx` had already discovered and worked around with an explicit comment (*"the 'auto' default silently drops thousand separators for style:'currency' in some Intl implementations (e.g. Node's V8)"*) — knowledge that was lost when ETP-4504 rewrote the component to delegate to `formatCurrency()`, which does not set `useGrouping`. **`formatCurrency.js` must set `useGrouping: true` explicitly**, or every amount ≥ 1000 will render wrong (e.g. `1234,50 €` instead of `1.234,50 €`) — a regression that would be easy to miss in manual testing with small amounts.
- Negative numbers and zero format correctly natively (`-1.234,50 €`, `0,00 €`).
- `notation: 'compact'` under `es-ES` renders using Spanish words (`13 mil €` for 12500), not the `12.5K`-style abbreviation the current English-locale compact option produces. This is a **behavior change** to flag explicitly with whoever uses `{ compact: true }` today (dashboard cards) — not wrong, but visibly different, worth a sign-off before shipping.

## 6. Solution plan

This plan is organized in three tiers by scope status, not just technical phase — see §9 for the full reasoning behind which finding lands in which tier. **Only Tier A is being built now.** Tiers B and C are documented here so the fix locations aren't re-discovered later, but nothing in them should be touched without the functional analyst's explicit go-ahead.

### 🟢 TIER A — Building now: ETP-4314's literal, approved scope

#### Phase 1 — Fix the canonical source: `formatCurrency.js`
1. Change `DEFAULT_LOCALE` from `'en-US'` to `'es-ES'`.
2. Add `useGrouping: true` explicitly to both `Intl.NumberFormat` calls in the file (the currency formatter and, if the manual symbol-after branch is kept, the plain number formatter).
3. Delete the manual `SYMBOL_AFTER_CURRENCIES` branch and the associated special-cased formatting logic — native `es-ES` Intl already places the symbol after the amount for all currencies (§5). Fall back to plain `formatter.format(amount)` for every currency code.
4. Update the file's own docstring/examples (`formatCurrency('EUR', 1234.5) // '1.234,50 €'`, etc.) to reflect the new locale.
5. Add regression tests specifically for the `useGrouping` gotcha (an amount ≥ 1000, asserting the thousands separator is present) — this is the failure mode most likely to slip through manual QA.
6. Confirm the `compact` notation's new Spanish wording (`"13 mil €"`) is acceptable for dashboard consumers, or add an explicit override if not.

#### Phase 2 — Migrate the ticket's named document surfaces
1. **Highest priority (per §8.4/§8.6 source trace)**: rewrite `LinesBottomSection.jsx`'s local `fmt()` to call `formatCurrency()`. This single change fixes the document-totals panel for all 12 windows that delegate to it — including every document type ETP-4314 names by name (`sales-invoice`, `purchase-invoice`, `sales-order`, `purchase-order`, `sales-quotation`, `goods-shipment`) plus 6 more under the ticket's own "cualquier otro documento" clause (`goods-receipt`, `goods-movements`, `internal-consumption`, `physical-inventory`, `return-to-vendor-shipment`, `return-material-receipt`).
2. Migrate the **in-scope** remaining `formatAmount.js` call sites (§9.2): `DetailView.jsx`'s `DocumentTotalsPanel` / `BalanceFooterPanel` (for documents without a custom `bottomSection`), `DataTable.jsx`/`DataTable.cellRenderers.jsx` (order/invoice **list-view** amount columns — "Imp. total"), `SummaryCard.jsx` (the order/invoice/quotation **preview-drawer** "Total" + org-currency line), `related-documents` helpers (the chips shown inside an in-scope document, e.g. `Pedido #1000363 2.23 EUR`), the quotation confirm-dialog, and the invoice overdue badge — to call `formatCurrency()` instead.
3. Once every **in-scope** call site is migrated, `formatAmount.js` will have only out-of-scope (Tier C) consumers left (`SummaryBar.jsx`, fiscal-monitor, some `windows/custom/*`) — leave the file in place for those until Tier C is authorized; do **not** delete it yet (unlike the original draft of this plan assumed) since deleting it now would break Tier C surfaces that haven't been migrated.

**Acceptance for Tier A**: every "pedido, factura, albarán, presupuesto" (and their in-window siblings under "cualquier otro documento") shows `1.250,00 €` — Spanish separators, symbol only, symbol after the amount — in its list view, its totals panel, its preview drawer, and any related-document chip or confirm dialog that surfaces its amount. This alone satisfies ETP-4314's acceptance criteria (§7) end to end.

### 🟡 TIER B — Automatic bonus: no extra work, will change as a side effect of Tier A

Not requested, not being built as separate work items, but will visibly change the moment Phase 1 lands because these surfaces already call `formatCurrency()`/`MoneyAmount` directly (§8.6, §9.3): **Warehouse** valuation, **Amortization** panels, the **Contacts** chart tooltip, the **financial-account movements list**, the **New Payment / Invoice Payment History modals'** JSX amounts (17 spots via `MoneyAmount`), and the reconciliation auto-match's **statement-line column**. Mention these in the PR description as an FYI so nobody is surprised seeing them change in review or a demo — but they need zero migration work of their own.

### 🔴 TIER C — Deferred: pending functional-analyst approval to extend scope

Everything below is a real, reproducible bug with a source-level fix already identified — but none of it is "pedidos, facturas, albaranes, presupuestos," so none of it starts until the analyst signs off (§9.4/§9.5). Kept here, fully specified, so picking any of these up later costs zero re-discovery time.

#### (Former Phase 3) Dashboard literal-code bug
`formatDashboardAmount` in `dashboardNumberFormat.js` is the only Dashboard-specific place literally showing `EUR` as text instead of `€`. Would rework it to use `formatCurrency()`, then re-verify `KPIHeader`, `FinancialSummaryCard`, `CollectionsPaymentsCard`, `TopClientsList`, `BestProductsList`, `RecentSalesList`, `FinancialTrendChart`, `ProductSidebar`.

#### (Former Phase 4) Remove the remaining local duplicates
- `PaymentHeaderTableBase.jsx`, `ManualStatementModal.jsx`, `FundsTransferModal.jsx` (Cobro/Pago, financial account — already produce correct output today, see §8.2; this would just be dedup, not a visible fix)
- `fiscalModelsUtils.js`, `FmOverlays.jsx` (303/349 fiscal models — missing `useGrouping`, a real but low-traffic bug)
- `artifacts/payment-in/custom/PaymentSummaryCard.jsx`, `ApplyToInvoices.jsx` (symbol-before placement, the outlier), `NewPaymentModal.jsx` (Payment In modals)
- `windows/custom/shared/InvoicePaymentHistoryModal.jsx`'s `fmtAmount()` and `NewPaymentEntryModal.jsx`'s `currencySymbol()`/`curSuffix()`/`fmtCur()` (plain-text-only paths; their JSX already auto-fixes per Tier B)
- **`windows/custom/product/ProductListCells.jsx` (`PriceText`)** — flag to the analyst specifically (§9.5): this is a currency-**correctness** bug (hardcoded `€` regardless of the actual price-list currency), not just inconsistency, closest of everything in Tier C to warranting its own priority regardless of the ETP-4314 scope decision.
- **`components/forms/fields.jsx` (`AmountInput`)** — same severity class as `ProductListCells.jsx`; its `ReversedInvoicesPanel.jsx` (sales-invoice) consumer is arguably in-scope-adjacent since it's on an invoice window — worth asking the analyst about specifically rather than bundling with the rest of Tier C.
- **`components/contract-ui/AutoMatchSuggestionModal.jsx` (`formatSignedAmount()`)** — bank reconciliation; the cleanest side-by-side reproduction in this whole document (§8.9), but reconciliation isn't a named document type.

#### (Former Phase 4.5) Reconciliation currency prop mismatch — flag urgently regardless of scope decision
`ReconciliationTab.jsx:19` passes `currency={account?.currency}` (a field that doesn't exist) instead of `account?.currencyIso`, silently defaulting every reconciliation view to `'EUR'` for every account (§8.10). One-line fix, but it's a **data** bug, not formatting — recommend flagging this to the analyst as urgent regardless of whether Tier C as a whole gets approved, since it's "shows the wrong currency," not "shows the right currency inconsistently."

#### (Former Phase 5) Reconcile `formatSigned.js`
Already `es-ES` native and correct in shape; its consumers are all bank-reconciliation panels (out of scope). Would wrap it around `formatCurrency()` for true single-source consistency once/if Tier C is authorized.

## 7. Acceptance criteria — Tier A (§6) only

These map to Tier A, the scope actually being built now. Tier C has no acceptance criteria yet — it isn't authorized work.

- [ ] Every document total/summary named in ETP-4314 (sales/purchase orders, invoices, delivery notes, quotations — list view, totals panel, preview drawer, related-document chips, confirm dialogs) shows `1.250,00 €` — Spanish separators, symbol after amount, space-separated.
- [ ] No in-scope document total/summary shows the literal `EUR` code except where multi-currency context requires distinguishing currencies.
- [ ] `formatCurrency.js` is the call site for every in-scope surface migrated in Phase 2. It is **not** required to be the app's only currency-formatting call site yet — Tier C consumers of `formatAmount.js` and the other duplicates remain, deliberately, until that scope is authorized (§9.5). Don't delete `formatAmount.js` as part of Tier A.
- [ ] Regression test exists for the `useGrouping` thousands-separator bug (amount ≥ 1000).
- [ ] No visible regression in currencies other than EUR (USD, ARS, GBP verified via existing/new tests) on any in-scope document.
- [ ] Tier B's automatic side effects (§6) are called out in the PR description, not silently shipped as a surprise.

## 8. Test plan — windows, views, and evidence (visual pass 2026-07-22)

A full visual pass was done against the local `etendo_core_pg` instance (`http://localhost:3100`, user `admin`) using the browser directly, to identify every surface that needs re-verification once the fix lands, and to capture the "before" state as evidence. This is not a static code guess — every row below was actually seen on screen.

### 8.1 Confirmed-broken surfaces (before state, with real captured values)

| Window / View | URL / path | What was seen | Formatter responsible (from §3) |
|---|---|---|---|
| **Dashboard** (`Inicio`) | `/dashboard` | KPI cards show literal code + English separators: `USD 180,328.29`, `USD 4.22`, `USD 2,631,457.63`, `USD 180,099.16` (Clientes destacados, Resumen financiero, Cobros y pagos) | #4 `formatDashboardAmount` |
| **Sales Invoice detail** — totals panel | `/sales-invoice/{id}` (e.g. invoice 1000375) | `Subtotal sin descuento: 1.84 EUR`, `Subtotal: 1.84 EUR`, `Impuesto: -1.84 EUR`, `Total: 0.00 EUR` — literal `EUR` code, not `€`. **This directly contradicts the code-level expectation from `formatAmount.js`** (which should special-case EUR to show the symbol) — needs a source-level trace during Phase 2 to find the actual component/prop wiring responsible before assuming the fix is just "migrate formatAmount.js" | Unclear — likely a different/overriding path specific to invoice header totals; **flagged as an open technical question, see §8.4** |
| **Sales Invoice detail** — overdue status badge | same page, top-right pill | `Vencido · EUR 2.23` — literal code again | Not yet mapped to a specific file — needs tracing (likely `DetailView.jsx`'s overdue-badge renderer) |
| **Sales Invoice detail** — related documents chip | same page, "Documentos" row | `Pedido #1000363 2.23 EUR` — literal code | `related-documents/helpers.js` / `DocChip.jsx` (formatAmount consumer per §3 row 2) |
| **Purchase Invoice list** (`DataTable`) | `/purchase-invoice` | Same screen shows **three different formats simultaneously**: `$125.00` / `$12,000.00` (USD, symbol before), `370.26 €` / `4,840.00 €` (EUR, symbol after but English separators — `4,840.00` instead of `4.840,00`) | `formatAmount.js` via `DataTable.jsx` (#2) |
| **Purchase Invoice preview drawer** (side panel opened from list) | `/purchase-invoice` → click a row | `Total: $4,162.40 EUR` (dollar sign AND "EUR" label together, confusing) then below `(1.16) 4,840.00 €` (exchange rate + original amount) | `SummaryCard.jsx` / `PurchaseInvoiceHeaderTable.jsx` — a third, org-currency-aware display not covered in the original §3 map; needs its own migration item |
| **Purchase Order list** | `/purchase-order` | Same mixed-format bug as Purchase Invoice, at larger magnitudes: `$183,000.00`, `221,430.00 €`, `839,135.00 €`, `1,309,050.60 €` | `formatAmount.js` via `DataTable.jsx` |
| **Sales Order list** | `/sales-order` | Same bug: `$3.85`, `$198,322.12`, `221,681.08 €` | `formatAmount.js` via `DataTable.jsx` |
| **Assets list** (`Activos`) | `/assets` | Same bug at very large magnitudes: `4,000,000.00 €`, `$4,500,000.00`, `$25,000.00`, totals row `8,566,000.00 €` — confirms the bug also affects big numbers, not just small ones | `formatAmount.js` / `formatCurrency.js` (AssetsSidebar/AssetsAmortizationPanel, #1) |
| **Financial Account** (`Cuentas`) — "Detalle de saldos por moneda" | `/finance/accounts` | `EUR 0.00` — code-prefixed (no data to test non-zero values locally; needs an account with a real balance) | Needs tracing, likely local to `AccountsSidebar/index.jsx` |
| **Product list** | `/product` | `10.00 €`, `4000.00 €`, `12000.00 €` — **no thousands separator at all** even for 4-5 digit values, unlike the DataTable elsewhere. A distinct issue from the others — needs its own root-cause check (may be a simpler, non-`Intl` price-cell renderer) | Not yet mapped — new finding, needs source tracing |

### 8.1b Multi-currency scenario (org currency vs. document currency) — confirmed on real completed documents

Per Jorge's instruction, this specific scenario (documented originally in ETP-4027/ETP-4029) was re-tested directly: create/open orders, quotations, and invoices with a currency different from the organization's own currency (here: org currency = `USD`, document currency = `EUR`), and inspect the summary preview panel on the right.

Confirmed on a completed **Purchase Order** (`Pedido de Compra 1000358`) and a completed **Sales Order** (`Pedido de Venta 1000359`), both opened from their list view (click a row → side preview drawer):

```
Total        $194,858.34  EUR      ← Purchase Order 1000358
             (1.14) 221,430.00 €

Total        $195,079.29  EUR      ← Sales Order 1000359
             (1.14) 221,681.08 €
```

This is `SummaryCard.jsx` (props `currencyCode` / `orgCurrencyCode`). Reading its source (`tools/app-shell/src/windows/custom/shared/preview-cards/SummaryCard.jsx`) directly — **correction to an earlier note in this doc**: the `EUR` badge next to the `$` amount is *not* a mislabeling bug. The component's own design comment states the intent explicitly:

> `// Dual-currency display (Holded-style): primary = org-currency amount + doc-currency badge   e.g. "261.81 €  [USD]" / secondary = (rate) doc-currency amount   e.g. "(1.1647) $304.92"`

i.e. the badge is deliberately the *document's* currency code — a "converted from" indicator next to the org-currency total, not a label claiming the `$` figure itself is in that currency. `badge={showOrgTotal ? currencyCode : null}` matches this documented intent exactly; it is working as designed, not a bug. (Whether that's the clearest possible UX — a `$` amount sitting directly next to an `EUR` badge reads ambiguously at a glance — is a separate, secondary product question, not a currency-formatting correctness defect, and is out of scope for ETP-4314.) The earlier claim in this document that this was a "distinct mislabeling bug" was wrong and is retracted here — always verify against source before asserting a bug from visual inspection alone (see §8.6 for the full source-level trace that prompted this correction).

What *is* confirmed as a real, in-scope issue: **the same locale/separator bug as everywhere else** — both `formatAmount()` calls in `SummaryCard.jsx` (line ~145, ~148) use English separators (`194,858.34`, `221,430.00`) instead of Spanish (`194.858,34`, `221.430,00`), because they go through the still-`en-US` `formatAmount.js`. Fixing that is squarely Phase 2/4 work.

The quotation confirm-dialog (`¿Enviar a evaluación?` modal, seen when confirming a `Presupuesto`) shows the same literal-code pattern for the single-currency case: `1.71 EUR`. Related-document chips (`Factura #10... 221,681.08 EUR`, `Pedido #1000363 2.23 EUR`) are consistently code-labeled across every document type tried (quotation, order, invoice).

**New required test case for §8.5**: after the fix, re-open a multi-currency Purchase Order/Sales Order/Invoice/Quotation preview and confirm (a) both amounts show Spanish separators, (b) both amounts show `€`/`$` symbols not codes, and (c) the top-line badge correctly identifies the org currency (`USD`), not the document currency.

**Follow-up check on a freshly created Sales Invoice** (2026-07-22, invoice `1000388`, created from scratch — not reusing pre-existing seed data): contact `Alimentos y Supermercados, S.A`, currency changed from the default `USD` to `EUR`, one line added (`Ale Beer`, tax `Exempt`). Totals panel while still in draft: `Subtotal sin descuento: 1.71 EUR`, `Subtotal: 1.71 EUR`, `Total: 1.71 EUR` — same literal-code bug, confirming this is not specific to old/legacy invoice `1000375` but reproduces on any new EUR invoice. Could not confirm this specific invoice to `Completado` status (blocked by an unrelated data-setup validation error — *"La organización del Tercero es diferente o no depende de la organización de la factura"* — a business-partner/org configuration issue in this local DB, not a currency-formatting bug; do not confuse the two when re-testing). The org-currency-conversion preview pattern for invoices specifically was already confirmed separately via the completed Purchase Invoice in §9.1 (`Total: $4,162.40 EUR` / `(1.16) 4,840.00 €`), so invoice coverage of the `SummaryCard.jsx` scenario is already established even though this particular new record couldn't be pushed to Completed.

### 8.2 Confirmed-correct surface — use as the reference / regression guard

| Window / View | URL | What was seen |
|---|---|---|
| **Cobro (Payment In) list + "Por método de pago" summary** | `/payment-in` | **Fully compliant with ETP-4314 today**: `+ 20,00 €`, `+ 1.108.087,75 €`, `+ 198.322,12 US$`, and in the side summary `26.107.202,55 US$`, `19.486.574,11 US$` — correct Spanish grouping (`.` thousands, `,` decimal), symbol after, even at large magnitudes. Re-confirmed on 2026-07-22 across a longer scroll (15+ additional rows: `221.681,08 €`, `899.417,20 €`, `1.010.548,44 €`, `404.136,00 US$`, `1.034.187,00 €`, `1.063.735,20 €`, etc.) — every single row correctly formatted, no exceptions found. |
| **Pago (Payment Out) list + "Por método de pago" summary** | `/payment-out` | Same component, same correct behavior overall (`– 285.480,00 US$`, `– 1.081.860,00 US$`, `– 216.892,50 €`, side summary `11.128.690,15 US$`) — **except one row**: `– 4840,00 €` (Servicios Inmobiliarios Los mejores, S.A.) is missing its thousands separator, while every other row around it has one. See note below — even the "reference" implementation is not 100% consistent. |

This is produced by `PaymentHeaderTableBase.jsx`'s own local `currencySymbol()` + `AMOUNT_FMT` (§3 row 6) — one of the files slated for removal in Phase 4. **This is the most important regression risk in the whole plan**: this view already looks exactly like the ticket wants, purely by accident of using a plain (non-`style:'currency'`) `Intl.NumberFormat('es-ES', ...)` call that never hit the `useGrouping` bug (§5) because it isn't a currency-style formatter. When Phase 4 migrates this file onto `formatCurrency()`, **take a screenshot of this exact view before and after** — if the after-screenshot doesn't match, Phase 1's `useGrouping: true` fix wasn't applied correctly.

**The one-off `4840,00 €` anomaly in Pago is itself worth root-causing, separately from the main Phase 1–4 work**: since every other row in the exact same list/component renders the same magnitude of number correctly (e.g. `216.892,50 €`), this isn't the systemic `useGrouping` bug — it suggests either a raw/unformatted value slipping through for that one payment record, or a second, different code path for a specific payment sub-case (e.g. a payment tied 1:1 to the `4,840.00 EUR` purchase invoice seen in §8.1, possibly rendering the linked-invoice amount directly instead of through `AMOUNT_FMT`). Flag for tracing alongside the §8.4 open question, don't assume it's covered by fixing `formatCurrency.js`'s locale.

### 8.2b Contacts — confirmed, symbol-correct but wrong locale (same as most §8.1 rows)

Contact detail page (`Alimentos y Supermercados, S.A`) financial widgets:
- Top KPI cards (`Balance Neto`, `Ingresos`, `Gastos`): `$0.00` in this dataset (no non-zero data in the local 3/6-month windows available) — symbol correct, can't confirm separator behavior without a non-zero value.
- `BPChartSVGContent` tooltip (hover over the "Ventas y compras" chart): `$180,300.03` — dollar symbol correct (matches org currency USD), but English separators, consistent with every other `en-US`-locale consumer in §8.1.

No literal-code bug found in Contacts specifically, but the locale bug is present, same as everywhere else.

### 8.2c Ruled out — not a currency-display surface

`Plan de cuentas` (chart of accounts) and its hierarchy view show only account codes/names/types, no monetary amounts — not a consumer of any currency formatter, no action needed here.

### 8.3 Not yet visually checked — include in the post-fix pass regardless

Checked and closed out in later passes (2026-07-22): **Presupuesto** (§8.1b), **Pago/Payment Out** (§8.2), **Contacts** (§8.2b), **Product list** (§8.7 — corrected from a wrong "backend" guess to a confirmed frontend bug), **Albarán/goods-shipment** (below), **Warehouse** (below).

- **Albarán** (delivery note, `goods-shipment`) — checked both list (`/goods-shipment`, e.g. record `1000378`) and detail/edit view. **No monetary totals panel exists here at all** — delivery notes only track quantities (`Cant. movida`/`Cant. pedido`), so `GoodsShipmentBottomPanel`'s delegation to `LinesBottomSection` renders no totals section (its internal `grandTotal != null` guards hide it). The only currency display found is the related-documents chips (`Pedido #1000359 221,681.08 EUR`, `Factura #1000366 221,681.08 EUR`) — same already-known bug, same fix (Phase 2, `related-documents` helpers). No separate work item needed for Albarán specifically beyond what's already planned.
- **Warehouse** — source-traced (`WarehouseSummary.jsx:4,32`: `import { formatCurrency } from '@/lib/formatCurrency'` → `formatCurrency(currencyCode, totalValuation)`) **and visually confirmed** (`Almacén → España Región Sur` detail: `Valoración total: $980,797.05` — symbol correct, no code, matches source exactly). **Already wired to the canonical function — zero rewiring needed**, same as `BPChartSVGContent.jsx`. Will auto-fix on Phase 1.
- **Amortization** (`AmortizationLinesTable.jsx:6-7`, `AssetsAmortizationPanel.jsx:6-7`) — source-traced only (not re-opened in browser this pass, but the exact same `import { formatCurrency } from '@/lib/formatCurrency'` + direct call pattern as Warehouse and BPChartSVGContent was found in both files). **Already wired — zero rewiring needed**, same category as Warehouse.
- **Fiscal models 303/349** (`fiscalModelsUtils.js:196-198`, `FmOverlays.jsx:674`) — source-traced: both hardcode `Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })` directly, **without the explicit `useGrouping: true`** — a live third/fourth instance of the exact §5 bug (any VAT base/total ≥ 1000€ in a 303/349 declaration would silently lose its thousands separator today). Hardcoding `EUR` here is *not* a bug — Spanish tax declarations are EUR by law — but the missing `useGrouping` is real and untested visually (no fiscal-model test data available locally this pass).

  **RESOLVED (2026-07-27)**: initially left out of scope pending a regulatory conversation (documented in ETP-4314 comment 142249) — sign-off received and the fix is now included in this same task. Confirmed live in the local dev environment (test invoice + Modelo 303/T2 declaration): casilla 07 showed `6162,60 €` instead of `6.162,60 €` before the fix. Fixed by delegating `fiscalModelsUtils.js#formatAmount` and `FmOverlays.jsx`'s `CompareDrawer` to the canonical `formatCurrency()`. A **third occurrence** was also found and fixed during this pass: `models/349/use349Pdf.js`'s Handlebars `fmtAmount` helper (used for the Modelo 349 PDF export) had the same missing-`useGrouping` bug in its own inline `Intl.NumberFormat` call — fixed in place (can't delegate to `formatCurrency()` there, since it's a plain-number formatter with the `€` already static in the PDF template, not a currency-symbol formatter).

Traced (source-level, file:line) in a follow-up pass: **NewPaymentEntryModal** / **InvoicePaymentHistoryModal** — see §8.6's two new rows. Found to have TWO independent code paths each: JSX amounts via `<MoneyAmount>` (17 spots total, auto-fixes on Phase 1) and separate plain-text helpers for toasts/confirm-dialogs (`fmtCur`/`currencySymbol`/`formatPlain` in one, `fmtAmount` in the other — neither auto-fixes, both need explicit Phase 4 rewiring, and `InvoicePaymentHistoryModal`'s `fmtAmount` has the live `useGrouping` bug). Not yet visually re-confirmed in the browser (would need an actual payment-in-progress flow), but the source trace is complete and actionable without that.

Still genuinely blocked — no test data available in this local DB, not a code-tracing gap:
- **Reconciliation** panels (`ReconciliationSplitPanel`, `AutoMatchSuggestionModal`, `ReconciledTxnsModal`) — needs an account with real movements/pending items, not available in this local DB run.
- ~~**Financial account** statements/movements — needs an account with real balances~~ **UNBLOCKED, see §8.8** — a test account was created directly to get real data instead of leaving this untested.
- ~~**Statements/Reconciliation** (`ManualStatementModal`, `AutoMatchSuggestionModal`)~~ **UNBLOCKED, see §8.9** — reproduced a real auto-match case and found a clean, high-value bug (`formatSignedAmount` hardcoded `€`).
- **`ReconciliationSplitPanel`, `ReconciledTxnsModal`, `FundsTransferModal`, `StatementLinesTable`** (post-match detail views) — one step further than §8.9 reached (would need to actually confirm/apply the match and then inspect the resulting reconciled/split views) — still genuinely not reached this pass, but the reproducible setup in §8.9 is the starting point for whoever continues.
- **Reports/PDFs** (aging receivable/payable, balance sheet, trial balance, general ledger, tax report, print-sales-order/invoice/quotation, print-purchase-order, print-payment-in, print-goods-shipment, profit-loss) — these render server-side/Handlebars via `formatCurrency` in `artifacts/*/helpers.js` and `template.hbs`; check at least one representative PDF per document family.

### 8.4 Open technical question — RESOLVED

**Answer**: the Sales Invoice/Quotation/Order totals panel does NOT go through `formatAmount.js` at all in practice, despite §3's original static map assuming `DetailView.jsx` → `DocumentTotalsPanel` applies uniformly. The actual chain is:

`decisions.json` (`customComponents.bottomSection`) → a window-specific bottom-panel artifact (`InvoiceBottomPanel.jsx`, `PurchaseInvoiceBottomPanel.jsx`, `OrderBottomPanel.jsx`, `PurchaseOrderBottomPanel.jsx`, `QuotationBottomPanel.jsx`, ...) → all of which delegate to the shared `tools/app-shell/src/components/contract-ui/LinesBottomSection.jsx` → which defines its **own local formatter**, not imported from anywhere:

```js
// LinesBottomSection.jsx, line 5
function fmt(val, curr) {
  const n = typeof val === 'string' ? parseFloat(val) : (val ?? 0);
  const s = n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return curr ? `${s} ${curr}` : s;
}
```

This is plain string concatenation — `${number} ${currencyCode}` — no `Intl.NumberFormat({style:'currency'})`, no symbol lookup at all. **This is THE single highest-impact fix location in this entire plan.** `grep -l "LinesBottomSection" artifacts/*/custom/*.jsx` confirms it is reused by **12 window bottom-panels**: `goods-receipt`, `goods-movements`, `internal-consumption`, `goods-shipment` (the delivery-note window named in the ticket), `physical-inventory`, `purchase-invoice`, `return-to-vendor-shipment`, `purchase-order`, `return-material-receipt`, `sales-invoice`, `sales-quotation`, `sales-order`. Every one of those windows' document-totals panel is driving its literal-code display straight from this one function — fixing it here fixes the ticket's core named scope in a single place.

**Required change**: replace `LinesBottomSection.jsx`'s local `fmt()` with a call to the (post-Phase-1-fixed) `formatCurrency()`. This must be called out as its own explicit step in Phase 2 — the original plan's §6 wording ("migrate `formatAmount.js`'s call sites... most importantly `DetailView.jsx`'s `DocumentTotalsPanel`") undersold this: `DetailView.jsx`'s direct `DocumentTotalsPanel` wiring is the path for windows *without* a custom `bottomSection` override, which is a smaller set than assumed — most of the ticket's named document types bypass it entirely via `LinesBottomSection`.

### 8.5 Test execution checklist (for whoever closes the ticket)

For every row in §8.1 and §8.3, after the fix:
- [ ] Symbol only shown (`€`), never the literal code, for the org's own currency.
- [ ] Spanish separators: period for thousands, comma for decimals — specifically re-check every value that was ≥ 1,000 in the "before" evidence above (Assets: `4,000,000.00`; Purchase Order: `1,309,050.60`; Sales Order: `198,322.12`) since that's exactly where the `useGrouping` regression (§5) would resurface.
- [ ] Multi-currency rows (USD, seen in Purchase/Sales Order and Invoice lists) still show correctly as `1.234,56 $` or `1.234,56 US$` (whichever the team confirms) — not broken by the EUR-focused fix.
- [ ] Negative amounts (tax/discount rows, refunds) keep the `-` sign in the right place.
- [ ] Zero-amount edge case (seen in several draft orders: `0.00 €`) still renders without errors.
- [ ] Dashboard compact notation (`{ compact: true }` consumers) reviewed for the new Spanish wording (§5, §8.1) — confirm accepted, not just "still renders."
- [ ] Automated regression test added specifically for the `useGrouping` gotcha (an amount ≥ 1000 through `formatCurrency()` — this is the failure mode most likely to look fine in a quick manual glance and only show up on real invoice totals).

### 8.6 Source-level wiring trace — what's actually behind every screen (2026-07-22)

Per Jorge's instruction: a visually-correct screen is not proof it uses the right utility. Every surface tested in §8.1/§8.2 was traced to its actual source file and current formatter call, not assumed from the original §3 map. This table is the concrete "what needs to be cabled to `formatCurrency.js`" reference:

| Surface | File : line | Current call | Verdict |
|---|---|---|---|
| Sales/Purchase Invoice, Sales/Purchase Order, Sales Quotation, Goods Shipment/Receipt, Goods Movements, Internal Consumption, Physical Inventory, Return-to-Vendor/Return-Material-Receipt — **document totals panel** | `tools/app-shell/src/components/contract-ui/LinesBottomSection.jsx:5` (`fmt()`) | Local string concat, no Intl at all | **REWIRE — highest priority** (§8.4). Root cause of the ticket's core complaint across 12 windows. |
| Order/Invoice/Quotation **list views** — "Imp. total" / "Pendiente de pago" amount columns | `tools/app-shell/src/components/contract-ui/DataTable.cellRenderers.jsx:211` (`renderAmountCell`) | `formatAmount()` from `lib/formatAmount.js` | **REWIRE** (Phase 2) — already the "right kind" of formatter, just wrong locale. Confirmed this is what powers Purchase/Sales Order and Invoice list views, and Assets list (same `amount`-typed column mechanism). |
| **Product list** price columns ("Venta"/"Compra") — the one surface with *no* thousands separator at all | `tools/app-shell/src/windows/custom/product/ProductListCells.jsx:109` (`PriceText`) | **`{value.toFixed(2)} €`** — plain `toFixed`, no Intl, no thousands separator logic of any kind, and the `€` is a **hardcoded literal string**, not derived from the price's actual currency | **REWIRE — and a real correctness bug, not just formatting** (§8.7). Corrects an earlier wrong note in this document that guessed this was backend-formatted; it is not — verified in frontend source. |
| Order/Invoice/Quotation **preview drawer** ("Total" + org-currency line) | `tools/app-shell/src/windows/custom/shared/preview-cards/SummaryCard.jsx:145-148` | `formatAmount()` | **REWIRE** (Phase 2). The `EUR`/`USD` badge next to it is intentional design, not a bug — see corrected §8.1b. |
| **Dashboard** KPI cards, "Clientes destacados", "Cobros y pagos" | `tools/app-shell/src/lib/dashboardNumberFormat.js` (`formatDashboardAmount`) | Local `${currencyCode} ${amount}` string build | **REWIRE** (Phase 3) — the one place matching the ticket's literal "shows code" description exactly. |
| **Contacts** chart tooltip ("Ventas y compras") | `tools/app-shell/src/windows/custom/contacts/BPChartSVGContent.jsx:132,137` | `formatCurrency()` — **already wired to the canonical function** | **NO ACTION NEEDED.** This is the one visually-correct-looking surface confirmed to *already* call the file we're about to fix — it will pick up the Spanish-locale fix automatically the moment Phase 1 lands, with zero migration work. Proof that "cableado" to `formatCurrency.js` is exactly the end-state every other row above needs to reach. |
| **Cobro/Pago (Payment In/Out)** list + "Por método de pago" summary | `tools/app-shell/src/windows/custom/shared/PaymentHeaderTableBase.jsx:52-68` (`currencySymbol()` + `AMOUNT_FMT`) | Local, `es-ES`, plain (non-`style:'currency'`) `Intl.NumberFormat` | **REWIRE** (Phase 4) — correct output today, purely by accident of not being currency-style (§8.2 regression warning applies). `PaymentHeaderTable.jsx` (the artifact-specific file per window) is confirmed to be a thin 2-line wrapper around this shared file, not a separate implementation — no extra tracing needed there. |
| Payment detail sidebar summary card | `artifacts/payment-in/custom/PaymentSummaryCard.jsx:10` (`fmtAmount()`) | Local, `style:'currency'`, **no explicit `useGrouping`** | **REWIRE** (Phase 4) — newly found in this pass (§3 row 13), a live second instance of the exact §5 bug, not yet visually confirmed with a ≥1000 value but present in source. |
| "Aplicar a facturas" modal (Payment In) | `artifacts/payment-in/custom/ApplyToInvoices.jsx:11` (`formatAmount()` — name collides with the shared lib function) | Local, hardcoded `CURRENCY_SYMBOLS` map, symbol **before** amount | **REWIRE** (Phase 4) — newly found (§3 row 14); also the only surface found with symbol-before placement, the opposite of what the ticket wants. |
| **Warehouse** valuation ("Valoración total") | `tools/app-shell/src/windows/custom/warehouse/WarehouseSummary.jsx:4,32` | `formatCurrency()` — **already wired**; visually confirmed (`$980,797.05`, symbol correct, no code) | **NO ACTION NEEDED** — same category as Contacts chart tooltip. Auto-fixes on Phase 1. |
| **Amortization** lines/panel amounts | `tools/app-shell/src/windows/custom/amortization/AmortizationLinesTable.jsx:6-7`, `.../assets/AssetsAmortizationPanel.jsx:6-7` | `formatCurrency()` — **already wired** (source-confirmed, not re-opened visually this pass) | **NO ACTION NEEDED** — same category. Auto-fixes on Phase 1. |
| **Fiscal models 303/349** | `tools/app-shell/src/windows/custom/fiscal-models/fiscalModelsUtils.js:196-198` (`formatAmount`), `FmOverlays.jsx:674` | Hardcoded `Intl.NumberFormat('es-ES', { style:'currency', currency:'EUR' })`, **no explicit `useGrouping`** | **REWIRE** (Phase 4) — hardcoded EUR is correct business logic here (Spanish tax law), but the missing `useGrouping` is a live §5 bug instance; not yet visually confirmed with a ≥1000 value (no local test data). |
| **Albarán / goods-shipment** — delivery-note detail | `GoodsShipmentBottomPanel.jsx` delegates to `LinesBottomSection.jsx` | No totals rendered at all — delivery notes carry no `grandTotal`, so `DocumentTotalsPanel`'s render guards hide the section entirely | **NO ACTION NEEDED beyond Phase 2's `LinesBottomSection` fix** — visually confirmed (record `1000378`): only quantities shown, no monetary total exists on this window. Its related-document chips carry the already-known code bug, fixed by the `related-documents` migration already in Phase 2. |
| Financial account **movements list** | `windows/custom/financial-account/MovementsTable.jsx:17` | `MoneyAmount` — **already wired** | **NO ACTION NEEDED** — same category as Warehouse/Amortization/Contacts. Visually confirmed on the USD test account (§8.8). |
| Financial account **new-movement amount input** | `components/forms/fields.jsx:140` (`AmountInput`) | Hardcoded `€` span, no `currency` prop exists on the component | **REWIRE — currency-correctness bug** (Phase 4, §8.8). Visually confirmed showing `€` on a USD account. |
| Bank reconciliation **auto-match suggestion** — statement-line column | `components/contract-ui/AutoMatchSuggestionModal.jsx:101-106` (`StatementContent`) | `MoneyAmount` — **already wired** | **NO ACTION NEEDED** — auto-fixes on Phase 1. Visually confirmed (`+$500.00` on the USD test account). |
| Bank reconciliation **auto-match suggestion** — system-operation column | `components/contract-ui/AutoMatchSuggestionModal.jsx:43-46` (`formatSignedAmount()`) | Hand-rolled Spanish-shaped number, hardcoded literal `€`, no currency parameter | **REWIRE — currency-correctness bug** (Phase 4, §8.9). The clearest side-by-side proof in this document: same dialog, same account, one column right ($) one column wrong (€). |
| **New Payment modal / Invoice Payment History** — JSX amount displays (13 + 4 `<MoneyAmount>` usages respectively — available balance, used, pending, applied, credit, delta, row/total/pending amounts) | `NewPaymentEntryModal.jsx` (lines 397, 429, 560, 1150, 1230, 1251, 1253, 1256, 1259, 1261), `InvoicePaymentHistoryModal.jsx` (lines 317, 530, 538, 544) | All render via `<MoneyAmount>` (#5) | **NO ACTION NEEDED beyond fixing `MoneyAmount`'s upstream `formatCurrency()`** — since ETP-4504 already made `MoneyAmount` delegate to `formatCurrency()`, every one of these 17 JSX spots inherits the Phase 1 locale fix automatically. This is by far the single biggest "auto-fix" surface found — bigger than Warehouse/Amortization/Contacts combined. |
| Same two modals — **plain-text spots** (toasts, confirm dialogs, `ui()`-interpolated strings, not JSX) | `NewPaymentEntryModal.jsx:124-139` (`currencySymbol`/`curSuffix`/`fmtCur`, composed with `usePaymentBalance.js`'s `formatPlain`/`groupThousands`), `InvoicePaymentHistoryModal.jsx:19-24` (`fmtAmount`) | Hand-rolled `en-US` number grouping (`formatPlain`) + correct Intl-derived symbol lookup, in one file; plain `Intl.NumberFormat('es-ES', {style:'currency',...})` with no explicit `useGrouping` in the other | **REWIRE both** (Phase 4) — distinct from the JSX paths above, these do NOT go through `MoneyAmount`/`formatCurrency` at all today and won't benefit from Phase 1 without explicit migration. `InvoicePaymentHistoryModal.jsx`'s `fmtAmount` is another live §5 bug instance. |
| New Payment modal (Payment In) | `artifacts/payment-in/custom/NewPaymentModal.jsx:16` (`fmt()`) | Local, `style:'currency'`, no explicit `useGrouping` | **REWIRE** (Phase 4) — newly found (§3 row 15), another live `useGrouping`-bug candidate. |

**Net takeaway for the "cableado" question**: of everything traced, only `BPChartSVGContent.jsx` is already pointed at `formatCurrency.js`. Every other surface — including the ones that already *look* correct today (Cobro/Pago lists) — is calling a different, local, or duplicated implementation, and will keep doing so after Phase 1 fixes `formatCurrency.js`'s locale unless it is explicitly rewired in Phases 2–4. "Looks right today" and "wired to the canonical function" are two independent facts; this table is what separates them per surface.

### 8.7 Product list — correction: it IS a frontend bug, and it's worse than formatting

An earlier version of this document guessed the Product list's missing thousands separator (`"4000.00 €"`) was pre-formatted server-side, based on `contract.json` typing these columns `"price"` (unmapped in `DataTable.cellRenderers.jsx`) and reasoning no frontend formatting could be happening. **That guess was wrong and has been corrected** — investigated further per Jorge's request rather than left as an assumption.

The Product list's "Venta"/"Compra" columns are not driven by the generic `DataTable` amount/price cell machinery at all. They're a fully custom, product-specific cell: `tools/app-shell/src/windows/custom/product/ProductListCells.jsx`. Trace:

1. `useProductPrices(productId, ...)` (line ~76) fetches `/price?parentId=<id>` for the product and calls `selectPriceRow()` to pick the applicable sale/purchase price row per the pricing engine's rules (default price list, valid-from date, etc.) — this part is correct and unrelated to formatting.
2. It extracts only `Number(row.standardPrice)` from the chosen row (line ~93) — **the row's own currency is read and then discarded**, never passed forward.
3. `PriceText` (line 109) renders the value as:
   ```jsx
   {value.toFixed(2)} €
   ```
   Plain `toFixed(2)` (no thousands separator, ever — that's `Number.prototype`, not `Intl`), followed by a **hardcoded literal `€`**.

Two distinct problems, and the second is more serious than anything else found in this whole investigation:

1. **No Intl formatting at all** — explains the missing thousands separator exactly as observed (`4000.00` instead of `4.000,00`).
2. **The `€` is wrong whenever the price list isn't Euro-denominated.** This local dataset happens to have its product prices in EUR, so the hardcoded symbol looked plausible — but this is a **currency-correctness bug, not a display-consistency one**: if a product's default sales or purchase price list is in USD (or any non-EUR currency), this cell would still show a `€` symbol next to a dollar-denominated number, silently mislabeling the actual currency. This wasn't visible in this local test pass only because the sample data's default price lists happen to be EUR.

**Fix requires two changes, not one**: (a) `useProductPrices` must also capture and return each side's currency code from the price row (likely `priceListVersion$c_currency_id$_identifier` or similar — confirm the exact field on the `/price` response), and (b) `PriceText` must call `formatCurrency(currencyCode, value)` instead of `${value.toFixed(2)} €`. Fixing only the formatting (swapping in `formatCurrency` but keeping the hardcoded `'EUR'`) would still leave the mislabeling bug in place for non-EUR products — don't treat this as a drop-in Phase 4 rewire without also wiring through the real currency.

### 8.8 Financial Account — unblocked by creating real test data (2026-07-22)

Rather than leave this cluster untested for lack of local data, a real test account was created directly: **Finanzas → Cuentas → Nueva cuenta → Caja "Caja ETP-4314 Test", currency USD** (deliberately non-EUR, to catch currency-mislabeling bugs a EUR-only test can't). One manual movement was then added (`Nuevo movimiento`, concept "Company Capital", amount typed as `12500.75`).

**New bug found, confirmed both visually and in source**: the amount input field in the "Nuevo movimiento" modal showed a placeholder/suffix of **`€`** the entire time, despite the modal's own subtitle reading "Caja ETP-4314 Test · **USD**" directly above it. Traced to `tools/app-shell/src/components/forms/fields.jsx:140` — the shared `AmountInput` component:

```jsx
<span className="...">€</span>
```

hardcoded, with **no `currency` prop in the component's signature at all** (`{ label, required, value, onChange, onBlur, placeholder, readOnly, className, name }`). `grep` confirms 4 consumers, all similarly affected: `NewTransactionModal.jsx` and `NewMovementWizard/index.jsx` (financial account movements — both visually reachable, this one visually confirmed), `PaymentForm.jsx`, `ReversedInvoicesPanel.jsx` (sales-invoice rectifications). Added as implementation #20 in §3/§8.6.

**Separate, adjacent observation — not in scope for ETP-4314, flag to the team anyway**: the amount I typed, `12500.75`, was saved and displayed back as **`-$1,250,075.00`** — the decimal point appears to have been dropped/misparsed during input handling (`12500.75` → `1250075` → formatted with 2 forced decimals), not a display-formatting issue. This is an **input-parsing bug**, independent of everything else in this document (which is about *display* formatting) — worth its own bug report, but do not fold it into the ETP-4314 fix; noting it here only so it isn't lost.

**Movement list/summary after saving** — confirmed already-wired, matches the pattern already found for Warehouse/Amortization: `Saldo total: -$1,250,075.00`, `Salidas (30D): -$1,250,075.00`, table row `Importe: -$1,250,075.00` / `Saldo: -$1,250,075.00` — dollar symbol correct (matches the USD test account), English separators (expected pre-Phase-1), no literal code anywhere. Source-traced: `MovementsTable.jsx:17` imports and uses `MoneyAmount` (#5) — **already wired, auto-fixes on Phase 1**, same category as Warehouse/Amortization/Contacts.

### 8.9 Bank reconciliation — unblocked, reproducible case, and the cleanest bug found in this whole investigation

The reconciliation cluster was blocked earlier this session for lack of local data. Per Jorge's suggestion, the component's own unit tests (`useReconciliation.vitest.jsx`, `ManualStatementModal.vitest.jsx`) were read first — not to run them, but to learn the real data shape needed: a bank-reconciliation account matches **pending statement lines** against **pending system movements** by amount/date, exposed via a dedicated `/sws/neo/bank-reconciliation` endpoint (`pendingLines`, `candidateOperations`, `autoMatch`, `applySuggestions` actions). That told us exactly what to create by hand instead of guessing.

**Reproducible steps** (same USD test account from §8.8, `Caja ETP-4314 Test`):
1. `Movimientos → Nuevo movimiento`: type `Entrada`, concept `Funds transfer`, amount `500` (a clean whole number — the earlier `12500.75` movement in §8.8 hit the unrelated decimal-parsing bug, so a whole number sidesteps that while still testing display).
2. `Extractos importados → (dropdown next to "Importar extracto") → Nuevo extracto`: name it, one line dated the same day, description "Ingreso test", reference "REF-001", `Entrada = 500`.
3. Save. The account's **Conciliación** tab immediately opens (or can be opened manually) to **"Conciliación automática sugerida"** — the `AutoMatchSuggestionModal` — showing the $500 statement line matched against the $500 movement.

**The bug, visually confirmed inside a single dialog, same account, same currency context:**
```
Línea del extracto bancario          Operaciones del sistema
Ingreso test · REF-001 · 21/07/2026  —
                            +$500.00                    +500,00 €    · 22/07/2026
```
Left column: `+$500.00` (dollar sign, English decimal). Right column: `+500,00 €` (**euro sign**, Spanish decimal) — for the exact same USD account, in the exact same dialog, at the exact same moment. Traced to source (§3 row 21, §8.6): the left (`StatementContent`) correctly calls `<MoneyAmount currency={currency || 'EUR'} .../>` with the real currency threaded through — auto-fixes on Phase 1, same as everywhere else `MoneyAmount` is used correctly. The right (`OperationRow`) calls a local `formatSignedAmount(amount)` (line 43-46) that **takes no currency argument at all** and hardcodes `` `${sign}${...} €` `` unconditionally — it will show `€` even when displaying a JPY, GBP, or USD account's own operations forever, until fixed.

This is arguably the single cleanest demonstration in the whole document of why "cableado" matters: two adjacent UI elements in the identical context, one wired correctly and one not, diverge visibly. Recommend using this exact dialog as the go/no-go visual check once Phase 2/4 land — reproduce the steps above again and confirm both columns match.

### 8.10 Applying the match and the reconciled view — root cause found, and it's not a formatter bug at all

Continuing §8.9: the suggested match was applied ("Conciliar 1 grupo(s)" → toast "1 grupo(s) conciliados correctamente"), then the account's Conciliación tab was switched to the "Conciliadas" filter to inspect the now-reconciled transaction.

**Observed** — on the same USD test account, same $500 transaction, two more currency displays, both wrong and inconsistent with each other:
```
Row:          500.00 €     (period decimal — en-US shape)
Footer total: +500,00 €    (comma decimal — es-ES shape)
```

Traced to `components/contract-ui/ReconciliationSplitPanel.jsx`. This component uses **two different formatters for the row vs. the footer** — `MoneyAmount` (line 220-225, → `formatCurrency()`, en-US) for the row, and `formatSigned()` from `lib/formatSigned.js` (line 353, native es-ES Intl) for the footer total and the selected-sum/remaining lines (512, 517) — which is why row and footer disagree on decimal style even before touching the `€`-vs-real-currency question.

**But the actual root cause of the wrong `€` symbol is not a formatting bug at all** — it's a one-line prop-name mismatch, upstream of any formatter:

- `ReconciliationSplitPanel({ accountId, currency = 'EUR', ... })` (line 605) — the component's `currency` prop **defaults to `'EUR'`** if not supplied.
- Its caller, `ReconciliationTab.jsx` (line 19), passes `currency={account?.currency}`.
- **`account.currency` does not exist on the account object.** The real field is `currencyIso` — confirmed by the sibling call two lines away in `financial-account/index.jsx:325`, which correctly reads `account?.currencyIso ?? 'EUR'` for the `AutoMatchSuggestionModal`.
- So `account?.currency` always evaluates to `undefined`, `ReconciliationSplitPanel`'s default parameter silently substitutes `'EUR'`, and **every downstream formatter in the entire reconciliation split panel — both the correctly-wired `MoneyAmount` and the separate `formatSigned` — receives the wrong currency**, for every single account regardless of its real currency.

**This must be fixed as its own one-line change** (`currency={account?.currency}` → `currency={account?.currencyIso}` in `ReconciliationTab.jsx:19`), separate from and prior to any `formatCurrency.js` centralization work — centralizing the formatter does nothing to fix a caller passing the wrong data into it. Once fixed, the row (via `MoneyAmount`) auto-corrects on Phase 1; the footer/selected-sum/remaining (via `formatSigned`) still need Phase 5's planned reconciliation of `formatSigned.js` to fully align formatting, but at least the currency itself would stop being silently wrong.

Add to Phase 4/5 task list: **fix the `account.currency` → `account.currencyIso` prop mismatch in `ReconciliationTab.jsx`** — arguably higher priority than any pure-formatting fix in this document, since it silently mislabels currency for every non-EUR account in a financial reconciliation context.

**Confirmed the bug is panel-wide, not row-only**: selecting the reconciled transaction opens the split panel's right-hand "matched operation" side, which shows `Saldo pendiente: 500.00 €` and `Importe: 500.00 €` — same wrong `€`, same root cause (the single `currency` prop feeding the whole panel). Fixing the one-line prop mismatch fixes every currency display in this component at once, independent of and prior to any `formatCurrency.js` migration work.

## 9. Scope check against ETP-4314's literal ask (2026-07-22)

The investigation (§3, §8) surfaced 22 distinct implementations/bugs across the app. Re-reading the ticket's own **"Alcance"** section against every finding, most of what was found is **outside what ETP-4314 actually asks for**. This section separates the two so the conversation with the functional analyst about extending scope starts from a precise list, not a vague "we found a lot more."

### 9.1 The ticket's literal scope

> **Alcance:**
> - Pedidos de venta y compra
> - Facturas de venta y compra
> - Albaranes de venta y compra
> - Presupuestos de venta
> - Cualquier otro documento que muestre importes monetarios

The operative phrase is **"documento"** — a sales/purchase transactional document (order, invoice, delivery note, quotation) and its own summary/totals. The catch-all ("cualquier otro documento") extends this to other *documents*, not to every screen in the app that happens to render a currency value — dashboards, master data (products), and financial/analytics tooling (payments, reconciliation, warehouse valuation, contact analytics, fiscal declarations) are not "documentos" in that sense.

### 9.2 In scope — directly what the ticket asks for

| Finding | Why it's in scope |
|---|---|
| **`LinesBottomSection.jsx`'s `fmt()`** (§8.4) — the 12-window document-totals root cause | This *is* "los totales de documentos" the ticket names verbatim: sales/purchase order, sales/purchase invoice, sales quotation, goods-shipment (albarán), plus 6 more document types under the same "cualquier otro documento" umbrella |
| **`formatAmount.js` via `DataTable`** — order/invoice **list view** amount columns | List rows are the document's own summary figure ("Imp. total") |
| **`SummaryCard.jsx`** — order/invoice/quotation **preview drawer** ("Total" + org-currency line) | Literally a "resumen" of the document, the word used in the ticket title |
| **Related-document chips** (`Pedido #1000363 2.23 EUR`, `Factura #1000366 221,681.08 EUR`) | Shown *inside* an in-scope document's own page |
| **Quotation confirm-dialog** (`¿Enviar a evaluación?`, `1.71 EUR`) | Part of confirming a quotation — an in-scope document action |
| **Invoice overdue badge** (`Vencido · EUR 2.23`) | Shown on the invoice's own page |
| **`ProductListCells.jsx`'s hardcoded `€`** (§8.7) | Borderline — see §9.4 |

Fixing these is Phases 1–2 of §6, plus the related-documents/badge call sites. This alone resolves everything the ticket's acceptance criteria (§7) describe.

### 9.3 Auto-benefits from the Phase 1 fix, but not requested by the ticket

These windows are **not** sales/purchase documents — they're master data, dashboards, or operational tooling — but because they already call `formatCurrency()`/`MoneyAmount` directly (§8.6), they will change appearance the moment Phase 1 lands, with zero extra migration work:

- **Warehouse** valuation (`WarehouseSummary.jsx`)
- **Amortization** (`AmortizationLinesTable.jsx`, `AssetsAmortizationPanel.jsx`)
- **Contacts** chart tooltip (`BPChartSVGContent.jsx`)
- **Financial account movements list** (`MovementsTable.jsx`)
- **New Payment / Invoice Payment History modals'** JSX amounts (17 `<MoneyAmount>` spots)
- **Reconciliation auto-match's statement-line column** (`StatementContent`)

Worth flagging to the analyst as a side effect, not a deliverable: nobody asked for Warehouse or the Contacts chart to change, but they will, automatically, as a consequence of fixing the shared function. Not a risk, but worth saying out loud so it isn't a surprise in a demo.

### 9.4 Out of scope — found during the investigation, requires an explicit scope-extension decision

None of these are "pedidos, facturas, albaranes, presupuestos." Every one of them is a real, reproducible bug — but fixing them means touching files and windows the ticket never named:

| Finding | Where | Why it's out of scope |
|---|---|---|
| **`formatDashboardAmount`** — literal `EUR` code | Dashboard (`Inicio`) KPI cards | Dashboard is an aggregated BI view across many documents, not a document itself |
| **`ProductListCells.jsx`** hardcoded `€` (currency-correctness bug) | Product list "Venta"/"Compra" | Product master-data pricing, not a transactional document. (Borderline: it's adjacent to the "importes monetarios" language, but products aren't in the enumerated list — flag this one specifically to the analyst, it reads closest to in-scope of everything in this table) |
| **`PaymentSummaryCard.jsx`, `ApplyToInvoices.jsx`, `NewPaymentModal.jsx`** | Payment In (Cobro) modals | Payments aren't in the enumerated document list |
| **`NewPaymentEntryModal.jsx` / `InvoicePaymentHistoryModal.jsx`** plain-text helpers | Payment/collection modals | Same — payments not enumerated |
| **`AmountInput`** hardcoded `€` | Financial account movements, `PaymentForm.jsx` | Financial-account tooling, not a sales/purchase document (its 4th consumer, `ReversedInvoicesPanel.jsx` on sales-invoice, *is* arguably in-scope — flag separately) |
| **`AutoMatchSuggestionModal.jsx`'s `formatSignedAmount()`** | Bank reconciliation | Reconciliation tooling, not a document |
| **`ReconciliationSplitPanel.jsx` + the `account.currency`/`currencyIso` prop bug** | Bank reconciliation | Same — and not even a currency-formatting bug, a data bug |
| **Fiscal models 303/349** missing `useGrouping` | Tax declaration forms | Regulatory tax forms, not sales/purchase documents |
| **`PaymentHeaderTableBase.jsx`** (Cobro/Pago lists) | Payment In/Out | Payments not enumerated (already correct today regardless — see §8.2) |

### 9.5 Recommendation for the conversation with the functional analyst

- **Propose landing Phases 1–2 (§6) as ETP-4314's actual delivery** — this fully satisfies the ticket's stated scope and acceptance criteria (§7), including the "why does the total show EUR" complaint that prompted the ticket.
- **Present §9.3 as an FYI, not a decision point** — it happens automatically, no separate approval needed, just awareness.
- **Present §9.4 as a menu of separate, optional follow-up tickets** — each already has a root cause, a reproducible case, and a source-level fix identified in this document, so scoping them in later costs re-discovery time zero. Suggest splitting by area (Dashboard, Payments, Bank Reconciliation, Fiscal Models, Product list) rather than one giant "also fix everything else" ticket, since they're unrelated feature areas that happen to share the same root-cause file.
- **Two items deserve explicit escalation regardless of scope decision**, since they're not cosmetic: the `ReconciliationSplitPanel` currency **data** bug (§8.10 — wrong currency shown, not just wrong format) and `ProductListCells.jsx`'s hardcoded `€` (§8.7 — same class of bug, would mislabel a non-EUR product's price). Both are "the app shows the wrong currency," which is a different severity than "the app shows the right currency inconsistently" — worth a heads-up to the analyst even if she decides not to fix them under this ticket.

## 10. Open questions before implementation starts

1. Is the Spanish-words compact notation (`"13 mil €"`) acceptable for dashboard KPI cards, or should compact notation force a numeric-only style regardless of locale? (Moot for Tier A itself — Dashboard is Tier C — but affects what Phase 1's regression tests should assert about `compact` mode generally.)
2. When the functional analyst reviews §9's Tier C list — which items (if any) get authorized to extend into this same ticket vs. spun off as separate tickets? Two items were flagged for urgency regardless of the decision (§9.5): the `ReconciliationSplitPanel` currency prop bug and `ProductListCells.jsx`'s hardcoded `€`.
3. Any other locale beyond `es-ES` to support now (e.g. `es-AR` for Argentina-based tenants), or is single-locale `es-ES` acceptable per the ticket's explicit ask, deferring multi-locale to a future ticket (mirroring how ETP-3726 deferred locale-awareness to this one)?

## 11. Jira comment logged (2026-07-22)

Posted to [ETP-4314](https://etendoproject.atlassian.net/browse/ETP-4314) (comment id `142177`) announcing the start of Tier A work, the Tier B bonus fixes, and the Tier C items pending the functional analyst's scope-extension decision. Full text mirrors §9's breakdown, condensed for a ticket comment. No worklog/time entry was logged — comment only, per explicit instruction.

## 12. Tier A implementation — completed (2026-07-22)

All of §6 Tier A landed, tested, and visually re-verified against the exact repro cases documented in §8. No `com.etendoerp.go` changes were needed — everything is a frontend-only fix in `etendo_schema_forge`.

### Files changed
- `tools/app-shell/src/lib/formatCurrency.js` — Phase 1: `es-ES` locale, `useGrouping: true`, removed `SYMBOL_AFTER_CURRENCIES`.
- `tools/app-shell/src/lib/__tests__/formatCurrency.test.js` — rewritten for `es-ES`, added a dedicated `useGrouping` regression block.
- `tools/app-shell/src/components/contract-ui/LinesBottomSection.jsx` — the 12-window document-totals root cause (§8.4).
- `tools/app-shell/src/components/contract-ui/DataTable.jsx`, `DataTable.cellRenderers.jsx` — list-view amount columns and footer totals.
- `tools/app-shell/src/components/contract-ui/DetailView.jsx` — `DocumentTotalsPanel`/`BalanceFooterPanel` wiring, plus `getSelectedLinesTotalLabel` (a second `${formatted} ${curr}` instance found only by re-reading the file during this pass, not in the original investigation).
- `tools/app-shell/src/windows/custom/shared/preview-cards/SummaryCard.jsx` — order/invoice/quotation preview-drawer totals.
- `tools/app-shell/src/components/related-documents/helpers.js` — the related-document chips.
- `tools/app-shell/src/components/contract-ui/SummaryBar.jsx`, `InlineLinesPanel.jsx` — generic shared components used across in-scope documents (found during the comprehensive `formatAmount.js`-consumer sweep below).
- `artifacts/sales-invoice/custom/InvoiceTopbarExtra.jsx`, `PaymentPlanBlock.jsx` — invoice status badges (the literal `EUR` in "Vencido · EUR 2.23" traced here — turned out to be locale-`undefined` Intl behavior, not a hardcoded string; see the note below).
- `artifacts/sales-quotation/custom/QuotationConfirmModal.jsx`, `SendToEvaluationModal.jsx` — the quotation confirm dialogs (the ones originally seen showing `1.71 EUR`).
- `artifacts/sales-order/custom/OrderConfirmModal.jsx`, `OrderCreateInvoice.jsx`, `artifacts/purchase-order/custom/PurchaseOrderActions.jsx` — order confirm/create-invoice dialogs, mirroring the quotation ones.
- `artifacts/goods-shipment/custom/BulkInvoiceFromShipment.jsx`, `ReturnWizard.jsx` — delivery-note bulk-invoice and return flows.
- `tools/app-shell/src/windows/custom/purchase-invoice/PurchaseInvoiceHeaderTable.jsx` — **a bug the code-only investigation completely missed**: Purchase Invoice's list uses its own bespoke `type: 'custom'` column with a dedicated render function, not the generic `DataTable` amount-cell path §3/§8.6 assumed covered every list. Only caught by re-testing visually in the browser after the first "complete" pass — see the note below.
- `tools/app-shell/src/windows/custom/purchase-invoice/PaymentDetailsPanelCustom.jsx` — no currency available at this call site; applies the `es-ES` number-grouping fix via `formatCurrency(undefined, value)` without fabricating a symbol.
- Roughly a dozen test files updated by Tester across these changes (all `.vitest.jsx`/`.test.js` files colocated with the sources above) — see the delegation trail earlier in this document for the specific diffs.

### The most important lesson from this pass: code-level tracing is not sufficient on its own
Everything in §3/§8.6's source-wiring table was independently re-derived from reading source. It was still wrong in one place: `PurchaseInvoiceHeaderTable.jsx` was never in the original map, because nothing suggested Purchase Invoice's list would use a *different* rendering path than every sibling window's list. It was only found by **re-opening the actual running app after the "complete" migration and finding the bug still visually present** — the fresh-tab, hard-reload, network-request, and live-module-import checks done along the way (to rule out a stale-cache false alarm) are worth repeating as a standard step, not a one-off: **a code fix is not verified until it's been seen rendering correctly in the browser**, independent of how confident the source-level trace was.

### New findings from this pass (not in the original §3/§8 investigation)
- `DetailView.jsx`'s `getSelectedLinesTotalLabel` — same `${formatted} ${curr}` pattern as everywhere else, found only while grepping for `toLocaleString(undefined` during this implementation pass.
- `PurchaseInvoiceHeaderTable.jsx` — see above; fixed.
- `SummaryBar.jsx`, `InlineLinesPanel.jsx`, `PaymentDetailsPanelCustom.jsx` — additional `formatAmount.js` consumers not enumerated in §3's original 22-implementation list; all in-scope, all fixed. After this pass, `formatAmount.js`'s only remaining consumers are `PaymentForm.jsx` and `SiiMonitorSection.jsx` — both confirmed Tier C, correctly left alone.
- `InvoiceTopbarExtra.jsx`'s literal `"EUR"` badge was root-caused precisely: `Intl.NumberFormat(undefined, {style:'currency', currency:'EUR'})` under a browser/OS locale of `es-AR` (confirmed via `node -e`, Node's own default resolved to `es-AR` in this environment) renders as `"EUR 2,23"` — the ISO code, not `€` — because CLDR data for `es-AR` doesn't map a distinct narrow symbol for a "foreign" currency without `currencyDisplay: 'narrowSymbol'` explicitly requested. This is the same root mechanism as the original ticket's complaint, just proven concretely: **locale-`undefined` + no explicit `currencyDisplay` means the symbol-vs-code outcome silently depends on each user's own browser/OS language setting** — not a hardcoded bug, an environment-dependent one, which is arguably worse. This is the strongest concrete argument for why `formatCurrency.js` must always pass an explicit locale and `currencyDisplay: 'narrowSymbol'`, never rely on `undefined`.
- A minor, out-of-scope-by-a-hair item noticed during visual re-verification: `SummaryCard.jsx`'s exchange-rate multiplier note (e.g. `"(1.14)"`) still uses `exchangeRate.toLocaleString(undefined, ...)` — untouched, since it's a rate multiplier, not a currency amount, so strictly outside "importes monetarios." Flag to the analyst alongside the Tier C list if full numeric consistency (not just currency) is ever desired.

### Visual re-verification evidence (2026-07-22, same browser session as §8)
- Purchase Invoice list: `4,840.00 €` → `4.840,00 €`; `12,000.00 $` → `12.000,00 $` (confirmed the dollar symbol also moved to *after* the amount, unifying the convention across currencies).
- Sales Invoice detail (the exact invoice `1000375` used throughout §8): `Vencido · EUR 2.23` → `Vencido · 2,23 €`; totals panel `1.84 EUR`/`0.00 EUR` → `1,84 €`/`0,00 €`; related-doc chip `2.23 EUR` → `2,23 €`.
- Sales Quotation confirm dialog (the exact flow from §8.1b): `1.71 EUR` → `1,71 €`.
- Purchase Order preview drawer (the exact record `1000358` from §8.1b): `$194,858.34 EUR` / `221,430.00 €` → `194.858,34 $ [EUR]` / `221.430,00 €` (the `EUR` badge unchanged, confirmed intentional per the corrected §8.1b).
- Warehouse (Tier B, `España Región Sur`): `$980,797.05` → `980.797,05 $` — confirmed auto-fixed with zero rewiring, as predicted.
- Dashboard (Tier C): unchanged, still `USD 180,328.29` etc. — confirmed the scope boundary held, nothing leaked into Tier C territory.

### Test suite status
Full project test suite green at every checkpoint during this implementation: `node --test` (cli + app-shell + artifacts combined) — 4306/4307 passing (1 pre-existing skip); `npx vitest run` (tools/app-shell) — 9471/9472 passing (1 pre-existing skip). Zero failures at the final checkpoint.
