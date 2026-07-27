# Plan ETP-4584 — Onboarding Logout Escape Path

- **Jira:** ETP-4584
- **Epic base:** ETP-3504 (`epic/ETP-3504` in both repos)
- **Date:** 2026-07-17
- **Methodology:** TDD (RED → GREEN → REFACTOR), with at least one commit containing failing tests per cycle
- **Status:** Proposed (not started)
- **Task breakdown:** [`2026-07-17-onboarding-logout-escape-tasks/README.md`](2026-07-17-onboarding-logout-escape-tasks/README.md)

## 1. Problem

After account registration, authenticated users entering the Profile or Company onboarding steps have no visible way to leave the wizard or end their session. Any attempted navigation to a protected route is redirected back to onboarding. `/logout` is not registered as a public route, so it is interpreted as the protected `:windowName` route and redirected to `/onboarding?returnTo=/logout`.

This is an escape-path failure: a user who does not complete onboarding in the same session can become trapped without a user-facing recovery mechanism. **Impact: High / Priority: Major** — it blocks an entire authenticated user journey with no product workaround.

## 2. Diagnosis confirmed in code

- **`OnboardingFlow.jsx`** (`etendo-go-core`): owns token, step, `stepData` and server draft — but exposes no centralized `onLogout`.
- **`EnvSelectStep.jsx`**: has its own local `handleLogout` (the only screen with an escape action); `ProfileStep`/`CompanyStep` receive no session action.
- **`runtime-routes.jsx`** (consumer): no public `/logout` route → falls into protected `:windowName` → `UnauthenticatedRedirect` sends to `/onboarding?returnTo=/logout`.
- **Autosave guard** (`OnboardingFlow.jsx` lines 175-179): `hasUserContent` only checks Company fields (`clientName`, `fiscalIdValue`, `address`) — Profile-only edits may never persist.
- Consumer depends on published `@etendosoftware/etendo-go-core@0.3.10`; the 4 re-export wrappers exist and consumer-hosted suites must move to core.

## 3. Ownership

| Repo / package | Owns |
|---|---|
| `schema_forge_core/packages/etendo-go-core` | Central onboarding logout orchestration, authenticated session actions, draft flush before logout/step transitions, draft restore/resume, generic onboarding lifecycle tests |
| `schema_forge_core/packages/app-shell-core` | Reusable auth/session primitives and a generic public `LogoutRoute` component (no knowledge of concrete onboarding steps). The existing auth-storage clear operation remains the authority for removing environment/platform session keys |
| `schema-forge/tools/app-shell` | `/logout` public route registration, product configuration, translations, branding, consumption of the published core version, product-level routing and Playwright coverage. Must NOT duplicate logout orchestration inside `OnboardingPage.jsx` |

## 4. Branches

| Repo | Branch | Base | PR target |
|---|---|---|---|
| `schema_forge_core` | `feature/ETP-4584` | `epic/ETP-3504` | `epic/ETP-3504` |
| `schema-forge` | `feature/ETP-4584` | `epic/ETP-3504` | `epic/ETP-3504` |

Never open PRs to `main`. Both branches are created before any code is written.

Before branching, inspect and preserve the existing uncommitted work in both repositories. Do not mix pre-existing files into ETP-4584 commits.

## 5. Execution order and dependencies

```
CORE (schema_forge_core)                    CONSUMER (schema-forge)
─────────────────────────────────────────   ─────────────────────────────────
Cycle 1 RED→GREEN (central logout)
Cycle 2 RED→GREEN (draft flush/resume)
Cycle 3 RED→GREEN (always-visible action)
Cycle 4A RED→GREEN (generic LogoutRoute)
                    local source  ──────►   Cycle 4B RED→GREEN (route registration)
                    via LOCAL_CORE=1
                                            Cycle 5 (Playwright journeys)
                                            Wrapper cleanup + quality gate
Core + consumer local-core gates
publish preview packages in lockstep ───► pin preview + published-mode gates
```

Development and functional validation do **not** depend on publishing Core. The consumer runs directly against the sibling Core source with `LOCAL_CORE=1`; for browser journeys use `make dev-local-core`. Unit and integration tests use the same environment flag from `tools/app-shell`.

Publishing is a final compatibility gate, not a development prerequisite. After all Core and consumer behavior is green in local-core mode, publish the feature-branch preview packages, pin that exact preview in Schema Forge, reinstall, and repeat the published-package smoke, routing, and build gates. Stable `0.4.0` is produced later by the Core release workflow; merging a feature PR into `epic/ETP-3504` must not be described as producing a stable release.

## 6. TDD cycles → commits

Team rule: **Tester** (test-generator) writes the RED tests; **Developer** implements GREEN. One RED commit (failing tests) plus one or more GREEN commits per cycle. Commit convention: `Feature ETP-4584: ...` (≤80 chars first line, no `Co-Authored-By`). RED commits break CI on their intermediate commit — acceptable; the final branch state must be green.

### Cycle 1 — Central logout contract (core: `etendo-go-core`)
- **RED** (Tester, core): tests proving Profile and Company receive a single `onLogout` callback; no logout duplicated in concrete steps; N clicks execute one operation (in-flight guard); exactly one telemetry event (success/failure); the server-side draft is NOT deleted.
- **GREEN** (Developer): `onLogout` in `OnboardingFlow`: `logoutInFlightRef`, draft flush (stub until cycle 2), one call to the `app-shell-core/auth/session.js` cleanup authority (which clears both environment and platform session keys), in-memory state reset, `goToStep('login')`, single telemetry event. Do not duplicate direct `localStorage` key removal.
- **REFACTOR**: remove the local `handleLogout` from `EnvSelectStep`; it consumes the central one.

### Cycle 2 — Draft flush and resume (core)
- **RED**: editing only Profile fields creates a draft; logout flushes a changed draft before clearing the token; step navigation flushes pending changes; login restores the last persisted step and form data; a failed final save still allows logout + localized warning + failure event; defaults produce no writes before user interaction.
- **GREEN**: generic `persistable` policy declared in step definitions (Profile + Company), serialized diff against step defaults, flush on transition and on logout.
- **REFACTOR**: delete the field-name-specific `hasUserContent` check (`OnboardingFlow.jsx` lines 175-179).

### Cycle 3 — Always-visible session action (core + consumer translations)
- **RED**: Profile and Company render "Log out" when authenticated; still visible when `accountName` is missing; keyboard accessible; narrow viewport does not hide/overlap it.
- **GREEN (core)**: shared session-action component wired through `SetupShell.headerContent`; visibility tied to session state (token), not `accountName`. Core references product-neutral `useUI` keys only.
- **GREEN (consumer)**: provide the Log out and failed-draft warning translations in `en_US`, `es_ES`, and `es_AR`.
- **Provisioning decision**: `SetupProgressStep` and retained-session error states render the same action. Any unsafe exception must be decided, justified, documented, and tested before this cycle is GREEN; it cannot remain a follow-up evaluation.

### Cycle 4A — Generic public logout component (`app-shell-core`)
- **RED (core)**: `LogoutRoute` invokes one idempotent cleanup operation, works without a session, rejects recursive/external/protocol-relative/malformed destinations, and navigates with replacement to the configured safe destination.
- **GREEN (core)**: generic `LogoutRoute` with no onboarding-step knowledge. It receives the cleanup authority and safe destination. The existing `createLocalAuthStorage().clear()` remains the single authority for clearing environment and platform session keys; do not repeat direct key removal in the consumer.

### Cycle 4B — Public `/logout` route registration (consumer)
- **RED (descriptor)**: `runtime-routes.vitest.js` proves `/logout` is explicit and public, precedes `:windowName`, `/dashboard` remains protected, and the route never resolves as a window.
- **RED (runtime integration)**: `runtime-routes-integration.vitest.jsx` renders the real `AppShellRuntime` and proves `/logout` bypasses `AuthGate`, clears platform-only and full sessions, is safe with no session, replaces to `/onboarding`, never produces `/onboarding?returnTo=/logout`, and keeps `/dashboard` protected.
- **GREEN**: register the Core `LogoutRoute` in `runtime-routes.jsx` before `:windowName`, with `public: true`. Zero concrete `logout` exceptions inside the `AppShellRuntime` auth guard.

### Cycle 5 — Browser journey (consumer, Playwright — Tester)
- Register → Profile → edit Profile → Log out → Login visible → re-login → Profile restored with persisted data.
- Direct navigation to `/logout` from Profile; logout during Company.
- Mandatory references: `docs/e2e-testing-guide.md` and `e2e/tests/flows/row-quick-actions.mocked.spec.js` as the canonical mocked-spec pattern.

## 7. Legacy consumer cleanup (after local-core behavior is green)

1. Migrate imports to `@etendosoftware/etendo-go-core/onboarding/{api,state,sso,password-policy}` (at minimum `ChangePasswordDialog.jsx`).
2. Delete the 4 wrappers: `onboardingApi.js`, `onboardingState.js`, `onboardingSso.js`, `passwordPolicy.js`.
3. Move authoritative suites to `schema_forge_core/packages/etendo-go-core/test/`: API/error normalization, state helpers, SSO, password policy, draft persistence/restoration, lifecycle/session transitions (including the core-behavior portions of `onboardingHelpers.vitest.js` and `OnboardingPage.vitest.jsx`).
4. Consumer retains only: package-export smoke, ES_CONFIG product composition, routing, translations/branding, readiness, backdrop, Playwright journeys.
5. **Quality gate**: static test that fails if any import references the 4 retired paths and proves the wrappers no longer exist. Run representative import smoke twice: first against local Core source, then against the pinned preview package during the final compatibility gate.
6. **Remain in consumer (not moved)**: `OnboardingPage.jsx`, `onboardingReadiness.js`, `OnboardingDashboardBackdrop.jsx` and their tests.

## 8. Publishing and compatibility

- Additive public-API changes (`onLogout` in the step contract, `LogoutRoute`) justify the next **minor** line (`0.4.0`). Core packages are released in lockstep: `schema-forge-core`, `app-shell-core`, `schema-forge-agent-context`, `schema-forge-stack`, `etendo-go-core`, and the CLI.
- To request the stable minor floor, change only `schema_forge_core/packages/schema-forge-core/package.json` according to `scripts/release-version.mjs`; do not independently version only the two changed packages.
- Feature-branch pushes publish a lockstep preview under the `alpha` tag. Use the exact version reported by the preview workflow and run `make bump-core-version VERSION=<preview-version>` in Schema Forge for the published-package compatibility gate.
- Evidence: preview version, lockstep compatibility decision, local-core results, published-preview results, and stable release intent recorded in the PR. Stable `0.4.0` remains pending until the Core release workflow runs from its release branch policy.

## 9. Pipeline and agents

| Phase | Who | What |
|---|---|---|
| DEV | Tester role + Core developer + consumer developer | Cycles 1–5, cleanup |
| REVIEW | Reviewer role | Rejects if: behavior change without docs, wrapper not deleted, AuthGate exception, missing RED commits in history |
| QA | QA automation role | Core + consumer suites, both modes, edge cases (401/409/429/5xx on save, expired token, double click, immediate logout before debounce) |
| DOCS | Documentation role | Public onboarding/session documentation in the same delivery (mandatory freshness policy) |
| Human QA | Matías Bernal / Emilio Polliotti | Validation recorded in Jira |

## 10. Evidence to attach (Jira/PR)

- Branch + initial RED commit per cycle (failing tests) and GREEN commits.
- Command and passing result for migrated core suites; consumer tests after reduction.
- Quality-gate test demonstrating a forbidden local import fails.
- Playwright evidence; green build + Vitest in local-core and published-preview modes.
- Search output proving no imports reference the 4 retired wrappers; explicit list of tests moved/retained/removed with justification.

## 11. Scoped risks

- **Publishing is not a development blocker**: develop, clean up wrappers, and run browser tests with `LOCAL_CORE=1`; publishing is required only for the final package-compatibility gate.
- **Logout during provisioning**: `SetupProgressStep` retains an authenticated session — resolve its escape behavior in Cycle 3; any exception must be explicitly justified, documented, and tested.
- **Expired token during logout**: must resolve to Login, not a redirect loop — covered by a cycle-4 test.

## 12. Required edge cases (checklist)

Account name unavailable · platform token expired during logout · draft save returns 401/409/429/5xx · repeated Log out clicks · field change + immediate logout before debounce · direct navigation to `/logout` · `/logout?returnTo=/logout` · external or protocol-relative `returnTo` · no active session · platform-only session · full environment session · Profile draft and Company draft · narrow viewport and keyboard-only navigation.

## 13. Definition of done

The issue is complete only when: the core package provides the reusable session/draft behavior, Schema Forge consumes the published version, `/logout` is public, logout and resume pass browser-level verification, delivery evidence is attached to Jira or the PR, and QA validation is recorded.

A Profile-only button, direct `localStorage` manipulation in the consumer, an AuthGate path exception, or a logout that can discard pending Profile changes does **not** satisfy this task.

## 14. Exact verification commands

Run from the confirmed repository indicated for each block and record the command, exit status, and relevant result in the PR.

### Core repository — local source

```bash
cd ../schema_forge_core
npm test --workspace=packages/etendo-go-core
npm test --workspace=packages/app-shell-core
npm run test:consumer --workspace=packages/app-shell-core
```

### Schema Forge consumer — local-core mode

```bash
cd tools/app-shell
LOCAL_CORE=1 npm run test:vitest -- src/__tests__/runtime-routes.vitest.js src/__tests__/runtime-routes-integration.vitest.jsx
LOCAL_CORE=1 npm run test:vitest
LOCAL_CORE=1 npm run build
```

Serve browser verification from the Schema Forge repository root with:

```bash
make dev-local-core
```

Run the focused Playwright onboarding/logout specification and record its result:

```bash
cd e2e
npx playwright test tests/flows/onboarding-logout-resume.mocked.spec.js
```

### Schema Forge consumer — published-preview mode

After the Core feature workflow reports the exact preview version:

```bash
make bump-core-version VERSION=<preview-version>
cd tools/app-shell
npm run test:vitest -- src/__tests__/runtime-routes.vitest.js src/__tests__/runtime-routes-integration.vitest.jsx
npm run test:vitest
npm run build
```

The published-preview pin and regenerated lockfiles are intentional ETP-4584 delivery changes. Review them before committing. QA validation remains pending until recorded by Matías Bernal or Emilio Polliotti.
