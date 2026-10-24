# Stripe sandbox: local testing guide

This guide validates the hosted Checkout flow against a local Etendo Go backend. It covers two
levels:

- **Offline simulation** — sign and post a Checkout webhook yourself. No Stripe account, no
  `sk_test_` key and no `stripe listen` process. This exercises everything after the redirect:
  signature verification, de-duplication, payment correlation, status polling and paid onboarding
  resume.
- **Stripe Test Mode** — the real hosted Checkout page, real events forwarded by Stripe CLI.

It never uses live keys and never sends raw card data to Etendo.

## 1. What is being tested

The browser sends an authenticated intent to Etendo Go, naming a plan by key. The backend resolves
that plan's Stripe Price (or, under the legacy price fallback, the configured one), creates a hosted
Checkout Session at Stripe, and returns a redirect URL. Stripe handles the card
form. Stripe then delivers `checkout.session.completed`, which the backend verifies and correlates
back to the originating account so onboarding can resume.

All of it is implemented on this branch:

- `POST <base>/sws/go/checkout/sessions` creates a hosted session.
- `POST <base>/sws/go/billing/purchases` creates the purchase boundary and reopens the existing
  hosted session correlation when an unpaid `CREATING` or `CREATED` purchase is retried.
- `GET  <base>/sws/go/plans` lists the purchasable plans (`planKey`, name, description, display
  price, currency, interval — never a provider price id).
- Both checkout writes above take a `planKey` naming a row in the Subscription Plan Catalog
  (ETP-5046). A key that names no active plan is rejected `400 PLAN_NOT_AVAILABLE` without
  revealing which keys exist; an active plan other than `legacy-productive` with no provider price
  answers `503 CHECKOUT_NOT_CONFIGURED`.
  **Legacy price fallback:** while no active plan carries a provider price and
  `etendo.go.checkout.price.id` is set, `GET /sws/go/plans` lists only `legacy-productive`
  (quoted from that Stripe price) and a request naming `legacy-productive` — or no plan — is sold
  at that price. Creating the first priced plan retires the fallback immediately; the same request
  then answers `400 PLAN_NOT_AVAILABLE` and the page asks the buyer to reload.
- `GET  <base>/sws/go/checkout/sessions/{requestId}` reports `pending` or `paid`.
- `POST <base>/sws/go/checkout/webhook` verifies the Stripe signature, de-duplicates by event id
  durably (`ETGO_BILLING_EVENT`, see below), and records the payment **and** the subscription
  lifecycle (ETP-5443, see below): `invoice.paid`, `invoice.payment_failed`,
  `customer.subscription.updated` and `customer.subscription.deleted`.
- `GET  <base>/sws/go/billing/subscription` returns the account's live subscription detail plus
  the stored grace state (ETP-5443).
- `POST <base>/sws/go/billing/subscription/portal` opens a Stripe Customer Portal session for the
  account's stored customer (ETP-5443).
- Server-side pricing: the plan's Stripe Price, validated on every checkout; the charged price id
  is stored on the purchase and on the subscription it opens.
- Paid onboarding resume: the `requestId` is passed back as `paymentToken` on the onboarding call.

### Payment state is durable (ETP-5045)

Checkout state lives in `ETGO_CHECKOUT_REQUEST`, one row per attempt, written before Stripe is
contacted and advanced by each step that succeeds:

```sql
select request_id, checkout_status, creating_at, created_at, paid_at,
       provisioning_at, provisioned_at, created_client_id, failure_reason
  from etgo_checkout_request order by created desc limit 5;
```

Expect `CREATING -> CREATED -> PAID -> PROVISIONING -> PROVISIONED`. The status only moves
forward: a replayed webhook or a browser reload is silently ignored rather than rewinding it,
and each phase timestamp is first-write-wins, so `paid_at` keeps meaning *when the payment was
confirmed*.

### Retrying an interrupted purchase

The purchase endpoint is safe to retry after a browser refresh or a lost redirect. If the same
account and environment name already have a `CREATING` or `CREATED` request, the backend reopens a
provider checkout using that request's existing correlation id and returns `200` with a new
`checkoutUrl` and the same `requestId`. It does not create a second purchase row. A request that is
already `PAID`, `PROVISIONING`, or `PROVISIONED` returns `409`; the client must resume the paid
onboarding path or show the final environment state instead of charging again.

Consequences to plan around:

- **A Tomcat restart no longer loses a payment.** Restart between the webhook and the poll and
  the status endpoint still answers `paid`. That is the acceptance criterion of ETP-5045 and is
  worth re-running whenever this path changes.
- **A webhook only records a payment against a request row that already exists.** An invented
  `requestId` is still acknowledged with `200 {"received":true}` and marks nothing as paid -- but
  it is no longer silent: the delivery lands in `etgo_billing_event` as `IGNORED` with
  `failure_reason = unknown checkout request` (see below). Start the flow with
  `POST /checkout/sessions` first (see the offline stub in section 4), or the simulation looks
  like it worked and did nothing.
- `GET /checkout/sessions/{requestId}` answers `200 {"status":"pending"}` for *any* unknown id,
  and for a request belonging to another account. It deliberately never 404s and never reveals
  another account's payment or client name, so the "another user's status" scenario is verified
  by a non-disclosing `pending`, not by an error code.
- A second onboarding call with an already-claimed `paymentToken` is refused with a 409. While
  the first call is still running the code is `PROVISIONING_ALREADY_IN_PROGRESS` (the
  reload-during-provisioning guard). Once the request is final it says so instead:
  `PROVISIONING_ALREADY_COMPLETED` for an environment already set up (a spent token cannot create
  a second one) and `PROVISIONING_RETRY_NOT_ALLOWED` for a failure no retry can fix, such as
  `CLIENT_NAME_IN_USE`.
- `DERIVED_STATUS` is a computed column, not a stored one -- read it through the DAL or inline
  the expression from `AD_COLUMN.SQLLOGIC`. `SELECT derived_status` fails. It reports `DONE`,
  `IN_FLIGHT`, `ABANDONED`, `EXPIRED` or `STALLED`; **`STALLED` on a `PAID` row is the one that
  should page someone** -- charged, not provisioned.

### Billing events are durable (ETP-5045)

Webhook de-duplication is no longer an in-memory map. Every delivery that passes the signature
check is claimed in `ETGO_BILLING_EVENT`, one row per Stripe event id; the unique constraint on
`EVENT_ID` is the idempotency gate, so a retry after a Tomcat restart or on a second node arrives
as a duplicate instead of being applied again:

```sql
select event_id, event_type, event_result, request_id, etgo_checkout_request_id,
       duplicate_count, received_at
  from etgo_billing_event order by received_at desc;
```

Reading a row:

- `event_result` moves `RECEIVED -> APPLIED | IGNORED | FAILED`. `RECEIVED` is the claim itself;
  **`APPLIED` means a payment was actually recorded** on a known checkout request; `IGNORED` means
  the event was acknowledged on purpose (`failure_reason` says why — one of three reasons:
  `unhandled event type`, `missing correlation metadata`, or `unknown checkout request`);
  `FAILED` means the handler threw and the webhook answered `500 CHECKOUT_WEBHOOK_FAILED`, so
  Stripe retries.
- The three end states are **not** equally locked, which matters when you read a row:
  - `APPLIED` is terminal and enforced in code — no later write can move a row out of it, so a
    failure on a redelivery cannot reopen an event whose payment was already recorded.
  - `IGNORED` is terminal by intent but **not** locked: a later failure on the same id does
    overwrite it, which makes the row re-claimable again. That is deliberate — a later delivery
    may carry the correlation the ignored one lacked.
  - **`FAILED` is re-claimable:** the next delivery of the same event id flips the row back to
    `RECEIVED` and is processed as new, which is how Stripe's own retry schedule repairs a
    transient failure without anyone touching the database.
- **`failure_reason` is not only about failures.** The same column carries the `IGNORED` reason, so
  most rows in a healthy instance read `unhandled event type` in a column named failure reason —
  by design, not a bug. On the genuine failure path it holds a fixed phrase plus the **exception
  class name only**; the provider-controlled exception message is never stored (it can quote
  payload fragments), it stays in the log.
- A redelivery never adds a row. It increments `duplicate_count`, sets `last_duplicate_at` and
  answers `200 {"received":true}`; `event_result`, `received_at` and `processed_at` stay as they
  were (`processed_at` is first-write-wins).
- `request_id` is always the raw `metadata.request_id`. `etgo_checkout_request_id` is the link to
  `ETGO_CHECKOUT_REQUEST`, resolved at claim time and only when that request exists -- so an
  invented `--request-id` produces an **`IGNORED`** row (`failure_reason = unknown checkout
  request`) with an empty link and an error in the log, and nothing marked as paid. An `APPLIED`
  row with no link cannot occur.
- `payload_summary` is an allow-list (`data.object.{id,customer,subscription,livemode,
  payment_status,amount_total,currency,mode}` + `metadata.request_id`, at most 2000 chars). It
  never holds the raw body or card data; if it ever does, that is a bug to report. The policy
  lives in `WebhookPayloadSummary` (pure JSON, no DB), so a test double and the production store
  are summarized by exactly the same code.
- A delivery rejected with `400` (bad signature, bad payload) writes **no row** -- verification
  runs before the store is consulted.

Both tables are readable as System Administrator without DB access: the Classic windows
**Checkout Request** (its **Billing Event** child tab lists the events linked through
`etgo_checkout_request_id`) and **Billing Event** (standalone, every event including those with no
link). Both are read-only.

### Subscription lifecycle (ETP-5443)

Once a checkout has created a Stripe subscription, four more event types keep Etendo's access
decision in sync with it. `applyCheckoutEvent` routes them to a second path
(`applySubscriptionLifecycle`), separate from the two payment-confirmation types above but
sharing the same signature verification and idempotency claim — nothing new to configure or
re-test for replay protection.

| Event | Target status | `ETGO_SubscriptionDueAt` |
| --- | --- | --- |
| `invoice.paid` | `CURRENT` | cleared |
| `invoice.payment_failed` | `PAST_DUE` | end of the failed invoice's own period (`period_end`) |
| `customer.subscription.updated`, `status` `active`/`trialing` | `CURRENT` | cleared |
| `customer.subscription.updated`, `status` `past_due`/`unpaid` | `PAST_DUE` | end of the **already-paid** period (`current_period_start`) — kept unchanged if a `PAST_DUE` due date is already stored (see below) |
| `customer.subscription.updated`, `status` `canceled` | `EXPIRED`, row **closed** (ETP-5047) | cleared |
| `customer.subscription.deleted` | `EXPIRED`, row **closed** (ETP-5047) | cleared |
| `charge.dispute.created` (ETP-5047) | unchanged — alert only | unchanged |

**Lifecycle matrix — what the tenant sees (ETP-5047).** The access decision is
`EnvironmentAccessPolicy`'s, evaluated on every NEO, MCP and `JwtAuthUtils`-servlet request
(favorites, report selectors, survey config, fiscal test mode):

| Stored state | Within grace (`due date + etendo.go.billing.grace.days`) | After grace |
| --- | --- | --- |
| `CURRENT` (`active`) | allowed | allowed |
| `PAST_DUE` (`past_due`) with a due date | allowed | **402 `SUBSCRIPTION_REQUIRED`** |
| `PAST_DUE` (`past_due`) with **no** due date | **402 `SUBSCRIPTION_REQUIRED`** (no anchor ⇒ no grace) | **402 `SUBSCRIPTION_REQUIRED`** |
| `EXPIRED` (`canceled`, open or closed row) | **402 `SUBSCRIPTION_REQUIRED`** | **402 `SUBSCRIPTION_REQUIRED`** |
| demo past its trial | — | **402 `DEMO_TRIAL_EXPIRED`** |

The platform-account endpoints (billing overview, the Stripe portal, purchases, `/plans`) never
refuse, and entering the environment (`POST /sws/go/session/environment`) is not refused either —
it answers with an informational, backend-only `accessDecision` — so a blocked customer always
reaches the blocked screen (driven by the NEO 402) and the pay path. See "The 402 body and the kill switch" below.
The webhook never stores `PAST_DUE` without a due date (it ignores the event as `missing period
end`); only an R37-backfilled row can have that shape (`com.etendoerp.go`
`docs/open-and-notable-topics.md` §3.11). For deploy order, switching enforcement off in a shared
environment and what support sees for a blocked tenant, see "Operating environment-access
enforcement" in `com.etendoerp.go` `docs/feature-flags-and-tenant-upgrade.md`.

**Where the outcome is stored depends on the tenant (ETP-5046).**

- **Tenant with an `ETGO_SUBSCRIPTION` row** — every tenant paid since its environment set
  the system preference `ETGO_SubscriptionModel` to `Y` (the switch decides only a tenant's first
  row: with it OFF — every environment's starting state — a tenant with no row yet that pays writes
  the `ETGO_TenantPlan` marker and opens no row, while a tenant that already has any row, open or
  closed, is always recorded on a row, whatever the switch), and every
  older one once the R37 backfill has run (R37 is opt-in: an environment runs it with
  `make data-fixes FIX=R37-tenant-subscription-backfill` when it switches to the subscription
  model — a plain `make data-fixes` never does): the event writes the row. `CURRENT` → `STATUS = active`,
  `PAST_DUE` → `past_due`, `EXPIRED` → `canceled`, and the due date goes to `GRACE_ANCHOR`
  (cleared → null; before ETP-5047 it was `CURRENT_PERIOD_END`, and a `past_due` row still in
  that shape is read through a fallback). Since ETP-5047 `CURRENT_PERIOD_START/END` hold Stripe's
  billing period (from `customer.subscription.*` and the `invoice.paid` lines, and — for a new
  purchase, whose first events arrive before the tenant exists and are ignored as `unresolved
  subscription` — read once from `GET /v1/subscriptions/{id}` right after the paid onboarding,
  never overwriting a period an event already wrote) and `LAST_EVENT_AT` the ordering watermark.
  Since ETP-5047 a cancellation also **closes** the row (`END_DATE` = Stripe's
  `ended_at`, else `canceled_at`, else now); a closed row reads as `canceled` whatever `STATUS`
  says, so the tenant is `free` and `EXPIRED`, and a new purchase for the same tenant would open a
  **fresh** row. No purchase reaches that tenant yet: letting a canceled tenant re-subscribe its
  own environment was decided on 2026-10-14 (Martin Taal), but the flow is ETP-5742 and does not
  exist yet. Today every checkout provisions a new environment, and since ETP-5047 a canceled
  productive tenant is no longer a demo source either (`com.etendoerp.go`
  `docs/feature-flags-and-tenant-upgrade.md` §3). Query the tenant's rows, newest first:

  ```sql
  select status, start_date, end_date, grace_anchor, current_period_start, current_period_end,
         last_event_at, stripe_subscription_id,
         provider_price_id
    from etgo_subscription
   where environment_client_id = '<clientId>' and isactive = 'Y'
   order by end_date desc nulls first, created desc;
  ```

- **Tenant with no row at all**: the `AD_Preference` projection, as ETP-5443 shipped it —
  `ETGO_SubscriptionStatus` and `ETGO_SubscriptionDueAt`, scoped to the tenant's `Client`. On an
  environment that has not switched `ETGO_SubscriptionModel` ON yet that is every paying tenant —
  the pre-ETP-5046 ones and every tenant paid since ETP-5046 alike, because with the switch OFF a
  first purchase writes the marker and opens no row. On a switched environment it is only a tenant
  R37 has not reached.

The out-of-order-delivery watermark (see below) is `LAST_EVENT_AT` on the row for a tenant with a
row (ETP-5047), and the `ETGO_SubscriptionEventAt` `AD_Preference` only for a tenant without one —
with one read-only exception: while a row's `LAST_EVENT_AT` is still NULL (a row that predates the
column), the preference is read as its watermark, and the first applied event moves it onto the
column.
Read preferences through the classic **Preference**
window as System Administrator (filter by `Attribute` and the tenant's client), or call
`TenantEnvironmentLifecycleService.resolve(clientId)` /
`targetForTenant(clientId, null).storedState()` in a debugger — both read the same store the event wrote to. The expected results in §7 name the
preference values; for a tenant with a row, read them through the mapping above.

**The grace anchor is the end of the paid period, never the moment the charge failed — and each
event reads it from a different field, on purpose.** `invoice.payment_failed` reads
`data.object.period_end`, the failed invoice's own period; there is **no fallback** to
`current_period_end`, because an invoice object carries no such field. `customer.subscription.
updated` with `status` `past_due`/`unpaid` reads the **subscription's** `current_period_start` —
**not** `current_period_end`: Stripe advances `current_period_end` to the next, still-unpaid
period at renewal even when the charge that triggered it failed, so on a past-due subscription
`current_period_end` names the period the customer has **not** paid for, while
`current_period_start` is the boundary of the period they did. If the stored projection is
already `PAST_DUE` with a due date on file, `customer.subscription.updated` keeps that stored
due date rather than recomputing one — `invoice.payment_failed` is the authoritative source for
the grace anchor, and a later `updated` event must not silently move an already-committed
deadline. The customer paid through that date, and Stripe commonly retries a renewal a few days
before the period closes — anchoring on the failure instead would take away days already paid
for. The grace window itself is `etendo.go.billing.grace.days` / `ETGO_BILLING_GRACE_DAYS`,
default 15 days.

**`PAST_DUE` is never written without a due date.** `EnvironmentAccessPolicy.evaluate()` grants
zero grace when `renewalDueAt` is null, so writing the status half-way would lock the customer out
instantly and silently. `SubscriptionLifecycleApplier`'s internal `pastDue(...)` returns an
**ignore** — `failure_reason = "missing period end"` — whenever it has no boundary to anchor on:
`invoice.payment_failed` when the invoice carries no `period_end`, or
`customer.subscription.updated` past_due/unpaid when the subscription carries no
`current_period_start` **and** there is no already-stored `PAST_DUE` due date to keep instead.
Either way, the stored status is left untouched rather than written half-way.

**`cancel_at_period_end = true` does not change the status.** A `customer.subscription.updated`
event with that flag set but `status: "active"` still maps to `CURRENT`: access continues until
Stripe actually sends `customer.subscription.deleted` at the period boundary. The flag is
display-only — the Subscription section on `/account` reads it live from Stripe on every page
load, it is never stored.

An unrecognized `customer.subscription.updated` status (e.g. `incomplete`, `incomplete_expired`)
is ignored with `failure_reason = "unhandled subscription status"` — a different reason string
from the dispatcher's generic `"unhandled event type"`, useful when reading the audit row.

**The Stripe API version is not pinned, so every provider field that could move between
versions is read in both shapes.** Subscription period boundaries
(`current_period_start`/`current_period_end`) are top-level on the subscription object before
API `2025-03-31`, and on the first subscription item (`items.data[0].current_period_*`) from
that version on — `SubscriptionLifecycleApplier.subscriptionPeriodBoundary(...)` tries the top
level first, then falls back to the item. The invoice → subscription link is read the same way:
`data.object.subscription` directly, or `data.object.parent.subscription_details.subscription`
from that same API version. A hand-signed payload in this guide that only sets the
pre-`2025-03-31`, top-level shape is exercising one of the two shapes, not proof the other is
unsupported.

**An older event delivered out of order is ignored as stale, not applied over a newer one.**
Stripe does not guarantee delivery order, and a `FAILED` row is retried later on Stripe's own
schedule. The watermark — `ETGO_SUBSCRIPTION.LAST_EVENT_AT` for a tenant with a row,
`ETGO_SubscriptionEventAt` (an `AD_Preference` on the client) otherwise — stores the `created`
instant — from the event envelope's own top-level field, not the nested object — of the last
**applied** lifecycle event. An incoming event whose `created` is strictly before that stored
value is ignored with `failure_reason = "stale event"`, and the stored projection is left
untouched; an event at the same second, or arriving with no watermark stored yet, is evaluated
normally. Only an event that is actually applied advances the watermark — an ignored or failed
event never does, so it cannot make a later, genuinely out-of-order event look newer than it is.
A hand-signed payload that omits the top-level `created` field is never subject to this check
(there is nothing to compare), which is why the recipe below adds it explicitly for this
scenario.

#### Correlation is different from the checkout path

Lifecycle events carry no `metadata.request_id` — that metadata travels only on the checkout
session, so `CheckoutWebhookProcessor`'s `extractRequestId` finds nothing and claims the event
with a null `request_id`. **A lifecycle event's `ETGO_BILLING_EVENT` row therefore never carries a
`request_id` or an `etgo_checkout_request_id` link, applied or not** — unlike the checkout rows
described above. Correlation instead walks the subscription (ETP-5047: the open row first), then
the checkout request, then the customer:

```
invoice.*                  → data.object.subscription (or parent.subscription_details)
customer.subscription.*    → data.object.id
     ↓ the OPEN etgo_subscription row with that stripe_subscription_id   (targetForSubscription)
     ↓ (fallback) CheckoutRequestStore.findByStripeSubscription(...)
     ↓ (fallback) findByStripeCustomer(data.object.customer)
     ↓ CheckoutRequest.createdClient → the tenant's latest row decides     (targetForTenant)
     ↓ TenantEnvironmentLifecycleService.applySubscriptionEvent(target, outcome, created)
```

`STRIPE_SUBSCRIPTION_ID` is not unique across rows (a plan change keeps the Stripe subscription
and opens a successor row), only across open ones. When the fallback lands on a tenant, the event
is **ignored** instead of written when the tenant's open row names a different subscription
(`failure_reason = "event for another subscription"`) or the tenant has only closed rows
(`"subscription closed"` for a late event of the canceled subscription, `"no open subscription
row"` for the first event of a new purchase before onboarding opens its row).

Both fields were captured once, at checkout time: `applyCheckoutPaid` calls
`checkoutRequestStore.recordPaid(requestId, customer, subscription)` from the ONE event that
carries both ids alongside the correlation id (`checkout.session.completed` /
`.async_payment_succeeded`). Every later invoice or subscription event is keyed by those two
values instead.

**An event that resolves to no environment is ignored, never blocking** —
`failure_reason = "unresolved subscription"`. This covers both a subscription/customer that names
no `ETGO_CHECKOUT_REQUEST` on this instance, and a matched request whose `createdClient` is null.
A tenant with no subscription row is never blocked by a stray lifecycle event; that is what keeps
grandfathered and free tenants safe. If the status write itself fails after a purchase
*was* resolved, the row is marked `FAILED` (`"Could not store the subscription projection"`), not
`IGNORED` — Stripe's retry schedule will re-claim and reprocess it, same as any other `FAILED` row
(§1). Either failure exit — this one, or an exception propagating out of the handler entirely —
rolls back the DAL session (`EtendoGoDalHelper.rollbackDalChanges(...)`) before the `FAILED` row
commits, so a `FAILED` row never coexists with a half-written status/due-date. The billing-event
claim row itself is unaffected: it was committed in its own transaction, earlier, by the
idempotency claim.

#### Disputes are an alert, never a block (ETP-5047)

`charge.dispute.created` is claimed like any other event, recorded `event_result = APPLIED`, and
logged at **WARN** — `Billing alert: Stripe event '<evt>' (charge.dispute.created) — dispute <dp_>
on charge <ch_> (payment intent <pi_>), amount <n> <cur>, reason '<reason>'` — and nothing else
happens: no status, due date or access change. Stripe is arbitrating the chargeback; a lost
dispute reaches the subscription through the ordinary lifecycle events. Subscribe the webhook
endpoint to it in the Stripe Dashboard (or add it to `stripe listen --events`) to receive it.

#### The invoice period is kept in the ledger (ETP-5047)

For `invoice.*` events `payload_summary` also keeps `service_period_start` /
`service_period_end` (epoch seconds), so `ETGO_BILLING_EVENT` holds the history of billed periods.
They are the invoice **line** period — the same one `invoice.paid` writes to the row — not the
invoice's own `period_start` / `period_end`, which on a subscription invoice looks back one
period.

#### The 402 body and the kill switch (ETP-5047)

NEO (every credential scheme), the `NEO_DATA` surfaces (favorites, fiscal test mode, report
selectors), MCP (`/sws/mcp`), the `/sws/go` tenant-session endpoints and the legacy
`GET /sws/go/login?userId=` answer a blocked tenant with **HTTP 402** (the OAuth2 API-key endpoints
refuse through the same check, in the OAuth2 servlet's own error envelope):

```json
{ "error": { "message": "Environment access is not available: SUBSCRIPTION_REQUIRED",
             "status": 402, "code": "ENVIRONMENT_ACCESS_DENIED", "decision": "SUBSCRIPTION_REQUIRED" } }
```

`message` is unchanged from ETP-5443; the SPA reads `error.decision` first and falls back to the
message prefix. `POST /sws/go/session/environment` does not refuse, by decision — it adds
`"accessDecision": "<DECISION>"` to its normal answer, so the blocked customer can still enter,
see the blocked screen and reach `/account` / `/upgrade`. `accessDecision` is informational and
backend-only: the SPA does not read it; its blocked screen follows the NEO 402.

The check has a backend-only kill switch, `environment-access-enforcement-off`. **It enforces
unless the flag resolves to `true`.** Locally that is any of `true`, `Y`, `yes`, `1`
(case-insensitive, trimmed); `false`, `N`, `no`, `0` keep enforcing, and any other value is a
`PARSE_ERROR` that keeps enforcing too, as do an unset key and an unreachable ConfigCat. On
ConfigCat it is the boolean setting served as `true`. To test both states locally, set it in
`Openbravo.properties` and restart Tomcat:

```properties
etendo.go.flags.environment-access-enforcement-off=true
```

With it on, a blocked tenant is allowed and the log shows `Environment access enforcement is
switched off: neo would have refused tenant <id> (SUBSCRIPTION_REQUIRED) and allowed it`, and
`GET /sws/go/environments` reports that tenant's `accessState` as `ALLOWED` (its
`subscriptionStatus` and trial fields still show the facts). Since ETP-5051 each environment
also carries `accessEnforced: false` while the switch is on for it; the SPA's failed-payment
banner then drops its "will be blocked on <date>" sentence for a neutral "payment still overdue"
(`docs/generated-custom-windows/app-shell-functional-flows.md` §3.2a). Remove
the line (or set `false`) to enforce again. On ConfigCat it can be targeted per tenant through the
`clientId` attribute.

### The two account endpoints (ETP-5443)

Both hang off `runWithPlatformAccount`, so the JWT — not a request body field — decides which
account's subscription is read or which portal session is opened.

- **`GET /sws/go/billing/subscription`** — resolves the account's `CheckoutRequest` with a
  `stripeSubscription`, fetches the live detail from Stripe (`plan`, `amountMinor`, `currency`,
  `status`, `renewalAt`, `cancelAtPeriodEnd`), and merges in the stored `graceEndsAt` /
  `graceDaysRemaining` plus `clientId`, the environment the subscription pays for (`null` while
  the purchase has no environment yet). "Mis empresas" no longer reads this endpoint: since
  ETP-5051 O-1b each row takes its own `renewalAt` from `GET /sws/go/environments`. Since ETP-5049 it also carries the plan catalog view of the subscription —
  `planKey`, `planName` and the plan's included `planQuotas` (field reference:
  `com.etendoerp.go/docs/feature-flags-and-tenant-upgrade.md`, *The subscription page*). Since
  ETP-5051 each `planQuotas` item also carries `consumptionSource`, `consumed` (null = not measured
  yet), `verdict` (`ALLOW`/`WARN`/`DENY`, null for mode `off`), `periodStart` and `periodEnd`. The
  `/account` Subscription section shows `planName` (falling back to `plan`, the live Stripe product
  name) and a read-only list of the quotas: catalog name, "consumed of included unit" with the
  period word ("per year" on a yearly plan), a state badge for WARN/DENY, "(not measured yet)" for
  a null `consumed`, and "Your plan has no usage limits." for a plan with an empty `planQuotas`
  (`docs/generated-custom-windows/app-shell-functional-flows.md` §3.2a-quater). It also carries
  `accessEnforced` for the tenant: when it is `false` (kill switch on), the section replaces the
  grace countdown and "access is paused" with a neutral "payment overdue" line. An account with
  none returns `200 {"hasSubscription": false}`, never a `404` — free and grandfathered accounts
  must still render the page.
  **`renewalAt` is the renewal date; the environment's stored `renewalDueAt` is not.** The latter
  is the payment-grace anchor: empty while the subscription is current, the end of the last paid
  period once it is past due.
  **Note:** `status` in this response is Stripe's own live subscription status string (e.g.
  `"active"`, `"past_due"`, `"canceled"`) — not the internal `CURRENT` / `PAST_DUE` / `EXPIRED`
  enum this guide uses above. Use `graceDaysRemaining` / `graceEndsAt` to detect the grace state,
  not a `status` string comparison.
- **`POST /sws/go/billing/subscription/portal`** — resolves the account's stored Stripe customer
  (`CheckoutRequestStore.findBillableForAccount`) and calls `StripeCustomerPortalService.
  createSession(...)`. No subscription for the account → `404 NO_SUBSCRIPTION`. The portal's
  `return_url` is `PublicUrlResolver.resolveConfiguredAppBaseUrl()` (`etendo.go.app.baseUrl` /
  `ETGO_APP_BASE_URL`, legacy `etgo.app.url` / `ETGO_APP_URL`) plus `/account` — never the
  browser's `Origin`, the same rule hosted checkout already follows.

**Note:** `currency` in the `GET .../subscription` response is always upper-cased server-side
(Stripe itself returns it lower-case). Every Stripe HTTP call `StripeCustomerPortalService` makes
(for either endpoint) carries a 5s connect / 10s read timeout, so a slow or hung provider cannot
hold a servlet thread indefinitely — a timeout surfaces as an ordinary provider `IOException`,
the same failure path as any other Stripe HTTP error on that call.

## 2. Base URL and ports

Nothing here is fixed by the module; read the real values from your checkout:

| Value | Where it comes from | Typical local value |
| --- | --- | --- |
| Context path | `etendo_core/gradle.properties` → `context.name` | `etendo` |
| Base URL | port 8080 + context path | `http://localhost:8080/etendo` |
| Frontend origin | `tools/app-shell/vite.config.js` (`strictPort`) | `http://localhost:3100` |

```bash
grep '^context.name' ../gradle.properties
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8080/etendo/sws/go/checkout/webhook
```

A `400` means the servlet is reachable and rejected the missing signature — that is the healthy
answer. A `404` means the context path is wrong.

Export the base URL once so every command and script below picks it up:

```bash
export ETENDO_BASE_URL=http://localhost:8080/etendo
```

The **`Origin` header matters**: `HostedCheckoutService` builds Stripe's `success_url` and
`cancel_url` from it, so a stale origin sends the browser back to a dev server that is not running.
It must also be CORS-allowlisted. `http://localhost:3100` is allowlisted by default; override with
`etgo.allowed.origins` / `ETGO_ALLOWED_ORIGINS` if you serve the SPA elsewhere.

## 3. Configure the local backend

Configuration resolves in this order (`ConfigPropertyReader`):

**JVM system property → `Openbravo.properties` → environment variable → default.**

| Property | Environment variable | Needed for |
| --- | --- | --- |
| `etendo.go.checkout.webhook.secret` | `ETGO_CHECKOUT_WEBHOOK_SECRET` | webhook (offline **and** Stripe) |
| `etendo.go.checkout.secret.key` | `ETGO_CHECKOUT_SECRET_KEY` | creating sessions |
| `etendo.go.checkout.price.id` | `ETGO_CHECKOUT_PRICE_ID` | legacy price fallback only — used while no `ETGO_PLAN` row carries a provider price (ETP-5046) |
| `etendo.go.checkout.mode` | `ETGO_CHECKOUT_MODE` | optional, default `subscription`; validates only the legacy fallback price's recurrence — a plan's checkout mode derives from its Stripe price interval |
| `etendo.go.checkout.api.base.url` | `ETGO_CHECKOUT_API_BASE_URL` | optional, default `https://api.stripe.com` |
| `etendo.go.checkout.connect.timeout.ms` | `ETGO_CHECKOUT_CONNECT_TIMEOUT_MS` | optional, default `10000`; checkout sessions and plan price derivation (`HttpUrlConnectionStripeApiClient`) |
| `etendo.go.checkout.read.timeout.ms` | `ETGO_CHECKOUT_READ_TIMEOUT_MS` | optional, default `20000`; same client |

**What is for sale.** With only the properties above and no `ETGO_PLAN` row carrying a provider
price, checkout sells `legacy-productive` at `etendo.go.checkout.price.id` — enough for every
recipe in this guide. To test the plan catalog instead, create a plan in the Classic **Plans**
window with a Test Mode **Provider Price ID** (active, recurring, `interval_count = 1`); its display
price is derived from Stripe on save, and from the next request on the fallback is retired. Every
listed plan appears as its own card on the **Plan** step of `/upgrade`
(`upgrade-plan-card-<planKey>`, ETP-5049), with the catalog's name, description and price. Full
procedure: `com.etendoerp.go/docs/plans/2026-09-18-etp-5046-plan-and-subscription-design.md` §6.2.

### Use `Openbravo.properties`, not environment variables

`etendo_core/config/Openbravo.properties` is gitignored and untracked, and `smartbuild` copies it
into the deployed webapp. Prefer it for local testing:

```properties
etendo.go.checkout.webhook.secret=whsec_local_simulation
etendo.go.checkout.secret.key=sk_test_REPLACE_WITH_TEST_SECRET
etendo.go.checkout.price.id=price_1U1pJgAwtDoN8Dg5nt6Mi1lM
etendo.go.checkout.mode=subscription
```

```bash
cd etendo_core && ./gradlew smartbuild
```

**Do not rely on `set -a; source .env; ./gradlew smartbuild`** unless Tomcat itself is launched by
that same shell. On a standalone Tomcat (or a container started separately), `smartbuild` only
redeploys the webapp — the running JVM keeps the environment it was started with, so exported
variables are invisible and you get `503 CHECKOUT_NOT_CONFIGURED` forever. The equivalent
JVM-property route is `CATALINA_OPTS="-Detendo.go.checkout.webhook.secret=..."` plus a real Tomcat
restart.

Never commit real keys, and never use `sk_live_...`/`pk_live_...` locally.

## 4. Offline simulation (no Stripe account)

`CheckoutWebhookVerifier` uses the raw UTF-8 bytes of the configured secret as the HMAC key, so any
agreed string is a valid local webhook secret. Set
`etendo.go.checkout.webhook.secret=whsec_local_simulation`, redeploy, and mirror it in `.env`:

```dotenv
ETENDO_BASE_URL=http://localhost:8080/etendo
ETGO_CHECKOUT_WEBHOOK_SECRET=whsec_local_simulation
ETENDO_TEST_EMAIL=goadmin@etendo.software
ETENDO_TEST_PASSWORD=...
```

Then:

```bash
make stripe-simulate
```

That posts a correctly signed `checkout.session.completed`, then logs in and polls the status
endpoint until it reports `paid`. It prints the `requestId`, which is exactly what the upgrade page
sends back as `paymentToken` to resume provisioning.

### Starting the flow without Stripe

Since ETP-5045 the webhook only records a payment against a request row that already exists, and
that row is written by `POST /checkout/sessions` -- which calls the provider. So a webhook alone
is no longer enough to reach `paid` on a fresh id: it is acknowledged and recorded as an `IGNORED`
billing event (`unknown checkout request`), with no payment marked anywhere.

`tools/stripe-session-stub.py` closes that gap. It answers the one endpoint the backend calls
with a plausible Checkout Session, so the whole flow runs with no Stripe account, no test key
and no network access:

```bash
tools/stripe-session-stub.py &          # listens on 127.0.0.1:8099
```

Point the deployed `WEB-INF/Openbravo.properties` at it and restart Tomcat -- all three keys are
required, because `isConfigured()` demands the secret key, the price id and the webhook secret:

```properties
etendo.go.checkout.secret.key=sk_test_offline_stub
etendo.go.checkout.price.id=price_offline_stub
etendo.go.checkout.api.base.url=http://localhost:8099
etendo.go.checkout.webhook.secret=whsec_local_simulation
```

Then drive the full lifecycle:

```bash
TOKEN=$(curl -s -X POST "$ETENDO_BASE_URL/sws/go/login" -H 'Content-Type: application/json' \
  -d '{"email":"'"$ETENDO_TEST_EMAIL"'","password":"'"$ETENDO_TEST_PASSWORD"'"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')

RID=$(curl -s -X POST "$ETENDO_BASE_URL/sws/go/checkout/sessions" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H 'Origin: http://localhost:3100' -d '{"clientName":"Offline Test Tenant"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["requestId"])')

ETENDO_SESSION_TOKEN=$TOKEN tools/stripe-webhook-simulate.sh \
  --request-id "$RID" --client-name "Offline Test Tenant" --status
```

The `requestId` then goes to `POST /sws/go/onboarding` as `paymentToken`. Note the paid path only
engages for an account that **already owns an environment** -- the first one is always free, so a
brand-new account provisions without touching the checkout row at all.

To assert the failure path instead, stop the stub and submit an upgrade: the call answers `502
CHECKOUT_PROVIDER_ERROR` and the `CREATING` row deliberately survives, because it is the evidence
that someone tried to buy something.

**Expected WARNs on every offline paid onboarding (ETP-5047).** After provisioning, the backend
reads the new row's billing period with `GET /v1/subscriptions/sub_sim_…` (the simulator's
`checkout.session.completed` carries a `sub_sim_…` id). The stub answers only `POST`, so Python's
HTTP server refuses the `GET` with `501`, and Tomcat logs two WARNs:

```
Provider answered 501 for GET /v1/subscriptions/sub_sim_… — treating it as unreachable
Could not read the billing period of Stripe subscription sub_sim_… for client <AD_Client_ID>: the payment provider did not answer (…). The subscription row stays without a period until its next lifecycle event
```

Both are expected and harmless: the read is best effort, the onboarding succeeds, and the row
keeps `current_period_start/end` NULL until a lifecycle event that reports a whole period writes
them — the hand-written offline events below carry none, so offline the period normally stays
NULL. The stub is deliberately not extended to answer the `GET`.

The underlying script covers the rest of the matrix:

```bash
# Mark a real Checkout Session as paid (requestId from POST /checkout/sessions)
tools/stripe-webhook-simulate.sh --request-id <requestId> --status

# SF-STRIPE-LOCAL-05 — rejected signature (expects HTTP 400)
tools/stripe-webhook-simulate.sh --invalid-signature

# SF-STRIPE-LOCAL-06 — duplicate delivery: same event id twice, WITH a Tomcat restart in between
# (use the $RID from the stub flow above so the row links to a real checkout request)
tools/stripe-webhook-simulate.sh --event-id evt_restart_001 --request-id "$RID" --status   # paid
#   ... restart Tomcat ...
tools/stripe-webhook-simulate.sh --event-id evt_restart_001 --request-id "$RID" --status   # 200 {"received":true}, still paid
# Then: one etgo_billing_event row for evt_restart_001, event_result=APPLIED, duplicate_count=1 (§1)

# Outside the 300s tolerance window (expects HTTP 400)
tools/stripe-webhook-simulate.sh --skew -400

# Async capture variant
tools/stripe-webhook-simulate.sh --type checkout.session.async_payment_succeeded --status
```

Run `tools/stripe-webhook-simulate.sh --help` for the full option list.

### Doing it by hand

The signature is `HMAC-SHA256("<timestamp>.<raw body>")` keyed by the secret, hex-encoded, with a
300-second tolerance. The signed bytes must be byte-identical to the bytes sent, so build the
payload once:

```bash
BASE=http://localhost:8080/etendo
SECRET=whsec_local_simulation
REQ_ID="req-$(date +%s)"
EMAIL=goadmin@etendo.software
TS=$(date +%s)
PAYLOAD=$(printf '{"id":"evt_%s","type":"checkout.session.completed","data":{"object":{"metadata":{"request_id":"%s","account_email":"%s","client_name":"Sandbox Tenant"}}}}' "$TS" "$REQ_ID" "$EMAIL")
SIG=$(printf '%s.%s' "$TS" "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" -r | cut -d' ' -f1)

curl -i -X POST "$BASE/sws/go/checkout/webhook" \
  -H 'Content-Type: application/json' \
  -H "Stripe-Signature: t=$TS,v1=$SIG" \
  --data-raw "$PAYLOAD"
```

`metadata.request_id` **and** `metadata.account_email` are both mandatory — without either, the
backend answers `200 {"received":true}` and records nothing. The email must match the account that
later polls the status endpoint (matching is case-insensitive).

### Subscription lifecycle events (offline)

`tools/stripe-webhook-simulate.sh` only builds `checkout.session.*`-shaped payloads
(`metadata.request_id`/`account_email`, no `period_end`, no subscription `status`) — reusing its
`--type` flag for `invoice.payment_failed` or `customer.subscription.updated` sends a payload the
applier cannot read correctly (it would land as `"missing period end"` or a correlation miss for
the wrong reason). Hand-sign these instead, the same way as the "Doing it by hand" recipe above.

**Step 1 — get a real, correlated subscription id.** Run the offline stub flow above once
(`tools/stripe-session-stub.py` + `POST /checkout/sessions` + `stripe-webhook-simulate.sh
--request-id "$RID" --status`). That webhook call persists `stripeCustomer` and
`stripeSubscription` on the `$RID` row via `recordPaid(...)`, both shaped `cus_sim_<epoch>` /
`sub_sim_<epoch>` from the timestamp the script ran at. Read them back:

```sql
select stripe_customer_id, stripe_subscription_id from etgo_checkout_request where request_id = '<RID>';
```

**Step 2 — sign and post the lifecycle event.** Reuse `$SECRET` from §4 and the `SUB`/`CUST`
values from Step 1. Four payload shapes, matching `SubscriptionLifecycleApplierTest` exactly:

```bash
BASE=http://localhost:8080/etendo
SECRET=whsec_local_simulation
SUB="sub_sim_..."      # from Step 1
CUST="cus_sim_..."     # from Step 1

post_event() {
  local payload="$1"
  local ts=$(date +%s)
  local sig=$(printf '%s.%s' "$ts" "$payload" | openssl dgst -sha256 -hmac "$SECRET" -r | cut -d' ' -f1)
  curl -i -X POST "$BASE/sws/go/checkout/webhook" \
    -H 'Content-Type: application/json' \
    -H "Stripe-Signature: t=$ts,v1=$sig" \
    --data-raw "$payload"
}

# invoice.paid — clears the due date, status -> CURRENT
post_event "$(printf '{"id":"evt_%s","type":"invoice.paid","data":{"object":{"subscription":"%s"}}}' "$(date +%s)" "$SUB")"

# invoice.payment_failed — anchored on the paid period end (here: 2026-10-31T00:00:00Z,
# the same fixture value SubscriptionLifecycleApplierTest uses)
post_event "$(printf '{"id":"evt_%s","type":"invoice.payment_failed","data":{"object":{"subscription":"%s","period_end":1793750400}}}' "$(date +%s)" "$SUB")"

# invoice.payment_failed WITHOUT a period end — must be ignored, never written half-way
post_event "$(printf '{"id":"evt_%s","type":"invoice.payment_failed","data":{"object":{"subscription":"%s"}}}' "$(date +%s)" "$SUB")"

# customer.subscription.updated, cancellation scheduled — status stays CURRENT
post_event "$(printf '{"id":"evt_%s","type":"customer.subscription.updated","data":{"object":{"id":"%s","status":"active","cancel_at_period_end":true}}}' "$(date +%s)" "$SUB")"

# customer.subscription.updated, past_due, from a CURRENT state — anchors on the
# ALREADY-PAID period (current_period_start), NOT current_period_end (see §1)
post_event "$(printf '{"id":"evt_%s","type":"invoice.paid","data":{"object":{"subscription":"%s"}}}' "$(date +%s)" "$SUB")"
post_event "$(printf '{"id":"evt_%s","type":"customer.subscription.updated","data":{"object":{"id":"%s","status":"past_due","current_period_start":1793750400}}}' "$(date +%s)" "$SUB")"

# customer.subscription.updated, past_due AGAIN, while still PAST_DUE — the due date already
# stored above (1793750400) is KEPT even though this payload's current_period_start differs
post_event "$(printf '{"id":"evt_%s","type":"customer.subscription.updated","data":{"object":{"id":"%s","status":"past_due","current_period_start":1798848000}}}' "$(date +%s)" "$SUB")"

# customer.subscription.deleted — EXPIRED, due date cleared
post_event "$(printf '{"id":"evt_%s","type":"customer.subscription.deleted","data":{"object":{"id":"%s"}}}' "$(date +%s)" "$SUB")"

# Correlation fallback via customer only (no matching subscription on file)
post_event "$(printf '{"id":"evt_%s","type":"invoice.paid","data":{"object":{"subscription":"sub_unknown","customer":"%s"}}}' "$(date +%s)" "$CUST")"

# Unresolvable — both ids unknown; must be ignored, never blocking
post_event "$(printf '{"id":"evt_%s","type":"customer.subscription.deleted","data":{"object":{"id":"sub_unknown_%s"}}}' "$(date +%s)" "$(date +%s)")"

# Stale delivery — an event whose "created" is OLDER than the watermark set by the last
# APPLIED event is ignored (event_result=IGNORED, failure_reason="stale event") and never
# overwrites the newer stored status. The hand-signed events above all omit "created", so none
# of them ever set the watermark (LAST_EVENT_AT on a row, else ETGO_SubscriptionEventAt); this
# pair sets it explicitly to demonstrate the check. WATERMARK_AT below becomes the stored
# watermark (invoice.paid is applied); the second event's "created" is deliberately one hour
# earlier, so it must be ignored, leaving CURRENT in place instead of flipping to PAST_DUE.
WATERMARK_AT=$(date +%s)
post_event "$(printf '{"id":"evt_%s","created":%s,"type":"invoice.paid","data":{"object":{"subscription":"%s"}}}' "$WATERMARK_AT" "$WATERMARK_AT" "$SUB")"
post_event "$(printf '{"id":"evt_%s","created":%s,"type":"customer.subscription.updated","data":{"object":{"id":"%s","status":"past_due","current_period_start":1793750400}}}' "$(date +%s)" "$((WATERMARK_AT - 3600))" "$SUB")"
```

Check the outcome the same way as §1: `select event_id, event_type, event_result, failure_reason,
request_id, etgo_checkout_request_id from etgo_billing_event order by received_at desc;` — expect
`request_id` and `etgo_checkout_request_id` **empty** on every one of these rows (see "Correlation
is different from the checkout path" above), and the stored state changed — the tenant's
`etgo_subscription` rows when it has any (`status`, `end_date`, `grace_anchor`, the period,
`last_event_at`), otherwise the **Preference** window for `ETGO_SubscriptionStatus` /
`ETGO_SubscriptionDueAt` / `ETGO_SubscriptionEventAt` on the tenant's client (see "Where the
outcome is stored" in §1).

## 5. Stripe Test Mode

### Prerequisites

- Stripe CLI installed and authenticated (`stripe login`), Dashboard in **Test Mode**.
- Test-mode Price already created:

```text
Product: prod_V1t5ck5A6rDPTh
Price:   price_1U1pJgAwtDoN8Dg5nt6Mi1lM
Amount:  49 EUR / month
```

- `etendo.go.checkout.secret.key` and `etendo.go.checkout.price.id` configured per §3.

### Automated smoke command

```bash
make test-stripe-local
```

It loads `.env`, refuses a non-`sk_test_` key, starts `stripe listen` with the event list from
"Manual forwarding" below (`--events`, required by Stripe CLI 1.53 and later), captures the
listener's signing secret, logs in with `ETENDO_TEST_EMAIL` / `ETENDO_TEST_PASSWORD` (or reuses
`ETENDO_SESSION_TOKEN`), and calls the Checkout Session endpoint with `Origin: $ETGO_CHECKOUT_APP_ORIGIN`
(default `http://localhost:3100`). It stops the listener on exit and never prints the secret or
password.

**Caveat:** the script captures the `whsec_...` into its own shell only. The backend must already be
configured with the *same* secret. Because `stripe listen` mints a new secret per session, either
use `stripe listen` with a fixed endpoint secret from the Dashboard, or copy the printed value into
`Openbravo.properties` and redeploy before the payment.

### Manual forwarding

Stripe CLI 1.53 and later require the forwarded events to be named. Name exactly the ones the
webhook handles (§1):

```bash
stripe listen \
  --events checkout.session.completed,checkout.session.async_payment_succeeded,invoice.paid,invoice.payment_failed,customer.subscription.updated,customer.subscription.deleted,charge.dispute.created \
  --forward-to localhost:8080/etendo/sws/go/checkout/webhook
```

Without `--events` the CLI exits with "must specify events to forward using --events,
--all-snapshot, or --all-thin". `tools/stripe-local-smoke.sh` and
`tools/stripe-subscription-past-due.sh` each carry this list as `STRIPE_LISTEN_EVENTS`; when the
webhook starts handling a new event type, add it there and here. `--all-snapshot` works too, but
it forwards every event of the account, and each unhandled one lands in `etgo_billing_event` as an
`IGNORED` / `unhandled event type` row.

Copy the printed `whsec_...` into `etendo.go.checkout.webhook.secret` and redeploy. To compare
the listener's secret with the configured one later, `stripe listen --print-secret` prints it and
exits. Do not use `--live`.

```bash
stripe events list --limit 10
```

### `stripe trigger` does not work here

```bash
stripe trigger checkout.session.completed   # accepted, but provisions nothing
```

The canned fixture carries no `metadata.request_id` / `metadata.account_email`, so the handler
acknowledges it and records nothing. Use the offline simulator (§4) for synthetic events, and
`stripe events resend` for real ones.

### `stripe trigger` for lifecycle events — different failure mode, same conclusion

Unlike `checkout.session.completed`, all four lifecycle events ARE in `stripe trigger`'s supported
list (`stripe trigger --help` prints `invoice.paid`, `invoice.payment_failed`,
`customer.subscription.updated`, `customer.subscription.deleted`). But each `stripe trigger` run
creates a **brand-new** test customer and subscription as a side effect, so the triggered event's
ids never match anything already stored in `ETGO_CHECKOUT_REQUEST`:

```bash
stripe trigger customer.subscription.deleted   # accepted, correlates to nothing local
```

The webhook still answers `200`, but the event lands `IGNORED` / `"unresolved subscription"` —
proving the ignore path, not the write path. This is the lifecycle equivalent of the
`checkout.session.completed` limitation above: a canned `stripe trigger` run alone cannot exercise
the write path either, just for a correlation reason instead of a missing-metadata one.

To exercise the write path with genuinely real, correlated Test Mode events, act on a subscription
Etendo already knows about — one created through a real Test Mode checkout (below), whose
`stripeSubscription` was captured by `applyCheckoutPaid`:

```bash
# customer.subscription.deleted, on the real correlated subscription
stripe subscriptions cancel sub_REPLACE_WITH_REAL_ID

# customer.subscription.updated with cancel_at_period_end, same subscription
stripe subscriptions update sub_REPLACE_WITH_REAL_ID --cancel-at-period-end true
```

`stripe listen` (below) forwards the resulting real webhook, which correlates correctly because
the subscription id is the one `recordPaid` already stored. `invoice.paid` /
`invoice.payment_failed` are harder to force on demand in Test Mode without a **Stripe Test Clock**
(`stripe test_clocks`, confirmed available in this CLI) advancing the subscription past its
renewal date — attaching a test clock would need to happen at Stripe customer creation, which the
checkout flow does not currently do. The offline hand-rolled simulator above is the practical way
to exercise those two deterministically.

### Forcing a real `invoice.payment_failed` / `invoice.paid` cycle (`tools/stripe-subscription-past-due.sh`)

`tools/stripe-webhook-simulate.sh` (§4) hand-signs a payload; it never touches Stripe. For a test
that must go through the *real* provider — a real declined charge, a real webhook, forwarded by a
real `stripe listen` — use `tools/stripe-subscription-past-due.sh` instead. It takes one id, either
an `etgo_checkout_request_id` or an `etgo_billing_event_id` (case-insensitive; a billing event is
resolved to its linked checkout request first), reads the real `stripe_subscription_id` /
`stripe_customer_id` / `created_client_id` from `ETGO_CHECKOUT_REQUEST`, and drives Stripe directly:

```bash
# keep the listener from "Manual forwarding" above running (with --events)

make stripe-past-due ID=<etgo_checkout_request_id_or_billing_event_id>            # CMD=fail (default)
make stripe-past-due ID=<same id> CMD=recover
make stripe-past-due ID=<same id> CMD=status                                     # read-only
```

or directly: `tools/stripe-subscription-past-due.sh [fail|recover|status] <id>`.

The script reads the DB credentials from `${STRIPE_ETENDO_ROOT}/gradle.properties`, and
`STRIPE_ETENDO_ROOT` defaults to `<schema_forge>/etendo_core`. In the usual layout, where
`schema_forge` sits inside the Etendo root, that path does not exist and the script stops with
`gradle.properties not found at .../schema_forge/etendo_core/gradle.properties`. Point it at the
Etendo root, on the command line or in `.env`:

```bash
STRIPE_ETENDO_ROOT="$(cd .. && pwd)" make stripe-past-due ID=<etgo_checkout_request_id>
```

`$(cd .. && pwd)` is the Etendo root only from the main `schema_forge` checkout. From a worktree
(`schema_forge/.worktrees/<name>`) `..` is `.worktrees`, so give the Etendo root as an absolute
path instead (`STRIPE_ETENDO_ROOT=/path/to/etendo_core`). The commands in §10 follow the same rule.

- **`fail`** attaches the well-known test payment method `pm_card_chargeCustomerFail` as the
  subscription's default, creates and finalizes a manual invoice for the subscription's own price
  (`--amount` overrides the cents), then pays it — a decline is the *expected* outcome, not a
  script failure. It then polls the DB for the `invoice.payment_failed` billing event and the
  `PAST_DUE` / non-null-due-date projection, and saves recovery state (subscription, customer, the
  failing payment method, the previous default payment method, the invoice id) to
  `${TMPDIR:-/tmp}/etp5443-past-due-<sub>.env`.
- **`recover`** restores the previous default payment method (or attaches `pm_card_visa` if none
  was on file) and pays the *same* invoice `fail` left open — this time expected to succeed — then
  polls for `invoice.paid` and the `CURRENT` projection with the due date cleared.
- **`status`** is read-only: prints the resolved ids, the live Stripe subscription (status, period,
  default payment method, latest invoice) and the stored lifecycle state — the open subscription
  row when there is one, the `ETGO_Subscription*` preferences otherwise.

**Why a manual invoice instead of resetting `billing_cycle_anchor=now`:** this subscription's
`billing_mode` is `flexible`. With that mode, `proration_behavior=none` on a
`billing_cycle_anchor=now` reset emits **no invoice at all** (verified against a real Test Mode
subscription while building this script) — there is nothing for Stripe to fail to pay, so nothing
reaches the webhook. Creating the invoice item + invoice by hand, against the subscription's
existing period, is what actually produces a payable (and payment-failable) invoice.

**The Stripe subscription itself can stay `active` throughout.** The manual invoice is not the
subscription's regular renewal invoice, so Stripe does not necessarily flip the subscription's own
`status` field to `past_due`. What matters for this test is the stored lifecycle status (the row's
`STATUS`, or `ETGO_SubscriptionStatus` for a tenant without a row): the backend sets it from the
`invoice.payment_failed` event regardless of what the subscription object itself reports — check it
with `status`/`recover` above, not `stripe subscriptions retrieve`'s `status` field, to confirm the
lifecycle actually moved.

**Which store the script reads (ETP-5046).** The webhook writes the lifecycle outcome to the
tenant's **open `etgo_subscription` row** when it has one — every purchase made with the system
preference `ETGO_SubscriptionModel` ON, and every tenant backfilled by R37 — and to the `ETGO_SubscriptionStatus` / `ETGO_SubscriptionDueAt`
preferences only when it has none (§1, "Where the outcome is stored"). The script reads the same
store, re-checked on every poll: the row's `STATUS` (reported as `CURRENT` / `PAST_DUE` / `EXPIRED`
for `active` / `past_due` / `canceled`, so both stores compare alike) and `GRACE_ANCHOR` as the
due date when the row exists (with the pre-ETP-5047 `CURRENT_PERIOD_END` fallback), the preferences
otherwise. The RESULT block prints a `Lifecycle store : row | preference` line saying which one it
checked. `status` prints the row (status, grace anchor, billing period and the `LAST_EVENT_AT`
watermark) or the three preferences.

The script only looks for an **open** row. Once a cancellation has closed the tenant's row
(SF-STRIPE-LOCAL-14, ETP-5047) it reports `Lifecycle store : preference` and shows the stale
preferences, although the backend reads the closed row (`canceled`, blocked). Query the rows
directly with the §1 query in that case; `fail` / `recover` are not meaningful on a canceled
subscription anyway.

`fail` and `recover` **mutate the Stripe Test Mode account** (a human runs them, not an agent, per
this repo's automation guardrails); `status` never mutates anything. Both refuse to run against a
live-mode key or a live-mode object.

### Create a Checkout Session directly

```bash
curl -i -X POST "$ETENDO_BASE_URL/sws/go/checkout/sessions" \
  -H "Authorization: Bearer $ETENDO_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3100" \
  -d '{"clientName":"Stripe Sandbox Tenant","language":"en_US","countryCode":"AR","planKey":"<planKey from GET /sws/go/plans>"}'
```

Omit `planKey` to buy under the legacy price fallback (§3 "What is for sale"); once a priced plan
exists that answers `400 PLAN_NOT_AVAILABLE`.

```json
{
  "requestId": "<server-generated-id>",
  "checkoutUrl": "https://checkout.stripe.com/c/pay/...",
  "mode": "subscription"
}
```

Open `checkoutUrl` in the browser. Neither the request nor the answer carries a card number, CVC,
amount, currency or Price ID: the server picks the price from the plan and keeps it to itself
(`com.etendoerp.go/docs/open-and-notable-topics.md` §4.8). A missing secret key or webhook secret
fails closed with `503 CHECKOUT_NOT_CONFIGURED`, and so does an active plan with no provider price;
the client must not fall back to a mock card form.

#### Account email binding

Checkout identity comes from the authenticated Etendo account, not from browser input. The backend
sends it to Stripe as `customer_email` and records it in `metadata[account_email]`. Keep the email
Checkout shows — replacing it breaks the account-to-customer binding the test is verifying.

Recommended local values:

| Field | Value |
| --- | --- |
| Email | `goadmin@etendo.software` (or `ETENDO_TEST_EMAIL`) |
| Card | `4242 4242 4242 4242` |
| Expiry | `12/34` |
| CVC | `123` |
| Cardholder name | `Etendo Sandbox Tester` |
| Country | `Argentina` |

### Test cards

| Scenario | Card number | Expected result |
| --- | --- | --- |
| Successful payment | `4242 4242 4242 4242` | Checkout succeeds and emits a successful event |
| Generic decline | `4000 0000 0000 0002` | Checkout shows a decline; no tenant is provisioned |
| 3DS authentication | `4000 0025 0000 3155` | Challenge appears, then succeeds when completed |

Use any future expiry, any three-digit CVC, and a valid billing postal code. These stay inside
Stripe Checkout.

### Recover a payment when the listener was offline

The payment does not need to be repeated; replay the existing Test Mode event.

1. Start `stripe listen` and configure the backend with that listener's `whsec_...` (§3), then
   redeploy and resend once the backend is back up. The restart loses nothing: a claim already
   recorded in `etgo_billing_event` survives it, so a resend of an event that was **already
   applied** is counted as a duplicate rather than reprocessed (§1). That also makes
   `stripe events resend <evt_id>` the Test Mode equivalent of SF-STRIPE-LOCAL-06: resend an event
   that was applied before the restart and check `duplicate_count` went up by one.
2. Confirm the event carries the correlation metadata:

   ```bash
   stripe events list --limit 20
   stripe events retrieve evt_REPLACE_ME | jq '{type, metadata: .data.object.metadata}'
   ```

3. Replay it:

   ```bash
   stripe events resend evt_REPLACE_ME
   ```

4. Poll the status endpoint with the same authenticated token; it must flip `pending` → `paid`:

   ```bash
   curl -sS -H "Authorization: Bearer $ETENDO_SESSION_TOKEN" \
     "$ETENDO_BASE_URL/sws/go/checkout/sessions/REQUEST_ID"
   ```

Do not create a second Checkout Session for this path. Replaying is idempotent and does not charge
the card again.

## 6. Verify webhook delivery

After a successful test payment the `stripe listen` terminal shows a delivered event. The event set
depends on the configured mode:

- `subscription`: checkout completion plus subscription/invoice lifecycle events.
- `payment`: checkout completion plus payment-intent/charge lifecycle events.

Record: the Stripe event id, the HTTP status returned by the local webhook, whether it was accepted
once or de-duplicated (the `etgo_billing_event` row's `event_result` and `duplicate_count`, §1),
and the resulting tenant/payment state in Etendo.

## 7. Functional test matrix

| ID | Scenario | How to run | Expected result | Priority |
| --- | --- | --- | --- | --- |
| SF-STRIPE-LOCAL-01 | Valid token and configured sandbox | `make test-stripe-local` | Returns hosted Checkout URL; no card fields in request | P0 |
| SF-STRIPE-LOCAL-02 | Missing secret/webhook configuration, or nothing for sale | unset a property, redeploy | secret key or webhook secret missing → `503 CHECKOUT_NOT_CONFIGURED`; no priced plan **and** no `etendo.go.checkout.price.id` → `GET /sws/go/plans` empty and checkout `400 PLAN_NOT_AVAILABLE` | P0 |
| SF-STRIPE-LOCAL-03 | Successful `4242` payment | Test Mode (§5) | Stripe accepts payment and emits webhook | P0 |
| SF-STRIPE-LOCAL-04 | Declined `4000...0002` payment | Test Mode (§5) | Checkout declines; tenant remains unprovisioned | P0 |
| SF-STRIPE-LOCAL-05 | Invalid webhook signature | `tools/stripe-webhook-simulate.sh --invalid-signature` | `400 INVALID_CHECKOUT_SIGNATURE`; no side effect, **no `etgo_billing_event` row** | P0 |
| SF-STRIPE-LOCAL-06 | Duplicate webhook event across a restart | same `--event-id` twice, **with a Tomcat restart in between** (§4); Test Mode: `stripe events resend <evt_id>` | Second delivery answers `200 {"received":true}` and is not reprocessed; status still `paid`; one tenant maximum | P0 |
| SF-STRIPE-LOCAL-07 | Account polls another account's requestId | `--status` with a mismatched `--email` | `200 {"status":"pending"}`; no information disclosure | P1 |
| SF-STRIPE-LOCAL-08 | First free onboarding | onboarding without `paymentToken` | Existing free flow unchanged | P1 |
| SF-STRIPE-LOCAL-09 | Billing event audit trail survives the restart | after SF-STRIPE-LOCAL-06, run the §1 query and open the Classic windows as System Administrator | Exactly one `etgo_billing_event` row for the event id: `event_result=APPLIED`, `duplicate_count=1`, `etgo_checkout_request_id` set; the row is visible in **Billing Event** and in the **Billing Event** child tab of the matching **Checkout Request**; both read-only; `payload_summary` shows no card data | P0 |
| SF-STRIPE-LOCAL-10 | `invoice.payment_failed` writes `PAST_DUE` anchored on the invoice's own period end | offline recipe (§4) | `ETGO_SubscriptionStatus=PAST_DUE`, `ETGO_SubscriptionDueAt` = `period_end`, never the delivery time; no fallback to `current_period_end` (invoices carry none) | P0 |
| SF-STRIPE-LOCAL-11 | `invoice.payment_failed` with no period end is never written half-way | offline recipe (§4), omit `period_end` | `event_result=IGNORED`, `failure_reason="missing period end"`; the previously stored status/due date are unchanged | P0 |
| SF-STRIPE-LOCAL-12 | `invoice.paid` recovers the account | offline recipe (§4), after SF-STRIPE-LOCAL-10 | `ETGO_SubscriptionStatus=CURRENT`, `ETGO_SubscriptionDueAt` cleared | P0 |
| SF-STRIPE-LOCAL-13 | `cancel_at_period_end=true` does not change the status | offline recipe (§4), `customer.subscription.updated` with `status:"active"` | Status stays `CURRENT`; the flag is not persisted anywhere | P1 |
| SF-STRIPE-LOCAL-14 | `customer.subscription.deleted` ends access | offline recipe (§4), or Test Mode `stripe subscriptions cancel <real sub id>` (§5) | `ETGO_SubscriptionStatus=EXPIRED`, `ETGO_SubscriptionDueAt` cleared; for a tenant with a row: `STATUS=canceled` and `END_DATE` set (row closed), NEO answers 402 `SUBSCRIPTION_REQUIRED` | P0 |
| SF-STRIPE-LOCAL-15 | An unresolvable subscription/customer never blocks | offline recipe (§4), unknown ids; or `stripe trigger customer.subscription.deleted` (§5) | `200 {"received":true}`; `event_result=IGNORED`, `failure_reason="unresolved subscription"`; no tenant's stored status changes | P0 |
| SF-STRIPE-LOCAL-16 | `GET /billing/subscription` for an account with no subscription | authenticated call, account with no `stripeSubscription` on file | `200 {"hasSubscription": false}`, never `404` | P1 |
| SF-STRIPE-LOCAL-17 | `POST /billing/subscription/portal` returns a real Customer Portal session | authenticated call, account with a `stripeCustomer` on file | `200 {"url": "https://billing.stripe.com/..."}`; opening it lands back on `<appBaseUrl>/account` | P0 |
| SF-STRIPE-LOCAL-18 | `customer.subscription.updated` past_due, from a `CURRENT` state, anchors on `current_period_start` | offline recipe (§4), `status:"past_due"` after a prior `invoice.paid` | `ETGO_SubscriptionStatus=PAST_DUE`, `ETGO_SubscriptionDueAt` = `current_period_start`, never `current_period_end` | P0 |
| SF-STRIPE-LOCAL-19 | A second past_due `customer.subscription.updated` keeps the already-stored due date | offline recipe (§4), two consecutive `status:"past_due"` events with different `current_period_start` values | `ETGO_SubscriptionDueAt` unchanged from the first event; the second payload's `current_period_start` is not applied | P0 |
| SF-STRIPE-LOCAL-20 | An out-of-order (older) lifecycle event is ignored as stale | offline recipe (§4), watermark pair with an older `created` on the second event | `event_result=IGNORED`, `failure_reason="stale event"`; the stored projection stays as the newer, already-applied event left it | P0 |
| SF-STRIPE-LOCAL-21 | A late event for a canceled subscription does not revive it (ETP-5047) | after SF-STRIPE-LOCAL-14 on a tenant with a row, post `invoice.paid` for the same subscription | `event_result=IGNORED`, `failure_reason="subscription closed"`; the row stays closed and `canceled` | P0 |
| SF-STRIPE-LOCAL-22 | Re-subscribing the canceled environment opens a fresh row (ETP-5047, ETP-5742) | after SF-STRIPE-LOCAL-14, enter P as its owner: the blocked screen says the subscription was canceled and offers **Reactivar suscripción**; pay on Stripe Checkout (Test Mode `4242`, §5). Repeat with the switch OFF on a tenant with no row, and as an invited member | Stripe returns to `/dashboard?reactivation=success`; the checkout request names P in `created_client_id` and ends `PROVISIONED`; a second `etgo_subscription` row, `END_DATE` null, `STATUS=active`, the new `stripe_subscription_id` and a period, the old row stays closed; with no row: no row is opened, `ETGO_SubscriptionStatus=CURRENT` and `ETGO_SubscriptionEventAt` = the payment; NEO answers 200 again; an invited member sees no button and `POST /sws/go/billing/reactivation` answers 403 `REACTIVATION_OWNER_REQUIRED` | P0 |
| SF-STRIPE-LOCAL-23 | A dispute is an alert only (ETP-5047) | Test Mode card `4000000000000259`, or a hand-signed `charge.dispute.created` (§4) | `event_result=APPLIED`; a WARN `Billing alert: ... charge.dispute.created`; no status or due-date change | P1 |
| SF-STRIPE-LOCAL-24 | Blocked tenant: structured 402 on NEO and MCP (ETP-5047) | a tenant past its grace (e.g. SF-STRIPE-LOCAL-10 with an old `period_end`); call any `/sws/neo/...` and `POST /sws/mcp` | 402 with `error.code=ENVIRONMENT_ACCESS_DENIED`, `error.decision=SUBSCRIPTION_REQUIRED`, `error.message` unchanged; `/account` and `/upgrade` still load; the SPA shows the blocked screen | P0 |
| SF-STRIPE-LOCAL-25 | Kill switch on (ETP-5047) | SF-STRIPE-LOCAL-24 with `etendo.go.flags.environment-access-enforcement-off=true`, Tomcat restarted | 200 on NEO and MCP; INFO `Environment access enforcement is switched off: ... would have refused tenant` in the log; `GET /sws/go/environments` shows that tenant's `accessState` as `ALLOWED` (subscription status and trial fields unchanged); remove the property → 402 again and `accessState` back to the refusal | P0 |
| SF-STRIPE-LOCAL-26 | Period and grace anchor are separate columns (ETP-5047) | Test Mode `tools/stripe-subscription-past-due.sh fail` then `recover` (§5), on a tenant with a row | after `fail`: `STATUS=past_due`, `GRACE_ANCHOR` = the failed invoice's `period_end` (the script's manual invoice: the moment it was created; a real renewal: the end of the paid period), `CURRENT_PERIOD_START/END` = Stripe's current period (unchanged by the failure); after `recover`: `STATUS=active`, `GRACE_ANCHOR` NULL, period advanced; `LAST_EVENT_AT` moves forward with each applied event | P0 |
| SF-STRIPE-LOCAL-27 | Canceled customer buys again → clean new environment (ETP-5047) | after SF-STRIPE-LOCAL-14 on productive tenant P (row closed), with a fresh demo D on the same account: from P's session, buy again on `/upgrade` (Test Mode `4242`, §5), then the API negatives — full steps in *SF-STRIPE-LOCAL-27 step by step* below | `/upgrade` offers no source picker and a blank name; a new client C is provisioned with no source, transfer or association on P, C or D; P stays closed/`canceled` and blocked (402); `demoClientId=P` from a D session → 400 `INVALID_DEMO_SELECTION`; `demoClientId=D` + `dataTransfer` from a P session → 201 with no source recorded; same with the switch OFF and with the kill switch on | P0 |

### SF-STRIPE-LOCAL-27 step by step

**Canceled customer buys again → clean new environment (ETP-5047).** A productive tenant whose
subscription was canceled reads plan `free`, but it is not a demo: it is never offered as, nor
accepted as, the source of a purchase. Buying again from it provisions a clean new environment,
exactly like any productive-origin purchase. (Re-subscribing the *same* environment is ETP-5742,
SF-STRIPE-LOCAL-22, deferred.) Background: `com.etendoerp.go`
`docs/feature-flags-and-tenant-upgrade.md` §2, *A productive environment is never a source*, and
`docs/paid-tenant-infrastructure.md` step 8. Use the §10.2 queries for the checks below.

1. **Precondition.** SF-STRIPE-LOCAL-14 has run on productive tenant **P**, which has a
   subscription row: the row is closed (`end_date` set) and reads `canceled`. The same account also
   owns a fresh demo **D** that has not originated a productive environment (no
   `ETGO_AssociatedProductiveClientId` on D).
2. **The environment list.** `GET /sws/go/environments` reports P with `plan: "free"`,
   `environmentType: "PRODUCTIVE"` and `subscriptionStatus: "EXPIRED"`. In the company switcher P
   is badged "Productive" on the grey (muted) chip — intended: productive, but not paying.
3. **The upgrade page from P.** Log into P (it shows the blocked screen) and open `/upgrade`.
   - No `upgrade-source-demo-field`: P is not a source, and a productive origin is not asked for one.
   - `upgrade-tenant-name-input` is empty (a productive-origin purchase starts with a blank name).
   - The add-ons step (`upgrade-data-transfer`) shows the "No data will be transferred" copy
     (`upgradeNoDataTransferTitle`), with no transfer controls.
4. **Buy.** Type a company name that no client has yet (see §10.3 step 3) and pay with
   `4242 4242 4242 4242` (§5 "Test cards"). Expect a new client **C** (`created_client_id` on the
   purchase), and:

   ```sql
   -- the purchase: no source, no transfer intent
   select request_id, checkout_status, client_name, demo_client_id, created_client_id,
          transfer_products, transfer_contacts
     from etgo_checkout_request where client_name = '<new name>' order by created desc limit 1;
   -- expect: checkout_status = PROVISIONED, demo_client_id NULL,
   --         transfer_products = 'N', transfer_contacts = 'N'
   ```

   - On P (§10.2 preference query, `<CLIENT>` = P): **no** `ETGO_AssociatedProductiveClientId`.
   - On C: **no** `ETGO_AssociatedDemoClientId` and **no** `ETGO_DemoDataTransferSource`.
   - P's row stays closed and `canceled` (§1 query), and NEO still answers P with 402.
   - C has an open row (§1 query: `end_date` null, `status = active`) when
     `ETGO_SubscriptionModel` is ON, or the `ETGO_TenantPlan = productive` marker when it is OFF
     (§1 "Where the outcome is stored").
   - D is untouched: its `ETGO_%` preferences are the same as before the purchase.
5. **API negatives.** Send each from a session in the named environment (copy its bearer token
   from the browser's DevTools, any `/sws/go` request), with a `clientName` no client and no open
   purchase uses yet, and a `planKey` from `GET /sws/go/plans` as in the §5 example — without
   one, an environment with a priced plan answers `400 PLAN_NOT_AVAILABLE` instead (§1, §8):

   ```bash
   # from a D session: P is not an acceptable source -> 400 INVALID_DEMO_SELECTION
   curl -i -X POST "$ETENDO_BASE_URL/sws/go/billing/purchases" \
     -H "Authorization: Bearer $D_SESSION_TOKEN" -H 'Content-Type: application/json' \
     -d '{"clientName":"SF27 negative A","demoClientId":"<P>",
          "planKey":"<planKey from GET /sws/go/plans>"}'

   # from a P session: a productive origin ignores the source -> 201, no source recorded
   curl -i -X POST "$ETENDO_BASE_URL/sws/go/billing/purchases" \
     -H "Authorization: Bearer $P_SESSION_TOKEN" -H 'Content-Type: application/json' \
     -d '{"clientName":"SF27 negative B","demoClientId":"<D>",
          "dataTransfer":{"products":true,"contacts":true},
          "planKey":"<planKey from GET /sws/go/plans>"}'
   ```

   Negative A is refused while the source is resolved, before the plan is read, so its answer
   does not depend on the plan catalog. For the 201, the purchase row for `SF27 negative B` has
   `demo_client_id` NULL and `transfer_products` / `transfer_contacts` = `N`. It is an unpaid
   purchase; leave it, or abandon the hosted Checkout page.
6. **Repeat step 5 in two more configurations**, with the same results:
   - `ETGO_SubscriptionModel` **OFF**, with a productive tenant bought while the switch was OFF in
     the place of P: it has no subscription row, only the preference markers that purchase wrote
     (`ETGO_TenantPlan = productive`, `ETGO_EnvironmentType = PRODUCTIVE`,
     `ETGO_SubscriptionStatus = CURRENT`). It is a paying productive origin, not a canceled one, so
     this run tests the productive-origin rule, not the canceled shape;
   - `etendo.go.flags.environment-access-enforcement-off=true` (Tomcat restarted, as in
     SF-STRIPE-LOCAL-25). The kill switch changes access, never source eligibility.

## 8. Troubleshooting

### The webhook returns 404

Wrong context path. Compare against `context.name` in `etendo_core/gradle.properties` (see §2). A
reachable endpoint answers `400`, not `404`, to an unsigned POST.

### `CHECKOUT_NOT_CONFIGURED`

`isConfigured()` requires the secret key **and** the webhook secret (since ETP-5046 it no longer
checks a price). The other cause is a plan the request named that is active but has no **Provider
Price ID** yet. Most often the values were exported into a shell that did not start the JVM — put
them in `Openbravo.properties` and redeploy (§3).

### `PLAN_NOT_AVAILABLE`

The `planKey` names no active plan, or names `legacy-productive` (or is absent) while the legacy
price fallback is inactive — i.e. a priced plan exists, or no `etendo.go.checkout.price.id` is set.
Reload `GET /sws/go/plans` and send one of its keys.

### Checkout succeeded but status stays `pending`

One of: `stripe listen` was not running; its `whsec_...` differs from the configured secret; the
event lacked `metadata.request_id`/`metadata.account_email`; or the polling account email differs
from the recorded one. The `etgo_billing_event` row (§1) says which:

| Row state | What it means |
| --- | --- |
| **no row** | The delivery never passed the signature check, or never arrived at all. |
| `IGNORED` / `missing correlation metadata` | The event carried no `metadata.request_id` / `account_email`. |
| `IGNORED` / `unknown checkout request` | The correlation id names no `ETGO_CHECKOUT_REQUEST` on this instance — typically an invented `--request-id`, or an event from another environment sharing the Stripe test account. Nothing was marked paid. |
| `IGNORED` / `unhandled event type` | Not one of the two payment-confirmation types; expected noise in Test Mode. |
| `FAILED` | The handler threw; Stripe is retrying and the retry will re-claim the row. Check the log for `CHECKOUT_WEBHOOK_FAILED` (the row holds only the exception class name). |
| `APPLIED` | The payment **was** recorded. If the poll still says `pending`, the polling account email does not match the one on the checkout request. |

A Tomcat restart is no longer a cause. Resend the event (§5) only when there is no row or the row
is `FAILED`; resending an `APPLIED` event just counts a duplicate.

### A lifecycle event's `etgo_billing_event` row has no `request_id` or `etgo_checkout_request_id`

That is expected, not a bug: lifecycle events carry no `metadata.request_id`, so
`CheckoutWebhookProcessor` claims them with a null one. Correlation for these events happens only
inside `applySubscriptionLifecycle` (walking `stripeSubscription`/`stripeCustomer`), and its
result is visible only in `event_result` / `failure_reason`, not as a foreign key on the row. See
"Correlation is different from the checkout path" (§1).

### A `customer.subscription.updated` past_due event did not move the due date

Expected once the projection is already `PAST_DUE` with a due date on file: a later
past_due/unpaid `customer.subscription.updated` **keeps** that stored due date rather than
recomputing one from the new payload's `current_period_start`. Only `invoice.payment_failed`
(or the first past_due transition out of a non-`PAST_DUE` state) sets a new due date. Read the
current due date (the open `etgo_subscription` row's `grace_anchor` — `current_period_end` on a
`past_due` row from before ETP-5047 whose `grace_anchor` and `current_period_start` are NULL — or
`ETGO_SubscriptionDueAt` from the **Preference** window for a tenant without a row) before assuming the event was
dropped — it likely applied, and left the anchor exactly where it already was (§1 §3.1 of the
design doc).

### A lifecycle event is `IGNORED` with `failure_reason = "stale event"`

The event's own `created` (event-envelope level) was strictly older than
`ETGO_SubscriptionEventAt`, the `created` of the last **applied** lifecycle event for that
client — so it was ignored rather than risk overwriting a newer, already-applied status with an
older one delivered late. This is expected Stripe behavior (delivery order is not guaranteed),
not a bug. If it fires on an event you expected to apply, compare the two `created` values (read
the watermark — the row's `last_event_at`, or `ETGO_SubscriptionEventAt` from the **Preference**
window for a tenant without a row or a row whose `last_event_at` is still NULL) rather than
assuming the watermark is wrong — a hand-signed payload that omits `created` never reaches this check at all (§1).

### `status` vs. the grace fields — read the right one

`GET /billing/subscription`'s `status` field is Stripe's own live status string (`"active"`,
`"past_due"`, …), not the internal `CURRENT`/`PAST_DUE`/`EXPIRED` enum used elsewhere in this
guide (compare `handleBillingPurchase`, which puts the internal `checkoutRequestStatus` in that
same field name for a different endpoint — the name is reused across handlers with different
value spaces). The past-due/grace signal for the Subscription section is `graceDaysRemaining` /
`graceEndsAt`, which the endpoint derives from the stored projection, not from `status`. A
component or test that keys its past-due UI off `status === 'PAST_DUE'` is reading the wrong
field.

### CORS error in the browser

The SPA origin must be allowlisted. `http://localhost:3100` and `:3000` are defaults; anything else
needs `etgo.allowed.origins` / `ETGO_ALLOWED_ORIGINS`.

### Checkout returns to a dead page after paying

`success_url` is derived from the `Origin` header of the session request. Send the origin of the dev
server that is actually running.

### Checkout uses the wrong amount

The amount is intentionally not accepted from the browser. Verify `etendo.go.checkout.price.id` and
the corresponding Stripe Test Mode Price instead of changing frontend code.

### No event appears in the listener

Confirm the Dashboard is in Test Mode, the session was created with the `sk_test_...` key, and
`stripe listen` is still running without `--live`.

## 9. Evidence to attach to QA

- Terminal output showing `stripe listen` startup and the configured `whsec_...` (redacted).
- Checkout Session response with `requestId` and hosted URL (redact tokens).
- Screenshot or export of the successful/declined Test Mode payment.
- Stripe event ids and local webhook HTTP responses.
- The `etgo_billing_event` row state per event id (§1 query: `event_result`, `duplicate_count`,
  `etgo_checkout_request_id`), captured after the restart replay, plus a screenshot of the row in
  the Classic **Billing Event** window or the **Checkout Request** child tab.
- Etendo tenant/payment state before and after each scenario.
- For subscription lifecycle scenarios (§1, §4, §7 SF-STRIPE-LOCAL-10..26): the `etgo_billing_event`
  row per event id (`event_result`, `failure_reason`, and for `invoice.*` the
  `service_period_start/end` in `payload_summary`), and the stored state on the affected client,
  before and after — its `etgo_subscription` rows (the §1 query: `status`, `end_date`,
  `grace_anchor`, `current_period_start/end`, `last_event_at`) when it has any, otherwise the
  **Preference** rows `ETGO_SubscriptionStatus` / `ETGO_SubscriptionDueAt` /
  `ETGO_SubscriptionEventAt`.
- For the access scenarios (SF-STRIPE-LOCAL-24/25): the raw 402 response body from NEO and from
  `POST /sws/mcp`, the `accessState` of the tenant in `GET /sws/go/environments`, and the INFO log
  line with the kill switch on.
- For SF-STRIPE-LOCAL-27: P's entry in `GET /sws/go/environments`, a screenshot of `/upgrade` from
  P (add-ons and payment steps), the purchase row, the `ETGO_%` preference rows of P, C and D
  before and after, and the raw responses of the two API negatives.

## 10. Happy flow walkthrough (ETP-5046 + ETP-5047)

One end-to-end pass through the paid lifecycle against real Stripe Test Mode: a demo expires, the
customer buys, a renewal fails, grace runs out, the customer pays, and finally cancels. It ties
the reference sections above into one sequence and says what to look at after each step. It was
run successfully on 2026-10-14 against `com.etendoerp.go` `82f0c3be6` and `schema_forge`
`efa6e1caa` on a local Etendo.

Run the steps in order: each one starts from the state the previous one left. Step 8 ends the
subscription, so it goes last.

### 10.1 Setup

1. Check out both repos (`com.etendoerp.go` and `schema_forge`) on the branch under test.
2. Stop Tomcat, switch to JDK 17 (`export JAVA_HOME=<your JDK 17 home>`), and rebuild from the
   Etendo root:

   ```bash
   ./gradlew update.database smartbuild
   ```

   Start Tomcat again, and start the SPA from `schema_forge` with `make dev` (`http://localhost:3100`).
3. Configure the backend as in §3: `etendo.go.checkout.secret.key` (`sk_test_...`),
   `etendo.go.checkout.webhook.secret`, `etendo.go.checkout.price.id`, plus
   `etendo.go.app.baseUrl=http://localhost:3100` (the Customer Portal's return URL, §1 "The two
   account endpoints"). Two things must **not** be set:
   - `etendo.go.checkout.api.base.url` pointing at the offline stub (`http://localhost:8099`, §4)
     — remove it, or the backend never reaches Stripe;
   - `etendo.go.flags.environment-access-enforcement-off` — with the kill switch on nothing is
     ever blocked (§1 "The 402 body and the kill switch").
4. Leave the plan catalog without a **Provider Price ID** on any plan. Checkout then sells
   `legacy-productive` at `etendo.go.checkout.price.id` under the legacy price fallback (§3
   "What is for sale"); that is the configuration this walkthrough was run with.
5. Start the listener with the event list from §5 "Manual forwarding" and keep it running. Check
   that its secret matches `etendo.go.checkout.webhook.secret`:

   ```bash
   stripe listen --print-secret
   ```

6. Save a Customer Portal configuration in Test Mode, or opening the portal fails: Dashboard
   **Settings → Billing → Customer portal**
   (`https://dashboard.stripe.com/test/settings/billing/portal`), then **Save**. Check it with:

   ```bash
   stripe billing_portal configurations list
   ```

   Note the configured cancel mode (`features.subscription_cancel.mode`); step 8 depends on it.
   The test account this was written against cancels `at_period_end`.

### 10.2 Queries used throughout

Keep these at hand; each step below says which one to read.

```sql
-- the purchase (latest first)
select request_id, checkout_status, client_name, demo_client_id, created_client_id,
       stripe_customer_id, stripe_subscription_id, stripe_price_id, etgo_plan_id,
       transfer_products, transfer_contacts, failure_reason
  from etgo_checkout_request order by created desc limit 3;

-- the webhook ledger (latest first)
select event_id, event_type, event_result, failure_reason, received_at
  from etgo_billing_event order by received_at desc limit 15;

-- the lifecycle preferences of one client (demo or productive)
select attribute, value, updated
  from ad_preference
 where attribute like 'ETGO\_%'
   and (ad_client_id = '<CLIENT>' or visibleat_client_id = '<CLIENT>')
 order by attribute;
```

For the tenant's subscription rows use the §1 query ("Where the outcome is stored"), with
`environment_client_id = '<CLIENT>'`. The `etgo_billing_event` columns are explained in §1
"Billing events are durable".

### 10.3 The steps

**Step 1 — Sign up a demo.** Create a demo environment from the SPA.

- Expect, on the demo client: preferences `ETGO_EnvironmentType = DEMO` and
  `ETGO_DemoTrialStartedAt` (an ISO-8601 instant).
- Expect **no** `etgo_subscription` row. That is by design: only a paid tenant ever has one, and a
  row would send the tenant down the productive path (§1 "Where the outcome is stored").

**Step 2 — Expire the trial.** The trial lasts `etendo.go.demo.trial.days` (default 14), counted
from `ETGO_DemoTrialStartedAt`. Move that start back 15 days:

```sql
update ad_preference
   set value = to_char((now() - interval '15 days') at time zone 'UTC',
                       'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
       updated = now()
 where attribute = 'ETGO_DemoTrialStartedAt'
   and (ad_client_id = '<DEMO>' or visibleat_client_id = '<DEMO>');
```

The value must stay a parseable ISO instant. An unparsable value makes the lifecycle unresolvable,
which resolves to **allowed**, not blocked, so a typo here looks like "the block does not work".

- Expect, without a restart (the decision is evaluated on every request): the SPA shows the
  blocked screen, and NEO answers `402` with `error.decision = DEMO_TRIAL_EXPIRED` (§1 "The 402
  body and the kill switch").
- Expect `/upgrade` and `/account` to stay reachable.

**Step 3 — Buy.** From the blocked demo, go to `/upgrade`, choose the products and contacts to
carry over, and pay on the hosted Checkout page with `4242 4242 4242 4242` (§5 "Test cards").

> **Use a company name that no client has yet**, neither the demo's nor any other. Until ETP-5737
> is fixed, a duplicate name passes the check on `/upgrade`, but provisioning fails *after*
> payment on the `AD_CLIENT_NAME` unique index, and the SPA says "We could not finish setting up
> your environment. Your payment is safe." To recover locally, rename the clashing client
> (`update ad_client set name = '<other name>' where ad_client_id = '<clashing client>';`) and
> retry from the same page; the payment is not repeated.

Expect, in the ledger and on the purchase:

- `checkout.session.completed` → `APPLIED`.
- The purchase row goes to `PROVISIONED`, with the real `stripe_customer_id`,
  `stripe_subscription_id`, `stripe_price_id` and `etgo_plan_id` filled in (§1 "Payment state is
  durable").
- The first `invoice.paid` → `IGNORED`, `failure_reason = unresolved subscription`. This is the
  expected timing gap: it arrives before provisioning has committed, so the purchase names no
  client yet (§1 "Correlation is different from the checkout path"). It is harmless. If it arrives
  after provisioning committed, the new open row takes it (matched by `stripe_subscription_id`)
  and it reads `APPLIED` instead. The onboarding opens the row in the same transaction that
  provisions the tenant, so there is no window in which this event finds the client but no row.

Expect, on the environments:

- A **new** productive environment, `created_client_id` on the purchase (a client claimed from
  the pool and renamed to the company name). A purchase never converts the demo into a productive
  environment.
- The demo data transfer copied only the products and contacts selected on `/upgrade`; the
  productive client's `ETGO_DemoDataTransferStatus` reads `COMPLETED`.
- The demo stays blocked. Besides its expired trial, the purchase associates it with the
  productive environment (`ETGO_AssociatedProductiveClientId` on the demo,
  `ETGO_AssociatedDemoClientId` on the productive client), which revokes demo access on its own.

**Step 4 — The billing period is filled (ETP-5047).** Right after provisioning, the backend reads
the new subscription once from Stripe (`GET /v1/subscriptions/{id}`) to fill the period the
ignored first events could not write (§1 "Where the outcome is stored").

- Expect the log line `Subscription <row id> of tenant <client id> got its billing period from the
  provider`.
- Expect the tenant's `etgo_subscription` row: `status = active`, `end_date` and `grace_anchor`
  null, `current_period_start` / `current_period_end` filled.
- Compare with Stripe. The period is on the first subscription item on current API versions (§1,
  "The Stripe API version is not pinned"):

  ```bash
  stripe subscriptions retrieve <sub_id> | jq '.items.data[0] | {current_period_start, current_period_end}'
  date -d @<epoch>      # GNU/Linux; on macOS: date -r <epoch>
                        # the row stores the same instant in the server's local time
  ```

**Step 5 — A renewal fails.** Force a real declined charge with the script from §5 ("Forcing a
real `invoice.payment_failed` / `invoice.paid` cycle"), giving it the purchase's
`etgo_checkout_request_id` (and `STRIPE_ETENDO_ROOT`, as explained there):

```bash
STRIPE_ETENDO_ROOT="$(cd .. && pwd)" make stripe-past-due ID=<etgo_checkout_request_id>
```

- Expect a real `card_declined`, and `invoice.payment_failed` → `APPLIED`.
- Expect the row: `status = past_due`, `grace_anchor` set, `last_event_at` set. The anchor is the
  failed invoice's `period_end`; for the script's manual invoice that is the moment it was
  created, for a real renewal it is the end of the paid period (§1, "The grace anchor is the end
  of the paid period").
- Expect the tenant to stay **allowed**: it is inside its grace window (§1 lifecycle matrix).
- Expect the in-app warning (ETP-5049), without a restart once the environment list is read
  again (reload the SPA): a banner above the top bar of the environment, `billing-status-banner`,
  reading "Your last payment failed. This environment will be blocked on <date>." The date is the
  local calendar day of `graceEndsAt` on `GET /sws/go/environments` (the grace anchor plus
  `etendo.go.billing.grace.days`, the same instant the `402` gate decides on).
  - Signed in as the **owner** (`ownedByAccount: true`): an **Update payment** button that opens
    `/account`, where the Subscription section shows `graceDaysRemaining` and **Manage
    subscription** opens the Customer Portal. As an invited member: "Contact your company's
    administrator." and no button.
  - More than 3 days before `graceEndsAt` the banner is amber and has a close button; closing it
    hides it for the browser session (sessionStorage, per company and grace window). In the last 3
    days it turns red (`data-variant="destructive"`) and cannot be closed. To see that state, move
    the anchor so fewer than 3 days of grace remain (`grace_anchor - interval '13 days'` with the
    default 15) and reload.
  - It is not shown on `/account` itself (the CTA's own destination already shows the grace
    state) nor on `/upgrade` (a full-screen overlay), and not once `graceEndsAt` has passed: then the blocked screen of Step 6 takes over.

**Step 6 — Grace runs out.** Move the anchor past the grace window (`etendo.go.billing.grace.days`,
default 15):

```sql
update etgo_subscription
   set grace_anchor = grace_anchor - interval '20 days'
 where environment_client_id = '<CLIENT>' and end_date is null;
```

- Expect, without a restart: the blocked screen, and NEO answering `402` with
  `error.decision = SUBSCRIPTION_REQUIRED` (SF-STRIPE-LOCAL-24).
- Expect `/account` and the Customer Portal (**Manage subscription**) to stay reachable.

**Step 7 — The customer pays.** Either pay through the Customer Portal (**Manage subscription** on
`/account` or on the blocked screen), or let the script pay the open invoice with a working card:

```bash
STRIPE_ETENDO_ROOT="$(cd .. && pwd)" make stripe-past-due ID=<etgo_checkout_request_id> CMD=recover
```

- Expect `invoice.paid` → `APPLIED`.
- Expect the row back to `status = active` with `grace_anchor` null.
- Expect access restored without a restart (SF-STRIPE-LOCAL-26 covers steps 5 and 7, SF-STRIPE-LOCAL-24
  step 6).

**Step 8 — The customer cancels (do this last).**

- **From the Customer Portal**, with the `at_period_end` cancel mode: the subscription stays
  `active` and only gets `cancel_at_period_end = true`. That flag is display-only, never stored;
  access continues until Stripe sends `customer.subscription.deleted` at the period boundary (§1,
  "`cancel_at_period_end = true` does not change the status").
- **To see the end now**, cancel immediately from the CLI. `--confirm` is required: without it the
  CLI waits for an interactive "yes" and fails on end of input.

  ```bash
  stripe subscriptions cancel <sub_id> --confirm
  ```

  Expect `customer.subscription.deleted` → `APPLIED`; the row `status = canceled` and closed
  (`end_date` set), with no grace; NEO answering `402` with `error.decision =
  SUBSCRIPTION_REQUIRED` (SF-STRIPE-LOCAL-14). The way back is re-subscribing the same environment
  from its blocked screen (ETP-5742, SF-STRIPE-LOCAL-22); a new purchase instead gives a clean new
  environment, without a source or data transfer, under another name (SF-STRIPE-LOCAL-27).

### 10.4 Local problems met on the way

- **`Bundled GOClient sampledata index not found on the classpath:
  com/etendoerp/go/onboarding/sampledata/index.txt`** during provisioning. `smartbuild` stages the
  onboarding sampledata into the root `WebContent/WEB-INF/classes` (the `prepareOnboardingSampledata`
  task, see `com.etendoerp.go` `docs/onboarding-sampledata-packaging.md`), but the staged copy did
  not reach the deployed webapp. Copy it over from the Etendo root and restart Tomcat:

  ```bash
  cp -r WebContent/WEB-INF/classes/com/etendoerp/go/onboarding/sampledata \
        <tomcat>/webapps/etendo/WEB-INF/classes/com/etendoerp/go/onboarding/
  ```

- **`update.database` fails with a foreign-key error on `ETGO_SF_FIELD`** (an `ad_column_id` that
  does not exist). A dependency module's checkout is older than the NEO configuration that
  references its columns — here `com.etendoerp.psd2.bank.integration`, behind ETP-5582. Update
  that module's checkout and run `update.database` again.
- **`Database has local changes`** stops `update.database`. `./gradlew update.database
  -Dforce=yes` goes ahead, but it **discards** every AD / NEO change in the local DB that was not
  exported; run `export.database` first if any of them should be kept.
