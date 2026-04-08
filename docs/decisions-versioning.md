# Decisions Versioning and Migration

## Overview

The `decisions.json` files contain human and AI-curated design decisions for each window. As the schema evolves (new properties, renamed fields, restructured sections), existing decisions files need a path to upgrade without manual intervention.

The versioning system provides:
- **Automatic migration with persist** — any tool that reads `decisions.json` auto-migrates and writes back to disk
- **Batch migration CLI** — upgrade all windows at once (useful after bumping the version)
- **Forward-only migrations** — each migration is a pure function from version N to N+1, chained as needed

## Version Field

Every `decisions.json` includes two version markers:

```json
{
  "$schema": "decisions-v1",
  "version": 1,
  ...
}
```

| Field | Type | Purpose |
|-------|------|---------|
| `$schema` | string | Human-readable version tag (`decisions-v{N}`) |
| `version` | number | Machine-readable version for comparison |

Files without an explicit `version` field are treated as version 1 (backward compatible with all existing files).

## How It Works

### Architecture

```
cli/src/migrations/
├── index.js            # Registry, version detection, migration runner
├── migrate-all.js      # Batch CLI tool
├── v1-to-v2.js         # First migration (when needed)
├── v2-to-v3.js         # Second migration (when needed)
└── ...
```

### Migration Registry (`index.js`)

The registry exports:

| Export | Type | Description |
|--------|------|-------------|
| `CURRENT_VERSION` | number | The latest schema version |
| `getVersion(decisions)` | function | Extract version from a decisions object |
| `needsMigration(decisions)` | function | True if version < CURRENT_VERSION |
| `migrateDecisions(decisions)` | function | Run all needed migrations, return new object |

Migrations are registered as an ordered array:

```js
const MIGRATIONS = [
  { fromVersion: 1, toVersion: 2, migrate: v1ToV2 },
  { fromVersion: 2, toVersion: 3, migrate: v2ToV3 },
];
```

### Migration Flow

```
decisions.json (v1) loaded from disk
        │
        ▼
getVersion() → 1
        │
        ▼
needsMigration() → true (CURRENT_VERSION = 3)
        │
        ▼
migrateDecisions():
  deep clone → v1ToV2() → v2ToV3() → return v3 object
        │
        ▼
resolve-curated.js uses migrated object (in-memory)
```

### Integration Points

The migration system is integrated at three points:

1. **`resolve-curated.js`** — Auto-migrates and writes back to disk before resolving. Also migrates in-memory inside `resolveCurated()` as a safety net.

2. **`pipeline.js`** — Auto-migrates and writes back to disk when loading decisions in the resolve-curated step.

3. **`reconcile-schema.js`** — Auto-migrates and writes back to disk before comparing raw vs decisions.

## Writing a New Migration

When you need to change the decisions.json structure:

### Step 1: Create the migration file

```js
// cli/src/migrations/v1-to-v2.js

/**
 * Migration: decisions v1 → v2
 *
 * Change: moved discardPatterns from top-level to per-entity.
 * Reason: different entities may need different discard patterns.
 */
export function migrate(decisions) {
  const globalPatterns = decisions.discardPatterns || [];
  delete decisions.discardPatterns;

  for (const [name, entity] of Object.entries(decisions.entities || {})) {
    entity.discardPatterns = [...globalPatterns];
  }

  // version and $schema are set automatically by the runner
  return decisions;
}
```

### Step 2: Register in the index

```js
// cli/src/migrations/index.js
import { migrate as v1ToV2 } from './v1-to-v2.js';

const MIGRATIONS = [
  { fromVersion: 1, toVersion: 2, migrate: v1ToV2 },
];
```

### Step 3: Test the migration

Every migration should have tests that verify:
- Correct structural transformation
- `null` vs `undefined` semantics are preserved (null = active override, undefined = use default)
- Roundtrip: `resolveCurated(raw, rules, migratedDecisions)` produces the same output as the old version would have
- Edge cases: empty entities, empty fields, missing optional properties

### Step 4: Batch upgrade (optional)

```bash
# Preview what would change
node cli/src/migrations/migrate-all.js --dry-run

# Migrate all windows
node cli/src/migrations/migrate-all.js

# Migrate a specific window
node cli/src/migrations/migrate-all.js --window purchase-order
```

## Migration Rules

1. **Pure functions only** — migrations receive a deep-cloned object and return the transformed result. No side effects, no DB access, no file I/O.

2. **Preserve null semantics** — In decisions.json, `null` means "suppress the raw value" while omitting a property means "use the raw value." Migrations must not confuse these.

3. **Forward-only** — There are no downgrade migrations. Once a file is upgraded, it stays at the new version.

4. **Backward-compatible reads** — `resolve-curated.js` always migrates in-memory, so old files continue to work without manual intervention. The file on disk can remain at an older version indefinitely.

5. **Atomic batch writes** — When running `migrate-all.js`, all files are processed independently. A failure in one window does not prevent others from migrating.

6. **Version markers are automatic** — The migration runner sets `version` and `$schema` after each step. Individual migration functions do not need to set them (but can if they want).

## CLI Reference

### Check version of a specific window

```bash
node -e "
  const d = require('./artifacts/purchase-order/decisions.json');
  console.log('version:', d.version || 1, '(\$schema:', d.\$schema || 'none', ')');
"
```

### Batch migration

```bash
# Dry run (show what would change)
node cli/src/migrations/migrate-all.js --dry-run

# Migrate all
node cli/src/migrations/migrate-all.js

# Migrate specific windows
node cli/src/migrations/migrate-all.js --window purchase-order --window sales-order
```

## FAQ

**Q: What happens if I run the pipeline on an old decisions.json?**
A: It auto-migrates and writes back to disk. You'll see a log line like `decisions.json auto-migrated: v1 → v3`. The file is updated in place.

**Q: Should I commit migrated files?**
A: Yes. Since tools auto-migrate on read, you'll see diffs in `decisions.json` after the first pipeline run. Commit them to avoid repeated migrations.

**Q: What if I need to change how existing fields work, not just add new ones?**
A: That's exactly what migrations are for. Write a migration that transforms the old structure to the new one. The key is ensuring the resolved output (curated schema) remains identical before and after migration — the migration changes the representation, not the semantics.

**Q: Can I skip versions?**
A: No. Migrations chain sequentially (v1→v2→v3). Each step is small and testable. The runner handles chaining automatically.
