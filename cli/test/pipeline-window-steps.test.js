import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  loadPreviousContract,
  loadPreviousMcpContract,
  handleMissingDecisionsError,
  runResolveCuratedStep,
  writeCustomScaffoldFiles,
  loadOrMigrateDecisions,
  scaffoldSecondaryTabCustomForms,
  runAdvisoryVersionCheck,
  writeGeneratedFiles,
  autoRegisterCustomLoader,
  ensureProcessesFile,
  handleStepError,
  printTranslateTodosGuidance,
  runPushToNeoStep,
  runValidateFieldNamesStep,
  logTestResults,
  logDryRunOutcome,
  getPipelineLabel,
  createDirectoryAndWriteFiles,
  runValidateSchemaStep,
  runContractTestsStep,
  runGenerateContractStep,
  loadWindowDecisions,
  executePipelineStep,
  runGenerateFrontendStep,
  loadDecisionsAndResolve,
} from '../src/pipeline.js';
import { tmpdir } from 'node:os';
import { mkdtemp, writeFile as fsWriteFile, readFile as fsReadFile, mkdir as fsMkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve as resolvePathAbs, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// These helpers were extracted out of runWindowPipeline and are fully
// dependency-injected (readFile / writeFile / access / resolveCurated / path
// helpers are passed as parameters), so every test below uses plain async stub
// functions — no real filesystem or DB access.

describe('loadPreviousContract', () => {
  it('reads and parses an existing contract with a string version', async () => {
    const contract = { version: '1.2.0', frontendContract: { foo: 'bar' } };
    const raw = JSON.stringify(contract);
    const readCalls = [];
    const readFile = async (path, enc) => {
      readCalls.push([path, enc]);
      return raw;
    };

    const result = await loadPreviousContract(readFile, 'sales-order', null, null, null);

    assert.deepEqual(readCalls, [['artifacts/sales-order/contract.json', 'utf-8']]);
    assert.equal(result.prevVersion, '1.2.0');
    assert.deepEqual(result.prevContract, contract);
    assert.equal(result.prevContractRaw, raw);
  });

  it('drills a nested-object version down to the inner string (version bug guard)', async () => {
    const contract = { version: { version: { version: '2.0' } } };
    const readFile = async () => JSON.stringify(contract);

    const result = await loadPreviousContract(readFile, 'win', null, null, null);

    assert.equal(result.prevVersion, '2.0');
    assert.deepEqual(result.prevContract, contract);
  });

  it('returns the passed-in values unchanged when readFile rejects (no file)', async () => {
    const readFile = async () => { throw new Error('ENOENT: missing'); };

    const result = await loadPreviousContract(readFile, 'win', 'KEEP', { keep: true }, 'rawKeep');

    assert.equal(result.prevVersion, 'KEEP');
    assert.deepEqual(result.prevContract, { keep: true });
    assert.equal(result.prevContractRaw, 'rawKeep');
  });

  it('yields null version when contract has no version field', async () => {
    const readFile = async () => JSON.stringify({ frontendContract: {} });

    const result = await loadPreviousContract(readFile, 'win', 'OLD', null, null);

    assert.equal(result.prevVersion, null);
  });
});

describe('loadPreviousMcpContract', () => {
  it('reads and parses an existing MCP contract', async () => {
    const mcp = { mcp: true, tools: ['a', 'b'] };
    const readCalls = [];
    const readFile = async (path, enc) => {
      readCalls.push([path, enc]);
      return JSON.stringify(mcp);
    };

    const result = await loadPreviousMcpContract(readFile, 'sales-order', null);

    assert.deepEqual(readCalls, [['artifacts/sales-order/contract.mcp.json', 'utf-8']]);
    assert.deepEqual(result, mcp);
  });

  it('returns the passed-in value unchanged when readFile rejects', async () => {
    const readFile = async () => { throw new Error('no file'); };

    const result = await loadPreviousMcpContract(readFile, 'win', { fallback: 1 });

    assert.deepEqual(result, { fallback: 1 });
  });
});

describe('handleMissingDecisionsError', () => {
  it('rethrows a non-ENOENT error (plain Error has no .code)', () => {
    assert.throws(
      () => handleMissingDecisionsError(new Error('boom'), 'path/decisions.json'),
      /boom/
    );
  });

  it('calls process.exit(1) on an ENOENT error', () => {
    const error = new Error('not found');
    error.code = 'ENOENT';

    // In production process.exit(1) terminates the process, so the trailing
    // `throw error` is never reached. The stub throws a sentinel to emulate
    // that halt; we assert the sentinel (not the original error) propagates,
    // which proves the ENOENT branch — not the rethrow branch — was taken.
    const originalExit = process.exit;
    const originalError = console.error;
    const exitCalls = [];
    process.exit = (code) => {
      exitCalls.push(code);
      throw new Error('__EXIT__');
    };
    console.error = () => {};

    try {
      assert.throws(
        () => handleMissingDecisionsError(error, 'p/decisions.json'),
        /__EXIT__/
      );
      assert.deepEqual(exitCalls, [1]);
    } finally {
      process.exit = originalExit;
      console.error = originalError;
    }
  });
});

describe('runResolveCuratedStep', () => {
  it('sets schema and rules on the pipeline context from the resolved result', async () => {
    const resolved = {
      schema: { entities: [{ fields: [1, 2] }, { fields: [3] }] },
      rules: [{ id: 'r1' }],
      unclassifiedCount: 0,
    };
    const calls = [];
    const resolveCurated = async (schemaRaw, rulesRaw, decisions) => {
      calls.push([schemaRaw, rulesRaw, decisions]);
      return resolved;
    };
    const pipelineContext = {};

    await runResolveCuratedStep(resolveCurated, { s: 1 }, { r: 1 }, { d: 1 }, pipelineContext);

    assert.equal(pipelineContext.schema, resolved.schema);
    assert.equal(pipelineContext.rules, resolved.rules);
    // resolveCurated received the raw args in order
    assert.deepEqual(calls, [[{ s: 1 }, { r: 1 }, { d: 1 }]]);
  });

  it('warns (does not throw) when unclassifiedCount > 0', async () => {
    const resolved = {
      schema: { entities: [{ fields: [1] }] },
      rules: [],
      unclassifiedCount: 5,
    };
    const resolveCurated = async () => resolved;
    const pipelineContext = {};
    const originalWarn = console.warn;
    let warned = false;
    console.warn = () => { warned = true; };
    try {
      await runResolveCuratedStep(resolveCurated, {}, {}, {}, pipelineContext);
    } finally {
      console.warn = originalWarn;
    }
    assert.equal(warned, true);
    assert.equal(pipelineContext.schema, resolved.schema);
  });
});

describe('writeCustomScaffoldFiles', () => {
  const files = { 'index.jsx': 'INDEX_CODE', 'mockCatalogs.js': 'CATALOG_CODE' };

  it('writes to base paths when neither file exists', async () => {
    const access = async () => { throw new Error('missing'); };
    const writes = [];
    const writeFile = async (path, content) => { writes.push([path, content]); };

    await writeCustomScaffoldFiles(access, '/idx/index.jsx', '/cat/mockCatalogs.js', files, writeFile);

    assert.deepEqual(writes, [
      ['/idx/index.jsx', 'INDEX_CODE'],
      ['/cat/mockCatalogs.js', 'CATALOG_CODE'],
    ]);
  });

  it('writes to .new paths when both files already exist (preserving originals)', async () => {
    const access = async () => undefined; // resolves => exists
    const writes = [];
    const writeFile = async (path, content) => { writes.push([path, content]); };

    await writeCustomScaffoldFiles(access, '/idx/index.jsx', '/cat/mockCatalogs.js', files, writeFile);

    assert.deepEqual(writes, [
      ['/idx/index.jsx.new', 'INDEX_CODE'],
      ['/cat/mockCatalogs.js.new', 'CATALOG_CODE'],
    ]);
  });

  it('handles a mixed state: index exists, catalog missing', async () => {
    const access = async (path) => {
      if (path === '/idx/index.jsx') return undefined; // exists
      throw new Error('missing'); // catalog missing
    };
    const writes = [];
    const writeFile = async (path, content) => { writes.push([path, content]); };

    await writeCustomScaffoldFiles(access, '/idx/index.jsx', '/cat/mockCatalogs.js', files, writeFile);

    assert.deepEqual(writes, [
      ['/idx/index.jsx.new', 'INDEX_CODE'],
      ['/cat/mockCatalogs.js', 'CATALOG_CODE'],
    ]);
  });
});

describe('loadOrMigrateDecisions', () => {
  // Regression test for the recently fixed bug: when the curated file read
  // fails with a NON-ENOENT error, the function must route through
  // handleMissingDecisionsError, whose non-ENOENT branch RETHROWS the error
  // (rather than silently continuing to resolve-curated). A plain Error has no
  // .code, so it must propagate.
  it('rethrows a non-ENOENT readFile error via handleMissingDecisionsError (regression)', async () => {
    const readFile = async () => { throw new Error('disk fail'); };

    await assert.rejects(
      () => loadOrMigrateDecisions(readFile, '/curated.json', 'win', null, '/decisions.json'),
      /disk fail/
    );
  });

  it('exits via process.exit(1) when the curated read fails with ENOENT', async () => {
    const readFile = async () => {
      const err = new Error('no curated');
      err.code = 'ENOENT';
      throw err;
    };
    // process.exit terminates in production; the stub throws a sentinel to
    // emulate the halt so execution does not fall through to the rethrow.
    const originalExit = process.exit;
    const originalError = console.error;
    const exitCalls = [];
    process.exit = (code) => {
      exitCalls.push(code);
      throw new Error('__EXIT__');
    };
    console.error = () => {};
    try {
      await assert.rejects(
        () => loadOrMigrateDecisions(readFile, '/curated.json', 'win', null, '/decisions.json'),
        /__EXIT__/
      );
      assert.deepEqual(exitCalls, [1]);
    } finally {
      process.exit = originalExit;
      console.error = originalError;
    }
  });
});

describe('scaffoldSecondaryTabCustomForms', () => {
  // Simple path-helper stubs — the function only uses them to build a directory
  // and file paths, so deterministic joins are enough.
  const fileURLToPathMod = () => '/repo/cli/src/pipeline.js';
  const resolvePath = (...parts) => parts.join('/');
  const dirnamePath = (p) => p;

  it('returns true and writes nothing when there are no secondaryTabs', async () => {
    const writes = [];
    const mkdirs = [];
    const contract = { frontendContract: { window: {} } };

    const result = await scaffoldSecondaryTabCustomForms(contract, 'win', {
      fileURLToPath: fileURLToPathMod,
      resolve: resolvePath,
      dirname: dirnamePath,
      mkdir: async (...a) => { mkdirs.push(a); },
      access: async () => { throw new Error('missing'); },
      writeFile: async (...a) => { writes.push(a); },
    });

    assert.equal(result, true);
    assert.equal(writes.length, 0);
    assert.equal(mkdirs.length, 0);
  });

  it('scaffolds a custom form when the file is missing', async () => {
    const writes = [];
    const mkdirs = [];
    const contract = {
      frontendContract: {
        window: { secondaryTabs: { tabA: { customForm: 'MyForm' } } },
      },
    };

    const result = await scaffoldSecondaryTabCustomForms(contract, 'my-window', {
      fileURLToPath: fileURLToPathMod,
      resolve: resolvePath,
      dirname: dirnamePath,
      mkdir: async (...a) => { mkdirs.push(a); },
      access: async () => { throw new Error('missing'); }, // form does not exist
      writeFile: async (path, content) => { writes.push([path, content]); },
    });

    assert.equal(result, true);
    assert.equal(mkdirs.length, 1);
    assert.equal(writes.length, 1);
    const [formPath, content] = writes[0];
    assert.ok(formPath.endsWith('MyForm.jsx'), `expected path to end with MyForm.jsx, got ${formPath}`);
    assert.ok(content.includes('my-window'), 'stub content should reference the window name');
    assert.ok(content.includes('MyForm'), 'stub content should declare the component');
  });

  it('does not overwrite a custom form that already exists', async () => {
    const writes = [];
    const contract = {
      frontendContract: {
        window: { secondaryTabs: { tabA: { customForm: 'Existing' } } },
      },
    };

    const result = await scaffoldSecondaryTabCustomForms(contract, 'win', {
      fileURLToPath: fileURLToPathMod,
      resolve: resolvePath,
      dirname: dirnamePath,
      mkdir: async () => {},
      access: async () => undefined, // access resolves => form exists
      writeFile: async (path, content) => { writes.push([path, content]); },
    });

    assert.equal(result, true);
    assert.equal(writes.length, 0);
  });

  it('ignores secondaryTabs entries without a customForm', async () => {
    const writes = [];
    const contract = {
      frontendContract: {
        window: { secondaryTabs: { tabA: { somethingElse: true } } },
      },
    };

    const result = await scaffoldSecondaryTabCustomForms(contract, 'win', {
      fileURLToPath: fileURLToPathMod,
      resolve: resolvePath,
      dirname: dirnamePath,
      mkdir: async () => {},
      access: async () => { throw new Error('missing'); },
      writeFile: async (...a) => { writes.push(a); },
    });

    assert.equal(result, true);
    assert.equal(writes.length, 0);
  });
});

describe('runAdvisoryVersionCheck', () => {
  // runAdvisoryVersionCheck dynamically imports ./check-version.js, which needs
  // DB access for a real window. The function's contract is that the version
  // check is purely ADVISORY: it must never throw and must never return a
  // truthy/failing value, regardless of whether checkVersion errors out or
  // simply finds no changelog. We assert that no-throw / undefined contract
  // directly by calling it on a window whose artifacts do not exist. Both the
  // catch branch (checkVersion throws) and the "no versionResult" branch
  // satisfy this contract. No DB and no source change required.
  it('does not throw and returns undefined for a non-existent window (advisory)', async () => {
    const originalLog = console.log;
    const originalWarn = console.warn;
    console.log = () => {};
    console.warn = () => {};

    let result;
    let threw = false;
    try {
      result = await runAdvisoryVersionCheck('__nonexistent_window_for_test__');
    } catch {
      threw = true;
    } finally {
      console.log = originalLog;
      console.warn = originalWarn;
    }

    assert.equal(threw, false, 'advisory version check must never throw');
    assert.equal(result, undefined, 'advisory version check must not return a value');
  });
});

describe('writeGeneratedFiles', () => {
  // Deterministic path join so we can assert the exact resolved file paths.
  const resolvePath = (...parts) => parts.join('/');

  it('writes every file via resolvePath/writeFile', async () => {
    const files = { 'HeaderPage.jsx': 'HEADER', 'ListView.jsx': 'LIST' };
    const writes = [];
    const writeFile = async (path, content, enc) => { writes.push([path, content, enc]); };

    await writeGeneratedFiles(files, resolvePath, '/out/dir', writeFile);

    assert.deepEqual(writes, [
      ['/out/dir/HeaderPage.jsx', 'HEADER', 'utf8'],
      ['/out/dir/ListView.jsx', 'LIST', 'utf8'],
    ]);
  });

  it('skips keys starting with "__" (internal marker keys)', async () => {
    const files = { '__meta': 'IGNORED', 'Page.jsx': 'CODE', '__registry': 'IGNORED2' };
    const writes = [];
    const writeFile = async (path, content) => { writes.push([path, content]); };

    await writeGeneratedFiles(files, resolvePath, '/out', writeFile);

    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0], ['/out/Page.jsx', 'CODE']);
  });
});

describe('autoRegisterCustomLoader', () => {
  const resolvePath = (...parts) => parts.join('/');
  const repoRoot = '/repo';
  const registryPath = '/repo/tools/app-shell/src/windows/registry.js';
  const baseRegistry = [
    'const customLoaders = {',
    '  // Auto-registered by pipeline',
    "  'existing-window': () => import('./custom/existing-window/index.jsx'),",
    '};',
    '',
  ].join('\n');

  it('does not write when the window is already registered', async () => {
    const readFile = async () => baseRegistry;
    const writes = [];
    const writeFile = async (path, content) => { writes.push([path, content]); };

    await autoRegisterCustomLoader(resolvePath, repoRoot, readFile, 'existing-window', writeFile);

    assert.equal(writes.length, 0);
  });

  it('inserts a loader entry for a new window after the auto-register comment', async () => {
    const readFile = async (path) => {
      assert.equal(path, registryPath);
      return baseRegistry;
    };
    const writes = [];
    const writeFile = async (path, content) => { writes.push([path, content]); };

    await autoRegisterCustomLoader(resolvePath, repoRoot, readFile, 'new-window', writeFile);

    assert.equal(writes.length, 1);
    const [path, content] = writes[0];
    assert.equal(path, registryPath);
    assert.ok(
      content.includes("'new-window': () => import('./custom/new-window/index.jsx'),"),
      `expected loader entry inserted, got:\n${content}`,
    );
    // The new entry must sit right after the auto-register marker comment.
    assert.match(
      content,
      /\/\/ Auto-registered by pipeline\n {2}'new-window': \(\) => import\('\.\/custom\/new-window\/index\.jsx'\),/,
    );
  });
});

describe('ensureProcessesFile', () => {
  it('does nothing when the processes file already exists', async () => {
    const access = async () => undefined; // resolves => exists
    const mkdirs = [];
    const writes = [];
    const mkdir = async (...a) => { mkdirs.push(a); };
    const writeFile = async (...a) => { writes.push(a); };

    await ensureProcessesFile(access, 'artifacts/win/processes.json', mkdir, 'win', writeFile);

    assert.equal(mkdirs.length, 0);
    assert.equal(writes.length, 0);
  });

  it('creates the artifact dir and writes an empty processes file when missing', async () => {
    const access = async () => { throw new Error('ENOENT'); };
    const mkdirs = [];
    const writes = [];
    const mkdir = async (path, opts) => { mkdirs.push([path, opts]); };
    const writeFile = async (path, content) => { writes.push([path, content]); };

    await ensureProcessesFile(access, 'artifacts/win/processes.json', mkdir, 'win', writeFile);

    assert.deepEqual(mkdirs, [['artifacts/win', { recursive: true }]]);
    assert.equal(writes.length, 1);
    const [path, content] = writes[0];
    assert.equal(path, 'artifacts/win/processes.json');
    assert.deepEqual(JSON.parse(content), { processes: [] });
    assert.ok(content.endsWith('\n'), 'file content should end with a trailing newline');
  });
});

describe('handleStepError', () => {
  it('logs and continues (no process.exit) for an optional step', () => {
    const originalExit = process.exit;
    const originalLog = console.log;
    const exitCalls = [];
    const logs = [];
    process.exit = (code) => { exitCalls.push(code); };
    console.log = (msg) => { logs.push(String(msg)); };
    try {
      handleStepError({ name: 'optional-step', optional: true }, new Error('boom'));
    } finally {
      process.exit = originalExit;
      console.log = originalLog;
    }
    assert.deepEqual(exitCalls, [], 'optional step must not call process.exit');
    assert.ok(
      logs.some(l => l.includes('optional-step') && l.includes('boom')),
      `expected an optional-failure log, got: ${JSON.stringify(logs)}`,
    );
  });

  it('calls process.exit(1) for a non-optional step', () => {
    // process.exit terminates in production; the stub throws a sentinel so we
    // can assert the exit branch was reached without continuing execution.
    const originalExit = process.exit;
    const originalError = console.error;
    const exitCalls = [];
    process.exit = (code) => {
      exitCalls.push(code);
      throw new Error('__EXIT__');
    };
    console.error = () => {};
    try {
      assert.throws(
        () => handleStepError({ name: 'critical-step', optional: false }, new Error('fatal')),
        /__EXIT__/,
      );
      assert.deepEqual(exitCalls, [1]);
    } finally {
      process.exit = originalExit;
      console.error = originalError;
    }
  });
});

describe('printTranslateTodosGuidance', () => {
  it('logs the 3 guidance lines for the translate-todos step', () => {
    const originalLog = console.log;
    const logs = [];
    console.log = (msg) => { logs.push(String(msg)); };
    try {
      printTranslateTodosGuidance({ name: 'translate-todos' });
    } finally {
      console.log = originalLog;
    }
    assert.equal(logs.length, 3, `expected 3 guidance lines, got ${logs.length}`);
    assert.ok(logs[0].includes('TODO comments'));
    assert.ok(logs[1].includes('callout/onchange'));
    assert.ok(logs[2].includes('--skip-to=run-tests'));
  });

  it('logs nothing for any other step name', () => {
    const originalLog = console.log;
    const logs = [];
    console.log = (msg) => { logs.push(String(msg)); };
    try {
      printTranslateTodosGuidance({ name: 'generate-frontend' });
    } finally {
      console.log = originalLog;
    }
    assert.equal(logs.length, 0);
  });
});

describe('runPushToNeoStep', () => {
  // The injected pushToNeoFn stub avoids any DB / push-to-neo.js import.
  it('configures NEO and returns true on the non-dry-run branch', async () => {
    const calls = [];
    const pushToNeoFn = async (windowName, opts) => {
      calls.push([windowName, opts]);
      return { fieldsUpdated: 3 };
    };
    const originalLog = console.log;
    const logs = [];
    console.log = (msg) => { logs.push(String(msg)); };

    let result;
    try {
      result = await runPushToNeoStep('sales-order', { pushToNeoFn });
    } finally {
      console.log = originalLog;
    }

    assert.equal(result, true);
    assert.deepEqual(calls, [['sales-order', { dryRun: false }]]);
    assert.ok(
      logs.some(l => l.includes('NEO Headless configured') && l.includes('3 fields')),
      `expected a "NEO Headless configured (3 fields)" log, got: ${JSON.stringify(logs)}`,
    );
  });

  it('reports the plan and returns undefined on the dry-run branch', async () => {
    const calls = [];
    const pushToNeoFn = async (windowName, opts) => {
      calls.push([windowName, opts]);
      return { summary: { totalFields: 7 } };
    };
    const originalLog = console.log;
    const logs = [];
    console.log = (msg) => { logs.push(String(msg)); };
    // Temporarily flag --dry-run on argv; restore in finally so other tests
    // (and the non-dry-run case above) are unaffected.
    process.argv.push('--dry-run');

    let result;
    try {
      result = await runPushToNeoStep('sales-order', { pushToNeoFn });
    } finally {
      process.argv.pop();
      console.log = originalLog;
    }

    assert.equal(result, undefined);
    assert.deepEqual(calls, [['sales-order', { dryRun: true }]]);
    assert.ok(
      logs.some(l => l.includes('Dry run: 7 fields planned')),
      `expected a "Dry run: 7 fields planned" log, got: ${JSON.stringify(logs)}`,
    );
  });
});

describe('runValidateFieldNamesStep', () => {
  // The injected validateFieldNamesFn stub avoids any DB / API import.
  it('logs the skip reason on the skipped branch', async () => {
    const validateFieldNamesFn = async () => ({ skipped: true, reason: 'no API' });
    const originalLog = console.log;
    const logs = [];
    console.log = (msg) => { logs.push(String(msg)); };

    try {
      await runValidateFieldNamesStep('win', { validateFieldNamesFn });
    } finally {
      console.log = originalLog;
    }

    assert.ok(
      logs.some(l => l.includes('Skipped') && l.includes('no API')),
      `expected a "Skipped: no API" log, got: ${JSON.stringify(logs)}`,
    );
  });

  it('runs the matched/mismatched/missing/extra log paths without throwing', async () => {
    const validateFieldNamesFn = async () => ({
      skipped: false,
      matched: [{}],
      mismatched: [{ contract: 'a', api: 'b' }],
      missing: ['c'],
      extra: ['d'],
    });
    const originalLog = console.log;
    const originalWarn = console.warn;
    const logs = [];
    const warns = [];
    console.log = (msg) => { logs.push(String(msg)); };
    console.warn = (msg) => { warns.push(String(msg)); };

    let threw = false;
    try {
      await runValidateFieldNamesStep('win', { validateFieldNamesFn });
    } catch {
      threw = true;
    } finally {
      console.log = originalLog;
      console.warn = originalWarn;
    }

    assert.equal(threw, false, 'must not throw on a fully populated result');
    // matched count + missing + extra go to console.log
    assert.ok(logs.some(l => l.includes('1 fields matched')), `matched log missing: ${JSON.stringify(logs)}`);
    assert.ok(logs.some(l => l.includes('contract fields not in API') && l.includes('c')), `missing log missing: ${JSON.stringify(logs)}`);
    assert.ok(logs.some(l => l.includes('extra API fields') && l.includes('d')), `extra log missing: ${JSON.stringify(logs)}`);
    // mismatches go to console.warn (header line + per-mismatch line)
    assert.ok(warns.some(l => l.includes('1 field name mismatches')), `mismatch header missing: ${JSON.stringify(warns)}`);
    assert.ok(warns.some(l => l.includes('a → API returns: b')), `mismatch detail missing: ${JSON.stringify(warns)}`);
  });
});

describe('getPipelineLabel', () => {
  it("returns 'Report' when isReport is truthy", () => {
    assert.equal(getPipelineLabel(true), 'Report');
  });

  it("returns 'Process' when isReport is falsy", () => {
    assert.equal(getPipelineLabel(false), 'Process');
    assert.equal(getPipelineLabel(undefined), 'Process');
    assert.equal(getPipelineLabel(null), 'Process');
  });
});

describe('logTestResults', () => {
  it('logs nothing when no tests failed (failed === 0)', () => {
    const originalError = console.error;
    const errors = [];
    console.error = (msg) => { errors.push(String(msg)); };
    try {
      logTestResults({ failed: 0, results: [{ passed: true, description: 'ok' }] });
    } finally {
      console.error = originalError;
    }
    assert.equal(errors.length, 0, 'no error output expected when nothing failed');
  });

  it('logs a summary line plus one line per failed result, skipping passed ones', () => {
    const originalError = console.error;
    const errors = [];
    console.error = (msg) => { errors.push(String(msg)); };
    try {
      logTestResults({
        failed: 2,
        results: [
          { passed: true, description: 'passing-test', reason: '' },
          { passed: false, description: 'failing-one', reason: 'boom' },
          { passed: false, description: 'failing-two', reason: 'kaboom' },
        ],
      });
    } finally {
      console.error = originalError;
    }
    // 1 summary line + 2 failure detail lines
    assert.equal(errors.length, 3, `expected 3 lines, got: ${JSON.stringify(errors)}`);
    assert.ok(errors.some(l => l.includes('2 tests failed')), `summary missing: ${JSON.stringify(errors)}`);
    assert.ok(errors.some(l => l.includes('failing-one') && l.includes('boom')), `first failure missing: ${JSON.stringify(errors)}`);
    assert.ok(errors.some(l => l.includes('failing-two') && l.includes('kaboom')), `second failure missing: ${JSON.stringify(errors)}`);
    // the passing test must NOT be logged
    assert.ok(!errors.some(l => l.includes('passing-test')), `passed test should not be logged: ${JSON.stringify(errors)}`);
  });
});

describe('logDryRunOutcome', () => {
  it('logs the dry-run line and does not reference specId when dryRun is true', () => {
    const originalLog = console.log;
    const logs = [];
    console.log = (msg) => { logs.push(String(msg)); };
    try {
      logDryRunOutcome(true, { specId: 'SHOULD_NOT_APPEAR' });
    } finally {
      console.log = originalLog;
    }
    assert.ok(logs.some(l => l.includes('Dry run: push plan logged')), `dry-run line missing: ${JSON.stringify(logs)}`);
    assert.ok(!logs.some(l => l.includes('SHOULD_NOT_APPEAR')), `specId must not be referenced on dry run: ${JSON.stringify(logs)}`);
  });

  it('logs the configured line including specId when dryRun is false', () => {
    const originalLog = console.log;
    const logs = [];
    console.log = (msg) => { logs.push(String(msg)); };
    try {
      logDryRunOutcome(false, { specId: 'spec-abc-123' });
    } finally {
      console.log = originalLog;
    }
    assert.ok(
      logs.some(l => l.includes('NEO Headless configured') && l.includes('spec-abc-123')),
      `configured line with specId missing: ${JSON.stringify(logs)}`,
    );
  });
});

describe('createDirectoryAndWriteFiles', () => {
  it('mkdirs the output dir once and writes one file per entry', async () => {
    const mkdirCalls = [];
    const writeCalls = [];
    const mkdir = async (...args) => { mkdirCalls.push(args); };
    const writeFile = async (...args) => { writeCalls.push(args); };
    const files = { 'index.jsx': 'INDEX', 'config.js': 'CONFIG' };

    await createDirectoryAndWriteFiles(mkdir, '/out/dir', files, writeFile);

    assert.deepEqual(mkdirCalls, [['/out/dir', { recursive: true }]]);
    assert.deepEqual(writeCalls, [
      ['/out/dir/index.jsx', 'INDEX', 'utf8'],
      ['/out/dir/config.js', 'CONFIG', 'utf8'],
    ]);
  });

  it('still mkdirs but writes nothing when files is empty', async () => {
    const mkdirCalls = [];
    const writeCalls = [];
    const mkdir = async (...args) => { mkdirCalls.push(args); };
    const writeFile = async (...args) => { writeCalls.push(args); };

    await createDirectoryAndWriteFiles(mkdir, '/empty/dir', {}, writeFile);

    assert.deepEqual(mkdirCalls, [['/empty/dir', { recursive: true }]]);
    assert.equal(writeCalls.length, 0, 'no writeFile calls expected for empty files object');
  });
});

describe('runValidateSchemaStep', () => {
  // The injected validateSchemaFn / readFile / exit seams avoid the real
  // ./validate-schema.js import, real filesystem reads, and a real
  // process.exit that would kill the test runner.
  it('logs a passing line and does not exit when there are no errors', async () => {
    const reads = [];
    const readFile = async (path, enc) => {
      reads.push([path, enc]);
      return JSON.stringify({ entities: [] });
    };
    const validateCalls = [];
    const validateSchemaFn = async (schema) => {
      validateCalls.push(schema);
      return { errors: [], warnings: [{ w: 1 }, { w: 2 }] };
    };
    const exitCalls = [];
    const exit = (code) => { exitCalls.push(code); };

    const originalLog = console.log;
    const logs = [];
    console.log = (msg) => { logs.push(String(msg)); };
    try {
      await runValidateSchemaStep('sales-order', { validateSchemaFn, readFile, exit });
    } finally {
      console.log = originalLog;
    }

    assert.deepEqual(reads, [['artifacts/sales-order/schema-raw.json', 'utf8']]);
    assert.deepEqual(validateCalls, [{ entities: [] }]);
    assert.deepEqual(exitCalls, [], 'exit must not be called when validation passes');
    assert.ok(
      logs.some(l => l.includes('Validation passed') && l.includes('2 warnings')),
      `expected a "Validation passed (2 warnings)" log, got: ${JSON.stringify(logs)}`,
    );
  });

  it('logs each error and calls exit(1) when validation has errors', async () => {
    const readFile = async () => JSON.stringify({ entities: [] });
    const validateSchemaFn = async () => ({
      errors: [
        { level: 1, code: 'E1', message: 'bad field', path: 'a.b' },
        { level: 2, code: 'E2', message: 'worse', path: 'c.d' },
      ],
      warnings: [],
    });
    const exitCalls = [];
    const exit = (code) => { exitCalls.push(code); };

    const originalError = console.error;
    const originalLog = console.log;
    const errors = [];
    const logs = [];
    console.error = (msg) => { errors.push(String(msg)); };
    console.log = (msg) => { logs.push(String(msg)); };
    try {
      await runValidateSchemaStep('win', { validateSchemaFn, readFile, exit });
    } finally {
      console.error = originalError;
      console.log = originalLog;
    }

    assert.deepEqual(exitCalls, [1], 'exit(1) must be called once on validation errors');
    assert.ok(errors.some(l => l.includes('Schema validation failed')), `header missing: ${JSON.stringify(errors)}`);
    assert.ok(errors.some(l => l.includes('E1') && l.includes('bad field') && l.includes('a.b')), `error 1 missing: ${JSON.stringify(errors)}`);
    assert.ok(errors.some(l => l.includes('E2') && l.includes('worse') && l.includes('c.d')), `error 2 missing: ${JSON.stringify(errors)}`);
  });
});

describe('runContractTestsStep', () => {
  // The injected runContractTestsFn / readFile seams avoid the real
  // ./run-contract-tests.js import and real filesystem reads.
  it('logs the pass summary and nothing else when no tests failed', async () => {
    const reads = [];
    const readFile = async (path, enc) => {
      reads.push([path, enc]);
      return JSON.stringify({ frontendContract: {} });
    };
    const runContractTestsFn = (contract) => {
      assert.deepEqual(contract, { frontendContract: {} });
      return { passed: 5, total: 5, skipped: 0, failed: 0, results: [] };
    };

    const originalLog = console.log;
    const originalError = console.error;
    const logs = [];
    const errors = [];
    console.log = (msg) => { logs.push(String(msg)); };
    console.error = (msg) => { errors.push(String(msg)); };
    try {
      await runContractTestsStep('sales-order', { runContractTestsFn, readFile });
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }

    assert.deepEqual(reads, [['artifacts/sales-order/contract.json', 'utf8']]);
    assert.ok(
      logs.some(l => l.includes('5/5 passed') && l.includes('0 skipped')),
      `expected a "5/5 passed, 0 skipped" log, got: ${JSON.stringify(logs)}`,
    );
    assert.equal(errors.length, 0, 'no error output expected when nothing failed');
  });

  it('logs the failure summary and per-failure detail lines when tests fail', async () => {
    const readFile = async () => JSON.stringify({ frontendContract: {} });
    const runContractTestsFn = () => ({
      passed: 1,
      total: 3,
      skipped: 0,
      failed: 2,
      results: [
        { passed: true, description: 'ok-one', reason: '' },
        { passed: false, description: 'fail-one', reason: 'boom' },
        { passed: false, description: 'fail-two', reason: 'kaboom' },
      ],
    });

    const originalLog = console.log;
    const originalError = console.error;
    const logs = [];
    const errors = [];
    console.log = (msg) => { logs.push(String(msg)); };
    console.error = (msg) => { errors.push(String(msg)); };
    try {
      await runContractTestsStep('win', { runContractTestsFn, readFile });
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }

    assert.ok(logs.some(l => l.includes('1/3 passed')), `pass summary missing: ${JSON.stringify(logs)}`);
    assert.ok(errors.some(l => l.includes('2 tests failed')), `failure summary missing: ${JSON.stringify(errors)}`);
    assert.ok(errors.some(l => l.includes('fail-one') && l.includes('boom')), `first failure missing: ${JSON.stringify(errors)}`);
    assert.ok(errors.some(l => l.includes('fail-two') && l.includes('kaboom')), `second failure missing: ${JSON.stringify(errors)}`);
    assert.ok(!errors.some(l => l.includes('ok-one')), `passing test should not be logged: ${JSON.stringify(errors)}`);
  });
});

describe('runGenerateContractStep', () => {
  // All dynamic imports + fs are injected. generateContract /
  // splitWindowContractArtifacts are stubbed, and runAdvisoryVersionCheck is
  // injected as a no-op so no DB / ./check-version.js access happens.
  const baseContract = { testManifest: { summary: { total: 4 } } };

  function makeFs({ contractRaw } = {}) {
    const writes = [];
    const reads = [];
    const fs = {
      // access resolves => processes file already exists (skip the ensure-write)
      access: async () => undefined,
      mkdir: async () => {},
      writeFile: async (path, content, enc) => { writes.push([path, content, enc]); },
      readFile: async (path) => {
        reads.push(path);
        if (path.endsWith('processes.json')) return JSON.stringify({ processes: [{ id: 'p1' }] });
        if (path.endsWith('contract.json')) {
          if (contractRaw === undefined) throw new Error('ENOENT');
          return contractRaw;
        }
        if (path.endsWith('contract.mcp.json')) throw new Error('ENOENT');
        throw new Error(`unexpected read: ${path}`);
      },
    };
    return { fs, writes, reads };
  }

  it('generates and writes contract + mcp when there is no previous contract', async () => {
    const { fs, writes } = makeFs({ contractRaw: undefined });
    const genCalls = [];
    const generateContractFn = (schema, rules, processes, prevVersion, prevContract) => {
      genCalls.push([schema, rules, processes, prevVersion, prevContract]);
      return { ...baseContract, generated: true };
    };
    const splitWindowContractArtifactsFn = (gen) => ({
      contract: { ...baseContract, split: true },
      mcpContract: { mcp: true },
    });
    const versionCalls = [];
    const runAdvisoryVersionCheckFn = async (w) => { versionCalls.push(w); };

    const pipelineContext = { schema: { ent: 1 }, rules: [{ r: 1 }] };
    const originalLog = console.log;
    const logs = [];
    console.log = (msg) => { logs.push(String(msg)); };
    try {
      await runGenerateContractStep('sales-order', pipelineContext, {
        generateContractFn,
        splitWindowContractArtifactsFn,
        fs,
        runAdvisoryVersionCheckFn,
      });
    } finally {
      console.log = originalLog;
    }

    // generateContract received schema, rules array, processes array, null prevVersion, null prevContract
    assert.equal(genCalls.length, 1);
    assert.deepEqual(genCalls[0][0], { ent: 1 });
    assert.deepEqual(genCalls[0][1], [{ r: 1 }]);
    assert.deepEqual(genCalls[0][2], [{ id: 'p1' }]);
    assert.equal(genCalls[0][3], null, 'prevVersion should be null with no previous contract');
    assert.equal(genCalls[0][4], null, 'prevContract should be null with no previous contract');

    // No previous raw => contract.prev.json is NOT written; only contract.json + contract.mcp.json
    const writtenPaths = writes.map(w => w[0]);
    assert.ok(!writtenPaths.some(p => p.endsWith('contract.prev.json')), `prev should not be written: ${JSON.stringify(writtenPaths)}`);
    assert.ok(writtenPaths.some(p => p.endsWith('artifacts/sales-order/contract.json')), `contract.json missing: ${JSON.stringify(writtenPaths)}`);
    assert.ok(writtenPaths.some(p => p.endsWith('artifacts/sales-order/contract.mcp.json')), `contract.mcp.json missing: ${JSON.stringify(writtenPaths)}`);

    assert.deepEqual(versionCalls, ['sales-order'], 'advisory version check must run with the window name');
    assert.ok(logs.some(l => l.includes('Contract generated') && l.includes('4 tests')), `contract log missing: ${JSON.stringify(logs)}`);
  });

  it('preserves the previous version and writes contract.prev.json when a previous contract exists', async () => {
    const prev = { version: '3.1.0', frontendContract: { old: true } };
    const prevRaw = JSON.stringify(prev);
    const { fs, writes } = makeFs({ contractRaw: prevRaw });
    const genCalls = [];
    const generateContractFn = (schema, rules, processes, prevVersion, prevContract) => {
      genCalls.push([prevVersion, prevContract]);
      return baseContract;
    };
    const splitWindowContractArtifactsFn = () => ({
      contract: baseContract,
      mcpContract: { mcp: true },
    });
    const runAdvisoryVersionCheckFn = async () => {};

    // rules as an object with a nested .rules array exercises the
    // `rules.rules || []` fallback branch.
    const pipelineContext = { schema: { ent: 9 }, rules: { rules: [{ r: 2 }] } };
    const originalLog = console.log;
    console.log = () => {};
    try {
      await runGenerateContractStep('win', pipelineContext, {
        generateContractFn,
        splitWindowContractArtifactsFn,
        fs,
        runAdvisoryVersionCheckFn,
      });
    } finally {
      console.log = originalLog;
    }

    assert.equal(genCalls[0][0], '3.1.0', 'prevVersion must be carried over from the previous contract');
    assert.deepEqual(genCalls[0][1], prev, 'prevContract must be the parsed previous contract');

    const writtenPaths = writes.map(w => w[0]);
    assert.ok(writtenPaths.some(p => p.endsWith('contract.prev.json')), `contract.prev.json must be written: ${JSON.stringify(writtenPaths)}`);
    // The prev raw content must be written verbatim.
    const prevWrite = writes.find(w => w[0].endsWith('contract.prev.json'));
    assert.equal(prevWrite[1], prevRaw);
  });

  it('ensures the processes file when missing (access rejects -> mkdir + write empty)', async () => {
    const writes = [];
    const mkdirs = [];
    const fs = {
      access: async () => { throw new Error('ENOENT'); }, // processes file missing
      mkdir: async (path, opts) => { mkdirs.push([path, opts]); },
      writeFile: async (path, content) => { writes.push([path, content]); },
      readFile: async (path) => {
        if (path.endsWith('processes.json')) return JSON.stringify({ processes: [] });
        throw new Error('ENOENT'); // no previous contract / mcp
      },
    };
    const generateContractFn = () => baseContract;
    const splitWindowContractArtifactsFn = () => ({ contract: baseContract, mcpContract: {} });
    const runAdvisoryVersionCheckFn = async () => {};

    const originalLog = console.log;
    console.log = () => {};
    try {
      await runGenerateContractStep('win', { schema: {}, rules: [] }, {
        generateContractFn,
        splitWindowContractArtifactsFn,
        fs,
        runAdvisoryVersionCheckFn,
      });
    } finally {
      console.log = originalLog;
    }

    // ensureProcessesFile must have created the artifact dir and seeded an empty file.
    assert.deepEqual(mkdirs, [['artifacts/win', { recursive: true }]]);
    const emptyProcessesWrite = writes.find(w => w[0].endsWith('processes.json'));
    assert.ok(emptyProcessesWrite, 'empty processes.json should have been written');
    assert.deepEqual(JSON.parse(emptyProcessesWrite[1]), { processes: [] });
  });
});

describe('loadWindowDecisions', () => {
  // readFile is injected, so the happy/ENOENT/non-ENOENT branches are fully
  // unit-testable without touching the real filesystem. CURRENT_VERSION in
  // ./migrations/index.js is 2, so a decisions object already at version 2
  // makes needsMigration() return false — the function returns it verbatim and
  // performs NO file write.
  it('returns the parsed decisions as-is when no migration is needed (no write)', async () => {
    const decisions = { version: 2, $schema: 'decisions-v2', fields: { a: { visibility: 'editable' } } };
    const raw = JSON.stringify(decisions);
    const reads = [];
    const readFile = async (path, enc) => {
      reads.push([path, enc]);
      return raw;
    };

    const result = await loadWindowDecisions(
      readFile, 'sales-order', { entities: [] }, 'artifacts/sales-order/decisions.json',
    );

    assert.deepEqual(reads, [['artifacts/sales-order/decisions.json', 'utf8']]);
    assert.deepEqual(result, decisions);
  });

  it('rethrows a non-ENOENT readFile error (plain Error has no .code)', async () => {
    const readFile = async () => { throw new Error('disk fail'); };

    await assert.rejects(
      () => loadWindowDecisions(readFile, 'win', {}, '/decisions.json'),
      /disk fail/,
    );
  });

  it('falls back to loadOrMigrateDecisions on ENOENT and exits(1) when curated is also missing', async () => {
    // First read (decisionsPath) throws ENOENT -> fallback. The fallback reads
    // the curated path with the SAME injected readFile, which also throws
    // ENOENT -> routes through handleMissingDecisionsError, whose ENOENT branch
    // calls process.exit(1). We emulate the production halt with a sentinel
    // throw (mirrors the existing loadOrMigrateDecisions ENOENT test).
    const readFile = async () => {
      const err = new Error('not found');
      err.code = 'ENOENT';
      throw err;
    };
    const originalExit = process.exit;
    const originalError = console.error;
    const exitCalls = [];
    process.exit = (code) => {
      exitCalls.push(code);
      throw new Error('__EXIT__');
    };
    console.error = () => {};
    try {
      await assert.rejects(
        () => loadWindowDecisions(readFile, 'win', {}, 'artifacts/win/decisions.json'),
        /__EXIT__/,
      );
      assert.deepEqual(exitCalls, [1]);
    } finally {
      process.exit = originalExit;
      console.error = originalError;
    }
  });

  it('migrates an old-version decisions object and rewrites the file (real temp dir)', async () => {
    // writeFile is a real node:fs/promises import inside the migration branch,
    // so we use a real temp file as decisionsPath. A decisions object without a
    // version field is treated as v1 by getVersion(), so needsMigration()
    // returns true and the v1->v2 migration + write run for real.
    const dir = await mkdtemp(join(tmpdir(), 'sf-decisions-'));
    const decisionsPath = join(dir, 'decisions.json');
    const v1Decisions = { fields: { a: { visibility: 'editable' } } };
    await fsWriteFile(decisionsPath, JSON.stringify(v1Decisions, null, 2), 'utf8');

    // Inject a readFile that serves the on-disk content for the decisionsPath.
    const readFile = async (path, enc) => fsReadFile(path, enc);

    const originalLog = console.log;
    const logs = [];
    console.log = (msg) => { logs.push(String(msg)); };
    try {
      const result = await loadWindowDecisions(
        readFile, 'win', { entities: [] }, decisionsPath,
      );

      // Returned object is migrated to CURRENT_VERSION (2).
      assert.equal(result.version, 2, 'migrated decisions should be at version 2');
      assert.equal(result.$schema, 'decisions-v2');

      // The file on disk was rewritten with the migrated content + trailing NL.
      const onDisk = await fsReadFile(decisionsPath, 'utf8');
      assert.ok(onDisk.endsWith('\n'), 'rewritten file must end with a trailing newline');
      const reparsed = JSON.parse(onDisk);
      assert.equal(reparsed.version, 2, 'on-disk file must be migrated to version 2');

      // Auto-migration is announced on the console.
      assert.ok(
        logs.some(l => l.includes('auto-migrated') && l.includes('v1') && l.includes('v2')),
        `expected an auto-migration log, got: ${JSON.stringify(logs)}`,
      );
    } finally {
      console.log = originalLog;
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('executePipelineStep', () => {
  // executePipelineStep wraps a switch dispatcher in try/catch that routes any
  // error to handleStepError. We test the two cleanly reachable seams without
  // DB/network: the unknown-step no-op path, and the error-routing contract
  // (optional step swallows; non-optional step exits(1)). Errors are induced by
  // a step name whose case body fails on a dynamic import / fs read with no
  // real fixtures present.
  it('does nothing and does not mutate result for an unknown step name (no-op)', async () => {
    const result = { pushToNeoRan: false, frontendGenerated: false };
    const pipelineContext = {};

    let threw = false;
    try {
      await executePipelineStep(
        { name: '__unknown_step__', optional: false }, 'wid', 'win', pipelineContext, result,
      );
    } catch {
      threw = true;
    }

    assert.equal(threw, false, 'unknown step must not throw');
    assert.deepEqual(result, { pushToNeoRan: false, frontendGenerated: false }, 'result must be untouched');
    assert.deepEqual(pipelineContext, {}, 'pipelineContext must be untouched');
  });

  it('swallows a step failure when the step is optional (error routed to handleStepError)', async () => {
    // 'resolve-curated' reads artifacts/<window>/schema-raw.json; for a
    // non-existent window that read throws, exercising the catch -> handleStepError
    // path. With optional:true, handleStepError logs and continues (no exit, no throw).
    const result = { pushToNeoRan: false, frontendGenerated: false };
    const originalLog = console.log;
    const originalWarn = console.warn;
    const logs = [];
    console.log = (msg) => { logs.push(String(msg)); };
    console.warn = () => {};

    let threw = false;
    try {
      await executePipelineStep(
        { name: 'resolve-curated', optional: true },
        'wid', '__nonexistent_window_for_test__', {}, result,
      );
    } catch {
      threw = true;
    } finally {
      console.log = originalLog;
      console.warn = originalWarn;
    }

    assert.equal(threw, false, 'optional step failure must be swallowed');
    assert.ok(
      logs.some(l => l.includes('resolve-curated')),
      `expected an optional-failure log mentioning the step, got: ${JSON.stringify(logs)}`,
    );
  });

  it('routes a non-optional step failure to process.exit(1) via handleStepError', async () => {
    // Same induced failure (missing schema-raw.json) but optional:false, so
    // handleStepError calls process.exit(1). The stub throws a sentinel to
    // emulate the production halt and prove the exit branch was reached.
    const result = { pushToNeoRan: false, frontendGenerated: false };
    const originalExit = process.exit;
    const originalError = console.error;
    const originalLog = console.log;
    const exitCalls = [];
    process.exit = (code) => {
      exitCalls.push(code);
      throw new Error('__EXIT__');
    };
    console.error = () => {};
    console.log = () => {};

    try {
      await assert.rejects(
        () => executePipelineStep(
          { name: 'resolve-curated', optional: false },
          'wid', '__nonexistent_window_for_test__', {}, result,
        ),
        /__EXIT__/,
      );
      assert.deepEqual(exitCalls, [1]);
    } finally {
      process.exit = originalExit;
      console.error = originalError;
      console.log = originalLog;
    }
  });
});

// ---------------------------------------------------------------------------
// runGenerateFrontendStep and loadDecisionsAndResolve are NOT
// dependency-injected: they use dynamic import() and read
// artifacts/<windowName>/* relative to process.cwd(). The tests below drive
// them through a real temp cwd (chdir + real fixtures) so no DB / stubbing of
// the dynamic imports is required. The "custom" branch additionally resolves
// its WRITE target via import.meta.url (the SOURCE file location), so it writes
// into the REAL repo tree (tools/app-shell/src/windows/custom/<windowName> and
// registry.js) regardless of cwd. That test uses a throwaway window name,
// snapshots registry.js, and removes the custom dir + restores registry.js in a
// finally block so the working tree is left pristine.

// repoRoot is cli/src/pipeline.js -> ../../ ; this test file lives in cli/test/
// so the repo root is two levels up from here as well.
const __testDir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolvePathAbs(__testDir, '../../');

describe('runGenerateFrontendStep', () => {
  // Minimal contract that survives generateAll / generateMockDataFile.
  function makeContract(layoutType) {
    return {
      frontendContract: {
        window: {
          name: 'Test Win',
          specName: 'tmp-win',
          primaryEntity: 'header',
          ...(layoutType ? { layoutType } : {}),
        },
        entities: {
          header: {
            name: 'Header',
            fields: [
              { name: 'documentNo', label: 'Doc No', type: 'string', visibility: 'editable', table: true, form: true },
            ],
          },
        },
      },
    };
  }

  it('default branch: generates components + mockData and sets frontendGenerated from scaffoldSecondaryTabCustomForms', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sf-genfront-default-'));
    const windowName = 'tmp-default-win';
    await fsMkdir(join(dir, 'artifacts', windowName), { recursive: true });
    await fsWriteFile(
      join(dir, 'artifacts', windowName, 'contract.json'),
      JSON.stringify(makeContract('default'), null, 2),
      'utf8',
    );

    const originalCwd = process.cwd();
    const originalLog = console.log;
    console.log = () => {};
    const result = {};
    try {
      process.chdir(dir);
      await runGenerateFrontendStep(windowName, result);
    } finally {
      process.chdir(originalCwd);
      console.log = originalLog;
    }

    // No secondaryTabs in the contract => scaffoldSecondaryTabCustomForms returns true.
    assert.equal(result.frontendGenerated, true, 'default branch must set frontendGenerated from the scaffold result');

    const outDir = join(dir, 'artifacts', windowName, 'generated', 'web', windowName);
    assert.ok(existsSync(join(outDir, 'HeaderPage.jsx')), 'HeaderPage.jsx should be generated');
    assert.ok(existsSync(join(outDir, 'index.jsx')), 'index.jsx should be generated');
    assert.ok(existsSync(join(outDir, 'mockData.js')), 'mockData.js should be generated');
    // The custom-scaffold dir must NOT be created on the default branch.
    assert.ok(
      !existsSync(resolvePathAbs(REPO_ROOT, `tools/app-shell/src/windows/custom/${windowName}`)),
      'default branch must not touch the real repo custom dir',
    );

    await rm(dir, { recursive: true, force: true });
  });

  it('custom branch: writes the scaffold and sets frontendGenerated = true', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sf-genfront-custom-'));
    // Unique throwaway window name so autoRegisterCustomLoader INSERTS (not
    // skips) and the real-repo custom dir is unique to this test.
    const windowName = `tmp-custom-win-${Date.now()}`;
    await fsMkdir(join(dir, 'artifacts', windowName), { recursive: true });
    await fsWriteFile(
      join(dir, 'artifacts', windowName, 'contract.json'),
      JSON.stringify(makeContract('custom'), null, 2),
      'utf8',
    );

    const registryPath = resolvePathAbs(REPO_ROOT, 'tools/app-shell/src/windows/registry.js');
    const customDir = resolvePathAbs(REPO_ROOT, `tools/app-shell/src/windows/custom/${windowName}`);
    // Snapshot registry.js so we can restore it (the custom branch mutates it).
    const registrySnapshot = await fsReadFile(registryPath, 'utf8');

    const originalCwd = process.cwd();
    const originalLog = console.log;
    console.log = () => {};
    const result = {};
    try {
      process.chdir(dir);
      await runGenerateFrontendStep(windowName, result);
      process.chdir(originalCwd);

      assert.equal(result.frontendGenerated, true, 'custom branch must set frontendGenerated = true');
      // Scaffold files land in the REAL repo custom dir (resolved via import.meta.url).
      assert.ok(existsSync(join(customDir, 'index.jsx')), 'custom index.jsx should be written');
      assert.ok(existsSync(join(customDir, 'mockCatalogs.js')), 'custom mockCatalogs.js should be written');
      // The custom branch must NOT emit the default generated/web output.
      assert.ok(
        !existsSync(join(dir, 'artifacts', windowName, 'generated', 'web', windowName)),
        'custom branch must not generate the default web output',
      );
      // registry.js got a loader entry for this window.
      const updatedRegistry = await fsReadFile(registryPath, 'utf8');
      assert.ok(
        updatedRegistry.includes(`'${windowName}': () => import('./custom/${windowName}/index.jsx'),`),
        'registry.js should auto-register the custom loader',
      );
    } finally {
      // Restore: chdir back (in case the assertion before chdir threw), remove
      // the throwaway custom dir, and revert registry.js verbatim.
      if (process.cwd() !== originalCwd) process.chdir(originalCwd);
      await rm(customDir, { recursive: true, force: true });
      await fsWriteFile(registryPath, registrySnapshot, 'utf8');
      await rm(dir, { recursive: true, force: true });
      console.log = originalLog;
    }
  });
});

describe('loadDecisionsAndResolve', () => {
  // Happy path: reads schema-raw / rules-raw / decisions from a real temp cwd,
  // runs the real resolveCurated, and populates pipelineContext. (The failure
  // path is already covered via executePipelineStep('resolve-curated') tests.)
  it('reads raws + decisions and sets schema and rules on the pipeline context', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sf-loadresolve-'));
    const windowName = 'tmp-resolve-win';
    const artifactDir = join(dir, 'artifacts', windowName);
    await fsMkdir(artifactDir, { recursive: true });

    const schemaRaw = {
      window: { name: 'Tmp', id: 'X' },
      entities: [
        { name: 'header', table: 'h', fields: [{ name: 'documentNo', column: 'DocumentNo', reference: 'String' }] },
      ],
    };
    const rulesRaw = { rules: [] };
    const decisions = { version: 2, $schema: 'decisions-v2', fields: { documentNo: { visibility: 'editable' } } };
    await fsWriteFile(join(artifactDir, 'schema-raw.json'), JSON.stringify(schemaRaw, null, 2), 'utf8');
    await fsWriteFile(join(artifactDir, 'rules-raw.json'), JSON.stringify(rulesRaw, null, 2), 'utf8');
    await fsWriteFile(join(artifactDir, 'decisions.json'), JSON.stringify(decisions, null, 2), 'utf8');

    const originalCwd = process.cwd();
    const originalLog = console.log;
    const originalWarn = console.warn;
    console.log = () => {};
    console.warn = () => {};
    const pipelineContext = {};
    try {
      process.chdir(dir);
      await loadDecisionsAndResolve(windowName, pipelineContext);
    } finally {
      process.chdir(originalCwd);
      console.log = originalLog;
      console.warn = originalWarn;
    }

    assert.ok(pipelineContext.schema, 'pipelineContext.schema must be populated by resolveCurated');
    assert.ok('entities' in pipelineContext.schema, 'resolved schema should carry entities');
    assert.ok(Array.isArray(pipelineContext.rules), 'pipelineContext.rules must be the resolved rules array');

    await rm(dir, { recursive: true, force: true });
  });
});
