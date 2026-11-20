// @covers scripts/compare-sonar-coverage.js
// @covers run-sonar.sh
// @covers .github/actions/unit-tests-sonar/action.yml
// @covers .github/workflows/mini-pipeline.yml
// @covers .github/workflows/full-pipeline.yml
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  DEFAULT_COVERAGE_MINIMUM,
  DEFAULT_COVERAGE_TOLERANCE,
  ANALYSED_BASE_BRANCHES,
  SonarReadError,
  UsageError,
  createSonarClient,
  describeCondition,
  evaluateCoverage,
  formatQualityGate,
  formatResult,
  isEntryPoint,
  isSameOrigin,
  main,
  parseArgs,
  parseReportTask,
  readMetric,
  readProjectKey,
  readQualityGate,
  resolveThresholds,
  waitForCeTask,
} from '../compare-sonar-coverage.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'compare-sonar-coverage.js');

const measures = (value) => ({ component: { measures: [{ metric: 'coverage', value }] } });
const jsonResp = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

/**
 * Fake fetch routing on the URL: `ce` (the CE task responses, consumed in order),
 * `current` / `base` (coverage values or a Response-like / Error to return),
 * `analysisId` (carried by every CE task answer) and `gate` (the project_status body, or a
 * Response-like / Error to return).
 */
function fakeFetch({ ce = [], current, base, baseBranch = 'develop', analysisId, gate } = {}) {
  const calls = [];
  const queue = [...ce];
  const answer = (v) => {
    if (v instanceof Error) throw v;
    if (v && typeof v === 'object' && 'ok' in v) return v;
    return jsonResp(measures(v));
  };
  const impl = async (url, init) => {
    calls.push({ url, init });
    if (url.includes('/api/ce/task')) {
      const next = queue.shift() ?? 'SUCCESS';
      return typeof next === 'string' ? jsonResp({ task: { status: next, ...(analysisId && { analysisId }) } }) : answer(next);
    }
    if (url.includes('/api/qualitygates/project_status')) {
      if (gate instanceof Error) throw gate;
      if (gate && typeof gate === 'object' && 'ok' in gate) return gate;
      return jsonResp(gate ?? null, gate === undefined ? 404 : 200);
    }
    if (url.includes('/api/measures/component') && url.includes(`&branch=${encodeURIComponent(baseBranch)}&metricKeys`)) {
      return answer(base);
    }
    if (url.includes('/api/measures/component')) return answer(current);
    return jsonResp(null, 404);
  };
  impl.calls = calls;
  return impl;
}

function fakeClock() {
  let t = 0;
  return { now: () => t, sleep: async (ms) => { t += ms; } };
}

const ENV = { SONAR_HOST_URL: 'https://sonar.example/', SONAR_TOKEN: 'tok' };

async function run(argv, { env = ENV, ...deps } = {}) {
  const out = [];
  const err = [];
  const clock = fakeClock();
  const code = await main(argv, env, {
    log: (l) => out.push(l), warn: (l) => err.push(l), sleep: clock.sleep, now: clock.now, ...deps,
  });
  return { code, out, err, text: out.join('\n') };
}

describe('resolveThresholds', () => {
  it('defaults to 1pp tolerance and 70% minimum', () => {
    assert.equal(DEFAULT_COVERAGE_TOLERANCE, 1);
    assert.equal(DEFAULT_COVERAGE_MINIMUM, 70);
    assert.deepEqual(resolveThresholds({}), { tolerance: 1, minimum: 70 });
  });

  it('takes overrides from the environment', () => {
    assert.deepEqual(resolveThresholds({ COVERAGE_TOLERANCE: '0.5', COVERAGE_MINIMUM: '80' }),
      { tolerance: 0.5, minimum: 80 });
  });

  it('treats an empty string as unset', () => {
    assert.deepEqual(resolveThresholds({ COVERAGE_TOLERANCE: '', COVERAGE_MINIMUM: '' }),
      { tolerance: 1, minimum: 70 });
  });

  it('throws a UsageError on a non-numeric value', () => {
    assert.throws(() => resolveThresholds({ COVERAGE_MINIMUM: 'abc' }),
      (e) => e instanceof UsageError && /COVERAGE_MINIMUM must be a number, got 'abc'/.test(e.message));
    assert.throws(() => resolveThresholds({ COVERAGE_TOLERANCE: 'x' }), UsageError);
  });
});

describe('evaluateCoverage', () => {
  const t = { tolerance: 1, minimum: 70 };

  it('returns no-current when the current coverage is unknown', () => {
    assert.deepEqual(evaluateCoverage({ current: null, base: 80, ...t }), { verdict: 'no-current' });
    assert.deepEqual(evaluateCoverage({ current: undefined, base: 80, ...t }), { verdict: 'no-current' });
  });

  it('fails below the minimum even without a base', () => {
    assert.deepEqual(evaluateCoverage({ current: 69.99, base: null, ...t }), { verdict: 'below-minimum' });
  });

  it('passes with a warning verdict when the base is missing', () => {
    assert.deepEqual(evaluateCoverage({ current: 75, base: null, ...t }), { verdict: 'no-base' });
  });

  it('passes exactly at base − tolerance', () => {
    assert.deepEqual(evaluateCoverage({ current: 79, base: 80, ...t }), { verdict: 'ok', minRequired: 79 });
  });

  it('reports a decrease just below base − tolerance with the shortfall', () => {
    const r = evaluateCoverage({ current: 78.5, base: 80, ...t });
    assert.equal(r.verdict, 'decreased');
    assert.equal(r.minRequired, 79);
    assert.equal(r.short, 0.5);
  });

  it('passes exactly at the minimum', () => {
    assert.equal(evaluateCoverage({ current: 70, base: 70.5, ...t }).verdict, 'ok');
  });
});

describe('formatResult — push context (parity with the legacy run-sonar.sh text)', () => {
  const ctx = { tolerance: 1, minimum: 70, label: 'feature/X', baseBranch: 'develop', context: 'push' };

  it('no-current skips without blocking', () => {
    const r = formatResult({ verdict: 'no-current' }, { ...ctx, current: null, base: 80 });
    assert.equal(r.exitCode, 0);
    assert.deepEqual(r.lines, ["    SKIPPED ⚠️  Could not read this branch's coverage from Sonar — not blocking."]);
  });

  it('below-minimum prints the legacy lines without a bypass hint', () => {
    const r = formatResult({ verdict: 'below-minimum' }, { ...ctx, current: 65.5, base: null });
    assert.equal(r.exitCode, 1);
    assert.deepEqual(r.lines, [
      '    feature/X coverage: 65.50%',
      '\n❌ COVERAGE BELOW MINIMUM — 65.50% < 70.00% required.',
      '   Add tests until overall coverage reaches the minimum, then re-push.',
    ]);
  });

  it('no-base skips without blocking', () => {
    const r = formatResult({ verdict: 'no-base' }, { ...ctx, current: 75, base: null });
    assert.equal(r.exitCode, 0);
    assert.deepEqual(r.lines, ["    SKIPPED ⚠️  No coverage on Sonar for 'develop' yet — not blocking "
      + '(matches CI, which treats a missing baseline as 0%).']);
  });

  it('decreased prints the legacy lines without a bypass hint', () => {
    const r = formatResult({ verdict: 'decreased', minRequired: 79, short: 0.5 },
      { ...ctx, current: 78.5, base: 80 });
    assert.equal(r.exitCode, 1);
    assert.deepEqual(r.lines, [
      '    feature/X coverage: 78.50%',
      '    develop coverage: 80.00% (min required with 1.00pp tolerance: 79.00%)',
      "\n❌ COVERAGE DECREASED — this push would fail Jenkins' 'Compare Coverage Results'.",
      "   78.50% < 79.00% (base 80.00% − 1.00pp) on 'develop' (short 0.50pp).",
      '   Add tests until overall coverage is >= the base (minus tolerance), then re-push.',
    ]);
  });

  it('ok prints both coverages and the OK line', () => {
    const r = formatResult({ verdict: 'ok', minRequired: 79 }, { ...ctx, current: 80, base: 80 });
    assert.equal(r.exitCode, 0);
    assert.deepEqual(r.lines, [
      '    feature/X coverage: 80.00%',
      '    develop coverage: 80.00% (min required with 1.00pp tolerance: 79.00%)',
      '    Coverage is OK ✅ (not below base − tolerance, and above the minimum).',
    ]);
  });
});

describe('formatResult — ci context', () => {
  const ctx = { tolerance: 1, minimum: 70, label: 'PR #12', baseBranch: 'develop', context: 'ci' };
  const noBypass = (r) => r.lines.forEach((l) => assert.doesNotMatch(l, /--no-verify|re-push/));

  it('no-current fails the check with an annotation', () => {
    const r = formatResult({ verdict: 'no-current' }, { ...ctx, current: null, base: 80 });
    assert.equal(r.exitCode, 1);
    assert.match(r.lines[0], /COVERAGE NOT EVALUATED — could not read the coverage of PR #12/);
    assert.equal(r.annotation, 'Could not read the coverage of PR #12 from Sonar.');
  });

  it('below-minimum has no push hints and annotates current and minimum', () => {
    const r = formatResult({ verdict: 'below-minimum' }, { ...ctx, current: 60, base: null });
    assert.equal(r.exitCode, 1);
    noBypass(r);
    assert.ok(r.lines.includes('   Add tests until overall coverage reaches the minimum, then push again.'));
    assert.equal(r.annotation, 'Coverage 60.00% is below the 70.00% minimum.');
  });

  it('decreased has no push hints and annotates current, base and threshold', () => {
    const r = formatResult({ verdict: 'decreased', minRequired: 79, short: 2 }, { ...ctx, current: 77, base: 80 });
    assert.equal(r.exitCode, 1);
    noBypass(r);
    assert.ok(r.lines.includes('\n❌ COVERAGE DECREASED — PR #12 lowers overall coverage beyond the tolerance.'));
    assert.equal(r.annotation, 'Coverage 77.00% < 79.00% (develop 80.00% − 1.00pp tolerance).');
  });

  it('no-base on develop/main passes without a warning', () => {
    assert.deepEqual(ANALYSED_BASE_BRANCHES, ['develop', 'main']);
    for (const baseBranch of ANALYSED_BASE_BRANCHES) {
      const r = formatResult({ verdict: 'no-base' }, { ...ctx, baseBranch, current: 75, base: null });
      assert.equal(r.exitCode, 0);
      assert.equal(r.warning, undefined);
    }
  });

  it('no-base on any other base branch passes with a loud warning', () => {
    const r = formatResult({ verdict: 'no-base' }, { ...ctx, baseBranch: 'epic/ETP-1', current: 75, base: null });
    assert.equal(r.exitCode, 0);
    assert.equal(r.warning, "Coverage drop NOT checked: 'epic/ETP-1' has no coverage on Sonar "
      + '(only develop and main are analysed on push).');
  });

  it('push context never sets a no-base warning', () => {
    const r = formatResult({ verdict: 'no-base' },
      { ...ctx, context: 'push', baseBranch: 'epic/ETP-1', current: 75, base: null });
    assert.equal(r.warning, undefined);
  });

  it('no-base and ok still pass', () => {
    assert.equal(formatResult({ verdict: 'no-base' }, { ...ctx, current: 75, base: null }).exitCode, 0);
    assert.equal(formatResult({ verdict: 'ok', minRequired: 79 }, { ...ctx, current: 80, base: 80 }).exitCode, 0);
  });
});

describe('readMetric', () => {
  it('reads measures[].value', () => {
    assert.equal(readMetric(measures('81.3'), 'coverage'), 81.3);
  });

  it('falls back to period.value', () => {
    const doc = { component: { measures: [{ metric: 'new_coverage', period: { value: '55.5' } }] } };
    assert.equal(readMetric(doc, 'new_coverage'), 55.5);
  });

  it('returns null when the metric is missing or empty', () => {
    assert.equal(readMetric(measures('80'), 'other'), null);
    assert.equal(readMetric(measures(''), 'coverage'), null);
    assert.equal(readMetric({ component: { measures: [{ metric: 'coverage', period: {} }] } }, 'coverage'), null);
    assert.equal(readMetric({}, 'coverage'), null);
  });

  it('returns null on a non-numeric value or a null doc', () => {
    assert.equal(readMetric(measures('n/a'), 'coverage'), null);
    assert.equal(readMetric(null, 'coverage'), null);
  });
});

describe('parseArgs', () => {
  it('requires --base-branch', () => {
    assert.throws(() => parseArgs([]), /--base-branch is required/);
  });

  it('rejects --pull-request together with --branch', () => {
    assert.throws(() => parseArgs(['--base-branch', 'd', '--pull-request', '1', '--branch', 'x']),
      /mutually exclusive/);
  });

  it('rejects an unknown flag', () => {
    assert.throws(() => parseArgs(['--base-branch', 'd', '--nope', 'x']), /Unknown argument: --nope/);
  });

  it('rejects a flag without value (end of argv or followed by another flag)', () => {
    assert.throws(() => parseArgs(['--base-branch']), /--base-branch requires a value/);
    assert.throws(() => parseArgs(['--base-branch', '--branch', 'x']), /--base-branch requires a value/);
  });

  it('rejects an invalid --context', () => {
    assert.throws(() => parseArgs(['--base-branch', 'd', '--context', 'pr']), /--context must be 'push' or 'ci'/);
  });

  it('rejects a non-numeric or non-positive --wait-timeout', () => {
    assert.throws(() => parseArgs(['--base-branch', 'd', '--wait-timeout', 'abc']), /positive number/);
    assert.throws(() => parseArgs(['--base-branch', 'd', '--wait-timeout', '0']), /positive number/);
  });

  it('takes --check-quality-gate as a flag without value, and only with --report-task', () => {
    const opts = parseArgs(['--base-branch', 'd', '--report-task', 'r.txt', '--check-quality-gate', '--context', 'ci']);
    assert.equal(opts.checkQualityGate, true);
    assert.equal(opts.context, 'ci');
    assert.equal(parseArgs(['--base-branch', 'd']).checkQualityGate, false);
    assert.throws(() => parseArgs(['--base-branch', 'd', '--check-quality-gate']), /needs --report-task/);
  });

  it('applies defaults and derives the label', () => {
    const o = parseArgs(['--base-branch', 'develop']);
    assert.equal(o.context, 'push');
    assert.equal(o.waitTimeout, 600);
    assert.equal(o.label, 'this branch');
    assert.equal(parseArgs(['--base-branch', 'd', '--pull-request', '42']).label, 'PR #42');
    assert.equal(parseArgs(['--base-branch', 'd', '--branch', 'feature/A']).label, 'feature/A');
    assert.equal(parseArgs(['--base-branch', 'd', '--branch', 'b', '--label', 'L']).label, 'L');
    assert.equal(parseArgs(['--base-branch', 'd', '--wait-timeout', '30', '--context', 'ci']).waitTimeout, 30);
  });
});

describe('parseReportTask / readProjectKey', () => {
  it('keeps values that contain "=" and handles CRLF', () => {
    const t = parseReportTask('projectKey=p\r\nceTaskUrl=https://s/api/ce/task?id=AB=C\r\n\r\nceTaskId=AB=C');
    assert.equal(t.ceTaskUrl, 'https://s/api/ce/task?id=AB=C');
    assert.equal(t.ceTaskId, 'AB=C');
    assert.equal(t.projectKey, 'p');
  });

  it('ignores lines without a key', () => {
    assert.deepEqual(parseReportTask('=x\nnoequals'), {});
  });

  it('reads sonar.projectKey, with "=" and CRLF', () => {
    assert.equal(readProjectKey('sonar.host=x\r\nsonar.projectKey=a=b \r\nother=1'), 'a=b');
  });

  it('returns null when the key is missing or empty', () => {
    assert.equal(readProjectKey('sonar.projectName=x'), null);
    assert.equal(readProjectKey('sonar.projectKey=  '), null);
  });
});

describe('createSonarClient', () => {
  it('prefixes paths with the host, sends Basic token: auth and parses JSON', async () => {
    const fetchImpl = fakeFetch({ current: '80' });
    const getJson = createSonarClient({ hostUrl: 'https://s//', token: 'tok', fetchImpl, warn: () => {} });
    const doc = await getJson('/api/measures/component?component=p');
    assert.equal(readMetric(doc, 'coverage'), 80);
    assert.equal(fetchImpl.calls[0].url, 'https://s/api/measures/component?component=p');
    assert.equal(fetchImpl.calls[0].init.headers.Authorization,
      `Basic ${Buffer.from('tok:').toString('base64')}`);
  });

  it('uses absolute URLs as-is', async () => {
    const fetchImpl = fakeFetch();
    const getJson = createSonarClient({ hostUrl: 'https://s', token: 't', fetchImpl, warn: () => {} });
    await getJson('https://other/api/ce/task?id=1');
    assert.equal(fetchImpl.calls[0].url, 'https://other/api/ce/task?id=1');
  });

  it('warns and returns null on a 404 (not found)', async () => {
    const warns = [];
    const http = createSonarClient({ hostUrl: 'https://s', token: 't',
      fetchImpl: async () => jsonResp(null, 404), warn: (w) => warns.push(w) });
    assert.equal(await http('/api/x'), null);
    assert.deepEqual(warns, ['    WARNING: 404 on /api/x']);
  });

  for (const status of [401, 403, 500, 503]) {
    it(`warns and throws a SonarReadError carrying the status on HTTP ${status}`, async () => {
      const warns = [];
      const http = createSonarClient({ hostUrl: 'https://s', token: 't',
        fetchImpl: async () => jsonResp(null, status), warn: (w) => warns.push(w) });
      await assert.rejects(http('/api/x'),
        (e) => e instanceof SonarReadError && e.status === status && e.message === `HTTP ${status} on /api/x`);
      assert.deepEqual(warns, [`    WARNING: ${status} on /api/x`]);
    });
  }

  it('warns and throws a status-less SonarReadError on a network failure or timeout', async () => {
    const warns = [];
    for (const err of [new Error('ECONNREFUSED'), Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })]) {
      const net = createSonarClient({ hostUrl: 'https://s', token: 't',
        fetchImpl: async () => { throw err; }, warn: (w) => warns.push(w) });
      await assert.rejects(net('https://elsewhere/y'),
        (e) => e instanceof SonarReadError && e.status === undefined && e.message === `${err.message} on https://elsewhere/y`);
    }
    assert.deepEqual(warns, ['    WARNING: ECONNREFUSED on https://elsewhere/y',
      '    WARNING: The operation was aborted due to timeout on https://elsewhere/y']);
  });

  it('throws a SonarReadError on a 200 with an unparseable body', async () => {
    const getJson = createSonarClient({ hostUrl: 'https://s', token: 't', warn: () => {},
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad'); } }) });
    await assert.rejects(getJson('/api/x'), (e) => e instanceof SonarReadError && /invalid JSON on \/api\/x/.test(e.message));
  });
});

describe('isSameOrigin', () => {
  it('is true for the same origin with a different path or query', () => {
    assert.equal(isSameOrigin('https://sonar.example/api/ce/task?id=1', 'https://sonar.example'), true);
  });

  it('ignores a trailing slash or a context path on the host URL', () => {
    assert.equal(isSameOrigin('https://h/api/ce/task?id=1', 'https://h/'), true);
    assert.equal(isSameOrigin('https://h/sonar/api/ce/task?id=1', 'https://h/sonar'), true);
  });

  it('is false for a different host, scheme or port', () => {
    assert.equal(isSameOrigin('https://evil.example/api/ce/task', 'https://sonar.example'), false);
    assert.equal(isSameOrigin('http://sonar.example/api/ce/task', 'https://sonar.example'), false);
    assert.equal(isSameOrigin('https://sonar.example:8443/api/ce/task', 'https://sonar.example'), false);
  });

  it('is false when either URL is malformed', () => {
    assert.equal(isSameOrigin('not a url', 'https://sonar.example'), false);
    assert.equal(isSameOrigin('https://sonar.example/api', 'sonar.example'), false);
    assert.equal(isSameOrigin(undefined, 'https://sonar.example'), false);
  });
});

describe('waitForCeTask', () => {
  const poll = (statuses) => {
    const queue = [...statuses];
    return async () => {
      const s = queue.shift();
      return s === undefined ? null : { task: { status: s } };
    };
  };
  const opts = (extra = {}) => ({ timeoutMs: 60_000, pollMs: 5_000, log: () => {}, ...fakeClock(), ...extra });

  it('returns SUCCESS on the first poll', async () => {
    const logs = [];
    assert.equal(await waitForCeTask(poll(['SUCCESS']), 'u', opts({ log: (l) => logs.push(l) })), 'SUCCESS');
    assert.deepEqual(logs, ['    Status: SUCCESS (0s elapsed)']);
  });

  it('keeps polling through PENDING and IN_PROGRESS', async () => {
    const logs = [];
    const s = await waitForCeTask(poll(['PENDING', 'IN_PROGRESS', 'SUCCESS']), 'u', opts({ log: (l) => logs.push(l) }));
    assert.equal(s, 'SUCCESS');
    assert.equal(logs.at(-1), '    Status: SUCCESS (10s elapsed)');
  });

  it('returns FAILED and CANCELED', async () => {
    assert.equal(await waitForCeTask(poll(['PENDING', 'FAILED']), 'u', opts()), 'FAILED');
    assert.equal(await waitForCeTask(poll(['CANCELED']), 'u', opts()), 'CANCELED');
  });

  it('keeps polling when the response is unreadable', async () => {
    const queue = [null, {}, { task: {} }, { task: { status: 'SUCCESS' } }];
    const logs = [];
    const s = await waitForCeTask(async () => queue.shift(), 'u', opts({ log: (l) => logs.push(l) }));
    assert.equal(s, 'SUCCESS');
    assert.equal(logs[0], '    Status: UNKNOWN (0s elapsed)');
  });

  for (const status of [401, 403]) {
    it(`aborts with UNAUTHORIZED on the first ${status} instead of polling until the timeout`, async () => {
      let polls = 0;
      const s = await waitForCeTask(async () => { polls++; throw new SonarReadError(`HTTP ${status}`, status); }, 'u', opts());
      assert.equal(s, 'UNAUTHORIZED');
      assert.equal(polls, 1);
    });
  }

  it('keeps polling through a 5xx or a network failure', async () => {
    const queue = [new SonarReadError('HTTP 502', 502), new SonarReadError('ECONNRESET'), { task: { status: 'SUCCESS' } }];
    const s = await waitForCeTask(async () => {
      const next = queue.shift();
      if (next instanceof Error) throw next;
      return next;
    }, 'u', opts());
    assert.equal(s, 'SUCCESS');
  });

  it('rethrows an unexpected (non-Sonar) error', async () => {
    await assert.rejects(waitForCeTask(async () => { throw new TypeError('bug'); }, 'u', opts()), /bug/);
  });

  it('returns TIMEOUT once the next poll would exceed the timeout', async () => {
    let polls = 0;
    const s = await waitForCeTask(async () => { polls++; return { task: { status: 'PENDING' } }; }, 'u',
      opts({ timeoutMs: 12_000 }));
    assert.equal(s, 'TIMEOUT');
    assert.equal(polls, 3); // t=0, 5s, 10s; 10s + 5s > 12s
  });
});

describe('main', () => {
  let dir;
  let reportOk;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'cmp-cov-'));
    reportOk = join(dir, 'report-task.txt');
    writeFileSync(reportOk, 'ceTaskId=T1\nceTaskUrl=https://sonar.example/api/ce/task?id=T1\n');
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it('fails with a usage error on bad arguments or thresholds', async () => {
    let r = await run(['--nope', 'x']);
    assert.equal(r.code, 1);
    assert.deepEqual(r.err, ['ERROR: Unknown argument: --nope']);
    r = await run(['--base-branch', 'develop'], { env: { ...ENV, COVERAGE_TOLERANCE: 'abc' } });
    assert.equal(r.code, 1);
    assert.match(r.err[0], /COVERAGE_TOLERANCE must be a number/);
  });

  it('rethrows unexpected errors from argument handling', async () => {
    const env = { get COVERAGE_TOLERANCE() { throw new TypeError('boom'); } };
    await assert.rejects(main(['--base-branch', 'd'], env, { log() {}, warn() {} }), /boom/);
  });

  it('fails when SONAR_HOST_URL or SONAR_TOKEN is missing', async () => {
    for (const env of [{ SONAR_TOKEN: 't' }, { SONAR_HOST_URL: 'h' }]) {
      const r = await run(['--base-branch', 'develop'], { env, fetchImpl: fakeFetch() });
      assert.equal(r.code, 1);
      assert.deepEqual(r.err, ['ERROR: SONAR_HOST_URL and SONAR_TOKEN must be set']);
    }
  });

  it('reads the project key from sonar-project.properties and encodes the queries', async () => {
    const key = readProjectKey(readFileSync(join(REPO_ROOT, 'sonar-project.properties'), 'utf8'));
    const fetchImpl = fakeFetch({ current: '80', base: '80' });
    const r = await run(['--base-branch', 'develop', '--branch', 'feature/a b'], { fetchImpl });
    assert.equal(r.code, 0);
    const [cur, base] = fetchImpl.calls.map((c) => c.url);
    assert.equal(cur, `https://sonar.example/api/measures/component?component=${encodeURIComponent(key)}`
      + '&metricKeys=coverage&branch=feature%2Fa%20b');
    assert.equal(base, `https://sonar.example/api/measures/component?component=${encodeURIComponent(key)}`
      + '&branch=develop&metricKeys=coverage');
    assert.equal(fetchImpl.calls[0].init.headers.Authorization, `Basic ${Buffer.from('tok:').toString('base64')}`);
  });

  it('encodes --pull-request and an explicit --project-key', async () => {
    const fetchImpl = fakeFetch({ current: '80', base: '80' });
    await run(['--base-branch', 'develop', '--pull-request', '12&x', '--project-key', 'a b'], { fetchImpl });
    assert.equal(fetchImpl.calls[0].url,
      'https://sonar.example/api/measures/component?component=a%20b&metricKeys=coverage&pullRequest=12%26x');
  });

  it('queries the main analysis when neither --branch nor --pull-request is given', async () => {
    const fetchImpl = fakeFetch({ current: '80', base: '80' });
    const r = await run(['--base-branch', 'develop', '--project-key', 'p'], { fetchImpl });
    assert.equal(fetchImpl.calls[0].url, 'https://sonar.example/api/measures/component?component=p&metricKeys=coverage');
    assert.match(r.text, /this branch coverage: 80\.00%/);
    assert.match(r.text, /Coverage is OK/);
  });

  it('push context: 404 on current coverage warns and skips (exit 0)', async () => {
    const fetchImpl = fakeFetch({ current: jsonResp(null, 404), base: '80' });
    const r = await run(['--base-branch', 'develop', '--project-key', 'p'], { fetchImpl });
    assert.equal(r.code, 0);
    assert.match(r.err[0], /^ {4}WARNING: 404 on \/api\/measures\/component/);
    assert.match(r.text, /SKIPPED ⚠️ {2}Could not read this branch's coverage/);
  });

  it('push context: network failure on the base warns and passes as no-base', async () => {
    const fetchImpl = fakeFetch({ current: '80', base: new Error('getaddrinfo ENOTFOUND') });
    const r = await run(['--base-branch', 'develop', '--project-key', 'p'], { fetchImpl });
    assert.equal(r.code, 0);
    assert.match(r.err[0], /WARNING: getaddrinfo ENOTFOUND/);
    assert.match(r.text, /No coverage on Sonar for 'develop' yet/);
  });

  it('push context: a coverage drop fails (exit 1) without a ::error annotation', async () => {
    const fetchImpl = fakeFetch({ current: '75', base: '80' });
    const r = await run(['--base-branch', 'develop', '--project-key', 'p', '--label', 'feature/X'], { fetchImpl });
    assert.equal(r.code, 1);
    assert.match(r.text, /COVERAGE DECREASED — this push would fail/);
    assert.doesNotMatch(r.text, /--no-verify/);
    assert.doesNotMatch(r.text, /::error/);
  });

  it('honours threshold overrides from the environment', async () => {
    const fetchImpl = fakeFetch({ current: '75', base: '80' });
    const r = await run(['--base-branch', 'develop', '--project-key', 'p'],
      { env: { ...ENV, COVERAGE_TOLERANCE: '5' }, fetchImpl });
    assert.equal(r.code, 0);
    assert.match(r.text, /min required with 5\.00pp tolerance: 75\.00%/);
  });

  it('ci context: a coverage drop fails with a ::error annotation', async () => {
    const fetchImpl = fakeFetch({ ce: ['SUCCESS'], current: '75', base: '80' });
    const r = await run(['--base-branch', 'develop', '--project-key', 'p', '--pull-request', '7',
      '--context', 'ci', '--report-task', reportOk], { fetchImpl });
    assert.equal(r.code, 1);
    assert.equal(r.out[0], '==> Waiting for Sonar to process analysis T1 ...');
    assert.equal(r.out.at(-1), '::error title=Coverage gate::Coverage 75.00% < 79.00% (develop 80.00% − 1.00pp tolerance).');
    assert.doesNotMatch(r.text, /--no-verify/);
  });

  it('ci context: unreadable current coverage fails with ::error', async () => {
    const fetchImpl = fakeFetch({ current: jsonResp(null, 404), base: '80' });
    const r = await run(['--base-branch', 'develop', '--project-key', 'p', '--pull-request', '7', '--context', 'ci'],
      { fetchImpl });
    assert.equal(r.code, 1);
    assert.equal(r.out.at(-1), '::error title=Coverage gate::Could not read the coverage of PR #7 from Sonar.');
  });

  it('ci context: a pass after the CE task succeeds exits 0 without annotation', async () => {
    const fetchImpl = fakeFetch({ ce: ['PENDING', 'SUCCESS'], current: '80', base: '80' });
    const r = await run(['--base-branch', 'develop', '--project-key', 'p', '--context', 'ci',
      '--report-task', reportOk], { fetchImpl });
    assert.equal(r.code, 0);
    assert.doesNotMatch(r.text, /::error/);
    assert.equal(fetchImpl.calls[0].url, 'https://sonar.example/api/ce/task?id=T1');
  });

  describe('ci context: reading the base coverage', () => {
    const ciArgs = (base = 'develop') => ['--base-branch', base, '--project-key', 'p', '--pull-request', '7', '--context', 'ci'];

    it('a 404 on the base (branch not analysed) passes as no-base', async () => {
      const r = await run(ciArgs(), { fetchImpl: fakeFetch({ current: '80', base: jsonResp(null, 404) }) });
      assert.equal(r.code, 0);
      assert.match(r.text, /No coverage on Sonar for 'develop' yet/);
      assert.doesNotMatch(r.text, /::(error|warning)/);
    });

    it('a base analysis without the coverage measure passes as no-base', async () => {
      const r = await run(ciArgs(), { fetchImpl: fakeFetch({ current: '80', base: jsonResp({ component: { measures: [] } }) }) });
      assert.equal(r.code, 0);
      assert.match(r.text, /No coverage on Sonar for 'develop' yet/);
    });

    const failures = [
      { name: 'HTTP 401', base: () => jsonResp(null, 401), detail: 'HTTP 401 on /api/measures/component' },
      { name: 'HTTP 403', base: () => jsonResp(null, 403), detail: 'HTTP 403 on /api/measures/component' },
      { name: 'HTTP 500', base: () => jsonResp(null, 500), detail: 'HTTP 500 on /api/measures/component' },
      { name: 'HTTP 503', base: () => jsonResp(null, 503), detail: 'HTTP 503 on /api/measures/component' },
      { name: 'a timeout', base: () => Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }),
        detail: 'The operation was aborted due to timeout on /api/measures/component' },
      { name: 'a network failure', base: () => new Error('getaddrinfo ENOTFOUND'),
        detail: 'getaddrinfo ENOTFOUND on /api/measures/component' },
    ];
    for (const c of failures) {
      it(`${c.name} on the base fails closed with ::error (not no-base)`, async () => {
        const r = await run(ciArgs(), { fetchImpl: fakeFetch({ current: '90', base: c.base() }) });
        assert.equal(r.code, 1);
        assert.doesNotMatch(r.text, /No coverage on Sonar/);
        const last = r.out.at(-1);
        assert.ok(last.startsWith(`::error title=Coverage gate::could not read the coverage of 'develop' from Sonar (${c.detail}`),
          last);
      });

      it(`push context: ${c.name} on the base still passes as no-base`, async () => {
        const r = await run(['--base-branch', 'develop', '--project-key', 'p'],
          { fetchImpl: fakeFetch({ current: '80', base: c.base() }) });
        assert.equal(r.code, 0);
        assert.match(r.text, /No coverage on Sonar for 'develop' yet/);
        assert.doesNotMatch(r.text, /::error/);
      });
    }

    it('a base other than develop/main with no coverage passes with a ::warning', async () => {
      const r = await run(ciArgs('epic/ETP-1'),
        { fetchImpl: fakeFetch({ current: '80', base: jsonResp(null, 404), baseBranch: 'epic/ETP-1' }) });
      assert.equal(r.code, 0);
      assert.equal(r.out.at(-1), "::warning title=Coverage gate::Coverage drop NOT checked: 'epic/ETP-1' "
        + 'has no coverage on Sonar (only develop and main are analysed on push).');
      assert.doesNotMatch(r.text, /::error/);
    });

    it('main with no coverage passes without a warning', async () => {
      const r = await run(ciArgs('main'),
        { fetchImpl: fakeFetch({ current: '80', base: jsonResp(null, 404), baseBranch: 'main' }) });
      assert.equal(r.code, 0);
      assert.doesNotMatch(r.text, /::warning/);
    });
  });

  describe('CE task rejected with 401/403', () => {
    for (const status of [401, 403]) {
      it(`ci context: ${status} aborts after one poll and fails with ::error`, async () => {
        const fetchImpl = fakeFetch({ ce: [jsonResp(null, status)], current: '90', base: '80' });
        const r = await run(['--base-branch', 'develop', '--project-key', 'p', '--context', 'ci',
          '--report-task', reportOk], { fetchImpl });
        assert.equal(r.code, 1);
        assert.equal(fetchImpl.calls.filter((c) => c.url.includes('/api/ce/task')).length, 1);
        assert.ok(!fetchImpl.calls.some((c) => c.url.includes('/api/measures/')), 'no coverage read');
        assert.equal(r.out.at(-1),
          '::error title=Coverage gate::Sonar rejected the token (401/403) while reading the analysis task');
      });
    }

    it('push context: 403 aborts and skips (exit 0)', async () => {
      const fetchImpl = fakeFetch({ ce: [jsonResp(null, 403)], current: '90', base: '80' });
      const r = await run(['--base-branch', 'develop', '--project-key', 'p', '--report-task', reportOk], { fetchImpl });
      assert.equal(r.code, 0);
      assert.equal(r.out.at(-1),
        '    SKIPPED ⚠️  Sonar rejected the token (401/403) while reading the analysis task — not blocking.');
    });
  });

  describe('foreign ceTaskUrl (the token must never leave SONAR_HOST_URL)', () => {
    let foreign;
    before(() => {
      foreign = join(dir, 'foreign-task.txt');
      writeFileSync(foreign, 'ceTaskId=T9\nceTaskUrl=https://evil.example/api/ce/task?id=T9\n');
    });
    const msg = () => `ceTaskUrl in ${foreign} does not point to SONAR_HOST_URL (refusing to send the token)`;

    it('ci context: fails with ::error and never calls fetch', async () => {
      const fetchImpl = fakeFetch({ current: '90', base: '80' });
      const r = await run(['--base-branch', 'develop', '--project-key', 'p', '--context', 'ci',
        '--report-task', foreign], { fetchImpl });
      assert.equal(r.code, 1);
      assert.ok(r.out.includes(`\n❌ COVERAGE NOT EVALUATED — ${msg()}.`));
      assert.equal(r.out.at(-1), `::error title=Coverage gate::${msg()}`);
      assert.equal(fetchImpl.calls.length, 0);
    });

    it('push context: skips (exit 0) and never calls fetch', async () => {
      const fetchImpl = fakeFetch({ current: '90', base: '80' });
      const r = await run(['--base-branch', 'develop', '--project-key', 'p', '--report-task', foreign], { fetchImpl });
      assert.equal(r.code, 0);
      assert.equal(r.out.at(-1), `    SKIPPED ⚠️  ${msg()} — not blocking.`);
      assert.equal(fetchImpl.calls.length, 0);
    });

    it('a same-origin ceTaskUrl is still polled with Basic token: auth', async () => {
      const fetchImpl = fakeFetch({ ce: ['SUCCESS'], current: '80', base: '80' });
      const r = await run(['--base-branch', 'develop', '--project-key', 'p', '--context', 'ci',
        '--report-task', reportOk], { fetchImpl });
      assert.equal(r.code, 0);
      assert.equal(fetchImpl.calls[0].url, 'https://sonar.example/api/ce/task?id=T1');
      assert.equal(fetchImpl.calls[0].init.headers.Authorization, `Basic ${Buffer.from('tok:').toString('base64')}`);
    });
  });

  describe('tooling failures', () => {
    const cases = [
      { name: 'missing report-task file', file: () => join(dir, 'absent.txt'),
        msg: (f) => `${f} not found (did the scanner run?)` },
      { name: 'report-task without ceTaskUrl', file: () => { const f = join(dir, 'no-url.txt'); writeFileSync(f, 'ceTaskId=X\n'); return f; },
        msg: (f) => `no ceTaskUrl in ${f}` },
      { name: 'CE task FAILED', file: () => reportOk, ce: ['FAILED'], msg: () => 'Sonar analysis FAILED' },
      { name: 'CE task timeout', file: () => reportOk, ce: Array(10).fill('PENDING'), timeout: '12',
        msg: () => 'Sonar did not process the analysis within 12s' },
    ];

    for (const c of cases) {
      it(`ci context: ${c.name} fails with ::error`, async () => {
        const f = c.file();
        const argv = ['--base-branch', 'develop', '--project-key', 'p', '--context', 'ci', '--report-task', f];
        if (c.timeout) argv.push('--wait-timeout', c.timeout);
        const fetchImpl = fakeFetch({ ce: c.ce, current: '90', base: '80' });
        const r = await run(argv, { fetchImpl });
        assert.equal(r.code, 1);
        assert.ok(r.out.includes(`\n❌ COVERAGE NOT EVALUATED — ${c.msg(f)}.`));
        assert.equal(r.out.at(-1), `::error title=Coverage gate::${c.msg(f)}`);
        assert.ok(!fetchImpl.calls.some((x) => x.url.includes('/api/measures/')), 'no coverage read');
      });

      it(`push context: ${c.name} skips (exit 0)`, async () => {
        const f = c.file();
        const argv = ['--base-branch', 'develop', '--project-key', 'p', '--report-task', f];
        if (c.timeout) argv.push('--wait-timeout', c.timeout);
        const r = await run(argv, { fetchImpl: fakeFetch({ ce: c.ce, current: '90', base: '80' }) });
        assert.equal(r.code, 0);
        assert.equal(r.out.at(-1), `    SKIPPED ⚠️  ${c.msg(f)} — not blocking.`);
        assert.doesNotMatch(r.text, /::error/);
      });
    }
  });
});

describe('quality gate', () => {
  const gateDoc = (status, conditions = []) => ({ projectStatus: { status, conditions } });
  const failedCondition = { status: 'ERROR', metricKey: 'new_violations', actualValue: '3', comparator: 'GT', errorThreshold: '0' };

  it('describes a failed condition with its metric, value and threshold', () => {
    assert.equal(describeCondition(failedCondition), 'new_violations: 3 (GT 0)');
    assert.equal(describeCondition({}), '?: ? (? ?)');
  });

  it('formats ERROR as a failure listing the conditions, OK and NONE as passes', () => {
    const failed = formatQualityGate({ status: 'ERROR', failed: [failedCondition] });
    assert.equal(failed.exitCode, 1);
    assert.match(failed.lines.join('\n'), /QUALITY GATE FAILED[\s\S]*- new_violations: 3 \(GT 0\)/);
    assert.equal(failed.annotation, 'Quality gate failed: new_violations: 3 (GT 0).');
    assert.match(formatQualityGate({ status: 'ERROR', failed: [] }).lines.join('\n'), /\(none listed\)/);
    assert.equal(formatQualityGate({ status: 'OK', failed: [] }).exitCode, 0);
    assert.equal(formatQualityGate({ status: 'NONE', failed: [] }).exitCode, 0);
    assert.equal(formatQualityGate({ status: 'WARN', failed: [] }).exitCode, null);
  });

  it('reads the gate of the analysis the CE task produced, keeping only the ERROR conditions', async () => {
    const fetchImpl = fakeFetch({
      analysisId: 'A 1', gate: gateDoc('ERROR', [failedCondition, { ...failedCondition, status: 'OK' }]),
    });
    const getJson = createSonarClient({ hostUrl: 'https://sonar.example', token: 't', fetchImpl, warn() {} });
    const gate = await readQualityGate(getJson, 'https://sonar.example/api/ce/task?id=T1');
    assert.equal(gate.status, 'ERROR');
    assert.deepEqual(gate.failed, [failedCondition]);
    assert.equal(fetchImpl.calls[1].url, 'https://sonar.example/api/qualitygates/project_status?analysisId=A%201');
  });

  it('throws a SonarReadError when the task has no analysisId or the gate is missing', async () => {
    const getJson = (fetchImpl) => createSonarClient({ hostUrl: 'https://sonar.example', token: 't', fetchImpl, warn() {} });
    await assert.rejects(readQualityGate(getJson(fakeFetch({ gate: gateDoc('OK') })), 'https://sonar.example/api/ce/task?id=T1'),
      (e) => e instanceof SonarReadError && /no analysisId/.test(e.message));
    await assert.rejects(readQualityGate(getJson(fakeFetch({ analysisId: 'A1' })), 'https://sonar.example/api/ce/task?id=T1'),
      (e) => e instanceof SonarReadError && /no quality gate/.test(e.message));
  });

  describe('main --check-quality-gate', () => {
    let dir;
    let report;
    before(() => {
      dir = mkdtempSync(join(tmpdir(), 'cmp-qg-'));
      report = join(dir, 'report-task.txt');
      writeFileSync(report, 'ceTaskId=T1\nceTaskUrl=https://sonar.example/api/ce/task?id=T1\n');
    });
    after(() => rmSync(dir, { recursive: true, force: true }));
    const args = (context = 'ci') => ['--base-branch', 'develop', '--project-key', 'p', '--pull-request', '7',
      '--report-task', report, '--check-quality-gate', '--context', context];

    it('passes when the coverage is fine and the gate is OK', async () => {
      const r = await run(args(), { fetchImpl: fakeFetch({ current: '85', base: '85', analysisId: 'A1', gate: gateDoc('OK') }) });
      assert.equal(r.code, 0);
      assert.match(r.text, /Coverage is OK[\s\S]*==> Quality gate\n {4}Quality gate passed/);
    });

    it('fails on a failed gate even when the coverage is fine, and annotates it in ci', async () => {
      const fetchImpl = fakeFetch({ current: '85', base: '85', analysisId: 'A1', gate: gateDoc('ERROR', [failedCondition]) });
      const r = await run(args(), { fetchImpl });
      assert.equal(r.code, 1);
      assert.match(r.text, /QUALITY GATE FAILED/);
      assert.match(r.text, /::error title=Quality gate::Quality gate failed: new_violations: 3 \(GT 0\)\./);
    });

    it('fails when the coverage drops even though the gate is OK', async () => {
      const r = await run(args(), { fetchImpl: fakeFetch({ current: '75', base: '85', analysisId: 'A1', gate: gateDoc('OK') }) });
      assert.equal(r.code, 1);
      assert.match(r.text, /Quality gate passed/);
    });

    it('passes with a note when the project has no gate', async () => {
      const r = await run(args(), { fetchImpl: fakeFetch({ current: '85', base: '85', analysisId: 'A1', gate: gateDoc('NONE') }) });
      assert.equal(r.code, 0);
      assert.match(r.text, /no quality gate: nothing to check/);
    });

    it('an unreadable or unexpected gate fails in ci and is skipped on a push', async () => {
      for (const gate of [jsonResp(null, 500), gateDoc('WARN')]) {
        let r = await run(args('ci'), { fetchImpl: fakeFetch({ current: '85', base: '85', analysisId: 'A1', gate }) });
        assert.equal(r.code, 1);
        assert.match(r.text, /QUALITY GATE NOT EVALUATED[\s\S]*::error title=Quality gate::/);
        r = await run(args('push'), { fetchImpl: fakeFetch({ current: '85', base: '85', analysisId: 'A1', gate }) });
        assert.equal(r.code, 0);
        assert.match(r.text, /SKIPPED ⚠️ {2}(the quality gate could not be read|unexpected quality gate status)/);
      }
    });

    it('does not read the gate without the flag', async () => {
      const fetchImpl = fakeFetch({ current: '85', base: '85', analysisId: 'A1', gate: gateDoc('ERROR') });
      const r = await run(['--base-branch', 'develop', '--project-key', 'p', '--report-task', report, '--context', 'ci'], { fetchImpl });
      assert.equal(r.code, 0);
      assert.ok(!fetchImpl.calls.some((c) => c.url.includes('qualitygates')));
    });
  });
});

describe('CLI entry point', () => {
  it('isEntryPoint matches only the script itself', () => {
    const url = pathToFileURL(SCRIPT).href;
    assert.equal(isEntryPoint(url, SCRIPT), true);
    assert.equal(isEntryPoint(url, join(REPO_ROOT, 'other.js')), false);
    assert.equal(isEntryPoint(url, undefined), false);
  });

  it('exits 1 with a usage error when run directly without arguments', () => {
    const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8', env: { PATH: process.env.PATH } });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /ERROR: --base-branch is required/);
  });
});

describe('wiring guardrails', () => {
  const runSonar = readFileSync(join(REPO_ROOT, 'run-sonar.sh'), 'utf8');
  const action = readFileSync(join(REPO_ROOT, '.github', 'actions', 'unit-tests-sonar', 'action.yml'), 'utf8');
  const mini = readFileSync(join(REPO_ROOT, '.github', 'workflows', 'mini-pipeline.yml'), 'utf8');
  const full = readFileSync(join(REPO_ROOT, '.github', 'workflows', 'full-pipeline.yml'), 'utf8');
  // ETP-6387: the action is checked out from the run's own commit, apart from the PR head.
  const assertActionFromRunCommit = (unit) => {
    const step = /- name: Checkout the unit tests action\n([\s\S]*?)(?=\n {6}- )/.exec(unit)?.[1];
    assert.ok(step, 'the action has its own checkout');
    assert.match(step, /path: \.ci-actions/);
    assert.match(step, /sparse-checkout: \.github\/actions/);
    assert.doesNotMatch(step, /ref:/, 'no ref: the run\'s own commit, the merge ref on a PR');
    assert.match(unit, /uses: \.\/\.ci-actions\/\.github\/actions\/unit-tests-sonar/);
    assert.ok(unit.indexOf('fetch-depth: 0') < unit.indexOf('Checkout the unit tests action'), 'the head checkout runs first: it cleans the workspace');
  };
  const job = (workflow, id) => new RegExp(`\n {2}${id}:\n([\\s\\S]*?)(?=\n {2}[A-Za-z_-]+:\n|$)`).exec(workflow)?.[1];

  it('run-sonar.sh delegates the gate to scripts/compare-sonar-coverage.js', () => {
    assert.match(runSonar, /node\s+"\$SCRIPT_DIR\/scripts\/compare-sonar-coverage\.js"\s+"\$\{CMP_ARGS\[@\]\}"/);
    assert.doesNotMatch(runSonar, /COVERAGE DECREASED/, 'the rule text lives only in the shared script');
  });

  it('run-sonar.sh does not redefine the threshold defaults', () => {
    assert.doesNotMatch(runSonar, /COVERAGE_(TOLERANCE|MINIMUM):-/);
    assert.doesNotMatch(runSonar, /^\s*(export\s+)?COVERAGE_(TOLERANCE|MINIMUM)=/m);
  });

  it('the action runs the compare step on PRs in ci context, with the quality gate, after the scan', () => {
    const step = /- name: Compare coverage with the base branch\n([\s\S]*?)(?=\n {4}- |$)/.exec(action)?.[1];
    assert.ok(step, 'compare step present in the action');
    assert.match(step, /if: github\.event_name == 'pull_request'/);
    assert.match(step, /node scripts\/compare-sonar-coverage\.js --context ci/);
    assert.match(step, /--report-task \.scannerwork\/report-task\.txt \$gate/);
    assert.match(step, /--pull-request "\$PR_NUMBER" --base-branch "\$BASE_BRANCH"/);
    assert.match(step, /gate=--check-quality-gate\n\s+if ! grep -q -- "--check-quality-gate" scripts\/compare-sonar-coverage\.js; then\n\s+gate=/,
      'the gate flag goes only to a script that supports it (a PR head older than ETP-6374)');
    assert.ok(action.indexOf('make test-ci-coverage') < action.indexOf('sonarqube-scan-action'), 'the scan runs after the tests');
    assert.ok(action.indexOf('sonarqube-scan-action') < action.indexOf('Compare coverage with the base branch'),
      'compare runs after the scan');
  });

  it('the scan and the compare step only run when every test passed (no always() on them)', () => {
    const fromScan = action.slice(action.indexOf('- name: Sonar analysis'));
    assert.doesNotMatch(fromScan, /if: (always|failure)\(\)/);
  });

  it('the mini pipeline runs the action on PRs and pushes to develop, under its own job name', () => {
    assert.match(mini, /pull_request:\n {4}branches: \[develop\]/);
    assert.match(mini, /push:\n {4}branches: \[develop\]/);
    const unit = job(mini, 'unit-tests-sonar');
    assert.ok(unit, 'unit-tests-sonar job present');
    assert.match(unit, /name: 'Mini Pipeline: Unit tests \+ Sonar \+ coverage'/);
    assertActionFromRunCommit(unit);
    assert.match(unit, /fetch-depth: 0/);
    assert.match(job(mini, 'mocked'), /if: github\.event_name != 'push'/);
  });

  it('the full pipeline runs the action on cuts and keeps main analyzed on a validated push', () => {
    const unit = job(full, 'unit-tests');
    assert.ok(unit, 'unit-tests job present');
    assert.match(unit, /name: Unit tests \+ Sonar \+ coverage/);
    assertActionFromRunCommit(unit);
    assert.match(unit, /needs\.route\.outputs\.validated_run == ''/);
    const cut = job(full, 'validated-cut-sonar');
    assert.ok(cut, 'validated-cut-sonar job present');
    assert.match(cut, /if: needs\.route\.outputs\.validated_run != ''/);
    assert.match(cut, /name: unit-coverage/);
    assert.match(full, /'Unit tests \+ Sonar \+ coverage', 'Mocked E2E \(full pipeline\)'/, 'Route requires the unit tests');
  });

  it('every Sonar scan takes its timeouts from the organization variables (ETP-6390)', () => {
    assert.match(action, /-Dsonar\.scanner\.socketTimeout=\$\{\{ inputs\.sonar_socket_timeout \|\| '60' \}\}/);
    assert.match(action, /-Dsonar\.scanner\.responseTimeout=\$\{\{ inputs\.sonar_response_timeout \|\| '60' \}\}/);
    for (const unit of [job(mini, 'unit-tests-sonar'), job(full, 'unit-tests')]) {
      assert.match(unit, /sonar_socket_timeout: \$\{\{ vars\.SONAR_SOCKET_TIMEOUT \}\}/);
      assert.match(unit, /sonar_response_timeout: \$\{\{ vars\.SONAR_RESPONSE_TIMEOUT \}\}/);
    }
    const cut = job(full, 'validated-cut-sonar');
    assert.match(cut, /-Dsonar\.scanner\.socketTimeout=\$\{\{ vars\.SONAR_SOCKET_TIMEOUT \|\| '60' \}\}/);
    assert.match(cut, /-Dsonar\.scanner\.responseTimeout=\$\{\{ vars\.SONAR_RESPONSE_TIMEOUT \|\| '60' \}\}/);
  });

  it('pins the scan action to a commit sha and declares least-privilege permissions', () => {
    for (const text of [action, full]) {
      assert.match(text, /sonarqube-scan-action@[0-9a-f]{40} # v\d+\.\d+\.\d+/);
      assert.doesNotMatch(text, /@master\b/);
    }
    for (const text of [mini, full]) {
      assert.match(text, /^permissions:\n {2}contents: read\n/m);
      assert.doesNotMatch(text, /: write-all|: read-all/);
    }
  });

  it('gives each push sha its own concurrency group', () => {
    assert.match(mini, /group: mini-pipeline-\$\{\{ github\.event\.pull_request\.number \|\| github\.sha \}\}/);
    assert.match(full, /group: full-pipeline-\$\{\{ github\.event\.pull_request\.number \|\| github\.sha \}\}/);
  });
});

describe('run-sonar.sh scanner locale', () => {
  const runSonar = readFileSync(join(REPO_ROOT, 'run-sonar.sh'), 'utf8');

  it('launches sonar-scanner under a forced UTF-8 locale (LC_ALL=C aborts on non-ASCII paths)', () => {
    assert.match(runSonar, /LANG="\$SCANNER_LOCALE" LC_ALL="\$SCANNER_LOCALE" sonar-scanner /);
  });

  it('falls back to en_US.UTF-8, the locale macOS has', () => {
    assert.match(runSonar, /SCANNER_LOCALE="en_US\.UTF-8"/);
  });
});
