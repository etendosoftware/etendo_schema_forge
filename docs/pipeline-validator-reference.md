# Pipeline Validator Reference

The pipeline completeness validator (`cli/src/validate-pipeline.js`) checks that every artifact directory in `artifacts/` has a consistent, fully-run pipeline — decisions committed, contract up-to-date, frontend generated, and registry entry present. It is the enforcement layer that prevents partial pipeline runs from reaching `main`. It runs without DB access (git-tracked files only) and is designed to be fast enough for a pre-commit hook.

Design rationale: `docs/plans/2026-04-16-pipeline-completeness-validator.md`.
Phased delivery: `docs/plans/2026-04-16-pipeline-validator-implementation.md`.

---

## Quick Start

```bash
# Validate every artifact in the repo (CI mode)
make validate-pipeline

# Equivalently
node cli/src/validate-pipeline.js

# Validate only staged files (pre-commit mode)
node cli/src/validate-pipeline.js --staged

# Promote warnings to blocking errors
node cli/src/validate-pipeline.js --strict

# Machine-readable output (for CI annotations)
node cli/src/validate-pipeline.js --format=json

# Skip specific rules — escape hatch, must be justified in the commit body
node cli/src/validate-pipeline.js --skip=F4,F7
```

The tool is also exported as a module for testing:

```js
import { validatePipeline } from 'cli/src/validate-pipeline.js';
const { violations, summary } = await validatePipeline({ scope: 'all', strict: false, skip: [] });
```

---

## Rules

Rules are grouped by the artifact kind they apply to (see [Artifact Classification](#artifact-classification) below).

### Window rules

| Code | Severity | What it detects | How to fix |
|------|----------|-----------------|------------|
| F1 | BLOCK | `decisions.json` was modified but `contract.json` was not regenerated — `contract.sourceHashes.decisions` no longer matches. | Re-run `node cli/src/pipeline.js --menu-name "<window>"` to regenerate the contract. |
| F2 | BLOCK | `contract.json` was modified but `generated/` was not regenerated — `generated/.manifest.json` checksum no longer matches. | Re-run the pipeline to regenerate frontend components. |
| F3 | BLOCK | `contract.json` exists for a window that has no entry in `tools/app-shell/src/windows/registry.js`. | Add the window to `windowLoaders` or `customLoaders` in `registry.js`. |
| F4 | WARN | `generated/` exists but `contract.json` is absent — orphaned output. | Either run the full pipeline to recreate `contract.json`, or remove `generated/` if the window was discarded. |
| F5 | BLOCK | `decisions.json` schema version is stale — auto-migration would change it. | Run `node cli/src/pipeline.js --menu-name "<window>"` — the pipeline auto-migrates on startup. |
| F6 | BLOCK | `contract.version` is lower than the baseline version tracked in the previous commit — a contract downgrade was committed. | Revert the contract change or re-run the pipeline so the version increments forward. |
| F7 | WARN | `decisions.json` lists the window itself under `excludedEntities` — likely a copy-paste typo. | Remove the self-reference from `excludedEntities`. |
| F10 | BLOCK | `registry.js` registers a loader for `<window>` but `artifacts/<window>/generated/web/<window>/index.jsx` is missing. | Re-run the pipeline to regenerate the frontend, or remove the stale registry entry. |
| F11 | BLOCK | `decisions.json → window.rowQuickActions.actions.<key>` references a non-canonical key that does not exist in `window.menuActions[].key` or `window.processOverrides`. Canonical keys (`edit`, `duplicate`, `email`, `delete`) are always valid and never trigger F11. | Remove the unknown key from `rowQuickActions.actions`, or add the corresponding entry to `window.menuActions` or `window.processOverrides`. |
| F12 | BLOCK | `decisions.json` sets `window.linesLayout` to a value outside the supported enum (`"classic"`, `"inlineEditable"`). | Set `window.linesLayout` to one of the supported values, or remove the key to fall back to `"classic"`. |
| F13 | BLOCK | `contract.json → apiPrediction.actions[]` contains an action with fewer than three edge cases on contracts `0.7.0+`. | Update the action classifier or curated action metadata so each action exposes at least three behavioral edge cases. |
| F14 | BLOCK | `contract.json` is missing `formState` on contracts `0.7.0+`. | Re-run contract generation so agent form-fidelity metadata is emitted. |
| F15 | BLOCK | `contract.json` is missing `agentProfile`, or the profile references fields, selectors, or actions that do not exist in the generated contract, on contracts `0.7.0+`. | Re-run contract generation or fix the profile generator/curated metadata so references match generated contract metadata. |
| F16 | BLOCK | A key file under `artifacts/<window>/generated/` is newer than `contract.json`, which indicates a possible manual edit to generated output. | Never edit generated output manually. Fix the generator or source metadata, then regenerate the artifact. |
| F17 | BLOCK | `decisions.json` `window.balanceFooter` is missing `debitField`/`creditField`, or references a field that does not exist on the lines entity (validated against `frontendContract.entities.<lineEntity>.fields[].name`). | Set `window.balanceFooter` to `{ debitField, creditField }` using amount-typed line-entity field names that exist in the contract. |
| F18 | BLOCK | A grid field's `multiField` decorator (composite list column) references a sibling field that does not exist on the same entity (`subtitle`, `media.field`, or any `parts[].field`), or a sort-enabled part (`sortable !== false`) is not queryable (missing from the entity's `searchableFields` / `supportedFilters`). Validated against the resolved `contract.json`. | Reference only fields declared on the same entity; mark non-queryable segments `sortable: false`, or make the field searchable so the backend accepts `_sortBy` on it. |
| F19 | BLOCK | A hand-written custom table/panel column declares a `key` matching a `contract.json` field `name`, but its local `required` flag (`true`/`false`/absent-meaning-`false`) does not match the contract field's `required` boolean. Scans three locations per window: `tools/app-shell/src/windows/custom/<window>/` (hand-built windows), `artifacts/<window>/custom/` (pipeline-convention windows — the file actually imported by the generated `HeaderPage` via `resolveCustomImport()`, which can differ from a stale decoy array left behind in the hand-built tree), and `tools/app-shell/src/windows/custom/shared/` files reachable via a one-hop `@/...` or relative import from either of the two window-owned locations (covers components shared by more than one window, e.g. `PaymentHeaderTableBase.jsx` used by both `payment-in` and `payment-out` through thin prop-passing wrappers — the shared file's columns are attributed to whichever window is being checked). Only fires for windows with a custom override in at least one of the first two locations — generated tables are correct by construction. Columns with no matching contract field (pure custom-render cells) and columns whose local `required` cannot be statically resolved (e.g. a runtime-conditional spread) are ignored. Known-intentional divergences (e.g. a `required` flag guarding an inline-add-row save path, unrelated to `AdvancedFilterBuilder`) can be suppressed per `(artifact, key)` pair via `cli/src/validate-pipeline-f19-allowlist.json` in `schema_forge_core` — everything else still evaluates normally. | Update the `required` flag on the drifted column to match `artifacts/<window>/contract.json`, or fix the contract/decisions.json if the local value is the correct one. If the divergence is intentional, add `{ "artifact": "<window>", "key": "<field>", "reason": "..." }` to the F19 allowlist instead of changing the code. |
| F20 | BLOCK | A hand-written custom table declares a grid column with `type: 'custom'` and **no `filterMode`**, whose `key` matches a `contract.json` field whose data type implies a non-text filter mode. `type: 'custom'` carries no filter semantics — the cell has a bespoke `render`, so `resolveFilterMode` cannot see the underlying type and degrades the Advanced Filter to text operators (ETP-4681: `?filter=overdue` preloaded `outstandingAmount greaterThan 0`, but text mode has no `greaterThan`, so the operator select rendered empty). Expected mode is derived from the contract field's `columnType ?? type`: `amount`/`number`/`integer`/`quantity`/`price`/`decimal`/`percent`/`signedDelta` → `numeric`; `date`/`dateTime` → `date`; `foreignKey` → `identifier`; `enum`/`status`/non-empty `enumValues` → `enumLabel`; `boolean` → `booleanLabel`. Scans `tools/app-shell/src/windows/custom/<window>/` and `artifacts/<window>/custom/` (Babel AST, `__tests__` excluded); fires only for windows with a custom override, since generated tables are correct by construction. **Not** reported when: the `key` matches no contract field (purely synthetic cell); the column declares neither `column` nor `backendFilterKey` (excluded from the filter field list anyway by the ETP-4609 guard in `AdvancedFilterBuilder.jsx`); the expected mode is `identifier` and `column` already ends in `_ID` (the runtime `_ID` heuristic covers it); or the value cannot be statically resolved (e.g. a spread in the column object). Reports the first violation only. | Add `filterMode: '<expected>'` to the offending column. If the divergence is intentional, add `{ "artifact": "<window>", "key": "<field>", "reason": "..." }` to `cli/src/validate-pipeline-f20-allowlist.json` in `schema_forge_core` instead of changing the code. See [`list-filters.md`](list-filters.md) for the full filter-mode resolution order. |
| F21 | BLOCK | The declared read-only intent in `decisions.json` (`window.readOnly`, `entities.<key>.readOnly`, `entities.<key>.methods`) does not match the HTTP methods the contract would push to `ETGO_SF_ENTITY` — i.e. `apiPrediction.crud.<entity>.methods` / `apiPrediction.window.readOnly` is stale. Also fires when an emitted `crud.<entity>.methods` array omits `GET`/`GETBYID` (an entity with no read access is never valid), or when a restricting `entities.<key>` declaration matches no contract entity (mistyped key → silent no-op). | Regenerate the contract (`make regen ONLY=<window>`). Both write paths — the live DB push and the offline XML delta — read the method flags off the contract, so a stale contract silently re-opens a read-only window for writes on the next push (ETP-4254). Never hand-edit `crud.methods`. See [`agentic-validation/agentic-write-exposure-criteria.md`](agentic-validation/agentic-write-exposure-criteria.md) for when an entity qualifies for write exposure at all. |

### Report rules

| Code | Severity | What it detects | How to fix |
|------|----------|-----------------|------------|
| F8 | BLOCK | Report artifact is missing one or more required files: `report-contract.json`, `template.hbs`, `helpers.js`, `mock-data.json`. Triggers only when at least one of the four already exists (partial artifact). | Add the missing files. Run the pipeline or create them manually according to the report artifact shape. |

### Aggregate rules

| Code | Severity | What it detects | How to fix |
|------|----------|-----------------|------------|
| F9 | BLOCK | Aggregate folder has `generated/` but no `aggregate-contract.json`. | Re-run the pipeline for the aggregate, or add the missing `aggregate-contract.json`. |

### General rules

| Code | Severity | What it detects | How to fix |
|------|----------|-----------------|------------|
| F4 | WARN | Applies to any kind: `generated/` present but no contract-type file found. | See F4 in the window table above. |

---

## Artifact Classification

The validator determines how to check each folder by inspecting which files are present:

```
classify(artifacts/<name>/):
  has aggregate-contract.json  →  kind = 'aggregate'
  has report-contract.json     →  kind = 'report'
  has contract.json            →  kind = 'window'
  has generated/ only          →  kind = 'aggregate-section'  (whitelisted, no checks run)
  otherwise                    →  kind = 'unknown'  (WARN, or BLOCK with --strict)
```

Rules applied per kind:

| Kind | Rules checked |
|------|--------------|
| window | F1, F2, F3, F4, F5, F6, F7, F10, F11, F12, F13, F14, F15, F16, F17, F19 |
| report | F8 |
| aggregate | F9 |
| aggregate-section | none (whitelisted) |
| unknown | structural WARN |

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | No violations (BLOCK-level). Warnings may be present; use `--strict` to block on them. |
| 1 | One or more BLOCK-severity violations found. |

The `--format=json` output shape:

```json
{
  "violations": [
    {
      "rule": "F3",
      "artifact": "bom-production",
      "severity": "BLOCK",
      "message": "Window has contract.json but 'bom-production' is not registered in registry.js",
      "fix": "Add an entry for 'bom-production' to windowLoaders or customLoaders in tools/app-shell/src/windows/registry.js"
    }
  ],
  "summary": {
    "blocking": 22,
    "warnings": 0,
    "skipped": 76
  }
}
```

---

## P1 Limitations (Current)

Rules F1 and F2 require generator-embedded hashes that do not exist yet. Until P2 (generator patches) lands, these rules emit `skipped: missing-hashes` and do not block:

```
[SKIP]  [F1] sales-order: contract.sourceHashes.decisions not present
              — will be enforced after P2 generator patch
[SKIP]  [F2] sales-order: generated/.manifest.json not present
              — will be enforced after P2 generator patch
```

This is expected. All other rules (F3–F10) are fully enforced in P1.

P2 will patch `generate-contract.js` and `generate-frontend.js` to embed `sourceHashes` and write `generated/.manifest.json` respectively. P3 will backfill existing artifacts. Track progress at epic [ETP-3504](https://etendo.atlassian.net/browse/ETP-3504) and in the implementation plan (`docs/plans/2026-04-16-pipeline-validator-implementation.md`).

---

## Troubleshooting

**"Window has contract.json but '<name>' is not registered in registry.js" (F3)**

You ran the pipeline for a new window but did not add the entry to the frontend registry. Open `tools/app-shell/src/windows/registry.js` and add the window to `windowLoaders`:

```js
'my-new-window': () => import('./my-new-window/index.jsx'),
```

If the window uses a custom loader, add it to `customLoaders` instead. See `docs/ui-customization.md` for the layout-type registry pattern.

---

**"decisions.json schema version is stale and needs migration" (F5)**

The `decisions.json` for this window was last touched before a schema migration was added. The fix is always the same — the pipeline auto-migrates on startup:

```bash
node cli/src/pipeline.js --menu-name "return-from-customer"
```

After the pipeline runs, `decisions.json` will have the current schema version and F5 will pass.

---

**"Report artifact is incomplete. Missing: mock-data.json" (F8)**

These 22 pre-existing violations (found during P1 audit on 2026-04-16) are `print-*` report artifacts that were created before `mock-data.json` was added to the report artifact shape. Add a `mock-data.json` file with representative sample data matching the report's `fields` contract, or re-run the pipeline with `--mock-data` to generate a skeleton.

---

**Bypassing the validator (last resort)**

The pre-commit hook (installed in P4) can be bypassed with `git commit --no-verify`. The CI check (installed in P5/P6) will still catch violations on the PR. Document the reason in the PR description if you bypass locally.
