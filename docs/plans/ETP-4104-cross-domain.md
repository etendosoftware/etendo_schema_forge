# ETP-4104 Cross-Domain Plan: Domain Boundary Gate

## Domains

- `repo-infra`: GitHub Actions workflow, CODEOWNERS, Makefile target, and ops docs.
- `generator-change`: CLI package metadata and the Node-based boundary check wrapper.
- `sdk-or-external-app`: publishable `@etendosoftware/schema-forge-core` workspace package.
- `platform-change`: reusable `@etendosoftware/app-shell-core` package and the app-shell imports that consume it.

## Why This Cannot Be Split Cleanly

The workflow must call the CLI in the same PR that introduces the CLI, otherwise
the required check would point to a missing script. The reusable core module,
CODEOWNERS, and documentation need to land with the gate so the policy is
reviewable and executable together inside this repo and from external projects.

The app-shell runtime extraction also updates the boundary classifier so
`packages/app-shell-core/**` is treated as platform scope from the first PR that
introduces the package. Splitting those changes would leave the first extraction
PR classified as unknown and would force a false-positive exception.

## Review Order

1. Review classifier policy and package tests.
2. Review workflow behavior, especially that it runs on every PR and merge group
   without `paths:` filters.
3. Review CODEOWNERS and Makefile wiring.
4. Review `@etendosoftware/app-shell-core` package API: auth, i18n, shell layout,
   report frame, styles, and absence of `@generated` imports.
5. Review this plan and the ops documentation.

## Tests

- `npm test --workspace=packages/schema-forge-core`
- `npm test --workspace=packages/app-shell-core`
- `npm test --workspace=tools/app-shell`
- `npm run build --workspace=tools/app-shell`
- `npx sf-domain-boundary-check --changed-file artifacts/sales-order/contract.json`
- Smoke pass case with one window slice.
- Smoke fail case with unrelated windows.

## Rollback

Revert the workflow file first to remove the required gate entry point, then
revert the CLI, tests, docs, Makefile target, package bin entry, and CODEOWNERS
updates together.

For the app-shell extraction, revert app-shell imports to local auth/i18n/currency
providers first, then remove the `@etendosoftware/app-shell-core` workspace
dependency and package.
