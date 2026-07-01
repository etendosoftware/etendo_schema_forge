import { describe, it, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  validatePipelineInput,
  buildPipelineSteps,
  buildProcessPipelineSteps,
  parseArgs,
  logTestResults,
  logDryRunOutcome,
  getPipelineLabel,
  createDirectoryAndWriteFiles,
  handleMissingDecisionsError,
  loadPreviousContract,
  loadPreviousMcpContract,
  handleStepError,
  writeGeneratedFiles,
  printTranslateTodosGuidance,
  logDryRunOutcome as logDryRun2,
  resolveWindowNameFromId,
  runValidateSchemaStep,
  ensureProcessesFile,
  runContractTestsStep,
  writeCustomScaffoldFiles,
} from '../src/pipeline.js';

// ---------------------------------------------------------------------------
// validatePipelineInput — extended coverage
// ---------------------------------------------------------------------------

describe('validatePipelineInput — menu mode', () => {
  it('accepts menuId alone', () => {
    const result = validatePipelineInput({ menuId: '999' });
    assert.equal(result.valid, true);
    assert.equal(result.mode, 'menu');
  });

  it('accepts menuName alone', () => {
    const result = validatePipelineInput({ menuName: 'Sales Order' });
    assert.equal(result.valid, true);
    assert.equal(result.mode, 'menu');
  });

  it('prefers menu mode when both menuId and windowId are present', () => {
    const result = validatePipelineInput({ menuId: '1', windowId: '2', windowName: 'x' });
    assert.equal(result.mode, 'menu');
  });
});

describe('validatePipelineInput — process mode', () => {
  it('accepts processId + processName', () => {
    const result = validatePipelineInput({ processId: 'P1', processName: 'Generate' });
    assert.equal(result.valid, true);
    assert.equal(result.mode, 'process');
  });

  it('rejects processId without processName', () => {
    const result = validatePipelineInput({ processId: 'P1' });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('processName'));
  });
});

describe('validatePipelineInput — report mode', () => {
  it('accepts reportId + reportName', () => {
    const result = validatePipelineInput({ reportId: 'R1', reportName: 'Balance' });
    assert.equal(result.valid, true);
    assert.equal(result.mode, 'report');
  });

  it('rejects reportId without reportName', () => {
    const result = validatePipelineInput({ reportId: 'R1' });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('reportName'));
  });
});

describe('validatePipelineInput — empty input', () => {
  it('rejects totally empty input', () => {
    const result = validatePipelineInput({});
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// buildProcessPipelineSteps
// ---------------------------------------------------------------------------

describe('buildProcessPipelineSteps', () => {
  it('returns expected step count', () => {
    const steps = buildProcessPipelineSteps();
    assert.equal(steps.length, 5);
  });

  it('starts with extract-process', () => {
    const steps = buildProcessPipelineSteps();
    assert.equal(steps[0].name, 'extract-process');
  });

  it('ends with run-tests', () => {
    const steps = buildProcessPipelineSteps();
    assert.equal(steps[steps.length - 1].name, 'run-tests');
  });

  it('each step has name, description, and phase', () => {
    const steps = buildProcessPipelineSteps();
    for (const step of steps) {
      assert.ok(step.name, `step missing name`);
      assert.ok(step.description, `${step.name} missing description`);
      assert.ok(step.phase, `${step.name} missing phase`);
    }
  });

  it('all step names are unique', () => {
    const steps = buildProcessPipelineSteps();
    const names = steps.map(s => s.name);
    assert.equal(new Set(names).size, names.length);
  });

  it('all phases are unique', () => {
    const steps = buildProcessPipelineSteps();
    const phases = steps.map(s => s.phase);
    assert.equal(new Set(phases).size, phases.length);
  });

  it('phases start with P prefix', () => {
    const steps = buildProcessPipelineSteps();
    for (const step of steps) {
      assert.ok(step.phase.startsWith('P'), `${step.name} phase ${step.phase} should start with P`);
    }
  });
});

// ---------------------------------------------------------------------------
// getPipelineLabel
// ---------------------------------------------------------------------------

describe('getPipelineLabel', () => {
  it('returns "Report" when isReport is true', () => {
    assert.equal(getPipelineLabel(true), 'Report');
  });

  it('returns "Process" when isReport is false', () => {
    assert.equal(getPipelineLabel(false), 'Process');
  });

  it('returns "Process" when isReport is undefined', () => {
    assert.equal(getPipelineLabel(undefined), 'Process');
  });

  it('returns "Process" when isReport is null', () => {
    assert.equal(getPipelineLabel(null), 'Process');
  });
});

// ---------------------------------------------------------------------------
// createDirectoryAndWriteFiles
// ---------------------------------------------------------------------------

describe('createDirectoryAndWriteFiles', () => {
  it('calls mkdir with recursive true and writes all files', async () => {
    const mkdirCalls = [];
    const writeCalls = [];
    const mkdir = async (dir, opts) => { mkdirCalls.push({ dir, opts }); };
    const writeFile = async (path, content, enc) => { writeCalls.push({ path, content, enc }); };

    const files = { 'a.jsx': 'code-a', 'b.jsx': 'code-b' };
    await createDirectoryAndWriteFiles(mkdir, '/out/dir', files, writeFile);

    assert.equal(mkdirCalls.length, 1);
    assert.equal(mkdirCalls[0].dir, '/out/dir');
    assert.deepEqual(mkdirCalls[0].opts, { recursive: true });

    assert.equal(writeCalls.length, 2);
    assert.equal(writeCalls[0].path, '/out/dir/a.jsx');
    assert.equal(writeCalls[0].content, 'code-a');
    assert.equal(writeCalls[1].path, '/out/dir/b.jsx');
    assert.equal(writeCalls[1].content, 'code-b');
  });

  it('handles empty files object', async () => {
    const mkdirCalls = [];
    const writeCalls = [];
    const mkdir = async (dir, opts) => { mkdirCalls.push({ dir, opts }); };
    const writeFile = async (path, content, enc) => { writeCalls.push({ path, content, enc }); };

    await createDirectoryAndWriteFiles(mkdir, '/out', {}, writeFile);
    assert.equal(mkdirCalls.length, 1);
    assert.equal(writeCalls.length, 0);
  });
});

// ---------------------------------------------------------------------------
// handleMissingDecisionsError
// ---------------------------------------------------------------------------

describe('handleMissingDecisionsError', () => {
  it('throws non-ENOENT errors', () => {
    const err = new Error('permission denied');
    err.code = 'EACCES';
    assert.throws(() => handleMissingDecisionsError(err, '/path'), /permission denied/);
  });
});

// ---------------------------------------------------------------------------
// loadPreviousContract
// ---------------------------------------------------------------------------

describe('loadPreviousContract', () => {
  it('returns existing contract data when file exists', async () => {
    const contractData = { version: '1.2.0', frontendContract: {} };
    const readFile = async () => JSON.stringify(contractData);

    const result = await loadPreviousContract(readFile, 'sales-order', null, null, null);
    assert.equal(result.prevVersion, '1.2.0');
    assert.deepEqual(result.prevContract, contractData);
  });

  it('returns fallbacks when file does not exist', async () => {
    const readFile = async () => { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; };

    const result = await loadPreviousContract(readFile, 'sales-order', 'fallback-v', { old: true }, 'raw');
    assert.equal(result.prevVersion, 'fallback-v');
    assert.deepEqual(result.prevContract, { old: true });
    assert.equal(result.prevContractRaw, 'raw');
  });

  it('drills down nested version objects', async () => {
    const contractData = { version: { version: { version: '2.0.0' } } };
    const readFile = async () => JSON.stringify(contractData);

    const result = await loadPreviousContract(readFile, 'test', null, null, null);
    assert.equal(result.prevVersion, '2.0.0');
  });

  it('handles version being null', async () => {
    const contractData = {};
    const readFile = async () => JSON.stringify(contractData);

    const result = await loadPreviousContract(readFile, 'test', 'old', null, null);
    assert.equal(result.prevVersion, null);
  });
});

// ---------------------------------------------------------------------------
// loadPreviousMcpContract
// ---------------------------------------------------------------------------

describe('loadPreviousMcpContract', () => {
  it('returns existing MCP contract when file exists', async () => {
    const mcpData = { tools: [] };
    const readFile = async () => JSON.stringify(mcpData);

    const result = await loadPreviousMcpContract(readFile, 'sales-order', null);
    assert.deepEqual(result, mcpData);
  });

  it('returns fallback when file does not exist', async () => {
    const readFile = async () => { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; };

    const fallback = { old: true };
    const result = await loadPreviousMcpContract(readFile, 'sales-order', fallback);
    assert.deepEqual(result, fallback);
  });

  it('returns null fallback when nothing exists', async () => {
    const readFile = async () => { throw new Error('nope'); };

    const result = await loadPreviousMcpContract(readFile, 'test', null);
    assert.equal(result, null);
  });
});

// ---------------------------------------------------------------------------
// parseArgs — extra coverage
// ---------------------------------------------------------------------------

describe('parseArgs — combined flags', () => {
  const run = (...tokens) => parseArgs(['node', 'pipeline.js', ...tokens]);

  it('parses process flags together', () => {
    const result = run('--process-id', 'P1', '--process-name', 'Gen Invoices', '--dry-run');
    assert.equal(result.processId, 'P1');
    assert.equal(result.processName, 'Gen Invoices');
    assert.equal(result.dryRun, true);
  });

  it('parses report flags together', () => {
    const result = run('--report-id', 'R1', '--report-name', 'Aged Balance', '--skip-interactive');
    assert.equal(result.reportId, 'R1');
    assert.equal(result.reportName, 'Aged Balance');
    assert.equal(result.skipInteractive, true);
  });

  it('parses menu with skip-to', () => {
    const result = run('--menu-name', 'Purchase Order', '--skip-to', 'generate-frontend');
    assert.equal(result.menuName, 'Purchase Order');
    assert.equal(result.skipTo, 'generate-frontend');
  });

  it('ignores unknown flags gracefully', () => {
    const result = run('--unknown-flag', '143', 'sales-order');
    // --unknown-flag starts with -- so it's not treated as positional
    assert.equal(result.windowId, '143');
    assert.equal(result.windowName, 'sales-order');
  });

  it('parses menu-id flag', () => {
    const result = run('--menu-id', 'M1');
    assert.equal(result.menuId, 'M1');
  });

  it('parses positional windowId and windowName', () => {
    const result = run('ABC123', 'my-window');
    assert.equal(result.windowId, 'ABC123');
    assert.equal(result.windowName, 'my-window');
  });

  it('sets windowId from first positional arg only', () => {
    const result = run('W1', 'W2', 'W3');
    assert.equal(result.windowId, 'W1');
    assert.equal(result.windowName, 'W2');
    // W3 is ignored (no more positional slots)
  });
});

// ---------------------------------------------------------------------------
// buildPipelineSteps — extended
// ---------------------------------------------------------------------------

describe('buildPipelineSteps', () => {
  it('returns expected step count', () => {
    const steps = buildPipelineSteps();
    assert.ok(steps.length >= 10);
  });

  it('starts with extract-fields', () => {
    const steps = buildPipelineSteps();
    assert.equal(steps[0].name, 'extract-fields');
  });

  it('ends with run-tests', () => {
    const steps = buildPipelineSteps();
    assert.equal(steps[steps.length - 1].name, 'run-tests');
  });

  it('each step has name and description', () => {
    const steps = buildPipelineSteps();
    for (const step of steps) {
      assert.ok(step.name);
      assert.ok(step.description);
    }
  });

  it('marks translate-todos as interactive', () => {
    const steps = buildPipelineSteps();
    const td = steps.find(s => s.name === 'translate-todos');
    assert.ok(td);
    assert.equal(td.interactive, true);
  });

  it('marks validate-field-names as optional', () => {
    const steps = buildPipelineSteps();
    const vfn = steps.find(s => s.name === 'validate-field-names');
    assert.ok(vfn);
    assert.equal(vfn.optional, true);
  });
});

// ---------------------------------------------------------------------------
// handleStepError
// ---------------------------------------------------------------------------

describe('handleStepError', () => {
  it('does not throw for optional step', () => {
    // handleStepError logs but does not throw for optional steps
    const step = { name: 'validate-field-names', optional: true };
    // Should not throw
    handleStepError(step, new Error('optional failure'));
  });
});

// ---------------------------------------------------------------------------
// writeGeneratedFiles
// ---------------------------------------------------------------------------

describe('writeGeneratedFiles', () => {
  it('writes all files via resolve + writeFile', async () => {
    const writeCalls = [];
    const mockWriteFile = async (path, code, enc) => { writeCalls.push({ path, code, enc }); };
    const mockResolve = (...parts) => parts.join('/');

    const files = { 'A.jsx': 'codeA', 'B.jsx': 'codeB' };
    await writeGeneratedFiles(files, mockResolve, '/out', mockWriteFile);

    assert.equal(writeCalls.length, 2);
    assert.equal(writeCalls[0].path, '/out/A.jsx');
    assert.equal(writeCalls[1].path, '/out/B.jsx');
  });

  it('skips internal marker keys starting with __', async () => {
    const writeCalls = [];
    const mockWriteFile = async (path, code, enc) => { writeCalls.push({ path }); };
    const mockResolve = (...parts) => parts.join('/');

    const files = { '__internal': 'skip', 'Real.jsx': 'code' };
    await writeGeneratedFiles(files, mockResolve, '/out', mockWriteFile);

    assert.equal(writeCalls.length, 1);
    assert.equal(writeCalls[0].path, '/out/Real.jsx');
  });
});

// ---------------------------------------------------------------------------
// printTranslateTodosGuidance
// ---------------------------------------------------------------------------

describe('printTranslateTodosGuidance', () => {
  it('does not throw for translate-todos step', () => {
    // Just ensure it doesn't error
    printTranslateTodosGuidance({ name: 'translate-todos' });
  });

  it('does not print for non-translate-todos step', () => {
    // Should be a no-op
    printTranslateTodosGuidance({ name: 'extract-fields' });
  });
});

// ---------------------------------------------------------------------------
// logTestResults
// ---------------------------------------------------------------------------

describe('logTestResults', () => {
  it('does not throw for passing results', () => {
    logTestResults({ passed: 5, failed: 0, total: 5, skipped: 0, results: [] });
  });

  it('does not throw for failing results', () => {
    logTestResults({
      passed: 3,
      failed: 2,
      total: 5,
      skipped: 0,
      results: [
        { passed: true, description: 'OK' },
        { passed: false, description: 'fail 1', reason: 'bad' },
        { passed: false, description: 'fail 2', reason: 'worse' },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// logDryRunOutcome
// ---------------------------------------------------------------------------

describe('logDryRunOutcome', () => {
  it('logs dry run message when dryRun is true', () => {
    // Should not throw
    logDryRunOutcome(true, {});
  });

  it('logs spec id when dryRun is false', () => {
    logDryRunOutcome(false, { specId: 'SP1' });
  });
});

// ---------------------------------------------------------------------------
// resolveWindowNameFromId
// ---------------------------------------------------------------------------

describe('resolveWindowNameFromId', () => {
  it('returns kebab-case name from DB query', async () => {
    const queryFn = async () => ({ rows: [{ name: 'Sales Order' }] });
    const result = await resolveWindowNameFromId('W1', { queryFn });
    assert.equal(result, 'sales-order');
  });

  it('throws when windowId is falsy', async () => {
    await assert.rejects(
      () => resolveWindowNameFromId(null),
      /windowId is required/,
    );
  });

  it('throws when no rows returned', async () => {
    const queryFn = async () => ({ rows: [] });
    await assert.rejects(
      () => resolveWindowNameFromId('W1', { queryFn }),
      /not found/,
    );
  });

  it('throws when row has no name', async () => {
    const queryFn = async () => ({ rows: [{}] });
    await assert.rejects(
      () => resolveWindowNameFromId('W1', { queryFn }),
      /missing Name/,
    );
  });

  it('uses Name (capitalized) key if present', async () => {
    const queryFn = async () => ({ rows: [{ Name: 'Purchase Order' }] });
    const result = await resolveWindowNameFromId('W1', { queryFn });
    assert.equal(result, 'purchase-order');
  });
});

// ---------------------------------------------------------------------------
// ensureProcessesFile
// ---------------------------------------------------------------------------

describe('ensureProcessesFile', () => {
  it('does nothing if file already exists', async () => {
    const accessOk = async () => {};
    const mkdirCalls = [];
    const writeCalls = [];
    const mkdir = async (d, o) => { mkdirCalls.push(d); };
    const writeFile = async (p, c) => { writeCalls.push(p); };

    await ensureProcessesFile(accessOk, 'processes.json', mkdir, 'test', writeFile);
    assert.equal(mkdirCalls.length, 0);
    assert.equal(writeCalls.length, 0);
  });

  it('creates file if it does not exist', async () => {
    const accessFail = async () => { throw new Error('ENOENT'); };
    const mkdirCalls = [];
    const writeCalls = [];
    const mkdir = async (d, o) => { mkdirCalls.push(d); };
    const writeFile = async (p, c) => { writeCalls.push({ p, c }); };

    await ensureProcessesFile(accessFail, 'artifacts/test/processes.json', mkdir, 'test', writeFile);
    assert.equal(mkdirCalls.length, 1);
    assert.equal(writeCalls.length, 1);
    assert.ok(writeCalls[0].c.includes('"processes"'));
  });
});

// ---------------------------------------------------------------------------
// writeCustomScaffoldFiles
// ---------------------------------------------------------------------------

describe('writeCustomScaffoldFiles', () => {
  it('creates new files when they do not exist', async () => {
    const accessFail = async () => { throw new Error('ENOENT'); };
    const writeCalls = [];
    const writeFile = async (p, c, enc) => { writeCalls.push({ p, c }); };

    const files = { 'index.jsx': 'idx-code', 'mockCatalogs.js': 'cat-code' };
    await writeCustomScaffoldFiles(accessFail, '/out/index.jsx', '/out/mockCatalogs.js', files, writeFile);

    assert.equal(writeCalls.length, 2);
    assert.equal(writeCalls[0].p, '/out/index.jsx');
    assert.equal(writeCalls[0].c, 'idx-code');
    assert.equal(writeCalls[1].p, '/out/mockCatalogs.js');
    assert.equal(writeCalls[1].c, 'cat-code');
  });

  it('writes .new files when they already exist', async () => {
    let calls = 0;
    const accessOk = async () => { calls++; };
    const writeCalls = [];
    const writeFile = async (p, c, enc) => { writeCalls.push({ p }); };

    const files = { 'index.jsx': 'new-idx', 'mockCatalogs.js': 'new-cat' };
    await writeCustomScaffoldFiles(accessOk, '/out/index.jsx', '/out/mockCatalogs.js', files, writeFile);

    // Should write to .new paths
    assert.equal(writeCalls[0].p, '/out/index.jsx.new');
    assert.equal(writeCalls[1].p, '/out/mockCatalogs.js.new');
  });
});

// ---------------------------------------------------------------------------
// buildProcessPipelineSteps — process type variations
// ---------------------------------------------------------------------------

describe('buildProcessPipelineSteps — step structure', () => {
  it('contains extract-process as first step', () => {
    const steps = buildProcessPipelineSteps();
    assert.equal(steps[0].name, 'extract-process');
    assert.equal(steps[0].phase, 'P1');
  });

  it('contains generate-process-contract step', () => {
    const steps = buildProcessPipelineSteps();
    const contractStep = steps.find(s => s.name === 'generate-process-contract');
    assert.ok(contractStep);
    assert.equal(contractStep.phase, 'P2');
  });

  it('contains push-process-to-neo step', () => {
    const steps = buildProcessPipelineSteps();
    const pushStep = steps.find(s => s.name === 'push-process-to-neo');
    assert.ok(pushStep);
    assert.equal(pushStep.phase, 'P3');
  });

  it('contains generate-process-frontend step', () => {
    const steps = buildProcessPipelineSteps();
    const genStep = steps.find(s => s.name === 'generate-process-frontend');
    assert.ok(genStep);
    assert.equal(genStep.phase, 'P4');
  });

  it('each step description is non-empty', () => {
    const steps = buildProcessPipelineSteps();
    for (const step of steps) {
      assert.ok(step.description.length > 0, `${step.name} has empty description`);
    }
  });
});

// ---------------------------------------------------------------------------
// validatePipelineInput — all invalid mode combinations
// ---------------------------------------------------------------------------

describe('validatePipelineInput — invalid combinations', () => {
  it('rejects windowId without windowName', () => {
    const result = validatePipelineInput({ windowId: 'W1' });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('windowName'));
  });

  it('rejects empty object', () => {
    const result = validatePipelineInput({});
    assert.equal(result.valid, false);
  });

  it('rejects processId without processName', () => {
    const result = validatePipelineInput({ processId: 'P1' });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('processName'));
  });

  it('rejects reportId without reportName', () => {
    const result = validatePipelineInput({ reportId: 'R1' });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('reportName'));
  });

  it('accepts windowId + windowName as window mode', () => {
    const result = validatePipelineInput({ windowId: 'W1', windowName: 'sales-order' });
    assert.equal(result.valid, true);
    assert.equal(result.mode, 'window');
  });

  it('menu mode takes precedence over window mode', () => {
    const result = validatePipelineInput({ menuName: 'Sales', windowId: 'W1', windowName: 'x' });
    assert.equal(result.mode, 'menu');
  });

  it('report mode takes precedence over process mode', () => {
    const result = validatePipelineInput({ reportId: 'R1', reportName: 'Report', processId: 'P1', processName: 'Proc' });
    assert.equal(result.mode, 'report');
  });
});

// ---------------------------------------------------------------------------
// parseArgs — every flag combination
// ---------------------------------------------------------------------------

describe('parseArgs — all flag combinations', () => {
  const run = (...tokens) => parseArgs(['node', 'pipeline.js', ...tokens]);

  it('parses --menu-id flag', () => {
    const result = run('--menu-id', 'M100');
    assert.equal(result.menuId, 'M100');
  });

  it('parses --menu-name flag', () => {
    const result = run('--menu-name', 'Purchase Invoice');
    assert.equal(result.menuName, 'Purchase Invoice');
  });

  it('parses --process-id flag', () => {
    const result = run('--process-id', 'PRC1');
    assert.equal(result.processId, 'PRC1');
  });

  it('parses --process-name flag', () => {
    const result = run('--process-name', 'Generate Lines');
    assert.equal(result.processName, 'Generate Lines');
  });

  it('parses --report-id flag', () => {
    const result = run('--report-id', 'RPT1');
    assert.equal(result.reportId, 'RPT1');
  });

  it('parses --report-name flag', () => {
    const result = run('--report-name', 'Balance Sheet');
    assert.equal(result.reportName, 'Balance Sheet');
  });

  it('parses --dry-run flag', () => {
    const result = run('--dry-run');
    assert.equal(result.dryRun, true);
  });

  it('parses --skip-interactive flag', () => {
    const result = run('--skip-interactive');
    assert.equal(result.skipInteractive, true);
  });

  it('parses --skip-to flag', () => {
    const result = run('--skip-to', 'generate-frontend');
    assert.equal(result.skipTo, 'generate-frontend');
  });

  it('parses all flags together', () => {
    const result = run(
      '--menu-id', 'M1',
      '--menu-name', 'SO',
      '--process-id', 'P1',
      '--process-name', 'Gen',
      '--report-id', 'R1',
      '--report-name', 'Bal',
      '--dry-run',
      '--skip-interactive',
      '--skip-to', 'resolve-curated',
    );
    assert.equal(result.menuId, 'M1');
    assert.equal(result.menuName, 'SO');
    assert.equal(result.processId, 'P1');
    assert.equal(result.processName, 'Gen');
    assert.equal(result.reportId, 'R1');
    assert.equal(result.reportName, 'Bal');
    assert.equal(result.dryRun, true);
    assert.equal(result.skipInteractive, true);
    assert.equal(result.skipTo, 'resolve-curated');
  });

  it('parses positional args with no flags', () => {
    const result = run('WINDOWID123', 'my-window-name');
    assert.equal(result.windowId, 'WINDOWID123');
    assert.equal(result.windowName, 'my-window-name');
  });

  it('does not set dryRun when not passed', () => {
    const result = run('--menu-name', 'Test');
    assert.equal(result.dryRun, undefined);
  });

  it('does not set skipInteractive when not passed', () => {
    const result = run('--menu-name', 'Test');
    assert.equal(result.skipInteractive, undefined);
  });
});

// ---------------------------------------------------------------------------
// validatePipelineInput — window mode edge cases
// ---------------------------------------------------------------------------

describe('validatePipelineInput — window mode edge cases', () => {
  it('accepts windowId + windowName in window mode', () => {
    const result = validatePipelineInput({ windowId: 'W1', windowName: 'purchase-order' });
    assert.equal(result.valid, true);
    assert.equal(result.mode, 'window');
  });

  it('rejects when only windowName is provided without windowId', () => {
    const result = validatePipelineInput({ windowName: 'sales-order' });
    assert.equal(result.valid, false);
  });

  it('rejects when windowId is empty string', () => {
    const result = validatePipelineInput({ windowId: '', windowName: 'sales-order' });
    assert.equal(result.valid, false);
  });

  it('menu mode takes precedence over all other modes', () => {
    const result = validatePipelineInput({
      menuId: 'M1',
      windowId: 'W1',
      windowName: 'x',
      processId: 'P1',
      processName: 'y',
      reportId: 'R1',
      reportName: 'z',
    });
    assert.equal(result.mode, 'menu');
    assert.equal(result.valid, true);
  });
});

// ---------------------------------------------------------------------------
// handleStepError — additional
// ---------------------------------------------------------------------------

describe('handleStepError — additional', () => {
  it('does not throw for optional step with complex error', () => {
    const step = { name: 'validate-field-names', optional: true };
    // Should log but not throw
    handleStepError(step, new Error('complex optional failure with details'));
  });

  it('handles optional step with empty error message', () => {
    const step = { name: 'validate-field-names', optional: true };
    handleStepError(step, new Error(''));
  });
});

// ---------------------------------------------------------------------------
// loadPreviousContract — additional edge cases
// ---------------------------------------------------------------------------

describe('loadPreviousContract — additional', () => {
  it('handles deeply nested version (3 levels)', async () => {
    const contractData = { version: { version: { version: '3.0.0' } } };
    const readFile = async () => JSON.stringify(contractData);
    const result = await loadPreviousContract(readFile, 'test', null, null, null);
    assert.equal(result.prevVersion, '3.0.0');
  });

  it('handles version as a string directly', async () => {
    const contractData = { version: '1.5.0', frontendContract: {} };
    const readFile = async () => JSON.stringify(contractData);
    const result = await loadPreviousContract(readFile, 'test', null, null, null);
    assert.equal(result.prevVersion, '1.5.0');
  });

  it('falls back to defaults on any read error', async () => {
    const readFile = async () => { throw new Error('permission denied'); };
    const result = await loadPreviousContract(readFile, 'test', 'fallback-v', { old: true }, 'raw');
    // Catch-all: returns fallback values instead of throwing
    assert.equal(result.prevVersion, 'fallback-v');
    assert.deepEqual(result.prevContract, { old: true });
    assert.equal(result.prevContractRaw, 'raw');
  });
});

// ---------------------------------------------------------------------------
// resolveWindowNameFromId — additional
// ---------------------------------------------------------------------------

describe('resolveWindowNameFromId — additional', () => {
  it('converts multi-word window name to kebab-case', async () => {
    const queryFn = async () => ({ rows: [{ name: 'Internal Consumption' }] });
    const result = await resolveWindowNameFromId('W1', { queryFn });
    assert.equal(result, 'internal-consumption');
  });

  it('throws when empty string passed as windowId', async () => {
    await assert.rejects(
      () => resolveWindowNameFromId(''),
      /windowId is required/,
    );
  });
});

// ---------------------------------------------------------------------------
// writeGeneratedFiles — additional
// ---------------------------------------------------------------------------

describe('writeGeneratedFiles — additional', () => {
  it('handles single file', async () => {
    const writeCalls = [];
    const mockWriteFile = async (path, code, enc) => { writeCalls.push({ path, code }); };
    const mockResolve = (...parts) => parts.join('/');
    const files = { 'Only.jsx': 'code' };
    await writeGeneratedFiles(files, mockResolve, '/dir', mockWriteFile);
    assert.equal(writeCalls.length, 1);
    assert.equal(writeCalls[0].path, '/dir/Only.jsx');
  });

  it('handles empty files object', async () => {
    const writeCalls = [];
    const mockWriteFile = async (path, code, enc) => { writeCalls.push({ path }); };
    const mockResolve = (...parts) => parts.join('/');
    await writeGeneratedFiles({}, mockResolve, '/dir', mockWriteFile);
    assert.equal(writeCalls.length, 0);
  });
});

// ---------------------------------------------------------------------------
// buildPipelineSteps — step ordering
// ---------------------------------------------------------------------------

describe('buildPipelineSteps — step ordering', () => {
  it('has all step names unique', () => {
    const steps = buildPipelineSteps();
    const names = steps.map(s => s.name);
    assert.equal(new Set(names).size, names.length);
  });

  it('contains resolve-curated step', () => {
    const steps = buildPipelineSteps();
    const found = steps.find(s => s.name === 'resolve-curated');
    assert.ok(found);
  });

  it('contains generate-frontend step', () => {
    const steps = buildPipelineSteps();
    const found = steps.find(s => s.name === 'generate-frontend');
    assert.ok(found);
  });

  it('contains generate-contract step', () => {
    const steps = buildPipelineSteps();
    const found = steps.find(s => s.name === 'generate-contract');
    assert.ok(found);
  });
});
