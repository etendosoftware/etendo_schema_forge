# ETP-5084 Cross-Domain Plan

A PIS bank transfer must be **selectable by the account's currency and instructed in it**, converting
the invoice amount when the two differ.

The ticket reads as two small things — pick the payment template by currency, and convert when the
currencies differ — but the flow keyed off the **invoice** currency in four separate places, and the
conversion never reached the bank at all. Three defects, in ascending severity:

1. **The PIS block never appeared for the ticket's own case.** `computePaymentModalState` gated on
   `PIS_ELIGIBLE_CURRENCIES.has(currency)`, the invoice currency, with the set `{EUR, GBP}`. A USD
   invoice hid the form outright, so the backend's own
   `"only supported for EUR and GBP invoices"` was reachable only by a direct API call.
2. **The template was derived from the invoice currency**, in the SPA (`defaultPisTemplate`) and in
   the backend fallback (`templateForCurrency`, at both of its call sites).
3. **The conversion never reached the bank.** `doRegisterPaymentAdvanced` resolved and validated the
   request's `conversionRate` and then *discarded* it, handing `PisDeferredPaymentService` the raw
   invoice-currency amount; `PisPaymentBridge` sent Salt Edge that figure tagged with
   `invoice.getCurrency().getId()`. The conversion was applied only later, when the snapshotted intent
   was replayed to create the `FIN_Payment`. Had eligibility let a cross-currency payment through,
   1000 USD would have left a EUR account as 1000 EUR while the ledger booked 920 — the bank and the
   books disagreeing by the whole spread. **This is the defect the ticket is actually about.**

## Decisions

**The rate is the request's**, not a freshly resolved one. `PaymentCurrencyConverter.convertedAmount`
is applied to the `conversionRate` already validated at `PaymentRegistrationService:588-593` — the
very value, through the very same helper, that the replay books
`financialTransactionAmount` with (`:826/852`). The instructed and the booked amount therefore agree
*by construction*, not by two computations happening to land on the same number. The user sees and can
edit that rate in the modal's existing ETP-4504 conversion field, which resolves the ticket's open
"should the rate be shown before confirming" question with what already shipped.

`resolveInvoiceRate` (the invoice's own `ConversionRateDoc`, else the general table — the ETP-4502
contract, and what the reporter suggested) is used only to **seed** a missing rate, and it is written
back **into the request body**: that body is the intent snapshot, so a rate kept in a local variable
would be absent from the replay and the replay would then fail the "rate required" validation.

**Templates key off the account currency:** EUR → `SEPA`, USD → `DOMESTIC`, GBP → `FPS`. Eligible
account currencies are therefore `{EUR, USD, GBP}` (USD is new). The invoice may be in **any**
currency that has a rate.

**ETP-4503 is reverted.** Connecting an account to its bank no longer clears
`payin/payout_ismulticurrency` on the bank-transfer link. That exception assumed a transfer could only
settle an invoice in the account's own currency; conversion removes the premise. Deliberate side
effect, agreed with the requester: it also unblocks **cross-currency bank reconciliation** through the
transfer method, which ETP-4503 refused on purpose. `assertMethodMultiCurrency` stays as the guard for
a link an administrator has genuinely configured single-currency.

## Domains changed

| Domain | Files | Reason |
|--------|-------|--------|
| `backend:etendo-go` | `PisPaymentService.java` | `validatePisEligibility` checks the **account** currency against `PIS_ELIGIBLE_ACCOUNT_CURRENCIES` `{EUR,USD,GBP}`; also rejects an invoice with no currency (unconvertible) |
| `backend:etendo-go` | `PisPaymentBridge.java` | `templateForCurrency` gains USD→DOMESTIC and is fed the account currency at both call sites; the deferred payload sends `bankAmount` + the account currency; new `bankCurrencyFor` / `bankAmountFor` for the retry path |
| `backend:etendo-go` | `PaymentRegistrationService.java` | The PIS branch converts `cash` → `bankAmount` with the already-validated rate; seeds a missing rate before resolving it |
| `backend:etendo-go` | `PisDeferredPaymentService.java` | `initiateDeferredPis` takes the account-currency `bankAmount` (the intent snapshot is unchanged) |
| `backend:etendo-go` | `PaymentCurrencyConverter.java` | New `isCrossCurrency` (deduped out of `resolveConversionRate`) and `seedInvoiceRateIfAbsent` |
| `backend:etendo-go` | `FinancialAccountSupport.java` | `disableMulticurrencyForBankTransfer` **deleted** (−51 lines) |
| `backend:etendo-go` | `FinancialAccountBankConnectionHandler.java` | The connect-time disable call removed from `linkAccount` |
| `backend:etendo-go` | `ReconciliationPaymentService.java` | Javadoc only — the guard itself is unchanged |
| `window:shared (app-shell)` | `NewPaymentEntryModal.jsx` | Account-currency eligibility + template default; the template choice moved into its own `accountCurrency`-keyed effect with a manual-pick guard; `pisBankAmount`; the PIS alert states the converted amount |
| `window:shared (app-shell)` | `NewPaymentEntryModal.jsx`, `InvoicePaymentHistoryModal.jsx`, `lib/backendErrors.js` | `extractSaveError` reads NEO's own `{error:{message}}` envelope and translates it; 5 new `backendError.*` mappings (see *Backend errors were invisible in this modal*) |
| `app-shell i18n` | `en_US.json`, `es_ES.json` | `cpPisAlertConverted` + 5 `backendError.*` keys (`es_AR` has no `cpPis*` keys and keeps falling back) |
| `cli:data-fixes` | `20260831T120000Z__R29-transfer-link-multicurrency.sql`, `retired.json` | R29 re-enables multicurrency fleet-wide; **R14 retired** (its effect 2 re-applies the removed exception) |

## Two subtleties worth keeping

**The account currency can be absent.** `mapAccounts` sets `currency: a.currency || null`, and an
older backend omits it. Both the eligibility test and the template default therefore read
`accountCurrency || currency`: with the field missing the behavior is exactly the pre-ETP-5084 one,
rather than the PIS block silently vanishing everywhere. The PIS test fixtures had no `currency` at
all, which is how this surfaced.

**The display rounding is safe here, but only by luck of the currency set.** The SPA computes the
figure it shows with `round2`, while the backend rounds at the account currency's
`standardPrecision` — the known ETP-4504 follow-up that diverges for a non-2-decimal currency (JPY).
The eligible account currencies are exactly EUR, USD and GBP, all 2-decimal, so the two agree today.
Adding a currency to `PIS_ELIGIBLE_CURRENCIES` / `PIS_ELIGIBLE_ACCOUNT_CURRENCIES` means revisiting
this, because the displayed and instructed amounts would then differ in the last digit.

**The template default had to leave the catalog effect.** It lived inside the effect keyed on
`[pisEligible]`, which by design runs once per eligibility flip. Deriving from the account currency
there would have left the template stale the moment the user switched to a connected account in
another currency (a GBP account keeping the SEPA its EUR predecessor defaulted to). It is now its own
effect on `[pisEligible, pisTemplates, accountCurrency, currency]`, with a `pisTemplateTouchedRef` so
re-deriving never overwrites a template the user picked by hand — `CreatableSearchSelect` also fires
`onChange('', '')` on its own resets, so only a truthy id counts as touched.

## Backend errors were invisible in this modal

Found while verifying case A live (USD invoice, USD account): the Salt Edge sandbox provider does not
offer the `DOMESTIC` template, the backend answered

```json
{ "error": { "message": "The selected template is not supported by the chosen provider. Please select a different template.", "status": 400 } }
```

and the modal showed **"No se pudo guardar. Intenta nuevamente."**

`extractSaveError` only read Etendo's JsonDataService envelope (`response.error.message`), never NEO
Headless's own top-level `{error:{message,status}}` — which is what this endpoint actually returns. So
**every** backend rejection on `registerPayment` collapsed into the generic copy: the unsupported
template, the four `PaymentCurrencyConverter` conversion-rate 400s, and the PIS eligibility errors this
ticket itself added. The only way to see the reason was the network tab.

Fixed by reading the NEO shape first and passing the message through `translateBackendError`, so it is
shown in the UI language. New `backendError.*` mappings + en_US/es_ES copy: the PIS template rejection
(the PSD2 module does ship a real es_ES `AD_MESSAGE_TRL` for it, in the separate `.es_es` translation
module, so the mapping covers the case where that module is not installed and is a no-op when it is)
and the four conversion-rate messages, which had never needed one because they were never visible.
When a message has no mapping the raw backend sentence is shown — better an untranslated reason than
no reason at all.

`InvoicePaymentHistoryModal`'s draft-delete had the identical gap on `deletePayment` (same two-step
flow, one line) and is fixed the same way.

## Testing

| Layer | File | Covers |
|---|---|---|
| Backend unit | `PisPaymentServiceTest.java` | Eligibility on the account currency: CHF rejected, null account/invoice currency rejected, EUR/USD/GBP accepted, and **USD invoice + EUR account accepted** (the ticket's case, which threw before) |
| Backend unit | `PisPaymentBridgeCurrencyTest.java` (new) | `templateForCurrency` all three mappings + case-insensitivity + degrade-to-SEPA; `bankAmountFor` same-currency / stored converted amount / recompute from the stored rate / refuse with neither |
| Backend unit | `PaymentRegistrationServiceAdvancedTest.java` | A USD invoice on an EUR account reaches the bridge with **920.00**, captured from the call; still no `FIN_Payment` at confirm |
| Backend unit | `PaymentCurrencyConverterTest.java` | `isCrossCurrency`; `seedInvoiceRateIfAbsent` writes the invoice rate, never overwrites a supplied one, no-ops same-currency, throws with no rate anywhere |
| Backend unit | `FinancialAccountBankConnectionHandlerMulticurrencyTest.java` | Inverted into a reversal guard: connecting an account writes **no** multicurrency flag on any link |
| Frontend render | `NewPaymentEntryModal.vitest.jsx` | 8 new cases: block visible for USD-invoice/EUR-account, conversion fields present, template by account currency (EUR/GBP/USD), the alert states the converted amount, the body still sends invoice amount + rate |
| Frontend source | `NewPaymentEntryModal.test.js` | The account-currency keying, the mapping, the effect's dependency list and the touched-ref guard — the render suite cannot drive the account dropdown (see the ETP-4331 note in the vitest file) |
| CLI | `data-fixes-r29-transfer-link-multicurrency.test.js` (new), `data-fixes-retirement.test.js` | R29 never writes `'N'` and carries no transfer predicate; R14 retired, superseded by R29, checksum matches |
| Frontend render | `NewPaymentEntryModal.vitest.jsx` | 4 cases for the error surfacing: the provider message reaches the screen, so do the conversion-rate ones, an unmapped message shows raw, and a message-less response still falls back to `cpSaveFailed` |
| Frontend unit | `lib/__tests__/backendErrors.test.js` | The 5 new mappings, plus that the two near-identical cross-currency rate messages stay distinct |

Not covered, and stated as such: **no E2E**. `e2e/tests/flows/multi-currency-payment-modal.mocked.spec.js`
has no PIS coverage today, and the SCA popup makes a mocked PIS flow a larger piece of work than this
ticket. The live verification below is what stands in for it.

## Live verification (must be done before calling this closed)

The unit tests mock the bridge, so they prove the amount *handed to* Salt Edge, never the amount Salt
Edge received. Purchase invoice in USD, PSD2-connected account in EUR:

1. The PIS block renders; the template defaults to SEPA; the conversion fields show a prefilled,
   editable rate; the transfer alert states the EUR figure.
2. On confirm, inspect the outgoing Salt Edge request: `amount` = the converted figure,
   `currency_id` = the **account's** currency id.
3. Repeat with a GBP account (→ FPS) and a USD account (→ DOMESTIC).
4. **The one that matters most:** let the bank resolve, then check the created `FIN_Payment` has
   `financialTransactionAmount` **equal** to the amount instructed at step 2, and
   `financialTransactionConvertRate` equal to the rate shown in the modal. This is the only place
   bank and books can drift apart.
5. Abandoning the popup still leaves the invoice untouched (ETP-4895 is unchanged by this work).
6. Regression: cross-currency reconciliation on a PSD2 account with the transfer method no longer
   reports *"not enabled for multi-currency"*; a non-Bank or unconnected account behaves as before.
7. R29 in dry-run, then applied: the transfer links of connected accounts read `Y/Y` and no other row
   moved.
