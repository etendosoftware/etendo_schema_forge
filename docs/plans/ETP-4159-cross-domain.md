# ETP-4159 Cross-Domain Plan: App Shell SSO Boundary

## Domains

- `app-shell-core`: locale translations for Google SSO buttons and verification messages in `packages/app-shell-core/src/locales/en_US.json` and `packages/app-shell-core/src/locales/es_ES.json`.
- `generator-change`: test suite fixes in `cli/test/validate-field-names.test.js` and `cli/test/wiring-completeness.test.js` to eliminate a race condition in parallel test executions (by ignoring hidden/transient test directories starting with a dot).
- `platform-change`: SSO frontend login routing, verification boundary, and callback integration on the onboarding page under `tools/app-shell`.
- `repo-infra`: staging workflow, architecture guide updates (`docs/architecture/07-auth-and-security.md`), and automated pre-push test hooks.

## Why This Cannot Be Split Cleanly

This feature introduces Google SSO login into the App Shell onboarding flow. Implementing it requires changes on the frontend application (`platform-change`), translations for SSO elements in the core shell (`app-shell-core`), updating the auth documentation (`repo-infra`), and fixing a parallel test execution collision in the monorepo's test suites (`generator-change`). Splitting this into multiple PRs would cause partial commits to be broken, as the onboarding page depends on the translations and verification scripts to compile and pass tests.

## Review Order

1. Frontend SSO boundary — `OnboardingPage.jsx` and onboarding SSO scripts: verify integration with Google SSO login callback.
2. Locale translations — `en_US.json` and `es_ES.json`: confirm keys match the onboarding page.
3. Test fixes — `validate-field-names.test.js` and `wiring-completeness.test.js`: verify that test directory filtering resolves parallel test run race conditions.
4. Review this plan.

## Tests

- `make test` / CLI test suite: 14013/14013 passing.
- `onboardingSso.test.js` and `onboardingApi.test.js` unit tests passing.
- GHA checks verify compilation.

## Rollback

Reverting is a standard git revert of the merge commit. All changes are backward compatible, so no data migration or schema re-generation is needed.
