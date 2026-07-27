# Task 07 — Add Browser Logout and Resume Journeys

## Objective

Prove the complete user journey against local Core source in a real browser.

## Repository

`schema-forge/e2e`

## Test file

`e2e/tests/flows/onboarding-logout-resume.mocked.spec.js`

## Journeys

1. Register → Profile → edit Profile → Log out → Login → sign in → restored Profile and values.
2. Direct navigation to `/logout` from Profile.
3. Logout during Company with pending edits.
4. Logout during provisioning or its explicitly approved exception.
5. Failed final draft save shows a localized warning but reaches Login.
6. Repeated clicks produce one cleanup operation.
7. Keyboard-only and narrow-viewport logout.

Use `docs/e2e-testing-guide.md` and `row-quick-actions.mocked.spec.js` as the mocked-route pattern.

## Acceptance criteria

- The happy path and required failure paths pass against `make dev-local-core`.
- Requests prove draft persistence occurs before credential cleanup.
- The browser never enters a logout/onboarding redirect loop.

## Verification

Terminal 1, from the repository root:

```bash
make dev-local-core
```

Terminal 2:

```bash
cd e2e
npx playwright test tests/flows/onboarding-logout-resume.mocked.spec.js
```
