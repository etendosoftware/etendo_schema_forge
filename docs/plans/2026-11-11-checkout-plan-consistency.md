# Checkout plan consistency and introductory offer

Jira: ETP-6216. Scope: the functional application and the Etendo GO billing adapter.

Status: implemented and committed on `feature/ETP-6216`; publication checks are in progress.
Human QA and live Stripe validation remain pending. No deployment has been performed.

## Problem

Before this change, creating a purchase looked up an unfinished purchase by account and company
name before reading the selected plan. It could return that purchase's original Stripe Checkout URL even when
the customer selected another plan or billing interval. The original price must remain immutable
when explicitly resuming a purchase, but resuming must not silently override a new selection.

## Contract

- An ordinary retry resumes only the same catalog plan and persisted provider Price.
- A different selection returns an explicit conflict. The payment screen offers a deliberate
  replacement action; it never redirects to the old price on that conflict.
- Replacing an unpaid purchase first expires its provider session and confirms it is unpaid.
  The old purchase is retained as expired and its successor is recorded atomically. Both reopen
  and replacement serialize on the existing purchase row. A completed, paid or provisioning
  purchase cannot be replaced. An uncertain provider answer creates no successor.
- A provider Price must agree with the catalog amount, currency and recurring interval before
  it can be sold. Legacy fallback pricing remains provider-derived.
- Each new monthly purchase charges one normal monthly installment immediately, receives the
  second month free, then resumes normal monthly billing from month three. The offer is recorded
  durably before contacting Stripe and applied idempotently through a subscription schedule.
- The annual price already represents ten monthly installments for twelve months. Do not add
  another annual discount. Reactivations and pre-existing purchases do not acquire the new offer.
- Keep the existing tax configuration. Amounts continue to use the application's currency tools.

## Verification

Extend existing servlet, checkout-provider, persistence, API and payment-page tests. Cover changed
plan, changed Price under the same plan, same-plan retry, explicit replacement, provider expiry
failure, paid/provisioning conflicts, stale replacement attempts and lost-response retries.
Verify the monthly schedule, webhook retries and annual no-discount behavior independently.
No production payments, coupons, schedules or deployments are part of local verification.

## Rollout prerequisites

Each tier needs separate monthly and yearly catalog rows with distinct keys and actual Stripe
Prices for the destination account: four tiers therefore require eight configured Prices. A
yearly row must charge ten times the corresponding monthly amount for a twelve-month interval
(for example EUR 110/year versus EUR 11/month), with no additional annual coupon. The application
must not synthesize an annual plan from a monthly row or offer an unconfigured Price.

Deploy the frontend and GO adapter together, verify the catalog/Price agreement, and separately
verify the promotion schedule with the destination Stripe account. Existing pending purchases
keep their original conditions unless the buyer deliberately replaces them; existing paid
subscriptions and reactivations do not acquire the new introductory offer. The monthly offer is
shown only when the server marks the plan eligible. Keep current tax configuration unchanged.

## Local validation and repeatable commands

The existing API suite passed 87 tests and the upgrade-page Vitest suite passed 103 tests:

```sh
# From schema-forge:
node --test tools/app-shell/src/lib/__tests__/upgrade-api.test.js
cd tools/app-shell
npm run test:vitest -- src/pages/__tests__/UpgradePage.vitest.jsx
```

The normal Gradle task compiled the application and test sources and passed the focused selection:
239 tests across ten classes, with zero failures, errors or skips. This includes 15 price-service
tests using real localhost HTTP fixtures. The earlier cached-jar fallback was superseded after
aligning this isolated environment with the canonical core baseline and regenerating its SQLC
test fixture. Those setup changes did not modify the delivered application sources.
The repeatable repository command, from the Etendo root with JDK 17, is:

```sh
./gradlew goTestUnit \
  --tests com.etendoerp.go.payment.CheckoutPromotionTermsTest \
  --tests com.etendoerp.go.payment.MonthlySecondMonthPromotionServiceTest \
  --tests com.etendoerp.go.payment.PromotionRecoveryTest \
  --tests com.etendoerp.go.payment.HostedCheckoutServiceTest \
  --tests com.etendoerp.go.payment.HostedCheckoutSessionPlanTest \
  --tests com.etendoerp.go.payment.HostedCheckoutLegacyFallbackTest \
  --tests com.etendoerp.go.payment.StripePriceServiceTest \
  --tests com.etendoerp.go.rest.EtendoGoJwtServletBillingCookieAuthTest \
  --tests com.etendoerp.go.rest.EtendoGoJwtServletTest \
  --tests com.etendoerp.go.payment.SubscriptionLifecycleApplierTest
```

The focused local mocked Playwright scenario passed conflict → explicit confirmation → selected
plan replacement with one worker and zero retries. It asserted the 409 response, the selected
plan and predecessor ID in the replacement request, and the 201 response before following the
mock Checkout URL. Its sanitized screenshot and exact commands are in the
[delivery evidence](../../artifacts/delivery-evidence/ETP-6216/README.md). Restoring the unchanged
lockfile dependencies resolved the old copied-tooling mismatch; the previous sandbox/browser
startup restrictions no longer apply to this validation.

The full pre-push suite also covers reconciliation integration. Its first execution exposed a
missing collaborator seam for promotion recovery; the service now follows the reconciler's
existing injectable-collaborator pattern, with regression cases for live/dry runs and phase
failure isolation. Its complete `BillingReconciliationServiceTest` class passed 69 tests with
zero failures, errors or skips through normal Gradle after that correction. Publication requires
the full pre-push checks to pass; current results belong in
the delivery evidence rather than being inferred from the focused selection above.

No database concurrency, live Stripe billing, real coupon/schedule, or production deployment was
validated. Human QA remains pending: Matías Bernal / Emilio Polliotti.
