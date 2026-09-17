# ETP-5045 — Durable checkout and billing state

## What this task changed

Before ETP-5045 the paid-tenant checkout flow kept its payment state in process memory, in
`CheckoutPaymentRegistry`. A Tomcat restart between Stripe's webhook and the browser's status poll
lost the payment: the customer had been charged, the backend no longer knew, and the status endpoint
answered `pending` forever.

ETP-5045 moved that state into the database and split it across two tables, one per concern:

| Table | Store | Concern |
| --- | --- | --- |
| `ETGO_CHECKOUT_REQUEST` | `CheckoutRequestStore` | Payment correlation and provisioning lifecycle |
| `ETGO_BILLING_EVENT` | `BillingEventStore` | Webhook idempotency and the delivery audit trail |

`CheckoutPaymentRegistry` was deleted. There is no in-memory fallback.

The acceptance criterion is a restart test: restart Tomcat between the webhook and the poll, and the
status endpoint must still answer `paid`.

## Scope

The work spans two repositories. Neither half is useful without the other.

- **com.etendoerp.go** — branch `feature/ETP-5045`. The tables, the stores, the webhook processor
  changes, the paywall, the AD window, and the tests.
- **etendo_schema_forge** — branch `feature/ETP-5045-2`. The local testing guide, the offline
  simulator and session stub, the billing PRD, and the functional documentation updates.

## The checkout request lifecycle

One row per checkout attempt, written before Stripe is contacted and advanced by each step that
succeeds:

```
CREATING -> CREATED -> PAID -> PROVISIONING -> PROVISIONED
```

Three properties make this survive the real world rather than the happy path.

**The lifecycle only moves forward.** Statuses are ranked, and a transition to an equal or lower
rank is ignored as a duplicate. Stripe re-delivers events freely and a customer can reload the
browser mid-flow, so both are ordinary occurrences, not error cases.

**Phase timestamps are first-write-wins.** `PAID_AT` must keep meaning "when the payment was
confirmed", not "when we last heard about it". Otherwise the staleness thresholds behind
`DERIVED_STATUS` stop meaning anything.

**`CREATING` commits before the outbound call.** The row must survive a crash during the Stripe
request, or a session can exist at the provider that nothing on this side can name. A row stuck in
`CREATING` is always safe to expire, because the checkout URL only reaches the browser after the
call returns, so nobody can have paid for it.

`DERIVED_STATUS` is a computed column reporting `DONE`, `IN_FLIGHT`, `ABANDONED`, `EXPIRED` or
`STALLED`. **`STALLED` on a `PAID` row is the one that should page someone**: charged, not
provisioned. Read it through the DAL; `SELECT derived_status` fails because it is computed.

## The webhook claim

`ETGO_BILLING_EVENT` makes webhook processing idempotent. The lock is the table's unique constraint
on the event id, not a lock in memory. Claiming runs in three steps:

1. Insert a `RECEIVED` row. Success means this delivery won the claim and must be processed.
2. On a unique violation the insert is rolled back, and an atomic update tries to reopen a row
   sitting in `FAILED`. Matching one means an earlier delivery failed and this one re-claims it.
3. Otherwise it is a genuine duplicate. The winning row's duplicate counter is incremented and the
   caller is told not to process.

Each step commits on its own. Step 2 needs no row lock because the update is atomic.

Two deliberate decisions are worth knowing.

**Step 3 rethrows when no row matches.** A constraint violation whose name the driver did not report
could come from the foreign key or the result check instead, in which case nothing was inserted.
Reporting that as a duplicate would make the server answer 200 for an event it never recorded, and
the provider would never retry it.

**This is at-most-once, not exactly-once.** The claim commits before the handler runs, so a process
kill in between leaves a committed `RECEIVED` row with no effect applied. The next delivery reads it
as a duplicate and answers 200. The payment is acknowledged but never acted on, and shows up as
stuck rather than being applied twice. Losing a payment visibly was chosen over applying one twice.

Terminal states are `APPLIED`, `IGNORED` and `FAILED`, and only `FAILED` is re-claimable. Every
non-applied write carries a guard so `APPLIED` is genuinely terminal, which stops a later error from
rewriting an applied event into a re-claimable one and charging the customer twice.

## Ordering is the security control

Webhook handling runs three checks in a fixed order: verify the signature, parse and validate the
payload, then claim the event id.

That order is not cosmetic. The claim is a one-shot resource, and burning an id makes every later
delivery of it arrive as a duplicate. If the claim ran before verification, anyone who could reach
the endpoint and guess an event id could burn it with an unsigned request, and Stripe's genuine
signed delivery would then be silently ignored. A real payment would be suppressed with no
authentication at all.

`CheckoutWebhookProcessorTest.anInvalidSignatureNeverReachesTheEventStore` pins this. It asserts not
what the processor returned but what it never touched: with a bad signature, the event store records
zero claim attempts. Sibling tests cover a tampered body and a signature older than the tolerance
window.

Signature verification itself predates this task. It arrived with ETP-4800 and was not modified here.

## Two credentials, two jobs

A recurring source of confusion, so stated plainly:

| Credential | Property | Used for |
| --- | --- | --- |
| Secret key, `sk_test_…` | `etendo.go.checkout.secret.key` | Bearer token when Etendo calls Stripe |
| Signing secret, `whsec_…` | `etendo.go.checkout.webhook.secret` | HMAC key verifying events from Stripe |

They fail differently. A wrong secret key makes session creation fail, so the payment page is never
reached. A wrong signing secret lets the payment succeed at Stripe while every delivery is rejected
with 400, leaving the request at `pending` forever.

The signing secret is used as raw UTF-8 bytes, so any agreed string works locally. That is what lets
the offline simulator sign its own events with no Stripe account.

## Testing without Stripe

Two tools were added so the flow can be exercised offline:

- `tools/stripe-webhook-simulate.sh` posts a correctly signed event and polls until the status
  endpoint reports `paid`. It also covers invalid signatures, duplicate delivery and clock skew.
- `tools/stripe-session-stub.py` answers the one Stripe endpoint the backend calls, so the whole
  flow runs with no account, no test key and no network.

Since this task the webhook only records a payment against a request row that already exists, and
that row is written by `POST /checkout/sessions`, which calls the provider. A webhook alone can no
longer reach `paid` on a fresh id: it is accepted and recorded nowhere. Start the flow with a session
first, or use the stub.

Full procedure, configuration and the functional test matrix: `docs/stripe-local-testing.md`.

## Other changes

- **Vite dev origin allowlisted.** The default CORS allowlist covered ports 3000 and 5173, but the
  SPA dev server is pinned to 3100, so local checkout was blocked in the browser unless
  `etgo.allowed.origins` was set by hand.
- **Billing Event window.** An AD window over `ETGO_BILLING_EVENT`, so a stuck or duplicated event
  is visible without a SQL client.
- **Recurring billing PRD.** `docs/plans/2026-08-27-recurring-billing-and-resource-limits-prd.md`
  covers the billing work this task sits under.

## Known operational gap

`smartbuild` stages the onboarding sampledata into `WebContent/WEB-INF/classes` as designed, but does
not copy it into the exploded webapp that a local Tomcat serves. Provisioning then fails at the
dataset import with `Bundled GOClient sampledata index not found on the classpath`, after the payment
has already been taken. The payment token is spent and the attempt cannot be retried.

Until that is fixed, copy the staged payload into the deployed webapp after every build. This is not
a defect in the payment path, but it is the failure a tester will hit first.

## Where the code lives

| Concern | File |
| --- | --- |
| Checkout lifecycle | `payment/CheckoutRequestStore.java` |
| Webhook idempotency | `payment/BillingEventStore.java` |
| Check ordering | `payment/CheckoutWebhookProcessor.java` |
| Signature verification | `payment/CheckoutWebhookVerifier.java` (ETP-4800) |
| Paywall decision | `payment/TenantPaywallService.java` |
| Session creation | `payment/HostedCheckoutService.java` |

All under `modules/com.etendoerp.go/src/com/etendoerp/go/`.
