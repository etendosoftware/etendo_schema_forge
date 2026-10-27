# Feature Flags

**Status:** Active. Application API: OpenFeature. Remote control plane: Datadog
Feature Flags (ETP-5751), with ConfigCat kept as a fallback until the cutover.

Components use `useFeatureFlag(key, fallback)` from `lib/flags` (numeric flags such as
`import-batch-size`, ETP-5676, use `useNumberFlag(key, fallback)` with a numeric default in
`flag-keys.js`). Provider SDKs are never imported here: `lib/observability/sdk.js` is the one
file allowed to import them (ETP-4578), and the bootstrap receives the Datadog flags SDK by
injection — `createFlagProvider({ datadogLoader })` defaults to `loadDatadogFlags` from that
module. Flag exposure events are telemetry, so the flags SDK is a provider SDK like the RUM ones
and must share their single egress point. Flag keys and shipped safe boolean defaults are
centralized in `lib/flags/flag-keys.js`. Flags are visual gating only, never an
authorization boundary; backend access checks are independent.

## Provider precedence and configuration

1. A nonempty boolean map in `VITE_FEATURE_FLAGS` selects deterministic
   `TypedInMemoryProvider` values, merged over shipped defaults. It bypasses
   every remote provider while remaining eligible for Datadog RUM exposure
   context when Datadog RUM is enabled, keeping development and E2E independent
   of remote settings.
2. Otherwise a remote provider is chosen by `resolveRemoteFlagProvider`:
   - **Datadog Feature Flags** (`@datadog/openfeature-browser`) when its
     credentials are complete — the RUM `VITE_DATADOG_APPLICATION_ID`,
     `VITE_DATADOG_CLIENT_TOKEN`, `VITE_DATADOG_SITE` and `VITE_APP_ENV`. No new
     secret: the flag SDK uses the RUM application and its public client token.
     `VITE_DATADOG_ENABLED` is not required, so flags and RUM telemetry switch
     independently.
   - **ConfigCat** (`@openfeature/config-cat-web-provider`, auto-polling) when
     `VITE_CONFIGCAT_SDK_KEY` is set.

   `VITE_FLAGS_PROVIDER=datadog|configcat` names the preference; unset, Datadog
   wins. A preferred provider that is not configured falls through to the other
   one (with a warning) rather than to defaults; an unknown value warns and is
   treated as unset.
3. Otherwise the in-memory safe defaults apply.

| Variable | Meaning |
|---|---|
| `VITE_FEATURE_FLAGS` | JSON map of flag key to boolean or finite number, for example `{"proof-of-concept-menu":true,"import-batch-size":10}` |
| `VITE_FLAGS_PROVIDER` | `datadog` or `configcat`; preference between configured remote providers, default `datadog`. CI sets it from the `VITE_FLAGS_PROVIDER` Actions variable, which is the rollback lever to ConfigCat |
| `VITE_DATADOG_APPLICATION_ID`, `VITE_DATADOG_CLIENT_TOKEN`, `VITE_DATADOG_SITE` | Shared with RUM; enable Datadog Feature Flags |
| `VITE_APP_ENV` | Datadog flag environment (`production`, `experimental`, `staging`, `development`) |
| `VITE_CONFIGCAT_SDK_KEY` | ConfigCat browser SDK key for the selected environment (fallback) |
| `VITE_CONFIGCAT_POLL_SECONDS` | Positive ConfigCat refresh interval, default 60 seconds |

Mixpanel is an optional analytics destination.

### Datadog Feature Flags

The provider posts the OpenFeature evaluation context to Datadog's flag CDN
(`ff-cdn.<site>`) and receives the assignments precomputed for that context. It
refetches on every context change (sign-in, `refreshAccountIdentity`, logout) and
emits `ConfigurationChanged`, which `useFeatureFlag` already rereads on. **It does
not poll**: a dashboard change reaches an open tab on its next context change or
reload, not within a poll interval as with ConfigCat. The last configuration is
cached in IndexedDB per client token and served as `STALE` while a fetch is
pending.

Datadog flag environments map one to one to `VITE_APP_ENV`. Only **Experimental**
and **Production** are enabled in Datadog today; a build whose environment is
disabled there (staging, development) resolves every flag to its code default.
Targeting rules match the `email` context attribute case-sensitively against
lowercase values, so `buildEvaluationContext` sends it trimmed and lowercased;
they bucket on `targetingKey`, which is sent unchanged; Datadog requires every context attribute to be a flat primitive,
which `buildEvaluationContext` guarantees.

**One RUM exposure source.** The SDK ships three telemetry paths. Two stay on —
exposure logging and aggregated evaluation telemetry — because they feed the
Feature Flags product's own intake, which nothing else reports to. The third,
`enableRumFeatureFlagTracking`, is **off**: the exposure hook in
`flag-exposure.js` already adds every real evaluation to RUM for every provider.
Leaving both on would record each flag twice in RUM, under the raw key
(`import-batch-size`) from the SDK and under the sanitized key
(`import_batch_size`) from the hook, and the SDK would also merge the RUM user
into the evaluation context.

**Data sent to Datadog.** The browser POSTs the whole evaluation context —
`targetingKey`/`accountId`, the lowercase `email` and the AD_Client `account_id` —
to Datadog's flag CDN (`ff-cdn.datadoghq.eu`) to get its assignments, and the
exposure and evaluation-telemetry events go to Datadog's intake. The backend
(`GoFeatureFlags`, com.etendoerp.go) sends the same attributes. This is accepted
under the same Datadog data processing as our logs and RUM. Note the difference
from ConfigCat, which downloads the rules and evaluates in the client: with
Datadog the context, account email included, leaves the client.

### Rollout, proof and rollback

Turn Datadog on in Experimental first. Before Production, prove each end reads Datadog and not
ConfigCat: the SPA must `POST` to `ff-cdn.datadoghq.eu/precompute-assignments?dd_env=experimental`
and make no request to `cdn-global.configcat.com`, and a targeting rule on lowercase `email` for one
tester, added only in Datadog's Experimental environment, must change what that tester sees (a flag
that resolves the same on both control planes proves nothing). The step-by-step check, shared with
the backend, is in `etendo-go-infraestructure/COMO-REEMPLAZAR-AL-TUTI.md`, section *Datadog Feature
Flags (ETP-5751)*.

**Rollback:** set the `VITE_FLAGS_PROVIDER` Actions variable to `configcat` and redeploy. The
backend rolls back independently, by removing `DD_FEATURE_FLAGS_ENABLED` from its task definition
(com.etendoerp.go `docs/feature-flags-and-tenant-upgrade.md` §1).

### ConfigCat (fallback)

The ConfigCat provider fetches assignments at initialization and polls for
changes at `VITE_CONFIGCAT_POLL_SECONDS`. OpenFeature context changes update the
ConfigCat evaluation user through the provider. Closing the provider releases
the ConfigCat client. Its dependencies stay installed until the cutover is
complete; remove them, this section and the CI key together.

### Readiness

Network configuration fetches have a four-second timeout (Datadog through the
SDK's `withTimeout`, ConfigCat through `maxInitWaitTimeSeconds`). The bootstrap
bounds provider readiness to five seconds, never rejects to application startup
and never blocks rendering. A provider that fails to load or initialize leaves
the declared defaults in place. Synchronous hook reads use shipped defaults
before readiness and when evaluation fails. Provider/context/configuration
events cause subscribers to reread; the readiness notification also rereads on
the next microtask to account for OpenFeature provider installation ordering.

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

## Telemetry kill switches

`telemetry-kill-all` and `telemetry-kill-<datadog|aws-rum|mixpanel>` are operational
switches read by the observability layer, not feature flags: `true` STOPS telemetry, the
default is `false`, they are never exposed as flag exposures and they are not tracked in
`flags-registry.json`. See [Kill Switch](ops/app-shell-observability.md#kill-switch).

## Exposure events and rollout

The existing OpenFeature exposure hook emits the catalog-backed
`feature_flag_evaluated` event through the common analytics fan-out. Provider
name is a stable label pinned in `createFlagProvider` (`datadog` or
`ConfigCatWebProvider`), so minification cannot fragment it. There is
one provider registration and one common hook per startup.

Whichever remote provider is active, Datadog RUM receives the evaluated flag
context through this hook alone (see *One RUM exposure source* above). Evaluated flag values
enrich RUM view and error events automatically, and the RUM adapter also
attaches them to vital, action, long-task and resource events.
The RUM SDK adds view and error contexts implicitly; the adapter passes the four
supported additional event types explicitly. This native RUM enrichment remains
separate from the catalog-backed `feature_flag_evaluated` business event, so it
does not create duplicate manual exposure events. The OpenFeature hook sends
only real provider evaluations to `datadogRum.addFeatureFlagEvaluation`; the
startup no-op provider is excluded from RUM context while remaining visible in
the business exposure audit.

Define flags in Datadog Feature Flags with the exact kebab-case code key
(boolean, or numeric for `import-batch-size`) and enable them per environment.
While ConfigCat remains the fallback, keep the same keys there with a separate
SDK key per deployment target.
See [observability operations](ops/app-shell-observability.md#datadog-migration-etp-5605)
for CI credentials, releases, source maps and optional Mixpanel.

Validation covers deterministic local precedence, remote provider selection,
missing configuration, readiness failure, context changes, polling, logout and
stale identity responses. Live dashboard toggling and assignment intake require
real Datadog (or ConfigCat) credentials and are separate from mocked/unit
verification.

Official provider references: [Datadog Feature Flags — JavaScript](https://docs.datadoghq.com/feature_flags/client/javascript/),
[ConfigCat OpenFeature Web Provider](https://github.com/open-feature/js-sdk-contrib/tree/main/libs/providers/config-cat-web-provider).

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

## Backend-only flags

A flag evaluated only in `com.etendoerp.go` (backend framework `featureflags/`, see
*Architecture: flag code layout* above) has **no key in `flag-keys.js`, and none must be added**:
the SPA reacts to what the backend answers, never to the flag itself — a browser key would be a
second evaluator on a different control plane. Its owned paths, symbols and TTL are registered in
[`flags-registry.json`](../flags-registry.json) under root `backend`, like every other flag, and
its behaviour is documented in its topic doc and in `com.etendoerp.go`
`docs/feature-flags-and-tenant-upgrade.md`. This page keeps only the list:

| Key | Registry entry | Topic doc |
|---|---|---|
| `billing-reconciliation-schedule` | `billing-reconciliation-schedule` | Go-live (flag plus production Process Request): "2.10 Billing reconciliation go-live" in `com.etendoerp.go` `docs/open-and-notable-topics.md`; behaviour: "`billing-reconciliation-schedule` (ETP-5048)" in `com.etendoerp.go` `docs/feature-flags-and-tenant-upgrade.md` |
| `bp-portal-link` | `bp-self-service-portal` | [BP self-service portal](plans/2026-09-10-bp-self-service-portal.md); backend: `com.etendoerp.go` `docs/feature-flags-and-tenant-upgrade.md` |
| `demo-data-transfer` | `demo-data-transfer` | Retired in `com.etendoerp.go` by ETP-5480 (`docs/feature-flags-and-tenant-upgrade.md`, "`demo-data-transfer` — retired"); the registry entry still awaits its retirement |
| `environment-access-enforcement-off` | `environment-access-enforcement-kill-switch` | [Paid tenant infrastructure](paid-tenant-infrastructure.md) §3.7; local testing: [`stripe-local-testing.md`](stripe-local-testing.md) "The 402 body and the kill switch"; operating it: "Operating environment-access enforcement" in `com.etendoerp.go` `docs/feature-flags-and-tenant-upgrade.md` |
| `structured-address-for-sepa` | `structured-address-for-sepa` | ETP-5806 relaunch (TTL 2026-11-15, driven by [etendosoftware/etendo-ai#24](https://github.com/etendosoftware/etendo-ai/issues/24) — SEPA 2025 rulebooks ban unstructured addresses in remittance files from that date); backend: `com.etendoerp.go` `docs/feature-flags-and-tenant-upgrade.md` |
| `usage-aggregation-schedule` | `usage-aggregation-schedule` | [Usage measurement](usage-measurement.md) §7.1; go-live (flag plus production Process Request): "5.1 Turning the usage schedule on" in `com.etendoerp.go` `docs/plan-quotas.md`; behaviour: "`usage-aggregation-schedule` (ETP-5051)" in `com.etendoerp.go` `docs/feature-flags-and-tenant-upgrade.md` |
