# Feature Flags

**Status:** Active. Application API: OpenFeature. Remote control plane: ConfigCat.

Components use `useFeatureFlag(key, fallback)` from `lib/flags`; SDK imports stay
in bootstrap/provider adapters. Flag keys and shipped safe boolean defaults are
centralized in `lib/flags/flag-keys.js`. Flags are visual gating only, never an
authorization boundary; backend access checks are independent.

## Provider precedence and configuration

1. A nonempty boolean map in `VITE_FEATURE_FLAGS` selects deterministic
   `TypedInMemoryProvider` values, merged over shipped defaults. It bypasses
   ConfigCat evaluation while remaining eligible for Datadog RUM exposure
   context when Datadog RUM is enabled, keeping development and E2E independent
   of remote settings.
2. `VITE_CONFIGCAT_SDK_KEY` enables the official
   `@openfeature/config-cat-web-provider` with ConfigCat auto-polling. A missing
   key skips remote evaluation.
3. Otherwise the in-memory safe defaults apply.

| Variable | Meaning |
|---|---|
| `VITE_FEATURE_FLAGS` | JSON boolean map, for example `{"proof-of-concept-menu":true}` |
| `VITE_CONFIGCAT_SDK_KEY` | ConfigCat browser SDK key for the selected environment |
| `VITE_CONFIGCAT_POLL_SECONDS` | Positive ConfigCat refresh interval, default 60 seconds |

Datadog remains the RUM and observability destination; it does not evaluate
feature flags. Mixpanel is an optional analytics destination.

The ConfigCat provider fetches assignments at initialization and polls for
changes at `VITE_CONFIGCAT_POLL_SECONDS`. OpenFeature context changes update the
ConfigCat evaluation user through the provider. Closing the provider releases
the ConfigCat client. This keeps dashboard changes live in an existing tab
without a reload.

Network configuration fetches have a four-second timeout. The bootstrap bounds
provider readiness to five seconds, never rejects to application startup and
never blocks rendering. Synchronous hook reads use shipped defaults before
readiness and when evaluation fails. Provider/context/configuration events cause
subscribers to reread; the readiness notification also rereads on the next
microtask to account for OpenFeature provider installation ordering.

## Identity and privacy

`buildEvaluationContext` takes the authenticated platform `accountId` as
`targetingKey`; an ERP username is a temporary fallback. `account_id` is the
AD_Client tenant ID, a different identity. The current account email remains an
explicit targeting attribute where supplied by the session, not an analytics
profile. Datadog RUM auto-enrichment is disabled for flag context so it cannot
silently merge old analytics identity into flag evaluations.

`refreshAccountIdentity` resolves `/sws/neo/session` with authenticated request
headers, caches platform account fields, updates OpenFeature and assigns the
opaque account ID to observability user identity and client ID to analytics
account identity. Logout clears cached/in-memory identity and evaluation context.
A generation and identity snapshot guard ignores a session response that completes
after logout or a direct account/tenant switch.

Do not target rules on secrets or rely on browser flags for entitlement. The
browser client token and evaluated assignments are visible to the browser.
Account and tenant attributes must match backend targeting conventions.

## Exposure events and rollout

The existing OpenFeature exposure hook emits the catalog-backed
`feature_flag_evaluated` event through the common analytics fan-out. Provider
name is the stable `ConfigCatWebProvider` label from the official SDK. There is
one provider registration and one common hook per startup.

When the ConfigCat provider is active, Datadog RUM still receives the evaluated
flag context independently through its RUM integration. Evaluated flag values
enrich RUM view and error events automatically, and the RUM adapter also
attaches them to vital, action, long-task and resource events.
The RUM SDK adds view and error contexts implicitly; the adapter passes the four
supported additional event types explicitly. This native RUM enrichment remains
separate from the catalog-backed `feature_flag_evaluated` business event, so it
does not create duplicate manual exposure events. The OpenFeature hook sends
only real provider evaluations to `datadogRum.addFeatureFlagEvaluation`; the
startup no-op provider is excluded from RUM context while remaining visible in
the business exposure audit.

Define flags in ConfigCat with the exact kebab-case code key and boolean
variants. Use a separate SDK key per deployment target and safe remote
fallbacks. Enable flags independently of Datadog RUM.
See [observability operations](ops/app-shell-observability.md#datadog-migration-etp-5605)
for CI credentials, releases, source maps and optional Mixpanel.

Validation covers deterministic local precedence, missing configuration,
readiness failure, context changes, polling, logout and stale identity
responses. Live dashboard toggling and assignment intake require a real
ConfigCat SDK key and are separate from mocked/unit verification.

Official provider reference: [ConfigCat OpenFeature Web Provider](https://github.com/open-feature/js-sdk-contrib/tree/main/libs/providers/config-cat-web-provider).

On a direct authenticated username/tenant switch, `useAccountIdentity` clears the
old account cache, OpenFeature context and observability SDK profiles first,
without logging out or changing the live cookie/bearer session. New identity
resolution starts after reset completes; a failed resolution stays anonymous
instead of retaining the previous account. Ordinary rerenders for the same
username/client do not reset identity. Business events wait for the provider
identity reset barrier before dispatching.

## Architecture: flag code layout

Each flag owns its implementation files. Shared files contain greppable toggle
points only, never flag-specific business logic. Framework files (`lib/flags/`
and backend `featureflags/`) belong to no individual flag. Keep safe defaults
centralized and visual gates independent of authorization. Register owned paths
and debt at the start of a flag's life, following [flag debt](flag-debt.md) and
[the technical debt playbook](technical-debt-playbook.md).

The former `tenant-upgrade` flag is retired; permanent payment/entitlement rules
are documented in [paid tenant infrastructure](paid-tenant-infrastructure.md).
