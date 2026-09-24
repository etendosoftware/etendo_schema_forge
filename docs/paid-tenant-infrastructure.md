# Paid Tenant Infrastructure — Consolidated Narrative

**Status:** Active · **Feature:** paid productive environment (registry id `paid-second-tenant`) · **Jira:** ETP-4686, ETP-4966, epic ETP-3504

> **Two things in this document changed after it was written, and both inverted:** the checkout is
> **real Stripe with real charges**, and the `tenant-upgrade` flag **no longer exists** (ETP-4966).
> Sections that describe a mock payment or a flag-off path are historical. The flag retired because
> it caused an incident: the browser resolved it through ConfigCat while the backend resolved it
> through local properties that were unset in every deployed environment, so accounts were charged
> and then handed a Demo environment.

**About this document.** This is a single linear account of one feature: how a user on a
free Etendo GO tenant gets a second, paid, productive one — and of the two systems built
around it, the feature-flag layer and the per-flag technical-debt scorecard. It is written
to be read end to end, without the code and without following links.

It is a **consolidated narrative, not a source of truth.** Where it restates a fact, that
fact is a *snapshot* of a canonical source, and the snapshot is labelled where it appears.
The canonical sources are:

| Canonical for | Lives in |
|---------------|----------|
| Per-flag facts: owned paths, TTL, test specs, open items | `flags-registry.json` (repo root) |
| The frontend flag system and the tenant-upgrade UI flow | `docs/feature-flags.md` |
| The scorer: dimensions, points, registry schema | `docs/flag-debt.md` |
| How to record debt, and the protocols around it | `docs/technical-debt-playbook.md` |
| The backend: server-side flags, paywall, plan marker | `com.etendoerp.go` → `docs/feature-flags-and-tenant-upgrade.md` |

---

# Part 1 — The product story

## 1.1 The situation before this feature

A person signs up for Etendo GO and gets one tenant. It is free, and it is meant for
looking around: sample data, one place to try things, nothing anyone would run a business
on. A tenant is a fully separate Etendo client — its own data, its own users, its own
accounting.

The gap: someone who has finished evaluating and wants to start working for real has no
path forward inside the product. There is no way to buy anything, and no notion anywhere in
the system of a tenant that was paid for.

## 1.2 What the feature adds

A second tenant, described in the UI as **productive**, created through a checkout flow,
while the original free tenant stays exactly as it was. Nothing is migrated, nothing is
upgraded in place. The account ends up owning two tenants with different purposes.

The whole path is **unconditional**. It was behind a feature flag called `tenant-upgrade`, retired in
ETP-4966; there is no way to switch the capability off, by design.

**The money is real.** Checkout is Stripe hosted checkout with a live secret key and a signed
webhook, and a card is charged. Everything around it is real too: the paywall decision that gates
provisioning, the confirmed-payment correlation that authorises it, and the record of which plan an
environment is on.

Two consequences follow, and neither is hypothetical:

- Every gap listed under *real payment readiness* in `flags-registry.json` is now exposure against
  actual charges, not a precondition for some future gateway.
- A payment confirmed by the webhook is the **only** thing that marks an environment productive. It
  used to be inferred from the paywall decision, which is what made a charged account read back as
  free once the flag was unset.

## 1.3 The end-to-end flow, step by step

1. **The user is signed in** to their free tenant and opens the avatar menu in the top bar.
2. **The menu shows the upgrade entry.** Always — it is not gated. Since ETP-4966 the web app asks
   no flag system anything here.
3. **The user selects the upgrade entry** and lands on the `/upgrade` page.
4. **The page asks the backend which tenants this account already owns.** This decides which
   of three things it shows next.
5. **Branch A — the account owns no tenants at all.** The page says the first tenant is free
   and offers a link to the ordinary onboarding flow. No checkout is shown, because there is
   nothing to charge for.
6. **Branch B — the account lookup failed.** The checkout is shown anyway. The backend is the
   authority on whether payment is required, so a failed lookup in the browser must not block
   a legitimate upgrade.
7. **Branch C — the account already owns at least one environment.** The page presents the
   Free and Productive plans. Selecting Productive opens the Add-ons step, which remains in the
   flow for every origin. When the current authenticated environment is a demo, this step offers
   product and contact transfer choices. When the current environment is already productive, it
   explains that the new environment starts without demo data and offers no transfer controls.
   Back from Add-ons returns to the plan step; Continue opens payment. Back from payment returns
   to Add-ons, preserving the current form and transfer selections.
8. **The user enters the new environment name on the payment step.** A productive-origin
   purchase starts with a blank name so the current environment is not mistaken for the target.
   A demo-origin purchase can select an exact source environment; the request carries its
   `demoClientId`, not a name-based lookup. The backend validates that this ID is a demo owned by
   the account. Productive-origin requests discard any demo selection.
9. **The browser creates a durable billing purchase** through the account-scoped
   `POST /sws/go/billing/purchases` endpoint. The request describes the action, target name,
   locale and, only for a demo-origin purchase, the selected `demoClientId` and products/contacts
   transfer choices. The backend records both against the checkout request before redirecting to
   Stripe; the browser also carries the toggles through the redirect for the onboarding request.
   The browser does not collect or send card details. In Vite development, upgrade API calls
   remain same-origin (`/sws/...`) for the Vite proxy to forward to Etendo.
10. **The backend creates hosted Stripe Checkout.** The configured Stripe Price is the source of
    the amount, currency and billing interval returned by `GET /sws/go/billing/offers` for the
    plan preview. Checkout uses the same server-configured Price ID. Stripe owns card entry and
    payment; the Etendo GO page redirects to the returned hosted URL.
11. **Stripe returns the browser to Etendo GO.** A successful return includes the durable
    checkout request ID. The page asks the backend for payment status and begins provisioning
    only after the backend confirms payment. A cancelled return clears the pending browser state
    and the Stripe return query parameters. Unit coverage exercises this cancellation handler;
    the browser redirect behavior has not been runtime-verified as part of this task.
12. **The backend provisions against the paid purchase ID.** The purchase ID is sent as the
    onboarding payment token, and the backend checks its account ownership and paid status. For a
    demo-origin purchase, the backend uses the exact stored demo client ID and transfer choice.
    A productive-origin purchase discards any stale demo ID or transfer options in the request,
    so it cannot copy from a demo.
13. **A failure after payment leaves a recoverable purchase.** The billing overview shows only
    purchases with confirmed payment: *paid*, *preparing*, or *ready*. Unpaid `CREATING` and
    `CREATED` checkout attempts are hidden; they are not paid purchases or environments. Resuming
    a paid purchase reuses its existing `purchaseId`, exact demo source, and server-persisted
    products/contacts selection; it does not create a second charge or choose a source by name.
    The backend uses a fenced provisioning claim and reruns the idempotent reconciliation chain,
    so a retry continues the paid request instead of creating another purchase. Legacy paid
    records without a recorded selection fail closed and need support-assisted resolution.
14. **The page waits for the canonical environment selector to catch up.** Provisioning returns
    the new Etendo `clientId`; the page refreshes the account environment list and matches that
    exact ID. It does not treat a matching name as proof that the new environment is present. If
    the projection has not caught up after bounded retries, the page offers an explicit sync
    retry.
15. **The user can enter the new environment.** Once the exact `clientId` appears in the
    canonical list, the success action switches directly to that environment. The picker lists
    the account's environments, with productive ones sorted first and each environment badged
    with its plan.

## 1.4 The plan is visible in the picker

The company switcher badges each environment *Demo* or *Productivo* from the per-environment
`plan` field that `GET /sws/go/environments` returns, and it sorts productive environments first.
This closed the open item that Part 4 recorded as `plan-badge-in-env-picker`.

That badge is also where ETP-4966 surfaced. It was reported as "I paid with Stripe and it still says
Demo", and the badge was telling the truth: the backend really had recorded the environment as free,
because the productive marker was gated on a flag that resolved to off on the server. The lesson is
in the direction of the fix — the badge was not the bug, and changing what it displays would have
hidden a genuine billing error instead of correcting it.

One related subtlety: the badge is withheld, rather than shown as *Demo*, when the current
environment cannot be resolved at all (a session with no platform token cannot list environments).
Labelling that case *Demo* would report a plan derived from a missing value.

## 1.5 Which token the account-scoped endpoints accept

`GET /sws/go/environments` and its siblings — `/sws/go/me`, `/sws/go/login`,
`/sws/go/checkout/sessions`, `/sws/go/onboarding/draft`, the company-invitation endpoints — are
*account*-scoped, not tenant-scoped. They accept two different credentials and resolve both to one
`ETGO_ACCOUNT` (`EtendoGoJwtDalHelper.findActiveAccountByBearerToken`):

1. the **account session token**, matched directly against `etgo_account.session_token`; and
2. the **environment JWT** of the tenant the user is currently inside — the credential the browser
   prefers, because it stays valid when another tab refreshes the account token.

Resolving the second one is not a string comparison. `AD_User.email` is empty for every tenant
onboarding creates (`InitialSetupUtility.insertUser` writes only `username`), so the account
identity lives in the username — and onboarding names the *first* environment user after the plain
account email and every later one `<accountEmail>+<clientName>`
(`EtendoGoJwtSupport.buildClientUsername`). Recovering the account therefore means stripping that
suffix, which is what `GoAccountResolver.findAccountByUsername` does, splitting on the **last** `+`
so a plus-addressed account email survives intact.

ETP-4985 is what happens when that step is skipped: an exact-match-only lookup resolves the first
tenant and silently fails for every later one, so a perfectly valid, freshly issued token is
answered with `401 Invalid or expired token`. The affected population is exactly the accounts that
own more than one tenant — the ones the paid upgrade targets. Two consequences worth keeping in
mind when touching this path:

- **Stripping the suffix is not a relaxation of tenant isolation.** The `clientBelongsToAccountEmail`
  check still runs afterwards: the client the JWT was issued for must be owned by the resolved
  account. Suffix recovery decides *which* account is asking, never *what* it may reach.
- **A failed lookup is not the same as an account with no tenants.** `/upgrade` treats an empty
  environment list as "your first tenant is free" and a failed lookup as "checkout, but warn":
  the convert-this-environment option cannot be rendered without the list, so the page says so and
  offers a retry instead of quietly presenting a create-a-new-tenant form to someone who wanted to
  upgrade the tenant they are in.

---

# Part 2 — The feature flag architecture

## 2.1 What a flag is used for here, and what it is not

A feature flag decides **what the interface shows**. It is not a security boundary. Anyone
can change a flag value in their own browser, so every capability a flag reveals must be
enforced independently by the backend.

The clearest expression of that rule in this feature: the `/upgrade` route is registered
**unconditionally**. Only the *menu entry pointing at it* is flag-gated. Hiding the route
would suggest the flag was protecting something, which it is not — anyone can type the URL,
and it is the backend paywall, not the flag, that stops them getting a free tenant.

## 2.2 One vendor-neutral API, two independent implementations

Both the web application and the backend use **OpenFeature**, a vendor-neutral flag API, as
the interface their code calls. Underneath, each side currently uses a **local** control
plane. Neither talks to a flag service over the network.

The reason for adopting the API before adopting any vendor is migration cost: when a hosted
control plane is introduced later, the work is to return a different provider from one
function on each side. Every call site stays as it is.

**Frontend, step by step at application startup:**

1. Startup reads the current identity from browser storage — the username, and the tenant
   identifier.
2. It builds an evaluation context from them: `targetingKey` (OpenFeature's standard identity
   key) from the username, and `account_id` from the tenant.
3. It registers an *exposure hook*, before the provider, so the very first evaluations are
   counted.
4. It creates the provider from **one function** — the swap point — which today builds an
   in-memory provider seeded from an environment variable.
5. It registers that provider, under a timeout.
6. Startup **never blocks and never fails.** If any of this goes wrong, the application
   proceeds and every flag resolves to the safe default declared in code.
7. When the user later signs in, the evaluation context is re-applied with the real identity,
   so bucketing follows the signed-in user rather than whoever was captured at startup.

**Backend, per evaluation:** application code calls a single entry point, passing the flag
key and a context built from the account email. The value is resolved in-process from
configuration — no network call, no background thread, no polling. The provider is bound to
a private OpenFeature *domain* so this module cannot clobber a provider another module
installed.

## 2.3 The three rules that hold regardless of provider

1. **The safe default lives in code**, and it must describe *today's shipped behaviour*. Every
   flag defaults to `false`, so with no configuration anywhere a gated feature stays hidden and a
   broken control plane degrades to the current product rather than exposing unfinished work.
   ETP-4966 is the counter-example that bounds this rule: defaulting to `false` also makes "nobody
   configured this" indistinguishable from "deliberately off", so a flag must never be the only
   thing standing between a payment and its effect.
2. **Flags never block rendering.** Flag startup is fire-and-forget and never rejects; flag
   reads are synchronous. A component renders immediately with the default and re-renders if
   and when the value arrives.
3. **Flags gate presentation only.** The backend enforces access independently, and the
   backend is authoritative.

Rule 2 has a subtlety worth stating because it is invisible when it breaks. Components
routinely mount *before* the provider is registered, so the **re-render** is the load-bearing
half of the rule. The web SDK announces readiness one microtask before the new provider is
actually installed for evaluation — so a subscriber that re-reads the value synchronously
inside the handler sees the *old* value, concludes nothing changed, and never re-renders. No
later event corrects it. The hook therefore notifies both synchronously and on the next
microtask, which is correct on whichever side of that boundary the installation lands.
Without it, a component that mounts first is pinned to its default for the entire session —
and the failure is undetectable, because a flag reading `false` looks exactly like a flag
that is genuinely off.

## 2.4 How a flag is configured today

**Frontend:** one environment variable, `VITE_FEATURE_FLAGS`, holding a JSON map of flag key
to boolean. One variable covers every flag, so adding a flag needs no new plumbing and there
is no naming convention to keep in sync. Unset, empty, malformed, or non-boolean values fall
back to the declared defaults.

```bash
VITE_FEATURE_FLAGS='{"proof-of-concept-menu":true}' make dev
```

**Backend:** a property per flag, resolved in priority order — JVM system property, then the
Etendo properties file, then an environment variable: `etendo.go.flags.<key>` or
`ETGO_FLAG_<KEY>`. Accepted affirmatives are `true`, `Y`, `yes`, `1`; negatives
are `false`, `N`, `no`, `0`; case-insensitive. No backend flag is declared today.

**These two are different control planes, and that is the trap ETP-4966 fell into.** The deployed
frontend reads its flags from ConfigCat, the backend from the properties above, and nothing compares
them. `ETGO_FLAG_TENANT_UPGRADE` was never set in experimental, staging or production while ConfigCat
had the same key on — so the browser sold environments the backend gave away. Either both ends read
the same control plane, or the backend is the only evaluator and the browser asks it.

A value that is present but not parseable as a boolean resolves to the code default *and
records a parse error on the evaluation*, so a typo is visible rather than silently reading
as "disabled".

Because backend flags come from configuration, this provider serves **environment-level
rollout, not per-user targeting**. The evaluation context is accepted and passed through but
does not affect the result. Per-user bucketing arrives with a hosted provider — and see
Part 5.1 for the precondition that has to close first.

## 2.5 Exposure events

While the control plane is local, nothing reports which users saw which variant. So the
frontend registers a hook that emits an analytics event on each flag exposure, carrying the
flag key, the resolved value, the variant name, the provider name and the targeting key.

Two behaviours are deliberate. It is **deduplicated per flag/value/provider** — one event per
combination per session, not one per render, because the flag is re-evaluated on every render and
the raw stream would be uncountable. The provider is part of the key on purpose: the hook is
registered before the real control plane is ready, so the very first evaluation on every page
load — practically every session, since the initial render is synchronous and the real provider
needs an async import plus, for ConfigCat, a network round-trip — goes through OpenFeature's
built-in no-op default. Deduplicating on value alone let that transient result permanently claim
the session's report, silently swallowing every later evaluation once the real provider took
over. And it **never disturbs evaluation** — the hook runs inside flag resolution, never awaits
and never throws, so a reporting failure cannot change what a flag resolves to.

The `provider` value itself is pinned by `createFlagProvider`, not read as-is from the SDK:
ConfigCat's own provider names itself from its JS class name, which a minifier can rename per
build — seen as both `_ConfigCatWebProvider` and `ut` across different production deploys. Both
mean the same live control plane; `createFlagProvider` now reports it as the stable `configcat`
regardless of build.

This hook is temporary by design: a hosted control plane reports exposures natively, and
keeping both would double-count.

## 2.6 Where flagged code is allowed to live

This is a rule, not a preference, and two things depend on it.

1. **Each flag owns its files.** All logic a flag gates lives in directories belonging to
   that flag.
2. **Shared files hold toggle points only** — the minimum needed to reach the flag's own
   code: a route registration, a menu entry. Never business logic. If a shared file starts
   branching on a flag beyond "show this / route there", the logic belongs in the flag's own
   module.
3. **Framework files belong to no flag.** The flag infrastructure itself serves every flag
   and is excluded from per-flag attribution.

What depends on it: the **debt scorecard**, which measures a flag's code over its owned
paths and only means anything if those paths contain the flag's code and nothing else; and
**cheap removal at end of life**, which should be *delete the owned directories, then remove
the touch points a grep finds*. Code smeared across shared files turns that into archaeology.

*Snapshot of `flags-registry.json`, which is canonical:* the `paid-second-tenant` feature owns a
frontend `lib/upgrade/` directory and the upgrade page, plus a backend `payment` package. Its touch
points are the route registration, the avatar menu, and the backend servlet that enforces the
paywall. Its `flag` object was removed when the flag retired — the entry itself stays, so the feature
keeps scoring its paths, specs and open items as shipped.

---

# Part 3 — The paywall

## 3.1 Billing and onboarding contracts

The paid flow has separate contracts for the commercial purchase and environment provisioning:

| Endpoint | Purpose |
|---|---|
| `GET /sws/go/billing/offers` | Returns the current productive offer's `amountMinor`, `currency`, and recurring `interval`. The backend retrieves these from the configured Stripe Price. |
| `POST /sws/go/billing/purchases` | Creates a durable account-scoped purchase and hosted Stripe Checkout session. A demo-origin request can include its selected `demoClientId`. |
| `GET /sws/go/billing/overview` | Returns the account's purchase states. The UI shows only `PAID`, `PROVISIONING`, and `PROVISIONED`; unpaid `CREATING` and `CREATED` attempts are not environments and are hidden from the recovery list. |
| `GET /sws/go/billing/purchases/{purchaseId}` | Reads one account-scoped purchase, including its fixed demo source and created `clientId` when available. |
| `GET /sws/go/checkout/sessions/{requestId}` | Returns whether the backend has confirmed payment for this account's checkout request. Unknown or foreign IDs are indistinguishable from pending. |
| `POST /sws/go/onboarding` | Starts the existing NDJSON provisioning stream using the paid checkout request ID as `paymentToken`. |

The payment decision remains server-authoritative. Stripe's signed webhook records payment
against the durable checkout request; a browser return URL alone never authorizes provisioning.
The onboarding endpoint validates the account, request ownership, paid state, and provisioning
claim before opening the stream. A refusal is returned as JSON before provisioning begins.

## 3.2 The purchase and retry lifecycle

The checkout request ID is the stable correlation key across Stripe, payment confirmation, and
provisioning. It is also the purchase ID shown to the browser. The request records the target
environment name and, when selected, the demo's exact `AD_CLIENT_ID`; it is not reconstructed by
searching a name after payment.

An unpaid `CREATING` or `CREATED` purchase is not an environment and is omitted from the recovery
list. It can reopen hosted checkout using the same request ID when the user submits the same
purchase intent again. Once payment is confirmed, the UI shows the purchase as `PAID`,
`PROVISIONING`, or `PROVISIONED`. Resuming a paid purchase reuses its existing `purchaseId` as the
onboarding `paymentToken`; it does not create a second purchase or charge. The backend atomically
claims the paid request for provisioning. Concurrent attempts are fenced, and a retry after a
recorded failure or expired provisioning lease re-enters the idempotent reconciliation chain for
the same environment.

For a new demo-origin purchase, the selected demo's exact `AD_CLIENT_ID` and the products/contacts
transfer choice are stored against the checkout request before redirect. Onboarding and paid
retries use that purchase-bound selection; the backend restores it over any browser-supplied values.
The source is not inferred from a name or selected by looking for the only free demo. A recorded
empty source remains empty. Productive-origin requests
discard stale demo and transfer fields and cannot copy from a demo. Legacy paid purchases that
predate persisted selection cannot be resumed automatically: the backend fails closed with
`PURCHASE_SELECTION_UNAVAILABLE` and requires a new purchase or support-assisted resolution. It
does not guess a source for those rows.

After provisioning, the response includes the newly created environment's `clientId`. The UI
refreshes the canonical environment list and waits for an entry with that exact ID before
offering the environment switch. Matching `clientName` is insufficient because names can
collide. If the list projection is delayed, a bounded automatic refresh is followed by a user
visible sync retry; it does not trigger another payment or provisioning run.

## 3.3 Stripe offer and payment

The backend reads the configured recurring Stripe Price using its server-side secret key and
projects that same Price's `unit_amount`, `currency`, and recurring interval from
`GET /sws/go/billing/offers`. Checkout submits the configured Price ID as its single line item.
The projection rejects unavailable, inactive, non-recurring, or unsupported interval prices
rather than displaying a locally maintained fallback that could disagree with checkout.

The browser formats Stripe's integer `amountMinor` using the returned currency, including
zero-decimal and compatibility currencies, then displays the returned interval. If the offer
cannot be retrieved, the page does not invent a fallback amount. Card details are entered on
Stripe's hosted page; the Etendo GO browser neither collects nor mints payment tokens. The
checkout request ID is an internal correlation key, not proof of payment by itself.

## 3.4 The plan marker

A tenant created through the paid flow is marked **productive**; every other tenant is
**free**.

It is stored as an ordinary Etendo preference row attached to the tenant's own client, reusing
existing application-dictionary metadata — no new table, column or window, and no database
export step, because the row is created at runtime as data. This mirrors how the module
already stores navigator favourites and saved filters.

**Absence means free.** Every tenant provisioned before this feature, and every first unpaid
tenant, reads back as free without any migration.

**Only a request that actually had to clear the paywall counts as paid.** A first tenant, or
a resume, stays free even if the payload happened to carry a token.

**The write is best-effort in one direction, and that matters.** It happens inside the
onboarding transaction, so a successful write commits with the tenant. But the marking step
swallows its own failures rather than rolling back a whole tenant over a piece of commercial
metadata — which means **a paid tenant can commit unmarked and read back as free**. The trade
is deliberate. Its consequence is not a technicality: the plan marker is *not a guaranteed
record of payment*, and reconciling a tenant that paid but reads as free is a billing concern,
not something this write can promise.

## 3.5 What the environments endpoint now returns

`GET /sws/go/environments` gained two additive, backward-compatible fields:

```json
{
  "environments": [
    {
      "clientId": "…", "clientName": "…", "orgId": "…", "orgName": "…",
      "adminUserId": "…", "adminUser": "…", "adminUserName": "…",
      "plan": "free"
    }
  ],
  "accountEmail": "user@example.com"
}
```

- **`plan`**, per environment, is `"free"` or `"productive"` — intended for badging each
  tenant in the picker. Treat a missing field as `"free"`.
- **`accountEmail`**, at the top level, is the identity the backend targets flags on.

There is a trap worth naming: the shared helper that most clients use to fetch environments
returns only the environments array, so it **silently discards every top-level field**. A
consumer using the helper sees no `accountEmail` and gets no error. Reading it requires a
direct request.

## 3.6 Checkout funnel events

The exposure hook in §2.5 only reports that the menu item was evaluated, not what the user did
on `/upgrade`. `UpgradePage.jsx` and `lib/upgrade/` emit their own events, through the same
`OBSERVABILITY_EVENTS` registry and `track()` call the rest of the app uses (see
`docs/ops/mixpanel-kpi-emission-spec.md`), so the emitted parts of this funnel are queryable in
Mixpanel like any other product flow:

| Event | Fired when | Key properties |
| --- | --- | --- |
| `upgrade_page_viewed` | Account lookup settles, once | `branch`: `checkout` \| `first_tenant_free` \| `unavailable` |
| `upgrade_first_tenant_free_continued` | User continues from the first-tenant-free panel to onboarding | — |
| `upgrade_existing_tenant_name_blocked` | Reserved in the event registry; currently not emitted | — |
| `upgrade_session_expired` | Reserved in the event registry; currently not emitted | — |
| `upgrade_checkout_submitted` | Validated form submitted, before creating the billing purchase | `upgradeAction` |
| `upgrade_payment_declined` | Defined for a future backend/webhook emitter; currently not emitted by the browser because Stripe owns card entry and decline handling | `reason` |
| `upgrade_tenant_provisioning_succeeded` | NDJSON stream resolved with `success: true` | `durationMs`, `upgradeAction` |
| `upgrade_tenant_provisioning_failed` | Checkout return, onboarding stream, or provisioning request failed | `durationMs`, `errorCode` |
| `upgrade_enter_tenant_failed` | Post-success "enter the new tenant" step could not switch environments | — |

Two things this table makes possible that flag exposure alone cannot: a **checkout funnel**
(`upgrade_checkout_submitted` → `upgrade_tenant_provisioning_succeeded`, conversion and drop-off)
and a **provisioning latency KPI** (`durationMs` on the terminal events, p50/p90 over time).
`durationMs` is measured from the checkout submission through the Stripe return and provisioning,
not from page load, so it includes the time spent on Stripe but excludes time spent choosing a plan
and filling in the environment name.

New event property names must also be added to `SAFE_EVENT_PROPERTY_KEYS` in
`lib/observability/payload.js` — a second, global allowlist independent of the per-event one in
`events.js`. A property missing from that list is silently stripped from the payload before it
reaches Mixpanel; the event still fires, just without the property. There is no error and no log
line, so a report that looks empty for one property but not others is the symptom.

---

# Part 4 — The technical-debt system

## 4.1 The idea

A feature flag is a loan. It buys the ability to ship unfinished work safely, and it charges
interest for as long as it lives: extra branches to reason about, extra paths to test, and a
removal cost that grows the further its references spread.

The scorecard makes that interest a **number per flag**, so it is something to act on rather
than a feeling. The insight it rests on is that the flag is the only artifact that already
carries everything debt accounting needs — a boundary (its owned paths), a clock (its TTL),
and a removal cost (its references in shared files). Hence the policy: every new feature is
born behind a flag and registered on day one.

**It is report-only.** The command always exits zero. Thresholds, trend lines and CI gating
are deliberately out of scope for this version: first make the number visible, then argue
about what it should be.

## 4.2 How it runs, step by step

1. A human registers the flag in `flags-registry.json` at the repo root — metadata only:
   owner, Jira key, what it gates, which paths are its own, grep symbols, TTL, declared test
   specs, and any open items.
2. Someone runs `make flag-debt`.
3. The scorer reads the registry and locates both repositories — the functional one it runs
   in, and the backend module, which is a separate checkout. If the backend is absent it warns
   and scores the frontend alone rather than failing.
4. It greps each flag's declared symbols across both repos and buckets every file that
   matches.
5. It checks each declared test spec for existence on disk.
6. If a Sonar token is configured, it reads existing coverage analysis for each owned file.
   It runs no scan.
7. It compares the TTL against today.
8. It scores the declared open items.
9. It prints a per-flag card and a summary table, and exits zero. Optionally it writes JSON
   or an HTML panel — both git-ignored, because a stored score is a stale score.

The score is **always derived, never committed.** Only the metadata is version-controlled.

## 4.3 The five dimensions

**1 — Touch points: how expensive is removal?** Every reference to the flag *outside* its own
files. Files under the flag's own paths are free (they are deleted wholesale). Framework files
are free (they belong to no flag). Documentation and test references are counted and shown but
not scored — documenting a flag is not debt, and tests are already priced by dimension 2.
Everything else is a shared file reaching into the flag, and costs **2 points each beyond the
first three**. Three are free because a flag legitimately needs a route registration, a menu
entry and a backend enforcement point; the fourth shared file is where smearing starts.

**2 — Tests: is the flagged behaviour actually pinned?** Each declared spec is in one of four
states, and the distinction between the last two is the whole point:

| State | Meaning | Points |
|-------|---------|--------|
| present | On disk. | 0 |
| pending | Missing, someone is expected to write it. Transient. | +5 flat if any unit spec is pending, +8 flat if any e2e spec is |
| accepted debt | Missing, the team decided **not** to write it. Standing. | +5 or +8 **per item** |
| missing | Missing, no declared intent either way. | 0 — and it should not exist |

An empty promise never scores as a kept one, so existence is checked on disk rather than
trusted from the registry. Pending is flat because the signal is "this suite has a hole", and
the hole closes when the suite lands. Accepted debt is per item because a standing decision is
owned individually and does *not* evaporate when everything else goes green — which is exactly
when it would otherwise be forgotten. E2E costs more than unit throughout, because a flag most
often breaks in the wiring rather than in the unit.

**3 — Coverage: how much owned code is untested?** One point per ten uncovered lines in each
owned file, read from existing Sonar analysis. If the token is unset, the tool is missing, or
the server has no analysis for a file, the dimension reports `unavailable` and adds **zero**.
Missing infrastructure must not look like a clean bill of health, and must not block the
report either.

**4 — Lifecycle: is the flag overdue?** Zero while the TTL is in the future; **3 points per
started week** once it is past. One day overdue costs 3; eight days costs 6. The ramp is
linear and unbounded, so an abandoned flag's score keeps climbing until someone looks.

**5 — Open items: what is the flag still holding?** Liabilities that are neither test gaps nor
stray references — a correctness precondition blocking the next step, a follow-up parked
behind a package release. Scored by kind: **precondition 5, open 3, cosmetic 1**, plus **1 per
bundled component beyond the first**. `precondition` is anchored to the missing-unit-spec
penalty — one decision that blocks the next step costs the same as one untested unit.
`cosmetic` is deliberately non-zero, because a free bucket is the bucket everything gets
labelled into.

Two guards worth knowing. An **unrecognised kind** falls back to the `open` rate and renders
with a visible marker rather than scoring zero — a typo must never hide debt. And an explicit
**points override** is honoured only as a whole non-negative number; anything else is
*dropped and reported*, never repaired. Clamping a broken value to zero would make it read
exactly like a deliberate zero, and a deliberate zero is a value someone may legitimately
want.

Open items are rendered on the flag's card in both the console and HTML output, so that when
the TTL fires, whoever picks up the removal sees them **before** starting the work they block
rather than during it.

## 4.4 The scorecard as it stands

*Snapshot: `make flag-debt`, run 2026-07-27 against the branch tips. The registry and the
working tree are canonical; re-run the command for current numbers.*

| Dimension | Points | Why |
|-----------|--------|-----|
| Touch points | **0** | 3 files, none beyond the 3 expected: the backend servlet, the avatar menu, the route registration |
| Tests | **5** | 6 of 7 specs present; 1 accepted debt |
| Coverage | **0** | Unavailable — no Sonar analysis on the server for the owned files |
| Lifecycle | **0** | 90 days remaining on the TTL |
| Open items | **17** | 3 deferred items |
| **Total** | **22** | |

Three things in that number are worth reading as a story rather than as figures.

**The touch-point zero is the layout rule paying off.** Three shared files, all of them
minimal: a route that only lazy-loads a page, a menu entry that only decides whether to render
a link, and the backend gate. Nothing in a shared file branches on the flag beyond showing or
routing. That is what makes removal a deletion rather than an investigation.

**The 5 test points are an accepted gap kept deliberately visible.** Six specs exist. The
seventh — a unit test for the class that reads and writes the plan marker — is declared
`acceptedDebt` with a human's explicit approval, and the registry records precisely why it
matters: the write path has *zero* coverage, and of the read path only the
exception-swallowing branch executes. That branch is reached transitively, by accident: a
helper holds a static instance of the service, so an unrelated helper test calls the read path
with an unstubbed query, it throws, and the catch returns `"free"` — which the helper test then
asserts. **The only covered branch is the one that hides failures — which is exactly how a
paying tenant would silently appear free.** The score is 5 rather than 0 so that this reads as
an accepted gap and not as a clean sheet. It is the scorecard demonstrating on itself what it
is for.

**The 17 open-item points are three deferred decisions.**

- *Targeting-key divergence* — **precondition, 5 points.** The two ends bucket users on
  different identities. Harmless today, a correctness blocker the moment a targeting-aware
  control plane lands. Detail in Part 5.1.
- *Real-payment readiness* — **precondition bundling seven components, 11 points** (5 for the
  kind, 6 for the extra components). One owner decision — "are we taking real money?" — with
  seven distinct fixes under it, split by *trigger*: four are latent until money is real, three
  bite as soon as the flag is enabled for anyone. Detail in Part 5.2. The registry also records
  the **promotion condition**: if the flag ever pilots before a gateway exists, the three
  flag-on components must be promoted to their own item, because at that point they are
  scheduled work rather than part of the real-payments decision.
- *Plan badge in the environment picker* — **implemented.** The app-shell company selector renders
  `Demo`/`Productive` badges, sorts productive environments first, and the backend uses the same
  order for the initial post-login environment selection. The shared core onboarding chooser can
  adopt the badge when its package is upgraded independently.

## 4.5 The rules that keep the number worth reading

The scorecard's only asset is that people believe it. One demonstrably false entry destroys
that for every other entry at once, because a reader who catches one has no way to know which
others are wrong. The design follows from that: existence is checked rather than trusted, the
score is derived rather than stored, a bad override is dropped rather than repaired, an
unknown kind falls back visibly, and the placeholder TTL is labelled `PLACEHOLDER` in capitals
rather than left to read like a commitment.

Two protocols sit on top of it. **Accepted debt is always a human decision** — an agent may
propose it and may never grant it, because a process that can accept its own debt can zero the
scorecard without changing any code. And **claims are verified by grep pattern, never by line
number** — the same statement about behaviour typically lives in a source comment, a call site
and two documents, so fixing the one location someone named leaves the contradiction standing
everywhere else.

The full treatment, including how each protocol was arrived at, is in
`docs/technical-debt-playbook.md`.

---

# Part 5 — Future work and current payment guarantees

The hosted flag control plane remains future work. Payments, by contrast, already use Stripe;
§5.2 records the guarantees and recovery boundaries of the shipped purchase flow.

## 5.1 Future one — a hosted control plane

The plan is Mixpanel Feature Flags, alongside the product analytics already in use, replacing
the local providers on both sides.

**What changes, and what does not.** On each side exactly one function decides which control
plane backs the flags. Replacing the local provider means changing that function — plus adding
a dependency — and nothing else. No call site changes, no hook changes, no component changes.
Flag keys are kebab-case on both sides, which is also the Mixpanel convention, so keys carry
over unchanged.

**The precondition that must close first: the two ends target different identities.**

1. The backend buckets on the **account email**.
2. The frontend sends, as OpenFeature's targeting key, the value it has in browser storage —
   which is the **ERP admin username of the selected environment**, not the account email.
3. Today this is completely inert: the local providers ignore the targeting key entirely.
4. The moment a targeting-aware provider is wired in, the same user buckets differently on
   each end.
5. That failure is invisible in aggregate — it produces no error, no skew anyone would notice,
   just quietly wrong per-user rollouts.
6. Therefore it must be closed **before** the swap, not after.

The backend already exposes the account email on the environments endpoint, which is necessary
but **not sufficient**, for three reasons found during integration:

- **The shared helper discards it.** The standard way to fetch environments returns only the
  environments array, so a top-level field never reaches the caller. Reading it needs a direct
  request.
- **Scope.** The evaluation context has to be set app-wide at bootstrap, before any gated UI
  renders — the flag decides whether the upgrade entry is shown at all. Setting it from the
  upgrade page would make a user who visits that page bucket on email and a user who never
  does bucket on username: the same person bucketing differently depending on navigation
  history. That is worse than being uniformly wrong, because it disappears into aggregates
  instead of showing up as a clean skew.
- **Availability.** The call needs the platform token, which is not present in every session.
  Bucketing on email only when the token happens to be there reintroduces the same
  inconsistency.

**Two open options, neither chosen.** Persist the account email at login — clean, but that is
code in a shared package. Or serve it from a JWT-authenticated backend lookup, for precisely
the sessions that hold an Etendo token but no platform token. Whoever builds the second must
resolve against the stored account record rather than deriving the email by string
manipulation: onboarding composes the environment username *from* the account email, but `+`
is legal in an address, so splitting on it would mangle plus-addressed users and surface as a
rare unexplained mismatch instead of an obvious failure.

**Other things the swap has to handle.**

- Mixpanel's flags API buckets on its own `distinct_id` in the flag context, *not* on
  OpenFeature's `targetingKey`. Without setting it, every user is bucketed as a separate
  anonymous visitor.
- The Mixpanel provider builds its own named analytics instance. Configure that instance inert
  for analytics — no autotracking, no page views, no session recording, its own persistence
  name — so it carries flag traffic only and does not interfere with the analytics already in
  place.
- Remove the frontend exposure hook. Mixpanel reports exposures natively and keeping both
  would double-count.
- On the backend, pin the Mixpanel Java client at a version that supports handing exposure
  events to an executor. Without it, every flag check performs a synchronous HTTP POST on the
  request thread.
- Run the initial definitions fetch on a daemon thread. It is a blocking HTTP call, and doing
  it inline would make the first flag evaluation in a JVM wait on Mixpanel.
- Watch for a JSON library collision on the backend classpath: the Mixpanel client parses
  definitions with one `org.json` implementation while a legacy repackaged jar shipping the
  same package is already present, and the winner depends on classloader ordering. It degrades
  safely — the fetch and parse are inside catch-all handlers, so if the legacy classes win,
  definitions never become ready and every flag reads `false` — but that looks *identical* to
  the flag simply being off, so check it first if flags never turn on.

## 5.2 Real payments and recovery

Stripe Checkout and the signed webhook are part of the current flow, not a future gateway
integration. The webhook is the payment authority; a browser redirect cannot mark a purchase as
paid. Billing records retain the request ID, account, target name, selected demo source, payment
status, and the created client ID. The Stripe Price lookup that feeds the UI preview reads the
same configured Price ID used as the hosted Checkout line item.

The purchase ID is also the idempotency and recovery key. A paid retry reuses that ID, and a
conditional provisioning claim fences concurrent requests. On a failed or abandoned provisioning
attempt, the backend can retry the idempotent setup chain for the same environment. It does not
turn a paid retry into a new purchase. If the environment was created but bookkeeping could not
mark the purchase provisioned, the purchase projection can remain stalled; operators should
reconcile that billing record against the environment's stored `clientId` before intervening.

The selector update is a separate projection step. Provisioning success is not shown as ready
until the canonical account environment list contains the exact returned `clientId`. A delayed
projection leaves the user on a recoverable sync screen, where retry refreshes the list without
restarting payment or provisioning.

The cancellation return handler removes the pending browser state and strips the Stripe return
parameters so a page reload does not reuse a stale return URL. This behavior has unit regression
coverage; this document does not claim an end-to-end browser verification of leaving and closing
the Stripe hosted page.
---

# Appendix — Vocabulary

| Term | Meaning here |
|------|--------------|
| **Tenant** | A fully separate Etendo client: its own data, users and accounting. Called an *environment* in the picker and the API. |
| **Free tenant** | The tenant an account gets on signup. Sample data, for evaluation. Always the first one, never charged. |
| **Productive tenant** | A second tenant created through the paid flow, marked `productive`. |
| **Feature flag** | A switch deciding what the UI *shows*. Never an authorization boundary. |
| **Control plane** | The system that decides a flag's value. Local today on both sides; hosted later. |
| **Swap point** | The single function on each side that chooses the provider. |
| **Evaluation context** | The identity a flag is evaluated against — a targeting key plus attributes. |
| **Touch point** | A reference to a flag in a file the flag does not own. The removal cost. |
| **Owned paths** | Files that exist *because* the flag exists and are deleted with it. |
| **TTL** | The date a flag should be **gone** — not the date it ships. |
| **Accepted debt** | A gap the team has explicitly decided to carry. Requires a human decision; scored per item, standing. |
| **Deferred item** | An open decision a flag carries that is not a test gap. Scored by kind. |
| **Paywall** | The backend decision that gates tenant creation on payment. Authoritative. |
| **Plan marker** | The record saying which plan a tenant is on. Absence means free. |
