# Task 04 — Build Generic `LogoutRoute`

## Objective

Provide a reusable public logout route component without onboarding-step or product knowledge.

## Repository

`schema_forge_core/packages/app-shell-core`

## RED

Cover:

- No active session.
- Platform-only session.
- Full environment session.
- Repeated effects remain idempotent.
- Navigation uses replacement.
- External, protocol-relative, malformed, `/logout`, and recursive onboarding destinations are rejected.
- The safe configured destination is used after cleanup.

## GREEN

- Implement and publicly export `LogoutRoute`.
- Accept a cleanup authority and safe destination as inputs.
- Reuse `createLocalAuthStorage().clear()` for environment and platform keys.
- Keep all concrete onboarding and product routing knowledge outside `app-shell-core`.

## Acceptance criteria

- The component can be consumed through the published package API.
- Cleanup is safe without a session and idempotent.
- Unsafe destinations cannot create loops or open redirects.

## Verification

```bash
cd ../schema_forge_core
npm test --workspace=packages/app-shell-core
npm run test:consumer --workspace=packages/app-shell-core
```
