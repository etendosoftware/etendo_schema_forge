# ETP-4584 Delivery Evidence

## Delivery repositories

| Repository | Root | Branch | Target base |
|---|---|---|---|
| Schema Forge | `/Users/sebastianbarrozo/Documents/work/epic/schema-forge` | `feature/ETP-4584` | `epic/ETP-3504` |
| Schema Forge Core | `/Users/sebastianbarrozo/Documents/work/epic/schema_forge_core` | `feature/ETP-4584` | `epic/ETP-3504` |

The delivery intentionally spans both repositories. All local Node commands use NVM `22.19.0`.

## Changed-file scope

- Core owns central onboarding logout, draft persistence, session actions, the generic `LogoutRoute`, and the Core-owned onboarding API/state/SSO/password-policy tests.
- Schema Forge owns product translations, `/logout` registration, product route integration, browser journeys, removal of retired onboarding wrappers, the ownership boundary gate, and functional documentation.
- Pre-existing unrelated worktree changes are excluded: Schema Forge `package-lock.json` and `docs/reports/contacts-test-report.md`; Core `cli/src/slice-labels-cli.js`, `package-lock.json`, `.system-lab/`, and subscription-planning documents.

## Tests moved, retained, and removed

| Disposition | Evidence |
|---|---|
| Moved to Core | `packages/etendo-go-core/test/onboardingOwnership.test.js` covers the API, state, SSO, password-policy, draft, and stream contracts against Core source. |
| Retained in Schema Forge | `OnboardingPage.vitest.jsx`, runtime route tests, locale tests, observability/readiness/backdrop coverage, and `e2e/tests/flows/onboarding-logout-resume.mocked.spec.js` cover consumer composition and browser behavior. |
| Removed from Schema Forge | Retired wrapper modules and their duplicate Core-owned API/state/SSO/password-policy tests were deleted because the implementation is published by `@etendosoftware/etendo-go-core/onboarding/*`. |

## Executed local gates

| Repository | Command | Result |
|---|---|---|
| Core | `npm test --workspace=packages/etendo-go-core` | Passed: 98 tests. |
| Core | `npm test --workspace=packages/app-shell-core` | Passed: 384 tests. |
| Core | `npm run test:consumer --workspace=packages/app-shell-core` | Passed: packed-consumer Vite build. |
| Schema Forge | `LOCAL_CORE=1 npm run test:vitest -- src/__tests__/runtime-routes.vitest.js src/__tests__/runtime-routes-integration.vitest.jsx` | Passed: 18 tests. |
| Schema Forge | `LOCAL_CORE=1 npm run build` | Passed. |
| Schema Forge E2E | `make dev-local-core` and `npx playwright test tests/flows/onboarding-logout-resume.mocked.spec.js` | Passed: 6 journeys. |
| Schema Forge | `node --test src/lib/__tests__/onboardingCoreBoundary.test.js` | Passed: 2 tests. |

The full `LOCAL_CORE=1 npm run test:vitest` gate is currently blocked by unrelated pre-existing failures, including `ReferenceError: ui is not defined` in `tools/app-shell/src/pages/ReportViewerPage.jsx:999`. The ETP-4584 focused suites pass.

## Retired-wrapper search evidence

The ownership boundary gate verifies that the four retired files do not exist and rejects imports of `onboardingApi`, `onboardingState`, `onboardingSso`, or `passwordPolicy`. A repository search after the migration finds only unrelated symbols/i18n references and the gate itself; no retired-wrapper import remains.

## Preview compatibility decision

Core preview `0.3.12-preview.feature-ETP-4584.20260717180344.c7c03a7` was published successfully from `feature/ETP-4584` by the lockstep preview workflow. Schema Forge is pinned to that exact preview. Without `LOCAL_CORE`, the published-package route suite passed (18 tests) and the production build passed. The full consumer Vitest gate remains blocked by pre-existing unrelated failures, including `ReportViewerPage.jsx:999` (`ui is not defined`) and existing `OnboardingPage.vitest.jsx` failures. The preview artifact is not a stable release.

## QA

Pending validation by QA: Matías Bernal / Emilio Polliotti.
