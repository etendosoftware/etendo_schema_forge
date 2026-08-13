# Observability KPI Framework — Design

- **Date:** 2026-06-10
- **Source:** `Etendo-SaaS-KPIs-Validacion-Funcional-v1.0` (functional validation KPIs, 10 modules)
- **Status:** Approved design — pending implementation plan
- **Scope:** End-to-end instrumentation plan that makes every KPI in the source document observable using the existing observability framework, plus the framework extensions, backend telemetry, and SQL validation jobs required to close the gaps.

## 1. Context & Problem

The KPI document defines ~60 KPIs across 10 first-iteration modules plus 7 cross-cutting KPIs, organized in 6 dimensions: **Performance**, **Adoption**, **Precision**, **Integrity**, **UX**, and **Business**. It also defines acceptance criteria (a module is validated at ≥80% of its KPIs; Integrity-100% KPIs are blocking) and a 3-phase measurement plan (Alpha weeks 1-2, Beta weeks 3-6, Post-launch months 1-2).

A privacy-conscious observability framework **already exists** in `tools/app-shell/src/lib/observability/`:

- Provider-agnostic core (`createObservability`) with `track / page / identify / captureException / setContext / flush`.
- Three wired providers: **Sentry** (errors/exceptions), **AWS CloudWatch RUM** (performance: web vitals, http, errors), **Mixpanel** (product analytics).
- `RouteTracker.jsx` auto-emits normalized page-views.
- `payload.js` enforces a strict PII allowlist/denylist (privacy-by-design).

**Gaps:**

1. Actual product instrumentation is concentrated in onboarding. `OnboardingPage.jsx` already emits ~12 distinct events (`onboarding_auth_*`, `onboarding_setup_step_*`, `onboarding_run_*`, `onboarding_environment_enter_*`) plus `app_started`. These are the IT/environment-setup flow, **not** the 4-step business wizard (`windows/custom/fiscal-config/OnboardingWizard.jsx`). The 10 product modules are otherwise uninstrumented, and the existing onboarding events must be folded into the catalog (Section 4), not duplicated.
2. `payload.js`'s `SAFE_EVENT_PROPERTY_KEYS` allows **no numeric metric keys** — yet nearly all Performance/Precision KPIs and UX timings need numeric measurements. Note: `sanitizeEventProperties` already accepts `typeof value === 'number'` at the value level (payload.js:132); numeric values are dropped only because their *key names* are absent from the allowlist. The fix is key-name additions, not value-type support.
3. **Integrity 100%** KPIs are data-consistency invariants (stock = inventory, linked accounting entries, correct roles) — backend/data truth, not frontend telemetry.
4. `identify()` exists but is never called, so all retention/cohort KPIs cannot be computed (30-day retention, 3-day abandonment, "Accounting board ≥1/week", "Copilot weekly in month 1").
5. No NPS mechanism for the two NPS KPIs.
6. **RUM has no production config.** `rum.js` (`getRumConfigs`) only defines `go.staging.etendo.cloud` and `go.experimental.etendo.cloud`; on any other host `createRumProvider` returns `enabled: false` and silently no-ops. **Every Channel-1 (performance) KPI is currently blind in production.**
7. **Sentry sends PII by default.** `sentry.js:32` sets `sendDefaultPii: true` (IP, cookies, headers) and sets no `release`. The first is a GDPR concern for an EU financial SaaS; the second means Sentry Release Health (the actual crash-free-session metric) cannot be computed.
8. **Provider method coverage is asymmetric.** RUM implements only `init()` (captures performance/http/errors independently via the AWS SDK); Sentry implements `init/captureException/setContext`. Only Mixpanel implements `track/page/identify`. So `track()`/`page()` are Mixpanel-only — this is correct by design but means the framework is not symmetrically provider-agnostic across all methods.

## 2. Architecture

Three data origins, three consumption tools, one shared event taxonomy so a KPI is coherent regardless of where it is emitted.

```
┌─ CONSUMPTION ──────────────────────────────────────────────────┐
│  Mixpanel (Adoption/UX/Business) · CloudWatch RUM (Performance) │
│  Sentry (Stability) · Monthly consolidated report (script)      │
└────────────────────────────────────────────────────────────────┘
        ▲                    ▲                      ▲
┌─ FRONTEND (app-shell) ─┐ ┌─ BACKEND (Etendo Go) ┐ ┌─ DATA (SQL) ─┐
│ A) Generator-driven    │ │ NeoTelemetryService   │ │ Integrity    │
│    auto-instrumentation│ │ (NeoHandler hooks →   │ │ validation   │
│    + contract-ui       │ │  Mixpanel server-side)│ │ jobs (100%)  │
│ B) Event catalog +     │ │ for backend Precision/│ │ + data-      │
│    hooks (specific      │ │ Adoption truth        │ │ quality      │
│    flows)               │ └───────────────────────┘ └──────────────┘
│  ─────────────────────  │
│  Existing framework:    │
│  track/page/identify/   │
│  captureException       │
└─────────────────────────┘
```

**Instrumentation strategy = Hybrid (Approach C):**

- **A) Generator-driven (generic, covers all 10 modules at once):** instrument once in the generator (`cli/src/generate-frontend.js`) and the shared `contract-ui/` components. Generated windows auto-emit the standard event set, reading category/draftMode/completion-flow from the contract. Lives in the generator/shared components — **never patched into `generated/`** (repo policy).
- **B) Event catalog + hooks (specific flows):** a central `events.js` taxonomy plus hooks (`useTrackEvent`, `useTiming`) called explicitly in module-specific flows (OCR, onboarding wizard, Copilot, NPS).

## 3. Framework Extensions (Foundations)

1. **Numeric metrics in `payload.js`** — add a controlled set of numeric keys to the allowlist: `durationMs`, `value`, `count`, `accuracy`, `score`, `step`, `attempt`. Validate type `number`, finite, and apply sanity caps. PII denylist remains intact. (Value-level numeric support already exists — see Gap 2.)
2. **Timing helper** — `startTiming(name) → stop(extraProps)` and a React `useTiming()` hook; emits an event with `durationMs`. Backed by `performance.now()`. **Limitation:** session-scoped — cannot span users/sessions/hours, so cross-session durations (e.g. monthly close) must use backend start/stop events instead (Channel 6).
3. **NPS mechanism** — a lightweight in-app survey component + `trackNps(score, context)`. **i18n required:** all user-visible strings (prompt, scale labels, submit) must have keys in both `en_US.json` and `es_ES.json` per CLAUDE.md — hardcoded English is a bug.
4. **Event catalog** — `events.js`: the **canonical reference** for event names and valid properties. Java cannot import it, so the backend keeps mirrored string constants; add a CI lint check that validates backend event names against the catalog. The existing `OnboardingPage.jsx` events (Gap 1) must be migrated into the catalog rather than left ad-hoc.
5. **Identify wiring** — call `identify(opaqueUserId)` on login with a hashed/opaque id (PII-safe). **Prerequisite for all cohort/retention KPIs**, not just the two cross-cutting ones (also gates "Accounting board ≥1/week" and "Copilot weekly in month 1").
6. **RUM production config** — add a production host entry to `getRumConfigs` (`VITE_RUM_APP_MONITOR_ID_PROD`, `VITE_RUM_IDENTITY_POOL_ID_PROD`) and set `sessionSampleRate` from env (not hardcoded `1`). Without this, no performance KPI is measured in production (Gap 6).
7. **Sentry hardening** — set `release` (enables crash-free session rate) and resolve `sendDefaultPii` (Gap 7): default to `false`, or document the GDPR legal basis if kept.

## 4. Event Taxonomy

**Generic (Approach A — auto-emitted from generator / `contract-ui`):**

`window_opened` · `record_created` · `record_updated` · `record_deleted` · `document_completed` · `quick_action_used` · `search_performed` · `search_result_selected` · `time_to_create` (timing form-open → save)

**Specific (Approach B — catalog + hooks):**

- Onboarding (4-step business wizard, `OnboardingWizard.jsx`): `onboarding_step_completed` (with `step`, `supportRequested`), `onboarding_finished`, `onboarding_bank_configured`, `time_to_first_invoice`. **Distinct from** the existing IT/environment events in `OnboardingPage.jsx` (`onboarding_auth_*`, `onboarding_setup_step_*`, `onboarding_run_*`) — those are migrated into the catalog as-is under their own namespace, not renamed.
- Dashboard: `pending_tasks_interacted`
- Contacts: `contact_autocomplete_attempted`, `contact_autocomplete_succeeded`
- Purchasing: `ocr_invoice_uploaded`, `ocr_extraction_scored`, `email_invoice_ingested`
- Copilot: `copilot_session_started`, `copilot_task_resolved`, `copilot_correction_needed`, `copilot_nps`. **Smart Scan** (OCR via Copilot) reuses the OCR events with `source: 'copilot'` so the OCR-accuracy KPI is captured on both the Purchasing and Copilot paths.
- Sales: `invoice_emailed`, `quote_created` (timing)
- Backend (server-side, mirrored names, `backend_` prefix): `accounting_entry_generated`, `ocr_field_accuracy`, `bank_match_attempted`, `asset_created`, `email_invoice_ingested`, `monthly_close_started` / `monthly_close_completed`

## 5. Measurement Channels

The ~60 KPIs collapse into 7 channels:

| # | Channel | Mechanism |
|---|---|---|
| 1 | RUM (auto) | Web vitals / automatic timing |
| 2 | Sentry | Crash-free sessions |
| 3 | Mixpanel events/funnels/cohorts | `track()` + funnels + retention |
| 4 | Timing helper | `durationMs` events |
| 5 | NPS survey | `trackNps()` |
| 6 | Backend telemetry (Etendo Go) | Server-side events, same taxonomy |
| 7 | SQL validation jobs | Scheduled invariant queries, pass/fail |

## 6. Full KPI → Channel Mapping

Channels: **1** RUM · **2** Sentry · **3** Mixpanel · **4** Timing · **5** NPS · **6** Backend · **7** SQL job. `★` = Integrity-100% blocking KPI.

> **Threshold note (source-doc contradiction):** the source KPI tables and the §4 acceptance table disagree on some `★` KPIs (e.g. "% invoices with correct accounting entry" is `>98%` in §2.5 but a 100% blocking invariant in §4). For every `★` KPI the SQL job enforces **0 violations (100%)** per the acceptance table's blocking intent; the looser table threshold is treated as a soft warning band only. This must be confirmed with the doc owner before implementation.

### Dashboard
| KPI | Target | Channel |
|---|---|---|
| Dashboard load time | <2s | 1 |
| % users using quick actions in first 7d | >60% | 3 (`quick_action_used`) |
| % users interacting with Pending Tasks panel | >50% | 3 (`pending_tasks_interacted`) |
| % sessions navigating Dashboard → document | >30% | 3 (page funnel) |

### Sales
| KPI | Target | Channel |
|---|---|---|
| Avg time to create a quote | <3min | 4 (`quote_created`) |
| % invoices emailed from system | >70% | 3 (`invoice_emailed` / total) |
| ★ % collections correctly linked to invoice | 100% | 7 |

### Purchasing
| KPI | Target | Channel |
|---|---|---|
| % supplier invoices via OCR vs manual | >50% | 3 + 6 (`ocr_invoice_uploaded` vs manual `record_created`) |
| OCR field accuracy | >85% | 6 (`ocr_field_accuracy`) |
| Tokens used (FUTURE) | — | placeholder |
| % invoices via dedicated email | >30% / 60d | 6 (`email_invoice_ingested`) |
| Avg OCR invoice registration time | <1min | 4 |
| Avg manual invoice registration time | <5min | 4 |
| ★ % creditor invoices processed without critical data error | 100% | 7 |

### Inventory
| KPI | Target | Channel |
|---|---|---|
| Stock accuracy (system vs physical count) | >98% | 7 (+ count input) |
| ★ % stock movements with traceable origin | 100% | 7 |
| Avg inventory adjustment time | <5min | 4 |
| ★ % purchase receipts correctly updating stock | 100% | 7 |
| ★ % outbound delivery notes correctly reducing stock | 100% | 7 |

### Accounting and Finance
| KPI | Target | Channel |
|---|---|---|
| % accounting entries generated automatically | >90% | 6 (`accounting_entry_generated`) |
| Bank reconciliation auto-match rate | >70% | 6 (`bank_match_attempted`) |
| Avg monthly close time | <2h | 6 (backend start/stop events — not session-scoped timing) |
| ★ % invoices with correct accounting entry | 100% (see note) | 7 |
| % users accessing Accounting board ≥1/week | >60% | 3 (`window_opened` cohort) |
| Time to view aging reports | <3s | 1 |

### Contacts
| KPI | Target | Channel |
|---|---|---|
| Autocomplete success rate (name/CIF) | >80% | 3 (`contact_autocomplete_attempted` + `contact_autocomplete_succeeded`) |
| Avg time to create a contact | <2min | 4 (`time_to_create`) |
| % contacts with minimum data (email+phone+address) | >75% | 7 (data-quality) |
| % searches with correct result in top 3 | >90% | 3 (`search_result_selected` position) |
| ★ % contacts available in Sales & Purchasing | 100% | 7 |

### Products
| KPI | Target | Channel |
|---|---|---|
| Avg time to create a product | <2min | 4 |
| % products with photo at 30d | >40% | 7 (data-quality) |
| % catalog searches correct in top 3 | >95% | 3 |
| % products with sale & purchase price | >90% | 7 (data-quality) |
| ★ % products whose card stock = Inventory stock | 100% | 7 |

### Copilot AI
| KPI | Target | Channel |
|---|---|---|
| % users using Copilot in first 7d | >50% | 3 (`copilot_session_started` cohort) |
| % users using Copilot weekly in month 1 | >35% | 3 (retention) |
| Full task resolution rate via Copilot | >60% | 3 (`copilot_task_resolved`) |
| % conversations needing manual correction | <20% | 3 (`copilot_correction_needed`) |
| Copilot NPS | >40 | 5 |
| Agent response time for simple tasks | <5s | 4 |

### Configuration and Administration (Onboarding)
| KPI | Target | Channel |
|---|---|---|
| % users completing the 4-step wizard | >85% | 3 (funnel) |
| Time from signup to first invoice | <10min | 4 (`time_to_first_invoice`) |
| % wizard steps completed without external support | >90% | 3 (`onboarding_step_completed` with `supportRequested` flag) |
| % companies with a bank account at finish | >40% | 7 (authoritative DB state; Ch3 `onboarding_bank_configured` optional) |
| ★ % users with correctly assigned roles | >95% (100% critical) | 7 |
| System abandonment rate in first 3 days | <20% | 3 (retention cohort) |

### Fixed Assets
| KPI | Target | Channel |
|---|---|---|
| Avg time to create an asset (manual) | <3min | 4 |
| % assets created from purchase invoice | >40% | 6 (`asset_created` source) |
| % assets with complete card | >90% | 7 (data-quality) |
| ★ Monthly amortization entry generation rate | 100% | 7 |
| ★ % amortization installments correct (linear) | 100% | 7 |
| ★ % amortization entries linked to source asset | 100% | 7 |
| Avg time to process asset disposal | <5min | 4 |
| ★ % disposals with correct P&L entry | 100% | 7 |
| ★ % assets correct in amortization schedule | 100% | 7 |
| ★ % fully-amortized assets correct in report | 100% | 7 |

### Cross-cutting
| KPI | Target | Channel |
|---|---|---|
| Load time of any screen/report | <2s | 1 |
| % sessions without critical errors (500, data loss, inconsistent states) | >99.5% | 1 (RUM HTTP 5xx rate) + 2 (Sentry crash-free, needs `release`) |
| 30-day user retention | >70% | 3 (needs `identify`) |
| Overall product NPS | >35 | 5 |
| Abandonment in first 3 days | <20% | 3 |
| Write-operation response time (save/confirm) | <3s | 1 / 4 |
| Functionality coverage: 100% features have a success metric | 100% | meta-check (taxonomy) |

## 7. Backend & SQL Integrity Jobs

**Telemetry emitter** — `NeoTelemetryService` (CDI bean) invoked from `NeoHandler.afterHandle` hooks, pushing server-side events to Mixpanel via HTTP (same project, `backend_` prefix). No per-window logic in generic services — follows the repo's NeoHandler pattern. Covers what the frontend cannot assert: whether an entry was auto-generated, real OCR accuracy, bank-match outcome, asset source, email ingestion, monthly-close duration. The Mixpanel **project token lives in `AD_SysConfig`** (never hardcoded), read at runtime by the service.

**SQL validation jobs (Integrity 100%)** — a set of invariant queries, one per critical KPI, run as a scheduled Etendo Process (or cron). Each returns `{kpi, total, violations, pass}` and writes to an `ETGO_KPI_CHECK` table (timestamp + result). **Note:** this is not a trivial DDL — it requires full Etendo AD registration (`AD_TABLE`, `AD_COLUMN`, `AD_ELEMENT`, dbprefix, `export.database`), budgeted in Sprint 0. UUIDs via `make uuid`, never hand-typed. Each `★` job enforces 0 violations (see Section 6 threshold note). Examples:

- `stock_traceability` — movements without reference document → must be 0
- `stock_vs_inventory` — product-card stock ≠ inventory stock → must be 0
- `linked_amortization` — amortization entries without source asset → must be 0
- `roles_onboarding` — post-onboarding users without correct role → must be 0

`ETGO_KPI_CHECK` feeds the monthly consolidated report's green/red status.

## 8. Consumption

- **Mixpanel** — Adoption / UX / Business: funnels, retention, cohorts, numeric-property charts.
- **CloudWatch RUM** — Performance: load times, web vitals (mostly automatic + a few custom report timings).
- **Sentry** — Stability: crash-free session rate.
- **Monthly consolidated report** — a script that pulls from the three tools + `ETGO_KPI_CHECK` and produces a green/red vs-threshold table for month-1 and month-2 close (Phase 3 of the source doc). No new in-app UI.

## 9. Work Plan (Phasing)

Quick wins + foundations first, then aligned to the document's 3 phases.

- **Sprint 0 — Foundations + Quick wins (parallel)**
  - *Config prerequisites (must land first):* add RUM **production** host config + env-driven `sessionSampleRate` (Gap 6); set Sentry `release` and resolve `sendDefaultPii` (Gap 7); register `ETGO_KPI_CHECK` in AD + store backend Mixpanel token in `AD_SysConfig`.
  - *Quick wins:* validate RUM + Sentry dashboards; wire `identify()` on login (opaque id); validate route taxonomy; migrate existing `OnboardingPage.jsx` events into the catalog.
  - *Foundations:* extend `payload.js` (numeric keys); timing helper + `useTiming`; NPS component (with i18n keys); `events.js` catalog + backend name-sync CI lint; generator auto-instrumentation scaffolding (pass spec name explicitly as a property — do not rely on route derivation).
- **Phase 1 — Alpha (Integrity + Performance)**
  - Roll generic auto-instrumentation to all 10 windows (channel A).
  - SQL integrity jobs + `ETGO_KPI_CHECK` table.
  - Validate all Performance KPIs via RUM.
- **Phase 2 — Beta (Adoption + UX, real users)**
  - Module-specific instrumentation (Purchasing OCR, Onboarding funnel, Copilot, quick actions, searches).
  - Copilot NPS. Mixpanel funnels and cohorts.
- **Phase 3 — Post-launch (Business)**
  - 30-day retention, 3-day abandonment, overall NPS.
  - Monthly consolidated report script (KPIs vs threshold, green/red) for month-1 and month-2 close.
  - Threshold review.

## 10. Testing

- **Frontend:** Vitest with mocked `track()` (existing `observability.test.js` pattern) — assert each flow emits the correct event with valid props. Contract test over the `events.js` catalog. Playwright E2E capturing `track` calls via a mocked provider.
- **Backend:** JUnit for `NeoTelemetryService`; OBBaseTest for SQL jobs (fixtures with/without violations).

## 11. Risks & Mitigations

- **PII (existing + new)** — beyond new event props, the existing `sendDefaultPii: true` in `sentry.js` already ships IP/cookies/headers and must be resolved (Gap 7). New numeric props and `identify()` must respect the denylist; opaque/hashed user id; mandatory review of every new event's props.
- **Volume/cost (Sprint 0 decision, not deferred)** — `rum.js` hardcodes `sessionSampleRate: 1` (100% of sessions) with no env guard; shipping that to production is a per-session cost time-bomb. Must be env-driven before any prod rollout. Same for Mixpanel event volume.
- **Generated-files policy** — auto-instrumentation lives in generator/`contract-ui`, never patched into `generated/`. The generator must pass the spec name explicitly into the event payload; route-derived `windowName` can be empty if `window_opened` fires before navigation settles.
- **SQL job performance** on large datasets — indexes + nightly execution window.
- **Frontend↔backend name drift** — `events.js` is not importable by Java; the CI lint check is the only guard against silent divergence of mirrored constants.
- **Out of scope / placeholders** — "tokens used (FUTURE)" stays a placeholder. "Inconsistent states" within the crash-free KPI is acknowledged but not operationally instrumented this iteration (would require a state-invariant definition); covered partially by the SQL integrity jobs.

## 12. Out of Scope

- New in-app KPI dashboard UI (consumption is via existing tools + report script).
- Second-iteration modules and KPIs.
- Token-cost KPI (marked FUTURE in the source).
