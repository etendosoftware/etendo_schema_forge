#!/usr/bin/env node
// Coverage-decrease gate: the ONE implementation of the rule enforced by Jenkins'
// "Compare Coverage Results" stage (sonarUtils.compareCoverage). Called by
// `run-sonar.sh --compare-coverage` (pre-push) and by the `Sonar Build` job of
// .github/workflows/test.yml. See docs/coverage-gate.md.
//
// Rule, on OVERALL coverage read live from Sonar:
//   current < COVERAGE_MINIMUM               → fail (no base comparison)
//   current < base − COVERAGE_TOLERANCE      → fail
//   otherwise                                → pass
// A base branch with no coverage yet (first analysis) passes with a warning.
//
// Usage:
//   node scripts/compare-sonar-coverage.js --base-branch <branch>
//     [--pull-request <key>]      read the current coverage of this Sonar PR analysis
//     [--branch <name>]           ...or of this Sonar branch analysis
//     [--label <text>]            how the current analysis is named in the output
//     [--project-key <key>]       default: sonar.projectKey of sonar-project.properties
//     [--report-task <file>]      wait for that scanner task (ceTaskUrl) to be processed
//     [--wait-timeout <seconds>]  default 600
//     [--context push|ci]         push (default): tooling failures never block and the
//                                 hints mention re-push; ci: tooling failures fail
// Env: SONAR_HOST_URL, SONAR_TOKEN, COVERAGE_TOLERANCE, COVERAGE_MINIMUM.
// Exit: 0 pass/skip, 1 gate failed (or, in ci context, coverage could not be evaluated).
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');

// The reviewed thresholds. This is the only place their defaults live.
export const DEFAULT_COVERAGE_TOLERANCE = 1;
export const DEFAULT_COVERAGE_MINIMUM = 70;

const DEFAULT_WAIT_TIMEOUT_S = 600;
const POLL_INTERVAL_MS = 5000;
const HTTP_TIMEOUT_MS = 30000;

export class UsageError extends Error {}

function readThreshold(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new UsageError(`${name} must be a number, got '${raw}'`);
  }
  return value;
}

/** Thresholds from the environment, falling back to the reviewed defaults. */
export function resolveThresholds(env = process.env) {
  return {
    tolerance: readThreshold(env, 'COVERAGE_TOLERANCE', DEFAULT_COVERAGE_TOLERANCE),
    minimum: readThreshold(env, 'COVERAGE_MINIMUM', DEFAULT_COVERAGE_MINIMUM),
  };
}

const VALUE_FLAGS = {
  '--base-branch': 'baseBranch',
  '--pull-request': 'pullRequest',
  '--branch': 'branch',
  '--label': 'label',
  '--project-key': 'projectKey',
  '--report-task': 'reportTask',
  '--wait-timeout': 'waitTimeout',
  '--context': 'context',
};

export function parseArgs(argv) {
  const opts = { context: 'push', waitTimeout: String(DEFAULT_WAIT_TIMEOUT_S) };
  for (let i = 0; i < argv.length; i++) {
    const key = VALUE_FLAGS[argv[i]];
    if (!key) throw new UsageError(`Unknown argument: ${argv[i]}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new UsageError(`${argv[i]} requires a value`);
    }
    opts[key] = value;
    i++;
  }
  if (!opts.baseBranch) throw new UsageError('--base-branch is required');
  if (opts.pullRequest && opts.branch) {
    throw new UsageError('--pull-request and --branch are mutually exclusive');
  }
  if (!['push', 'ci'].includes(opts.context)) {
    throw new UsageError(`--context must be 'push' or 'ci', got '${opts.context}'`);
  }
  const timeout = Number(opts.waitTimeout);
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new UsageError(`--wait-timeout must be a positive number, got '${opts.waitTimeout}'`);
  }
  opts.waitTimeout = timeout;
  opts.label = opts.label || (opts.pullRequest ? `PR #${opts.pullRequest}` : opts.branch || 'this branch');
  return opts;
}

/** sonar.projectKey from a sonar-project.properties file, or null. */
export function readProjectKey(propertiesText) {
  for (const line of propertiesText.split(/\r?\n/)) {
    const m = /^sonar\.projectKey=(.*)$/.exec(line);
    if (m) return m[1].trim() || null;
  }
  return null;
}

/** key=value pairs of the scanner's .scannerwork/report-task.txt. */
export function parseReportTask(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const idx = line.indexOf('=');
    if (idx > 0) out[line.slice(0, idx)] = line.slice(idx + 1);
  }
  return out;
}

/**
 * Read a coverage metric from an /api/measures/component response.
 * New-code metrics carry their value under measures[].period.value; plain
 * metrics (coverage) under measures[].value. Handle both.
 */
export function readMetric(doc, metric) {
  if (!doc) return null;
  for (const m of doc.component?.measures ?? []) {
    if (m.metric !== metric) continue;
    let v = m.value;
    if (v === undefined || v === null || v === '') v = m.period?.value;
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * True when `url` has the same origin (scheme, host, port) as `hostUrl`.
 * Guards the ceTaskUrl read from report-task.txt so the token is never sent elsewhere.
 */
export function isSameOrigin(url, hostUrl) {
  try {
    return new URL(url).origin === new URL(hostUrl).origin;
  } catch {
    return false;
  }
}

/** GET a Sonar API path (or absolute URL) as JSON; null (with a warning) on any failure. */
export function createSonarClient({ hostUrl, token, fetchImpl = globalThis.fetch, warn = console.error }) {
  const base = hostUrl.replace(/\/+$/, '');
  const auth = `Basic ${Buffer.from(`${token}:`).toString('base64')}`;
  return async function getJson(pathOrUrl) {
    const url = /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : `${base}${pathOrUrl}`;
    const shown = url.startsWith(base) ? url.slice(base.length) : url;
    try {
      const resp = await fetchImpl(url, {
        headers: { Authorization: auth },
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
      if (!resp.ok) {
        warn(`    WARNING: ${resp.status} on ${shown}`);
        return null;
      }
      return await resp.json();
    } catch (err) { // network/DNS — the caller decides whether that blocks
      warn(`    WARNING: ${err.message} on ${shown}`);
      return null;
    }
  };
}

/**
 * Poll the Compute Engine task until it leaves PENDING/IN_PROGRESS, so the
 * measures read afterwards belong to the analysis just submitted.
 * Returns SUCCESS | FAILED | CANCELED | TIMEOUT.
 */
export async function waitForCeTask(getJson, ceTaskUrl, {
  timeoutMs, pollMs = POLL_INTERVAL_MS, log = console.log,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = Date.now,
}) {
  const start = now();
  for (;;) {
    const status = (await getJson(ceTaskUrl))?.task?.status ?? 'UNKNOWN';
    const elapsed = Math.round((now() - start) / 1000);
    log(`    Status: ${status} (${elapsed}s elapsed)`);
    if (['SUCCESS', 'FAILED', 'CANCELED'].includes(status)) return status;
    if (now() - start + pollMs > timeoutMs) return 'TIMEOUT';
    await sleep(pollMs);
  }
}

/** Apply the rule. Pure: no I/O. */
export function evaluateCoverage({ current, base, tolerance, minimum }) {
  if (current === null || current === undefined) return { verdict: 'no-current' };
  if (current < minimum) return { verdict: 'below-minimum' };
  if (base === null || base === undefined) return { verdict: 'no-base' };
  const minRequired = base - tolerance;
  if (current < minRequired) return { verdict: 'decreased', minRequired, short: minRequired - current };
  return { verdict: 'ok', minRequired };
}

const f2 = (n) => n.toFixed(2);

/**
 * Turn a verdict into output lines and an exit code. The push-context text is
 * the one run-sonar.sh has always printed; ci swaps the push-only hints.
 */
export function formatResult(result, { current, base, tolerance, minimum, label, baseBranch, context }) {
  const ci = context === 'ci';
  const again = ci ? 'then push again.' : 'then re-push.';
  const bypass = ci ? [] : ["   Bypass with 'git push --no-verify' (WIP only)."];
  switch (result.verdict) {
    case 'no-current':
      return ci
        ? { exitCode: 1, lines: [`\n❌ COVERAGE NOT EVALUATED — could not read the coverage of ${label} from Sonar.`],
          annotation: `Could not read the coverage of ${label} from Sonar.` }
        : { exitCode: 0, lines: ["    SKIPPED ⚠️  Could not read this branch's coverage from Sonar — not blocking."] };
    case 'below-minimum':
      return {
        exitCode: 1,
        lines: [
          `    ${label} coverage: ${f2(current)}%`,
          `\n❌ COVERAGE BELOW MINIMUM — ${f2(current)}% < ${f2(minimum)}% required.`,
          `   Add tests until overall coverage reaches the minimum, ${again}`,
          ...bypass,
        ],
        annotation: `Coverage ${f2(current)}% is below the ${f2(minimum)}% minimum.`,
      };
    case 'no-base':
      return {
        exitCode: 0,
        lines: [`    SKIPPED ⚠️  No coverage on Sonar for '${baseBranch}' yet — not blocking `
          + '(matches CI, which treats a missing baseline as 0%).'],
      };
    case 'decreased':
      return {
        exitCode: 1,
        lines: [
          `    ${label} coverage: ${f2(current)}%`,
          `    ${baseBranch} coverage: ${f2(base)}% (min required with ${f2(tolerance)}pp tolerance: ${f2(result.minRequired)}%)`,
          ci
            ? `\n❌ COVERAGE DECREASED — ${label} lowers overall coverage beyond the tolerance.`
            : "\n❌ COVERAGE DECREASED — this push would fail Jenkins' 'Compare Coverage Results'.",
          `   ${f2(current)}% < ${f2(result.minRequired)}% (base ${f2(base)}% − ${f2(tolerance)}pp) on '${baseBranch}' (short ${f2(result.short)}pp).`,
          `   Add tests until overall coverage is >= the base (minus tolerance), ${again}`,
          ...bypass,
        ],
        annotation: `Coverage ${f2(current)}% < ${f2(result.minRequired)}% `
          + `(${baseBranch} ${f2(base)}% − ${f2(tolerance)}pp tolerance).`,
      };
    default:
      return {
        exitCode: 0,
        lines: [
          `    ${label} coverage: ${f2(current)}%`,
          `    ${baseBranch} coverage: ${f2(base)}% (min required with ${f2(tolerance)}pp tolerance: ${f2(result.minRequired)}%)`,
          '    Coverage is OK ✅ (not below base − tolerance, and above the minimum).',
        ],
      };
  }
}

/** CI-only failure that is not a threshold verdict (missing task file, task FAILED, timeout). */
function toolingFailure(opts, message, log) {
  if (opts.context !== 'ci') {
    log(`    SKIPPED ⚠️  ${message} — not blocking.`);
    return 0;
  }
  log(`\n❌ COVERAGE NOT EVALUATED — ${message}.`);
  log(`::error title=Coverage gate::${message}`);
  return 1;
}

export async function main(argv = process.argv.slice(2), env = process.env, deps = {}) {
  const log = deps.log ?? console.log;
  const warn = deps.warn ?? console.error;
  let opts;
  let thresholds;
  try {
    opts = parseArgs(argv);
    thresholds = resolveThresholds(env);
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    warn(`ERROR: ${err.message}`);
    return 1;
  }
  if (!env.SONAR_HOST_URL || !env.SONAR_TOKEN) {
    warn('ERROR: SONAR_HOST_URL and SONAR_TOKEN must be set');
    return 1;
  }
  let projectKey = opts.projectKey;
  if (!projectKey) {
    const propsPath = resolve(REPO_ROOT, 'sonar-project.properties');
    projectKey = existsSync(propsPath) ? readProjectKey(readFileSync(propsPath, 'utf8')) : null;
    if (!projectKey) {
      warn(`ERROR: sonar.projectKey not found in ${propsPath}`);
      return 1;
    }
  }

  const getJson = createSonarClient({
    hostUrl: env.SONAR_HOST_URL, token: env.SONAR_TOKEN, fetchImpl: deps.fetchImpl, warn,
  });

  if (opts.reportTask) {
    if (!existsSync(opts.reportTask)) {
      return toolingFailure(opts, `${opts.reportTask} not found (did the scanner run?)`, log);
    }
    const task = parseReportTask(readFileSync(opts.reportTask, 'utf8'));
    if (!task.ceTaskUrl) {
      return toolingFailure(opts, `no ceTaskUrl in ${opts.reportTask}`, log);
    }
    if (!isSameOrigin(task.ceTaskUrl, env.SONAR_HOST_URL)) {
      return toolingFailure(opts,
        `ceTaskUrl in ${opts.reportTask} does not point to SONAR_HOST_URL (refusing to send the token)`, log);
    }
    log(`==> Waiting for Sonar to process analysis ${task.ceTaskId ?? task.ceTaskUrl} ...`);
    const status = await waitForCeTask(getJson, task.ceTaskUrl, {
      timeoutMs: opts.waitTimeout * 1000, log, sleep: deps.sleep, now: deps.now,
    });
    if (status !== 'SUCCESS') {
      return toolingFailure(opts, status === 'TIMEOUT'
        ? `Sonar did not process the analysis within ${opts.waitTimeout}s`
        : `Sonar analysis ${status}`, log);
    }
  }

  const project = encodeURIComponent(projectKey);
  let currentQuery = '';
  if (opts.pullRequest) currentQuery = `&pullRequest=${encodeURIComponent(opts.pullRequest)}`;
  else if (opts.branch) currentQuery = `&branch=${encodeURIComponent(opts.branch)}`;
  const current = readMetric(
    await getJson(`/api/measures/component?component=${project}&metricKeys=coverage${currentQuery}`),
    'coverage');
  const base = readMetric(
    await getJson(`/api/measures/component?component=${project}&branch=${encodeURIComponent(opts.baseBranch)}&metricKeys=coverage`),
    'coverage');

  const ctx = { current, base, ...thresholds, label: opts.label, baseBranch: opts.baseBranch, context: opts.context };
  const out = formatResult(evaluateCoverage(ctx), ctx);
  out.lines.forEach((line) => log(line));
  if (opts.context === 'ci' && out.exitCode !== 0 && out.annotation) {
    log(`::error title=Coverage gate::${out.annotation}`);
  }
  return out.exitCode;
}

export function isEntryPoint(metaUrl, argv1 = process.argv[1]) {
  return Boolean(argv1) && resolve(argv1) === fileURLToPath(metaUrl);
}

if (isEntryPoint(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }, (err) => {
    console.error(`ERROR: ${err.stack || err.message}`);
    process.exitCode = 1;
  });
}
