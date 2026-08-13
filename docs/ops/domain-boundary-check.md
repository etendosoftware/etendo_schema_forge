# Domain Boundary Check

`domain-boundary-check` keeps Schema Forge in one repository while preventing PRs
from mixing unrelated intents. The unit of review is not a folder; it is the
architectural or functional scope of the change.

## Required Gate

The GitHub Actions workflow `.github/workflows/domain-boundary-check.yml` runs on
every `pull_request` and `merge_group` event. It intentionally does not use
`paths:` filters, so the required status check is always present.

Run it locally with:

```bash
make domain-boundary-check BASE=origin/epic/ETP-3504
```

The implementation lives only in the publishable workspace package
`@etendosoftware/schema-forge-core`. This repository executes that package binary via `npx`;
other repositories can consume the same policy as a Node module or executable:

```bash
npm install @etendosoftware/schema-forge-core
npx sf-domain-boundary-check --base origin/main
```

Programmatic usage:

```js
import { analyzeBoundary } from '@etendosoftware/schema-forge-core/domain-boundary';

const report = analyzeBoundary({
  changedFiles: ['artifacts/sales-order/contract.json'],
  knownWindows: ['sales-order'],
});
```

For exception testing:

```bash
make domain-boundary-check BASE=origin/epic/ETP-3504 \
  LABELS=cross-domain-approved \
  PR_BODY_FILE=docs/plans/ETP-0000-cross-domain.md
```

## Scopes

- `window:<name>`: one complete window slice across `artifacts/<window>`,
  `tools/app-shell/src/windows/custom/<window>`, its generated-window doc, and
  matching e2e tests.
- `vertical:<name>`: a declared multi-window business flow such as `sales`,
  `purchases`, `inventory`, `fiscal`, `finance`, or `people-crm`.
- `generator-change`: CLI extraction, generation, schemas, templates, core maps,
  and quality-gate configuration. Generated outputs may be included; manual
  custom window code must be split or explicitly approved.
- `platform-change`: shared app-shell code such as `contract-ui`, hooks, auth,
  layout, i18n, pages, registry, observability, and app-shell package manifests.
- `shared-custom-capability`: shared custom helpers under
  `tools/app-shell/src/windows/custom/shared`.
- `sdk-or-external-app`: `packages/apps-sdk*`, `tools/quick-order-app`, and
  `tools/spike-hello-app`.
- `repo-infra`: workflows, pipelines, root Makefile, infra, scripts, and
  operational docs.

## Exception Policy

`cross-domain-approved` is not enough by itself. A PR with that label must also
include either a changed `docs/plans/<ticket>-cross-domain.md` file or a PR body
plan that names the domains, tests, and rollback.

Use exceptions for global migrations, breaking contract changes, generator plus
consumer updates, dependency upgrades, or urgent fixes. CODEOWNER review is still
required by branch protection.

## Initial Blocking Rules

The gate blocks these cases by default:

- Multiple unrelated windows without `scope:vertical-slice` or an approved plan.
- Generator changes mixed with manual custom window code.
- Platform/shared app-shell changes mixed with window feature code.
- Shared custom capability changes mixed with feature code.
- SDK/external-app changes mixed with other domains.
- Root-sensitive files treated as neutral.

Root `package-lock.json` is allowed only when paired with exactly one
mechanically related package manifest. For example, root lockfile plus
`cli/package.json` is valid; root lockfile plus CLI and app-shell manifests is
not.
