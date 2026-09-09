# Payment Out

## Intent

Use this window to register and complete outgoing payments to vendors or other payable recipients. The payment should let a user choose who is being paid, which financial account issues the payment, how the payment is executed, which purchase schedules are being settled, and what accounting effect the payment produces.

## What this window should allow

- Create, open, edit, and review outgoing payment headers from the Finance area.
- Capture the payment header around **Paying To**, **Paying From**, **Payment Method**, **Currency**, **Payment Date**, optional **Reference No.**, and descriptive notes.
- Review payment status and the derived header amounts that summarize the payment, including total amount, used credit, and write-off amount.
- Add allocation lines against payable schedules, especially purchase-invoice schedules, while reviewing **Due Date**, **Expected Amount**, **Paid Amount**, **Invoice No.**, **Order No.**, and related partner context.
- Trigger the payment lifecycle actions exposed by the contract when the backend status allows them, especially adding scheduled payments, processing the payment, and executing it.
- Review operational follow-up surfaces tied to the payment record: execution history, exchange-rate records, used credit sources, accounting entries, and related purchase documents.

## Interaction model

- **Route:** `/payment-out` for the list and `/payment-out/:recordId` for record detail, following the shared generated/custom window route behavior documented in `app-shell-functional-flows.md`.
- **Visibility:** visible in the Finance menu through `tools/app-shell/src/menu.json`.
- **Implementation type:** custom app-shell route. `tools/app-shell/src/windows/registry.js` resolves `payment-out` to `tools/app-shell/src/windows/custom/payment-out/index.jsx`, which wraps the generated payment-out app from `artifacts/payment-out/generated/web/payment-out/index.jsx`. That generated `index.jsx` renders `HeaderPage.jsx` (the current page component for this window — the sibling `FinPaymentPage.jsx` file in the same directory is a stale leftover from an earlier entity-naming convention and is not imported by anything).
- **Window shape:** master-child. The primary record is the payment header (`header` / generated `finPayment` page), and the main child working surface is **Lines**.
- Lines tab layout: this window uses `window.linesLayout = "inlineEditable"`. Rows render at 40 px with pencil and trash hover-action icons on the right; clicking pencil flips the row into inline edit; trash removes the row after confirmation. When the add-row form is open, existing rows stay in `InlineLinesPanel` so column widths remain stable; the form renders in a header-hidden `DataTable` below that handles callouts, selectors, and focus. Clicking "Añadir línea" while a form is already open saves the current line and opens a fresh form scrolled into view. See `docs/ui-customization.md` section 13 for the full reference.
- **Current visible detail composition:** the generated page is list/detail based, and the custom wrapper keeps the header plus **Lines**, uses `description` as notes, removes generated secondary tabs, and adds a custom **Related Documents** tab.
- **Contract-backed secondary surfaces:** the payment-out contract and generated API still define **Execution History**, **Exchange rates**, **Used Credit Source**, and **Accounting** entities even though the custom wrapper does not currently expose those generated secondary tabs in the app-shell detail view.
- An **Attachments** tab is available in the detail tab strip, allowing files to be attached to the current record.

## Reactive behavior and dependencies

- Header selectors are not independent. The contract wires `SE_Payment_BPartner`, `SE_PaymentMethod_FinAccount`, `SE_Payment_FinAccount`, and `SE_Payment_MultiCurrency`, so changing the recipient, payment method, financial account, payment date, or currency should influence available values and derived payment amounts.
- Multi-currency behavior is explicitly modeled. The header exposes **Paid (Financial Account)** and **Exchange Rate** only when the financial-account currency differs from the payment currency, and both fields are tied to the multi-currency callout.
- Status drives actions. **Add Details** is available only while the payment is not processed, **Payment Process** appears only after processing and while the payment is not void, and **Execute Payment** appears only when status is `RPAE` (Awaiting Execution).
- The detail-view delete (trash icon) button is wired to the **Remove Payment** NEO action rather than a plain header DELETE. It is visible for both draft (`RPAP`) and confirmed/deposited statuses alike and only hides once the payment is `RPVOID` — a plain DELETE would fail once the record has ever been referenced (FK constraints), so this button now calls `eTPRRemovePayment` (`RemovePayment`, `OBUIAPP_PROCESS_ID = FB79E902A5384754990AD145F6CAC9FB`) via `neoAction.execute`, which reactivates and then removes the payment server-side before navigating back to the list. **This is NOT decisions.json-driven** — it's a hardcoded `windowName` → action lookup (`WINDOW_DELETE_ACTIONS['payment-out'] = 'eTPRRemovePayment'`) in the shared `DetailView.jsx` component, a deliberate exception to the usual "customize via decisions.json" rule, because the `decisions.json → generator` wiring for a generic `deleteAction` field is not published in `schema_forge_core` (see ETP-4479). `decisions.json` still has `hideDeleteWhenComplete: true`, but it is dead for this window since `isDeleteButtonVisible` checks the resolved delete action first and short-circuits before ever consulting it.
- The same **Remove Payment** action is also available from the row-level "Delete" action in the list view (`PaymentHeaderTableBase.jsx`), gated by the identical `status != 'RPVOID'` rule. Both entry points (form-view delete button, list-row delete) converge on the same `eTPRRemovePayment` process. The detail-view kebab (⋮) menu that used to duplicate this as a `window.menuActions` entry (key `removePayment`) was removed in ETP-4479 — it was redundant with the trash-icon delete button, so `decisions.json` no longer declares `menuActions` and the kebab button does not render for this window (the "more" button only renders when there is at least one visible menu action or custom menu content, per `docs/ui-customization.md`).
- Header totals are derived, not free-entry fields. **Amount**, **Used Credit**, and **Write-off Amount** are read-only on the header, so child allocations and credit usage should be what moves those totals.
- The **Lines** child surface is the main dependency point between the payment and payable documents. Each line can reference an invoice payment schedule or an order payment schedule, and the custom **Related Documents** tab follows those schedule references to fetch linked purchase invoices and purchase orders.
- Exchange-rate rows have their own reactions. The contract wires `SE_CalculateExchangeRate` on **Rate** and **Foreign Amount**, and the exchange-rate row becomes read-only when reversed-invoice flags are present or the payment is posted.
- Used credit is modeled as a dependent child surface. **Used Credit Source** links another payment through **Credit Payment Used**, stores an amount and currency, and should feed the header's read-only **Used Credit** total.
- Accounting is review-oriented in current evidence. The accounting surface exposes read-only ledger dimensions such as general ledger, period, accounting date, account, debit, credit, description, and related dimensional references.
- No explicit totals-balancing rule, discount recalculation, tax recalculation, or posting-side refresh is visible in the current payment-out app-shell code beyond the generic child-save refresh behavior described in `app-shell-functional-flows.md`.

## Gap assessment

- The business surface suggests one payment workspace spanning header, lines, execution history, exchange rates, used credit, accounting, and related documents. The contract and generated API define all of those entities, but the current custom wrapper clears generated secondary tabs, so **Execution History**, **Exchange rates**, **Used Credit Source**, and **Accounting** are contract-backed yet not clearly exposed in the current app-shell detail UI. That is a functional gap unless another navigation path surfaces them.
- Purchase-order allocation is only partially evident in the visible interaction. The contract supports `orderPaymentSchedule`, and the related-documents tab can resolve purchase orders from line schedules, but the generated quick-add line entry only includes **Paid Amount** plus **Invoice Payment Schedule**. It is therefore unclear whether order-based allocations are intentionally secondary-form-only or currently underexposed.
- The contract exposes lifecycle actions and read-only accounting data, but current evidence does not prove the full payable-balancing outcome, posting timing, or ledger generation timing that users would normally expect after processing or executing a payment. Treat posting/accounting effects as expected business semantics, not confirmed app-shell behavior.
- Exchange-rate and credit behavior are modeled in the contract, but there is no window-specific automated or browser evidence here showing that multi-currency recalculation, credit consumption, or cross-surface totals update correctly in the current UI.

## Manual verification

1. Open `/payment-out` from the Finance menu and confirm the route loads the custom payment-out window rather than a placeholder or generated fallback.
2. Create a payment and confirm the header supports **Paying To**, **Paying From**, **Payment Method**, **Currency**, **Payment Date**, **Reference No.**, and notes.
3. Change partner, account, payment method, date, and currency values and confirm dependent selector options or multi-currency fields react instead of remaining static.
4. Add payment lines and confirm the user can allocate **Paid Amount** against payable schedules while reviewing due date, expected amount, invoice/order references, and related partner context.
5. Save a payment whose lines reference purchase invoice and purchase order schedules, then open **Related Documents** and confirm the chips navigate to `/purchase-invoice/:id` and `/purchase-order/:id`.
6. Move a record through statuses where possible and confirm **Add Details**, **Payment Process**, and **Execute Payment** appear only in the documented lifecycle states.
6a. Confirm the form-view delete (trash icon) button is visible on a draft (`RPAP`) payment AND on a payment processed to a deposited/cleared status; confirm clicking it calls the `eTPRRemovePayment` action (not a plain delete) and returns to the list on success; confirm the button disappears once the payment is `RPVOID`.
6b. Confirm the detail-view "more" (⋮) button is no longer rendered at all on the payment-out detail page, in any status — the kebab-menu **Remove Payment** entry was removed in ETP-4479 as redundant with the trash-icon delete button.
7. Verify whether **Execution History**, **Exchange rates**, **Used Credit Source**, and **Accounting** are reachable anywhere in the current payment-out detail UI. If they are not visible, record that as a confirmed app-shell gap rather than assuming backend support is enough.
8. If multi-currency or credit scenarios are available, verify whether exchange-rate rows, used-credit rows, header totals, and accounting review data update after line or lifecycle changes.
9. Open a saved record and confirm the **Attachments** tab is visible in the tab strip. Upload a file and verify it appears in the table. Download it and delete it. When multiple files exist, confirm 'Download all (ZIP)' and 'Delete all' appear in the table header and that 'Delete all' shows a confirmation dialog before removing all files.

## Automated evidence

- Route visibility and loader registration are directly evidenced by `tools/app-shell/src/menu.json`, `tools/app-shell/src/windows/registry.js`, and the shared registry test `tools/app-shell/src/windows/__tests__/registry.test.js`.
- Current payment-out UI composition is directly evidenced by `tools/app-shell/src/windows/custom/payment-out/index.jsx`, `tools/app-shell/src/windows/custom/payment-out/RelatedDocuments.jsx`, and `artifacts/payment-out/generated/web/payment-out/HeaderPage.jsx` plus `index.jsx`.
- Payment fields, child entities, selector endpoints, action endpoints, callouts, display logic, and read-only/computed behavior are contract-backed in `artifacts/payment-out/contract.json` and shaped by `artifacts/payment-out/decisions.json`.
- No payment-out-specific browser or node test was found that proves end-to-end outgoing-payment lifecycle behavior, multi-currency recalculation, credit usage, posting effects, or exposure of the contract-defined secondary surfaces. The form-view delete button's `deleteAction` wiring (ETP-4479) IS covered by `tools/app-shell/src/components/contract-ui/__tests__/DetailView.deleteActionFallback.vitest.jsx`. The previously-planned **Remove Payment** kebab action was removed (ETP-4479) instead of being tested — see the Reactive behavior note above.
- The generated `HeaderPage.jsx` includes `AttachmentsTab` in its `customTabs` prop, wired to the `FIN_Payment` AD table.- **ETP-3995 — Related Documents tab i18n**: The generated page file now uses `labelKey: 'relatedDocuments'` in the `customTabs` prop instead of a hardcoded `label: 'Related Documents'` string, so the tab title renders via the active UI language (e.g. "Documentos relacionados" in Spanish) regardless of the browser locale.

## Write-off summary and lines column rename — ETP-4797

`PaymentDetailSidebar` (`artifacts/payment-out/custom/PaymentDetailSidebar.jsx`, thin wrapper over
the shared `tools/app-shell/src/windows/custom/shared/PaymentDetailSidebarBase.jsx`) is the left
sidebar shown on the detail page (`HeaderPage.jsx` wires it as `sidePanel`, alongside
`PaymentOutBottomPanel` as `bottomSection` — see the JSX generated for those two props). Neither
component was previously documented in this file.

The sidebar's breakdown card (**Importe total** / **Aplicado a facturas** / **Sin aplicar**) now
conditionally grows a fourth row, **Diferencia ajustada**, shown only when the payment's
`writeoffAmount` (DAL property on `finPayment`, physical column `Writeoffamt`, already `readOnly`
in this window's `decisions.json`) is non-zero. A payment created without the write-off toggle
carries `writeoffAmount = 0` and the row never appears.

**What "Diferencia ajustada" means:** when this payment settled an invoice for less than its
outstanding amount and the user turned on the "Ajustar diferencia" toggle at creation time (see
`financial-account.md`'s reconciliation write-off section, and this same doc / `sales-invoice.md`
for the `NewPaymentEntryModal` toggle on the payment side), the shortfall was written off rather
than left pending — posted to the business partner group's write-off account. This row shows that
amount. It is **not** a discount, credit, or accounting-account allocation — no accounting account is chosen
by the user.

The lines table (`PaymentOutBottomPanel.jsx`) also changed: the **Pendiente** column (a purely
frontend-computed `Math.max(0, expected - amount)`, never a backend field) was removed, and the
remaining two columns were renamed to match Classic's own wording on the equivalent `FIN_Payment`
grid — **Importe** → **Importe esperado** (Expected Amount), **Aplicado** → **Importe recibido**
(Received Amount).

## Draft-state color regressions restored, Confirm button reordered — ETP-4797

Same ETP-4554 color-mapping bug and same fix as `payment-in.md`'s "Draft-state color regressions
restored, Confirm button reordered" section (both windows share `PaymentDetailSidebarBase.jsx`,
`DetailView.jsx`, and near-identical `PaymentOutBottomPanel.jsx` / `PaymentBottomPanel.jsx`
components) — see that section for the full list of components and the exact hex/token values.
This window's `decisions.json` also got `"saveBeforeProcesses": true` so `Confirmar`
(`processOverrides.aPRMProcessPayment`) renders after `Guardar` instead of before it, and its
`PaymentDraftBanner.jsx` got the same background/text-color and bold-text-split fix.

**Toolbar order actually shipped (ETP-4895).** The `saveBeforeProcesses` key above never reached the
UI: the published `schema_forge_core` still drops it in `resolve-curated.js`'s window-key whitelist,
so it is absent from `contract.json` and from the generated page, and the toolbar kept rendering
**Confirmar** to the left of **Guardar**. Rather than block on a core publish, `DetailView.jsx` now
takes a presentational `saveActionsFirst` prop — order only, defaulting to `saveBeforeProcesses` so
no existing window changes — and both payment windows pass it from a thin custom wrapper:
`tools/app-shell/src/windows/custom/payment-out/index.jsx` and the new
`tools/app-shell/src/windows/custom/payment-in/index.jsx` (registered in
`tools/app-shell/src/windows/registry.js`; `payment-in` had no custom wrapper before). Save now
renders to the left and **Confirmar** is the right-most button. The windows deliberately do NOT opt
into `saveBeforeProcesses` itself — they only want the order, not the flush-pending-edits-before-
running-the-process behavior. When the core key does land, it will imply the same order and the
wrapper prop becomes redundant rather than conflicting.

## PSD2 dependency — `EM_Psd2_Generate_Bank_Payment`

`com.etendoerp.go` now depends on the **PSD2** module, which places a real
"Generate Bank Payment" action (`EM_Psd2_Generate_Bank_Payment`) on the payment
header. Unlike the orphan-column case in the other PSD2-touched windows, here the
PSD2 module ships an actual `AD_Field`, so it surfaces in the contract as an
**editable header field** (`psd2GenerateBankPayment`) with its own action endpoint
`/sws/neo/payment-out/header/{id}/action/psd2GenerateBankPayment` and display
logic. Contract regenerated when the PSD2 dependency was added. Full rationale:
[`docs/plans/psd2-dependency-cross-domain.md`](../plans/psd2-dependency-cross-domain.md).

## Theme roles

The window's live artifact custom components use the shared semantic theme.
Structural surfaces and controls consume background, card, foreground, muted, and
border roles; operational feedback uses success, warning, information, neutral,
and destructive roles. No local palette is used, so the active application theme
controls the appearance.

## Multi-currency readout on the payment detail — ETP-4841

When a payment's own currency differs from the currency of the financial account the money moved
through (e.g. a 21.34 USD payment made from a EUR bank account), the detail page now shows
both sides plus the rate that was actually booked:

```
Importe del pago
− 21,34 $
  (0,680272)  14,52 €
```

- **Hero amount** stays in the PAYMENT's currency — the document's own defining value, and the
  currency the `Importe total` / `Aplicado a facturas` / `Sin aplicar` rows below it use.
- **Secondary line** is `(rate) amount-in-account-currency`, echoing the invoice preview's
  `SummaryCard`. The rate is the payment's OWN stored `Finacc_Txn_Convert_Rate`, shown verbatim with
  up to 6 decimals — not the org's standard precision (2), which would render `0,68` and hide the
  rate the user typed in the Cobros/Pagos modal (see the ETP-4841 rate-persistence notes in
  `purchase-invoice.md` / `sales-invoice.md`).
- **Deliberately no currency badge.** On the preview card the badge is load-bearing because its hero
  figure is the *converted* one, so the badge names the document's true currency ("shown in €, but
  this invoice is in USD"). Here the hero is already the true one, so a bare ISO badge would carry
  the inverted meaning to anyone trained on that card, and it is redundant next to a secondary line
  that already renders its own symbol.
- **Hidden entirely when the currencies match** (`accountCurrency === currency`), which is the common
  case: a same-currency payment stores rate `1` and an account amount equal to the payment amount, so
  the line would be pure noise. The Cobros/Pagos modal gates its own conversion fields on the same
  condition (`isForeign`, ETP-4504).

Rendered by `tools/app-shell/src/windows/custom/shared/PaymentDetailSidebarBase.jsx` (shared by both
payment windows through the thin `custom/PaymentDetailSidebar.jsx` shims).

**Backend:** `accountCurrency`, `conversionRate` and `financialTransactionAmount` are injected into
the single-record GET by `ReactivatePaymentHandler.injectMultiCurrencyExtras` (`com.etendoerp.go`).
None is reachable through the frontend contract — `Finacc_Txn_Convert_Rate` / `Finacc_Txn_Amount` are
`ISINCLUDED = N` on payment-in, and the account's currency ISO is one hop past
`Fin_Financial_Account_ID` in both windows — so this is a pure read enrichment with **no AD change**,
hence no `push-to-neo` / `export.database`. The injection sits in its own try/catch so a failure
resolving it can never discard the `financialTransactionId` the same post-hook already provides.
Field names match what `PaymentRegistrationService.paymentListItem` emits for the invoice payment
modal, so both surfaces speak one shape. On an older backend the three fields are absent and the
block simply does not render.

## Line amounts showed a hardcoded euro symbol — ETP-4841

The "Líneas del pago" table rendered every amount with a literal `' €'` suffix: its `fmtAmt` helper
was a hand-rolled formatter that took no currency argument at all, so a 21.34 USD payment read
`21,34 €` regardless of the payment or the account. The values themselves were always correct — they
come from `FIN_Payment_ScheduleDetail`, stored in the payment/invoice currency — only the symbol was
wrong. Now `fmtAmt(val, currency)` delegates to the canonical `formatAmount`/`formatCurrency` with
`data['currency$_identifier']`, the same field the `Moneda` readout in the panel above already used.

The ETP-4314 sweep that centralized currency formatting missed this panel and its payment-out twin
(`artifacts/payment-in/custom/PaymentBottomPanel.jsx`, fixed identically). The existing
source-guard tests only asserted that a function named `fmtAmt` exists, never anything about
currency, which is why it survived.

## `PPM` reads as "Pago en progreso", not "Pago depositado" — ETP-4895

`PPM` ("Payment Made") is Core's status for a payment that is **confirmed but not yet withdrawn**
from its financial account, so no `FIN_Finacc_Transaction` exists for it. Core moves it on to `PWNC`
once the withdrawal is recorded. Labelling it "Pago depositado" was therefore wrong in every case —
the money has not left the account — and visibly wrong for a Salt Edge transfer, which sits in `PPM`
for the whole wait between the bank authorizing it and the funds actually moving.

The bank-transfer payment method is configured **without Automatic Withdrawn** precisely so the
transaction only appears on execution, which is what makes `PPM` a reliable "in progress" signal here
rather than an edge case. Since **ETP-4891** that holds for every account, connected or not — it is a
property of the method, not of the account's bank connection (see `purchase-invoice.md`).

Three places in this window changed:

| Surface | Before | Now |
| --- | --- | --- |
| Header status pill | "Pago depositado" (green) | "Pago en progreso" (amber) |
| Pagos grid, Estado column | "Pago depositado" | "Pago en progreso" |
| Activity timeline | "Pago confirmado · depositado" | "Pago confirmado · en progreso" |

The pill and the grid come from `statusEnumLabels` (`decisions.json` → contract → `HeaderPage.jsx`),
now mapping `PPM` to `cpPaymentStateInProgress`. The amber tone comes from `getStatusTone` in
`lib/statusBadge.js`, where `ppm` moved out of the success bucket — a green pill under the words
"en progreso" would contradict itself.

The four surfaces that show a payment (this window, the Pagos grid, the invoice payment modal and
the invoice preview card) now share one rule, `paymentDisplayState` in
`windows/custom/shared/paymentStatuses.js`. Each previously carried its own copy of the status list,
which is how the same transfer read "Pago en progreso" in the invoice modal and "Pago depositado"
here at the same time. `PaymentDetailSidebarBase`'s copy was also missing `RPAE`, so an
"Awaiting Execution" payment showed as a draft in the timeline while every other surface showed it
as confirmed; adopting the shared rule fixes that too.

**Scope:** payments out only. `PPM` is an outbound status — a receipt confirms to `RPR`/`RDNC` — so
Payment In keeps its previous labels and its previous `RPAE` reading, and the two direction-scoped
guards live in `PaymentHeaderTableBase` (`isOut`) and `PaymentDetailSidebarBase` (`isIn`). The
`RPAE`-in-the-timeline inconsistency therefore still stands on the collections side, deliberately
left for its own task.

Nothing about *processing* changed: a `PPM` payment is still processed, so it keeps its **Reactivar**
action, is not offered for deletion, and still counts toward the sidebar's confirmed totals.

## Retrying a rejected bank transfer — ETP-4895

A Salt Edge transfer that reaches `authorized` creates the payment (status `PPM`, "Pago en
progreso"). If the bank later refuses it, the payment is flagged **`ETGOERR`** and this window
offers **"Reintentar transferencia"** in the topbar, next to where the "Conciliado" badge appears.

The button (`PaymentRetryTransferButton`, reached through the `PaymentTopbarActions` topbar slot)
renders only when the payment is `ETGOERR` **and** the backend sent a `pisPaymentId` — the rejected
attempt to replay, injected into the single-record GET by `ReactivatePaymentHandler`. A payment
that is merely in progress must never offer it: a second order there would pay the invoice twice.

The retry reuses this payment rather than registering a second one, so it posts against the payment
record itself (`/payment-out/header/{id}/action/retryPisPayment`) and needs no invoice context. The
payment returns to `PPM` while the new attempt is in flight.

**A cross-currency retry re-sends the converted amount (ETP-5084).** `FIN_Payment.amount` is
denominated in the invoice currency, so on a payment whose account is in another currency it is the
wrong figure to hand the bank. `PisPaymentBridge.bankAmountFor` sends the payment's already-converted
`financialTransactionAmount` — the same value the ledger holds, so a retry cannot drift from it — and
tags it with the account's currency; the template is likewise derived from the account currency
(EUR→SEPA, USD→DOMESTIC, GBP→FPS). If that column was never populated the rate stored on the payment
is used to recompute it, and with neither the retry is refused rather than instructing an unconverted
amount. See the readout section below for where those two stored values are surfaced.

**The retry follows its own attempt.** It used to end at `window.open`: nothing watched the new
transfer, because the invoice modal's poll belongs to the modal, Salt Edge's webhook cannot reach a
server that is not publicly addressable, and PSD2's `Refresh Pending Payments` is not scheduled by
default. The attempt sat at `requested` and the payment read as "en progreso" long after the bank
had executed it — and the PSD2 row's `description`, which is only written when the Salt Edge
response is read back, stayed empty for the same reason. `PaymentRetryTransferButton` now polls
`pisPaymentStatus` every 3s (10 min ceiling) for the attempt the retry returned, and on a resolutive
status closes the bank popup, announces the record and toasts the outcome. Reaching the ceiling is
not an error: whoever opens the payment next reconciles it. The action is routed on the payment
entity by `ReactivatePaymentHandler` (it reads the transfer from the body and ignores the record it
is posted to, so no invoice is involved), and the Salt Edge status lists plus the `pisOutcome`
classifier moved to `paymentStatuses.js` so the modal and the button read a status the same way.
Only a status recognized as resolutive stops the poll — an unknown one, or no answer at all, keeps
waiting, so a network blip is never reported as a rejection.

**A retry is logged as a retry.** `PaymentDetailSidebarBase` mapped every `neo:processSuccess` that
was not a reactivation to a confirmation, so retrying added a second "Pago confirmado" for an event
that confirmed nothing. `EVENT_TYPE_BY_PROCESS` now maps `retryPisPayment` to its own `retried`
event — "Transferencia reintentada", amber dot, the same reading the in-progress confirmation gets.

Opening this window also reconciles the payment against whatever Salt Edge status is already
stored (`reconcileAttemptsFor`), which is how a rejection that arrived after the payment modal had
closed gets noticed at all — the SPA's poll is long gone by then, and the PSD2 refresh that saw it
does not touch Etendo Go's payment. No Salt Edge call is made on that path.

A rejection only flags the payment while it still describes it (`isStaleAttempt`). Both writers that
can set `ETGOERR` — the `PisRejectedPaymentHandler` observer and `markPaymentAsFailed` — skip a
rejected row in three cases: a **newer attempt exists** (a retry is in flight and the rejected row is
just its audit trail), the payment is **no longer processed** (the user reactivated it: a draft is
not a payment whose transfer failed), or the payment **changed after the attempt last did** (it was
reactivated and confirmed again, possibly by another method). Without these,
`reconcileAttemptsFor` — which walks *every* attempt each time a screen opens — kept dragging the
payment back: a retry read as failed again on the next window load, and a reactivated payment came
back from the server still flagged, half draft (`processed = N`) and half errored. PSD2's refresh
makes it worse by firing an update event even when the status it rewrites is unchanged. If a newer
attempt is refused in turn, that one flags the payment.

**Reactivating clears the flag first (`clearTransferErrorFlag`).** Core decides whether to give the
invoice its outstanding back by comparing the payment's status against the one its payment method
implies — `seqnumberpaymentstatus(payment.getStatus()) == seqnumberpaymentstatus(invoicePaymentStatus(payment))`
in `FIN_PaymentProcess`. `ETGOERR` is not in that sequence (`aprm_seqnumberpaymentstatus` answers 70
for anything unknown, against 40 for `PPM`), so the comparison never held and reactivating left the
payment in draft with its invoice still reading as fully paid. `ReactivatePaymentHandler` now
restores `FIN_Utility.invoicePaymentStatus(payment)` — the value Core is about to compare against,
which is also correct for an account with automatic withdrawal on, where the flagged payment had
been `PWNC` and not `PPM` — before delegating. Nothing is lost: the user is explicitly abandoning
that transfer, and the rejected `PSD2_PIS_PAYMENT` row stays as the audit trail.

**How an `ETGOERR` payment reads.** The draft banner and the activity timeline both used to
describe it as something else: the banner announced "Borrador — sin impacto en caja" (it kept its
own copy of the deposited-status list and reasoned by elimination, so anything not deposited was a
draft), and the timeline showed a green "Pago confirmado · depositado" under a red "Pago con error"
pill. The banner now gates on the shared `paymentDisplayState` rule, and the timeline has an error
branch of its own — `pagoConfirmadoRechazado` / `cobroConfirmadoRechazado` ("Pago confirmado ·
rechazado por el banco") with a `--destructive` dot, mirroring how the in-progress state already
overrides that label.

**Known gap:** an `ETGOERR` payment is deliberately not reactivated, so it stays applied and its
invoice keeps reading as paid until the retry succeeds.

## Reactivar y Eliminar quedan fuera mientras la transferencia está viva — ETP-4895

A payment produced by a Salt Edge transfer belongs to that transfer, not to the user: reactivating or
deleting it behind the bank's back would leave Salt Edge holding an order for a payment that no
longer exists and — once executed — money that moved with nothing recording it. So both actions are
withdrawn while the transfer is live.

The single exception is **`ETGOERR`**: there the bank refused the transfer, no money moved and
nothing is in flight, so the payment is the user's again to retry or discard.

Payments that never went through PIS are **never** locked, so cash and manual transfers behave
exactly as before.

### How it is enforced

The backend answers the question once, as a derived boolean `pisLocked`
(`PisDeferredPaymentService.isLifecycleLockedByTransfer`), and `ReactivatePaymentHandler` emits it on
**both** the single-record GET and every list row. Two surfaces offer these actions, and a rule
enforced in only one of them is a rule the user can walk around.

| Surface | Action | Gate |
| --- | --- | --- |
| Detail toolbar | Reactivar | `processOverrides.etprReactivatePayment.displayLogicRaw` → `@status@ != 'RPAP' & @pisLocked@ = 'N'` |
| Detail toolbar | Eliminar | `isDeleteButtonVisible` — checked **ahead of** the `deleteAction` bypass |
| Grid kebab | Reactivar | `PaymentHeaderTableBase.menuActions` returns `[]` |
| Grid row actions | Eliminar | `isDeleteVisibleForRecord`, shared with the detail form |

Two details worth keeping in mind:

**The flag is read off the record, not the window config.** It is a per-record fact the backend owns,
and no other window emits it, so the shared components are inert unless a backend opts in.

**The delete check had to jump ahead of the `deleteAction` bypass.** That bypass (ETP-4479) exists
because such a delete reactivates server-side before removing — which is exactly what must not
happen here.

**The list injection is batched.** One query resolves which payments of the page have a transfer;
asking per row turned a grid page into fifty round trips.

## Confirmar abre el editor del pago, no un diálogo

A draft payment — typically one that was just reactivated — used to offer a yes/no dialog: *"El pago
pasará a estado confirmado y depositado"*. That was the only thing this window could offer, because
it has no form of its own: `hideFormCard` is on and all 31 header fields are `form: false`, so
"Datos del pago" is read-only text and Guardar is permanently disabled. A user who reactivated a
payment to fix its amount could only re-confirm it unchanged.

Confirmar now opens the **invoice's own payment editor** (`NewPaymentEntryModal`), with the draft's
amount, date, method, account and PIS block loaded — the same modal the invoice opens, so the user
can correct the payment and then either **Guardar** (stays a draft) or **Confirmar**. Both surfaces
that offer the action do it: the detail toolbar and the grid's kebab.

### How it is wired

`PaymentEditModalLauncher` sits in the window's `processConfirmModal` slot, routed by
`ReactivarConfirmModal` on `columnName === 'aPRMProcessPayment'`. That slot only renders a
component — nothing forces it to call `onConfirm` — so a window can replace a process button's
behaviour outright without touching `generate-frontend.js` in `schema_forge_core`. The slot gained
two props for this (`apiBaseUrl`, `onRefresh`): a modal that acts on its own never goes through
`handleProcess`, so nothing else would reload the record.

Everything the editor needs comes from endpoints that already exist:

| Step | Source |
| --- | --- |
| which invoice | `invoiceId`, injected on the payment record by `ReactivatePaymentHandler` |
| currency, document number, outstanding | `GET /purchase-invoice/header/{invoiceId}` |
| the payment, in the editor's own shape | `POST /purchase-invoice/header/{invoiceId}/action/invoicePayments` |

That last one matters: `invoicePayments` is the **only** endpoint that returns `creditSourcesUsed`,
so rebuilding the object by hand would silently drop the credits the draft consumed.

`PaymentRegistrationService.invoiceIdsByPayment` resolves the whole page in one query and counts
**only positive applications**. A payment that spends a credit carries a negative application
against the credit note's own installment; that is the credit being spent, not a second invoice, and
the editor already models it as a source.

### Fallback

When the invoice cannot be resolved — no application at all (an abandoned shell), more than one, or
a failed lookup — the launcher renders the original confirm dialog. Confirming is never blocked, and
the editor never opens on a record it could not save correctly.
