# App Shell Observability

App Shell initializes observability through a vendor-neutral layer in
`tools/app-shell/src/lib/observability`. Application code should use the shared
API instead of importing vendor SDKs directly.

## Providers

The browser initializer registers Datadog for analytics, errors and performance,
optional independent Mixpanel for analytics, and legacy AWS RUM during migration.
Sentry/GlitchTip are removed. See [current migration/configuration](#datadog-migration-etp-5605)
and the committed `.env.observability.example` for all current environment variables.

## Events

Event definitions live in
`tools/app-shell/src/lib/observability/events.js`. Add new product events there
first, then use `buildObservabilityEvent()` at call sites so only the
catalog-approved properties are passed to `track`.

### Lifecycle events (v1)

| Event | When |
|-------|------|
| `app_started` | After browser observability initialization completes. |
| `page_view` | On initial route mount and each pathname change. |

Route tracking ignores query-string and hash-only changes.

### Onboarding product events (v1)

| Event | When |
|-------|------|
| `onboarding_auth_submitted` | Login or registration is submitted. |
| `onboarding_auth_succeeded` | Login or registration succeeds. |
| `onboarding_auth_failed` | Login or registration fails. |
| `onboarding_auth_logout` | The user logs out from onboarding. |
| `onboarding_setup_step_completed` | A setup step is completed. |
| `onboarding_setup_step_back` | The user moves back from a setup step. |
| `onboarding_run_started` | Environment creation starts. |
| `onboarding_run_succeeded` | Environment creation succeeds. |
| `onboarding_run_failed` | Environment creation fails. |
| `onboarding_environment_enter_submitted` | Environment entry starts. |
| `onboarding_environment_enter_succeeded` | Environment entry succeeds. |
| `onboarding_environment_enter_failed` | Environment entry fails. |

### Health Score events (ETP-4209)

These three events feed the customer Health Score dashboard in Mixpanel.
Helpers live in `tools/app-shell/src/lib/observability/health-events.js`.

| Event | When | Helper |
|-------|------|--------|
| `session_started` | User successfully enters an environment (OnboardingPage.jsx) | `trackSessionStarted({ username, clientId })` |
| `document_created` | A new record is saved for the first time (`isNew === true`) | `trackDocumentCreated()` |
| `transaction_posted` | A transactional document completes a posting action | `trackTransactionPosted()` |

`trackSessionStarted` stores session metadata, updates the OpenFeature context,
associates `account_id` with the tenant and optionally sets the Mixpanel group
name. It does not identify by username. Authenticated account resolution in
`useAccountIdentity` identifies providers by the opaque platform account ID.
The helper awaits the shared dispatch and lifecycle `flush`; Datadog's Browser
SDK has no public intake-acknowledgement flush API.

`trackDocumentCreated` and `trackTransactionPosted` dispatch fire-and-forget.
Awaiting them does not guarantee remote delivery before navigation. Their
provider SDKs manage delivery; they are product telemetry, not durable audit logs.

`trackDocumentCreated` and `trackTransactionPosted` are no-ops when the current
URL does not map to a known window in `health-events.map.js`, or when the window
is not marked `transactional: true` (for `transaction_posted`).

Both helpers read `window.location.pathname` to resolve the window name and
attach `document_type` and `functional_area` from the map.

## Health Events Map (`health-events.map.js`)

`HEALTH_EVENTS_MAP` maps the URL first-segment (kebab-case window name) to event
properties. Each entry declares:

```js
'sales-order': {
  document_type: 'sales_order',   // stable string sent to Mixpanel
  functional_area: 'sales',       // grouping dimension
  transactional: true,            // whether transaction_posted applies
}
```

`transactional: false` entries (quotes, contacts, products, assets) only fire
`document_created`; `trackTransactionPosted` returns early for them.

The map currently covers 17 windows across sales, purchases, stock, accounting,
and master data.

**To add a new window:** append one entry to `HEALTH_EVENTS_MAP`. The kebab-case
key must match the window's spec name (same convention as artifact directory
names). Set `transactional: true` only when the window has a completion/posting
step. No other files need to change for the event to start flowing.

## `transaction_posted` Seams

The posting action is triggered from three distinct call sites. Each requires its
own instrumentation because they each own their own `fetch` to `documentAction`.

### Seam 1 — `useDocumentAction.js` (kebab menu actions)

File: `tools/app-shell/src/hooks/useDocumentAction.js`

Used by generated `menuActions` (e.g., Reactivate). After a successful
`documentAction` POST, `execute()` calls `await trackTransactionPosted()`.
The helper dispatches fire-and-forget; SDK lifecycle handling owns delivery.

### Seam 2 — `useEntity.js` `handleSaveAndProcess` (Complete button in draftMode)

File: `tools/app-shell/src/hooks/useEntity.js`

Used by the Complete button for documents that use `draftMode` (sales invoices,
purchase invoices, goods shipments, etc.). After the `documentAction` POST
succeeds, `await trackTransactionPosted()` is called before `refresh()`.
The helper dispatches fire-and-forget; SDK lifecycle handling owns delivery.

### Seam 3 — `OrderCreateInvoice.jsx` (sales order "Create Invoice" modal)

File: `artifacts/sales-order/custom/OrderCreateInvoice.jsx`

The modal issues its own `fetch` to `documentAction` with `docAction: 'CO'` and
bypasses `handleSaveAndProcess` entirely. After the POST succeeds:

```js
await trackTransactionPosted();
window.dispatchEvent(new CustomEvent('sales-order:document-created'));
```

The event is dispatched before the `CustomEvent`; remote acknowledgement is
not guaranteed before the context reload.

### Seam 4 — `PurchaseOrderActions.jsx` (purchase order confirm modal)

File: `artifacts/purchase-order/custom/PurchaseOrderActions.jsx`

Same pattern as Seam 3. The modal owns its `documentAction` fetch (`docAction: 'CO'`):

```js
await trackTransactionPosted();
window.dispatchEvent(new CustomEvent('purchase-order:document-created'));
```

The event is dispatched before the CustomEvent; awaiting this helper does not
wait for remote acknowledgement.

### Why the modals need their own seam

The generated `HeaderPage.jsx` for sales-order and purchase-order renders a custom
component slot (`customComponents.bottomSection`) that delegates the posting action
to the modal. The modal calls `fetch` directly, so `useDocumentAction` and
`handleSaveAndProcess` are never invoked. Any instrumentation added to those hooks
would never fire for these two windows when posting via the modal.

### Delivery lifecycle

Only `trackSessionStarted` awaits shared `track` and `flush`. Document helpers
are fire-and-forget. Do not promise durable delivery or Datadog acknowledgement
on navigation; use an authoritative audit mechanism for transactional evidence.

## Adding `trackTransactionPosted` to a New Custom Modal

1. Confirm the window is in `HEALTH_EVENTS_MAP` with `transactional: true`. Add it
   if missing (see section above).
2. Import the helper at the top of the modal file:
   ```js
   import { trackTransactionPosted } from '@/lib/observability/health-events.js';
   ```
3. After the `documentAction` POST succeeds, call:
   ```js
   await trackTransactionPosted();
   ```
   The helper is fire-and-forget; no intake acknowledgement is implied.
4. Place the `await` before any `window.location` change or reload-triggering event.
5. Add a unit test that mocks `track` and asserts the event name and safe payload.

### KPI and Dashboard events (ETP-4214)

Broader business KPI events such as CRUD actions, filters, document processing,
backend checks, NPS, and timing events are catalogued for ETP-4214, but each
caller still needs explicit instrumentation and tests before the event is
considered emitted in production.

KPI instrumentation also emits the first Dashboard events:

| Event | When |
|-------|------|
| `quick_action_used` | A user opens a Dashboard quick action. |
| `pending_task_opened` | A user opens a Dashboard pending-task item. |
| `dashboard_document_opened` | A user navigates from Dashboard widgets to a document or catalog record. |

Additional broad business events such as CRUD actions, filters, document
processing, and menu clicks remain out of scope unless explicitly added and
tested.

## Timing Metrics

Use `startTiming()` or `useTiming()` from `tools/app-shell/src/lib/observability`
for same-session duration metrics. Timing helpers only emit catalog-backed
events and add a rounded, non-negative `durationMs` value.

```js
import { OBSERVABILITY_EVENTS } from '../lib/observability/events.js';
import { startTiming } from '../lib/observability/timing.js';

const stop = startTiming(OBSERVABILITY_EVENTS.TIME_TO_CREATE, {
  properties: {
    category: 'sales',
    entity: 'sales_order',
    operation: 'create',
    specName: 'sales-order',
  },
});

await stop({ status: 'success' });
```

### Creation-form defaults timing (ETP-4741)

| Event | When |
|-------|------|
| `defaults_block` | Emitted at most once per `useEntity.handleNew()` — exactly once for the session that survives to settlement (`ok`/`error`/`timeout`); sessions superseded by a newer `handleNew()` or neutralized by a record load (`handleSelect`/`fetchById`) **before they settle** emit nothing. Superseding or neutralizing a session that already settled (necessarily as `timeout`, since the gate release does not end the request) adds no second event — the timing handle is one-shot. Measures how long the creation form stayed blocked waiting for `GET /<entity>/defaults`. Properties: `entity`, `durationMs`, and `status` — `ok` (request settled successfully; the response is merged when it carries defaults), `error` (HTTP or network failure), or `timeout` (the 4s UX budget elapsed and the gate was released early — the request is *not* abandoned: it stays in flight and its response still merges when it lands, which is why no further event follows). |

## Privacy Rules

Payloads are normalized before providers receive them:

- Allowed common fields: `app`, `environment`, `hostname`, `mockMode`, `route`,
  `routePattern`, `timestamp`, and `windowName`.
- Allowed KPI numeric fields: `accuracy`, `attempt`, `count`, `durationMs`,
  `position`, `score`, `step`, and `value`. These must be finite numbers within
  their configured bounds; strings and booleans are dropped for numeric keys.
- Allowed low-cardinality metadata fields include `action`, `category`,
  `component`, `enabled`, `entity`, `event`, `locale`, `operation`, `provider`,
  `source`, `specName`, `status`, `supportRequested`, and `type`.
- Query strings, hashes, raw URLs, OAuth `code`/`state`, tokens, record IDs,
  document IDs, document numbers, labels, and names are stripped.
- Record-detail paths such as `/sales-order/ABC123` are emitted as
  `/sales-order/:recordId`.
- Nested opaque IDs are emitted as `:id`.

Do not pass free-form user-entered values to `track`, `page`, or future business
events. Add new event fields to the allowlist only when they are stable,
non-sensitive product metadata.

The health event helpers read `account_id` from the in-memory session identity
(`lib/sessionIdentity.js`), which `trackSessionStarted` records on sign-in and
`useAccountIdentity()` refreshes from `useAuth()` after a reload. It is a
low-cardinality tenant identifier, not PII entered by the user. Until ETP-5455 it came
from the legacy `sf_auth_client_id` key, which nothing writes since the cookie session,
so events went out with no `account_id`. The identity is never persisted and is cleared
on logout.

## Adding Business Events

Use the shared API from the app-shell observability facade:

```js
import { track } from '../lib/observability.js';
```

Event names should be lowercase `snake_case`, describe the product action, and
avoid implementation details. Prefer names such as `onboarding_setup_step_completed`
or `fiscal_setup_started`; avoid names with route IDs, document numbers, user
names, or UI copy.

Business event payloads are allowlisted. Only these keys are emitted:

`action`, `accuracy`, `app`, `attempt`, `category`, `channel`, `component`,
`correctCount`, `count`, `critical`, `durationMs`, `enabled`, `entity`,
`entityType`, `environment`, `errorClass`, `event`, `flow`, `hostname`,
`kpiId`, `locale`, `mockMode`, `module`, `operation`, `position`, `provider`,
`route`, `routePattern`, `score`, `source`, `specName`, `status`, `step`,
`supportRequested`, `timestamp`, `total`, `type`, `value`, and `windowName`.

KPI call sites should prefer `trackKpiEvent` or a domain-specific wrapper such
as `trackDashboardKpi`. Numeric KPI fields must be finite and within the ranges
enforced by `payload.js`; boolean flags such as `critical` must be booleans.

Values must be stable, low-cardinality product metadata. Do not send PII,
free-form text, raw URLs, OAuth values, tokens, record IDs, document IDs,
document numbers, customer names, labels, or user-entered values. Unknown keys
and denylisted keys are stripped before providers receive the payload, but call
sites should still avoid constructing sensitive payloads.

Prefer fire-and-forget dispatch from UI handlers so analytics never blocks the
workflow:

```js
void track('onboarding_step_completed', {
  action: 'complete',
  component: 'onboarding_wizard',
  source: 'company_profile',
  status: 'success',
  type: 'initial_setup',
});
```

Do not await `track` in render paths or user-facing flows unless the caller is a
test or an explicit observability lifecycle step (like `trackSessionStarted`).
Provider failures are logged and isolated by the registry.

Expected tests for new instrumentation:

- Unit test the caller with a mocked `track` and assert the event name and safe
  payload.
- Add payload normalization coverage when a new allowed field is needed.
- Assert sensitive values are not passed by the caller, not only that the
  sanitizer removes them.
- Keep disabled-provider and provider-failure behavior covered in observability
  adapter tests when provider behavior changes.

## Adding A Provider

1. Implement a provider object with `name`, `enabled`, and any supported methods:
   `init`, `track`, `page`, `identify`, `captureException`, `setContext`, or
   `flush`.
2. Register it from `buildBrowserObservabilityConfig`.
3. Keep initialization optional and failure-contained.
4. Add unit tests for disabled config, missing config, successful dispatch, and
   provider failures.

The Mixpanel provider passes a callback as the fourth argument to `client.track`
so that the returned `Promise` resolves after Mixpanel confirms dispatch. This is
what makes `await flush()` reliable: the provider wraps the callback-based SDK
call into a promise rather than fire-and-forget.

Provider failures are guarded by the registry. A failing provider must not block
app startup, rendering, routing, or other providers.

## V1 Limitations

- Observability is scoped to `tools/app-shell`.
- `packages/apps-sdk` does not receive observability context yet.
- Broad business-event instrumentation is not included.
- Product analytics payloads remain allowlisted and redacted for every provider.

## Datadog migration (ETP-5605)

The current browser initializer registers Datadog, optional independent Mixpanel
and legacy AWS RUM. Sentry/GlitchTip initialization, dependencies and build plugin
have been removed. Their DSN and upload token no longer configure this application.
AWS RUM remains available during migration; disable its per-target IDs after live
Datadog validation to avoid duplicate performance collection across vendors.

Datadog uses the official Browser RUM SDK for Product Analytics actions, browser
errors, resources and long tasks. One shared `track()` dispatch becomes one custom
Datadog action and, independently when enabled, one Mixpanel event. The event catalog
uses the `analytics` capability instead of a vendor destination. Automatic clicks
and session replay are enabled automatically, with replay defaulting to 20% and
Datadog privacy settings still applying. The React plugin registers the React
integration; the vendor-neutral root boundary still reports through the shared facade, so each
application error has one reporting path. Routes become manually tracked, normalized views;
the initial view is created during SDK initialization and a duplicate initial route
is suppressed. Browser uncaught exceptions and unhandled rejections are collected
by the SDK; the root React error boundary reports caught rendering errors through
`captureException`. Manual errors retain their Error stack, and metadata passes
through the common allowlist. SDK `beforeSend` also strips query strings, referrers,
resource URLs, email addresses and common credential patterns in error text.

Configure the values in `tools/app-shell/.env.observability.example`. Set
`VITE_DATADOG_ENABLED=true` and supply `VITE_DATADOG_APPLICATION_ID`,
`VITE_DATADOG_CLIENT_TOKEN`, `VITE_DATADOG_SITE` and `VITE_APP_ENV`.
`VITE_APP_VERSION` is the release identifier and defaults to the CI commit SHA in
release builds. The session sample rate is a percentage bounded to 0..100 (default
100), and `VITE_DATADOG_SESSION_REPLAY_SAMPLE_RATE` defaults to 20. Set
`VITE_DATADOG_REMOTE_CONFIGURATION_ID` to enable Datadog-managed RUM settings.
RUM feature flag context is attached to views, errors, vitals, actions, long
tasks and resources when the ConfigCat OpenFeature provider is enabled. The
OpenFeature exposure hook forwards real evaluations to RUM independently of
the shared `feature_flag_evaluated` business event, which remains the single
manual exposure event. RUM keys are sanitized for Datadog's identifier rules;
the business event retains the original flag key.
There is no browser API key. Incomplete configuration stays disabled and warns.

The account ID from the authenticated session is the opaque user targeting key;
the AD_Client is the analytics account/tenant ID. Names and emails are not
attached to Datadog profiles. Logout clears the common context, Datadog user,
account and global context, Mixpanel identity and OpenFeature evaluation context.
An old session response arriving after logout cannot restore identity.

CI resolves application ID/client token separately for PRODUCTION, EXPERIMENTAL
and STAGING from `VITE_DATADOG_APPLICATION_ID_<TARGET>` and
`VITE_DATADOG_CLIENT_TOKEN_<TARGET>` Actions variables. `DD_SITE` sets the site;
`VITE_DATADOG_ENABLED` enables RUM and `VITE_CONFIGCAT_SDK_KEY` enables remote
feature flags independently. Mixpanel is independently opt-in through
`VITE_MIXPANEL_ENABLED`.

When Datadog telemetry is enabled, CI uploads hidden source maps using the
server-side `DATADOG_API_KEY` secret, service `etendo-go-web`, commit SHA release
and the target public origin. Upload failure fails the release job. Source maps
are then removed from the public release package, including when Datadog is off.
The release version/service/public asset prefix must match the actual deployed
bundle. No credentials, uploads or deployment were performed by this change.

Live acceptance: enable the appropriate Datadog products and intake/CSP access,
then exercise sign-in, navigation, a business action, a caught render exception,
an uncaught exception and rejection, and sign-out followed by another account.
Verify single action/view counts, sanitized payloads, correct tenant/profile reset,
resource/long-task collection, and stack source-map symbolication for the exact
release. Confirm optional Mixpanel still receives the same business event once.
SDK delivery is lifecycle-managed; the Browser SDK has no public flush API and
`flush()` is not a promise of intake acknowledgement for Datadog. Live intake and
symbolication require deployment credentials and remain unverified locally.

Official references: [Browser SDK](https://docs.datadoghq.com/real_user_monitoring/application_monitoring/browser/setup/),
[Product Analytics](https://docs.datadoghq.com/product_analytics/),
[browser errors](https://docs.datadoghq.com/error_tracking/frontend/collecting_browser_errors/).

### Browser/server trace correlation

`VITE_DATADOG_TRACE_API_BASES` is a JSON array of explicitly trusted NEO API base
URLs, including the Etendo context, for example
`["https://core.example.com/etendo"]`. No bases means no propagation. Parsing
rejects credentials, query/hash, wildcards and non-HTTP protocols. A matcher
requires the exact origin and the base's `/sws/neo` path boundary; unrelated
hosts, lookalike host suffixes, other endpoint paths and third-party services
receive no trace headers. Propagators are W3C `tracecontext` and `datadog`.
`VITE_DATADOG_TRACE_SAMPLE_RATE` is bounded to 0..100 (default 20), independently
of session sampling. `traceContextInjection: sampled` retains the backend's own
sampling decision for browser requests not selected for tracing.

CI uses target-specific `VITE_DATADOG_TRACE_API_BASES_PRODUCTION`, `_STAGING`,
and `_EXPERIMENTAL` variables. Set each explicitly to the appropriate first-party
API base; never configure a catch-all domain regex. The chosen Datadog site is
EU (`datadoghq.eu`) unless `DD_SITE` is explicitly configured.

Runtime prerequisites: instrument Tomcat with the Datadog Java APM javaagent,
configure the service/environment/release and an Agent/collector accepting APM,
retain tracecontext/datadog propagation headers across proxy hops, and permit
those headers in backend CORS only for already trusted frontend origins. The
backend module's CorsUtils contains the matching header allowlist. Existing
shared authenticated API helpers continue to own credentials and language
headers; the RUM SDK injects correlation on their Fetch/XHR requests. Early
requests before SDK initialization are not correlated. Prove live correlation
by navigating a RUM resource to its matching Java APM trace under the configured
release and tenant; a successful unit build does not prove collector delivery.

Reference: [Connect RUM and traces](https://docs.datadoghq.com/tracing/other_telemetry/rum/).
