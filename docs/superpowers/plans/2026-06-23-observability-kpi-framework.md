# Observability KPI Framework — Implementation Plan

**Jira:** ETP-4214  
**Design:** `docs/superpowers/specs/2026-06-10-observability-kpi-framework-design.md`  
**Status:** Working implementation plan. Frontend foundation items A1-A4 are implemented locally on `feature/ETP-4214`; Phase 0 decisions still block identify, NPS, backend telemetry, SQL jobs, and production rollout.

## Goal

Make every KPI from the SaaS functional-validation document observable through the existing App Shell observability layer plus backend telemetry and SQL integrity checks.

The implementation must preserve the repository rules:

- Do not patch `artifacts/*/generated/`; change generators and shared components.
- Do not send PII in product analytics payloads.
- Use NEO-native extension points for backend behavior; window-specific backend hooks belong in `NeoHandler` implementations, not generic services.
- Behavior-changing changes must update the relevant documentation in the same delivery.

## Delivery Scope

Primary repository:

- `schema-forge` repository root
- Branch observed during planning: `feature/ETP-4214`

Likely secondary repository:

- `com.etendoerp.go` inside the Etendo root, for `NeoTelemetryService`, AD model/sourcedata, scheduled SQL checks, and JUnit/OBBaseTest coverage.

Before implementation, confirm the secondary repository root and branch. Do not use tests from one repository as delivery evidence for the other.

## Current State

Frontend observability exists in `tools/app-shell/src/lib/observability/`:

- `createObservability()` supports `track`, `page`, `identify`, `captureException`, `setContext`, and `flush`.
- Providers: Sentry, AWS RUM, Mixpanel.
- `RouteTracker.jsx` emits normalized page views.
- `payload.js` strips denylisted PII keys and only emits allowlisted metadata.

Verified gaps from code and design:

- `tools/app-shell/src/lib/rum.js` has no `go.etendo.cloud` production config and hardcodes `sessionSampleRate: 1`.
- `tools/app-shell/src/lib/sentry.js` sets `sendDefaultPii: true` and no release.
- `identify()` exists but no App Shell login/auth bridge calls it.
- Numeric metric values are supported at value level, but numeric metric keys are not allowlisted.
- Existing onboarding events in `OnboardingPage.jsx` are ad hoc and need to move into a catalog without renaming.
- Auth and i18n are re-exported from `@etendosoftware/app-shell-core`; identify wiring and NPS copy require changes in `packages/app-shell-core` before App Shell can safely consume them.
- The current auth core exposes `token`, `username`, `roleList`, `selectedRole`, and `selectedOrg`, but not a safe opaque user id. `username` is PII-shaped and `token` is a secret, so neither can be used for `identify()`.
- Runtime i18n copy lives in `packages/app-shell-core/src/locales/en_US.json` and `packages/app-shell-core/src/locales/es_ES.json`; local `tools/app-shell/src/i18n/*` files are wrappers only.

## Phase 0 — Required Decisions

- [ ] Confirm the source-doc owner decision for `★` KPI threshold conflicts. Plan assumes `★` means 0 violations / 100% pass in SQL jobs.
- [ ] Decide Sentry privacy behavior. Recommended default: `sendDefaultPii: false`; any exception needs documented legal basis.
- [ ] Choose production RUM env names and sample-rate default:
  - `VITE_RUM_APP_MONITOR_ID_PROD`
  - `VITE_RUM_IDENTITY_POOL_ID_PROD`
  - `VITE_RUM_SESSION_SAMPLE_RATE`
- [ ] Confirm Mixpanel volume guardrails for frontend and backend events.
- [ ] Confirm the opaque user identifier source. Do not hash or send email/name; use an existing stable non-PII id or add one server-side.
- [ ] Confirm where App Shell core auth/i18n changes live, because this repo currently re-exports those modules from `@etendosoftware/app-shell-core`.
- [ ] Confirm backend repository, branch, module dbprefix, AD model ownership, and required `export.database` flow.
- [ ] Confirm SQL integrity schedule: Etendo scheduled process vs cron. Recommended: scheduled Etendo process if it needs tenant/session context.

## Phase A — Frontend Observability Foundations

### A1. Harden Sentry and RUM configuration

Status: implemented locally.

Files:

- `tools/app-shell/src/lib/rum.js`
- `tools/app-shell/src/lib/sentry.js`
- `tools/app-shell/src/lib/__tests__/observability-adapters.test.js`
- `docs/ops/app-shell-observability.md`

Work:

- Add production RUM host config for `go.etendo.cloud`.
- Parse `VITE_RUM_SESSION_SAMPLE_RATE` as a bounded number from `0` to `1`.
- Set Sentry `release` from env/build metadata.
- Change or explicitly gate `sendDefaultPii`.
- Update docs to include production env vars, release, sample rate, and privacy behavior.

Verification:

- `cd tools/app-shell && npm run test -- src/lib/__tests__/observability-adapters.test.js`
- `cd tools/app-shell && npm run test:vitest -- src/lib/__tests__/observability*.test.js`

### A2. Add canonical event catalog

Status: implemented locally.

Files:

- Add `tools/app-shell/src/lib/observability/events.js`
- Update `tools/app-shell/src/pages/OnboardingPage.jsx`
- Add/update observability catalog tests.
- Update `docs/ops/app-shell-observability.md`

Work:

- Define all event names from the design in one frontend catalog.
- Include existing IT/environment onboarding events exactly as currently emitted.
- Export typed helper constants or small builders for stable payload shapes.
- Add a catalog test that validates snake_case names and disallows unknown channel/property keys.

Verification:

- `cd tools/app-shell && npm run test:vitest -- src/lib/observability/__tests__ src/pages/__tests__/OnboardingPage.vitest.jsx`

### A3. Extend payload allowlist for KPI metrics

Status: implemented locally.

Files:

- `tools/app-shell/src/lib/observability/payload.js`
- `tools/app-shell/src/lib/__tests__/observability-payload.test.js`
- `tools/app-shell/src/lib/observability/__tests__/payload.vitest.js`

Work:

- Add safe numeric keys such as `durationMs`, `value`, `count`, `accuracy`, `score`, `step`, `attempt`, and `position`.
- Add stable low-cardinality metadata keys required by the catalog, such as `specName`, `entity`, `operation`, and `category` if needed.
- Enforce finite numeric values and sane caps per key. Numeric metric keys must not accept string or boolean values.
- Keep denylisted fields dominant over allowlisted fields.

Verification:

- `cd tools/app-shell && npm run test -- src/lib/__tests__/observability-payload.test.js`
- `cd tools/app-shell && npm run test:vitest -- src/lib/observability/__tests__/payload.vitest.js`

### A4. Add timing helpers

Status: implemented locally.

Files:

- Add `tools/app-shell/src/lib/observability/timing.js`
- Add `tools/app-shell/src/lib/observability/useTiming.js`
- Add focused Vitest coverage.

Work:

- Implement `startTiming(name) -> stop(extraProps)` with `performance.now()`.
- Implement `useTiming()` for React flows.
- Emit events with `durationMs` and catalog-backed names. Unknown timing event names do not emit.
- Keep this scoped to same-session timings only.

Verification:

- `cd tools/app-shell && npm run test:vitest -- src/lib/observability/__tests__`

### A5. Wire `identify()` after authentication

Files:

- `packages/app-shell-core/src/auth/session.js`
- `packages/app-shell-core/src/auth/AuthContext.jsx`
- Existing auth-core tests under `packages/app-shell-core/src/auth/__tests__/`
- Then `tools/app-shell/src/App.jsx` plus a new small bridge component.
- `tools/app-shell/src/__tests__/App.vitest.jsx` or a dedicated bridge test.

Work:

- Extend the auth/session contract to carry a backend-provided opaque user id. Do not derive it from `username`.
- Add an `AuthObservabilityBridge` mounted under `AuthProvider`.
- Call `identify(opaqueUserId, traits)` once per authenticated user/session.
- Do not send email, name, token, raw role IDs, org names, or other PII.
- If `useAuth()` does not expose a safe id, stop here and implement the id source in the auth core/server path first.

Verification:

- `cd tools/app-shell && npm run test:vitest -- src/__tests__/App.vitest.jsx`
- Add a negative assertion that credentials/tokens/emails are never passed to `identify`.

### A6. Add NPS survey support

Files:

- Add `tools/app-shell/src/lib/observability/nps.js`
- Add a reusable NPS component under `tools/app-shell/src/components/observability/` or the closest existing shared component location.
- Add i18n keys in `packages/app-shell-core/src/locales/en_US.json` and `packages/app-shell-core/src/locales/es_ES.json`, not hardcoded local text.
- Add or extend app-shell-core i18n tests so both locale files carry every NPS key.

Work:

- Implement `trackNps(score, context)` using the catalog.
- Build a lightweight survey with score validation and localized prompt/scale/submit copy.
- Support both product-wide NPS and Copilot NPS contexts.

Verification:

- Component test for render, submit, bounds, and no PII.
- i18n/quality-gate test for all new keys.

## Phase B — Generic Window Auto-Instrumentation

### B1. Thread observability context from the generator

Files:

- `cli/src/generate-frontend.js`
- `cli/test/generate-frontend.test.js`
- Generated output fixtures only when tests require fixture updates.

Work:

- Pass explicit observability metadata into `ListView` and `DetailView`, including `specName`, `entity`, `category`, and draft/document-mode flags.
- Do not derive `specName` from the current route.
- Keep generated code thin; event behavior lives in shared `contract-ui` components.

Verification:

- `make test` or targeted `node --test cli/test/generate-frontend.test.js`

### B2. Instrument list-level generic events

Files:

- `tools/app-shell/src/components/contract-ui/ListView.jsx`
- `tools/app-shell/src/components/contract-ui/RowQuickActions.jsx`
- `tools/app-shell/src/components/contract-ui/ListFilterBar.jsx`
- Existing nearby ListView/RowQuickActions/ListFilterBar tests.

Events:

- `window_opened`
- `search_performed`
- `search_result_selected`
- `quick_action_used`
- `record_deleted`

Work:

- Emit once per list mount for `window_opened`.
- Emit search events from filter/search submission points, with no query text.
- Emit quick-action events by action key/type only.
- Emit delete success after the existing delete flow succeeds.

Verification:

- `cd tools/app-shell && npm run test:vitest -- src/components/contract-ui/__tests__/ListView*.jsx src/components/contract-ui/__tests__/RowQuickActions.vitest.jsx src/components/contract-ui/__tests__/ListFilterBar.vitest.jsx`

### B3. Instrument detail/form generic events

Files:

- `tools/app-shell/src/components/contract-ui/DetailView.jsx`
- Existing DetailView save/action tests.

Events:

- `record_created`
- `record_updated`
- `document_completed`
- `time_to_create`

Work:

- Emit create/update only after `hook.handleSave()` succeeds.
- Emit `document_completed` only after `handleSaveAndProcess()` succeeds.
- Use the timing helper for new-record time-to-create from detail mount to first successful save.
- Do not include record id, document number, labels, names, form values, or backend messages.

Verification:

- `cd tools/app-shell && npm run test:vitest -- src/components/contract-ui/__tests__/DetailView.saveButtons.vitest.jsx src/components/contract-ui/__tests__/DetailView.render.vitest.jsx`

### B4. Add generated-window E2E smoke coverage

Files:

- Existing E2E harness under `e2e/tests/flows/`.

Work:

- Mock/spy the observability provider and assert a generated window emits:
  - page view
  - `window_opened`
  - create/save event
  - no raw record id in payload

Verification:

- Use the repo-standard E2E command from `docs/e2e-testing-guide.md`.

## Phase C — Specific Frontend KPI Flows

Implement these after the catalog and helpers exist.

- [ ] Dashboard: `pending_tasks_interacted`, quick action events.
- [ ] Contacts: autocomplete attempted/succeeded, top-3 search result selection.
- [ ] Purchases/Smart Scan/Copilot OCR: `ocr_invoice_uploaded`, `ocr_extraction_scored`, with `source` set to `purchases`, `smart_scan`, or `copilot`.
- [ ] Fiscal/business onboarding wizard: `onboarding_step_completed`, `onboarding_finished`, `onboarding_bank_configured`, `time_to_first_invoice`.
- [ ] Sales: `invoice_emailed`, `quote_created` timing.
- [ ] Copilot: session started, task resolved, correction needed, Copilot NPS.

Verification:

- Unit tests for each touched caller with mocked `track`.
- Payload tests for any newly allowlisted properties.
- E2E only where the KPI depends on a user journey across components.

## Phase D — Backend Telemetry

Repository:

- `com.etendoerp.go` in the Etendo root, to be confirmed before implementation.

Files:

- Add `src/com/etendoerp/go/schemaforge/telemetry/NeoTelemetryService.java`
- Add mirrored backend event constants.
- Add targeted `NeoHandler.afterHandle` hooks under `src/com/etendoerp/go/schemaforge/handlers/`
- Add JUnit tests for emitter payloads, disabled config, failures, and no-secret logging.

Work:

- Read the Mixpanel project token from `AD_SysConfig`; never hardcode it.
- Emit backend events with `backend_` prefix only for authoritative backend facts.
- Keep provider failures non-blocking for the business operation.
- Add a catalog sync check that compares backend event constants with frontend `events.js`.

Backend event candidates:

- `backend_accounting_entry_generated`
- `backend_ocr_field_accuracy`
- `backend_bank_match_attempted`
- `backend_asset_created`
- `backend_email_invoice_ingested`
- `backend_monthly_close_started`
- `backend_monthly_close_completed`

Verification:

- `./gradlew test --tests '*NeoTelemetryService*'`
- Relevant handler tests once handlers are added.

## Phase E — SQL Integrity Jobs

Repository:

- `com.etendoerp.go` in the Etendo root, to be confirmed.

Work:

- Add `ETGO_KPI_CHECK` with full AD model and sourcedata registration.
- Generate UUIDs with `make uuid`; do not hand-type IDs.
- Run `./gradlew generate.entities` after AD model changes.
- Add invariant query implementations for all `★` KPIs.
- Add a scheduled Etendo process to run checks and write `{kpi, total, violations, pass}`.
- Run `./gradlew export.database` after DB metadata is changed/exported.

Initial invariant groups:

- Collections correctly linked to invoice.
- Creditor invoices without critical data error.
- Stock movements with traceable origin.
- Purchase receipts update stock.
- Outbound delivery notes reduce stock.
- Invoices with correct accounting entry.
- Contacts available in Sales and Purchases.
- Product card stock equals Inventory stock.
- Onboarding users with correct roles.
- Fixed-asset amortization/disposal invariants.

Verification:

- OBBaseTest fixtures with pass and violation rows for each query group.
- XML well-formed checks for AD model/sourcedata.
- `./gradlew test` or targeted module tests from the confirmed backend repository.

## Phase F — Consumption and Reporting

Files:

- Add a monthly report script under an agreed tools location.
- Add report docs under `docs/ops/` or `docs/superpowers/` as appropriate.

Work:

- Pull Mixpanel, RUM/Sentry, and `ETGO_KPI_CHECK` data.
- Produce month-1 and month-2 green/red threshold reports.
- Keep token-cost KPI as a documented placeholder.
- Do not build a new in-app KPI dashboard for this task.

Verification:

- Unit tests with mocked provider responses.
- Golden sample output for a mixed pass/fail month.

## Delivery Evidence Required

Each PR/delivery must include:

- Delivery repository root and branch.
- Changed-file scope.
- Requirement covered.
- Tests added or changed.
- Exact commands executed and results.
- Functional validation data and expected result.
- QA status: validated by Matías Bernal / Emilio Polliotti, or explicitly pending.

Recommended command set by scope:

- Schema Forge CLI: `make test`
- App Shell focused frontend: `cd tools/app-shell && npm run test:all`
- Targeted App Shell during iteration: `cd tools/app-shell && npm run test:vitest -- <paths>`
- Backend Java: `./gradlew test` or targeted `./gradlew test --tests '<ClassName>'` from the confirmed Etendo root.

## Suggested PR Split

1. Frontend provider hardening + docs (`A1`).
2. Event catalog + payload numeric support + timing helper (`A2-A4`).
3. Identify bridge + NPS support (`A5-A6`).
4. Generator and generic `contract-ui` instrumentation (`B1-B4`).
5. Specific frontend KPI flows (`C`), split by module if review size grows.
6. Backend telemetry service and event sync lint (`D`).
7. `ETGO_KPI_CHECK` AD model + SQL integrity process (`E`).
8. Monthly report script and operational docs (`F`).

## Open Risks

- App Shell core dependency may require a coordinated branch/release for auth and i18n.
- RUM and Mixpanel event volume can create cost surprises if sample/rate controls are not enforced before production.
- Backend event taxonomy can drift from frontend catalog without CI enforcement.
- SQL invariant checks may need indexes or nightly scheduling to avoid large-tenant load.
- Some KPI thresholds conflict in the source document; implementation should not encode disputed thresholds until Phase 0 closes.
