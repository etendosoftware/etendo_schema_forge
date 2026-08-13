# Contract and Generated Output Ownership

This document defines who produces contracts and generated outputs, who consumes them, and when regeneration is required. It is the operating model for keeping the monorepo split-ready without moving generated windows into reusable packages.

## Ownership Model

| Asset | Producer | Consumer | Regeneration trigger |
|-------|----------|----------|----------------------|
| `artifacts/<window>/schema-raw.json` | Schema Forge extractors (`extract-from-db`, cache-backed extractors) | Decision tooling, pipeline, reviewers | Etendo AD metadata changed, extraction cache refreshed, or a window is newly onboarded |
| `artifacts/<window>/rules-raw.json` | Schema Forge rule extractors | Decision tooling, contract generator | Etendo rules/callouts changed or rule extraction logic changed |
| `artifacts/<window>/decisions.json` | Human/agent curation through Schema Forge tooling | Contract generator, docs, tests | Functional UI/behavior decision changes, schema migration, or curated visibility/rule updates |
| `artifacts/<window>/contract.json` | `generate-contract` step | NEO push, frontend generator, contract tests, app-shell runtime | Any upstream raw/decision/process input changed, contract generator changed, or contract version policy requires a bump |
| `artifacts/<window>/contract.prev.json` and `contract-changelog.json` | `generate-contract` step | Reviewers and compatibility checks | Contract changes are generated after an existing contract is present |
| `artifacts/<window>/generated/web/<window>/**` | `generate-frontend` step | `tools/app-shell` through `@generated`, downstream app-shell consumers after artifact sync | `contract.json` changed or frontend generator/templates changed |
| `artifacts/<report>/report-contract.json` | Report pipeline/manual report authoring | Report API, report viewer, tests | Report inputs, SQL/NEO endpoint, output shape, parameters, or template behavior changed |
| `tools/app-shell/src/windows/custom/<window>/**` | Humans/agents | App-shell runtime and users | Never generated. Edit manually and keep aligned with the window contract |
| `tools/app-shell/src/windows/registry.js` | Humans/agents, occasionally generator-assisted | App-shell routing/build | New generated window, removed window, or loader ownership changes |
| `@etendosoftware/app-shell-core` | App-shell platform maintainers | Monorepo app-shell and external app-shell consumers | Shared runtime/platform change only. It must not include generated contracts or generated windows |
| `@etendosoftware/schema-forge-core` | Schema Forge generator/platform maintainers | CI, boundary checks, package consumers | Reusable generator/validation logic changes |
| `@etendosoftware/schema-forge-stack` | Package maintainers | External consumers | Package composition, doctor checks, or setup commands changed |

## Producer and Consumer Contract

Schema Forge is the only producer of generated contracts and generated frontend outputs. A consumer may import and render those outputs, but it must not mutate them in place.

The app-shell runtime consumes generated windows through an artifact boundary:

```text
artifacts/<window>/contract.json
        │
        ├── generate-frontend
        ▼
artifacts/<window>/generated/web/<window>/index.jsx
        │
        └── tools/app-shell registry imports through @generated
```

Reusable packages deliberately stop before generated business assets:

```text
@etendosoftware/app-shell-core
  owns runtime, layout, auth, reports, styles, reusable UI

consumer repo or monorepo artifacts
  owns contract.json and generated/web/<window> outputs
```

That means an external project can consume the app shell package, but it still needs a contract/artifact producer path: either generated artifacts copied from Schema Forge, generated in its own repo through Schema Forge tooling, or delivered by a future artifact package.

## Regeneration Rules

Regenerate a window contract when any of these change:

- `schema-raw.json`, `rules-raw.json`, `processes.json`, or `decisions.json`.
- Contract generator code or contract schema.
- Contract versioning policy, compatibility metadata, or test manifest rules.
- NEO-facing configuration that changes endpoint shape, field visibility, process behavior, or report descriptors.

Regenerate frontend outputs when any of these change:

- `contract.json`.
- Frontend generator code, shared generated templates, or generated component conventions.
- App-shell platform APIs used by generated components.

Do not regenerate just because these changed:

- Custom window code under `tools/app-shell/src/windows/custom/**`.
- Reusable package docs.
- CI wiring, unless it changes generator behavior or artifact expectations.
- App-shell-core internals that preserve the public runtime and generated component contract.

## Split-Ready Repo Rule

If the repo is split later, generated artifacts must move as an explicit deliverable, not as hidden app-shell-core source.

Allowed split models:

- **Consumer-owned artifacts:** the downstream app repo runs Schema Forge tooling and commits its own `artifacts/**`.
- **Published artifact package:** a package such as `@etendosoftware/schema-forge-artifacts-<domain>` ships contracts/generated outputs for one domain or release train.
- **Release bundle:** a release job emits app-shell packages plus artifact tarballs; consumers install packages and unpack artifacts as a controlled step.

Not allowed:

- Moving generated windows into `@etendosoftware/app-shell-core`.
- Importing generated windows through monorepo-relative paths from a package.
- Manually editing `artifacts/*/generated/**` to fix runtime issues.
- Publishing a stack package that silently vendors generated business windows.

## Review Checklist

Every PR that touches contracts or generated outputs must answer:

- Which windows/reports/processes are affected?
- Which producer step was run?
- Which generated outputs changed because of that producer step?
- Which consumers were validated?
- Are custom manual changes separated from generator outputs?

Minimum validation:

- Contract/generator change: run package tests for `schema-forge-core` and affected contract tests.
- Window artifact change: run pipeline validation and affected app-shell build/smoke.
- App-shell-core change that affects generated outputs: run app-shell-core tests and at least one generated-window consumer build.
- External consumer package change: validate a consumer from package/tarball, not from monorepo-relative source.
