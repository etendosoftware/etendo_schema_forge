# ETP-4247 — Cross-domain plan

Chart of Accounts required one cohesive delivery across generated window
configuration, custom CoA UI, shared platform wiring, generator support, and
supporting documentation. The monorepo boundary gate classifies these files into
multiple scopes, so this plan documents why they ship together, how they were
validated, and how to roll them back.

## Domains touched

- **window:chart-of-accounts**
  - `artifacts/chart-of-accounts/**`
  - `tools/app-shell/src/windows/custom/chart-of-accounts/**`
  - `docs/generated-custom-windows/chart-of-accounts.md`
  - `e2e/tests/flows/chart-of-accounts-lock.mocked.spec.js`
  - Covers the concrete CoA behavior: tree layout, subaccount modal flow,
    protected parent-like subaccounts, AccountCodeField, generated page wiring,
    and CoA-specific tests/docs.

- **generator-change**
  - `cli/src/extract-fields.js`
  - `cli/src/generate-contract.js`
  - `cli/src/generate-frontend.js`
  - `cli/src/resolve-curated.js`
  - `cli/test/generate-frontend-customrenderer.test.js`
  - `core-maps/ad-menu-cache.json`
  - These changes are inseparable from the CoA window because the window now
    relies on generic pipeline capabilities: translated enum labels,
    component-backed menu actions, custom renderer support, and resolved window
    flags like `hideCreate`.

- **platform-change**
  - `tools/app-shell/src/components/contract-ui/EntityForm.jsx`
  - Required to support the shared `customRenderer` path used by CoA's
    `AccountCodeField`, and later to satisfy the repository-wide `data-testid`
    codemod gate.

- **app-shell-core**
  - `packages/app-shell-core/src/locales/en_US.json`
  - `packages/app-shell-core/src/locales/es_ES.json`
  - Required for translated CoA filter labels and account-type labels used by
    the custom CoA tree/filter UI.

- **repo-infra**
  - `docs/decisions-reference.md`
  - `docs/etendo-ad/onboarding-gaps.md`
  - `docs/etendo-ad/tenant-remediation-knowledge.md`
  - `docs/ui-customization.md`
  - These document the newly introduced generator/window capabilities and the
    operational context around the CoA onboarding/data-fix work.

- **root-global-sensitive**
  - `package-lock.json`
  - Lockfile update is mechanical from the workspace dependency/tooling changes
    required by the generator/platform work above.

- **unknown**
  - `cli/src/data-fixes/sql/20260626T120000Z__R8-account-codes-8digits.sql`
  - This SQL data-fix belongs to the same CoA rollout because protected 8-digit
    account-code rules require legacy short account codes to be normalized first.

These scopes ship together because splitting them would leave the feature in an
invalid state: CoA custom UI without generator support, generator support
without the consuming window, translated filter UI without locale keys, or a
protected-code backend without the data-fix and UI behavior that make it usable.

## Tests

- `make regen ONLY=chart-of-accounts SKIP_EXTRACT=1`
- `node cli/src/validate-pipeline.js --scope=chart-of-accounts`
- `node --test cli/test/generate-frontend-customrenderer.test.js`
- `node --test artifacts/chart-of-accounts/custom/__tests__/AccountCodeField.test.js`
- `node --test tools/app-shell/src/windows/custom/chart-of-accounts/__tests__/newSubAccountModal.test.js`
- `./scripts/check-add-data-testid.sh tools/app-shell/src`
- Manual verification after `smartbuild`:
  - CoA list loads through the custom handler
  - advanced filter applies correctly on CoA code/name/type/active
  - detail-view `New sub-account` action opens correctly
  - protected parent-like subaccounts remain read-only / blocked

## Rollback

- **Window/UI only rollback:** revert the `window:chart-of-accounts` files,
  locale keys, and shared `EntityForm` custom-renderer consumer changes.
- **Generator rollback:** revert the generator files together with the CoA
  window changes so generated output and source-of-truth decisions stay aligned.
- **Data-fix rollback:** the SQL fix should only be reverted with explicit data
  remediation planning because padded account codes may already be in use.
- **Backend rollback:** revert the paired `com.etendoerp.go` handler changes
  independently if the CoA handler behavior causes regressions.

No additional `push-to-neo` / `export.database` step is required for the latest
filter and hook-fix commits themselves; those are code-only. NEO metadata export
remains required only for the earlier push-to-neo-backed window configuration
changes already performed during the CoA rollout.
