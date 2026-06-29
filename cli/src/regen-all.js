#!/usr/bin/env node

/**
 * regen-all.js — Re-run the full pipeline for all registered windows.
 *
 * "Registered" = listed in cli/config/regen-windows.json AND has a decisions.json in artifacts/.
 * The registry decouples the regen pipeline from menu.json (which is a UI concern)
 * and lets us regenerate windows that live outside the standard menu (e.g. localization
 * modules like SII / TBAI / Verifactu).
 *
 * Usage:
 *   node cli/src/regen-all.js                  # extract + resolve + contract + frontend
 *   node cli/src/regen-all.js --push-to-neo    # also push to NEO Headless
 *   node cli/src/regen-all.js --only contacts,sales-order   # limit to specific windows
 *   node cli/src/regen-all.js --dry-run        # show what would run, don't execute
 */

import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..', '..');

const REGISTRY_PATH = join(ROOT, 'cli/config/regen-windows.json');
const ARTIFACTS = join(ROOT, 'artifacts');

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    pushToNeo: false,
    dryRun: false,
    only: null,
    skipExtract: false,
    writeCache: false,
    fromCache: false,
  };
  let i = 0;
  while (i < args.length) {
    if (args[i] === '--push-to-neo') {
      result.pushToNeo = true;
      i += 1;
    } else if (args[i] === '--dry-run') {
      result.dryRun = true;
      i += 1;
    } else if (args[i] === '--skip-extract') {
      result.skipExtract = true;
      i += 1;
    } else if (args[i] === '--write-cache') {
      result.writeCache = true;
      i += 1;
    } else if (args[i] === '--from-cache') {
      result.fromCache = true;
      i += 1;
    } else if (args[i] === '--only' && args[i + 1]) {
      result.only = args[i + 1].split(',').map(s => s.trim());
      i += 2;
    } else {
      i += 1;
    }
  }
  return result;
}

/**
 * Collect pipeline windows from the canonical registry.
 * A window is processed if it appears in cli/config/regen-windows.json AND has a
 * decisions.json in artifacts/. Entries without decisions.json are reported and skipped.
 * Returns array of { name, windowId }.
 */
async function getActiveWindows() {
  const registry = JSON.parse(await readFile(REGISTRY_PATH, 'utf8'));
  const windows = [];
  const skipped = [];
  for (const entry of registry.windows || []) {
    if (!entry.windowId || !entry.name) continue;
    const decisionsPath = join(ARTIFACTS, entry.name, 'decisions.json');
    try {
      await access(decisionsPath);
      windows.push({ name: entry.name, windowId: entry.windowId });
    } catch {
      skipped.push(entry.name);
    }
  }
  if (skipped.length > 0) {
    console.log(`Skipping ${skipped.length} window(s) without decisions.json: ${skipped.join(', ')}`);
  }
  return windows;
}

async function readPreviousWindowContracts(name) {
  let prevVersion = null;
  let prevContract = null;
  let prevMcpContract = null;
  let prevContractRaw = null;
  try {
    const existingRaw = await readFile(join(ARTIFACTS, name, 'contract.json'), 'utf-8');
    const existing = JSON.parse(existingRaw);
    let rawV = existing.version ?? null;
    while (rawV !== null && typeof rawV === 'object') rawV = rawV.version ?? null;
    prevVersion = rawV;
    prevContract = existing;
    prevContractRaw = existingRaw;
  } catch { /* first generation */ }
  try {
    const existingMcpRaw = await readFile(join(ARTIFACTS, name, 'contract.mcp.json'), 'utf-8');
    prevMcpContract = JSON.parse(existingMcpRaw);
  } catch { /* first split generation */ }
  return { prevVersion, prevContract, prevContractRaw, prevMcpContract };
}

/**
 * Run the full pipeline for one window.
 */
async function runPipeline(name, windowId, { pushToNeo, skipExtract }) {
  // Step 1: extract-from-db (raw CSVs)
  if (!skipExtract) {
    console.log(`  [F0] Extracting raw data from DB...`);
    const { QUERIES, rowsToCsv } = await import('./extract-from-db.js');
    const { createDbPool, closePool } = await import('./db.js');
    const { mkdir, writeFile } = await import('node:fs/promises');
    const pool = createDbPool();
    const outDir = join(ARTIFACTS, name, 'raw-query-results');
    await mkdir(outDir, { recursive: true });
    try {
      const queryNames = Object.keys(QUERIES);
      const results = await Promise.all(
        queryNames.map(qn => pool.query(QUERIES[qn], [windowId]))
      );
      for (let i = 0; i < queryNames.length; i++) {
        const csv = rowsToCsv(results[i].rows);
        await writeFile(join(outDir, `${queryNames[i]}.csv`), csv, 'utf-8');
      }
    } finally {
      await closePool(pool);
    }
  }

  // Step 2: extract-fields (schema-raw.json)
  console.log(`  [F1a] Extracting fields...`);
  const { main: extractFields } = await import('./extract-fields.js');
  await extractFields(windowId, name);

  // Step 3: extract-rules (rules-raw.json)
  console.log(`  [F1b] Extracting rules...`);
  const { main: extractRules } = await import('./extract-rules.js');
  await extractRules(windowId, name);

  // Step 4: resolve-curated (in memory → contract)
  console.log(`  [F4] Resolving curated schema...`);
  const { resolveCurated } = await import('./resolve-curated.js');
  const schemaRaw = JSON.parse(await readFile(join(ARTIFACTS, name, 'schema-raw.json'), 'utf8'));
  const rulesRaw = JSON.parse(await readFile(join(ARTIFACTS, name, 'rules-raw.json'), 'utf8'));
  const decisionsPath = join(ARTIFACTS, name, 'decisions.json');
  let decisions = JSON.parse(await readFile(decisionsPath, 'utf8'));

  // Auto-migrate if needed
  const { needsMigration, getVersion, migrateDecisions } = await import('./migrations/index.js');
  if (needsMigration(decisions)) {
    const fromV = getVersion(decisions);
    const result = migrateDecisions(decisions, { schemaRaw });
    decisions = result.decisions;
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(decisionsPath, JSON.stringify(decisions, null, 2) + '\n', 'utf-8');
    console.log(`    decisions.json auto-migrated: v${fromV} → v${result.toVersion}`);
  }

  const resolved = await resolveCurated(schemaRaw, rulesRaw, decisions);
  const totalFields = resolved.schema.entities.reduce((sum, e) => sum + e.fields.length, 0);
  console.log(`    ${totalFields} fields across ${resolved.schema.entities.length} entities`);

  // Step 5: generate-contract
  console.log(`  [F6] Generating contract...`);
  const { generateContract, splitWindowContractArtifacts } = await import('./generate-contract.js');
  const { writeFile: wf2, access: acc2, mkdir: mk2 } = await import('node:fs/promises');
  const processesPath = join(ARTIFACTS, name, 'processes.json');
  try { await acc2(processesPath); } catch {
    await mk2(join(ARTIFACTS, name), { recursive: true });
    await wf2(processesPath, JSON.stringify({ processes: [] }, null, 2) + '\n');
  }
  const processes = JSON.parse(await readFile(processesPath, 'utf8'));

  const { prevVersion, prevContract, prevContractRaw, prevMcpContract } = await readPreviousWindowContracts(name);

  const rules = Array.isArray(resolved.rules) ? resolved.rules : resolved.rules?.rules || [];
  const generatedContract = generateContract(resolved.schema, rules, processes.processes || [], prevVersion, prevContract);
  const { contract, mcpContract } = splitWindowContractArtifacts(generatedContract, prevContract, prevMcpContract);
  if (prevContractRaw) {
    await wf2(join(ARTIFACTS, name, 'contract.prev.json'), prevContractRaw, 'utf-8');
  }
  await wf2(join(ARTIFACTS, name, 'contract.json'), JSON.stringify(contract, null, 2) + '\n');
  await wf2(join(ARTIFACTS, name, 'contract.mcp.json'), JSON.stringify(mcpContract, null, 2) + '\n');
  console.log(`    Contract: ${contract.testManifest.summary.total} tests`);

  // Version check (advisory)
  try {
    const { checkVersion } = await import('./check-version.js');
    const vr = await checkVersion(name, 'pipeline');
    if (vr) console.log(`    Version: ${vr.changelog.from} → ${vr.newVersion} (${vr.classification.level})`);
  } catch { /* skip */ }

  // Step 6 (optional): push-to-neo
  if (pushToNeo) {
    console.log(`  [F7] Pushing to NEO Headless...`);
    const { pushToNeo: pushFn } = await import('./push-to-neo.js');
    const result = await pushFn(name, { dryRun: false });
    console.log(`    ${result.fieldsUpdated} fields configured`);
  }

  // Step 7: generate-frontend
  console.log(`  [F8] Generating frontend...`);
  const { generateAll } = await import('./generate-frontend.js');
  const { generateMockDataFile } = await import('./generate-mock-data.js');
  const { resolve: rp } = await import('node:path');
  const contractFinal = JSON.parse(await readFile(join(ARTIFACTS, name, 'contract.json'), 'utf8'));
  const files = generateAll(contractFinal);
  const outDir = join(ARTIFACTS, name, 'generated/web', name);
  await mk2(outDir, { recursive: true });

  for (const [filename, code] of Object.entries(files)) {
    if (filename.startsWith('__')) continue;
    await wf2(rp(outDir, filename), code, 'utf8');
  }
  await wf2(rp(outDir, 'mockData.js'), generateMockDataFile(contractFinal), 'utf8');

  const count = Object.keys(files).filter(k => !k.startsWith('__')).length;
  console.log(`    ${count} components generated`);
}

async function configureCacheMode(opts) {
  if (opts.writeCache && opts.fromCache) {
    console.error('Error: --write-cache and --from-cache are mutually exclusive');
    process.exit(1);
  }
  if (opts.writeCache || opts.fromCache) {
    const { setCacheMode } = await import('./db.js');
    setCacheMode({ mode: opts.writeCache ? 'write' : 'read' });
  }
}

async function selectWindows(opts) {
  let windows = await getActiveWindows();
  if (opts.only) {
    const available = new Set(windows.map(w => w.name));
    const invalid = opts.only.filter(n => !available.has(n));
    if (invalid.length > 0) {
      console.warn(`Warning: not in menu or no windowId: ${invalid.join(', ')}`);
    }
    windows = windows.filter(w => opts.only.includes(w.name));
  }
  return windows;
}

function logRunHeader(opts, windows) {
  console.log(`\n=== Schema Forge: Regenerate All ===`);
  console.log(`Windows (${windows.length}): ${windows.map(w => w.name).join(', ')}`);
  console.log(`Push to NEO: ${opts.pushToNeo ? 'YES' : 'no'}`);
  console.log(`Skip extract: ${opts.skipExtract ? 'YES' : 'no'}`);
  if (opts.writeCache) console.log(`Cache mode: WRITE (will refresh cli/cache/ad-snapshot.json)`);
  if (opts.fromCache) console.log(`Cache mode: READ (no DB connection — serving from cli/cache/ad-snapshot.json)`);
  console.log();
}

async function runAllPipelines(windows, opts) {
  let passed = 0;
  let failed = 0;
  const errors = [];
  for (const { name, windowId } of windows) {
    console.log(`\n[${passed + failed + 1}/${windows.length}] ${name}`);
    try {
      await runPipeline(name, windowId, { pushToNeo: opts.pushToNeo, skipExtract: opts.skipExtract });
      passed++;
      console.log(`  ✓ done`);
    } catch (err) {
      failed++;
      errors.push({ name, error: err.message });
      console.error(`  ✗ FAILED: ${err.message}`);
    }
  }
  return { passed, failed, errors };
}

async function main() {
  const opts = parseArgs(process.argv);
  await configureCacheMode(opts);

  const windows = await selectWindows(opts);
  if (windows.length === 0) {
    console.log('No active windows to process.');
    return;
  }

  logRunHeader(opts, windows);

  if (opts.dryRun) {
    console.log('Dry run — nothing executed.');
    return;
  }

  const { passed, failed, errors } = await runAllPipelines(windows, opts);

  if (opts.writeCache) {
    const { flushCacheWrites } = await import('./db.js');
    const { written, path } = flushCacheWrites();
    console.log(`\nCache: wrote ${written} entries to ${path}`);
  }

  console.log(`\n=== Summary ===`);
  console.log(`Passed: ${passed}/${windows.length}`);
  if (failed > 0) {
    console.log(`Failed: ${failed}`);
    errors.forEach(e => console.log(`  - ${e.name}: ${e.error}`));
    process.exit(1);
  }

  if (opts.pushToNeo) {
    console.log(`\nNext: cd <etendo_root> && ./gradlew export.database --info`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
