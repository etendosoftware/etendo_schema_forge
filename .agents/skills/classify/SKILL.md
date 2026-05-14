---
name: classify
description: Use when classifying schema fields or business rules for a window. Triggers on classify window, classify fields, classify rules, curate schema, curate rules, pre-classify. AI-guided replacement for manual Decision Panel.
---

# Schema & Rules Classification

Unified classification skill for Schema Forge. You ARE the classifier — no external API calls needed.

## Invocation

```
/classify <windowName>                  # Auto-detects mode (drift, incremental, or full)
/classify sales-order --schema-only     # Only schema, skip rules
/classify sales-order --rules-only      # Only rules, skip schema
/classify sales-order --full            # Force full re-classification from scratch
```

If no window name provided, ask the user which window to classify.

## Mode Detection

**Check if `artifacts/{window}/decisions.json` exists:**

| Exists? | User said `--full`? | Mode |
|---------|-------------------|------|
| No | - | **Full** — classify from scratch |
| Yes | Yes | **Full** — re-classify from scratch |
| Yes | No | **Drift check** — run reconciler, then decide |

### Drift Check (default when decisions.json exists)

When `decisions.json` already exists, FIRST run the reconciler to detect unclassified fields:

```bash
node cli/src/reconcile-schema.js {windowName}
```

Then decide based on the output:

| Reconciler result | Mode |
|-------------------|------|
| `hasDiff: false` | **Incremental** — all fields classified, ask user what to change |
| `hasDiff: true` | **Drift** — show unclassified/orphaned fields, classify ONLY them |

### Drift Mode (decisions.json exists AND raw has new/orphaned fields)

The raw schema changed since decisions.json was generated. Work ONLY on the diff.

1. Show the diff summary to the user (from `formatDiffSummary` output)
2. For **unclassified fields** (in raw, no entry in decisions.json):
   - Classify each using deterministic → heuristic → AI logic (same as Full Mode)
   - Add entries to `decisions.json` for each field (under the appropriate entity key)
3. For **orphaned decisions** (in decisions.json, field no longer in raw):
   - Warn the user: "Decision for `{entity}.{field}` has no matching field in raw. Remove it?"
   - Wait for user confirmation before removing the entry from decisions.json
4. Leave all **existing decisions** exactly as they are — do NOT re-classify them
5. After updating decisions.json, continue with rules drift if `schema-only` was not specified

### Incremental Mode (decisions.json exists AND no structural drift)

The schema is structurally identical — the user wants a manual tweak.

1. Read the existing `decisions.json`
2. Ask the user: "What do you want to change?" (e.g. add a field, change visibility, add an entity, modify a rule)
3. Apply ONLY the requested changes to the existing decisions.json
4. Run the rest of the pipeline (contract → version → frontend → tests)

**Examples of incremental changes:**
- "Add the `costCenter` field to the header as editable"
- "Change `paymentMethod` from optional to required"
- "Add the Tax entity from schema-raw"
- "Discard all SII-related fields"
- "Mark `totalPaid` as grid:true"
- "Add a rule for BP address cascade"

Do NOT re-classify fields that the user didn't ask to change.

### Full Mode (no curated file, or `--full`)

Full classification from scratch — extract, classify all fields, all rules, write new curated files.
Follow the complete Phase 1 + Phase 2 + Phase 3 pipeline below.

## Full Pipeline

Classification (full or incremental) ALWAYS ends with the generation pipeline:

```
LOCK → CLASSIFY → CONTRACT → CHECK-VERSION → GENERATE-FRONTEND → TESTS → PR
```

Every `/classify` invocation ends with generated, tested, version-checked code on a PR targeting `develop`.

## Prerequisites

### Step 0: Window Lock via GitHub Issues (MANDATORY)

Locks are GitHub Issues with title `🔒 LOCK: {windowName} #` and label `window-lock`.
The owner is the GitHub username (issue assignee). The `--owner` param must be the **GitHub username**.

Before ANY classification work, verify the window is locked by the current user:

```bash
node cli/src/lock-window.js check --window {windowName} --owner {ghUsername}
```

If NOT locked → STOP. Tell the user:
```
Window "{windowName}" is not locked. Lock it first:
  node cli/src/lock-window.js lock --window {windowName} --owner {ghUsername} --reason "Classifying fields and rules"
```

Do NOT proceed without a lock. This prevents two people classifying the same window simultaneously.

**IMPORTANT:** Save the lock issue number — you'll need it to auto-close via PR.

### Step 0b: Verify input files exist

| File | Required for | What if missing |
|------|-------------|-----------------|
| `artifacts/{window}/schema-raw.json` | Schema classification | STOP — run extraction first: `node cli/src/extract-fields.js <windowId> <windowName>` |
| `artifacts/{window}/rules-raw.json` | Rules classification | Skip rules phase (some windows have no rules) |
| `core-maps/system-columns.json` | Schema classification | STOP — critical reference file |

**Note:** `decisions.json` (not `schema-curated.json`) is the source of truth for all classification decisions.
If it doesn't exist, Full Mode will create it. If it does exist, Drift/Incremental Mode patches it.

Read all required files before starting classification.

## Phase 1: Schema Classification

Transform `schema-raw.json` into `schema-curated.json`.

### Step 1: Load reference data

```
Read: core-maps/system-columns.json
Read: artifacts/{window}/schema-raw.json
```

Count total fields across all entities. Report: "Found {N} fields in {M} entities."

### Step 2: Deterministic classification (Nivel 1)

For EACH field in EACH entity, apply these rules IN ORDER:

**System columns (from system-columns.json):**
```
IF field.columnName matches a key in system-columns.json:
  → visibility: "system"
  → grid: false, form: false, searchable: false
  → derivation: from system-columns.json
  → tier: "auto"
```

**Audit columns (pattern match):**
```
IF field.columnName IN (Created, CreatedBy, Updated, UpdatedBy):
  → visibility: "system"
  → derivation: { type: "computed", expression: "now()" } (for dates)
  → tier: "auto"
```

**Known discard patterns:**
```
IF field.columnName matches:
  - EMxx_ prefix (module-specific extensions not in scope)
  - Copy, CopyFrom, CopyFromPO columns
  → visibility: "discarded"
  → tier: "auto"
```

Report count: "{N} fields auto-classified as system/discarded"

### Step 3: Heuristic classification (Nivel 2)

For remaining unclassified fields:

**Foreign keys:**
```
IF field.type === "foreignKey":
  → visibility: "editable"
  → grid: true (if field appears in first 8 FK fields by sequence)
  → form: true
  → Determine inputMode:
    - reference.type === "TableDir" → "selector"
    - reference.type === "Table" with filter → "search"
    - reference.type === "Search" → "search"
    - Has cascade dependency → "dependent"
  → tier: "auto"
```

**Booleans:**
```
IF field.type === "boolean" AND NOT system:
  → visibility: "readOnly" (most booleans are display-only in simplified UI)
  → grid: true, form: true
  → tier: "auto"
```

**Required fields:**
```
IF field.mandatory === true AND NOT system AND NOT FK:
  → visibility: "editable"
  → grid: true, form: true
  → tier: "auto"
```

Report count: "{N} fields classified by heuristics"

### Step 4: AI classification (Nivel 3)

For remaining fields, YOU (Codex) decide based on:

1. **Field name and label** — Does it sound user-facing?
2. **Data type** — Amounts, dates, strings are usually editable
3. **Is it mandatory?** — Required fields should usually be editable
4. **Column name patterns** — e.g., `XXX_Rule` fields are usually configs, not user input
5. **Sequence in tab** — Earlier fields are more important (grid: true)
6. **Context from the window** — A "Sales Order" window needs different fields than "Product"

For each field, decide:
- `visibility`: editable | readOnly | discarded
- `grid`: true | false (show in list view — max ~8 columns recommended)
- `form`: true | false (show in detail form)
- `searchable`: true | false (available as filter — max ~5 recommended)

**Confidence tracking:**
- HIGH confidence: clear-cut decision (name, description, required date → editable)
- LOW confidence: ambiguous fields → flag for human review

**Reasoning (`reason` field):**
Write a `reason` for every AI decision (non-obvious ones especially). Keep it to 1 sentence.
- HIGH confidence: brief rationale (`"Required document identifier, always editable"`)
- LOW confidence: explain the ambiguity (`"Could be display-only if backend auto-calculates, needs review"`)
- Skip `reason` only for tier-1/2 auto-classifications (system columns, audit columns) since those are deterministic.

Report:
```
AI classified: {N} fields (high confidence)
Flagged for review: {M} fields (low confidence)
```

### Step 5: Human review (flagged fields only)

If there are LOW confidence fields, present them to the user:

```
These {M} fields need your input:

1. PaymentRule (List: cash/credit/check)
   My suggestion: editable (users choose payment method)
   → editable / readOnly / discarded?

2. FreightCostRule (List: freight rules)
   My suggestion: discarded (rarely used in simplified UI)
   → editable / readOnly / discarded?
```

Wait for user response. Apply their decisions.

### Step 6: Write decisions.json (schema section)

Build or patch the decisions.json file. Store ONLY overrides vs tier-1/2 defaults.

**Defaults (do NOT store in decisions.json unless overriding):**
- `system` fields: `grid: false, form: false, searchable: false` (do not store)
- `editable`/`readOnly` fields: `grid: false, form: true, searchable: false` (do not store)
- `grid: true` is ALWAYS an explicit decision (always store when true)

**decisions.json structure (schema section):**

```json
{
  "$schema": "decisions-v1",
  "window": {
    "category": "{sales|purchases|inventory|accounting|reference|hr|crm}"
  },
  "entities": {
    "{rawEntityName}": {
      "name": "{simplifiedName — only if different from auto-simplify}",
      "fields": {
        "{rawFieldName}": {
          "visibility": "{only if non-default}",
          "grid": true,
          "form": "{only if different from visibility default}",
          "searchable": true,
          "section": "{sectionKey}",
          "reference": "{CatalogName — for FK fields}",
          "inputMode": "selector|search|dependent",
          "dependsOn": { "field": "...", "filterKey": "..." },
          "name": "{override — only if different from rawFieldName}",
          "reason": "{optional — 1-sentence rationale for non-obvious AI decisions}"
        }
      }
    }
  }
}
```

**Rules:**
- Entity keys are RAW entity names (e.g., `cOrder`), NOT simplified names
- Field keys are RAW field names from schema-raw.json (e.g., `id`, `businessPartner`)
- Only include properties that DIFFER from the visibility-class defaults
- A field with `visibility: "editable"` and all defaults → omit the field entry entirely

**Null semantics — CRITICAL:**
`null` in decisions means "suppress the raw value, use nothing". This is an **active override**, not a default.

| Property | Omit from decisions | Write `null` in decisions |
|---|---|---|
| `readOnlyLogic` | Use raw value as-is (Etendo rules apply) | Suppress raw value — field is NEVER read-only |
| `displayLogic` | Use raw value as-is (Etendo rules apply) | Suppress raw value — field is ALWAYS visible |
| `reference` | Auto-derive catalog name from `targetTable` | Suppress FK — treat as plain field |
| `inputMode` | Auto-derive from reference type | Suppress inputMode — no selector/search widget |

**Rule: NEVER write `readOnlyLogic: null` or `displayLogic: null` unless you are intentionally suppressing Etendo's logic.**
If a field has no `readOnlyLogic` in raw, the resolved value is already null — no decision needed.
If you want to keep Etendo's logic, omit the property entirely from decisions.
Only use `null` when you actively want to override Etendo behavior for the simplified UI.

**Entity name auto-simplification** (no entry needed when this applies):
- `cOrder` → `order`, `cOrderLine` → `orderLine`, `mProduct` → `product`, `adUser` → `user`

Write to `artifacts/{window}/decisions.json`.

---

## Phase 2: Rules Classification

Transform `rules-raw.json` into `rules-curated.json`.

### Step 1: Load rules

```
Read: artifacts/{window}/rules-raw.json
```

If file doesn't exist or has no rules, skip this phase. Report: "No rules to classify."

### Step 2: Deterministic classification

Run existing logic from `pre-classify.js` mentally:

**Display logic / ReadOnly logic:**
```
IF expression has NO framework calls (OB.*, Utilities.*, checkRule, function()):
  → decision: "Keep"
  → Translate expression: @Var@ → var, | → ||, & → &&, 'Y' → true
ELSE:
  → flag for AI review
```

**Callouts:**
```
IF no DML AND complexity == "low" AND effects <= 2:
  → decision: "Keep"
ELSE IF hasDml:
  → flag for AI review (with warning)
ELSE:
  → flag for AI review
```

**Validations:**
```
IF complexity == "low" AND no DML:
  → decision: "Keep"
ELSE:
  → flag for AI review
```

### Step 3: AI classification (flagged rules)

For each flagged rule, analyze:

1. **What does it do?** — Read effects, source analysis, SQL
2. **Is it critical for data integrity?** — DML, required field derivation
3. **Can it be simplified?** — Complex logic that could be a simple default
4. **Is it relevant to the simplified UI?** — Some rules only apply to classic Etendo

Decide for each rule:
- `decision`: Keep | Replace | Simplify | Omit
- `description`: Plain language explanation of the rule
- `impactIfOmitted`: What changes for the user if omitted
- `reason`: 1-sentence rationale for the decision (e.g. why Keep vs Simplify, why the DML matters or doesn't)

**Decision guide:**
| Scenario | Decision |
|----------|----------|
| Simple field dependency (BP → Address) | Keep |
| Price calculation from price list | Keep |
| Complex accounting allocation | Omit (backend handles) |
| UI-only formatting rule | Omit (new UI has its own) |
| Document sequence generation | Keep (but system-handled) |
| Cross-tab validation | Simplify (reduce to essential check) |
| Classic UI widget manipulation | Omit (not applicable) |

### Step 4: Human review (complex rules only)

If there are rules with DML, high complexity, or ambiguous impact, present to user:

```
These {N} rules need your review:

1. SL_Order_DocType (callout, HIGH complexity, HAS DML)
   Effects: documentType, paymentMethod, paymentTerms
   Impact if omitted: Users must manually set payment terms
   My suggestion: Simplify (keep auto-fill, remove DML)
   → Keep / Replace / Simplify / Omit?
```

### Step 5: Write decisions.json (rules section)

Add/update the `rules` key in `decisions.json`. Store ALL rules (they all require explicit decisions since auto-classification from raw uses different naming conventions).

```json
{
  "rules": {
    "BP_AutoFill_Address": {
      "type": "callout",
      "entity": "order",
      "decision": "Keep",
      "description": "Auto-fill address and price list from business partner",
      "impactIfOmitted": "Users must manually set address and price list after selecting BP",
      "reason": "Core UX flow — without this, BP selection becomes a 3-step manual process"
    },
    "SL_Order_Amt_QtyOrdered": {
      "type": "callout",
      "entity": "orderLine",
      "decision": "Keep",
      "description": "Recalculate line amount when quantity changes",
      "reason": "Simple arithmetic with no DML, essential for line total accuracy"
    }
  }
}
```

**Rule naming convention:** Use extended names that include trigger column when the callout fires on multiple columns: `{CalloutName}_{TriggerColumn}`. This distinguishes per-trigger decisions.

Merge into `artifacts/{window}/decisions.json` (the same file as the schema decisions).

---

## Phase 3: Post-Classification Pipeline

After writing schema-curated.json and rules-curated.json, run the FULL generation pipeline. Do NOT stop at classification.

### Step 1: Summary report

```
=== Classification Complete: {windowName} ===

Schema: {totalFields} fields
  - {N} editable, {N} readOnly, {N} system, {N} discarded
  - {N} grid columns, {N} searchable filters

Rules: {totalRules} rules
  - {N} Keep, {N} Replace, {N} Simplify, {N} Omit
```

### Step 2: Generate contract

Use the pipeline which automatically resolves `raw + decisions → curated` in memory:

```bash
node cli/src/pipeline.js --window {windowName} --steps resolve-curated,generate-contract,check-version
```

Or manually (for inspection):

```bash
node cli/src/resolve-curated.js --window {windowName} --dump
```

This resolves `schema-raw.json + rules-raw.json + decisions.json` into a curated schema in memory, then generates `contract.json`.

### Step 3: Check version

```bash
node cli/src/check-version.js {windowName} {owner}
```

Report the version bump (if any) and classification (breaking/additive/patch).
If BREAKING: warn the user before continuing.

### Step 4: Generate frontend

```bash
node -e "
import { generateAll } from './cli/src/generate-frontend.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const contract = JSON.parse(readFileSync('artifacts/{window}/contract.json','utf8'));
const files = generateAll(contract);
const outDir = 'artifacts/{window}/generated/web/{window}';
mkdirSync(outDir, { recursive: true });
for (const [name, code] of Object.entries(files)) writeFileSync(outDir+'/'+name, code);
console.log(Object.keys(files).length, 'components generated');
"
```

### Step 5: Run contract tests

```bash
node -e "
import { runContractTests } from './cli/src/run-contract-tests.js';
import { readFileSync } from 'node:fs';
const contract = JSON.parse(readFileSync('artifacts/{window}/contract.json','utf8'));
const r = runContractTests(contract);
console.log(r.passed+'/'+r.total+' passed, '+r.failed+' failed');
if (r.failed > 0) { r.results.filter(t=>!t.passed).forEach(t=>console.log('  FAIL:', t.description)); process.exit(1); }
"
```

### Step 6: Final report

```
=== Pipeline Complete: {windowName} ===

Classification: {N} fields, {N} rules
Contract: v{version} ({changeLevel})
Frontend: {N} components generated
Tests: {passed}/{total} passed

Files written:
  - artifacts/{window}/decisions.json       ← source of truth (commit this)
  - artifacts/{window}/contract.json
  - artifacts/{window}/contract-changelog.json
  - artifacts/{window}/generated/web/{window}/*.jsx

Note: schema-curated.json and rules-curated.json are gitignored (derived outputs).
```

### Step 7: Branch, commit, and PR (MANDATORY)

Classification work MUST go through a PR targeting `develop` (NEVER `main`).
The PR body MUST include `Closes #N` (where N is the lock issue number) to auto-unlock the window on merge.

```bash
# 1. Create feature branch
git checkout -b feature/classify-{windowName}

# 2. Stage and commit
git add artifacts/{window}/ cli/src/  # only changed files
git commit -m "feat: classify {windowName} schema fields and rules"

# 3. Push and create PR targeting develop
git push -u origin feature/classify-{windowName}
gh pr create --base develop --title "feat: classify {windowName} schema and rules" --body "$(cat <<'PREOF'
## Summary
- Classify {N} fields across {M} entities for {WindowName}
- {K} rules curated ({kept} Keep, {omitted} Omit)
- Contract v{version}, {tests} tests passing, {components} components generated

Closes #{lockIssueNumber}

## Test plan
- [ ] Contract tests pass
- [ ] CLI test suite passes (no regressions)
- [ ] Review curated schema field decisions
- [ ] Review curated rules decisions
PREOF
)"
```

**Rules:**
- PR ALWAYS targets `develop`, NEVER `main`
- `Closes #N` auto-closes the lock issue when PR is merged
- Do NOT manually unlock — let the PR close handle it

---

## Constraints

- NEVER add fields that don't exist in schema-raw.json
- NEVER change field column names
- Maximum 8 grid columns per entity (pick the most important)
- Maximum 5 searchable fields per entity
- Only store overrides in decisions.json — fields that match tier-1/2 defaults are omitted
- All output files must be valid JSON with 2-space indentation
- This skill replaces both `pre-classify.js` (deterministic) and `classify-rules` skill (AI)
- **decisions.json is the source of truth** — schema-curated.json and rules-curated.json are gitignored derived outputs

## Edge Cases

- **Window with no rules-raw.json**: Skip Phase 2, only classify schema
- **Window with decisions.json already**: Run `reconcile-schema.js` first. Never overwrite blindly — always diff first and work only on what changed (unless `--full` was specified).
- **Very large windows (100+ fields)**: Process in batches, show progress
- **Multi-entity windows**: Classify each entity separately, entity names must be unique
- **Window with schema-curated.json but no decisions.json**: This is a legacy window. Run `node cli/src/migrate-to-decisions.js --window {windowName}` to migrate it first.
