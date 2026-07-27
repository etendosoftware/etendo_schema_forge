# Task 00 — Prepare Branches and Baseline

## Objective

Create isolated `feature/ETP-4584` branches in both repositories without absorbing pre-existing work, and record the initial test baseline.

## Scope

- Confirm both repositories are based on `epic/ETP-3504`.
- Inspect and preserve every tracked and untracked pre-existing change.
- Create `feature/ETP-4584` in `schema_forge_core` and `schema-forge`.
- Record repository roots, branches, Node version, and baseline commands.
- Confirm the sibling Core source is available to `make dev-local-core`.

## Acceptance criteria

- Both branches are named `feature/ETP-4584` and target `epic/ETP-3504`.
- Existing unrelated files are identified and excluded from ETP-4584 commits.
- Core package tests and focused consumer routing tests have a recorded baseline.
- No implementation change is made in this task.

## Evidence

```bash
git -C ../schema_forge_core status --short
git -C ../schema_forge_core branch --show-current
git status --short
git branch --show-current
test -d ../schema_forge_core/packages/app-shell-core/src
```

## Baseline recorded on 2026-07-17

- Node runtime: NVM `v22.19.0` (npm `11.6.0`). Do not use the Homebrew Node installation because its `simdjson` dynamic library is unavailable in this environment.
- `schema-forge` branch: `feature/ETP-4584` at `1d1798db6`, identical to `epic/ETP-3504` at baseline.
- `schema_forge_core` branch: `feature/ETP-4584` at `68415db88`, identical to `epic/ETP-3504` at baseline.
- Local Core source: present at `../schema_forge_core/packages/app-shell-core/src`.
- Pre-existing working-tree changes were retained outside ETP-4584 commits.

### Commands executed

```bash
cd ../schema_forge_core
source /Users/sebastianbarrozo/.nvm/nvm.sh
nvm use 22.19.0
npm test --workspace=packages/etendo-go-core
# PASS — 74 tests, 0 failures

cd ../schema-forge/tools/app-shell
source /Users/sebastianbarrozo/.nvm/nvm.sh
nvm use 22.19.0
LOCAL_CORE=1 npm run test:vitest -- src/__tests__/runtime-routes.vitest.js src/__tests__/runtime-routes-integration.vitest.jsx
# PASS — 8 tests, 0 failures
```
