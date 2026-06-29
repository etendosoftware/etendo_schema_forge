# ETP-4270 — Cross-Domain Plan

This branch (`feature/ETP-4270`) merges `epic/ETP-3504` and intentionally touches
two domains in a single push. This plan documents that crossing so the domain
boundary gate can be approved with the `cross-domain-approved` label.

## Domains

1. **`window:physical-inventory`** (primary)
   - The Physical Inventory UI redesign for ETP-4270 plus the integration of the
     epic's `menuActions.post` action into `decisions.json`.
   - Affected: `artifacts/physical-inventory/**`,
     `docs/generated-custom-windows/physical-inventory.md`,
     `e2e/tests/flows/physical-inventory.spec.js`,
     `tools/app-shell/src/windows/custom/physical-inventory/**`.

2. **`generator-change`** (incidental)
   - One latent test-infra fix: `cli/test/method-budget.test.js` used
     `URL.pathname`, which leaves `%20` in filesystem paths when the repo lives in
     a directory whose name contains spaces. Switched to `fileURLToPath`.
   - This fix unblocks the local pre-push hook itself; it has no behavioral impact
     on the Physical Inventory window. It rides along in this branch rather than a
     separate PR because it is a one-line, behavior-preserving correction.

## Tests

- Full CLI suite: `node --test cli/test/*.test.js` → **16131 pass, 0 fail**.
- Physical Inventory regenerated from `decisions.json` via
  `make regen ONLY=physical-inventory` → contract `0.27.0`, 126 contract tests.
- Pipeline validator: `node cli/src/validate-pipeline.js --scope=physical-inventory`
  → **0 violations**.

## Rollback

- The generator-change fix is isolated in commit
  `Feature ETP-4270: Fix method-budget test path decoding on spaced paths`.
  Revert that single commit to drop the test-infra change without touching the
  window work.
- The Physical Inventory changes are reproducible from `decisions.json`; reverting
  the merge of `epic/ETP-3504` and re-running `make regen ONLY=physical-inventory`
  restores the previous window state.
