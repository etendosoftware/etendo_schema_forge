# Task 01 — Centralize Onboarding Logout

## Objective

Make `OnboardingFlow` the single owner of authenticated onboarding logout.

## Repository

`schema_forge_core/packages/etendo-go-core`

## RED

Add tests proving:

- Profile, Company, environment selection, and other authenticated steps receive one `onLogout` callback.
- Repeated clicks execute one in-flight operation.
- Cleanup emits exactly one success or failure telemetry event.
- Logout never deletes the server-side onboarding draft.
- No concrete step owns a duplicate logout implementation.

Commit the failing tests before implementation.

## GREEN

- Add guarded `onLogout` orchestration to `OnboardingFlow`.
- Call the `app-shell-core/auth/session.js` cleanup authority once.
- Reset in-memory token and account state.
- navigate to Login through the central flow.
- Remove `EnvSelectStep.handleLogout`; consume the callback instead.
- Do not repeat direct platform-key removal.

## Acceptance criteria

- One operation owns logout across authenticated steps.
- Platform and environment credentials are cleared idempotently.
- Login is reached without deleting the draft.
- Existing environment-selection behavior does not regress.

## Verification

```bash
cd ../schema_forge_core
npm test --workspace=packages/etendo-go-core
npm test --workspace=packages/app-shell-core
```
