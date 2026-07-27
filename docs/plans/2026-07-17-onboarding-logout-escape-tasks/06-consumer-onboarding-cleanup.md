# Task 06 — Migrate Consumer Onboarding Authority

## Objective

Remove duplicate consumer wrappers and relocate package-owned tests to `etendo-go-core` while preserving product-owned integration coverage.

## Repositories

Both repositories.

## Work

- Migrate imports to the public `@etendosoftware/etendo-go-core/onboarding/*` entry points.
- Update `ChangePasswordDialog.jsx` and its mocks.
- Delete `onboardingApi.js`, `onboardingState.js`, `onboardingSso.js`, and `passwordPolicy.js` from the consumer.
- Move authoritative API, state, SSO, password-policy, draft, and lifecycle tests to Core.
- Retain product composition, translations, observability, readiness, backdrop, routing, package smoke, and browser tests in Schema Forge.
- Add a static gate preventing the retired files and import paths from returning.

## Acceptance criteria

- No production or test import references a retired wrapper.
- The four wrapper files do not exist.
- Core-owned behavior runs against Core source.
- Product-owned behavior remains in Schema Forge.
- A representative import smoke passes with `LOCAL_CORE=1`.

## Verification

```bash
rg -n "onboardingApi|onboardingState|onboardingSso|passwordPolicy" tools/app-shell/src
cd ../schema_forge_core
npm test --workspace=packages/etendo-go-core
cd ../schema-forge/tools/app-shell
LOCAL_CORE=1 npm run test:vitest
```

The `rg` command must return no retired-path import; unrelated symbol or translation matches must be reviewed explicitly.
