#!/usr/bin/env node

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

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--menu-id' && args[i + 1]) {
      result.menuId = args[++i];
    } else if (args[i] === '--menu-name' && args[i + 1]) {
      result.menuName = args[++i];
    } else if (args[i] === '--process-id' && args[i + 1]) {
      result.processId = args[++i];
    } else if (args[i] === '--process-name' && args[i + 1]) {
      result.processName = args[++i];
    } else if (args[i] === '--report-id' && args[i + 1]) {
      result.reportId = args[++i];
    } else if (args[i] === '--report-name' && args[i + 1]) {
      result.reportName = args[++i];
    } else if (args[i] === '--dry-run') {
      result.dryRun = true;
    } else if (args[i] === '--skip-to' && args[i + 1]) {
      result.skipTo = args[++i];
    } else if (args[i] === '--skip-interactive') {
      result.skipInteractive = true;
    } else if (!args[i].startsWith('--') && !result.windowId) {
      result.windowId = args[i];
    } else if (!args[i].startsWith('--') && result.windowId && !result.windowName) {
      result.windowName = args[i];
    }
  }

  return result;
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

  // Backwards compat: positional args for window mode
  if (!parsed.processId && !parsed.windowName && parsed.windowId) {
    parsed.windowName = 'sales-order';
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
  const pipelineLabel = isReport ? 'Report' : 'Process';
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
          const contract = generateProcessContract(processRaw);
          await writeFile(`artifacts/${processName}/contract.json`, JSON.stringify(contract, null, 2));
          console.log(`  ✓ Process contract generated (${contract.testManifest.summary.total} tests)`);
          break;
        }
        case 'push-process-to-neo': {
          const { pushProcessToNeo } = await import('./push-to-neo.js');
          const pushSpecType = specType || (isReport ? 'R' : 'P');
          const result = await pushProcessToNeo(processName, { dryRun, specType: pushSpecType });
          if (dryRun) {
            console.log(`  ✓ Dry run: push plan logged`);
          } else {
            console.log(`  ✓ NEO Headless configured (spec: ${result.specId})`);
            pushToNeoRan = true;
          }
          break;
        }
        case 'generate-process-frontend': {
          const { generateAllProcess, generateAllReport } = await import('./generate-frontend.js');
          const { readFile, writeFile, mkdir } = await import('node:fs/promises');
          const contract = JSON.parse(await readFile(`artifacts/${processName}/contract.json`, 'utf8'));
          const generateFn = isReport ? generateAllReport : generateAllProcess;
          const files = generateFn(contract);
          const outDir = `artifacts/${processName}/generated/web/${processName}`;
          await mkdir(outDir, { recursive: true });
          for (const [filename, code] of Object.entries(files)) {
            await writeFile(`${outDir}/${filename}`, code, 'utf8');
          }
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
          if (result.failed > 0) {
            console.error(`  ✗ ${result.failed} tests failed`);
            result.results.filter(r => !r.passed).forEach(r => console.error(`    - ${r.description}: ${r.reason}`));
          }
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

async function runWindowPipeline({ windowId, windowName, skipTo, skipInteractive }) {
  const steps = buildPipelineSteps();
  let pushToNeoRan = false;
  let frontendGenerated = false;
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
      if (step.name === skipTo) {
        skipping = false;
        console.log(`  (skipped to ${step.name})`);
      } else {
        continue;
      }
    }

    if (step.interactive) {
      if (skipInteractive) {
        console.log(`[${step.phase}] ${step.description} — skipped (--skip-interactive)`);
        continue;
      }

      console.log(`\n[${step.phase}] ${step.description}`);
      if (step.name === 'translate-todos') {
        console.log('  → Review generated TODO comments in the frontend components');
        console.log('  → Use AI or manual translation to implement callout/onchange logic');
        console.log('  → Re-run pipeline with --skip-to=run-tests when done');
      }
      break;
    }

    console.log(`[${step.phase}] ${step.description}...`);

    try {
      switch (step.name) {
        case 'extract-fields': {
          const { main: extractFields } = await import('./extract-fields.js');
          await extractFields(windowId, windowName);
          break;
        }
        case 'extract-rules': {
          const { main: extractRules } = await import('./extract-rules.js');
          await extractRules(windowId, windowName);
          break;
        }
        case 'validate': {
          const { validateSchema } = await import('./validate-schema.js');
          const { readFile } = await import('node:fs/promises');
          const schema = JSON.parse(await readFile(`artifacts/${windowName}/schema-raw.json`, 'utf8'));
          const result = await validateSchema(schema);
          if (result.errors.length > 0) {
            console.error('  ✗ Schema validation failed');
            result.errors.forEach(e => console.error(`    - [L${e.level}] ${e.code}: ${e.message} (${e.path})`));
            process.exit(1);
          }
          console.log(`  ✓ Validation passed (${result.warnings.length} warnings)`);
          break;
        }
        case 'pre-classify': {
          const { classifyRules } = await import('./pre-classify.js');
          const { readFile } = await import('node:fs/promises');
          const rules = JSON.parse(await readFile(`artifacts/${windowName}/rules-raw.json`, 'utf8'));
          const classified = classifyRules(rules.rules || rules, { skipAi: true });
          console.log(`  ✓ ${classified.summary.autoClassified} auto, ${classified.summary.humanReview} human`);
          break;
        }
        case 'resolve-curated': {
          const { resolveCurated } = await import('./resolve-curated.js');
          const { readFile } = await import('node:fs/promises');

          const schemaRaw = JSON.parse(await readFile(`artifacts/${windowName}/schema-raw.json`, 'utf8'));
          const rulesRaw = JSON.parse(await readFile(`artifacts/${windowName}/rules-raw.json`, 'utf8'));

          const decisionsPath = `artifacts/${windowName}/decisions.json`;
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
            try {
              await readFile(curatedPath, 'utf8');
              console.warn(`  ⚠ decisions.json not found — auto-migrating from curated files...`);
              const { migrateWindow } = await import('./migrate-to-decisions.js');
              await migrateWindow(windowName);
              decisions = JSON.parse(await readFile(decisionsPath, 'utf8'));
              console.log(`  ✓ Auto-migrated to decisions.json`);
            } catch (e2) {
              if (e2.code === 'ENOENT') {
                console.error(`  ✗ decisions.json not found at ${decisionsPath}`);
                console.error('  Run /classify to generate decisions.json first.');
                process.exit(1);
              }
              throw e2;
            }
          }

          const resolved = await resolveCurated(schemaRaw, rulesRaw, decisions);
          pipelineContext.schema = resolved.schema;
          pipelineContext.rules = resolved.rules;

          // Count unclassified fields (no decision, using defaults)
          const totalFields = resolved.schema.entities.reduce((sum, e) => sum + e.fields.length, 0);
          console.log(`  ✓ Resolved ${totalFields} fields across ${resolved.schema.entities.length} entities`);
          if (resolved.unclassifiedCount > 0) {
            console.warn(`  ⚠ ${resolved.unclassifiedCount} fields using defaults (no decision) — run /classify to review`);
          }
          break;
        }
        case 'generate-contract': {
          const { generateContract } = await import('./generate-contract.js');
          const { readFile, writeFile, access, mkdir } = await import('node:fs/promises');
          const processesPath = `artifacts/${windowName}/processes.json`;
          try {
            await access(processesPath);
          } catch {
            await mkdir(`artifacts/${windowName}`, { recursive: true });
            await writeFile(processesPath, JSON.stringify({ processes: [] }, null, 2));
          }
          const schema = pipelineContext.schema;
          const rules = pipelineContext.rules || [];
          const processes = JSON.parse(await readFile(processesPath, 'utf8'));

          // Read existing version before overwriting, so the new contract preserves it
          // and check-version can bump from the correct baseline.
          let prevVersion = null;
          try {
            const existingRaw = await readFile(`artifacts/${windowName}/contract.json`, 'utf-8');
            const existingContract = JSON.parse(existingRaw);
            // Guard: version may be a nested object if a previous run had a bug.
            // Drill down until we reach a string.
            let rawVersion = existingContract.version ?? null;
            while (rawVersion !== null && typeof rawVersion === 'object') {
              rawVersion = rawVersion.version ?? null;
            }
            prevVersion = rawVersion;
            // Snapshot for version diffing
            await writeFile(`artifacts/${windowName}/contract.prev.json`, existingRaw, 'utf-8');
          } catch {
            // No existing contract — first generation, no prev needed
          }
          const contract = generateContract(schema, Array.isArray(rules) ? rules : rules.rules || [], processes.processes || [], prevVersion);
          await writeFile(`artifacts/${windowName}/contract.json`, JSON.stringify(contract, null, 2));
          console.log(`  ✓ Contract generated (${contract.testManifest.summary.total} tests)`);
          // Version check
          try {
            const { checkVersion } = await import('./check-version.js');
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
          break;
        }
        case 'push-to-neo': {
          const { pushToNeo } = await import('./push-to-neo.js');
          const dryRun = process.argv.includes('--dry-run');
          const result = await pushToNeo(windowName, { dryRun });
          if (dryRun) {
            console.log(`  ✓ Dry run: ${result.summary.totalFields} fields planned`);
          } else {
            console.log(`  ✓ NEO Headless configured (${result.fieldsUpdated} fields)`);
            pushToNeoRan = true;
          }
          break;
        }
        case 'validate-field-names': {
          const { validateFieldNames } = await import('./validate-field-names.js');
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
          break;
        }
        case 'generate-frontend': {
          const { generateAll } = await import('./generate-frontend.js');
          const { readFile, writeFile, mkdir, access } = await import('node:fs/promises');
          const { resolve: resolvePath, dirname: dirnamePath } = await import('node:path');
          const { fileURLToPath: fileURLToPathMod } = await import('node:url');
          const contract = JSON.parse(await readFile(`artifacts/${windowName}/contract.json`, 'utf8'));
          const layoutType = contract.frontendContract?.window?.layoutType ?? 'default';
          const files = generateAll(contract);

          if (layoutType === 'custom') {
            // Custom scaffold path: write to windows/custom/{windowName}/
            // Resolve the app-shell src directory relative to this file's location
            const __filename = fileURLToPathMod(import.meta.url);
            const repoRoot = resolvePath(dirnamePath(__filename), '../../');
            const customDir = resolvePath(repoRoot, `tools/app-shell/src/windows/custom/${windowName}`);
            await mkdir(customDir, { recursive: true });

            const indexPath = resolvePath(customDir, 'index.jsx');
            const catalogPath = resolvePath(customDir, 'mockCatalogs.js');

            // Regeneration safety: existing files are preserved; new content gets .new suffix
            let indexExists = false;
            let catalogExists = false;
            try { await access(indexPath); indexExists = true; } catch { /* first run */ }
            try { await access(catalogPath); catalogExists = true; } catch { /* first run */ }

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

            // Auto-register the custom loader in registry.js
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

            console.log(`  ✓ Custom scaffold ready (layoutType: custom)`);
            frontendGenerated = true;
            break;
          }

          const outDir = `artifacts/${windowName}/generated/web/${windowName}`;
          await mkdir(outDir, { recursive: true });

          for (const [filename, code] of Object.entries(files)) {
            // Skip internal marker keys
            if (filename.startsWith('__')) continue;
            const filePath = resolvePath(outDir, filename);
            await writeFile(filePath, code, 'utf8');
          }

          // Generate mockData.js (entity record data for local development)
          const { generateMockDataFile } = await import('./generate-mock-data.js');
          const mockDataPath = resolvePath(outDir, 'mockData.js');
          await writeFile(mockDataPath, generateMockDataFile(contract), 'utf8');

          console.log(`  ✓ ${Object.keys(files).filter(k => !k.startsWith('__')).length} frontend components generated`);

          // Scaffold customForm stubs for secondary tabs that declare a custom form
          const secondaryTabsDecl = contract.frontendContract?.window?.secondaryTabs;
          if (secondaryTabsDecl) {
            const customForms = Object.values(secondaryTabsDecl)
              .filter(cfg => cfg.customForm)
              .map(cfg => cfg.customForm);
            if (customForms.length > 0) {
              const __filename = fileURLToPathMod(import.meta.url);
              const repoRoot = resolvePath(dirnamePath(__filename), '../../');
              const customDir = resolvePath(repoRoot, `tools/app-shell/src/windows/custom/${windowName}`);
              await mkdir(customDir, { recursive: true });
              for (const formName of customForms) {
                const formPath = resolvePath(customDir, `${formName}.jsx`);
                let formExists = false;
                try { await access(formPath); formExists = true; } catch { /* first run */ }
                if (!formExists) {
                  const stub = `// Custom form for the "${windowName}" window.\n// This file is NOT regenerated by the pipeline — edit it directly.\nimport { EntityForm } from '@/components/contract-ui';\n\nexport default function ${formName}(props) {\n  return <div>{/* TODO: implement custom form */}</div>;\n}\n`;
                  await writeFile(formPath, stub, 'utf8');
                  console.log(`  Scaffolded custom form: tools/app-shell/src/windows/custom/${windowName}/${formName}.jsx`);
                }
              }
            }
          }

          frontendGenerated = true;
          break;
        }
        case 'run-tests': {
          const { runContractTests } = await import('./run-contract-tests.js');
          const { readFile } = await import('node:fs/promises');
          const contract = JSON.parse(await readFile(`artifacts/${windowName}/contract.json`, 'utf8'));
          const result = runContractTests(contract);
          console.log(`  ✓ ${result.passed}/${result.total} passed, ${result.skipped} skipped`);
          if (result.failed > 0) {
            console.error(`  ✗ ${result.failed} tests failed`);
            result.results.filter(r => !r.passed).forEach(r => console.error(`    - ${r.description}: ${r.reason}`));
          }
          break;
        }
      }
    } catch (err) {
      if (step.optional) {
        console.log(`  → ${step.name} failed (optional, continuing): ${err.message}`);
      } else {
        console.error(`  ✗ ${step.name} failed: ${err.message}`);
        process.exit(1);
      }
    }
  }

  console.log('\n=== Pipeline complete ===\n');
  printNextSteps({ pushToNeoRan, frontendGenerated });
}

// Only run main if executed directly
const isMainModule = process.argv[1] && (
  process.argv[1].endsWith('pipeline.js') ||
  process.argv[1].endsWith('sf-pipeline')
);
if (isMainModule) {
  main().catch(err => { console.error(err); process.exit(1); });
}
