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

### 3.1 The grace anchor is the end of the paid period — read differently per event

Two events can drive the projection into `PAST_DUE`, and Stripe exposes the paid-period
boundary under a different field on each, so each is read on its own terms rather than
through one shared fallback:

- **`invoice.payment_failed`** anchors on `invoice.period_end` — the failed invoice's own
  paid period. There is **no fallback to `current_period_end`**: an invoice object carries
  no such field, so a fallback there would either read nothing or, on a payload that also
  happened to nest a subscription object, read the wrong thing. An invoice missing
  `period_end` is ignored (`"missing period end"`), never written half-way.
- **`customer.subscription.updated` with `status` `past_due`/`unpaid`** anchors on the
  subscription's `current_period_start` — **not** `current_period_end`. Stripe advances
  `current_period_end` to the *next* (unpaid) period at renewal even when the charge that
  triggered it failed, so on a past-due subscription `current_period_end` names the period
  the customer has **not** paid for. `current_period_start` is the boundary of the period
  they did pay for.
- **An already-stored `PAST_DUE` due date is kept.** If the projection is already `PAST_DUE`
  with a due date on file when a `customer.subscription.updated` past-due event arrives,
  that stored due date wins over any anchor recomputed from the subscription object.
  `invoice.payment_failed` is the authoritative source for the grace anchor; a later
  `updated` event corroborates the status but must not silently move an already-committed
  deadline.

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

### 3.4 Out-of-order delivery is resisted with a stored event watermark

Stripe does not guarantee delivery order, and a `FAILED` row is retried later on Stripe's
own schedule — so a `past_due` event created before the `CURRENT` a later `invoice.paid`
already applied must not be allowed to overwrite it just because it happens to arrive after.

A new `AD_Preference` attribute, `ETGO_SubscriptionEventAt`, stores the Stripe `created`
instant (event-envelope level, not the nested object) of the last **applied** lifecycle
event for the client. Before interpreting an event,
`SubscriptionLifecycleApplier.evaluate(type, event, stored)` compares the event's own
`created` against that watermark:

- **Strictly older** → ignored, `failure_reason = "stale event"`. The stored projection is
  left untouched.
- **Same second, or no watermark stored yet** → evaluated normally.

Only an event that is actually **applied** (not ignored, not a failed store) advances the
watermark — an event that changed nothing must not raise the bar for a genuinely
older-but-unprocessed event that arrives later.

### 3.5 The Stripe API version is not pinned, so both payload shapes are read

Nothing in this task pins `Stripe-Version`. Two fields moved shape between API versions,
and the account's actual configured API version decides which shape Stripe sends on any
given event — so both are read rather than choosing one:

- **Subscription period boundaries** (`current_period_start`, `current_period_end`):
  top-level on the subscription object before API `2025-03-31`, moved onto the first
  subscription item (`items.data[0].current_period_*`) from that version on.
- **Invoice → subscription linkage**: `invoice.subscription` directly, or — from the same
  API version — nested at `invoice.parent.subscription_details.subscription`.

Pinning a version was considered and rejected: it would trade "read both shapes once" for
"track Stripe's deprecation calendar and re-pin," with no correctness gain — the two shapes
carry the same values, just at a different path.

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
| `invoice.payment_failed` | `PAST_DUE` | end of the failed invoice's own period (`period_end`) |
| `customer.subscription.updated`, `active`/`trialing` | `CURRENT` | cleared |
| `customer.subscription.updated`, `past_due`/`unpaid` | `PAST_DUE` | end of the already-paid period (`current_period_start`) — kept unchanged if a `PAST_DUE` due date is already stored (§3.1) |
| `customer.subscription.updated`, `canceled` | `EXPIRED` | cleared |
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

### 4.5 A failed write rolls back before the row is marked `FAILED`

Two failure exits roll back the current DAL session
(`EtendoGoDalHelper.rollbackDalChanges(...)`) before `billingEventStore.markFailed(...)`
commits the `FAILED` row:

1. The generic `catch (RuntimeException e)` around `applyCheckoutEvent` in
   `handleCheckoutWebhook` — this wraps both event families, so it covers subscription
   lifecycle events too, not only the payment-confirmation path.
2. The `"Could not store the subscription projection"` exit inside
   `applySubscriptionLifecycle`, taken when `updateSubscriptionStatus` returns `false`.

Without the rollback, a partially-applied write (e.g. the status column written but a
later column in the same call throwing) could commit alongside the `FAILED` marker, so a
retried delivery would be "repairing" a row that was never actually clean. The billing-event
claim row itself is unaffected by the rollback — it was already committed, in its own
transaction, by `CheckoutWebhookProcessor`'s idempotency claim before this handler ran.

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

### 5.3 Provider call hygiene

`currency` is upper-cased server-side (`Locale.ROOT`) before it reaches the response —
Stripe returns it lower-case, and `formatCurrency` expects an ISO 4217 code. Every Stripe
HTTP call `StripeCustomerPortalService` makes carries a 5s connect / 10s read timeout
(`CONNECT_TIMEOUT_MS` / `READ_TIMEOUT_MS`), so a slow or hung provider cannot hold a servlet
thread indefinitely; a timeout surfaces as an ordinary provider `IOException`, handled the
same way as any other Stripe HTTP failure on that call (e.g. `502 BILLING_PROVIDER_ERROR`
for the portal endpoint).

## 6. Frontend

A new Subscription section in `AccountSettingsPage`, with its two API clients added to
`tools/app-shell/src/lib/upgrade/api.js` alongside the existing billing calls.

Repo rules that apply, all of them enforced by existing guardrails:

- Requests go through the shared, policy-compliant `apiFetch` — never a bare `fetch`
  (`docs/request-policy.md`). `getSubscription(baseUrl)` and `createPortalSession(baseUrl)`
  (`tools/app-shell/src/lib/upgrade/api.js`) call `apiFetch` with `{ baseUrl, on401: 'ignore' }`,
  exactly like every other billing call in that module since the backend-managed session
  (ETP-4576, `docs/adr/0001-backend-managed-session.md`): the credential comes from the active
  session scheme — the `__Host-go_session` cookie, or the legacy bearer while it is still
  enabled — and `apiFetch` adds the `X-Go-CSRF` write proof to the portal POST. No component
  reads or passes a token. `on401: 'ignore'` keeps a 401 mapped onto `sessionExpired` rather
  than logging the user out from the Account page.
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
`ETGO_SubscriptionDueAt` / `ETGO_SubscriptionEventAt` preferences (the last is the
out-of-order-delivery watermark, §3.4). PRD §11.2 has ETP-5046 retiring that write path in
favour of `ETGO_SUBSCRIPTION`.

**ETP-5046's backfill must cover what this task has written by then**, not only the
historical `productive` markers. This needs to be confirmed with the ETP-5046 owner before
that task starts.
