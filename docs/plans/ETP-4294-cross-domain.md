# ETP-4294 Cross-Domain Plan — Onboarding data-loading phase in progress UI

## Purpose
Surface the dataset import ("data-loading") phase in the onboarding progress UI so the
user sees an explicit step while the slow Openbravo dataset import runs, instead of the
progress bar appearing stuck. This pairs with the keepalive heartbeat work landed on the
runtime side (`com.etendoerp.go`, same ticket).

## Domains Touched

| Domain | Files | Justification |
|--------|-------|---------------|
| platform-change | `tools/app-shell/src/pages/OnboardingPage.jsx`, `tools/app-shell/src/pages/onboarding/onboardingState.js`, `tools/app-shell/src/pages/onboarding/__tests__/onboardingState.test.js`, `tools/app-shell/src/pages/__tests__/OnboardingPage.vitest.jsx` | Add the `dataset` step to `SETUP_STEP_DEFINITIONS` and render its phase/description in the onboarding page; tests updated to assert the new step. |
| app-shell-core | `packages/app-shell-core/src/locales/en_US.json`, `packages/app-shell-core/src/locales/es_ES.json` | i18n keys for the new data-loading phase label/description, added to both locales (Spanish is the primary client locale). |

## Risk Assessment
- Onboarding-only change; no other windows or pipeline tooling affected.
- No generated files, no `decisions.json`/`contract.json`, no DB schema changes.
- i18n keys added to both `en_US` and `es_ES` — no missing-translation risk.
- Frontend-only; backend contract unchanged (the `dataset` progress event already exists).

## Test Plan
- `make test` — app-shell node tests (incl. `onboardingState.test.js`) pass.
- Vitest — `OnboardingPage.vitest.jsx` passes (mock step list includes `dataset`).
- Playwright onboarding flow unaffected (no test changes required).

## Rollback
Revert commit `Feature ETP-4294: Show data-loading phase in onboarding progress UI`.
Removing the `dataset` step from `SETUP_STEP_DEFINITIONS` and the two locale keys
restores the prior progress UI with no other impact.
