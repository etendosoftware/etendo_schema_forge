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
    { name: 'human-decisions', description: 'Open Decision Panel for human review', phase: 'F4', interactive: true },
    { name: 'generate-contract', description: 'Generate frontend/backend contracts + test manifest', phase: 'F6' },
    { name: 'check-version', description: 'Check contract version and classify changes', phase: 'F6b' },
    { name: 'push-to-neo', description: 'Configure NEO Headless via webhooks (from contract)', phase: 'F7' },
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
    } else if (!args[i].startsWith('--') && !result.windowId) {
      result.windowId = args[i];
    } else if (!args[i].startsWith('--') && result.windowId && !result.windowName) {
      result.windowName = args[i];
    }
  }

  return result;
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
      await runWindowPipeline({ windowId: resolved.windowId, windowName: resolved.resolvedName, dryRun: parsed.dryRun });
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
    await runWindowPipeline(parsed);
  }
}

async function runProcessPipeline({ processId, processName, dryRun, isReport, specType }) {
  const steps = buildProcessPipelineSteps();
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

async function runWindowPipeline({ windowId, windowName }) {
  const steps = buildPipelineSteps();
  console.log(`\n=== Schema Forge Pipeline: ${windowName} ===\n`);

  for (const step of steps) {
    if (step.interactive) {
      console.log(`\n[${step.phase}] ${step.description}`);
      if (step.name === 'translate-todos') {
        console.log('  → Review generated TODO comments in the frontend components');
        console.log('  → Use AI or manual translation to implement callout/onchange logic');
        console.log('  → Re-run pipeline with --skip-to=run-tests when done');
      } else {
        console.log('  → Open Decision Panel at http://localhost:3000');
        console.log('  → Save curated artifacts, then re-run pipeline with --skip-to=generate-contract');
        console.log('  → For AI classification, run: /sf:classify-rules');
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
          const result = validateSchema(schema);
          if (result.errors.length > 0) {
            console.error('  ✗ Schema validation failed');
            result.errors.forEach(e => console.error(`    - ${e}`));
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
        case 'generate-contract': {
          const { generateContract } = await import('./generate-contract.js');
          const { readFile, writeFile } = await import('node:fs/promises');
          const schema = JSON.parse(await readFile(`artifacts/${windowName}/schema-curated.json`, 'utf8'));
          const rules = JSON.parse(await readFile(`artifacts/${windowName}/rules-curated.json`, 'utf8'));
          const processes = JSON.parse(await readFile(`artifacts/${windowName}/processes.json`, 'utf8'));
          const contract = generateContract(schema, rules.rules || [], processes.processes || []);
          // Snapshot current contract as prev for version diffing
          try {
            const existingContract = await readFile(`artifacts/${windowName}/contract.json`, 'utf-8');
            await writeFile(`artifacts/${windowName}/contract.prev.json`, existingContract, 'utf-8');
          } catch {
            // No existing contract — first generation, no prev needed
          }
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
          }
          break;
        }
        case 'generate-frontend': {
          const { generateAll } = await import('./generate-frontend.js');
          const { preserveAndRegenerate } = await import('./preserve-custom-sections.js');
          const { readFile, writeFile, mkdir } = await import('node:fs/promises');
          const { resolve: resolvePath } = await import('node:path');
          const contract = JSON.parse(await readFile(`artifacts/${windowName}/contract.json`, 'utf8'));
          const files = generateAll(contract);
          const outDir = `artifacts/${windowName}/generated/web/${windowName}`;
          await mkdir(outDir, { recursive: true });

          let totalPreserved = 0;
          let totalUnmatched = 0;

          for (const [filename, code] of Object.entries(files)) {
            const filePath = resolvePath(outDir, filename);

            // Read existing content BEFORE overwriting (for .old backup)
            const existingContent = await readFile(filePath, 'utf8').catch(() => null);

            const { content, preserved, unmatched } = preserveAndRegenerate(filePath, code);
            await writeFile(filePath, content, 'utf8');
            totalPreserved += preserved.length;
            totalUnmatched += unmatched.length;

            // Save .old backup from the pre-overwrite content
            if (unmatched.length > 0 && existingContent) {
              await writeFile(`${filePath}.old`, existingContent, 'utf8');
            }
          }

          let summary = `  ✓ ${Object.keys(files).length} frontend components generated`;
          if (totalPreserved > 0 || totalUnmatched > 0) {
            summary += ` (preserved ${totalPreserved} custom sections`;
            if (totalUnmatched > 0) {
              summary += `, ${totalUnmatched} unmatched (saved to .old)`;
            }
            summary += ')';
          }
          console.log(summary);
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
      console.error(`  ✗ ${step.name} failed: ${err.message}`);
      process.exit(1);
    }
  }

  console.log('\n=== Pipeline complete ===\n');
}

// Only run main if executed directly
const isMainModule = process.argv[1] && (
  process.argv[1].endsWith('pipeline.js') ||
  process.argv[1].endsWith('sf-pipeline')
);
if (isMainModule) {
  main().catch(err => { console.error(err); process.exit(1); });
}
