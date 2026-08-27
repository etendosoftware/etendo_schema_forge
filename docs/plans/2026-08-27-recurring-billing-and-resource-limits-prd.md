# PRD: Recurring Billing, Configurable Resource Limits and Plan Change

- **Status:** Draft for team validation
- **Date:** 2026-08-27
- **Epic:** ETP-3504
- **Repos touched:** `com.etendoerp.go` (runtime, data model, Classic surface), `etendo_schema_forge` (locales, data-fixes, upgrade UI), `schema_forge_core` (checkout helper)
- **Supersedes for forward scope:** [`stripe-paid-tenant-checkout-prd.md`](../stripe-paid-tenant-checkout-prd.md). That document remains the record of the one-off paid-tenant checkout that shipped (ETP-4686 → ETP-4800 → ETP-4861 → ETP-4966) and its requirements still bind; it does not describe recurring billing, resource limits or plan change.

---

## 1. Summary

Etendo GO charges today for an additional productive tenant through Stripe-hosted Checkout, once per tenant. This document defines the move to **recurring billing**: a flat monthly subscription per plan, with the mechanism in place so that capping a resource, adding a new countable resource, and moving a customer between plans are all **configuration rather than development**.

Three properties drive every decision below:

1. **Nothing can be billed monthly on top of state that lives in RAM.** Durable payment and subscription state is the gating prerequisite.
2. **What is countable must be data, not schema.** The set of billable resources is a table, so adding one never means a column, a migration or a deploy.
3. **Etendo Classic is a first-class surface.** Plans, subscriptions, quotas, payment history and reconciliation are all operable from AD windows, menu entries and processes — not only from the new stack.

---

## 2. Where we are today

Verified against `epic/ETP-3504` on 2026-08-27. Paths are relative to each repo root.

### 2.1 What works and must not be disturbed

- Stripe webhook signature verification — `CheckoutWebhookVerifier.java:23-47`. HMAC-SHA256 over `timestamp.payload`, constant-time comparison via `MessageDigest.isEqual`, 300-second tolerance. Correct; no task in this document changes it.
- `TenantPaywallService` separates the paywall decision from the resulting plan. Deriving one from the other is what made ETP-4966 invisible, and the separation must survive every refactor here.
- Pricing is selected server-side. The browser never proposes a price, and never will.

### 2.2 Blocking gaps

**Payment state is volatile.** `CheckoutPaymentRegistry.java:18-19` holds both the payment correlation and the webhook de-duplication in two static `ConcurrentHashMap` instances. Reproducible consequences:

- A Tomcat restart between the webhook and the customer returning from Checkout erases the payment. The frontend poll at `tools/app-shell/src/pages/UpgradePage.jsx:289-293` (60 attempts, 1 second apart) never sees `paid`; the account was charged and no tenant exists.
- With more than one application node, the webhook lands on one node while the poll and the onboarding request go to another.
- Webhook idempotency is equally volatile, so a Stripe retry after a restart is reprocessed as new.
- Support cannot answer "did this customer pay" without reading application logs.

This also fails the shipped PRD, which requires the request id to be an idempotency boundary surviving "duplicate webhooks, refreshed pages, retries, and backend restarts" (`docs/stripe-paid-tenant-checkout-prd.md:224`), requires the persisted request to stay reconcilable (:226), and lists backend restart and recovery as a validation item (:408).

**There is no plan model.** The commercial plan of a tenant is one `AD_Preference` row, attribute `ETGO_TenantPlan`, valued `free` or `productive` (`TenantPlanService.java:47-53`), read at `EtendoGoJwtDalHelper.java:522` and for environment ordering at `EtendoGoJwtServlet.java:1391`, written at `EtendoGoJwtServlet.java:1573`. It cannot express a price, a quota, a period or a subscription state. `CheckoutConfiguration.priceId()` is a single server-side price, so there is exactly one purchasable thing.

**There is no subscription lifecycle.** `CheckoutConfiguration.mode()` defaults to `subscription` and the Test Mode price is 49 EUR per month, so **Stripe is already billing monthly** every customer who paid. But the webhook handler at `EtendoGoJwtServlet.java:429-440` reacts to exactly two event types, `checkout.session.completed` and `checkout.session.async_payment_succeeded`. A repository-wide search finds no handling of `customer.subscription.*`, `invoice.payment_*` or `charge.dispute.*`. A tenant marked productive stays productive forever: a cancellation, an exhausted retry sequence or a paused collection changes nothing in Etendo.

**There is no reconciliation.** If the customer closes the tab or the 60-second poll expires, the payment is orphaned permanently. Nothing re-reads it.

**The durable seam exists and is disconnected.** `CheckoutWebhookProcessor` defines an `EventStore` interface for exactly this purpose, but it is dead code — referenced only by its own test — because the servlet inlines verification and event claiming at `EtendoGoJwtServlet.java:412-446`.

### 2.3 Precedents in the module that these designs reuse

| Precedent | Location | Reused for |
|---|---|---|
| Aggregate maintained online **plus** query-based recompute | `BankStatementLineAggregateHandler` + `BackfillBankStatementAggregatesProcess` | The measurement design (§6). The recompute had to be added because the observer alone was not trustworthy. |
| Operational tables exposed as Classic windows | 6 AD windows, 5 menu entries: Data-Fix History, Match Rule, Survey Configuration, Schema Forge Configuration, Fiscal Declarations NEO Support, Transaction Type | The Classic surface (§10). `ETGO_DATA_FIX_HISTORY` is the closest analogue: an audit trail deliberately readable without DB access. |
| CDI handler discovery by `@Named` | `NeoServlet` resolving `NeoHandler` | The counting-strategy SPI (§7). Note the documented trap: `@Named` only, never `@ApplicationScoped`, because a proxied bean loses the non-inherited qualifier and is silently skipped. |
| Configurable query fragments in AD | `AD_TAB.whereclause`, `AD_REF_TABLE.whereclause`, `AD_VAL_RULE` | The HQL resource restriction (§7.2). |
| Scheduled job registration | `OnboardingPsd2SyncService` (`AD_Process_Request` + `OBScheduler`) | The aggregation and reconciliation jobs. |
| Layered configuration lookup | `PublicUrlResolver.readProperty` | Kill switches and runtime settings. |

One precedent is **absent** and must not be assumed: there is no manually launchable background process in this module. `AD_PROCESS.xml` contains two entries, both `ISBACKGROUND=N`, and zero `AD_MENU` rows point at a process. Giving reconciliation an operator-triggered entry point is design work, not registration (§9).

---

## 3. Objective

Allow Etendo GO to charge a **recurring monthly amount per plan**, and to be ready — without further development — to cap a resource, to add a new countable resource, and to move a customer between plans at any point in the period.

### 3.1 Success criteria

- A customer on a plan is billed monthly, and Etendo knows the period, the renewals, the failures and the cancellations.
- A payment confirmed by Stripe results in the service the customer paid for, even across a restart, a redeploy or a lost browser session — and if it does not, a job repairs it without a human reading Stripe.
- Enabling a cap on a modeled resource is a row in a Classic window. No code, no deploy, no restart.
- Adding a new countable resource that is a row count is a row in a Classic window.
- An upgrade applies immediately; a downgrade applies at the period boundary; neither moves the customer's monthly billing date.
- Every commercial and operational question — who is on what plan, did this payment arrive, why is this tenant blocked, what did the reconciliation change — is answerable from Etendo Classic.
- Usage consumed through Etendo Classic windows and processes is counted exactly like usage consumed through the new stack.

### 3.2 Non-goals

- Usage-based charging and overage billing. Consumption is **measured** here; charging for it is a separate decision with its own PRD.
- Seat-based pricing.
- Dunning beyond Stripe's own retries.
- Refund and dispute automation. Both stay manual under an ops runbook.
- Changing the billing interval, for example monthly to annual.
- A cross-client data copy engine.

---

## 4. Product decisions

| Decision | Choice | Rationale |
|---|---|---|
| Source of truth for entitlement | Local `ETGO_*` tables | Stripe owns money and proration; Etendo owns access. |
| Billing rail | **Stripe-native**, including Billing Meters when metering arrives | The secret key, webhooks and signature verification are already in production. Metronome from the original design is dropped: a whole new integration, and the prior TDD flagged it as the one surface it could not verify offline. |
| v1 pricing | Flat monthly amount per plan | Simplest thing that recurs. Quotas are modeled and left empty. |
| Charging model target | Base plan plus overage | Quotas exist from day one so overage is later a pricing change, not a schema change. |
| Countable resources | A catalog **table** | Adding a resource must never be a column. |
| Resource restriction | **Configurable HQL fragment** | The Etendo convention (`AD_TAB.whereclause` et al). Guardrails in §7.2. |
| Consumption capture | **Scheduled recomputation by query**, not write-time instrumentation | §6. |
| Consumption window | The **subscription billing period**, never the calendar month | A plan can change mid-period; a calendar-month comparison becomes meaningless the moment it does. |
| Upgrade | Immediate | Paying more to get more later is not an upgrade. |
| Downgrade | At the end of the current period | §8.1. |
| Billing cycle anchor | **Never moved** | One parameter permanently shifts the customer's billing date. |
| Quota absence | No quota row means unlimited | The mechanism ships inert; no magic value can cap a resource at zero. |
| Enforcement | One choke point, kill switch, ships disabled | Guards a security-critical path. |
| Etendo Classic | First-class operational surface | §10. |

---

## 5. Architecture

```
                    Stripe (Checkout, Subscriptions, Schedules, Meters later)
                         │  webhooks (signed)          ▲  price/plan updates
                         ▼                             │
  ┌──────────────────────────────────────────────────────────────────┐
  │ com.etendoerp.go                                                 │
  │                                                                  │
  │  EtendoGoJwtServlet ── CheckoutWebhookProcessor ── EventStore ────┼──▶ ETGO_BILLING_EVENT
  │        │                                                         │      (idempotency gate)
  │        ├── checkout ──────────────────────────────────────────────┼──▶ ETGO_CHECKOUT_REQUEST
  │        └── environment login ── enforcement choke point           │
  │                    │                                             │
  │                    ├── subscription status  ────────────────────  ┼──▶ ETGO_SUBSCRIPTION
  │                    └── quota evaluator ────────────────────────── ┼──▶ ETGO_PLAN / ETGO_PLAN_QUOTA
  │                                     │                            │
  │  aggregation job ── resource catalog ┴──────────────────────────  ┼──▶ ETGO_BILLING_RESOURCE
  │        │                                                         │      ETGO_USAGE_DAILY
  │  reconciliation job ─────────────────────────────────────────────┼──▶ (repairs, alerted)
  │                                                                  │
  │  Etendo Classic: windows + menu + processes over all of the above │
  └──────────────────────────────────────────────────────────────────┘
```

No Node service is introduced. The prior design's `packages/billing-service` is dropped: everything the module needs — HTTP to Stripe, scheduling, DAL, CDI discovery, an AD surface — already exists inside `com.etendoerp.go`, and a second deployable would fragment the state that §2.2 exists to consolidate.

---

## 6. Consumption is measured by scheduled query

Consumption is counted by a scheduled query over existing business tables, not by observing writes as they happen.

The module already proves the point: `BankStatementLineAggregateHandler` maintains an aggregate online through an `EntityPersistenceEventObserver`, and `BackfillBankStatementAggregatesProcess` recomputes the same aggregate by query. The recompute was added because the observer alone was not trustworthy. Starting from the query is arriving at the trustworthy half first.

Each advantage is a risk avoided:

- **No code on the write path.** An observer on document creation runs inside every tenant save; a defect there breaks ERP operation, not just billing. A read-only aggregation cannot.
- **No capture gaps by construction.** An observer must be attached to every relevant entity and every path, and one omission under-counts silently. A query counts what is in the table — Classic windows and processes, the NEO stack, batch processes, CSV imports, data-fixes — without enumerating them. This is what makes Classic usage countable at all, and it is a stronger answer than instrumenting the Classic write path would be.
- **Idempotent by nature.** An aggregate computed by query is a pure function of database state, so it can be recomputed and corrected. An event-emission model must implement its own de-duplication.
- **Historical backfill, which enables shadow mode.** Past periods can be computed, so a full month of consumption can be reviewed before anyone is charged for it. Write-time instrumentation can only count from the day it is deployed.

### 6.1 Counting policy

- Counting is by the date property named in the catalog — `CREATED` in the common case — within the period.
- **A closed day is final.** A document deleted or voided afterwards does not reduce an already-closed day. Counting live rows instead would let consumption decrease, which cannot be un-billed once reported to a payment provider.
- Granularity is daily, keyed by tenant, resource and day, so a later Stripe Billing Meters emission can use a deterministic event identifier per tenant, resource and day and be idempotent end to end.

### 6.2 The one resource this cannot count

**API and MCP request volume.** A request leaves no row, so no query can count it after the fact. It requires a counter written by a request filter — real instrumentation and a separate decision. The catalog and the strategy SPI make it additive whenever that decision is taken. It is explicitly deferred, not forgotten.

---

## 7. Extensibility

### 7.1 The resource catalog

`ETGO_BILLING_RESOURCE` holds one row per countable resource: key, display name, unit label, counting mode and the descriptor the mode needs. System-level (`ACCESSLEVEL=4`), with its own Classic window and menu entry.

Two counting modes, in order of preference:

1. **Declarative HQL** — the row names an entity, its date property, and an optional HQL restriction fragment. The aggregation job builds the counting query from that metadata.
2. **Named strategy** — the row names a CDI qualifier; the job resolves a counting strategy bean by `@Named`, exactly as `NeoServlet` resolves `NeoHandler`. The escape hatch for what is not a row count: active users needs distinct-session logic, request volume needs a counter.

### 7.2 The HQL restriction, and why it is safe

A configurable query fragment is the Etendo convention, not an exception to it — `AD_TAB.whereclause`, `AD_REF_TABLE.whereclause` and `AD_VAL_RULE` all carry implementer-authored fragments today. One line of HQL is far more expressive than a structured predicate builder and keeps tier 2 of the ladder below wide, which is the point.

Three guardrails, all requirements rather than suggestions:

1. **System-authored only.** The catalog is a System-level table reachable only by an authorized system role. A resource restriction must never become tenant-editable. Whoever can write this fragment can already edit `AD_TAB.whereclause`; that is the trust boundary being reused, and it must not be widened.
2. **Tenant and period scoping live outside the fragment and cannot be overridden.** The job composes:
   ```
   select count(*) from <entity> e
    where e.client.id = :clientId
      and e.<dateProperty> >= :from
      and e.<dateProperty> <  :to
      and ( <fragment> )
   ```
   The fragment is **always parenthesized** and the bounds are always named parameters. This is what makes an `or 1=1` inside the fragment harmless: it can widen only what is inside its own parentheses, never escape the client or date filter. A fragment able to break per-tenant attribution would mis-bill every customer at once, so the parenthesization is load-bearing and must be asserted by test.
3. **Validated at save time, with a cost guard.** Saving a catalog row runs the composed query once over a bounded window, so a malformed fragment is rejected at configuration time rather than discovered at 02:00 by a failing job. Execution cost is recorded and surfaced, so a fragment that would table-scan every tenant nightly is visible before it is scheduled.

### 7.3 The extensibility ladder

This must appear verbatim in the delivered documentation, so nobody promises more than the design gives.

| Change | Cost |
|---|---|
| Change or enable a limit on a catalogued resource, at an already-wired enforcement point | **Configuration** |
| Add a resource that is a row count over an entity, with any HQL restriction | **Configuration** |
| Add a resource whose counting is not a row count | **One additive `@Named` strategy class** |
| Enforce at a place not yet wired, for example Etendo Classic writes via a DAL observer | **Development** |

Only the last tier is development, and it is additive rather than a modification. That is the actual test of extensibility, and the honest boundary: *changing a limit is configuration; adding an enforcement point is development.*

---

## 8. Plan change

### 8.1 The two directions are not symmetrical

**Upgrade applies immediately.** The new plan, and therefore the new quota, takes effect the moment the change is accepted.

**Downgrade applies at the end of the current period.** No mid-period credit, no immediate reduction. Three reasons, none of them convention:

1. **It would generate support incidents by design.** With any quota in `block` mode, an immediate downgrade can put a tenant over the lower cap the instant it applies — a customer who just chose to spend less is locked out of their own data. Waiting for the boundary means consumption and quota reset together.
2. **A mid-period downgrade produces customer credit balance,** which has nowhere to live: there is no invoice-history surface and refund automation is out of scope across this whole document.
3. **The customer already paid for the period.** Letting them keep it is both fair and the cheapest thing to build.

### 8.2 The billing date never moves

**Never pass `billing_cycle_anchor: now`.** It is one parameter, it permanently shifts the customer's billing date, and it is the easiest way to destroy the predictable monthly cadence this design exists to preserve. An upgrade changes the price on the existing period; it does not start a new one.

### 8.3 Mechanics

- **Upgrade** — update the subscription item to the target plan's price, anchor unchanged. Proration behavior is a commercial choice between `always_invoice` (bill the difference now; adds a payment attempt at change time) and `create_prorations` (put it on the next monthly invoice; that invoice is then larger than the sticker price, which the UI must say). **Pick one and document it. Do not inherit the default without naming it.**
- **Downgrade** — a Stripe Subscription Schedule created from the subscription, with the target price in a phase starting at the current period end and `proration_behavior: none`. Stripe holds the pending change.
- **Learning that it applied** — the phase transition emits `customer.subscription.updated`, already consumed by the lifecycle path. The entitlement change arrives through the existing mechanism and needs no second one. `subscription_schedule.*` events are optional, for observability, and must never be the sole source of an entitlement change.
- **Local state** — two nullable columns on `ETGO_SUBSCRIPTION`: pending plan and pending effective date. Set when scheduled, cleared when applied or cancelled. They exist so the Classic window, the customer surface and the reconciliation job can all see a pending change without calling Stripe.

### 8.4 Failure and edge paths

- **The prorated upgrade charge fails.** The change already happened in Stripe. Stripe moves the subscription to `past_due` and retries; `past_due` keeps access, and exhausted retries lead to `canceled`. **The upgrade is not rolled back** — no compensating transaction, no half-applied plan. Stated so nobody builds a rollback that fights Stripe.
- **A downgrade is scheduled, then the customer upgrades.** The pending schedule is released and the pending columns cleared. Two pending intentions on one subscription is the bug this prevents.
- **A downgrade is scheduled twice.** Idempotent: the second request replaces the pending target rather than creating a second schedule.
- **Downgrading below current consumption.** The request must surface the numbers before confirmation, because the consequence lands at the period boundary when nobody is watching. Warning or refusal is a product decision to record; silently accepting is not an option.
- **Change requested while `past_due` or `canceled`.** Define and test the answer; do not let it fall through to an unhandled provider error.

---

## 9. Lifecycle, enforcement and reconciliation

### 9.1 Subscription states

`active`, `past_due`, `canceled`. Stripe Smart Retries own recovery; Etendo records outcomes. No dunning logic of our own.

Events consumed: `customer.subscription.updated` and `customer.subscription.deleted` for state, `invoice.payment_succeeded` to advance the period, `invoice.payment_failed` to mark at risk, `charge.dispute.created` as an alert only with no automatic state change.

### 9.2 Enforcement

A single choke point at environment login, in a dedicated testable class.

- `past_due` keeps access — the customer is still being retried.
- `canceled` denies it, with a resubscribe path for the owner.
- **A tenant with no subscription row is never blocked.** This is what keeps grandfathered and free tenants safe if the switch is flipped early.
- Quota denial is evaluated by the generic evaluator, which returns allow, warn or deny plus the numbers behind the decision. Messages are built from catalog metadata — display name and unit — never from a per-resource string, otherwise a newly added resource ships with no message.
- Enforcement ships **disabled**, enabled per deployment through the layered configuration pattern, so it can be turned off without a deploy.
- If a second enforcement point is ever added it must obtain its verdict from the same evaluator. A second place deciding what over-quota means is how the two drift apart.

Already-issued NEO JWTs continue to work until they expire. The accepted window must be stated in the delivered documentation.

### 9.3 Reconciliation

With consumption measured by recomputation rather than instrumentation, reconciliation is not a safety net — it is the primary correctness mechanism of the subsystem.

- Scheduled, plus **operator-triggerable from Etendo Classic**. Note §2.3: there is no precedent for a menu-launched process in this module, so this entry point is design work.
- **Provider to local:** a paid checkout session with no provisioned tenant is repaired by completing provisioning, and the repair is alerted. A Stripe subscription without our correlation metadata is foreign and never touched.
- **Local to provider:** for every locally active subscription, read the *real* Stripe status. Anything not `active` or `trialing` — cancelled, paused, `incomplete_expired`, absent — is corrected locally. Reading the actual status, rather than only reacting to a deletion event, is what catches paused collection and dashboard actions that emit no event.
- **Abandoned checkouts:** a stale request row is closed only after re-reading the provider. **A row whose provider session id is missing is never closed automatically** — it is alerted for manual review, because closing it is the one unrecoverable answer.
- Every repair is visible in the Classic windows, not only in a log line, and alerted with a stable structured prefix so drift is visible rather than silently fixed.

---

## 10. Etendo Classic surface

Billing must not be the only operational subsystem in the module without an AD surface. Following the six windows and five menu entries the module already ships:

| Table | Window | Mode |
|---|---|---|
| `ETGO_PLAN` (+ `ETGO_PLAN_QUOTA` child tab) | Plans | Editable — commercial creates, prices and caps a plan without SQL |
| `ETGO_SUBSCRIPTION` | Subscriptions | Read-mostly, plus a plan-change action for assisted cases |
| `ETGO_BILLING_RESOURCE` | Billable resources | Editable, System role only |
| `ETGO_USAGE_DAILY` | Usage | Read-only |
| `ETGO_CHECKOUT_REQUEST`, `ETGO_BILLING_EVENT` | Payment requests, Billing events | Read-only audit trail, the `ETGO_DATA_FIX_HISTORY` pattern |
| Reconciliation | Process | Operator-launchable, result reported |

Tables are System-level with rows at client `0`, like `ETGO_ACCOUNT`; window access is restricted accordingly, which is the correct restriction for billing data.

The acceptance bar: **no billing or payment question requires reading a log file or the database to answer.**

---

## 11. Data model

| Table | Purpose | Notes |
|---|---|---|
| `ETGO_CHECKOUT_REQUEST` | One row per checkout attempt | Server-generated request id is the correlation anchor. Provider session id persisted **before** the customer is redirected, so an abandoned checkout is always re-checkable. |
| `ETGO_BILLING_EVENT` | Provider event log | Unique constraint on event id is the idempotency gate. Trimmed payload summary only — never card data, never a full provider payload. |
| `ETGO_PLAN` | Plan header | Key, name, provider price id, interval, display price and currency, active. |
| `ETGO_PLAN_QUOTA` | Quota child of a plan | Plan, resource, included quantity, enforcement mode, warning threshold, consumption source. Unique on plan plus resource. |
| `ETGO_SUBSCRIPTION` | Tenant subscription | `ENVIRONMENT_CLIENT_ID` — deliberately **not** `AD_CLIENT_ID`, which is the audit column. Plan, status, current period start and end, provider customer and subscription ids, owning account, pending plan and pending effective date. |
| `ETGO_BILLING_RESOURCE` | Countable resource catalog | Key, name, unit, counting mode, entity, date property, HQL restriction, strategy qualifier. |
| `ETGO_USAGE_DAILY` | Consumption aggregate | Tenant, resource, day, value, computed-at. |

All `_ID` columns are `VARCHAR(32)` and every new AD id is generated with `make uuid` — never hand-typed.

### 11.1 Two shape decisions worth their own note

**Quotas are a child table, not columns on the plan.** Discrete quota columns are editable in Classic but turn the set of resources into schema: adding a resource would mean a column plus `AD_COLUMN`, `AD_ELEMENT`, `AD_FIELD`, `update.database` and a deploy. A JSON blob is extensible but renders in a Classic window as an opaque textarea with no validation. The header-and-lines pattern satisfies both, and lets two plans cap the same resource differently with no new schema.

**Absence of a quota row is the unlimited case.** There is no `NOT NULL DEFAULT 0` anywhere. A default-zero column would cap every resource on every plan at zero the moment the evaluator went live.

### 11.2 Migration

Every tenant carrying the `productive` preference gets a subscription row on a grandfathered legacy plan, `active`, with null provider ids and no quota rows. Tenants without the preference get no row and keep reading as free. Idempotent, delivered as a SQL data-fix under `cli/src/data-fixes/`. The preference write path is retired once the backfill is verified.

---

## 12. Security

- [ ] Webhook signature verified on the raw body before any parsing; replay of an old event resolves to a duplicate.
- [ ] Idempotency is a database constraint, not a map — it survives a restart.
- [ ] Resource HQL restrictions are System-authored only, and never tenant-editable.
- [ ] Tenant and period scoping is applied outside every configurable fragment, which is always parenthesized. Asserted by test.
- [ ] No configurable value reaches the database as concatenated SQL; a hostile fragment is rejected at validation, not executed.
- [ ] A leaked request or subscription id grants nothing; ownership is verified server-side on every resume, re-subscribe and plan change.
- [ ] Prices and plans are resolved server-side from a plan key. A browser cannot select a price.
- [ ] No card data, full provider payloads or secrets in any table or log.
- [ ] Provisioning and deprovisioning cannot target arbitrary clients; deprovision refuses anything not in the expected state.
- [ ] Enforcement is reachable from exactly one call site; account login, SSO and password reset are provably untouched.
- [ ] Secrets via environment or properties only, with no repository default.

---

## 13. Testing

- **JUnit / OBBaseTest:** event-store claim including the duplicate branch; restart survival; the enforcement matrix over status × flag × presence of a subscription row, including the no-row case that must always allow; plan resolution and the grandfathered path; backfill idempotency; aggregation idempotency over a re-run range; the parenthesization containment test; plan-change transitions including the not-rolled-back failure path.
- **Extensibility proof, not assertion:** a test that registers a *new* catalog resource in a fixture, caps it, and asserts it is evaluated and denied correctly with a complete message — without touching evaluator code. If this test needs a code change to pass, the extensibility claim is false.
- **Period-scoping proof:** a test whose period boundary does not coincide with a month boundary.
- **Vitest** for UI surfaces, queried by `data-testid` per repo convention.
- **Local webhook testing** is documented in [`stripe-local-testing.md`](../stripe-local-testing.md); `make test-stripe-local` (`Makefile:120` → `tools/stripe-local-smoke.sh`) starts forwarding and smoke-tests the endpoint. Two caveats:
  - That guide's §7 defers the idempotency replay step until "the durable webhook route is available" and §9 notes a 404 on the webhook path is expected until then. Those notes anticipate the durable-state task; closing it unblocks them.
  - The smoke path produces only `checkout.session.completed`. Lifecycle events must be produced deliberately with `stripe trigger customer.subscription.deleted`, `stripe trigger invoice.payment_failed` and equivalents, or from the Test Mode dashboard. Extending the guide with a lifecycle section is part of the lifecycle task.
  - The `whsec_` belongs to the specific `stripe listen` session that printed it, and a running JVM does not pick up environment variables exported after it started. These two together account for most lost debugging time.

---

## 14. Delivery

| Task | Scope | Blocked by |
|---|---|---|
| **ETP-5045** | Durable checkout and payment state; wire the `EventStore` seam; retire `CheckoutPaymentRegistry`; Classic audit windows | — |
| **ETP-5050** | Resource catalog with declarative HQL and the strategy SPI; daily aggregation and recompute; Classic usage window; would-have-billed report. Shadow mode | — |
| **ETP-5046** | `ETGO_PLAN` + `ETGO_PLAN_QUOTA` + `ETGO_SUBSCRIPTION`; Classic plan window with quota child tab; backfill; retire the preference | 5045, 5050 |
| **ETP-5047** | Lifecycle webhooks; `active`/`past_due`/`canceled`; enforcement choke point with kill switch | 5046 |
| **ETP-5048** | Bidirectional reconciliation, orphaned-payment recovery, operator-launchable from Classic | 5045 |
| **ETP-5051** | Generic quota evaluator; per-quota configuration; period-scoped consumption; wired at login and the NEO write path | 5046, 5050 |
| **ETP-5053** | Upgrade immediate, downgrade at period end, anchor preserved, pending-change state and surfaces | 5046, 5047 |
| **ETP-5049** | Plan selection and subscription status in the customer UI | 5046 |

**Two tracks start immediately and in parallel: ETP-5045 and ETP-5050.** The critical path to a first recurring charge is the later of those two, then 5046, then 5047. ETP-5048 starts as soon as 5045 lands.

**Recurring monthly billing is delivered by 5045 → 5046 → 5047 plus 5048.** ETP-5051 and ETP-5053 are the readiness the objective asks for: capping becomes configuration, and a customer can change plan at any moment without their billing date moving.

That ETP-5050 blocks ETP-5046 is a real cost of making the resource catalog data rather than schema. It is stated rather than hidden, and it is worth paying once.

---

## 15. Open decisions

| Decision | Owner | Blocks |
|---|---|---|
| Upgrade proration: `always_invoice` or `create_prorations` | Product | ETP-5053 implementation |
| Downgrade below current consumption: warn or refuse | Product | ETP-5053 implementation |
| "Documents issued": one resource with an HQL status restriction, or one resource per document type | Product | Catalog seeding in ETP-5050. Reversible later without development, since the catalog is data. |
| Plan names, monthly amounts and currency; whether regional pricing is needed | Product | ETP-5046 seeding |
| Quota values per plan | Product, informed by the shadow-mode report | ETP-5051 activation, not its implementation |
| Whether request volume justifies write-path instrumentation | Product + Platform | A future task; nothing here depends on it |

---

## 16. Deliberately deferred

Overage charging and emission to Stripe Billing Meters · API and MCP request counting · seat-based pricing · annual intervals · proration of anything other than a plan change · refund and dispute automation · a DAL enforcement point covering Classic writes · trial periods · a cross-client data copy engine.

Each is additive against this design. None requires revisiting a decision in §4.
