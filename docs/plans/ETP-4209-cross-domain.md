# ETP-4209 — Cross-domain plan

**Feature:** Frontend instrumentation for Customer Health Score — emits
`session_started`, `document_created`, and `transaction_posted` events from the
app-shell so the Mixpanel Health Score system can compute Activity, Depth, Login,
and Activation-Gate dimensions.

This PR is approved as cross-domain because the feature requires changes across
the observability platform layer, two window artifacts (the transaction call sites
for sales-order and purchase-order), the app-shell-core session schema, a
mocked E2E spec, and documentation. All changes serve a single instrumentation
feature and cannot be scoped to a single domain without defeating the feature.

## Domains touched

### `platform-change` (app-shell observability layer)

- `tools/app-shell/src/lib/observability/health-events.js` — new module exposing
  `trackSessionStarted`, `trackDocumentCreated`, `trackTransactionPosted`.
- `tools/app-shell/src/lib/observability/health-events.map.js` — static registry
  mapping 17 window names to `{ document_type, functional_area, transactional }`.
- `tools/app-shell/src/lib/observability/core.js` — adds `group()` method to the
  provider interface.
- `tools/app-shell/src/lib/observability/providers/mixpanel.js` — implements
  `group()` → `set_group()`; sets `batch_requests: false` for immediate dispatch.
- `tools/app-shell/src/lib/observability.js` — re-exports `group()` from singleton.
- `tools/app-shell/src/lib/observability/payload.js` — adds `account_id`,
  `username`, `document_type`, `functional_area` to the event property allowlist.
- `tools/app-shell/src/pages/onboarding/onboardingState.js` — persists
  `sf_auth_client_id` / `sf_auth_client_name` to localStorage on env login.
- `tools/app-shell/src/pages/OnboardingPage.jsx` — calls `trackSessionStarted()`
  + `group()` after successful login.
- `tools/app-shell/src/hooks/useEntity.js` — calls `trackDocumentCreated()` on
  POST success for mapped windows; `trackTransactionPosted()` on
  `handleSaveAndProcess` success.
- `tools/app-shell/src/hooks/useDocumentAction.js` — calls
  `trackTransactionPosted()` on DocAction success for mapped windows.
- `tools/app-shell/src/lib/__tests__/health-events.js` — unit tests (Node runner)
  for `health-events.map.js` and allowlist coverage.
- `tools/app-shell/src/lib/__tests__/health-events.vitest.js` — 26 Vitest unit
  tests for all three helpers: payload correctness, PII absence, localStorage
  reads.
- `tools/app-shell/src/lib/__tests__/observability-mixpanel.test.js` — existing
  test updated for `batch_requests: false` option.

### `app-shell-core` (session schema)

- `packages/app-shell-core/src/auth/session.js` — adds `clientId` field to the
  session schema so downstream consumers can read `account_id` without re-parsing.
- `packages/app-shell-core/src/auth/__tests__/session.test.js` — existing test
  updated for the new `clientId: null` default.

### `window:sales-order` (transaction call site)

- `artifacts/sales-order/custom/OrderCreateInvoice.jsx` — calls
  `trackTransactionPosted()` after the modal POST that creates an invoice from a
  sales order. This call site is in the artifact because the action is
  artifact-specific and not reachable from the generic `useDocumentAction` hook.

### `window:purchase-order` (transaction call site)

- `artifacts/purchase-order/custom/PurchaseOrderActions.jsx` — calls
  `trackTransactionPosted()` after the modal POST that processes a purchase order.
  Same rationale as sales-order.

### `e2e` (mocked flow spec)

- `e2e/tests/flows/health-events.mocked.spec.js` — two Playwright tests that
  intercept Mixpanel XHRs without a backend. Verifies `document_created` fires on
  invoice save and `transaction_posted` fires on DocAction confirm.

### `repo-infra` (docs + hook fix)

- `docs/ops/app-shell-observability.md` — updated with the 3 new business events
  and the new allowlist entries (self-documentation policy).
- `.githooks/pre-push` — compatibility fix: wraps `git merge-tree --write-tree`
  in `set +e / set -e` so the existing git < 2.38 fallback branch is reachable.

## Tests

- **26 Vitest unit tests** (`health-events.vitest.js`): payload correctness, PII
  absence (`user_email`, `document_id` never emitted), localStorage reads,
  fire-and-forget pattern for non-blocking flows.
- **Node runner tests** (`health-events.test.js`): `HEALTH_EVENTS_MAP` shape,
  `extractWindowName`, allowlist pass/block assertions.
- **Existing suite** (`observability-mixpanel.test.js`): updated for
  `batch_requests: false`; continues passing.
- **Existing suite** (`session.test.js`): updated for `clientId: null`; continues
  passing.
- **2 Playwright mocked specs** (`health-events.mocked.spec.js`): `document_created`
  on invoice save, `transaction_posted` on DocAction confirm — no backend required.

## Rollback

All changes are additive instrumentation with no schema migration or DB impact:

- **Observability module:** Delete `health-events.js` and `health-events.map.js`;
  remove the three call sites (`OnboardingPage.jsx`, `useEntity.js`,
  `useDocumentAction.js`, `OrderCreateInvoice.jsx`, `PurchaseOrderActions.jsx`).
  The app reverts to emitting no Health Score events; Mixpanel data stops flowing
  but no user-facing behaviour changes.
- **`group()` method:** Remove from `core.js`, `providers/mixpanel.js`,
  `observability.js`. Mixpanel Group Profiles stop being updated at login;
  no user-facing impact.
- **`clientId` in session:** Remove field from `session.js`. Callers that read
  `session.clientId` fall back to `undefined`; `trackSessionStarted` already
  handles a missing `clientId` gracefully (group call is skipped).
- **`batch_requests: false`:** Revert to default (batched). Events are sent with
  a 5-second delay instead of immediately; no functional regression, only
  observability latency.
- **Allowlist entries:** Remove `account_id`, `username`, `document_type`,
  `functional_area` from `SAFE_EVENT_PROPERTY_KEYS`. These properties are silently
  stripped from payloads; analytics data is reduced but no error is thrown.
- **Hook fix:** Revert the `set +e / set -e` wrapper. The pre-push hook crashes
  on git < 2.38 again (pre-existing behaviour).
