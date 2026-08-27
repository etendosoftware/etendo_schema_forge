# Feature Flags

**Status:** Active
**Applies to:** `tools/app-shell/src/lib/flags/`

## The stack

| Layer | What it is | Why |
|-------|-----------|-----|
| **Application API** | [OpenFeature](https://openfeature.dev) — `@openfeature/web-sdk` | Vendor-neutral. Changing the control plane never touches component code. |
| **Control plane (hosted)** | ConfigCat, via the official `@openfeature/config-cat-web-provider` — **pilot** (ETP-4691) | Remote toggling without a redeploy, polled so a change reaches a running tab. |
| **Control plane (local)** | OpenFeature's `TypedInMemoryProvider`, seeded from `VITE_FEATURE_FLAGS` or the declared defaults | Keeps dev, CI and e2e deterministic and independent of any shared remote project. |
| **Control plane (evaluated)** | Mixpanel Feature Flags, per team plan §5.6 | Still the longer-term option; not wired. See the swap notes below. |

Components only ever see the OpenFeature API through the `useFeatureFlag` hook.
Adopting Mixpanel later changes **one function** — see [Swapping the control plane](#swapping-the-control-plane).

### Packages

| Package | Version | Notes |
|---------|---------|-------|
| `@openfeature/web-sdk` | `^1.9.0` | Synchronous, client-side flag evaluation |
| `@openfeature/core` | `^1.11.0` | Peer dependency of the web SDK. It is imported at runtime and is **not** bundled, so it must stay an explicit dependency. |

## Three rules

### 1. The safe default lives in code

Every flag declares its default in `lib/flags/flag-keys.js`, and that default must
describe **today's shipped behaviour**. Those defaults seed the provider, so a
flag missing from the environment resolves to its declared default rather than
to nothing. If provider registration fails outright, OpenFeature's built-in
no-op provider returns the default the caller passed. Either way a broken
control plane degrades to the current product instead of exposing unfinished
work.

### 2. Flags never block rendering

`initFeatureFlags()` is fire-and-forget and never rejects. Flag reads are
synchronous, so a component renders immediately and re-renders if and when the
value changes. Provider startup is bounded by a timeout — inert for the
in-memory provider, but it is what keeps this rule true when a network-backed
provider is swapped in.

Because startup is fire-and-forget, components routinely mount *before* a
provider is registered, which makes the re-render the load-bearing half of this
rule. `@openfeature/web-sdk` emits `PROVIDER_READY` one microtask before the new
provider is installed for evaluation, so a subscriber that re-reads the value
synchronously inside the handler sees the old one, concludes nothing changed and
never re-renders — and no later event corrects it. `useFeatureFlag` therefore
notifies both synchronously and on the next microtask, which is correct
whichever side of that boundary the installation lands on. Keep that when
touching the hook: without it a component that mounts first is pinned to its
declared default for the whole session, and the failure is invisible because a
flag reading `false` is indistinguishable from one that is genuinely off.

### 3. Frontend flags are visual gating only — never authorization

A flag decides what the UI **shows**. It is not a security boundary: anyone can
change a flag in their own browser. Every gated capability must be enforced
independently by the backend.

The `/upgrade` route is the worked example — it is registered
**unconditionally**, and only the menu entry pointing at it is flag-gated.
Hiding the route would imply the flag was protecting something, which it is not.

## Adding a flag

1. Declare the key and its safe default in `lib/flags/flag-keys.js`:

   ```js
   export const MY_FEATURE = 'my-feature';

   export const FLAG_DEFAULTS = Object.freeze({
     [PROOF_OF_CONCEPT_MENU]: false,
     [MY_FEATURE]: false,
   });
   ```

2. Read it in a component:

   ```jsx
   import { useFeatureFlag, MY_FEATURE } from '@/lib/flags/index.js';

   const showMyFeature = useFeatureFlag(MY_FEATURE);
   ```

3. Make sure the backend enforces whatever the flag reveals.
4. If the flag is to be toggled remotely, create the setting in the control plane
   with the key **exactly** as declared in step 1 — not the feature id from
   `flags-registry.json`, which is a different name. A mismatch is not an error:
   the provider reports `FLAG_NOT_FOUND`, the caller gets its declared default,
   and the flag reads as permanently off with nothing in the UI to say why.

Flag keys are kebab-case, which is also the Mixpanel convention — so keys carry
over unchanged when the control plane moves.

## Architecture: flag code layout

Where flagged code lives is a rule, not a preference.

**1. Each flag owns its files.** All logic a flag gates lives in modules and
directories belonging to that flag. The retired `tenant-upgrade` flag is the worked example: it
owned `lib/upgrade/` and `pages/UpgradePage.jsx`, which is why retiring it in ETP-4966 was
unwrapping two toggle points rather than an archaeology exercise across shared files.

**2. Shared files hold toggle points only.** A shared file may contain the
minimum needed to reach the flag's own code — a route registration, a menu
entry — ideally a single greppable line naming the flag constant. Never business
logic. If a shared file starts branching on a flag beyond "show this / route
there", the logic belongs in the flag's own module.

**3. Framework files belong to no flag.** `lib/flags/` is shared infrastructure
serving every flag, and is excluded from per-flag attribution.

**Why.** Two things depend on this layout:

- *Per-flag debt scorecard.* Coverage and issues are measured over a flag's
  owned paths, which only works if those paths contain the flag's code and
  nothing else. Touch points in shared files are counted separately, as
  removal-cost debt.
- *Cheap removal at TTL.* Retiring a flag should be exactly: delete the owned
  directories, then remove the touch points a grep for the flag constant finds.
  Anything smeared across shared files turns that into an archaeology exercise.

### Where the per-flag paths live

**`flags-registry.json` in the repo root is canonical** for which paths belong to
which flag. It is read by the `sf-flag-debt` CLI, so the scorer and the rule
cannot disagree — a flag's owned paths are `flags.paths`, and the shared
infrastructure excluded from every flag is `conventions.frameworkPaths`. See
[flag-debt.md](flag-debt.md).

This document owns the *rule and the reasoning*; the registry owns the *facts*.
When a flag gains a file or a touch point moves, update the registry — not a
list here. Restating paths in prose would create a second copy that drifts
silently, and a scorecard measuring stale paths produces numbers that look
plausible and are wrong.

*Illustrative snapshot, not a source — read the registry for current values.* The
`paid-second-tenant` feature owns `tools/app-shell/src/lib/upgrade/` and
`tools/app-shell/src/pages/UpgradePage.jsx`, with `tools/app-shell/src/lib/flags/`
excluded as framework. It no longer carries a flag — see *Retiring a flag* in
`docs/technical-debt-playbook.md`, and the worked example in
`com.etendoerp.go` → `docs/feature-flags-and-tenant-upgrade.md`.

Its two frontend touch points, `runtime-routes.jsx` and `UserAvatarButton.jsx`,
carry no business logic: the route only registers a lazily-loaded page, and the
menu entry only decides whether to render a link. `UserAvatarButton.jsx` needs an
import, a hook call and a small JSX block rather than a literal single line —
that is the floor for rendering a menu item, and it stays greppable through the
`symbols` the registry lists for the flag.

## Configuration

| Variable | Effect |
|----------|--------|
| `VITE_FEATURE_FLAGS` | JSON map of flag key to boolean. Unset, empty or malformed values fall back to the declared defaults. |
| `VITE_CONFIGCAT_SDK_KEY` | ConfigCat SDK key. When set (and no `VITE_FEATURE_FLAGS`), flags come from ConfigCat. |
| `VITE_CONFIGCAT_POLL_SECONDS` | Auto-poll interval in seconds. Defaults to 60; a non-positive or non-numeric value warns and falls back. |

```bash
# Turn a flag on locally, without any remote control plane
VITE_FEATURE_FLAGS='{"proof-of-concept-menu":true}' make dev
```

The `webmcp-agent-chat` flag is off by default. When enabled, the app shell
registers three optional WebMCP tools in browsers that expose
`document.modelContext`: `get_current_window_context`, `navigate_application`, and
`open_application_chat`. It is a presentation/integration toggle only; the browser
capability is not an authorization boundary, and all business data access and
mutations remain protected by the authenticated NEO APIs and existing Copilot
confirmation flow.

```bash
VITE_FEATURE_FLAGS='{"webmcp-agent-chat":true}' make dev
```

`VITE_FEATURE_FLAGS` holds every flag in one variable, so adding a flag needs no
new environment plumbing and there is no kebab-case-to-SCREAMING_SNAKE naming
convention to keep in sync. Non-boolean values are ignored.

### Where the SDK key lives

Keep it out of version control, but do **not** treat it as a secret. Vite bakes
`VITE_CONFIGCAT_SDK_KEY` into the JS bundle, so anyone can read it — and read the
whole environment's config off ConfigCat's CDN with it. Storing it as a GitHub
*secret* would mask it in build logs while it stays published in the bundle,
which buys nothing and makes rotation harder to audit. What actually protects a
targeting list is ConfigCat's hashed comparator (`SENSITIVE_IS_ONE_OF`), not the
key. Corollary: never put anything confidential in flag keys or values of an
environment whose key ships to a browser.

| Where | How it gets there |
|-------|-------------------|
| Local dev (frontend) | `tools/app-shell/.env.development.local`, gitignored. **Development mode only** — `vite build` runs in production mode and never reads this file. |
| Deployed frontend | GitHub Actions **variable**, injected into the build step of `.github/workflows/deploy-staging.yml`. Resolved **per target** in *Resolve deployment target*, so the pilot key reaches experimental and not staging or production. |
| Backend | **Nowhere — the backend does not read ConfigCat.** `com.etendoerp.go` contains no ConfigCat code at all: `GoFeatureFlags.createProvider()` returns `PropertiesFeatureProvider` unconditionally, and the deployed runtime confirms it (`feature flags installed using provider 'etendo-go-properties'`). Backend flags come only from `etendo.go.flags.<key>` / `ETGO_FLAG_<KEY>`. |

> **This row used to claim the backend resolved ConfigCat via `ETGO_CONFIGCAT_SDK_KEY`, and that was
> never true.** The secret is provisioned in the experimental task definition, which made the claim
> look confirmed, but nothing consumes it server-side. ETP-4966 is the cost of that: `tenant-upgrade`
> was on in ConfigCat and unset in the backend's properties, so the browser offered a Stripe checkout
> the backend then ignored, and paying accounts received Demo environments. **The two ends do not share
> a control plane.** Until they do, a flag that gates anything a user can pay for must be evaluated by
> the backend alone, with the browser asking it.

One SDK key addresses exactly one ConfigCat environment. Rotating the key means updating every
frontend row above — none of which observe each other.

### Provider precedence

`createFlagProvider()` picks exactly one provider, highest priority first:

| # | Condition | Provider |
|---|-----------|----------|
| 1 | `VITE_FEATURE_FLAGS` names at least one boolean flag | `TypedInMemoryProvider` with those overrides |
| 2 | `VITE_CONFIGCAT_SDK_KEY` is set | `ConfigCatWebProvider` (auto-poll) |
| 3 | neither | `TypedInMemoryProvider` with the declared defaults |

**A local override deliberately beats the remote control plane.** Dev and e2e
runs must not depend on the current state of a shared ConfigCat project, and a
developer debugging a flag should not have their machine changed by someone
toggling a dashboard. The order also makes the escape hatch obvious: set
`VITE_FEATURE_FLAGS` and the remote plane is out of the picture entirely.

The ConfigCat SDK is imported lazily, so its ~83 KB lands in its own chunk and
only on builds that configure a key — a build without one is byte-identical in
the main bundle.

## Evaluation context

Set at startup from `localStorage`, re-applied on sign-in by `trackSessionStarted`
in `lib/observability/health-events.js`, and re-applied again once the account
identity resolves — `useAccountIdentity()` in `layout/AppLayout.jsx` calls
`refreshAccountIdentity`, which reads `GET /sws/neo/session` and caches the result
(ETP-4693):

| Context key | Source | Purpose |
|-------------|--------|---------|
| `targetingKey` | `sf_account_id`, falling back to `sf_auth_user` | OpenFeature's standard identity key. The account is preferred because it is what the backend targets on; the ERP username only stands in until the session answers. |
| `accountId` | `sf_account_id` (`ETGO_ACCOUNT`) | Account-level targeting, opaque — no PII reaches the vendor |
| `email` | `sf_account_email` | The attribute ConfigCat's `User.Email` rules and segments read. The provider maps OpenFeature's `email` onto `User.Email`; anything else would arrive as a custom attribute. |
| `account_id` | `sf_auth_client_id` (tenant) | Tenant-level targeting; matches the Mixpanel group the analytics layer already sets. **A different identity from `accountId`** — this one is the `AD_Client`. |

Both account values arrive only for sessions that carry a token and whose account
resolves, so a rule keyed on the account or the email evaluates **once the session
has answered**, not at first paint. Startup falls back to the ERP username, which
the backend never sees.

## Swapping the control plane

`createFlagProvider()` in `lib/flags/bootstrap.js` is the **only** function that
knows which control plane backs the flags. Adding or replacing one means
changing that function and nothing else — `initFeatureFlags`, the
`useFeatureFlag` hook, the exposure hook and every call site stay as they are.

### Worked example: ConfigCat (ETP-4691)

The pilot is what the swap point looks like in practice — the entire integration
is one branch inside `createFlagProvider()`:

| Package | Version | Note |
|---------|---------|------|
| `@openfeature/config-cat-web-provider` | `^0.2.0` | Published under the **`@openfeature`** scope, not `@configcat` |
| `@configcat/sdk` | `^1.1.0` | Its peer dependency — **not** the older `configcat-js` package |

`ConfigCatWebProvider.create(sdkKey, { pollIntervalSeconds })` returns a
ready-to-register provider. Two behaviours matter downstream:

- It emits `PROVIDER_READY` from its **own** emitter once the client has flag
  data, and `PROVIDER_CONFIGURATION_CHANGED` on every poll that changes config.
  The hook already subscribes to both, so a dashboard toggle reaches a mounted
  component without a reload.
- `initialize()` **throws** when the client reaches ready state with no flag
  data, because ConfigCat can be "ready" while still unable to evaluate. That
  surfaces as a rejected registration, which `initFeatureFlags` catches and
  degrades to the declared defaults — the safe-default rule holds.

#### Email targeting works only after the session answers

The `tenant-upgrade` setting carries a targeting rule on a segment matching
`User.Email`. Since ETP-4693 the frontend does send an email (see [Evaluation
context](#evaluation-context)), so such a rule can match — but only from the
moment `GET /sws/neo/session` has returned an `accountEmail` for that session.
Before that, and for any session without a token or without a resolvable
`ETGO_ACCOUNT`, the attribute is absent and the SDK says so:

```
ConfigCat - WARN - [3003] Cannot evaluate condition (User.Email IS ONE OF [...])
for setting 'tenant-upgrade' (the User.Email attribute is missing).
```

When the attribute is missing, only the setting's fallback ("To all users") value
has any effect. Two consequences when testing a toggle:

- Flipping the **fallback** always shows up. Flipping a **targeting rule** shows up
  only for sessions whose email resolved, so "nothing happened" is ambiguous —
  check for the warning above before concluding the rule is wrong.
- The email must be the account email (`ETGO_ACCOUNT`), which is what the backend
  targets on too. It is **not** the ERP admin username in `sf_auth_user`.

To move to Mixpanel instead:

1. `npm install @mixpanel/openfeature-web-provider` (peer-depends on
   `@openfeature/web-sdk` and `mixpanel-browser`, both already present).
2. Return `MixpanelProvider.create(token, config)` from `createFlagProvider()`.
   `create()` builds its **own named** Mixpanel instance, so it does not
   interfere with the analytics instance in
   `lib/observability/providers/mixpanel.js`. Configure that instance inert for
   analytics — no autotracking, no page views, no session recording, its own
   `persistence_name` — so it carries flag traffic only.
3. **Add `distinct_id: username` to `buildEvaluationContext`.** Mixpanel's flags
   API buckets on the `distinct_id` it finds in the flag context, *not* on
   OpenFeature's `targetingKey`. Without it every user is bucketed as a separate
   anonymous visitor.
4. Consider `flags.persistence: { variantLookupPolicy:
   'persistenceUntilNetworkSuccess' }` so cached variants serve instantly while
   a refresh runs in the background.
5. Remove the exposure hook (below) — Mixpanel reports exposures natively, and
   keeping both would double-count.

## Flag exposure events

`lib/flags/flag-exposure.js` registers an OpenFeature evaluation hook that
reports each exposure through the existing observability layer, so a variant can
be correlated with the funnel that follows it. While the control plane is local
this is the only source of exposure data.

Event `feature_flag_evaluated` (Mixpanel channel, declared in
`lib/observability/events.js`):

| Property | Meaning |
|----------|---------|
| `flagKey` | The flag key, e.g. `tenant-upgrade` |
| `enabled` | The resolved boolean value |
| `variant` | The variant name, e.g. `on` / `off` |
| `provider` | Registered provider: `in-memory` or `configcat` |
| `username` | The targeting key |

`provider` is a label `createFlagProvider` pins itself (`CONFIGCAT_PROVIDER_NAME`
in `lib/flags/bootstrap.js`), not whatever the underlying SDK reports. ConfigCat's
own provider derives its default name from the JS class name
(`ConfigCatWebProvider.name`), which a production minifier is free to rename per
build — observed in the wild as both `_ConfigCatWebProvider` and `ut` across
different deploys, fragmenting any report grouped by provider. Pinning it keeps
the value stable regardless of how a given build was minified.

Two behaviours are deliberate:

- **Deduplicated per flag/value/provider** — one event per combination per
  session, not one per render. `useFeatureFlag` re-evaluates on every render, so
  without this the event would be uncountable. But the provider is part of the
  key on purpose: `initFeatureFlags` registers this hook *before* the real
  provider is ready (`createFlagProvider` awaits a dynamic import and, for
  ConfigCat, a network round-trip), so the very first evaluation on every page
  load — for effectively every session, since React's initial render is
  synchronous and always wins that race — goes through OpenFeature's built-in
  no-op default. Deduplicating on `flagKey:value` alone let that transient
  no-op result permanently claim the session's report for a value, silently
  swallowing every later evaluation once the real provider took over, even when
  it resolved the exact same boolean. A flag that flips reports each distinct
  value once *per provider that produced it*, not just the first to answer.
- **Never disturbs evaluation** — the hook runs inside flag resolution. It never
  awaits and never throws; a reporting failure cannot change what a flag
  resolves to.

The value is reported as `enabled` rather than `value` because the observability
payload sanitizer treats `value` as a numeric property and silently drops
booleans passed under that name. The targeting key travels as `username`, a
property the payload policy already sanctions, rather than widening that policy
with a second identity-bearing key.

## The paid productive-environment flow (no flag)

The paid path where a user keeps their free environment and creates a productive one, or converts
the one they are already in. **Not gated** — the `tenant-upgrade` flag retired in ETP-4966.

| Piece | Location |
|-------|----------|
| Entry point (unconditional) | User menu item in `components/UserAvatarButton.jsx` |
| Route | `/upgrade` in `runtime-routes.jsx` |
| Page | `pages/UpgradePage.jsx` |
| Checkout + onboarding API calls | `lib/upgrade/api.js` |

**Flow.** The page shows a Free vs Productive comparison and a choice between converting the current
environment (`convert-demo`, preselected) and creating a new one (`create-productive`). It then asks
the backend for a Stripe hosted-checkout session and redirects to it — **the browser never handles
card details.** `lib/upgrade/mockPayment.js` is gone; so is the locally simulated decline.

On return, the page polls `GET /sws/go/checkout/sessions/{requestId}` until the webhook has recorded
the payment, then calls `POST /sws/go/onboarding` with that `requestId` as `paymentToken` and renders
the NDJSON progress stream. That confirmed payment is also what marks the resulting environment
productive.

### Backend contract (confirmed with the Etendo Go side)

| Rule | Consequence for the frontend |
|------|------------------------------|
| The only accepted token is a `requestId` from `POST /sws/go/checkout/sessions` that the Stripe webhook recorded as paid, **for this account and this environment name**. A token merely *shaped* like the retired `mock-paid-<hex>` is declined | The browser cannot mint a token. It must obtain one from the backend and wait for the webhook, which is what stops a successful return URL from being treated as payment. |
| Refusal is **HTTP 402** with a plain JSON body, *not* the NDJSON stream — the gate runs before the stream opens | `lib/upgrade/api.js` checks the status before touching `response.body`, so a 402 never reaches the stream reader. |
| Missing token and declined token both return `error: "payment_required"` and differ only in `message` | The UI does not branch on the code. A decline is caught client-side before any request; a 402 is reported as a generic payment-required error. |
| An account's **first environment is never charged** | The page loads the account's environments and, when there are none, shows "your first tenant is free" and a link to onboarding instead of the checkout. |
| Re-submitting a `clientName` the account already owns **resumes** that tenant and is not charged | The page rejects a name that matches an existing tenant, so a "success" never silently hands back an existing tenant. |
| There is no flag left to evaluate; the backend is **authoritative** on both the paywall and the plan | Nothing in the browser can enable, disable or shortcut the paid path. |
| Converting the current environment is charged like a purchase, not treated as a free resume | The page sends `upgradeAction=convert-demo`, which the backend uses to skip the free resume path. |
| Backend targeting key is the **account email**, now returned as `accountEmail` at the top level of `GET /sws/go/environments` | Not consumed yet — see below. |
| `GET /sws/go/environments` items carry `plan: "free" \| "productive"`; treat a missing field as `"free"` | Consumed by the company selector, which badges each environment and sorts productive first. The badge is withheld entirely when the current environment cannot be resolved, so a missing lookup is never rendered as `Demo`. |

**Closed (ETP-4693): both ends target the same identity.** The backend buckets on
the account, and the frontend now reads that same account from
`GET /sws/neo/session` — a JWT-authenticated endpoint the app-shell already calls
every session — rather than from `sf_auth_user`, the environment's ERP admin
username that the backend never sees. `refreshAccountIdentity` caches `accountId`
and `accountEmail` and re-targets the evaluation context; see [Evaluation
context](#evaluation-context) for what each key carries and when it arrives.

`/sws/neo/session` was chosen over `GET /sws/go/environments` (which also returns
`accountEmail`) for three reasons: the core helper `fetchEnvironments` returns
`data.environments || []` and drops the top-level field; the context must be set
app-wide at startup rather than only for users who reach `/upgrade`; and the
environments call needs `sf_platform_token`, which is not part of
`ENVIRONMENT_SESSION_KEYS` and is absent in some sessions. Bucketing only when a
token happens to be present would make targeting inconsistent, which is worse
than uniformly wrong because it is invisible in aggregate.

One rule survives for anyone touching this: resolve the email against the
`ETGO_ACCOUNT` record, never by string manipulation of the environment username.
Onboarding composes that username from the account email, and `+` is legal in an
address — splitting on it would mangle plus-addressed users and surface as a rare
unexplained mismatch instead of an obvious failure.

The app-shell company selector now badges each environment as `Demo` or
`Productive` and sorts productive environments first. The backend applies the
same ordering to the post-login environment list, so an account with both plans
enters its productive tenant by default. The shared core onboarding chooser may
still need the same badge when its package is upgraded independently.

`lib/upgrade/api.js` deliberately does not reuse `runOnboardingStream` from
`@etendosoftware/etendo-go-core`: that helper serialises a fixed allowlist of
fields (so it would silently drop `paymentToken`) and starts reading the
response body without checking the status (so a 402 would surface as a generic
"no result" failure instead of a payment error).

## Proof of Concept menu (`proof-of-concept-menu`)

This is a frontend-only, temporary reveal for the internal **Proof of Concept**
section in the side menu. It defaults to `false`, so an unavailable provider or
an environment with no configuration keeps the section hidden. The flag only
changes menu visibility: the windows behind it continue to rely on their normal
AD role filtering.

Use a local override while developing or testing it:

```bash
VITE_FEATURE_FLAGS='{"proof-of-concept-menu":true}' make dev
```

The current removal target and the unit/E2E specs are recorded in
[`flags-registry.json`](../flags-registry.json); the shared `SideMenu` is a
toggle point, not code owned by this flag.
