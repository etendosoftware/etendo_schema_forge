# Feature Flags

**Status:** Active
**Applies to:** `tools/app-shell/src/lib/flags/`

## The stack

| Layer | What it is | Why |
|-------|-----------|-----|
| **Application API** | [OpenFeature](https://openfeature.dev) — `@openfeature/web-sdk` | Vendor-neutral. Changing the control plane never touches component code. |
| **Control plane (today)** | Local — OpenFeature's `InMemoryProvider`, seeded from the `VITE_FEATURE_FLAGS` env var | Ships the flag capability without taking on a vendor integration before it is needed. |
| **Control plane (planned)** | Mixpanel Feature Flags, per team plan §5.6 | Remote flag management and targeting, alongside the product analytics already in use. |

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

### ETP-4686 (`tenant-upgrade`) attribution

| Kind | Path |
|------|------|
| Owned | `lib/upgrade/` (`api.js`, `mockPayment.js`) |
| Owned | `pages/UpgradePage.jsx` |
| Touch point | `runtime-routes.jsx` — lazy import plus one `lazyRoute('upgrade', …)` line |
| Touch point | `components/UserAvatarButton.jsx` — flag import, one `useFeatureFlag(TENANT_UPGRADE)` call, and the menu item it guards |
| Framework (unattributed) | `lib/flags/` |

This complies with the rule. The two touch points carry no business logic: the
route only registers a lazily-loaded page, and the menu entry only decides
whether to render a link. `UserAvatarButton.jsx` needs an import, a hook call
and a small JSX block rather than a literal single line — that is the floor for
rendering a menu item, and `grep TENANT_UPGRADE` still finds all of it.

## Configuration

| Variable | Effect |
|----------|--------|
| `VITE_FEATURE_FLAGS` | JSON map of flag key to boolean. Unset, empty or malformed values fall back to the declared defaults. |

```bash
# Turn the upgrade flow on locally
VITE_FEATURE_FLAGS='{"tenant-upgrade":true}' make dev
```

One variable holds every flag, so adding a flag needs no new environment
plumbing and there is no kebab-case-to-SCREAMING_SNAKE naming convention to keep
in sync. Non-boolean values are ignored.

## Evaluation context

Set at startup from `localStorage`, then re-applied on sign-in by
`trackSessionStarted` in `lib/observability/health-events.js`:

| Context key | Source | Purpose |
|-------------|--------|---------|
| `targetingKey` | `sf_auth_user` (username) | OpenFeature's standard identity key |
| `account_id` | `sf_auth_client_id` (tenant) | Tenant-level targeting; matches the Mixpanel group the analytics layer already sets |

## Swapping the control plane

`createFlagProvider()` in `lib/flags/bootstrap.js` is the **only** function that
knows which control plane backs the flags. Replacing the local provider means
changing that function and nothing else — `initFeatureFlags`, the
`useFeatureFlag` hook, the exposure hook and every call site stay as they are.

To move to Mixpanel:

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
| Accepted token shape is `/^mock-paid-[0-9a-f]+$/` — **lowercase** hex | `createMockPaymentToken()` builds it with `toString(16)`, which is lowercase. Uppercase or non-hex would be declined. |
| Refusal is **HTTP 402** with a plain JSON body, *not* the NDJSON stream — the gate runs before the stream opens | `lib/upgrade/api.js` checks the status before touching `response.body`, so a 402 never reaches the stream reader. |
| Missing token and declined token both return `error: "payment_required"` and differ only in `message` | The UI does not branch on the code. A decline is caught client-side before any request; a 402 is reported as a generic payment-required error. |
| An account's **first tenant is never charged**, even with the flag on | The page loads the account's environments and, when there are none, shows "your first tenant is free" and a link to onboarding instead of the checkout. |
| Re-submitting a `clientName` the account already owns **resumes** that tenant and is not charged | The page rejects a name that matches an existing tenant, so a "success" never silently hands back an existing tenant. |
| The backend re-evaluates `tenant-upgrade` and is **authoritative** | The frontend flag is presentation only, consistent with rule 3 above. |
| Backend targeting key is the **account email** | See the caveat below — the frontend does not currently have that value. |
| `GET /sws/go/environments` items now carry `plan: "free" \| "productive"`; treat a missing field as `"free"` | Not consumed yet — see below. |

**Open: targeting keys do not match.** The backend buckets on the account
email. The frontend uses `localStorage.sf_auth_user`, which
`buildEnvironmentSessionStorage` sets to `env.adminUserName || env.adminUser` —
the ERP admin username of the environment, not the account email, and the email
is not persisted anywhere client-side (it is only available from
`GET /sws/go/me`). This is inert today because the local `InMemoryProvider`
ignores the targeting key entirely, but it must be resolved **before** Mixpanel
is wired, or the two ends will bucket the same user differently.

**Open: `plan` is not shown anywhere.** The natural place to badge it is the
environment picker, which lives in `@etendosoftware/etendo-go-core`
(`onboarding/steps/EnvSelectStep.jsx`), not in this repo. It needs a change in
the core package.

`lib/upgrade/api.js` deliberately does not reuse `runOnboardingStream` from
`@etendosoftware/etendo-go-core`: that helper serialises a fixed allowlist of
fields (so it would silently drop `paymentToken`) and starts reading the
response body without checking the status (so a 402 would surface as a generic
"no result" failure instead of a payment error).
