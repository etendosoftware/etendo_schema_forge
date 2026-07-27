# Feature Flags

**Status:** Active
**Applies to:** `tools/app-shell/src/lib/flags/`

## The stack

| Layer | What it is | Why |
|-------|-----------|-----|
| **Application API** | [OpenFeature](https://openfeature.dev) — `@openfeature/web-sdk` | Vendor-neutral. Swapping the control plane never touches component code. |
| **Control plane** | Mixpanel Feature Flags, via the official `@mixpanel/openfeature-web-provider` | Flags live next to the product analytics already in use, so targeting and metrics share one definition of a user. |

Components only ever see the OpenFeature API through the `useFeatureFlag` hook.
Nothing imports the Mixpanel provider outside `bootstrap.js`.

### Packages

| Package | Version | Notes |
|---------|---------|-------|
| `@openfeature/web-sdk` | `^1.9.0` | Synchronous, client-side flag evaluation |
| `@openfeature/core` | `^1.11.0` | Peer dependency of the web SDK. It is imported at runtime and is **not** bundled, so it must stay an explicit dependency. |
| `@mixpanel/openfeature-web-provider` | `^0.1.1` | Official provider; peer-depends on `mixpanel-browser ^2.79.0`, which the app already ships |

## Three rules

### 1. The safe default lives in code

Every flag declares its default in `lib/flags/flag-keys.js`, and that default must
describe **today's shipped behaviour**. When no provider is registered — no
Mixpanel token, offline, misconfigured — OpenFeature's built-in no-op provider
returns the default the caller passed. An unreachable control plane therefore
degrades to the current product rather than exposing unfinished work.

### 2. Flags never block rendering

`initFeatureFlags()` is fire-and-forget and never rejects. Flag reads are
synchronous, so a component renders immediately with the default and re-renders
if and when the provider reports a different value. Provider startup is bounded
by a timeout so a hung control plane cannot leave the app waiting.

Variants are cached locally (`persistenceUntilNetworkSuccess`, 24h TTL): a
returning user gets their last known values instantly while a refresh runs in
the background.

### 3. Frontend flags are visual gating only — never authorization

A flag decides what the UI **shows**. It is not a security boundary: anyone can
flip a flag in their own browser. Every gated capability must be enforced
independently by the backend.

The `/upgrade` route is the worked example — it is registered
**unconditionally**, and only the menu entry that points at it is flag-gated.
Hiding a route would imply the flag was protecting something, which it is not.

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

3. Create the flag in Mixpanel with **exactly the same key**, and make sure the
   backend enforces whatever the flag reveals.

Flag keys are kebab-case, matching the Mixpanel convention.

## Evaluation context

Set at startup from `localStorage`, then re-applied on sign-in by
`trackSessionStarted` in `lib/observability/health-events.js`:

| Context key | Source | Purpose |
|-------------|--------|---------|
| `targetingKey` | `sf_auth_user` (username) | OpenFeature's portable identity |
| `distinct_id` | `sf_auth_user` (username) | **What Mixpanel actually buckets on.** Its flags API reads `distinct_id` from the flag context; an explicit value overrides the anonymous device id, so without it every user is bucketed as a different visitor. |
| `account_id` | `sf_auth_client_id` (tenant) | Tenant-level targeting; matches the Mixpanel group the analytics layer already sets |

The provider runs its own named Mixpanel instance (`openfeature_0`) with
autotracking, page views and session recording disabled, and its own persistence
key. It carries flag traffic only and does not interfere with the analytics
instance in `lib/observability/providers/mixpanel.js`.

## Configuration

| Variable | Effect |
|----------|--------|
| `VITE_MIXPANEL_ENABLED` | Must be `'true'`, otherwise no provider is registered and every flag resolves to its default |
| `VITE_MIXPANEL_TOKEN` | Mixpanel project token; without it the provider stays disabled |
| `VITE_MIXPANEL_API_HOST` | API host (the EU host for this project) |
| `VITE_MIXPANEL_DEBUG` | Verbose provider logging |
| `VITE_FEATURE_FLAGS_OVERRIDE` | **Local development only.** JSON map of flag key to boolean, served by an OpenFeature in-memory provider that replaces Mixpanel entirely. |

### Forcing a flag on locally

```bash
VITE_FEATURE_FLAGS_OVERRIDE='{"tenant-upgrade":true}' make dev
```

This needs no Mixpanel project and no token. The app logs a warning so an
override is never mistaken for real control-plane behaviour. Never set it in a
deployed environment — it makes the control plane unreachable by design.

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
NDJSON progress messages. The backend enforces the paywall — it rejects an
invalid or missing token with **HTTP 402** `{"error":"payment_required"}`, and
only applies the paywall when the account already owns at least one tenant and
the flag is on. On success the user is routed to `/logout`, because tenant
selection happens at sign-in and there is no in-app tenant switcher in v1.

`lib/upgrade/api.js` deliberately does not reuse `runOnboardingStream` from
`@etendosoftware/etendo-go-core`: that helper serialises a fixed allowlist of
fields (so it would silently drop `paymentToken`) and starts reading the
response body without checking the status (so a 402 would surface as a generic
"no result" failure instead of a payment error).
