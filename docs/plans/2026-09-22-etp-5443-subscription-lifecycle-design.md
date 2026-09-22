# Design: ETP-5443 — Minimum Complete Subscription Lifecycle

- **Status:** Approved for implementation
- **Date:** 2026-09-22
- **Task:** ETP-5443
- **Repos touched:** `com.etendoerp.go` (webhooks, endpoints), `etendo_schema_forge` (Account settings UI)
- **Implements part of:** [`2026-08-27-recurring-billing-and-resource-limits-prd.md`](2026-08-27-recurring-billing-and-resource-limits-prd.md)

---

## 1. Summary

Close the loop between Stripe subscription events and Etendo environment access, and give
the account owner a surface to see and manage their subscription.

Paid checkout already creates Stripe subscriptions and persists the customer and
subscription identifiers (ETP-5045). ETP-5396 already built the access-policy state
machine. What is missing is the wiring: nothing feeds that state machine from Stripe, and
the owner has no way to reach the Customer Portal.

**This task is wiring, not new architecture.** Most of what it needs already exists.

## 2. What already exists

| Piece | Where | Status |
|---|---|---|
| Durable checkout state, `stripeCustomer` / `stripeSubscription` | `CheckoutRequestStore` (ETP-5045) | done |
| Webhook signature + idempotency claim | `CheckoutWebhookProcessor`, `BillingEventStore` | done |
| Subscription state storage | `ETGO_SubscriptionStatus`, `ETGO_SubscriptionDueAt` preferences (ETP-5396) | done |
| Grace period, configurable | `etendo.go.billing.grace.days`, default 15 | done |
| Access decision | `EnvironmentAccessPolicy.evaluate()` — `PAST_DUE` / `SUBSCRIPTION_REQUIRED` | done |
| Customer Portal call | `StripeCustomerPortalService.createSession()` | done (WIP) |
| Subscription/customer lookups | `CheckoutRequestStore.findByStripeSubscription` / `findByStripeCustomer` | done (WIP) |
| Route scaffolding + `SUBSCRIPTION_EVENT_TYPES` | `EtendoGoJwtServlet` | declared, unused |

## 3. Decisions taken

### 3.1 The grace anchor is the end of the paid period

When `invoice.payment_failed` arrives, `ETGO_SubscriptionDueAt` is set to the **end of the
period the failed invoice covers** (`invoice.period_end`, falling back to the
subscription's `current_period_end`) — not the moment the charge failed.

The customer paid through that date. Anchoring the 15 days anywhere earlier takes away
days they already bought: Stripe commonly attempts renewal a few days before the period
closes, so anchoring on the failure would block them before their paid entitlement ends.

```
paid through 31/10                    blocked
──────────────────●───────15 days───────●
                31/10                 15/11
   charge fails 28/10 — irrelevant to the anchor
```

### 3.2 The Subscription surface is a section of `/account`

Not a new route. `AccountSettingsPage` is already the account-level surface, and a
subscription is account information rather than its own destination. Less new surface,
less i18n, nothing new for the user to discover.

Reachability while the ERP is blocked is satisfied by construction: the billing endpoints
hang off `runWithPlatformAccount`, which authenticates the *platform* account, not the
environment. That is why `/upgrade` already survives the paywall, and the same holds here.

### 3.3 Stored state, live display detail

Webhooks write **only** what the access policy needs: `ETGO_SubscriptionStatus` and
`ETGO_SubscriptionDueAt`. Both already exist.

Everything the page merely displays — plan name, amount, currency, renewal date,
cancellation-at-period-end — is read live from Stripe when the page loads.

Rationale: the access policy runs at ERP login and cannot depend on an external call, so
its inputs must be stored. Display detail has no such constraint, and storing it would add
four fields that can silently drift when a webhook is missed, plus four more fields for
ETP-5046's backfill to migrate.

## 4. Backend — webhook routing

### 4.1 Dispatch

`applyCheckoutEvent` currently discards anything outside `CHECKOUT_PAID_EVENT_TYPES`. It
splits into two branches; the payment branch is unchanged.

```java
private void applyCheckoutEvent(String eventId, String type, JSONObject event) {
  if (CHECKOUT_PAID_EVENT_TYPES.contains(type)) { applyCheckoutPaid(eventId, event); return; }
  if (SUBSCRIPTION_EVENT_TYPES.contains(type)) { applySubscriptionLifecycle(eventId, type, event); return; }
  billingEventStore.markIgnored(eventId, "unhandled event type");
}
```

Signature verification and the idempotency claim are untouched: both already run in
`handleCheckoutWebhook` before dispatch, so replay protection covers the new events for
free.

### 4.2 Correlation

Lifecycle events carry no `request_id`. That metadata travels only on the checkout
session — as the existing code states, *"every later subscription or invoice event arrives
keyed by the subscription rather than by the request."*

```
invoice.*                  → object.subscription
customer.subscription.*    → object.id
     ↓ findByStripeSubscription()
     ↓ (fallback) findByStripeCustomer(object.customer)
     ↓ CheckoutRequest.createdClient
     ↓ TenantEnvironmentLifecycleService
```

**Unresolvable events are ignored, never blocking.** `markIgnored(eventId, "unresolved
subscription")` records them in `ETGO_BILLING_EVENT` so they remain findable. This follows
PRD §9.2: *"A tenant with no subscription row is never blocked. This is what keeps
grandfathered and free tenants safe if the switch is flipped early."*

### 4.3 Transitions

| Event | Status | `DueAt` |
|---|---|---|
| `invoice.paid` | `CURRENT` | cleared |
| `invoice.payment_failed` | `PAST_DUE` | end of the failed invoice's period |
| `customer.subscription.updated` | `active` → `CURRENT`; `past_due` / `unpaid` → `PAST_DUE`; `canceled` → `EXPIRED` | period end when `PAST_DUE` |
| `customer.subscription.deleted` | `EXPIRED` | cleared |

`cancel_at_period_end = true` on `updated` **does not change the status**. Access continues
until Stripe sends `deleted` at the period boundary, which is exactly what "cancellation
scheduled at period end keeps access until the paid period ends" requires. The flag is
display-only and read live (§3.3).

### 4.4 The `DueAt` landmine

`EnvironmentAccessPolicy.evaluate()` grants the grace window only when `renewalDueAt` is
non-null:

```java
if (subscriptionStatus == SubscriptionStatus.PAST_DUE
    && environment.renewalDueAt != null
    && now.isBefore(environment.renewalDueAt.plus(configuration.renewalGraceDays, ChronoUnit.DAYS))) {
  return Decision.ALLOWED;
}
return Decision.SUBSCRIPTION_REQUIRED;
```

**Writing `PAST_DUE` without a due date locks the customer out instantly, with zero grace,
and nothing reports it.** The lifecycle writer must refuse that combination: if no period
end can be extracted from the payload, the event is marked ignored and the status is left
untouched rather than written half-way.

This must be covered by an explicit test. It is the single highest-consequence defect this
task can ship.

## 5. Backend — endpoints

Both hang off `runWithPlatformAccount`, which resolves the account from the JWT.

**No identifier is ever read from the request.** The account, its `CheckoutRequest`, its
`stripeCustomer` and its `stripeSubscription` are all derived server-side from the
authenticated token. The acceptance criterion *"a browser request cannot choose another
account, customer, subscription, client, or environment by sending identifiers"* is
satisfied by construction rather than by validation.

### 5.1 `GET /billing/subscription`

Resolves the account's `CheckoutRequest`, fetches the subscription detail from Stripe, and
merges it with the stored status, due date and remaining grace days.

Returns: plan name, amount and currency, subscription/payment state, renewal date,
cancellation-at-period-end, grace state and remaining days.

An account with no subscription gets a well-formed "no subscription" response, not a 404 —
the page must render for free and grandfathered accounts too.

### 5.2 `POST /billing/subscription/portal`

Resolves the account's `stripeCustomer` and calls the existing
`StripeCustomerPortalService.createSession()`. Returns the short-lived portal URL.

The `return_url` comes from `PublicUrlResolver.resolveConfiguredAppBaseUrl() + "/account"`,
never from the browser's `Origin` — the same rule hosted checkout already follows.

## 6. Frontend

A new Subscription section in `AccountSettingsPage`, with its two API clients added to
`tools/app-shell/src/lib/upgrade/api.js` alongside the existing billing calls.

Repo rules that apply, all of them enforced by existing guardrails:

- Requests go through `useApiFetch` — never a bare `fetch` (`docs/request-policy.md`).
- Every user-visible string gets a key in **both** `en_US.json` and `es_ES.json`.
- Amounts render through `formatCurrency`; dates through `formatCalendarDate`.
- Every element a test queries carries a `data-testid`.

## 7. Testing

All test work is delegated to the `test-generator` agent per `CLAUDE.md`.

| Area | Case |
|---|---|
| Authorization | An account cannot read another account's subscription |
| Portal | Session created from the stored customer id; no id accepted from the request |
| Idempotency | A replayed lifecycle event applies exactly once |
| Failure | `invoice.payment_failed` → `PAST_DUE` with the period end recorded |
| Recovery | `invoice.paid` → `CURRENT` with the due date cleared |
| Cancellation | `cancel_at_period_end` keeps access; `deleted` ends it |
| **Grace boundary** | Allowed at `dueAt + 14d 23h`; blocked at `dueAt + 15d` — **both sides** |
| **Null due date** | `PAST_DUE` is never written without a due date |
| Correlation | An unresolvable subscription is ignored and never blocks |

## 8. Out of scope

Invoice history UI, a custom payment-method or invoice UI outside the Customer Portal,
immediate destructive cancellation as the default, and billing analytics.

## 9. Handoff to ETP-5046

This task writes subscription state into the `ETGO_SubscriptionStatus` /
`ETGO_SubscriptionDueAt` preferences. PRD §11.2 has ETP-5046 retiring that write path in
favour of `ETGO_SUBSCRIPTION`.

**ETP-5046's backfill must cover what this task has written by then**, not only the
historical `productive` markers. This needs to be confirmed with the ETP-5046 owner before
that task starts.
