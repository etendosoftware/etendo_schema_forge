# Payment In

## Intent
This window should let a finance user register money received from a customer, decide whether that money is a free credit or tied to open invoices, process the payment through its operational states, and review the resulting allocations and follow-up documents from the payment record itself.

The current repo evidence shows a generated finance window with payment-in-specific custom surfaces around creation, activity, related documents, and payment summary, while the main header and allocation lines still follow the standard contract-driven detail flow.

## What this window should allow
- Browse existing incoming payments and find them by document number, payment date, or received-from business partner.
- Create a new incoming payment either as an unapplied credit/advance or as a payment linked to an outstanding invoice.
- Capture the core intake data for the payment header: payer, payment date, payment method, deposit account, currency, amount, notes, and current status.
- Maintain allocation lines under the payment so the received amount can be matched to invoice payment schedules.
- Process an awaiting payment and later reverse it when the payment has already reached a received, deposited-not-cleared, or cleared state.
- Review related invoices and payment activity directly from the payment detail page.

## Interaction model
- Route: `/payment-in` for the list and `/payment-in/:recordId` for the detail view.
- Visibility: visible from the Finance menu in `tools/app-shell/src/menu.json`.
- Implementation type: generated window loader from `tools/app-shell/src/windows/registry.js`, backed by `artifacts/payment-in/generated/web/payment-in/FinPaymentPage.jsx` and extended with payment-specific custom components such as `NewPaymentModal`, `PaymentBottomPanel`, `PaymentActivityToggle`, and `RelatedDocuments`.
- Window shape: master-child. The primary entity is `finPayment` and the child dataset is `finPaymentScheduleDetail`, exposed as the payment allocation lines.
- Lines surface: the allocation child (`finPaymentScheduleDetail`) is managed through the custom `PaymentBottomPanel` component, not through the standard lines table. `decisions.json` sets `detailEntity: null`, so `linesLayout` is not applicable for this window. Allocation management and summary recalculation are handled entirely inside `PaymentBottomPanel`.
- List interaction: the list shows document number, payment date, received-from business partner, amount, and status, with filters limited to `documentNo`, `paymentDate`, and `businessPartner`.
- Detail interaction: opening a payment uses the generated detail page with the contract-backed header form, related-documents tab, bottom summary panel, notes field on `description`, and a top-right activity toggle. An **Attachments** tab is placed below the `PaymentBottomPanel` (via `customTabsAfterBottom: true`), so the payment summary and allocation data remain the primary focus and file attachments appear at the end of the page. Creating a payment from the list opens the specialized `NewPaymentModal` instead of the plain generated new-record flow.

## Reactive behavior and dependencies
- Selector dependencies are explicit in the contract and modal flow. `paymentMethod` is a searchable selector, `account` depends on the selected payment method, and `currency` depends on the selected account. In the new-payment modal, changing payment method refetches deposit accounts and resets the selected account.
- Header defaulting is partially evidenced. The contract defaults `paymentDate` to the current date, `amount` to `0`, and `status` to `RPAP` (Awaiting Payment). The modal also initializes the date to today and auto-selects the first available account after accounts are fetched.
- The `date` field in `NewPaymentModal.jsx` uses the generic `DateField` component (`tools/app-shell/src/components/ui/date-field.jsx`) — Figma-aligned calendar popover with always-visible calendar icon, month/year picker, and Etendo yellow hover on filled-black elements.
- Invoice-linked intake reacts to the chosen invoice in the specialized modal. After a customer and invoice are selected, the modal preloads the payment amount from the invoice outstanding amount and calls the sales-invoice payment registration action rather than creating a freeform header directly.
- Payment-state reactions are clearly visible on the detail page. `Process Payment` is exposed only when status is `RPAP`, while `Reverse Payment` is exposed only when status is `RPPC`, `RPR`, or `RDNC`.
- The detail-view delete (trash icon) button itself is wired to the **Remove Payment** NEO action rather than a plain header DELETE. It is visible for both draft (`RPAP`) and confirmed/deposited statuses and only hides once the payment is `RPVOID` — a plain DELETE would fail once the record has ever been referenced (FK constraints), so this button now calls `eTPRRemovePayment` (`RemovePayment`, `OBUIAPP_PROCESS_ID = FB79E902A5384754990AD145F6CAC9FB`) via `neoAction.execute`, which reactivates and then removes the payment server-side before navigating back to the list. **This is NOT decisions.json-driven** — it's a hardcoded `windowName` → action lookup (`WINDOW_DELETE_ACTIONS['payment-in'] = 'eTPRRemovePayment'`) in the shared `DetailView.jsx` component, a deliberate exception to the usual "customize via decisions.json" rule, because the `decisions.json → generator` wiring for a generic `deleteAction` field is not published in `schema_forge_core` (see ETP-4479). `decisions.json` still has `hideDeleteWhenComplete: true`, but it is dead for this window since `isDeleteButtonVisible` checks the resolved delete action first and short-circuits before ever consulting it.
- The same **Remove Payment** action is also available from the row-level "Delete" action in the list view (`PaymentHeaderTableBase.jsx`), gated by the identical `status != 'RPVOID'` rule. Both entry points (form-view delete button, list-row delete) converge on the same `eTPRRemovePayment` process. The detail-view kebab (⋮) menu that used to duplicate this as a `window.menuActions` entry (key `removePayment`) was removed in ETP-4479 — it was redundant with the trash-icon delete button, so `decisions.json` no longer declares `menuActions` and the kebab button does not render for this window (the "more" button only renders when there is at least one visible menu action or custom menu content, per `docs/ui-customization.md`).
- The allocation-line relationship is parent-driven. The child `finPaymentScheduleDetail` dataset is fetched with `parentId={paymentId}`, so line visibility and related-document lookups depend on the selected payment header.
- Amount allocation reactions are partially evidenced through the payment-specific bottom panel. That panel recalculates applied amount indirectly from child lines with `invoicePaymentSchedule`, computes remaining unallocated credit against the header amount, and shows linked invoices resolved from those schedule lines.
- Activity and related-document surfaces also react to the payment state and allocations. The activity panel builds timeline entries from payment date, status, linked invoice schedules, and appended notes; the related-documents tab resolves invoices from payment schedule lines. No discount, tax, or order-style total recalculation is visible in the current evidence for this window.

## Gap assessment
- Incoming-payment intent strongly suggests that allocation lines should be the main way to distribute a payment across invoices, but the current visible page wiring only proves the generic child lines plus custom summary/activity surfaces. The repo also contains `artifacts/payment-in/custom/ApplyToInvoices.jsx`, which implements an explicit apply-and-process flow, yet that component is not visibly wired from `FinPaymentPage.jsx`. Treat the exact invoice-allocation UX as an open ambiguity.
- The contract excludes the `aPRMAddScheduledpayments` action from the visible process overrides, so current evidence does not show a dedicated built-in action for pulling scheduled payments into lines. If users are expected to auto-populate allocation lines from outstanding schedules, that behavior is a documented gap rather than proven functionality.
- The bottom panel proves that remaining credit is recomputed from child lines, but the current evidence does not prove whether editing a line updates header summaries immediately, only after save/refresh, or through backend recalculation. Real-time allocation feedback should be treated as partially evidenced.
- Processing intent is clear, but the current reviewed evidence does not fully describe guardrails such as preventing over-allocation across lines, blocking process when unapplied balance remains, or handling partial allocations differently from full settlement. Those business rules remain open.
- There is no payment-in-specific UI test in `tools/app-shell` covering the specialized modal, status-driven actions, activity drawer, or allocation summary behavior, so these interactions still rely on manual verification.

## Manual verification
1. Open `/payment-in` and confirm the Finance menu route loads the incoming-payment list rather than a placeholder.
2. Start a new payment and confirm creation opens the specialized modal with the two intake modes instead of the plain generated header form.
3. In credit/advance mode, select a customer, payment method, and deposit account, enter an amount, save, and confirm the created record opens in `/payment-in/:recordId`.
4. In invoice-linked mode, select a customer with open invoices, pick an invoice, and verify the modal preloads the amount from the invoice outstanding balance before creating the payment.
5. Open a saved payment and confirm the detail page shows the related-documents tab, the bottom summary panel, and the top-right activity toggle.
6. On a payment in `RPAP`, confirm `Process Payment` is available. After processing the payment to `RPR`, `RDNC`, or `RPPC`, confirm `Reverse Payment` becomes visible.
6a. Confirm the form-view delete (trash icon) button is visible on a draft (`RPAP`) payment AND on a payment processed to `RPR`/`RDNC`/`RPPC`; confirm clicking it calls the `eTPRRemovePayment` action (not a plain delete) and returns to the list on success; confirm the button disappears once the payment is `RPVOID`.
6b. Confirm the detail-view "more" (⋮) button is no longer rendered at all on the payment-in detail page, in any status — the kebab-menu **Remove Payment** entry was removed in ETP-4479 as redundant with the trash-icon delete button.
7. Open the `Lines` child dataset for a payment with allocations and confirm the line surface exposes at least due date, received amount, and invoice payment schedule, all scoped to the current payment via `parentId`.
8. Create or edit allocation lines tied to invoice schedules and confirm the bottom panel reflects linked invoices and any remaining unallocated credit after refresh.
9. Scroll below the `PaymentBottomPanel` and confirm the **Attachments** tab strip and content area are visible. Upload a file, verify it appears in the table with file name, size, upload date, and uploader. Download it, then delete it and confirm the row disappears. When multiple files exist, confirm the "Download all (ZIP)" and "Delete all" actions appear in the table header, and that "Delete all" shows a confirmation dialog before removing all files.

## Automated evidence
- `e2e/tests/flows/attachments.mocked.spec.js` (Suites A–D) provides browser-level E2E coverage for the Attachments tab: tab visibility in the `customTabsAfterBottom` strip, empty state, upload (valid file, file too large, invalid MIME, duplicate name), single delete with confirmation, Delete All, individual file download, and Download All (ZIP). All API calls are mocked; no real backend is required.
- There is no dedicated payment-in UI test in `tools/app-shell` covering the specialized create flow, payment-state actions, or allocation panels. The form-view delete button's `deleteAction` wiring (ETP-4479) IS covered by `tools/app-shell/src/components/contract-ui/__tests__/DetailView.deleteActionFallback.vitest.jsx`. The previously-planned **Remove Payment** kebab action was removed (ETP-4479) instead of being tested — see the Reactive behavior note above.
- The contract itself contains generated validation coverage for field presence, field types, searchable filters, and default-value typing for `finPayment` and `finPaymentScheduleDetail`, but those checks do not assert rendered payment-specific behavior.
- Shared shell loading and route behavior are documented centrally in `docs/generated-custom-windows/app-shell-functional-flows.md`.
- `artifacts/payment-in/decisions.json` declares `customTabsAfterBottom: true`, which positions the generic `AttachmentsTab` below `PaymentBottomPanel` rather than in the primary tab strip.
- Evidence reviewed for this document:
  - `tools/app-shell/src/menu.json`
  - `tools/app-shell/src/windows/registry.js`
  - `artifacts/payment-in/contract.json`
  - `artifacts/payment-in/generated/web/payment-in/FinPaymentPage.jsx`
  - `artifacts/payment-in/generated/web/payment-in/FinPaymentTable.jsx`
  - `artifacts/payment-in/generated/web/payment-in/FinPaymentScheduleDetailForm.jsx`
  - `artifacts/payment-in/custom/NewPaymentModal.jsx`
  - `artifacts/payment-in/custom/PaymentBottomPanel.jsx`
  - `artifacts/payment-in/custom/PaymentActivityPanel.jsx`
  - `artifacts/payment-in/custom/RelatedDocuments.jsx`
  - `artifacts/payment-in/custom/ApplyToInvoices.jsx`
## Pipeline regeneration — ETP-3908

Regenerated on 2026-05-12 as part of the feature/ETP-3908 epic merge. No functional changes to this window.

- `linesLayout: "classic"` is now written explicitly to `contract.json`; previously the classic layout was the implicit default.
- `requiredHeaderFields` is now emitted in the page component; this window has no required header fields so the array is empty and there is no behavioral change.
- LinesTable template updated in ETP-3908 to include the inline-editable add-row alignment fix. This window uses `linesLayout: "classic"` so the new template branch is dead code here — no behavioral change.
- **ETP-3995 — Related Documents tab i18n**: The generated page file now uses `labelKey: 'relatedDocuments'` in the `customTabs` prop instead of a hardcoded `label: 'Related Documents'` string, so the tab title renders via the active UI language (e.g. "Documentos relacionados" in Spanish) regardless of the browser locale.

## Write-off summary and lines column rename — ETP-4797

`PaymentDetailSidebar` (`artifacts/payment-in/custom/PaymentDetailSidebar.jsx`, thin wrapper over
the shared `PaymentDetailSidebarBase.jsx`) is the left-column panel showing **Importe del cobro**
and the breakdown card (**Importe total** / **Aplicado a facturas** / **Sin aplicar**). It was not
previously documented in this file.

That breakdown now conditionally grows a fourth row, **Diferencia ajustada**, shown only when the
payment's `writeoffAmount` (DAL property on `finPayment`, physical column `Writeoffamt`) is
non-zero (`Math.abs(writeoffAmount) >= WRITEOFF_EPSILON`, the same 0.005 tolerance used everywhere
else in the write-off feature). A payment created without the write-off toggle carries
`writeoffAmount = 0` and the row never appears — the panel renders exactly as it did before this
change.

**What "Diferencia ajustada" means:** when this payment settled an invoice for less than its
outstanding amount and the user turned on the "Ajustar diferencia" toggle at creation time (see
`financial-account.md`'s reconciliation write-off section, and `sales-invoice.md` /
`purchase-invoice.md` for the `NewPaymentEntryModal` toggle), the shortfall was not left as a
pending balance — it was written off. This row shows that written-off amount, i.e. the part of the
invoice the customer/vendor was released from paying because it was posted to the business
partner group's write-off account instead. It is **not** a discount, credit, or G/L-item
allocation — no accounting concept is chosen by the user; the destination account is resolved from
configuration (see `financial-account.md`).

`writeoffAmount` was flipped from `discarded` to `readOnly` in `decisions.json` for this reason —
it used to be excluded from the generic W CRUD response entirely, so the frontend had no value to
read even before this UI existed.

The **Líneas de cobro** table (`PaymentBottomPanel.jsx`) also changed: the **Pendiente** column
(a purely frontend-computed `Math.max(0, expected - amount)`, never a backend field) was removed,
and the remaining two columns were renamed to match Classic's own wording for the equivalent grid
on the `FIN_Payment` window — **Importe** → **Importe esperado** (Expected Amount), **Aplicado** →
**Importe recibido** (Received Amount). Classic's grid does not carry an outstanding-amount column
either; the gap between the two remaining numbers already conveys it.

## Draft-state color regressions restored, Confirm button reordered — ETP-4797

ETP-4554 ("Migrate Artifact/Shared Theme Styles", 4 commits, same day) mis-mapped several colors on
this window's custom components — every case followed the same shape: a neutral gray or a bright
literal hex got swapped for the wrong CSS variable token, and no exact-match token existed to
tokenize to cleanly, so the literal hex was restored instead of force-fitting an approximate token.
All of the following were verified by diffing the pre-refactor commit against the current code
(and, for the two ambiguous cases, by sampling pixel colors from the Figma reference):

- **`PaymentBottomPanel.jsx` / `PaymentOutBottomPanel.jsx`** — field labels, icons, and loading/empty
  text were on `--status-info-*` (blue) instead of `--muted-foreground` (gray); the lines-table box
  border and row dividers were on `--foreground`/`--card` (near-black / invisible-on-white) instead
  of `--status-neutral-border`.
- **`DetailView.jsx` / `detailViewHelpers.jsx`** — the `ghost-danger` Reactivar button's border was
  diluted to `--destructive/0.3` and never pinned a hover text color, so the base `Button` outline
  variant's `hover:text-accent-foreground` won on hover and turned the label gray instead of red.
- **`PaymentDetailSidebarBase.jsx`** — the "confirmed" activity dot was `--status-success-fg`
  (too dark) instead of the original `#2DCA72`; the "draft" (Borrador) activity dot was
  `--status-warning-fg` (`#8A6100`, too dark) instead of the original `#FAAF00` (bright orange).
- **`PaymentDraftBanner.jsx`** (payment-in and payment-out) — the panel background was
  `hsl(var(--card))` (white, same as the page behind it — invisible) instead of `hsl(var(--muted))`;
  the body text was `--status-info-fg` (blue) instead of `--muted-foreground`; the bold title text
  was `hsl(var(--foreground))` (`#0F172A`, navy-tinted) instead of the original `#121217`. The
  bold/dark portion of the banner was also widened to cover "Borrador — sin impacto en caja." as one
  unit (previously only "Borrador —" was bold; "sin impacto en caja." was grouped with the lighter
  sentence that follows it), matching the Figma reference. This moved text between the
  `draftBannerTitle` and `draftBannerBodyIn`/`draftBannerBodyOut` i18n keys — no new keys were added.

**Confirm button position and icon.** The header toolbar's `Confirmar` action comes from
`processOverrides.aPRMProcessPayment` in `decisions.json` (not from `draftMode`, which this window
does not use), so it renders through the generic AD-process button loop in `DetailView.jsx` rather
than the Save+Confirm pair used by windows like sales-invoice. That loop rendered process buttons
*before* the Save button by default and never drew an icon for `style: 'positive'` (only
`ghost-danger` got one, a `Undo2`), so `Confirmar` appeared to the left of `Guardar` and without the
check mark sales-invoice's own Confirm button has.

Fixed by adding `"saveBeforeProcesses": true` to this window's `decisions.json` (and
payment-out's), which reorders the toolbar so Save renders first and the process buttons (Confirmar,
Reactivar) render after it, landing Confirmar as the rightmost button next to Guardar. This
decisions.json key already existed as a `DetailView.jsx` prop (added under ETP-4542) but was never
wired through the generator — `resolve-curated.js`'s window-key whitelist didn't include it, so
setting it in `decisions.json` was silently dropped before reaching `contract.json`. That gap was
closed in `schema_forge_core` (`resolve-curated.js` + `generate-frontend.js`, `feature/ETP-4797`
branch) as part of this fix — see `docs/repo-topology.md` for the publish step required before a
plain `make regen` (without `LOCAL_CORE=1`) picks it up for other windows. A `Check` icon was also
added for any process button with `style: 'positive'` in `DetailView.jsx`, matching the checkmark
already used by the `draftMode` Confirm button elsewhere in the app.

**Draft banner gating (ETP-4895).** `PaymentDraftBanner.jsx` no longer keeps its own copy of the
deposited-status list and no longer reasons by elimination ("not deposited, therefore a draft"),
which announced "Borrador — sin impacto en caja" on a rejected `ETGOERR` payment. It gates on the
shared `paymentDisplayState` rule instead, with `RPAE` kept as a draft here — as it already was, and
as `PaymentDetailSidebarBase` reads it for collections. Collections cannot reach `ETGOERR` today
(PIS is payments-out only), so this is alignment rather than a visible fix on this window; the
behavior it corrects is documented in `payment-out.md`.

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

`com.etendoerp.go` now depends on the **PSD2** module, which adds the
`EM_Psd2_Generate_Bank_Payment` ("Generate Bank Payment") column to the shared
core table this window sits on (`C_Order` / `C_Invoice` / `FIN_Payment`). Because
Schema Forge extracts from AD, that column surfaces in this window's contract as a
**system field** — present in the backend contract but **not** rendered in the
frontend (there is no `AD_Field` for it on this window). No UI or behavior change;
this note only records why the contract was regenerated when the PSD2 dependency
was added. Full rationale: [`docs/plans/psd2-dependency-cross-domain.md`](../plans/psd2-dependency-cross-domain.md).

## Theme roles

The window's live artifact custom components use the shared semantic theme.
Structural surfaces and controls consume background, card, foreground, muted, and
border roles; operational feedback uses success, warning, information, neutral,
and destructive roles. No local palette is used, so the active application theme
controls the appearance.

## Multi-currency readout on the payment detail — ETP-4841

When a payment's own currency differs from the currency of the financial account the money moved
through (e.g. a 21.34 USD collection deposited into a EUR bank account), the detail page now shows
both sides plus the rate that was actually booked:

```
Importe del cobro
+ 21,34 $
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

The "Líneas de cobro" table rendered every amount with a literal `' €'` suffix: its `fmtAmt` helper
was a hand-rolled formatter that took no currency argument at all, so a 21.34 USD payment read
`21,34 €` regardless of the payment or the account. The values themselves were always correct — they
come from `FIN_Payment_ScheduleDetail`, stored in the payment/invoice currency — only the symbol was
wrong. Now `fmtAmt(val, currency)` delegates to the canonical `formatAmount`/`formatCurrency` with
`data['currency$_identifier']`, the same field the `Moneda` readout in the panel above already used.

The ETP-4314 sweep that centralized currency formatting missed this panel and its payment-out twin
(`artifacts/payment-out/custom/PaymentOutBottomPanel.jsx`, fixed identically). The existing
source-guard tests only asserted that a function named `fmtAmt` exists, never anything about
currency, which is why it survived.

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
| currency, document number, outstanding | `GET /sales-invoice/header/{invoiceId}` |
| the payment, in the editor's own shape | `POST /sales-invoice/header/{invoiceId}/action/invoicePayments` |

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
