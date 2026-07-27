# Feature Flags

**Status:** Active
**Applies to:** `tools/app-shell/src/lib/flags/`

## The stack

| Layer | What it is | Why |
|-------|-----------|-----|
| **Application API** | [OpenFeature](https://openfeature.dev) — `@openfeature/web-sdk` | Vendor-neutral. Changing the control plane never touches component code. |
| **Control plane (hosted)** | ConfigCat, via the official `@openfeature/config-cat-web-provider` — **pilot** (ETP-4691) | Remote toggling without a redeploy, polled so a change reaches a running tab. |
| **Control plane (local)** | OpenFeature's `InMemoryProvider`, seeded from `VITE_FEATURE_FLAGS` or the declared defaults | Keeps dev, CI and e2e deterministic and independent of any shared remote project. |
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
     [TENANT_UPGRADE]: false,
     [MY_FEATURE]: false,
   });
   ```

2. Read it in a component:

   ```jsx
   import { useFeatureFlag, MY_FEATURE } from '@/lib/flags/index.js';

   const showMyFeature = useFeatureFlag(MY_FEATURE);
   ```

3. Make sure the backend enforces whatever the flag reveals.

Flag keys are kebab-case, which is also the Mixpanel convention — so keys carry
over unchanged when the control plane moves.

## Architecture: flag code layout

Where flagged code lives is a rule, not a preference.

**1. Each flag owns its files.** All logic a flag gates lives in modules and
directories belonging to that flag. For `tenant-upgrade` that is `lib/upgrade/`
and `pages/UpgradePage.jsx`.

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
which flag. It is read by `cli/src/flag-debt.js`, so the scorer and the rule
cannot disagree — a flag's owned paths are `flags.paths`, and the shared
infrastructure excluded from every flag is `conventions.frameworkPaths`. See
[flag-debt.md](flag-debt.md).

This document owns the *rule and the reasoning*; the registry owns the *facts*.
When a flag gains a file or a touch point moves, update the registry — not a
list here. Restating paths in prose would create a second copy that drifts
silently, and a scorecard measuring stale paths produces numbers that look
plausible and are wrong.

*Illustrative snapshot, not a source — read the registry for current values.* At
the time of writing, `tenant-upgrade` owns `tools/app-shell/src/lib/upgrade/` and
`tools/app-shell/src/pages/UpgradePage.jsx`, with `tools/app-shell/src/lib/flags/`
excluded as framework.

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
# Turn the upgrade flow on locally, without any remote control plane
VITE_FEATURE_FLAGS='{"tenant-upgrade":true}' make dev
```

`VITE_FEATURE_FLAGS` holds every flag in one variable, so adding a flag needs no
new environment plumbing and there is no kebab-case-to-SCREAMING_SNAKE naming
convention to keep in sync. Non-boolean values are ignored.

Keep the SDK key out of version control: it belongs in
`tools/app-shell/.env.development.local`, which is gitignored.

### Provider precedence

`createFlagProvider()` picks exactly one provider, highest priority first:

| # | Condition | Provider |
|---|-----------|----------|
| 1 | `VITE_FEATURE_FLAGS` names at least one boolean flag | `InMemoryProvider` with those overrides |
| 2 | `VITE_CONFIGCAT_SDK_KEY` is set | `ConfigCatWebProvider` (auto-poll) |
| 3 | neither | `InMemoryProvider` with the declared defaults |

**A local override deliberately beats the remote control plane.** Dev and e2e
runs must not depend on the current state of a shared ConfigCat project, and a
developer debugging a flag should not have their machine changed by someone
toggling a dashboard. The order also makes the escape hatch obvious: set
`VITE_FEATURE_FLAGS` and the remote plane is out of the picture entirely.

The ConfigCat SDK is imported lazily, so its ~83 KB lands in its own chunk and
only on builds that configure a key — a build without one is byte-identical in
the main bundle.

## Evaluation context

Set at startup from `localStorage`, then re-applied on sign-in by
`trackSessionStarted` in `lib/observability/health-events.js`:

| Context key | Source | Purpose |
|-------------|--------|---------|
| `targetingKey` | `sf_auth_user` (username) | OpenFeature's standard identity key |
| `account_id` | `sf_auth_client_id` (tenant) | Tenant-level targeting; matches the Mixpanel group the analytics layer already sets |

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

#### Targeting rules will not match: the frontend sends no email

The `tenant-upgrade` setting in ConfigCat carries a targeting rule on
`User.Email`, and the SDK says so at runtime:

```
ConfigCat - WARN - [3003] Cannot evaluate condition (User.Email IS ONE OF [...])
for setting 'tenant-upgrade' (the User.Email attribute is missing).
```

The evaluation context sends `targetingKey` (the ERP username) and
`account_id`, never an email — the frontend does not have one, which is the
same open item recorded under the tenant upgrade flow below. So **only the
setting's fallback ("To all users") value has any effect**; a rule targeting
specific emails silently matches nobody and the flag stays at its fallback.

This matters when testing a toggle: flipping the *targeting rule* changes
nothing observable, while flipping the *fallback value* works. Anyone who
wants real email targeting has to close the account-email item first.

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
| `provider` | Registered provider, e.g. `in-memory` |
| `username` | The targeting key |

Two behaviours are deliberate:

- **Deduplicated** — one event per flag/value combination per session, not one
  per render. `useFeatureFlag` re-evaluates on every render, so without this the
  event would be uncountable. A flag that flips reports each distinct value once.
- **Never disturbs evaluation** — the hook runs inside flag resolution. It never
  awaits and never throws; a reporting failure cannot change what a flag
  resolves to.

The value is reported as `enabled` rather than `value` because the observability
payload sanitizer treats `value` as a numeric property and silently drops
booleans passed under that name. The targeting key travels as `username`, a
property the payload policy already sanctions, rather than widening that policy
with a second identity-bearing key.

## The tenant upgrade flow (`tenant-upgrade`)

Gates the paid path where a user keeps their free tenant and creates a second,
productive one.

| Piece | Location |
|-------|----------|
| Entry point (flag-gated) | User menu item in `components/UserAvatarButton.jsx` |
| Route (always registered) | `/upgrade` in `runtime-routes.jsx` |
| Page | `pages/UpgradePage.jsx` |
| Mock payment | `lib/upgrade/mockPayment.js` |
| API call | `lib/upgrade/api.js` |

**Flow.** The page shows a Free vs Productive comparison, a tenant name input,
and a mock checkout. The card is validated in the browser; `4000000000000002`
always simulates a decline and never reaches the network. Any other valid
16-digit card mints a `mock-paid-<hex>` token.

That token is sent as `paymentToken` to `POST /sws/go/onboarding`, which streams
NDJSON progress messages. On success the user is routed to `/logout`, because
tenant selection happens at sign-in and there is no in-app tenant switcher in v1.

### Backend contract (confirmed with the Etendo Go side)

| Rule | Consequence for the frontend |
|------|------------------------------|
| Accepted token shape is `/^mock-paid-[0-9a-f]+$/` — **lowercase** hex. Shape only: the backend does not confirm a charge occurred, so any well-formed token is provisioned | `createMockPaymentToken()` builds it with `toString(16)`, which is lowercase. Uppercase or non-hex would be declined. The gate is a placeholder for the flow, not a payment control. |
| Refusal is **HTTP 402** with a plain JSON body, *not* the NDJSON stream — the gate runs before the stream opens | `lib/upgrade/api.js` checks the status before touching `response.body`, so a 402 never reaches the stream reader. |
| Missing token and declined token both return `error: "payment_required"` and differ only in `message` | The UI does not branch on the code. A decline is caught client-side before any request; a 402 is reported as a generic payment-required error. |
| An account's **first tenant is never charged**, even with the flag on | The page loads the account's environments and, when there are none, shows "your first tenant is free" and a link to onboarding instead of the checkout. |
| Re-submitting a `clientName` the account already owns **resumes** that tenant and is not charged | The page rejects a name that matches an existing tenant, so a "success" never silently hands back an existing tenant. |
| The backend re-evaluates `tenant-upgrade` and is **authoritative** | The frontend flag is presentation only, consistent with rule 3 above. |
| Backend targeting key is the **account email**, now returned as `accountEmail` at the top level of `GET /sws/go/environments` | Not consumed yet — see below. |
| `GET /sws/go/environments` items now carry `plan: "free" \| "productive"`; treat a missing field as `"free"` | Not consumed yet — see below. |

**Open: targeting keys do not match.** The backend buckets on the account
email. The frontend uses `localStorage.sf_auth_user`, which
`buildEnvironmentSessionStorage` sets to `env.adminUserName || env.adminUser` —
the environment's ERP admin username, not the account email. This is inert today
because the local `InMemoryProvider` ignores the targeting key entirely, but it
must be resolved **before** Mixpanel is wired, or the two ends will bucket the
same user differently.

The backend now exposes `accountEmail` on `GET /sws/go/environments`, but
adopting it is not a one-line change, for three reasons:

1. **The core helper drops it.** `fetchEnvironments` in
   `@etendosoftware/etendo-go-core` returns `data.environments || []`, discarding
   the top-level field. Reading `accountEmail` needs a direct fetch in app-shell
   (the same reason `lib/upgrade/api.js` calls the onboarding endpoint directly).
2. **Scope.** The evaluation context must be set app-wide at startup, before any
   gated UI renders — the flag decides whether the `/upgrade` link is even shown.
   Reusing the `/upgrade` page's existing call would set it only for users who
   reach that page, so the same user would bucket differently depending on where
   they had navigated. Inconsistent targeting is worse than uniformly wrong
   targeting, because it is invisible in aggregate.
3. **Availability.** The call needs `sf_platform_token`, which is not guaranteed
   in every app-shell session — it is not part of `ENVIRONMENT_SESSION_KEYS`, and
   `UpgradePage` already handles its absence. Bucketing on email only when the
   token happens to be present reintroduces the same inconsistency.

The clean fix is to decide on one identity the frontend can know for **every**
session — for example persisting the account email at login, which is core-owned
code — and to set it once during flag bootstrap. That is a design decision, not
a local edit, so it is recorded here rather than half-applied.

There is a second option, should changing core login code prove awkward: the
account email is recoverable server-side from an authenticated `AD_User`, so a
JWT-authenticated endpoint could serve it for precisely the sessions that hold
an Etendo JWT but no `sf_platform_token` — the gap described above. Whoever
builds it must resolve against the `ETGO_ACCOUNT` record rather than derive the
email by string manipulation: onboarding composes the environment username from
the account email, but `+` is legal in an address, so splitting on it would
mangle plus-addressed users and surface as a rare unexplained mismatch instead
of an obvious failure. Both options are open; neither is chosen.

**Open: `plan` is not shown anywhere.** The natural place to badge it is the
environment picker, which lives in `@etendosoftware/etendo-go-core`
(`onboarding/steps/EnvSelectStep.jsx`), not in this repo. It needs a change in
the core package.

`lib/upgrade/api.js` deliberately does not reuse `runOnboardingStream` from
`@etendosoftware/etendo-go-core`: that helper serialises a fixed allowlist of
fields (so it would silently drop `paymentToken`) and starts reading the
response body without checking the status (so a 402 would surface as a generic
"no result" failure instead of a payment error).
