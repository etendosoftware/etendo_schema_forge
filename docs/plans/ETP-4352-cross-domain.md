# ETP-4352 Cross-Domain Plan — NPS & CSAT In-App Surveys Phase 1

## Purpose

Adds an in-app survey engine (NPS loyalty + 3 CSAT surveys) that runs entirely
in the frontend. Triggers are detected from existing observability call-sites
(onboarding completion, record creation) and state is kept in localStorage.
The feature touches `tools/app-shell` for the engine/UI, `packages/app-shell-core`
for session read access and i18n keys, and the observability event catalog.

## Domains Touched

| Domain | Files | Justification |
|--------|-------|---------------|
| platform-change | `tools/app-shell/src/lib/surveys/survey-state.js` | New: localStorage state management |
| platform-change | `tools/app-shell/src/lib/surveys/survey-engine.js` | New: anti-fatigue + trigger selection |
| platform-change | `tools/app-shell/src/lib/surveys/surveys.js` | New: survey definitions (4 surveys) |
| platform-change | `tools/app-shell/src/components/survey/SurveyModal.jsx` | New: modal UI matching Etendo design |
| platform-change | `tools/app-shell/src/hooks/useSurveyEngine.js` | New: React hook wiring engine to UI |
| platform-change | `tools/app-shell/src/App.jsx` | Mount SurveyManager inside AuthProvider |
| platform-change | `tools/app-shell/src/pages/OnboardingPage.jsx` | Call markOnboardingCompleted() on run success |
| platform-change | `tools/app-shell/src/hooks/useEntity.js` | Increment invoice/PO counters on record created |
| platform-change | `tools/app-shell/src/lib/observability/events.js` | Add SURVEY_SHOWN, SURVEY_RESPONDED, SURVEY_DISMISSED events |
| app-shell-core | `packages/app-shell-core/src/locales/en_US.json` | 36 survey i18n keys added to genericLabels |
| app-shell-core | `packages/app-shell-core/src/locales/es_ES.json` | 36 survey i18n keys added to genericLabels (Spanish primary) |

## Anti-Fatigue Rules Implemented

- Global cooldown: 30 days after any survey shown
- Monthly cap: max 2 surveys per calendar month
- Dismissal cooldown: 21 days per survey after dismissed
- NPS: first shown after 60 days from first login, recurring every 90 days
- CSAT Invoicing/PO: cooldown of 90 days after responding, recurring every 30 documents

## Risk Assessment

- No DB schema changes, no backend changes.
- localStorage key `sf_survey_v1` is new — no conflict with existing `sf_auth_*` keys.
- `markOnboardingCompleted()` called unconditionally on run success — idempotent.
- `incrementSurveyCounter()` called only on `isNew` path in useEntity — no regression on saves.
- Observability events added to catalog only; no existing event modified.
- i18n keys added; no existing key touched.
- `SurveyManager` renders inside `AuthProvider` — can read session safely.
- Modal uses `position: fixed; z-index: 9999` — no layout impact, no Tailwind conflict.
- Phase 1 scope: no Intercom integration, no backend persistence, no inactive-user blackout.

## Test Plan

- Unit tests (Vitest): `tools/app-shell/src/lib/surveys/__tests__/survey-state.vitest.js` — 15 tests covering all state mutations.
- Unit tests (Vitest): `tools/app-shell/src/lib/surveys/__tests__/survey-engine.vitest.js` — 14 tests covering cooldown, limits, and survey selection.
- Existing tests: `make test` passes with no regressions.
- Manual: open the app, set `sf_survey_v1` in localStorage to trigger conditions, verify modal renders.

## Rollback

Revert commit `Feature ETP-4352: Add NPS/CSAT survey engine Phase 1`.
Remove the 4 new files under `tools/app-shell/src/lib/surveys/` and `tools/app-shell/src/components/survey/`,
and the 3 small additions in App.jsx, OnboardingPage.jsx, useEntity.js, and events.js.
Remove the 36 survey keys from both locale files.
The `sf_survey_v1` localStorage key is inert after rollback — no user-visible impact.
