# Task 03 — Add Authenticated Session Actions

## Objective

Expose a localized, accessible Log out action on every onboarding state that retains a platform-account session.

## Repositories

- Core component and behavior: `schema_forge_core/packages/etendo-go-core`
- Product translations: `schema-forge/tools/app-shell`

## RED

Prove that the action:

- Appears in Profile, Company, environment selection, provisioning, and retained-session error states.
- Depends on the platform token, not `accountName`.
- Remains usable when the account name is unavailable.
- Is keyboard accessible.
- Remains visible and non-overlapping on narrow viewports.

## GREEN

- Create a shared session-action component in Core.
- Wire Profile and Company through `SetupShell.headerContent`.
- Reuse the central `onLogout` callback everywhere.
- Add product-neutral UI keys in Core usage.
- Add `en_US`, `es_ES`, and `es_AR` values in Schema Forge, including the failed-draft warning.
- If any provisioning state cannot safely exit, document and test the exact exception before completion.

## Acceptance criteria

- Every authenticated onboarding state has an escape path or an explicitly approved safety exception.
- Missing account data never hides the action.
- Accessibility and responsive assertions pass.

## Verification

```bash
cd ../schema_forge_core
npm test --workspace=packages/etendo-go-core
cd ../schema-forge/tools/app-shell
LOCAL_CORE=1 npm run test:vitest
```
