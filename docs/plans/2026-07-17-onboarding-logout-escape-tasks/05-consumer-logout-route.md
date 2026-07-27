# Task 05 — Register and Integrate `/logout`

## Objective

Register `/logout` as an explicit public Schema Forge route and prove it bypasses the real authentication guard.

## Repository

`schema-forge/tools/app-shell`

## RED

Extend both suites:

- `runtime-routes.vitest.js`: route exists, is public, precedes `:windowName`, and `/dashboard` remains protected.
- `runtime-routes-integration.vitest.jsx`: real `AppShellRuntime` processes `/logout` without `AuthGate` interception, clears all session shapes, replaces to `/onboarding`, and never produces `/onboarding?returnTo=/logout`.

Include no-session, platform-only, full-session, expired-token, recursive, external, protocol-relative, and malformed cases.

## GREEN

- Import the local Core `LogoutRoute` through the package entry point.
- Register it before dynamic window routes with `public: true`.
- Configure `/onboarding` as the safe destination and Login as the next onboarding entry.
- Do not add a concrete logout exception to `AuthGate`.

## Acceptance criteria

- Direct `/logout` always resolves safely to onboarding Login.
- `/dashboard` and other protected routes remain protected.
- The route behaves identically with local Core and the final preview package.

## Verification

```bash
cd tools/app-shell
LOCAL_CORE=1 npm run test:vitest -- src/__tests__/runtime-routes.vitest.js src/__tests__/runtime-routes-integration.vitest.jsx
LOCAL_CORE=1 npm run build
```
