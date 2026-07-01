#!/usr/bin/env node

import { toSpecName, pushProcessToNeo } from './push-to-neo.js';

/**
 * Resolve a window's spec name (kebab-case) from its AD_Window_ID by querying
 * AD_Window.Name. Throws if the window is not found. Used by the CLI to
 * eliminate the legacy "default to sales-order" behavior when only a windowId
 * is provided.
 *
 * `queryFn` is injectable for tests: it must return a Promise resolving to
 * `{ rows: [{ name }] }`. When absent, a real DB pool is created via db.js.
 */
export async function resolveWindowNameFromId(windowId, { queryFn } = {}) {
  if (!windowId) throw new Error('windowId is required to resolve windowName');

  let rows;
  if (queryFn) {
    const result = await queryFn(windowId);
    rows = result?.rows ?? [];
  } else {
    const { createDbPool, closePool } = await import('./db.js');
    const pool = createDbPool();
    try {
      const result = await pool.query(
        'SELECT Name FROM AD_Window WHERE AD_Window_ID = $1',
        [windowId]
      );
      rows = result.rows;
    } finally {
      await closePool(pool);
    }
  }

  if (!rows || rows.length === 0) {
    throw new Error(`AD_Window not found for windowId: ${windowId}`);
  }
  const name = rows[0].name ?? rows[0].Name;
  if (!name) throw new Error(`AD_Window row missing Name for windowId: ${windowId}`);
  return toSpecName(name);
}

export function validatePipelineInput(input) {
  if (input.menuId || input.menuName) {
    return { valid: true, mode: 'menu' };
  }

  if (input.reportId) {
    if (!input.reportName) return { valid: false, error: 'reportName is required for report mode' };
    return { valid: true, mode: 'report' };
  }

  if (input.processId) {
    if (!input.processName) return { valid: false, error: 'processName is required for process mode' };
    return { valid: true, mode: 'process' };
  }

  if (!input.windowId) return { valid: false, error: 'windowId is required' };
  if (!input.windowName) return { valid: false, error: 'windowName is required' };
  return { valid: true, mode: 'window' };
}

export function buildPipelineSteps() {
  return [
    { name: 'extract-fields', description: 'Extract field metadata from Etendo DB', phase: 'F1a' },
    { name: 'extract-rules', description: 'Extract business rules and callouts', phase: 'F1b' },
    { name: 'validate', description: 'Validate schema (4 levels) and processes', phase: 'F2' },
    { name: 'pre-classify', description: 'Pre-classify rules (deterministic + AI)', phase: 'F3' },
    { name: 'resolve-curated', description: 'Resolve raw + decisions.json → curated schema in memory', phase: 'F4' },
    { name: 'generate-contract', description: 'Generate frontend/backend contracts + test manifest', phase: 'F6' },
    { name: 'check-version', description: 'Check contract version and classify changes', phase: 'F6b' },
    { name: 'push-to-neo', description: 'Configure NEO Headless via webhooks (from contract)', phase: 'F7' },
    { name: 'validate-field-names', description: 'Validate field names match NEO API (optional)', phase: 'F7b', optional: true },
    { name: 'generate-frontend', description: 'Generate React components from contract', phase: 'F8' },
    { name: 'translate-todos', description: 'AI-assisted translation of callout/onchange TODO comments', phase: 'F8b', interactive: true },
    { name: 'run-tests', description: 'Run contract tests (Node.js side)', phase: 'F9' },
  ];
}

export function buildProcessPipelineSteps() {
  return [
    { name: 'extract-process', description: 'Extract process metadata + parameters from Etendo DB', phase: 'P1' },
    { name: 'generate-process-contract', description: 'Generate process contract', phase: 'P2' },
    { name: 'push-process-to-neo', description: 'Configure NEO Headless for process via DB writes', phase: 'P3' },
    { name: 'generate-process-frontend', description: 'Generate process form component', phase: 'P4' },
    { name: 'run-tests', description: 'Run contract tests', phase: 'P5' },
  ];
}

/**
 * Parse CLI arguments for window, process, and report modes.
 */
export function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {};

  let i = 0;
  while (i < args.length) {
    i += consumeArgument(args, i, result);
  }

  return result;
}

/**
 * Consume one logical argument at index `i`, mutating `result`.
 * Returns the number of tokens consumed (2 for flag+value, 1 otherwise),
 * so the caller advances the cursor without reassigning a loop counter.
 */
function consumeArgument(args, i, result) {
  if (isMenuIdArgument(args, i)) {
    result.menuId = args[i + 1];
    return 2;
  } else if (isMenuNameArgument(args, i)) {
    result.menuName = args[i + 1];
    return 2;
  } else if (isProcessIdArgument(args, i)) {
    result.processId = args[i + 1];
    return 2;
  } else if (isProcessNameArgument(args, i)) {
    result.processName = args[i + 1];
    return 2;
  } else if (isReportIdArgument(args, i)) {
    result.reportId = args[i + 1];
    return 2;
  } else if (isReportNameArgument(args, i)) {
    result.reportName = args[i + 1];
    return 2;
  } else if (args[i] === '--dry-run') {
    result.dryRun = true;
  } else if (isSkipToArgument(args, i)) {
    result.skipTo = args[i + 1];
    return 2;
  } else if (args[i] === '--skip-interactive') {
    result.skipInteractive = true;
  } else if (!args[i].startsWith('--') && !result.windowId) {
    result.windowId = args[i];
  } else if (isWindowNameSet(args, i, result)) {
    result.windowName = args[i];
  }
  return 1;
}

function isWindowNameSet(args, i, result) {
  return !args[i].startsWith('--') && result.windowId && !result.windowName;
}

function isSkipToArgument(args, i) {
  return args[i] === '--skip-to' && args[i + 1];
}

function isReportNameArgument(args, i) {
  return args[i] === '--report-name' && args[i + 1];
}

function isReportIdArgument(args, i) {
  return args[i] === '--report-id' && args[i + 1];
}

function isProcessNameArgument(args, i) {
  return args[i] === '--process-name' && args[i + 1];
}

function isProcessIdArgument(args, i) {
  return args[i] === '--process-id' && args[i + 1];
}

function isMenuNameArgument(args, i) {
  return args[i] === '--menu-name' && args[i + 1];
}

function isMenuIdArgument(args, i) {
  return args[i] === '--menu-id' && args[i + 1];
}

/**
 * Print context-sensitive next steps based on what the pipeline executed.
 */
function printNextSteps({ pushToNeoRan, frontendGenerated }) {
  if (!pushToNeoRan && !frontendGenerated) return;

  console.log('Next steps:');

  if (pushToNeoRan && frontendGenerated) {
    console.log('  → UI is deployed in the separate container now; legacy copy flow only if needed:');
    console.log('    make deploy LEGACY_DEPLOY=1');
    console.log('    cd <etendo_root> && ./gradlew smartbuild export.database --info');
    console.log('  → Restart Tomcat (if not using Docker — Docker auto-restarts after a few seconds)');
  } else if (pushToNeoRan) {
    console.log('  → Run export.database to persist NEO config to XML sourcedata:');
    console.log('    cd <etendo_root> && ./gradlew export.database --info');
  } else if (frontendGenerated) {
    console.log('  → UI is deployed in the separate container now; legacy copy flow only if needed:');
    console.log('    make deploy LEGACY_DEPLOY=1');
    console.log('    cd <etendo_root> && ./gradlew smartbuild --info');
    console.log('  → Restart Tomcat (if not using Docker — Docker auto-restarts after a few seconds)');
  }
}

// CLI entry point
async function main() {
  const parsed = parseArgs(process.argv);

  // When invoked with only a windowId (positional), resolve windowName from
  // AD_Window in the DB instead of silently defaulting to 'sales-order'.
  // The old default could mix artifacts from unrelated windows into
  // artifacts/sales-order/, so it has been removed.
  if (
    !parsed.processId &&
    !parsed.reportId &&
    !parsed.menuId &&
    !parsed.menuName &&
    !parsed.windowName &&
    parsed.windowId
  ) {
    try {
      parsed.windowName = await resolveWindowNameFromId(parsed.windowId);
    } catch (err) {
      console.error(`Error: could not resolve windowName from windowId "${parsed.windowId}": ${err.message}`);
      console.error('Pass the windowName explicitly: sf-pipeline <windowId> <windowName>');
      process.exit(1);
    }
  }

  const validation = validatePipelineInput(parsed);
  if (!validation.valid) {
    console.error(`Error: ${validation.error}`);
    console.error('Usage:');
    console.error('  sf-pipeline <windowId> [windowName]                    # Window mode');
    console.error('  sf-pipeline --process-id <id> --process-name <name>    # Process mode');
    console.error('  sf-pipeline --menu-id <id>                             # Auto-detect from AD_Menu');
    console.error('  sf-pipeline --menu-name <name>                         # Auto-detect from AD_Menu by name');
    console.error('  sf-pipeline --report-id <id> --report-name <name>      # Report mode');
    process.exit(1);
  }

  if (validation.mode === 'menu') {
    const { resolveMenuEntry, resolveMenuByName } = await import('./resolve-menu.js');
    const resolved = parsed.menuId
      ? await resolveMenuEntry(parsed.menuId)
      : await resolveMenuByName(parsed.menuName);
    console.log(`Menu entry '${resolved.menuName}' resolved as ${resolved.resolvedMode} (${resolved.resolvedName})`);

    if (resolved.resolvedMode === 'window') {
      await runWindowPipeline({ windowId: resolved.windowId, windowName: resolved.resolvedName, dryRun: parsed.dryRun, skipTo: parsed.skipTo, skipInteractive: parsed.skipInteractive });
    } else if (resolved.resolvedMode === 'process') {
      await runProcessPipeline({ processId: resolved.processId, processName: resolved.resolvedName, dryRun: parsed.dryRun });
    } else if (resolved.resolvedMode === 'report') {
      await runReportPipeline({ reportId: resolved.processId, reportName: resolved.resolvedName, dryRun: parsed.dryRun });
    }
  } else if (validation.mode === 'report') {
    await runReportPipeline(parsed);
  } else if (validation.mode === 'process') {
    await runProcessPipeline(parsed);
  } else {
    await runWindowPipeline({ ...parsed, skipTo: parsed.skipTo, skipInteractive: parsed.skipInteractive });
  }
}

async function runProcessPipeline({ processId, processName, dryRun, isReport, specType }) {
  const steps = buildProcessPipelineSteps();
  let pushToNeoRan = false;
  let frontendGenerated = false;
  const pipelineLabel = getPipelineLabel(isReport);
  console.log(`\n=== Schema Forge ${pipelineLabel} Pipeline: ${processName} ===\n`);

  for (const step of steps) {
    console.log(`[${step.phase}] ${step.description}...`);

    try {
      switch (step.name) {
        case 'extract-process': {
          const { main: extractProcess } = await import('./extract-from-process.js');
          await extractProcess(processId, processName);
          break;
        }
        case 'generate-process-contract': {
          const { generateProcessContract } = await import('./generate-contract.js');
          const { readFile, writeFile } = await import('node:fs/promises');
          const processRaw = JSON.parse(await readFile(`artifacts/${processName}/process-raw.json`, 'utf8'));
          let prevContract = null;
          try {
            prevContract = JSON.parse(await readFile(`artifacts/${processName}/contract.json`, 'utf8'));
          } catch { /* first generation */ }
          const contract = generateProcessContract(processRaw, prevContract);
          await writeFile(`artifacts/${processName}/contract.json`, JSON.stringify(contract, null, 2) + '\n');
          console.log(`  ✓ Process contract generated (${contract.testManifest.summary.total} tests)`);
          break;
        }
        case 'push-process-to-neo': {
          const pushSpecType = specType || (isReport ? 'R' : 'P');
          const result = await pushProcessToNeo(processName, { dryRun, specType: pushSpecType });
          logDryRunOutcome(dryRun, result);
          pushToNeoRan = !dryRun; // Set to true if push was executed, false if dry run
          break;
        }
        case 'generate-process-frontend': {
          const { generateAllProcess, generateAllReport } = await import('./generate-frontend.js');
          const { readFile, writeFile, mkdir } = await import('node:fs/promises');
          const contract = JSON.parse(await readFile(`artifacts/${processName}/contract.json`, 'utf8'));
          const generateFn = isReport ? generateAllReport : generateAllProcess;
          const files = generateFn(contract);
          const outDir = `artifacts/${processName}/generated/web/${processName}`;
          await createDirectoryAndWriteFiles(mkdir, outDir, files, writeFile);
          console.log(`  ✓ ${Object.keys(files).length} frontend components generated`);
          frontendGenerated = true;
          break;
        }
        case 'run-tests': {
          const { runContractTests } = await import('./run-contract-tests.js');
          const { readFile } = await import('node:fs/promises');
          const contract = JSON.parse(await readFile(`artifacts/${processName}/contract.json`, 'utf8'));
          const result = runContractTests(contract);
          console.log(`  ✓ ${result.passed}/${result.total} passed, ${result.skipped} skipped`);
          logTestResults(result);
          break;
        }
      }
    } catch (err) {
      console.error(`  ✗ ${step.name} failed: ${err.message}`);
      process.exit(1);
    }
  }

  console.log(`\n=== ${pipelineLabel} Pipeline complete ===\n`);
  printNextSteps({ pushToNeoRan, frontendGenerated });
}

export function logTestResults(result) {
  if (result.failed > 0) {
    console.error(`  ✗ ${result.failed} tests failed`);
    result.results.filter(r => !r.passed).forEach(r => console.error(`    - ${r.description}: ${r.reason}`));
  }
}

export function logDryRunOutcome(dryRun, result) {
  if (dryRun) {
    //dry run true, so the pushToneo is false
    console.log(`  ✓ Dry run: push plan logged`);
  } else {
    console.log(`  ✓ NEO Headless configured (spec: ${result.specId})`);
  }
}

export function getPipelineLabel(isReport) {
  return isReport ? 'Report' : 'Process';
}

export async function createDirectoryAndWriteFiles(mkdir, outDir, files, writeFile) {
  await mkdir(outDir, { recursive: true });
  for (const [filename, code] of Object.entries(files)) {
    await writeFile(`${outDir}/${filename}`, code, 'utf8');
  }
}

/**
 * Run the report pipeline.
 * Reports reuse the process pipeline for extraction and NEO configuration,
 * with specType set to 'R' instead of 'P'.
 */
async function runReportPipeline({ reportId, reportName, dryRun }) {
  console.log(`\n=== Schema Forge Report Pipeline: ${reportName} ===\n`);

  // Reports use the same extraction and NEO push as processes,
  // but the spec type is 'R' instead of 'P'.
  // Delegate to process pipeline with report flag.
  await runProcessPipeline({
    processId: reportId,
    processName: reportName,
    dryRun,
    isReport: true,
    specType: 'R',
  });

  console.log('\n=== Report Pipeline complete ===\n');
}

export async function runAdvisoryVersionCheck(windowName) {
  try {
    const {checkVersion} = await import('./check-version.js');
    const versionResult = await checkVersion(windowName, 'pipeline');
    if (versionResult) {
      console.log(`  ✓ Version: ${versionResult.changelog.from} → ${versionResult.newVersion} (${versionResult.classification.level})`);
      if (versionResult.classification.level === 'breaking') {
        console.warn('  ⚠ BREAKING CHANGE detected. Review contract-changelog.json before proceeding.');
      }
    }
  } catch (err) {
    // Version check is advisory, don't fail the pipeline
    console.log(`  → Version check skipped: ${err.message}`);
  }
}

export async function loadPreviousContract(readFile, windowName, prevVersion, prevContract, prevContractRaw) {
  // Local working copies; the parameters are the fallback returned when no
  // existing contract is on disk (the catch branch leaves these untouched).
  let version = prevVersion;
  let contract = prevContract;
  let contractRaw = prevContractRaw;
  try {
    const existingRaw = await readFile(`artifacts/${windowName}/contract.json`, 'utf-8');
    const existingContract = JSON.parse(existingRaw);
    // Guard: version may be a nested object if a previous run had a bug.
    // Drill down until we reach a string.
    let rawVersion = existingContract.version ?? null;
    while (rawVersion !== null && typeof rawVersion === 'object') {
      rawVersion = rawVersion.version ?? null;
    }
    version = rawVersion;
    contract = existingContract;
    contractRaw = existingRaw;
  } catch {
    // No existing contract — first generation, no prev needed
  }
  return {prevVersion: version, prevContract: contract, prevContractRaw: contractRaw};
}

export async function loadPreviousMcpContract(readFile, windowName, prevMcpContract) {
  // Local working copy; the parameter is the fallback returned when no existing
  // MCP contract is on disk (the catch branch leaves this untouched).
  let mcpContract = prevMcpContract;
  try {
    const existingMcpRaw = await readFile(`artifacts/${windowName}/contract.mcp.json`, 'utf-8');
    mcpContract = JSON.parse(existingMcpRaw);
  } catch {
    // No existing MCP contract — first split generation
  }
  return mcpContract;
}

export async function runPushToNeoStep(windowName, { pushToNeoFn } = {}) {
  const pushToNeo = pushToNeoFn ?? (await import('./push-to-neo.js')).pushToNeo;
  const dryRun = process.argv.includes('--dry-run');
  const result = await pushToNeo(windowName, {dryRun});
  if (dryRun) {
    console.log(`  ✓ Dry run: ${result.summary.totalFields} fields planned`);
  } else {
    console.log(`  ✓ NEO Headless configured (${result.fieldsUpdated} fields)`);
    return true;
  }
}

export async function runValidateFieldNamesStep(windowName, { validateFieldNamesFn } = {}) {
  const validateFieldNames = validateFieldNamesFn ?? (await import('./validate-field-names.js')).validateFieldNames;
  const result = await validateFieldNames(windowName);
  if (result.skipped) {
    console.log(`  → Skipped: ${result.reason}`);
  } else {
    console.log(`  ✓ ${result.matched.length} fields matched`);
    if (result.mismatched.length > 0) {
      console.warn(`  ⚠ ${result.mismatched.length} field name mismatches:`);
      result.mismatched.forEach(m => console.warn(`    ${m.contract} → API returns: ${m.api}`));
    }
    if (result.missing.length > 0) {
      console.log(`  → ${result.missing.length} contract fields not in API: ${result.missing.join(', ')}`);
    }
    if (result.extra.length > 0) {
      console.log(`  → ${result.extra.length} extra API fields (not in contract): ${result.extra.join(', ')}`);
    }
  }
}

export function handleMissingDecisionsError(error, decisionsPath) {
  if (error.code === 'ENOENT') {
    console.error(`  ✗ decisions.json not found at ${decisionsPath}`);
    console.error('  Run /classify to generate decisions.json first.');
    process.exit(1);
  }
  throw error;
}

export async function runResolveCuratedStep(resolveCurated, schemaRaw, rulesRaw, decisions, pipelineContext) {
  const resolved = await resolveCurated(schemaRaw, rulesRaw, decisions);
  pipelineContext.schema = resolved.schema;
  pipelineContext.rules = resolved.rules;

  // Count unclassified fields (no decision, using defaults)
  const totalFields = resolved.schema.entities.reduce((sum, e) => sum + e.fields.length, 0);
  console.log(`  ✓ Resolved ${totalFields} fields across ${resolved.schema.entities.length} entities`);
  if (resolved.unclassifiedCount > 0) {
    console.warn(`  ⚠ ${resolved.unclassifiedCount} fields using defaults (no decision) — run /classify to review`);
  }
}

export async function writeCustomScaffoldFiles(access, indexPath, catalogPath, files, writeFile) {
  let indexExists = false;
  let catalogExists = false;
  try {
    await access(indexPath);
    indexExists = true;
  } catch { /* first run */
  }
  try {
    await access(catalogPath);
    catalogExists = true;
  } catch { /* first run */
  }

  const indexCode = files['index.jsx'];
  const catalogCode = files['mockCatalogs.js'];

  if (indexExists) {
    await writeFile(`${indexPath}.new`, indexCode, 'utf8');
    console.log(`  Custom scaffold updated at ${indexPath}.new (existing index.jsx preserved)`);
    console.log('  Use AI to diff index.jsx vs index.jsx.new and adapt changes');
  } else {
    await writeFile(indexPath, indexCode, 'utf8');
    console.log(`  Custom scaffold created at ${indexPath}`);
  }

  if (catalogExists) {
    await writeFile(`${catalogPath}.new`, catalogCode, 'utf8');
  } else {
    await writeFile(catalogPath, catalogCode, 'utf8');
  }
}

export async function loadOrMigrateDecisions(readFile, curatedPath, windowName, decisions, decisionsPath) {
  // Local working copy; the parameter is the fallback returned when migration
  // is not attempted. handleMissingDecisionsError exits/throws on failure.
  let resolvedDecisions = decisions;
  try {
    await readFile(curatedPath, 'utf8');
    console.warn(`  ⚠ decisions.json not found — auto-migrating from curated files...`);
    const {migrateWindow} = await import('./migrate-to-decisions.js');
    await migrateWindow(windowName);
    resolvedDecisions = JSON.parse(await readFile(decisionsPath, 'utf8'));
    console.log(`  ✓ Auto-migrated to decisions.json`);
  } catch (e2) {
    handleMissingDecisionsError(e2, decisionsPath);
  }
  return resolvedDecisions;
}

// Load decisions.json for a window, auto-migrating the schema version when needed
// and falling back to migrating from legacy curated files when the file is absent.
// Non-ENOENT errors propagate to the caller exactly as before (single returned value).
export async function loadWindowDecisions(readFile, windowName, schemaRaw, decisionsPath) {
  let decisions;
  try {
    decisions = JSON.parse(await readFile(decisionsPath, 'utf8'));

    // Auto-migrate decisions schema version if needed
    const { needsMigration: needsMig, getVersion: getVer, migrateDecisions: migDec } = await import('./migrations/index.js');
    if (needsMig(decisions)) {
      const fromV = getVer(decisions);
      const result = migDec(decisions, { schemaRaw });
      decisions = result.decisions;
      const { writeFile } = await import('node:fs/promises');
      await writeFile(decisionsPath, JSON.stringify(decisions, null, 2) + '\n', 'utf-8');
      console.log(`  ✓ decisions.json auto-migrated: v${fromV} → v${result.toVersion}`);
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;

    // No decisions.json — auto-migrate from curated files if they exist
    const curatedPath = `artifacts/${windowName}/schema-curated.json`;
    decisions = await loadOrMigrateDecisions(readFile, curatedPath, windowName, decisions, decisionsPath);
  }
  return decisions;
}

export async function scaffoldSecondaryTabCustomForms(contract, windowName, deps) {
  const {fileURLToPath: fileURLToPathMod, resolve: resolvePath, dirname: dirnamePath, mkdir, access, writeFile} = deps;
  const secondaryTabsDecl = contract.frontendContract?.window?.secondaryTabs;
  if (secondaryTabsDecl) {
    const customForms = Object.values(secondaryTabsDecl)
        .filter(cfg => cfg.customForm)
        .map(cfg => cfg.customForm);
    if (customForms.length > 0) {
      const __filename = fileURLToPathMod(import.meta.url);
      const repoRoot = resolvePath(dirnamePath(__filename), '../../');
      const customDir = resolvePath(repoRoot, `tools/app-shell/src/windows/custom/${windowName}`);
      await mkdir(customDir, {recursive: true});
      for (const formName of customForms) {
        const formPath = resolvePath(customDir, `${formName}.jsx`);
        let formExists = false;
        try {
          await access(formPath);
          formExists = true;
        } catch { /* first run */
        }
        if (!formExists) {
          const stub = `// Custom form for the "${windowName}" window.\n// This file is NOT regenerated by the pipeline — edit it directly.\nimport { EntityForm } from '@/components/contract-ui';\n\nexport default function ${formName}(props) {\n  return <div>{/* TODO: implement custom form */}</div>;\n}\n`;
          await writeFile(formPath, stub, 'utf8');
          console.log(`  Scaffolded custom form: tools/app-shell/src/windows/custom/${windowName}/${formName}.jsx`);
        }
      }
    }
  }

  return true;
}

export async function autoRegisterCustomLoader(resolvePath, repoRoot, readFile, windowName, writeFile) {
  const registryPath = resolvePath(repoRoot, 'tools/app-shell/src/windows/registry.js');
  const registryContent = await readFile(registryPath, 'utf8');
  const loaderEntry = `  '${windowName}': () => import('./custom/${windowName}/index.jsx'),`;
  if (!registryContent.includes(`'${windowName}'`)) {
    // Insert after the customLoaders opening brace
    const updated = registryContent.replace(
        /const customLoaders = \{(\s*)\/\/ Auto-registered by pipeline/,
        `const customLoaders = {$1// Auto-registered by pipeline\n${loaderEntry}`,
    );
    await writeFile(registryPath, updated, 'utf8');
    console.log(`  Auto-registered '${windowName}' in registry.js customLoaders`);
  }
}

export async function writeGeneratedFiles(files, resolvePath, outDir, writeFile) {
  for (const [filename, code] of Object.entries(files)) {
    // Skip internal marker keys
    if (filename.startsWith('__')) continue;
    const filePath = resolvePath(outDir, filename);
    await writeFile(filePath, code, 'utf8');
  }
}

export function handleStepError(step, err) {
  if (step.optional) {
    console.log(`  → ${step.name} failed (optional, continuing): ${err.message}`);
  } else {
    console.error(`  ✗ ${step.name} failed: ${err.message}`);
    process.exit(1);
  }
}

export async function runValidateSchemaStep(windowName, deps = {}) {
  const {validateSchema} = deps.validateSchemaFn
    ? { validateSchema: deps.validateSchemaFn }
    : await import('./validate-schema.js');
  const {readFile} = deps.readFile
    ? { readFile: deps.readFile }
    : await import('node:fs/promises');
  const exit = deps.exit || process.exit;
  const schema = JSON.parse(await readFile(`artifacts/${windowName}/schema-raw.json`, 'utf8'));
  const result = await validateSchema(schema);
  if (result.errors.length > 0) {
    console.error('  ✗ Schema validation failed');
    result.errors.forEach(e => console.error(`    - [L${e.level}] ${e.code}: ${e.message} (${e.path})`));
    exit(1);
  }
  console.log(`  ✓ Validation passed (${result.warnings.length} warnings)`);
}

export async function ensureProcessesFile(access, processesPath, mkdir, windowName, writeFile) {
  try {
    await access(processesPath);
  } catch {
    await mkdir(`artifacts/${windowName}`, {recursive: true});
    await writeFile(processesPath, JSON.stringify({processes: []}, null, 2) + '\n');
  }
}

export async function runContractTestsStep(windowName, deps = {}) {
  const {runContractTests} = deps.runContractTestsFn
    ? { runContractTests: deps.runContractTestsFn }
    : await import('./run-contract-tests.js');
  const {readFile} = deps.readFile
    ? { readFile: deps.readFile }
    : await import('node:fs/promises');
  const contract = JSON.parse(await readFile(`artifacts/${windowName}/contract.json`, 'utf8'));
  const result = runContractTests(contract);
  console.log(`  ✓ ${result.passed}/${result.total} passed, ${result.skipped} skipped`);
  if (result.failed > 0) {
    console.error(`  ✗ ${result.failed} tests failed`);
    result.results.filter(r => !r.passed).forEach(r => console.error(`    - ${r.description}: ${r.reason}`));
  }
}

export async function runGenerateContractStep(windowName, pipelineContext, deps = {}) {
  const {generateContract, splitWindowContractArtifacts} =
    (deps.generateContractFn || deps.splitWindowContractArtifactsFn)
      ? {
          generateContract: deps.generateContractFn,
          splitWindowContractArtifacts: deps.splitWindowContractArtifactsFn,
        }
      : await import('./generate-contract.js');
  const {readFile, writeFile, access, mkdir} = deps.fs
    ? deps.fs
    : await import('node:fs/promises');
  const versionCheck = deps.runAdvisoryVersionCheckFn || runAdvisoryVersionCheck;
  const processesPath = `artifacts/${windowName}/processes.json`;
  await ensureProcessesFile(access, processesPath, mkdir, windowName, writeFile);
  const schema = pipelineContext.schema;
  const rules = pipelineContext.rules || [];
  const processes = JSON.parse(await readFile(processesPath, 'utf8'));

  // Read existing version before overwriting, so the new contract preserves it
  // and check-version can bump from the correct baseline.
  let prevVersion = null;
  let prevContract = null;
  let prevContractRaw = null;
  let prevMcpContract = null;
  const loadedContract = await loadPreviousContract(readFile, windowName, prevVersion, prevContract, prevContractRaw);
  prevVersion = loadedContract.prevVersion;
  prevContract = loadedContract.prevContract;
  prevContractRaw = loadedContract.prevContractRaw;
  prevMcpContract = await loadPreviousMcpContract(readFile, windowName, prevMcpContract);
  const generatedContract = generateContract(schema, Array.isArray(rules) ? rules : rules.rules || [], processes.processes || [], prevVersion, prevContract);
  const {contract, mcpContract} = splitWindowContractArtifacts(generatedContract, prevContract, prevMcpContract);
  if (prevContractRaw) {
    await writeFile(`artifacts/${windowName}/contract.prev.json`, prevContractRaw, 'utf-8');
  }
  await writeFile(`artifacts/${windowName}/contract.json`, JSON.stringify(contract, null, 2) + '\n');
  await writeFile(`artifacts/${windowName}/contract.mcp.json`, JSON.stringify(mcpContract, null, 2) + '\n');
  console.log(`  ✓ Contract generated (${contract.testManifest.summary.total} tests)`);
  // Version check
  await versionCheck(windowName);
}

export function printTranslateTodosGuidance(step) {
  if (step.name === 'translate-todos') {
    console.log('  → Review generated TODO comments in the frontend components');
    console.log('  → Use AI or manual translation to implement callout/onchange logic');
    console.log('  → Re-run pipeline with --skip-to=run-tests when done');
  }
}

export async function runGenerateFrontendStep(windowName, result) {
  const {generateAll} = await import('./generate-frontend.js');
  const {readFile, writeFile, mkdir, access} = await import('node:fs/promises');
  const {resolve: resolvePath, dirname: dirnamePath} = await import('node:path');
  const {fileURLToPath: fileURLToPathMod} = await import('node:url');
  const contract = JSON.parse(await readFile(`artifacts/${windowName}/contract.json`, 'utf8'));
  const layoutType = contract.frontendContract?.window?.layoutType ?? 'default';
  const files = generateAll(contract);

  if (layoutType === 'custom') {
    // Custom scaffold path: write to windows/custom/{windowName}/
    // Resolve the app-shell src directory relative to this file's location
    const __filename = fileURLToPathMod(import.meta.url);
    const repoRoot = resolvePath(dirnamePath(__filename), '../../');
    const customDir = resolvePath(repoRoot, `tools/app-shell/src/windows/custom/${windowName}`);
    await mkdir(customDir, {recursive: true});

    const indexPath = resolvePath(customDir, 'index.jsx');
    const catalogPath = resolvePath(customDir, 'mockCatalogs.js');

    // Regeneration safety: existing files are preserved; new content gets .new suffix
    await writeCustomScaffoldFiles(access, indexPath, catalogPath, files, writeFile);

    // Auto-register the custom loader in registry.js
    await autoRegisterCustomLoader(resolvePath, repoRoot, readFile, windowName, writeFile);

    console.log(`  ✓ Custom scaffold ready (layoutType: custom)`);
    result.frontendGenerated = true;
  } else {
    const outDir = `artifacts/${windowName}/generated/web/${windowName}`;
    await mkdir(outDir, {recursive: true});

    await writeGeneratedFiles(files, resolvePath, outDir, writeFile);

    // Generate mockData.js (entity record data for local development)
    const {generateMockDataFile} = await import('./generate-mock-data.js');
    const mockDataPath = resolvePath(outDir, 'mockData.js');
    await writeFile(mockDataPath, generateMockDataFile(contract), 'utf8');

    console.log(`  ✓ ${Object.keys(files).filter(k => !k.startsWith('__')).length} frontend components generated`);

    // Scaffold customForm stubs for secondary tabs that declare a custom form
    result.frontendGenerated = await scaffoldSecondaryTabCustomForms(contract, windowName, {
      fileURLToPath: fileURLToPathMod,
      resolve: resolvePath,
      dirname: dirnamePath,
      mkdir,
      access,
      writeFile,
    });
  }
}

export async function loadDecisionsAndResolve(windowName, pipelineContext) {
  const {resolveCurated} = await import('./resolve-curated.js');
  const {readFile} = await import('node:fs/promises');

  const schemaRaw = JSON.parse(await readFile(`artifacts/${windowName}/schema-raw.json`, 'utf8'));
  const rulesRaw = JSON.parse(await readFile(`artifacts/${windowName}/rules-raw.json`, 'utf8'));

  const decisionsPath = `artifacts/${windowName}/decisions.json`;
  const decisions = await loadWindowDecisions(readFile, windowName, schemaRaw, decisionsPath);

  await runResolveCuratedStep(resolveCurated, schemaRaw, rulesRaw, decisions, pipelineContext);
}

export async function executePipelineStep(step, windowId, windowName, pipelineContext, result) {
  try {
    switch (step.name) {
      case 'extract-fields': {
        const {main: extractFields} = await import('./extract-fields.js');
        await extractFields(windowId, windowName);
        break;
      }
      case 'extract-rules': {
        const {main: extractRules} = await import('./extract-rules.js');
        await extractRules(windowId, windowName);
        break;
      }
      case 'validate': {
        await runValidateSchemaStep(windowName);
        break;
      }
      case 'pre-classify': {
        const {classifyRules} = await import('./pre-classify.js');
        const {readFile} = await import('node:fs/promises');
        const rules = JSON.parse(await readFile(`artifacts/${windowName}/rules-raw.json`, 'utf8'));
        const classified = classifyRules(rules.rules || rules, {skipAi: true});
        console.log(`  ✓ ${classified.summary.autoClassified} auto, ${classified.summary.humanReview} human`);
        break;
      }
      case 'resolve-curated': {
        await loadDecisionsAndResolve(windowName, pipelineContext);
        break;
      }
      case 'generate-contract': {
        await runGenerateContractStep(windowName, pipelineContext);
        break;
      }
      case 'push-to-neo': {
        result.pushToNeoRan = await runPushToNeoStep(windowName);
        break;
      }
      case 'validate-field-names': {
        await runValidateFieldNamesStep(windowName);
        break;
      }
      case 'generate-frontend': {
        await runGenerateFrontendStep(windowName, result);
        break;
      }
      case 'run-tests': {
        await runContractTestsStep(windowName);
        break;
      }
    }
  } catch (err) {
    handleStepError(step, err);
  }
}

async function runWindowPipeline({ windowId, windowName, skipTo, skipInteractive }) {
  const steps = buildPipelineSteps();
  // Single mutable result object so executePipelineStep can record outcomes
  // (pushToNeoRan / frontendGenerated) without returning multiple values.
  const result = { pushToNeoRan: false, frontendGenerated: false };
  console.log(`\n=== Schema Forge Pipeline: ${windowName} ===\n`);

  // Holds resolved curated schema and rules between steps (set by resolve-curated, consumed by generate-contract)
  const pipelineContext = {};

  // Always refresh raw files from DB when skipping steps (prevents stale data).
  // If DB is unreachable, existing raws are used with a warning.
  if (skipTo) {
    try {
      const { main: extractFields } = await import('./extract-fields.js');
      const { main: extractRules } = await import('./extract-rules.js');
      console.log('[pre] Refreshing raw files from DB...');
      await extractFields(windowId, windowName);
      await extractRules(windowId, windowName);
      console.log('[pre] Raw files refreshed.\n');
    } catch (err) {
      console.warn(`[pre] Could not refresh raws from DB (${err.message}) — using existing files.\n`);
    }
  }

  let skipping = !!skipTo;

  for (const step of steps) {
    // --skip-to: skip steps until we reach the target
    if (skipping) {
      if (step.name !== skipTo) {
        continue;
      }
      skipping = false;
      console.log(`  (skipped to ${step.name})`);
    }

    if (step.interactive) {
      if (skipInteractive) {
        console.log(`[${step.phase}] ${step.description} — skipped (--skip-interactive)`);
        continue;
      }

      console.log(`\n[${step.phase}] ${step.description}`);
      printTranslateTodosGuidance(step);
      break;
    }

    console.log(`[${step.phase}] ${step.description}...`);

    await executePipelineStep(step, windowId, windowName, pipelineContext, result);
  }

  console.log('\n=== Pipeline complete ===\n');
  printNextSteps(result);
}

// Only run main if executed directly
const isMainModule = process.argv[1] && (
  process.argv[1].endsWith('pipeline.js') ||
  process.argv[1].endsWith('sf-pipeline')
);
if (isMainModule) {
  main().catch(err => { console.error(err); process.exit(1); });
}
