# ETP-4237 — Cross-domain plan

**Feature:** Monitor Verifactu and Verifactu Config windows — decisions, contract
regeneration, contract integrity tests, and discard of the `refreshData` field.
Also includes a fix to the pre-push hook for compatibility with git < 2.38.

This PR is approved as cross-domain because it spans two windows
(`monitor-verifactu` and `verifactu-config`) that belong to the same Verifactu
localization module, plus a `repo-infra` fix to the shared pre-push hook, plus a
`root-global-sensitive` update to the shared AD schema cache.

## Domains touched

### `root-global-sensitive`

- `cli/cache/ad-snapshot.json` — removed the `Refresh_Data` button column
  (`3CD22A94F1084E35A1035C5530F186C3`) from the AD schema cache. This column was
  eliminated from the verifactu module (replaced materialized view with a regular
  view), so the snapshot must no longer reference it to prevent the offline regen
  check from generating phantom ETGO_SF_FIELD rows.

### `repo-infra`

- `.githooks/pre-push` — fixed `set -e` interaction with
  `git merge-tree --write-tree` on git < 2.38: the subshell assignment now uses
  `|| rc=$?` so the unsupported-command exit code (129) is captured instead of
  aborting the script via `set -e`.

### `window:monitor-verifactu`

- `artifacts/monitor-verifactu/decisions.json` — updated decisions; `refreshData`
  field discarded.
- `artifacts/monitor-verifactu/contract.json` — regenerated contract.
- `artifacts/monitor-verifactu/contract.mcp.json` — regenerated MCP contract.
- `artifacts/monitor-verifactu/generated/web/monitor-verifactu/CabeceraDeEmisorPage.jsx`
  — regenerated frontend for regular (non-detail) view.
- `artifacts/monitor-verifactu/generated/web/monitor-verifactu/mockData.js`
  — regenerated mock data.
- `artifacts/monitor-verifactu/__tests__/contract-integrity.test.js`
  — contract integrity test added.

### `window:verifactu-config`

- `artifacts/verifactu-config/decisions.json` — updated decisions; `refreshData`
  field discarded.
- `artifacts/verifactu-config/contract.json` — regenerated contract.
- `artifacts/verifactu-config/contract.mcp.json` — regenerated MCP contract.
- `artifacts/verifactu-config/__tests__/contract-integrity.test.js`
  — contract integrity test added.

## Tests

- `monitor-verifactu/__tests__/contract-integrity.test.js` — contract integrity
  assertions pass.
- `verifactu-config/__tests__/contract-integrity.test.js` — contract integrity
  assertions pass.

## Rollback

- **repo-infra:** revert `.githooks/pre-push` to restore the original
  `out=$(...)` assignment. Only affects developers running git < 2.38.
- **window:monitor-verifactu:** revert `decisions.json` to restore `refreshData`;
  re-run `make regen ONLY=monitor-verifactu` to rebuild contract and generated
  files.
- **window:verifactu-config:** same procedure as above for `verifactu-config`.
