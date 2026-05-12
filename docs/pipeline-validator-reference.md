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
| F11 | BLOCK | `decisions.json` sets `window.linesLayout` to a value outside the supported enum (`"classic"`, `"inlineEditable"`). | Set `window.linesLayout` to one of the supported values, or remove the key to fall back to `"classic"`. |

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
| window | F1, F2, F3, F4, F5, F6, F7, F10, F11 |
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
