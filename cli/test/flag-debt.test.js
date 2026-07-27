import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  POINTS,
  REGISTRY_FILENAME,
  loadRegistry,
  resolveRoots,
  walkFiles,
  findSymbolHits,
  matchesPath,
  isFrameworkPath,
  isDocPath,
  isTestPath,
  classifyReference,
  collectTouchPoints,
  normalizeSpec,
  specStatus,
  checkTestSpecs,
  expandOwnedFiles,
  resolveCoverageScript,
  parseUncoveredLines,
  collectCoverage,
  scoreLifecycle,
  scoreFlag,
  buildReport,
  renderConsole,
  renderHtml,
  parseArgs,
  main,
} from '../src/flag-debt.js';

/**
 * Flag debt scorecard v0 (ETP-4686).
 *
 * Every dimension is scored against a synthetic repo built in a temp directory,
 * so the assertions describe the scoring rules rather than whatever this repo
 * happens to contain today. Coverage is exercised through the injected runner —
 * these tests never reach SonarQube.
 */

const NOW = new Date('2026-07-27T00:00:00Z');

let root;

/** Writes a file, creating any missing parent directories. */
function write(relative, contents) {
  const target = join(root, relative);
  mkdirSync(join(target, '..'), { recursive: true });
  writeFileSync(target, contents);
  return target;
}

const FLAG = {
  key: 'tenant-upgrade',
  description: 'Gates the paid upgrade flow.',
  owner: 'sebastianbarrozo',
  jira: 'ETP-4686',
  created: '2026-07-27',
  ttl: '2026-10-25',
  defaultValue: false,
  symbols: ['tenant-upgrade', 'TENANT_UPGRADE'],
  paths: { frontend: ['app/upgrade/'] },
  testSpecs: {
    unit: [{ root: 'frontend', path: 'app/__tests__/upgrade.test.js' }],
    e2e: [{ root: 'frontend', path: 'e2e/upgrade.spec.js', expected: true }],
  },
};

function registryFile(flags = [FLAG]) {
  return {
    version: 1,
    roots: { frontend: '.', backend: 'modules/backend' },
    conventions: { frameworkPaths: ['app/lib/flags/'] },
    flags,
  };
}

function context({ flags = [FLAG], backend = null } = {}) {
  return {
    roots: { frontend: root, backend },
    frameworkPaths: registryFile(flags).conventions.frameworkPaths,
    repoRoot: root,
    now: NOW,
    env: {},
    runner: () => ({ uncovered: null, reason: 'not wired' }),
  };
}

before(() => {
  root = mkdtempSync(join(tmpdir(), 'flag-debt-test-'));

  // Owned code — deleted when the flag is retired, so it never scores.
  write('app/upgrade/api.js', 'export const FLAG = "tenant-upgrade";\n');
  write('app/upgrade/page.jsx', 'import { TENANT_UPGRADE } from "../lib/flags";\n');

  // Framework — shared infrastructure, attributed to no flag.
  write('app/lib/flags/index.js', 'export const TENANT_UPGRADE = "tenant-upgrade";\n');

  // Touch points — the scoring bucket.
  write('app/routes.jsx', 'const p = lazy(() => import("./upgrade/page.jsx")); // TENANT_UPGRADE\n');
  write('app/menu.jsx', 'useFeatureFlag(TENANT_UPGRADE);\n');

  // Reported but never scored.
  write('docs/feature-flags.md', 'The `tenant-upgrade` flag gates the upgrade flow.\n');
  write('app/__tests__/upgrade.test.js', 'describe("tenant-upgrade", () => {});\n');

  // Ignored by the walker.
  write('node_modules/pkg/index.js', 'const x = "tenant-upgrade";\n');
  write('app/upgrade/generated/out.js', 'const x = "tenant-upgrade";\n');
  write('app/image.png', 'tenant-upgrade');

  writeFileSync(join(root, REGISTRY_FILENAME), JSON.stringify(registryFile(), null, 2));
});

after(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('loadRegistry', () => {
  it('reads a registry from disk', () => {
    const registry = loadRegistry(join(root, REGISTRY_FILENAME));
    assert.equal(registry.flags.length, 1);
    assert.equal(registry.flags[0].key, 'tenant-upgrade');
  });

  it('rejects a registry with no flags array', () => {
    const bad = join(root, 'bad-registry.json');
    writeFileSync(bad, JSON.stringify({ version: 1 }));
    assert.throws(() => loadRegistry(bad), /expected a "flags" array/);
  });

  it('propagates a parse error rather than scoring nothing silently', () => {
    const broken = join(root, 'broken-registry.json');
    writeFileSync(broken, '{ not json');
    assert.throws(() => loadRegistry(broken));
  });
});

describe('resolveRoots', () => {
  it('resolves the frontend root relative to the repo root', () => {
    assert.equal(resolveRoots(registryFile(), { repoRoot: root, env: {} }).frontend, root);
  });

  it('reports a missing backend instead of failing', () => {
    const resolved = resolveRoots(registryFile(), { repoRoot: root, env: {} });
    assert.equal(resolved.backend, null);
    assert.match(resolved.backendUnavailableReason, /backend module not found/);
  });

  it('prefers an explicit ETENDO_GO_MODULE', () => {
    const resolved = resolveRoots(registryFile(), { repoRoot: root, env: { ETENDO_GO_MODULE: root } });
    assert.equal(resolved.backend, root);
    assert.equal(resolved.backendUnavailableReason, null);
  });
});

describe('walkFiles', () => {
  it('skips dependencies, generated output and non-source extensions', () => {
    const found = [...walkFiles(root)].map(f => f.split('\\').join('/'));
    assert.ok(found.includes('app/routes.jsx'));
    assert.ok(!found.some(f => f.startsWith('node_modules/')), 'node_modules must be skipped');
    assert.ok(!found.some(f => f.includes('generated/')), 'generated output must be skipped');
    assert.ok(!found.includes('app/image.png'), 'binary extensions must be skipped');
  });

  it('never yields the registry itself', () => {
    assert.ok(![...walkFiles(root)].includes(REGISTRY_FILENAME));
  });

  it('returns nothing for a directory that does not exist', () => {
    assert.deepEqual([...walkFiles(join(root, 'nope'))], []);
  });
});

describe('findSymbolHits', () => {
  it('reports the line number and text of each hit', () => {
    const hits = findSymbolHits(join(root, 'app/menu.jsx'), ['TENANT_UPGRADE']);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].line, 1);
    assert.match(hits[0].text, /useFeatureFlag/);
  });

  it('returns nothing when no symbol matches', () => {
    assert.deepEqual(findSymbolHits(join(root, 'app/menu.jsx'), ['NO_SUCH_SYMBOL']), []);
  });

  it('returns nothing for an unreadable path', () => {
    assert.deepEqual(findSymbolHits(join(root, 'missing.js'), ['x']), []);
  });
});

describe('path classification', () => {
  it('matches a declared directory prefix and an exact file', () => {
    assert.equal(matchesPath('app/upgrade/api.js', 'app/upgrade/'), true);
    assert.equal(matchesPath('app/upgrade/api.js', 'app/upgrade'), true);
    assert.equal(matchesPath('app/upgrades/api.js', 'app/upgrade'), false);
    assert.equal(matchesPath('app/page.jsx', 'app/page.jsx'), true);
  });

  it('recognises framework paths as a fragment anywhere in the path', () => {
    assert.equal(isFrameworkPath('app/lib/flags/index.js', ['app/lib/flags/']), true);
    assert.equal(isFrameworkPath('app/menu.jsx', ['app/lib/flags/']), false);
  });

  it('recognises docs and the several test-file conventions', () => {
    assert.equal(isDocPath('docs/feature-flags.md'), true);
    assert.equal(isDocPath('app/menu.jsx'), false);

    for (const path of [
      'app/__tests__/x.js', '__tests__/x.js', 'src-test/x.java',
      'a/b.test.js', 'a/b.spec.js', 'a/b.vitest.jsx', 'a/FooTest.java',
    ]) {
      assert.equal(isTestPath(path), true, `${path} should be a test path`);
    }
    assert.equal(isTestPath('app/menu.jsx'), false);
  });

  it('buckets a reference, with owned and framework winning over the rest', () => {
    const options = {
      ownedPaths: ['app/upgrade/'],
      frameworkPaths: ['app/lib/flags/'],
      specPaths: ['app/__tests__/upgrade.test.js'],
    };
    assert.equal(classifyReference('app/upgrade/api.js', options), 'owned');
    assert.equal(classifyReference('app/lib/flags/index.js', options), 'framework');
    assert.equal(classifyReference('app/__tests__/upgrade.test.js', options), 'tests');
    assert.equal(classifyReference('docs/feature-flags.md', options), 'docs');
    assert.equal(classifyReference('app/menu.jsx', options), 'code');
  });
});

describe('dimension 1 — touch points', () => {
  it('counts only code references, excluding owned and framework files', () => {
    const touchPoints = collectTouchPoints(FLAG, context());
    const paths = touchPoints.files.map(f => f.path).sort();
    assert.deepEqual(paths, ['app/menu.jsx', 'app/routes.jsx']);
  });

  it('reports doc and test references separately, without scoring them', () => {
    const touchPoints = collectTouchPoints(FLAG, context());
    assert.equal(touchPoints.docReferences.length, 1);
    assert.equal(touchPoints.testReferences.length, 1);
  });

  it('charges nothing while inside the free allowance', () => {
    const touchPoints = collectTouchPoints(FLAG, context());
    assert.equal(touchPoints.files.length <= POINTS.freeTouchPoints, true);
    assert.equal(touchPoints.extraFiles, 0);
    assert.equal(touchPoints.points, 0);
  });

  it('charges per file beyond the free allowance', () => {
    const spread = { ...FLAG, symbols: ['tenant-upgrade', 'TENANT_UPGRADE', 'lazy('] };
    write('app/extra-a.jsx', 'lazy(1) // tenant-upgrade\n');
    write('app/extra-b.jsx', 'lazy(2) // tenant-upgrade\n');
    const touchPoints = collectTouchPoints(spread, context());

    assert.equal(touchPoints.files.length, 4);
    assert.equal(touchPoints.extraFiles, 1);
    assert.equal(touchPoints.points, POINTS.perExtraTouchPoint);

    rmSync(join(root, 'app/extra-a.jsx'));
    rmSync(join(root, 'app/extra-b.jsx'));
  });

  it('records which roots it could and could not scan', () => {
    const touchPoints = collectTouchPoints(FLAG, context());
    assert.deepEqual(touchPoints.scannedRoots, ['frontend']);
    assert.deepEqual(touchPoints.skippedRoots, ['backend']);
  });
});

describe('dimension 2 — declared test specs', () => {
  it('normalises both the string and object spec shapes', () => {
    assert.deepEqual(normalizeSpec('a/b.test.js'),
      { path: 'a/b.test.js', root: 'frontend', expected: false, acceptedDebt: false, note: null });
    assert.deepEqual(normalizeSpec({ path: 'x.java', root: 'backend', expected: true }),
      { path: 'x.java', root: 'backend', expected: true, acceptedDebt: false, note: null });
  });

  it('carries a declared note through normalisation', () => {
    assert.equal(normalizeSpec({ path: 'x.js', note: 'covered elsewhere' }).note, 'covered elsewhere');
  });

  describe('specStatus', () => {
    it('reports a spec that is on disk as present, whatever it declared', () => {
      assert.equal(specStatus({ expected: true, acceptedDebt: true }, true), 'present');
    });

    it('distinguishes deliberately deferred from queued and from unexplained', () => {
      assert.equal(specStatus({ acceptedDebt: true, expected: false }, false), 'accepted-debt');
      assert.equal(specStatus({ acceptedDebt: false, expected: true }, false), 'pending');
      assert.equal(specStatus({ acceptedDebt: false, expected: false }, false), 'missing');
    });

    it('lets accepted debt win over expected, so the two never blur', () => {
      assert.equal(specStatus({ acceptedDebt: true, expected: true }, false), 'accepted-debt');
    });
  });

  it('charges the e2e penalty once for a declared spec that is not on disk', () => {
    const tests = checkTestSpecs(FLAG, context());
    assert.equal(tests.kinds.unit.points, 0, 'the unit spec exists');
    assert.equal(tests.kinds.e2e.points, POINTS.missingE2eSpecs);
    assert.equal(tests.points, POINTS.missingE2eSpecs);
  });

  it('labels an agreed-but-unwritten spec as pending rather than missing', () => {
    const tests = checkTestSpecs(FLAG, context());
    assert.equal(tests.kinds.e2e.missing[0].status, 'pending');
    assert.equal(tests.kinds.e2e.missing[0].note, 'pending Tester');
    assert.equal(tests.kinds.unit.declared, 1);
  });

  it('charges one flat penalty however many specs are merely pending', () => {
    const many = {
      ...FLAG,
      testSpecs: { unit: ['a.test.js', 'b.test.js', 'c.test.js'], e2e: [] },
    };
    const tests = checkTestSpecs(many, context());
    assert.equal(tests.kinds.unit.missing.length, 3);
    assert.equal(tests.kinds.unit.flatPoints, POINTS.missingUnitSpecs);
    assert.equal(tests.kinds.unit.acceptedDebtPoints, 0);
    assert.equal(tests.kinds.unit.points, POINTS.missingUnitSpecs);
  });

  it('charges accepted debt per spec, because it is a standing cost', () => {
    const deferred = {
      ...FLAG,
      testSpecs: {
        unit: [
          { path: 'a.test.js', acceptedDebt: true },
          { path: 'b.test.js', acceptedDebt: true },
        ],
        e2e: [],
      },
    };
    const unit = checkTestSpecs(deferred, context()).kinds.unit;
    assert.equal(unit.acceptedDebt.length, 2);
    assert.equal(unit.pending.length, 0);
    assert.equal(unit.flatPoints, 0);
    assert.equal(unit.acceptedDebtPoints, 2 * POINTS.missingUnitSpecs);
  });

  it('adds the flat pending penalty and per-spec accepted debt together', () => {
    const mixed = {
      ...FLAG,
      testSpecs: {
        unit: [
          { path: 'a.test.js', expected: true },
          { path: 'b.test.js', acceptedDebt: true },
        ],
        e2e: [],
      },
    };
    const unit = checkTestSpecs(mixed, context()).kinds.unit;
    assert.equal(unit.points, POINTS.missingUnitSpecs + POINTS.missingUnitSpecs);
  });

  it('explains accepted debt in the spec note', () => {
    const deferred = { ...FLAG, testSpecs: { unit: [{ path: 'a.test.js', acceptedDebt: true }], e2e: [] } };
    assert.equal(checkTestSpecs(deferred, context()).kinds.unit.missing[0].note,
      'accepted debt — deliberately not written');
  });

  it('prefers a declared note over the status default', () => {
    const noted = {
      ...FLAG,
      testSpecs: { unit: [{ path: 'a.test.js', acceptedDebt: true, note: 'covered by the E2E flow' }], e2e: [] },
    };
    assert.equal(checkTestSpecs(noted, context()).kinds.unit.missing[0].note, 'covered by the E2E flow');
  });

  it('labels a spec with no declared intent as plainly missing', () => {
    const bare = { ...FLAG, testSpecs: { unit: [{ path: 'a.test.js' }], e2e: [] } };
    const spec = checkTestSpecs(bare, context()).kinds.unit.missing[0];
    assert.equal(spec.status, 'missing');
    assert.equal(spec.note, 'missing');
  });

  it('marks a spec unverifiable when its root is unavailable', () => {
    const backendSpec = {
      ...FLAG,
      testSpecs: { unit: [{ root: 'backend', path: 'src-test/Foo.java' }], e2e: [] },
    };
    const spec = checkTestSpecs(backendSpec, context()).kinds.unit.specs[0];
    assert.equal(spec.unverifiable, true);
    assert.equal(spec.exists, false);
  });
});

describe('dimension 3 — coverage', () => {
  it('expands owned directories into individual source files', () => {
    const files = expandOwnedFiles(FLAG, { frontend: root, backend: null }).map(f => f.path);
    assert.deepEqual(files, ['app/upgrade/api.js', 'app/upgrade/page.jsx']);
  });

  it('is skipped entirely, at no cost, when SONAR_TOKEN is absent', () => {
    const coverage = collectCoverage(FLAG, { ...context(), env: {} });
    assert.equal(coverage.status, 'unavailable');
    assert.match(coverage.reason, /SONAR_TOKEN/);
    assert.equal(coverage.points, 0);
  });

  it('is skipped when the coverage script cannot be found', () => {
    const coverage = collectCoverage(FLAG, { ...context(), env: { SONAR_TOKEN: 'squ_x' } });
    assert.equal(coverage.status, 'unavailable');
    assert.match(coverage.reason, /sonar-coverage\.sh not found/);
    assert.equal(coverage.points, 0);
  });

  it('finds the coverage script shipped with the published CLI', () => {
    assert.equal(resolveCoverageScript(root), null);
    write('cli/sonar-coverage.sh', '#!/bin/sh\n');
    assert.equal(resolveCoverageScript(root), join(root, 'cli', 'sonar-coverage.sh'));
  });

  it('charges one point per whole block of uncovered lines', () => {
    const coverage = collectCoverage(FLAG, {
      ...context(),
      env: { SONAR_TOKEN: 'squ_x' },
      runner: ({ file }) => ({ uncovered: file.endsWith('api.js') ? 25 : 4 }),
    });
    assert.equal(coverage.status, 'measured');
    // 25 lines → 2 points; 4 lines → 0 points.
    assert.equal(coverage.points, Math.floor(25 / POINTS.uncoveredLinesPerPoint));
  });

  it('reports a file with no analysis without charging for it', () => {
    const coverage = collectCoverage(FLAG, {
      ...context(),
      env: { SONAR_TOKEN: 'squ_x' },
      runner: () => ({ uncovered: null, reason: 'no analysis' }),
    });
    assert.equal(coverage.status, 'unavailable');
    assert.equal(coverage.points, 0);
    assert.equal(coverage.files.every(f => f.uncovered === null), true);
  });
});

describe('parseUncoveredLines', () => {
  it('prefers an explicit summary line', () => {
    assert.equal(parseUncoveredLines('Total uncovered lines: 12\n'), 12);
  });

  it('expands a list of ranges', () => {
    assert.equal(parseUncoveredLines('  Uncovered: 3, 10-12, 20\n'), 5);
  });

  it('reads "none" as fully covered', () => {
    assert.equal(parseUncoveredLines('  Uncovered: none\n'), 0);
  });

  it('returns null when the server has no data at all', () => {
    assert.equal(parseUncoveredLines('no coverage data on server'), null);
    assert.equal(parseUncoveredLines('something unrelated'), null);
  });
});

describe('dimension 4 — lifecycle', () => {
  it('charges nothing before the TTL', () => {
    const life = scoreLifecycle({ ttl: '2026-10-25' }, NOW);
    assert.equal(life.points, 0);
    assert.equal(life.daysRemaining, 90);
  });

  it('charges per started week past the TTL', () => {
    const life = scoreLifecycle({ ttl: '2026-07-06' }, NOW);
    assert.equal(life.weeksOverdue, 3);
    assert.equal(life.points, 3 * POINTS.perWeekOverdue);
    assert.equal(life.note, 'past TTL');
  });

  it('charges nothing, and says so, when no TTL is declared', () => {
    const life = scoreLifecycle({}, NOW);
    assert.equal(life.points, 0);
    assert.equal(life.note, 'no TTL declared');
  });

  it('charges nothing for an unparseable TTL', () => {
    const life = scoreLifecycle({ ttl: 'someday' }, NOW);
    assert.equal(life.points, 0);
    assert.equal(life.note, 'unparseable TTL');
  });
});

describe('scoreFlag and buildReport', () => {
  it('sums every dimension into the total', () => {
    const score = scoreFlag(FLAG, context());
    assert.equal(
      score.total,
      score.touchPoints.points + score.tests.points + score.coverage.points + score.lifecycle.points
    );
  });

  it('carries the flag metadata through untouched', () => {
    const score = scoreFlag(FLAG, context());
    assert.equal(score.key, 'tenant-upgrade');
    assert.equal(score.jira, 'ETP-4686');
    assert.equal(score.owner, 'sebastianbarrozo');
    assert.equal(score.defaultValue, false);
  });

  it('falls back to "unassigned" for a flag with no owner', () => {
    const orphan = { ...FLAG, owner: undefined, jira: undefined };
    assert.equal(scoreFlag(orphan, context()).owner, 'unassigned');
  });

  it('scores every flag and records the backend warning', () => {
    const report = buildReport(registryFile(), {
      ...context(),
      backendUnavailableReason: 'backend module not found',
    });
    assert.equal(report.flags.length, 1);
    assert.equal(report.version, 1);
    assert.match(report.roots.backendUnavailableReason, /backend module not found/);
    assert.match(report.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('rendering', () => {
  let report;

  beforeEach(() => {
    report = buildReport(registryFile(), context());
  });

  it('renders every dimension and a summary row in the console output', () => {
    const output = renderConsole(report);
    for (const fragment of ['tenant-upgrade', 'touch points', 'tests', 'coverage', 'lifecycle', 'TOTAL']) {
      assert.ok(output.includes(fragment), `expected the output to mention "${fragment}"`);
    }
    assert.ok(output.includes('Report only'), 'v0 must say it never fails a build');
  });

  it('names the missing spec so it can be acted on', () => {
    assert.ok(renderConsole(report).includes('e2e/upgrade.spec.js'));
  });

  it('renders a self-contained HTML document', () => {
    const html = renderHtml(report);
    assert.match(html, /^<!doctype html>/);
    assert.ok(html.includes('Flag debt scorecard'));
    assert.ok(html.includes('tenant-upgrade'));
  });

  it('escapes flag metadata so a description cannot inject markup', () => {
    const hostile = buildReport(
      registryFile([{ ...FLAG, description: '<script>alert(1)</script>' }]),
      context({ flags: [{ ...FLAG, description: '<script>alert(1)</script>' }] })
    );
    const html = renderHtml(hostile);
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });
});

describe('parseArgs', () => {
  it('defaults to the console report over the whole repo', () => {
    const options = parseArgs([]);
    assert.deepEqual(
      { json: options.json, html: options.html, flag: options.flag, help: options.help },
      { json: false, html: false, flag: null, help: false }
    );
  });

  it('accepts both the spaced and equals forms of every valued option', () => {
    assert.equal(parseArgs(['--flag', 'a']).flag, 'a');
    assert.equal(parseArgs(['--flag=a']).flag, 'a');
    assert.equal(parseArgs(['--registry', '/tmp/r.json']).registry, '/tmp/r.json');
    assert.equal(parseArgs(['--registry=/tmp/r.json']).registry, '/tmp/r.json');
  });

  it('accepts the output and help switches', () => {
    const options = parseArgs(['--json', '--html', '-h']);
    assert.equal(options.json, true);
    assert.equal(options.html, true);
    assert.equal(options.help, true);
  });

  it('rejects an unknown option rather than ignoring it', () => {
    assert.throws(() => parseArgs(['--nope']), /unknown option: --nope/);
  });
});

describe('the CLI', () => {
  /** Collects everything main() writes, standing in for process.stdout. */
  function capture() {
    const chunks = [];
    return { write: chunk => chunks.push(chunk), get text() { return chunks.join(''); } };
  }

  it('prints help and scores nothing', () => {
    const stdout = capture();
    assert.equal(main(['--help'], { stdout }), 0);
    assert.match(stdout.text, /flag-debt — per-flag technical-debt scorer/);
  });

  it('scores every registered flag and always exits 0 — v0 is report only', () => {
    const stdout = capture();
    assert.equal(main(['--root', root], { stdout }), 0);
    assert.match(stdout.text, /tenant-upgrade/);
  });

  it('narrows the report to a single flag', () => {
    const stdout = capture();
    assert.equal(main(['--root', root, '--flag', 'tenant-upgrade'], { stdout }), 0);
    assert.match(stdout.text, /1 flag\(s\)/);
  });

  it('says so, without failing, when the named flag is unknown', () => {
    const stdout = capture();
    assert.equal(main(['--root', root, '--flag', 'ghost'], { stdout }), 0);
    assert.match(stdout.text, /No flag "ghost"/);
  });

  it('writes the JSON and HTML reports on request', () => {
    const stdout = capture();
    assert.equal(main(['--root', root, '--json', '--html'], { stdout }), 0);
    assert.match(stdout.text, /JSON written to/);
    assert.match(stdout.text, /HTML written to/);

    const written = JSON.parse(readFileSync(join(root, 'flag-debt.json'), 'utf8'));
    assert.equal(written.flags[0].key, 'tenant-upgrade');
  });
});
