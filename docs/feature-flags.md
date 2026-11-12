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
refetches when the normalized evaluation context changes (sign-in, account/company switch or logout); identical settled or in-flight context publications are deduplicated and
emits `ConfigurationChanged`, which `useFeatureFlag` already rereads on. **It does
not poll**: a dashboard change reaches an open tab on its next context change or
reload, not within a poll interval as with ConfigCat. The last configuration is
cached in IndexedDB per client token and used as a `STALE` fallback only when the network fails and the cached context matches. Reads are guarded against assignments accepted for a different context: a failed company/account switch or logout cannot expose the previous account's flag values. Same-context cached assignments remain usable.

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
`targetingKey` (trimmed original-case email), the opaque `accountId`, the lowercase `email`, ConfigCat-compatible `Email`, and the AD_Client under `clientId` plus its legacy `account_id` alias —
to Datadog's flag CDN (`ff-cdn.datadoghq.eu`) to get its assignments, and the
exposure and evaluation-telemetry events go to Datadog's intake. The backend
(`GoFeatureFlags`, com.etendoerp.go) shares the email targeting key, `email`/`Email` attributes and `clientId`; the browser keeps its additional opaque account and legacy analytics attributes. This is accepted
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

`buildEvaluationContext` uses the trimmed original-case account email as
`targetingKey`, matching backend `FeatureFlagContext.forAccount`. Lowercase `email`
and original-case `Email` support targeting rules on Datadog and ConfigCat.
`accountId` remains the opaque platform account ID. `clientId` and the compatibility
alias `account_id` both identify the AD_Client company, a different identity.
An ERP username is a temporary fallback until the account email is known.

`useAccountIdentity` consumes the authenticated `account` from `useAuth()` instead
of looking it up again. Changing company retains the same account and publishes
one updated context. A real account switch clears the prior account first, even
when the ERP username and company are unchanged. Token rotation does not resolve
an already resolved identity again. An unresolved legacy lookup can retry when its
credential changes. Unresolved cookie and legacy contexts also receive at most two
automatic retries (after 500 ms and 1500 ms), cancelled on identity change or unmount;
successful contexts never poll. A legacy session without a complete account uses
`refreshAccountIdentity` and `/sws/neo/session`; incomplete authoritative accounts
cannot inherit another account's cached email.

Stored account fields are not proof of which account owns a cookie session.
Bootstrap and session telemetry do not restore unverified account cache data.
An authoritative account or validated session lookup owns cache replacement;
a different cached owner triggers cleanup first. Cookie sessions without a bearer
token remain valid. Only a normalized empty session clears the account on logout.
Generation, identity snapshot and AbortSignal guards discard stale lookups,
including an A-to-B-to-A company change. Provider `Error` and `Stale` events also
refresh mounted flag hooks; a same-context stale configuration is retained.

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
| `bank-bounce-suggestions` | `bank-bounce-suggestions` | ETP-5581 (TTL placeholder 2026-12-31). Backend-only, per account: gates the automatic bounce-pair suggestions of the bank reconciliation for PSD2-synced accounts (the "Rechazos bancarios" section of the auto-match modal, the pair review in the reconciliation panel, accepting a pair). The SPA only renders what the auto-match answer carries. Honouring already-discarded lines is gated too: with the flag off they are plain pending lines, as before ETP-5581; only the stored account counter *Por conciliar* keeps leaving them out (known limitation in the registry entry). Registered on day one, before any code; backend: `com.etendoerp.go` `docs/feature-flags-and-tenant-upgrade.md` |
| `billing-reconciliation-schedule` | `billing-reconciliation-schedule` | Go-live (flag plus production Process Request): "2.10 Billing reconciliation go-live" in `com.etendoerp.go` `docs/open-and-notable-topics.md`; behaviour: "`billing-reconciliation-schedule` (ETP-5048)" in `com.etendoerp.go` `docs/feature-flags-and-tenant-upgrade.md` |
| `bp-portal-link` | `bp-self-service-portal` | [BP self-service portal](plans/2026-09-10-bp-self-service-portal.md); backend: `com.etendoerp.go` `docs/feature-flags-and-tenant-upgrade.md` |
| `demo-data-transfer` | `demo-data-transfer` | Retired in `com.etendoerp.go` by ETP-5480 (`docs/feature-flags-and-tenant-upgrade.md`, "`demo-data-transfer` — retired"); the registry entry still awaits its retirement |
| `environment-access-enforcement-off` | `environment-access-enforcement-kill-switch` | [Paid tenant infrastructure](paid-tenant-infrastructure.md) §3.7; local testing: [`stripe-local-testing.md`](stripe-local-testing.md) "The 402 body and the kill switch"; operating it: "Operating environment-access enforcement" in `com.etendoerp.go` `docs/feature-flags-and-tenant-upgrade.md` |
| `fiscal-model-390` | `fiscal-model-390` | ETP-5716 (TTL 2027-01-01): hides the whole Modelo 390 — the catalog answer drops it and marks it `_unavailable`, and every surface (catalog drawer, declarations list, Organization's Modelo 390 section) reacts to that answer; [fiscal models guide](generated-custom-windows/fiscal-models.md) "Modelo 390 behind the backend-only flag `fiscal-model-390`"; backend: `com.etendoerp.go` `docs/feature-flags-and-tenant-upgrade.md` |
| `invoice-inbox` | `invoice-inbox` | ETP-6047 (TTL 2027-01-31, provisional). Backend-only, per account (lowercase `email` rules): gates the Invoice Inbox upload endpoint (evaluated at request entry, never in the OCR worker) and, through `capabilities.invoiceInbox` off `SFWindowAccessMap` (ETP-6049), the inbox menu entry and page. No web key: the browser only reads the capability. The page's Discard (batch bar and row trash, ETP-6049) calls the NEO action `POST /sws/neo/invoice-inbox/header/{id}/action/discard`, behind the same backend gate; with the flag off it answers `403 feature_disabled` and the SPA stops the batch. The table, window and read-only NEO spec ship unconditionally; backend: `com.etendoerp.go` `docs/feature-flags-and-tenant-upgrade.md` |
| `structured-address-for-sepa` | `structured-address-for-sepa` | ETP-5806 relaunch (TTL 2026-11-15, driven by [etendosoftware/etendo-ai#24](https://github.com/etendosoftware/etendo-ai/issues/24) — SEPA 2025 rulebooks ban unstructured addresses in remittance files from that date); backend: `com.etendoerp.go` `docs/feature-flags-and-tenant-upgrade.md` |
| `product-movements-tab` | `product-movements-tab` | ETP-5889 (TTL placeholder 2027-01-31). Backend-only, per account: the browser reads `capabilities.productMovements` off `SFWindowAccessMap`; backend: `com.etendoerp.go` `docs/feature-flags-and-tenant-upgrade.md` |
| `usage-aggregation-schedule` | `usage-aggregation-schedule` | [Usage measurement](usage-measurement.md) §7.1; go-live (flag plus production Process Request): "5.1 Turning the usage schedule on" in `com.etendoerp.go` `docs/plan-quotas.md`; behaviour: "`usage-aggregation-schedule` (ETP-5051)" in `com.etendoerp.go` `docs/feature-flags-and-tenant-upgrade.md` |

### Backend flags that also have a web key

One flag is evaluated on **both** ends with the same key and the same identity, so it is the exception
to the rule above: `psd2-statement-import-settings` (ETP-6151, TTL placeholder 2026-12-31).

| Key | Web key | Registry entry | What it gates |
|---|---|---|---|
| `psd2-statement-import-settings` | `PSD2_STATEMENT_IMPORT_SETTINGS` in `tools/app-shell/src/lib/flags/flag-keys.js` (default `false`), read only through `hooks/usePsd2ImportSettingsFlag.js` | `psd2-statement-import-settings` (roots `frontend` and `backend`) | Required "Importar desde" and statement grouping when linking a PSD2 bank account (connect modal and Edit-account panel), the `import-settings` / financial-account update validation, `maxFetchInterval` on `accounts`, and deleting statements of bank-connected accounts. Off (the default, and what an absent key means) reproduces the behaviour before ETP-6151 |

The browser key is **visual gating only**: the backend (`Psd2ImportSettingsFlag`) evaluates the same
key per account (targeting key = the account email, lowercase `email` attribute) and enforces the
rules on its own, so both ends must be targeted with the same rules or the SPA shows fields the
backend ignores, or the reverse. Backend: `com.etendoerp.go` `docs/feature-flags-and-tenant-upgrade.md`
section "`psd2-statement-import-settings` (ETP-6151)". Feature behaviour:
[financial-account](generated-custom-windows/financial-account.md) and
[financial-account-management](generated-custom-windows/financial-account-management.md).

**Ends can disagree.** SPA ON + backend OFF: link / createAndLink report success but the import-from date and
grouping are not stored (the first sync imports everything), and delete shows the trash and notice but the
backend answers the old 409. SPA OFF + backend ON: link / createAndLink with empty fields get a 400 whose
English text shows raw in the toast (the SPA translates it only with its flag ON), and the trash for
processed statements is hidden. ON to OFF for an account: the stored date and grouping stay and the PSD2
sync keeps using them, while any grouping can be saved again. Hence: create the flag and its per-email rules
(lowercase `email`) for **both ends at the same time**, enable a test email first, verify on SPA and backend,
then widen. Details: `com.etendoerp.go` `docs/feature-flags-and-tenant-upgrade.md`.

**Control-plane setup (not yet done in any environment):** create a **boolean** flag named exactly
`psd2-statement-import-settings` in Datadog Feature Flags (and the same setting in ConfigCat as the
fallback), **default `false`**, in each environment (production, experimental, staging, development),
then add per-account targeting rules on the lowercase `email` attribute for the accounts to enable. Until
the key exists it resolves to `false` and nobody is targeted.

## Personal business-grid views

`GRID_COLUMN_VIEWS` (`grid-column-views`) is the single switch for personal column
visibility, order and widths. Its shipped default is **false** (the feature ships
dark), including when no provider answers; it is turned on by an explicit remote
provider value of true or a deterministic local override
(`VITE_FEATURE_FLAGS='{"grid-column-views":true}'`, fixed at server start). No per-window
flags are introduced. Saving is explicit and scoped by authenticated user, spec and entity;
filters, sorting, selected rows and business actions are not saved. An entity scope must match
an entity registered in that spec; Unicode letters, digits, `.`, `_`, `-` and parentheses are
supported in entity names. The preference key hashes the spec/entity pair.

**Rollout and rollback.** The flag ships off, so the default build, the push gate and the
default Playwright run exercise the original grids; only the specs specific to this feature
run with it on (they skip themselves unless the server was started with the flag on). To
roll out, turn it on for a chosen environment through the remote provider or
`VITE_FEATURE_FLAGS`, and check the surfaces listed in
[bespoke grid views](bespoke-grid-views.md) there before widening it. To roll back, set it
back to false: every surface returns to its original column layout and no personal-view
request is made. Saved views are not deleted by turning the flag off; they live in the
user's preferences and apply again when it is turned on. A stored view whose schema does not
match the current columns is normalized or ignored, never shown as saved.

**Column width bounds.** A personal width is clamped to 48-1200 px, both when the user
resizes and when a stored view is read back: the 24 px of header padding means a narrower
column would show nothing and would disagree with its body cells. A stored width below 48
is raised to 48; a negative or non-numeric one is ignored and the default width applies.
A narrow window keeps horizontal scroll instead of squeezing columns below that floor.

ListView entry points qualify only when the registry identifies a generated page
or an audited forwarding wrapper, and the loaded contract declares the standard
(default or absent) layout (or the explicitly audited product gallery/list layout) with either no custom
header table or the exact audited header-table slot. Missing/malformed
contracts and placeholder/custom layouts fail closed. The audited custom entry
points are amortization, assets, goods-movements, goods-receipt,
internal-consumption, physical-inventory, price-list, purchase-order,
return-to-vendor-shipment, sales-order, sales-quotation, sales-invoice, purchase-invoice,
payment-in, payment-out, user, warehouse, contacts, product, product-category,
goods-shipment, return-material-receipt and financial-account. Their table wrappers
forward props through the generated table to DataTable. InvoiceHeaderTable (invoice specs), PaymentHeaderTable (payment specs) and
UserHeaderTable (user) and ContactsTable (contacts) are admitted only on their matching audited entry point; a
changed header name fails closed. Financial accounts admit only AccountsHeaderTable.
Toolbar visibility and scroll ownership do not affect eligibility. When the resolved
`hideListBar` option hides the normal toolbar, personal-view controls appear once
above the table region; this works with either ListView or table-owned scrolling.
Existing headClass/cellClass column protections remain in force, including the
financial-account column chrome that locks customization under useGridView. Product personal
views apply to its standard list table; switching to gallery hides the personal-view
controls and keeps the cards in their existing layout.

ListModalWindow shares the existing useGridView/GridViewControls persistence and
column-header controls. It requires a kebab-case `api.specName` or `windowName`, a
nonempty entity, matching spec names when both are supplied, and an API contract
base URL equal to `/sws/neo/<spec>` when present. It never derives identity from a
display name or guesses a spec from a URL. Without that stable identity, the modal
retains its original grid without personal-view requests or controls. Selection,
row actions, inline toggles, sorting, filtering and create/edit dialogs retain
their existing semantics. Loading or failed saved views retain the default grid;
controls expose loading, retry and save failure through the shared component.

Effective coverage also includes `InlineLinesPanel` with the stable spec/entity
passed by `DetailView`, the eight financial-account custom grids and both
`ReconciliationSplitPanel` tables for verified scopes, the migrated bespoke
business grids, and the independent Calendar and Not Posted Documents DataTable
surfaces. Existing audited DataTable adapters retain their parent's controller;
rendering DataTable alone does not establish a personal-view scope. The active
inline add-row form temporarily uses the default layout and disables personal-view
controls to preserve alignment; its saved/unsaved personal layout resumes afterward.

Actual limits remain: unaudited/custom list layouts fail closed; mixed or
unverifiable reconciliation candidates have no personal-view request; projections
without a configured entity, permission/assignment matrices, demonstrations and
output/form surfaces are not automatically admitted. `AttachmentsTable` is still
blocked: `/attachments/{tableName}/{recordId}` is a cross-cutting resource without
a configured attachment entity or a collision-free attachment-surface persistence
contract. The owning document's header scope would collide with its list view.
See [bespoke grid inventory](bespoke-grid-views.md),
[standalone DataTable inventory](standalone-datatable-grid-views.md), and
[financial-account inventory](../tools/app-shell/src/windows/custom/financial-account/README.md)
for effective coverage and exact prerequisites. Full verification: `npm run test:all` passed
(1,175 Vitest files; 24,617 tests passed, 2 skipped), and `npm run build` passed. A mock-browser
smoke on `/sales-order` confirmed the default-on column controls and hiding a column. The smoke
stubbed session/access and returned 204 for grid-view requests; authenticated persistence was
not verified. Lint/formatters and human QA remain pending.
