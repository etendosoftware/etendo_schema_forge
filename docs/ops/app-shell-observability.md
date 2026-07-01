# App Shell Observability

App Shell initializes observability through a vendor-neutral layer in
`tools/app-shell/src/lib/observability`. Application code should use the shared
API instead of importing vendor SDKs directly.

## Providers

The browser initializer registers these providers:

| Provider | Enabled when | Purpose |
|----------|--------------|---------|
| Sentry | `VITE_SENTRY_DSN` is set | Error capture, tracing, and app context |
| AWS RUM | Hostname has matching RUM IDs | Browser performance, error, and HTTP telemetry |
| Mixpanel | `VITE_MIXPANEL_ENABLED=true` and `VITE_MIXPANEL_TOKEN` is set | Product analytics events |

Sentry defaults to `sendDefaultPii: false`. Only enable it with an explicit
environment override after reviewing the privacy and legal impact. Release is
set from `VITE_SENTRY_RELEASE` when present, otherwise from available build
metadata such as `SENTRY_RELEASE.id` injected at build time.

AWS RUM uses hostname-gated configuration for staging, experimental, and
production (`go.etendo.cloud`). `VITE_RUM_SESSION_SAMPLE_RATE` is parsed as a
bounded number from `0` to `1`; invalid or missing values fall back to the
conservative default `0.1`. Missing host config is still a no-op.

Mixpanel is opt-in. If `VITE_MIXPANEL_ENABLED=true` is set without
`VITE_MIXPANEL_TOKEN`, the provider logs a warning and remains disabled. The SDK
is lazy-loaded only when the provider is enabled and used.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_SENTRY_DSN` | Enables Sentry. |
| `VITE_SENTRY_RELEASE` | Optional explicit Sentry release. If unset, the app falls back to available build metadata. |
| `VITE_SENTRY_SEND_DEFAULT_PII` | Optional explicit Sentry PII gate. Defaults to `false`; set to `true` only with approved privacy review. |
| `VITE_RUM_APP_MONITOR_ID_STAGING` | CloudWatch RUM app monitor for `go.staging.etendo.cloud`. |
| `VITE_RUM_IDENTITY_POOL_ID_STAGING` | CloudWatch RUM identity pool for staging. |
| `VITE_RUM_APP_MONITOR_ID_EXPERIMENTAL` | CloudWatch RUM app monitor for `go.experimental.etendo.cloud`. |
| `VITE_RUM_IDENTITY_POOL_ID_EXPERIMENTAL` | CloudWatch RUM identity pool for experimental. |
| `VITE_RUM_APP_MONITOR_ID_PROD` | CloudWatch RUM app monitor for `go.etendo.cloud`. |
| `VITE_RUM_IDENTITY_POOL_ID_PROD` | CloudWatch RUM identity pool for `go.etendo.cloud`. |
| `VITE_RUM_SESSION_SAMPLE_RATE` | Optional RUM session sample rate. Values are clamped to `0..1`; invalid values fall back to `0.1`. |
| `VITE_MIXPANEL_ENABLED` | Set to `true` to enable Mixpanel. |
| `VITE_MIXPANEL_TOKEN` | Mixpanel project token. Required when Mixpanel is enabled. |
| `VITE_MIXPANEL_DEBUG` | Optional Mixpanel debug flag. |
| `VITE_MIXPANEL_API_HOST` | Optional custom Mixpanel API host (e.g. `https://api-eu.mixpanel.com`). |

For local development create `.env.development.local` (not committed):

```
VITE_MIXPANEL_TOKEN=<your-token>
VITE_MIXPANEL_API_HOST=https://api-eu.mixpanel.com
VITE_MIXPANEL_ENABLED=true
```

Staging reads `VITE_MIXPANEL_TOKEN` from the `${{ secrets.VITE_MIXPANEL_TOKEN }}`
GitHub Actions secret.

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

`trackSessionStarted` calls `identify(username)` first when a username is present,
linking the Mixpanel device ID to the user profile so that subsequent events are
attributed to the identified user rather than an anonymous `$device:…` ID. It then
calls `group('account_id', clientId)` to associate the session with the Mixpanel
group. When a client name is available — either from the `clientName` parameter or
from `localStorage.getItem('sf_auth_client_name')` — it also calls
`groupSet('account_id', clientId, { $name: clientName })`, which writes the `$name`
property on the Mixpanel Group Profile so the account appears by its company name
in Mixpanel → Users → Accounts. Finally it calls `flush()` to guarantee delivery
before the page potentially navigates away.

`trackDocumentCreated` and `trackTransactionPosted` are `async` functions that
call `flush()` internally before returning. Call sites must `await` them; no
separate `flush()` call is needed from outside.

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
`flush()` is handled internally by the helper; no separate call is needed at
the hook level.

### Seam 2 — `useEntity.js` `handleSaveAndProcess` (Complete button in draftMode)

File: `tools/app-shell/src/hooks/useEntity.js`

Used by the Complete button for documents that use `draftMode` (sales invoices,
purchase invoices, goods shipments, etc.). After the `documentAction` POST
succeeds, `await trackTransactionPosted()` is called before `refresh()`.
`flush()` is handled internally by the helper; no separate call is needed here.

### Seam 3 — `OrderCreateInvoice.jsx` (sales order "Create Invoice" modal)

File: `artifacts/sales-order/custom/OrderCreateInvoice.jsx`

The modal issues its own `fetch` to `documentAction` with `docAction: 'CO'` and
bypasses `handleSaveAndProcess` entirely. After the POST succeeds:

```js
await trackTransactionPosted();
window.dispatchEvent(new CustomEvent('sales-order:document-created'));
```

`flush()` is called internally by `trackTransactionPosted`, so delivery is
guaranteed before the `CustomEvent` triggers a context reload.

### Seam 4 — `PurchaseOrderActions.jsx` (purchase order confirm modal)

File: `artifacts/purchase-order/custom/PurchaseOrderActions.jsx`

Same pattern as Seam 3. The modal owns its `documentAction` fetch (`docAction: 'CO'`):

```js
await trackTransactionPosted();
window.dispatchEvent(new CustomEvent('purchase-order:document-created'));
```

`flush()` is handled internally by `trackTransactionPosted`; awaiting the helper
is sufficient before the CustomEvent that causes a context reload.

### Why the modals need their own seam

The generated `HeaderPage.jsx` for sales-order and purchase-order renders a custom
component slot (`customComponents.bottomSection`) that delegates the posting action
to the modal. The modal calls `fetch` directly, so `useDocumentAction` and
`handleSaveAndProcess` are never invoked. Any instrumentation added to those hooks
would never fire for these two windows when posting via the modal.

### `flush()` and the async helpers

`trackTransactionPosted`, `trackDocumentCreated`, and `trackSessionStarted` all
call `flush()` internally before resolving. Always `await` these helpers at the
call site — that is sufficient to guarantee delivery in every scenario (navigation,
reload, CustomEvent, or in-place re-fetch).

Do **not** import or call `flush()` separately from outside the helper. The
internal call already covers the case where a page unload or reload follows
immediately.

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
   No separate `flush()` import or call is needed — it runs inside the helper.
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

The health event helpers read `account_id` and `username` from `localStorage`
(`sf_auth_client_id`, `sf_auth_user`). These are low-cardinality tenant identifiers,
not PII entered by the user.

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
- Product analytics payloads remain allowlisted and redacted even when Sentry is
  enabled.
