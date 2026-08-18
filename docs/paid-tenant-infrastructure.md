# Paid Tenant Infrastructure — Consolidated Narrative

**Status:** Active · **Feature:** `tenant-upgrade` · **Jira:** ETP-4686, epic ETP-3504

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

The whole path is behind a feature flag called `tenant-upgrade`, which is **off by
default**. With the flag off, the product behaves precisely as it did before.

The money is not real. The checkout is a mock — no payment processor is involved, nothing is
charged, and this is stated plainly everywhere it could be mistaken for otherwise. What is
real is everything around it: the flag evaluation on both ends, the paywall decision that
gates provisioning, and the record of which plan a tenant is on.

## 1.3 The end-to-end flow, step by step

1. **The user is signed in** to their free tenant and opens the avatar menu in the top bar.
2. **The menu shows an upgrade entry — or not.** The web app asks the flag system whether
   `tenant-upgrade` is on for this user. If it is off, the menu item is simply absent and the
   story stops here.
3. **The user selects the upgrade entry** and lands on the `/upgrade` page.
4. **The page asks the backend which tenants this account already owns.** This decides which
   of three things it shows next.
5. **Branch A — the account owns no tenants at all.** The page says the first tenant is free
   and offers a link to the ordinary onboarding flow. No checkout is shown, because there is
   nothing to charge for.
6. **Branch B — the account lookup failed.** The checkout is shown anyway. The backend is the
   authority on whether payment is required, so a failed lookup in the browser must not block
   a legitimate upgrade.
7. **Branch C — the account already owns at least one tenant.** The page shows a Free vs
   Productive comparison and a checkout form: a name for the new tenant, plus cardholder,
   card number, expiry and CVC.
8. **The user fills the form and submits.** Everything from here to step 12 happens in the
   browser. In Vite development, the upgrade API calls remain same-origin (`/sws/...`) so
   the Vite proxy can forward them to the configured Etendo context; `VITE_API_BASE` must not
   make the browser call Tomcat directly.
9. **The form is validated locally.** The tenant name must be non-empty and must not match a
   tenant the account already owns — resubmitting an existing name would be treated by the
   backend as *resuming* that tenant rather than creating a new one, so the page rejects it
   rather than let a "success" hand back something the user already had. The card must be 16
   digits, the expiry a valid future month, the CVC three or four digits.
10. **The decline path is simulated locally.** One specific test card number,
    `4000000000000002`, always simulates an issuer decline. It never reaches the network; the
    page reports a declined payment and stops. The purpose is to let anyone exercise the
    error path without a backend.
11. **Any other valid card mints a mock payment token** in the browser: the literal string
    `mock-paid-` followed by random lowercase hexadecimal.
12. **The browser posts the tenant request to the backend**, at `POST /sws/go/onboarding`,
    carrying the tenant name, currency, country, language and that payment token. It
    authenticates with the account-level *platform* token, not the session token of the
    tenant the user is currently inside, because creating a tenant is an account operation.
13. **The backend runs the paywall** — described in full in Part 3. It answers one of two ways.
14. **Refused:** HTTP 402 with a small JSON body saying payment is required. No provisioning
    has started, so nothing has to be cleaned up. The page shows a payment error and returns
    the user to the form.
15. **Allowed:** the backend opens a streaming response and starts provisioning, emitting one
    progress message per stage as it goes.
16. **The page renders provisioning live**, in six named stages: *setup*, *client*,
    *organization*, *dataset*, *sequences*, *finalize*.
17. **The tenant is marked productive** during provisioning — a small record attached to the
    new tenant saying it is on the paid plan.
18. **The stream ends with a result message.** On success the page shows a confirmation panel.
19. **The user continues, and is signed out.** This is deliberate: which tenant you are in is
    chosen at sign-in, and there is no in-app tenant switcher in this version. Signing out is
    the shortest honest route to the new tenant.
20. **At the next sign-in the environment picker lists both tenants** — the original free one
    and the new productive one — and the user chooses which to enter.

## 1.4 What the user does *not* see yet

The picker at step 20 does not indicate which tenant is on which plan, even though the
backend already sends that information with every environment. The picker component lives in
a shared npm package rather than in this application, so displaying it needs a change and a
release on that package. It is recorded as an open item; see Part 4.

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

1. **The safe default lives in code**, and it must describe *today's shipped behaviour*. The
   default for `tenant-upgrade` is `false`, so with no configuration anywhere the product is
   exactly what it was before this feature. A broken control plane degrades to the current
   product rather than exposing unfinished work.
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
VITE_FEATURE_FLAGS='{"tenant-upgrade":true}' make dev
```

**Backend:** a property per flag, resolved in priority order — JVM system property, then the
Etendo properties file, then an environment variable. For this flag: `etendo.go.flags.tenant-upgrade`,
or `ETGO_FLAG_TENANT_UPGRADE`. Accepted affirmatives are `true`, `Y`, `yes`, `1`; negatives
are `false`, `N`, `no`, `0`; case-insensitive.

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

*Snapshot of `flags-registry.json`, which is canonical:* `tenant-upgrade` owns a frontend
`lib/upgrade/` directory and the upgrade page, plus a backend `payment` package. Its touch
points are the route registration, the avatar menu, and the backend servlet that enforces the
paywall.

---

# Part 3 — The paywall

## 3.1 What the contract is

| | |
|---|---|
| Endpoint | `POST /sws/go/onboarding` |
| New payload field | `paymentToken` (string, optional) |
| Refusal status | **HTTP 402** |
| Refusal body | `{"error": "payment_required", "message": "…"}` |
| Success | An NDJSON stream of progress messages, ending in a result |

The gate runs **after** the request's token, payload and currency are validated but
**before** the stream opens and before any provisioning. Two consequences follow: a refused
request leaves no half-created tenant behind, and it can answer with a plain JSON error
rather than having to express a failure inside a stream that has already started.

The browser client checks the response status before touching the response body for exactly
this reason, so a 402 never reaches the stream reader.

## 3.2 The decision, step by step

The paywall is a standalone, directly testable unit rather than inline servlet code, because
it is the authoritative permission check.

1. **Is the `tenant-upgrade` flag off?** → **Allowed.** Pre-feature behaviour, byte for byte:
   no token is read, no ownership lookup runs, no payment is ever demanded.
2. **Does the account own no tenants at all?** → **Allowed.** A first tenant is always free.
3. **Does the request name a tenant the account already owns?** → **Allowed.** That is the
   *resume* path — a partially provisioned environment being reconciled — not a new tenant, so
   it is not charged again.
4. **Otherwise, the payment token decides.** Approved → allowed. Absent → refused as
   `PAYMENT_REQUIRED`. Rejected → refused as `PAYMENT_DECLINED`. Both refusals answer 402 with
   `error: payment_required` and differ only in the message, so the client does not branch on
   the code.

## 3.3 The mock payment provider, stated plainly

The token's *shape* decides the outcome, and nothing else:

| Token | Outcome |
|-------|---------|
| `mock-paid-<hex>` | Approved |
| `mock-declined`, or any other value | Declined |
| absent or blank | Missing |

**The token is client-mintable and not single-use.** The backend does not call a provider,
does not confirm that any charge occurred, does not consume the token, and does not bind it
to a nonce, an account or an amount. Anyone who can reach the endpoint can hand-write
`mock-paid-deadbeef` and be provisioned a tenant. The gate is a placeholder for the flow, not
a control that protects revenue.

`mock-declined` is declared for contract completeness but is **never transmitted** — the
browser simulates declines locally and returns before issuing any request, so the backend
only ever sees an approved-shaped token or none at all.

What *is* real today: the flag evaluation, the paywall decision, and the plan marker.

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
`docs/ops/mixpanel-kpi-emission-spec.md`), so this funnel is queryable in Mixpanel like any
other product flow:

| Event | Fired when | Key properties |
| --- | --- | --- |
| `upgrade_page_viewed` | Account lookup settles, once | `branch`: `checkout` \| `first_tenant_free` \| `unavailable` |
| `upgrade_first_tenant_free_continued` | User continues from the first-tenant-free panel to onboarding | — |
| `upgrade_existing_tenant_name_blocked` | Frontend validation catches a `clientName` the account already owns | — |
| `upgrade_session_expired` | Submit reached `runUpgrade` with no platform token | — |
| `upgrade_checkout_submitted` | Validated form submitted, before the network call | `currency`, `countryCode` |
| `upgrade_payment_declined` | Either decline path | `reason`: `test_card` (client-side, never reaches the network) \| `backend_402` |
| `upgrade_tenant_provisioning_succeeded` | NDJSON stream resolved with `success: true` | `durationMs`, `currency`, `countryCode` |
| `upgrade_tenant_provisioning_failed` | Stream resolved without success, or the request/stream itself failed for a reason other than a decline | `durationMs`, `errorCode` |
| `upgrade_enter_tenant_failed` | Post-success "enter the new tenant" step could not switch environments | — |

Two things this table makes possible that flag exposure alone cannot: a **checkout funnel**
(`upgrade_checkout_submitted` → `upgrade_tenant_provisioning_succeeded`, conversion and drop-off
by decline reason) and a **provisioning latency KPI** (`durationMs` on the terminal events,
p50/p90 over time). `durationMs` is measured client-side from the moment the network call starts,
not from page load, so it excludes however long the user spent filling in the form.

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

# Part 5 — The two futures

Both are decided in direction and unbuilt in fact. Each has explicitly named preconditions,
recorded so that whoever picks the work up finds them before starting rather than during.

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

## 5.2 Future two — real payments

Replacing the mock with a gateway client is necessary and **not sufficient**. Three gaps in
the surrounding flow have to close with it, and four further defects sit in the same bundle.

**Gap 1 — Replay.** The token is never consumed, so one approved payment can create N
tenants. A real flow needs the token marked as spent, or bound to a single tenant creation.

**Gap 2 — Check-then-act.** The paywall reads ownership; provisioning creates the client
afterwards; there is no lock in between. Two concurrent requests both pass the gate. A real
flow needs the ownership check and the creation to be atomic, or a uniqueness constraint that
catches the loser.

**Gap 3 — No atomicity between payment and provisioning.** The paywall passes, provisioning
then runs and can still fail; its rollback undoes the data changes and reports failure. With a
real gateway that is a **captured charge with no tenant**, and there is no refund,
retry-with-credit or idempotency path anywhere in this flow. A real flow needs the charge
authorized before provisioning and captured only after it succeeds, or a compensating refund
on failure.

**Four defects bundled with them**, three of which bite as soon as the flag is enabled for
anyone, gateway or not:

- *No in-flight guard on submit* — **gateway-triggered.** Eight scripted same-tick clicks
  produce eight requests with eight tokens; the submit handler sets no submitting state and the
  button is never disabled. A human double-click cannot reproduce it. A real charge per request
  would make it expensive.
- *No navigation guard mid-provisioning* — **flag-on.** Going back or refreshing during
  provisioning is silent; explanatory copy is the only mitigation.
- *Unbounded tenant name on both ends* — **flag-on.** No length limit in the input and none in
  the request parser, which rejects only the empty string. An oversized name passes the paywall
  and fails deep inside provisioning — that is, after the point where a real charge would have
  been taken. Note it is the *easiest trigger* for Gap 3, not the same thing: bounding the input
  closes the trigger, not the gap.
- *Session expiry reported late* — **flag-on.** The page knows at mount that the platform token
  is missing, but still renders the checkout, so the user fills in card details before being
  told the session is gone.

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
