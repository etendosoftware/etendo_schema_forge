---
name: generate-ui
description: Use when regenerating UI from schema-curated changes, adding new entity windows, or running the F6-F8-F9 generation pipeline. Triggers on schema edits, new entity creation, field type changes, or master-detail conversions.
---

# Schema Forge UI Generation Pipeline

## Overview

Generate contract + frontend from schema-curated.json using a temp-diff-patch flow. Clean diffs auto-apply; ambiguous changes prompt the user. Always runs through the team pipeline (DEV-REVIEW-QA-MERGE).

## Flow

```dot
digraph generation {
  "schema-curated.json" -> "Generate in temp";
  "Generate in temp" -> "Diff vs existing";
  "Diff vs existing" -> "No changes" [label="clean"];
  "Diff vs existing" -> "Auto-apply patch" [label="additions/updates"];
  "Diff vs existing" -> "Ask user" [label="conflict/ambiguous"];
  "Ask user" -> "Apply selected patches";
  "Auto-apply patch" -> "Generation Log";
  "Apply selected patches" -> "Generation Log";
  "Generation Log" -> "Run contract tests (F9)";
  "Run contract tests (F9)" -> "Run unit tests";
  "Run unit tests" -> "Pipeline: DEV-REVIEW-QA-MERGE";
  "Pipeline: DEV-REVIEW-QA-MERGE" -> "Verify in browser";
}
```

## Step 0: Create Schema + Mock (New Entities Only)

For NEW entities, create the schema and mock data before running the pipeline.

### Schema
Create `artifacts/{window}/schema-curated.json` following the entity pattern:
- Single entity: one entity in `entities[]`
- Master-detail: two entities, child has `derivation.type: "fromParent"`

Required system fields (copy from any existing schema):
- `adClientId` (fromConfig: context.client)
- `adOrgId` (fromConfig: context.organization)
- `created` (computed: now())
- `updated` (computed: now())

### Rules
Create `artifacts/{window}/rules-curated.json`:
```json
{ "version": "0.1.0", "rules": [] }
```

### Mock Data
After F8 generates `mockData.js`, replace the placeholder with realistic sample data (10-20 records).
FK fields must use IDs that match the referenced catalog.

### Registration

Add the new window to these files:

1. **`tools/app-shell/src/menu.json`** -- Add the window to the correct menu group.

   **AI Menu Placement Rules:**
   - Read `tools/app-shell/src/menu.json` to see current groups and items.
   - Classify the window into the best-fit group based on its domain:

     | Domain pattern | Group |
     |----------------|-------|
     | Sales documents (orders, invoices, shipments) | Sales |
     | Purchasing, requisitions, goods receipts, vendor returns | Procurement |
     | Entities referenced by FK (partners, products, warehouses) | Master Data |
     | Pricing, payments, taxes, currencies | Finance |
     | Configuration, units, users, roles | System |

   - If no existing group fits, create a new group with an appropriate `icon` from lucide-react.
   - Place the item at a logical position within the group (transactional docs first, supporting entities after).
   - Use the window slug as `name` and a human-readable title as `label`.

   Example -- adding "Credit Note" to Sales:
   ```json
   { "name": "credit-note", "label": "Credit Note" }
   ```

2. **`tools/app-shell/src/windows/registry.js`** -- Add a loader entry in `windowLoaders`:
   ```js
   '<window-slug>': () => import('@generated/<window-slug>/generated/web/<window-slug>/index.jsx'),
   ```

3. **`tools/app-shell/src/App.jsx`** -- Add a mockData import in `loadAllMockData()`:
   ```js
   import('@generated/<window-slug>/generated/web/<window-slug>/mockData.js'),
   ```

## Step 1: Worktree Isolation (MANDATORY)

```bash
git worktree add .worktrees/feat-<name> -b feat/<name>
```

ALL work happens in the worktree. Never modify main directly.

## Step 2: Generate Contract + Frontend

```bash
WINDOW="<window-name>"

# F6: Generate contract
node cli/src/generate-contract.js \
  artifacts/$WINDOW/schema-curated.json \
  artifacts/$WINDOW/rules-curated.json

# F8: Generate frontend
node cli/src/generate-frontend.js \
  artifacts/$WINDOW/contract.json
```

Output in `artifacts/{window}/generated/web/{window}/`:
- `*Table.jsx` -- declarative column config imports `DataTable`
- `*Form.jsx` -- declarative field config imports `EntityForm`
- `*Page.jsx` -- `MasterDetailPage` (if detail entity) or `SingleEntityPage`
- `index.jsx` -- entry point
- `mockCatalogs.js` -- reference data for FK fields
- `mockData.js` -- sample records (manual, not auto-generated)

## Step 3: Diff and Patch

```bash
git diff artifacts/$WINDOW/
```

| Diff type | Action |
|-----------|--------|
| New files only | Auto-apply |
| Field added/removed | Auto-apply |
| Type changed (string to boolean) | Auto-apply |
| Component structure changed | Review diff, ask user if unclear |
| mockData.js changed | SKIP -- manually curated |
| Hand-edited file overwritten | ASK user -- show diff |

## Step 4: Generation Log

```bash
node cli/src/generation-log.js <window-name> "<trigger-description>"
```

This diffs current files (disk) vs previous (git HEAD), appends to `artifacts/generation-log.json`, and generates:
- Per-window: `artifacts/{window}/GENERATION-LOG.md`
- Transversal: `artifacts/GENERATION-RUNS.md`

## Step 5: Run Tests

```bash
# F9: Contract tests
node -e "
import { runContractTests } from './cli/src/run-contract-tests.js';
import { readFileSync } from 'node:fs';
const c = JSON.parse(readFileSync('artifacts/$WINDOW/contract.json','utf8'));
const r = runContractTests(c);
console.log(r.passed+'/'+r.total+' passed');
if(r.failed>0) process.exit(1);
"

# Unit tests
node --test 'cli/test/*.test.js'
```

## Step 6: Pipeline (DEV-REVIEW-QA-MERGE)

1. Commit in worktree
2. Push: `git push -u origin feat/<name>`
3. PR: `gh pr create --title "..." --body "..."`
4. REVIEW (Alex agent): comment verdict on PR
5. QA (Sentinel agent): tests + artifact regeneration check
6. MERGE: `gh pr merge <n> --squash`
7. Cleanup: remove worktree, delete branch, pull main

## Step 7: Verify in Browser

Dev server at localhost:3102. Use chrome-devtools MCP to reload, navigate, screenshot, verify CRUD.

## Entity Patterns

**Single Entity** (Warehouse, Tax, UOM, etc.): ONE entity in schema, generates `SingleEntityPage`.

**Master-Detail** (Sales Order to Lines, BP to Locations, PriceList to Lines): TWO entities, generates `MasterDetailPage`. Child entity must have system field with `derivation.type: "fromParent"`.

## Field Type Mapping

| Schema type | Table column | Form input |
|-------------|-------------|------------|
| string | string | text |
| number/integer | number | number |
| amount | amount | number |
| date | date | date |
| boolean | boolean (Yes/No) | checkbox |
| foreignKey + search | -- | search (autocomplete) |
| foreignKey + selector | -- | selector (dropdown) |
| foreignKey + dependent | -- | dependent (filtered dropdown) |

## FK inputMode Rules

| Cardinality | inputMode | Component |
|-------------|-----------|-----------|
| Many records (BP, Product) | search | SearchInput |
| Few records (Warehouse, Tax) | selector | SelectorInput |
| Filtered by parent | dependent | DependentSelect |

Dependent fields need `dependsOn: { field: "parentKey", filterKey: "parentIdColumn" }`.

## Schema Constraints (INVIOLABLE)

- Only `visibility: editable` or `readOnly` in UI
- System fields NEVER in UI
- Only `searchable: true` fields become filters
- `grid: true` appears in table, `form: true` in edit form
- FK `reference` must match a catalog entity

## Multi-Window Registration

When adding a window, update:
1. `tools/app-shell/src/menu.json` -- add item to correct group (see AI Menu Placement Rules above)
2. `tools/app-shell/src/windows/registry.js` -- add loader entry in `windowLoaders`
3. `tools/app-shell/src/App.jsx` -- add mockData import in `loadAllMockData()`
4. Verify `@generated` alias in vite.config.js

## Regenerate All Entities

After generator changes, regenerate all windows listed in `tools/app-shell/src/menu.json`:

```bash
# Extract all window slugs from menu.json
WINDOWS=$(node -e "
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const m = require('./tools/app-shell/src/menu.json');
console.log(m.menu.flatMap(g => g.items.map(i => i.name)).join(' '));
")

for dir in $WINDOWS; do
  [ -f "artifacts/$dir/schema-curated.json" ] || continue
  node cli/src/generate-contract.js "artifacts/$dir/schema-curated.json" \
    "artifacts/$dir/rules-curated.json"
  node cli/src/generate-frontend.js "artifacts/$dir/contract.json"
  node cli/src/generation-log.js "$dir" "<trigger>"
done
```

## Pixel Agents Notification

```bash
echo '{"session":"schema-forge","from":"Forge","text":"<msg>","ts":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}' >> ~/.pixel-agents/chat.jsonl
```

Notify on: DEV complete, REVIEW verdict, QA verdict, PR merged.
