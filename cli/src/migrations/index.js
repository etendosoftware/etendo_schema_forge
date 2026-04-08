/**
 * migrations/index.js
 *
 * Registry and runner for decisions.json schema migrations.
 *
 * Each migration is a function: (decisions, context?) => decisions
 * that transforms the document from version N to version N+1.
 * Context is optional and provides external data (e.g., schemaRaw).
 *
 * The current (latest) version is exported as CURRENT_VERSION.
 * All decisions.json files without an explicit "version" field
 * are treated as version 1 (the original format).
 *
 * Exports:
 *   CURRENT_VERSION  - number, the latest schema version
 *   migrateDecisions(decisions, context?) - returns migrated decisions (new object, no mutation)
 *   needsMigration(decisions) - returns true if version < CURRENT_VERSION
 *   getVersion(decisions) - returns the numeric version of a decisions object
 */

// ---------------------------------------------------------------------------
// Migration registry
// ---------------------------------------------------------------------------

// Import migrations here as they are created:
import { migrate as v1ToV2 } from './v1-to-v2.js';

/**
 * Ordered list of migrations. Each entry:
 *   { fromVersion: N, toVersion: N+1, migrate: (decisions) => decisions }
 *
 * Migrations MUST be registered in ascending fromVersion order.
 * Each migration receives a deep-cloned decisions object and returns the transformed version.
 */
const MIGRATIONS = [
  { fromVersion: 1, toVersion: 2, migrate: v1ToV2 },
];

/**
 * Current schema version. Equals 1 + number of registered migrations,
 * or explicitly set when migrations exist.
 */
export const CURRENT_VERSION = MIGRATIONS.length > 0
  ? MIGRATIONS[MIGRATIONS.length - 1].toVersion
  : 1;

// ---------------------------------------------------------------------------
// Version detection
// ---------------------------------------------------------------------------

/**
 * Extract the numeric version from a decisions object.
 *
 * Priority:
 *   1. Explicit "version" field (number)
 *   2. Parse from "$schema" field (e.g., "decisions-v1" → 1)
 *   3. Default to 1 (original format)
 */
export function getVersion(decisions) {
  if (typeof decisions.version === 'number') {
    return decisions.version;
  }
  if (typeof decisions.$schema === 'string') {
    const match = decisions.$schema.match(/^decisions-v(\d+)$/);
    if (match) return parseInt(match[1], 10);
  }
  return 1;
}

// ---------------------------------------------------------------------------
// Migration check
// ---------------------------------------------------------------------------

/**
 * Returns true if the decisions object needs migration to reach CURRENT_VERSION.
 */
export function needsMigration(decisions) {
  return getVersion(decisions) < CURRENT_VERSION;
}

// ---------------------------------------------------------------------------
// Migration runner
// ---------------------------------------------------------------------------

/**
 * Run all necessary migrations to bring a decisions object to CURRENT_VERSION.
 *
 * Returns a new object (deep clone) — the input is never mutated.
 * If already at CURRENT_VERSION, returns a clone with no changes.
 *
 * Throws if a required migration is missing from the registry.
 *
 * @param {Object} decisions - parsed decisions.json content
 * @param {Object} [context={}] - optional context (e.g., { schemaRaw }) for migrations that need external data
 * @returns {{ decisions: Object, migrated: boolean, fromVersion: number, toVersion: number }}
 */
export function migrateDecisions(decisions, context = {}) {
  const fromVersion = getVersion(decisions);

  if (fromVersion >= CURRENT_VERSION) {
    return {
      decisions,
      migrated: false,
      fromVersion,
      toVersion: fromVersion,
    };
  }

  // Deep clone to avoid mutating the input
  let current = JSON.parse(JSON.stringify(decisions));
  let currentVersion = fromVersion;

  while (currentVersion < CURRENT_VERSION) {
    const migration = MIGRATIONS.find(m => m.fromVersion === currentVersion);
    if (!migration) {
      throw new Error(
        `No migration registered for version ${currentVersion} → ${currentVersion + 1}. ` +
        `Cannot upgrade decisions from v${fromVersion} to v${CURRENT_VERSION}.`
      );
    }

    current = migration.migrate(current, context);
    currentVersion = migration.toVersion;

    // Ensure the migration updated version markers
    current.version = currentVersion;
    current.$schema = `decisions-v${currentVersion}`;
  }

  return {
    decisions: current,
    migrated: true,
    fromVersion,
    toVersion: currentVersion,
  };
}
