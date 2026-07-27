# Task 08 — Run Delivery and Compatibility Gates

## Objective

Close ETP-4584 with local-source evidence, published-preview compatibility, documentation, and QA status.

## Local Core gate

```bash
cd ../schema_forge_core
npm test --workspace=packages/etendo-go-core
npm test --workspace=packages/app-shell-core
npm run test:consumer --workspace=packages/app-shell-core
```

## Local consumer gate

```bash
cd tools/app-shell
LOCAL_CORE=1 npm run test:vitest -- src/__tests__/runtime-routes.vitest.js src/__tests__/runtime-routes-integration.vitest.jsx
LOCAL_CORE=1 npm run test:vitest
LOCAL_CORE=1 npm run build
```

Also record the focused Playwright result from Task 07.

## Published-preview gate

- Push the complete Core feature branch and capture the lockstep preview version from the preview workflow.
- Do not block development or browser testing on this publication.
- Pin the exact preview in Schema Forge:

```bash
make bump-core-version VERSION=<preview-version>
cd tools/app-shell
npm run test:vitest -- src/__tests__/runtime-routes.vitest.js src/__tests__/runtime-routes-integration.vitest.jsx
npm run test:vitest
npm run build
```

## Documentation and delivery evidence

- Update public onboarding/session documentation in the same delivery.
- Record repository roots, branches, changed-file scope, commands, results, preview version, and compatibility decision.
- List tests moved, retained, and intentionally removed with justification.
- Attach search evidence proving retired wrappers cannot return.
- Record `Pending validation by QA: Matías Bernal / Emilio Polliotti` until human validation exists.
- Target both PRs to `epic/ETP-3504`, never `main`.

## Release note

The public API additions justify the `0.4.0` minor line, but all six Core packages release in lockstep. Set the stable floor only through `packages/schema-forge-core/package.json` as defined by `scripts/release-version.mjs`. The feature-branch preview is the compatibility artifact; it is not the stable release.

## Completion criteria

ETP-4584 remains incomplete if implementation, executed test evidence, published-preview compatibility, documentation, or required QA validation is missing.
