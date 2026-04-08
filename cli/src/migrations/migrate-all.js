/**
 * migrate-all.js
 *
 * Batch migration CLI: upgrades all decisions.json files to the current version.
 *
 * Usage:
 *   node cli/src/migrations/migrate-all.js [--dry-run] [--window <name>]
 *
 * Options:
 *   --dry-run     Show what would change without writing files
 *   --window <n>  Migrate only the specified window (can be repeated)
 */

import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CURRENT_VERSION, getVersion, needsMigration, migrateDecisions } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..', '..', '..');
const ARTIFACTS_DIR = join(ROOT, 'artifacts');

async function findDecisionsFiles(specificWindows) {
  if (specificWindows.length > 0) {
    return specificWindows.map(w => ({
      windowName: w,
      path: join(ARTIFACTS_DIR, w, 'decisions.json'),
    }));
  }

  const entries = await readdir(ARTIFACTS_DIR, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const decisionsPath = join(ARTIFACTS_DIR, entry.name, 'decisions.json');
    try {
      await stat(decisionsPath);
      results.push({ windowName: entry.name, path: decisionsPath });
    } catch {
      // No decisions.json in this directory
    }
  }

  return results.sort((a, b) => a.windowName.localeCompare(b.windowName));
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  const specificWindows = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--window' && args[i + 1]) {
      specificWindows.push(args[i + 1]);
      i++;
    }
  }

  const files = await findDecisionsFiles(specificWindows);

  if (files.length === 0) {
    console.log('No decisions.json files found.');
    return;
  }

  console.log(`Current schema version: ${CURRENT_VERSION}`);
  console.log(`Found ${files.length} decisions.json file(s)\n`);

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const { windowName, path } of files) {
    try {
      const raw = await readFile(path, 'utf-8');
      const decisions = JSON.parse(raw);
      const version = getVersion(decisions);

      if (!needsMigration(decisions)) {
        console.log(`  ${windowName}: v${version} (current) — skipped`);
        skipped++;
        continue;
      }

      // Read schema-raw.json for context (needed by v1->v2 entity key migration)
      const schemaRawPath = join(ARTIFACTS_DIR, windowName, 'schema-raw.json');
      let schemaRaw = null;
      try {
        schemaRaw = JSON.parse(await readFile(schemaRawPath, 'utf-8'));
      } catch {
        // No schema-raw.json — migration will skip entity remapping
      }

      const result = migrateDecisions(decisions, { schemaRaw });
      console.log(`  ${windowName}: v${result.fromVersion} → v${result.toVersion}`);

      if (!dryRun) {
        await writeFile(path, JSON.stringify(result.decisions, null, 2) + '\n', 'utf-8');
      }

      migrated++;
    } catch (err) {
      console.error(`  ${windowName}: ERROR — ${err.message}`);
      errors++;
    }
  }

  console.log(`\nSummary: ${migrated} migrated, ${skipped} up-to-date, ${errors} errors`);
  if (dryRun) console.log('(dry-run mode — no files were written)');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
