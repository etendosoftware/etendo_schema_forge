// @covers scripts/compare-sonar-coverage.js
// @covers run-sonar.sh
// @covers .github/workflows/test.yml
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
  UsageError,
  createSonarClient,
  evaluateCoverage,
  formatResult,
  isEntryPoint,
  isSameOrigin,
  main,
  parseArgs,
  parseReportTask,
  readMetric,
  readProjectKey,
  resolveThresholds,
  waitForCeTask,
} from '../compare-sonar-coverage.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'compare-sonar-coverage.js');
const BYPASS = "   Bypass with 'git push --no-verify' (WIP only).";

const measures = (value) => ({ component: { measures: [{ metric: 'coverage', value }] } });
const jsonResp = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

/**
 * Fake fetch routing on the URL: `ce` (the CE task responses, consumed in order),
 * `current` / `base` (coverage values or a Response-like / Error to return).
 */
function fakeFetch({ ce = [], current, base } = {}) {
  const calls = [];
  const queue = [...ce];
  const answer = (v) => {
    if (v instanceof Error) throw v;
    if (v && typeof v === 'object' && 'ok' in v) return v;
    return jsonResp(measures(v));
  };
  const impl = async (url, init) => {
    calls.push({ url, init });
    if (url.includes('/api/ce/task')) return jsonResp({ task: { status: queue.shift() ?? 'SUCCESS' } });
    if (url.includes('/api/measures/component') && /[?&]branch=develop&metricKeys/.test(url)) return answer(base);
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

  it('below-minimum prints the legacy lines and the bypass hint', () => {
    const r = formatResult({ verdict: 'below-minimum' }, { ...ctx, current: 65.5, base: null });
    assert.equal(r.exitCode, 1);
    assert.deepEqual(r.lines, [
      '    feature/X coverage: 65.50%',
      '\n❌ COVERAGE BELOW MINIMUM — 65.50% < 70.00% required.',
      '   Add tests until overall coverage reaches the minimum, then re-push.',
      BYPASS,
    ]);
  });

  it('no-base skips without blocking', () => {
    const r = formatResult({ verdict: 'no-base' }, { ...ctx, current: 75, base: null });
    assert.equal(r.exitCode, 0);
    assert.deepEqual(r.lines, ["    SKIPPED ⚠️  No coverage on Sonar for 'develop' yet — not blocking "
      + '(matches CI, which treats a missing baseline as 0%).']);
  });

  it('decreased prints the legacy lines and the bypass hint', () => {
    const r = formatResult({ verdict: 'decreased', minRequired: 79, short: 0.5 },
      { ...ctx, current: 78.5, base: 80 });
    assert.equal(r.exitCode, 1);
    assert.deepEqual(r.lines, [
      '    feature/X coverage: 78.50%',
      '    develop coverage: 80.00% (min required with 1.00pp tolerance: 79.00%)',
      "\n❌ COVERAGE DECREASED — this push would fail Jenkins' 'Compare Coverage Results'.",
      "   78.50% < 79.00% (base 80.00% − 1.00pp) on 'develop' (short 0.50pp).",
      '   Add tests until overall coverage is >= the base (minus tolerance), then re-push.',
      BYPASS,
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

  it('warns and returns null on an HTTP error or a network failure', async () => {
    const warns = [];
    const http = createSonarClient({ hostUrl: 'https://s', token: 't',
      fetchImpl: async () => jsonResp(null, 404), warn: (w) => warns.push(w) });
    assert.equal(await http('/api/x'), null);
    const net = createSonarClient({ hostUrl: 'https://s', token: 't',
      fetchImpl: async () => { throw new Error('ECONNREFUSED'); }, warn: (w) => warns.push(w) });
    assert.equal(await net('https://elsewhere/y'), null);
    assert.deepEqual(warns, ['    WARNING: 404 on /api/x', '    WARNING: ECONNREFUSED on https://elsewhere/y']);
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
    assert.ok(r.out.includes(BYPASS));
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
  const workflow = readFileSync(join(REPO_ROOT, '.github', 'workflows', 'test.yml'), 'utf8');

  it('run-sonar.sh delegates the gate to scripts/compare-sonar-coverage.js', () => {
    assert.match(runSonar, /node\s+"\$SCRIPT_DIR\/scripts\/compare-sonar-coverage\.js"\s+"\$\{CMP_ARGS\[@\]\}"/);
    assert.doesNotMatch(runSonar, /COVERAGE DECREASED/, 'the rule text lives only in the shared script');
  });

  it('run-sonar.sh does not redefine the threshold defaults', () => {
    assert.doesNotMatch(runSonar, /COVERAGE_(TOLERANCE|MINIMUM):-/);
    assert.doesNotMatch(runSonar, /^\s*(export\s+)?COVERAGE_(TOLERANCE|MINIMUM)=/m);
  });

  it('the sonar job runs the compare step on successful PRs in ci context', () => {
    const job = /\n {2}sonar:\n([\s\S]*?)(?=\n {2}[A-Za-z_-]+:\n|$)/.exec(workflow)?.[1];
    assert.ok(job, 'sonar job present');
    const step = /- name: Compare coverage with the base branch\n([\s\S]*?)(?=\n {6}- |$)/.exec(job)?.[1];
    assert.ok(step, 'compare step present in the sonar job');
    assert.match(step, /if: github\.event_name == 'pull_request' && needs\.test\.result == 'success'/);
    assert.match(step, /node scripts\/compare-sonar-coverage\.js --context ci/);
    assert.match(step, /--report-task \.scannerwork\/report-task\.txt/);
    assert.match(step, /--pull-request "\$PR_NUMBER" --base-branch "\$BASE_BRANCH"/);
    assert.ok(job.indexOf('sonarqube-scan-action') < job.indexOf('Compare coverage with the base branch'),
      'compare runs after the scan');
  });
});
