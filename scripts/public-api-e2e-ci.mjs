#!/usr/bin/env node
// Runs the public API end-to-end suite (gateway/e2e) against a running NEO, unattended — the
// form the full Jenkins pipelines use. See docs/public-api.md §4.9 "Running the suite in CI".
//
//   node scripts/public-api-e2e-ci.mjs install   (make public-api-e2e-ci-install)
//     Installs and builds gateway/ with @etendosoftware/api-gateway-core taken from the
//     schema_forge_core tag this repo pins — the package is not published, so it is packed from
//     source by scripts/lib/pack-gateway-core.mjs, the sequence deploy-public-api.yml uses too.
//     A second call with the same pin skips the dependencies and only rebuilds gateway/.
//
//   node scripts/public-api-e2e-ci.mjs run       (make public-api-e2e-ci)
//     1. signs in to NEO with an account's email + password and enters the environment it owns
//        (cookie session + CSRF token, the SPA's own flow);
//     2. deletes active e2e-ci-* keys a previous run left behind, then creates two API keys
//        through /oauth2/api-keys with a per-run name: read+write, and read;
//     3. starts the built gateway against that NEO on a free localhost port with a high rate
//        limit and waits for /healthz;
//     4. runs `npm run test:e2e` with PUBLIC_API_BASE_URL / PUBLIC_API_KEY / PUBLIC_API_KEY_READONLY;
//     5. always stops the suite and the gateway, deletes both keys and closes the session;
//     6. exits with the suite's status (1 when the setup itself failed).
//
// Never prints a password, a session cookie, a CSRF token or a client secret.
import { execFileSync, spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { packGatewayCore } from './lib/pack-gateway-core.mjs';

const REPO_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GATEWAY_DIR = join(REPO_DIR, 'gateway');
const CORE_PACKAGE = '@etendosoftware/schema-forge-core';
const CORE_PACKAGE_PATH = 'packages/api-gateway-core';
const DEFAULT_CORE_REPO = 'git@github.com:etendosoftware/schema_forge_core.git';
const INSTALL_STAMP = join(GATEWAY_DIR, 'node_modules', '.public-api-e2e-ci-core');
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const FULL_CAPABILITIES = ['public-api:read', 'public-api:write'];
const READONLY_CAPABILITIES = ['public-api:read'];
const HEALTH_TIMEOUT_MS = 60_000;
const REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_RUN_TIMEOUT_MINUTES = 30;

const log = (message) => console.log(`[public-api-e2e-ci] ${message}`);

// ---------------------------------------------------------------- pure helpers (unit-tested)

/** The exact x.y.z pin of schema_forge_core in package.json; a range has no single tag. */
export function pinnedCoreVersion(packageJson) {
  const version = packageJson?.dependencies?.[CORE_PACKAGE] ?? packageJson?.devDependencies?.[CORE_PACKAGE];
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`${CORE_PACKAGE} pin in package.json is '${version}', expected an exact x.y.z (it is the core's git tag)`);
  }
  return version;
}

/**
 * The account to sign in with: PUBLIC_API_E2E_EMAIL + PUBLIC_API_E2E_PASSWORD, or
 * PUBLIC_API_E2E_CREDENTIALS_FILE (the `{ email, password }` JSON Playwright's onboarding writes).
 */
export function resolveCredentials(env, readFile = (path) => readFileSync(path, 'utf8')) {
  const email = env.PUBLIC_API_E2E_EMAIL?.trim();
  if (email) {
    if (!env.PUBLIC_API_E2E_PASSWORD) throw new Error('PUBLIC_API_E2E_EMAIL is set but PUBLIC_API_E2E_PASSWORD is not');
    return { email, password: env.PUBLIC_API_E2E_PASSWORD };
  }
  const file = env.PUBLIC_API_E2E_CREDENTIALS_FILE?.trim();
  if (!file) {
    throw new Error('Set PUBLIC_API_E2E_EMAIL + PUBLIC_API_E2E_PASSWORD, or PUBLIC_API_E2E_CREDENTIALS_FILE ({ "email", "password" })');
  }
  let parsed;
  try {
    parsed = JSON.parse(readFile(file));
  } catch (error) {
    throw new Error(`Cannot read the credentials file ${file}: ${error.code ?? error.message}`);
  }
  if (typeof parsed?.email !== 'string' || !parsed.email || typeof parsed?.password !== 'string' || !parsed.password) {
    throw new Error(`The credentials file ${file} has no email/password pair`);
  }
  return { email: parsed.email, password: parsed.password };
}

/** NEO base URL without trailing slash; a non-local host needs PUBLIC_API_E2E_ALLOW_REMOTE=1. */
export function resolveNeoBaseUrl(env) {
  const raw = (env.NEO_BASE_URL?.trim() || 'http://localhost:8080/etendo').replace(/\/+$/, '');
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`NEO_BASE_URL is not a valid URL: ${raw}`);
  }
  if (!LOCAL_HOSTS.has(url.hostname) && env.PUBLIC_API_E2E_ALLOW_REMOTE !== '1') {
    throw new Error(`Refusing to run against NEO host "${url.hostname}": the suite creates and deletes records. `
      + 'Only localhost / 127.0.0.1 unless PUBLIC_API_E2E_ALLOW_REMOTE=1.');
  }
  return raw;
}

/** The `name=value` pairs of every Set-Cookie header of a response (attributes dropped). */
export function setCookiePairs(headers) {
  const lines = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    // Older runtimes fold the headers into one value; a comma followed by `name=` starts a new cookie.
    : (headers.get('set-cookie') ?? '').split(/,(?=\s*[^;,=\s]+=)/);
  return lines
    .map((line) => line.split(';', 1)[0].trim())
    .filter((pair) => pair.includes('='))
    .map((pair) => {
      const at = pair.indexOf('=');
      return [pair.slice(0, at).trim(), pair.slice(at + 1).trim()];
    });
}

/** Minimal cookie jar: later Set-Cookie replace earlier ones, an empty value (Max-Age=0) removes. */
export class CookieJar {
  #cookies = new Map();

  update(headers) {
    for (const [name, value] of setCookiePairs(headers)) {
      if (value) this.#cookies.set(name, value); else this.#cookies.delete(name);
    }
  }

  get size() { return this.#cookies.size; }

  header() {
    return [...this.#cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }
}

/**
 * The environment to enter: the first one the account OWNS, else the first one (what the SPA
 * enters after login). Owned first because an account can also be invited into another tenant —
 * the Playwright invitation spec does exactly that to the second onboarding account — and this
 * run must stay in its own tenant.
 */
export function pickEnvironment(body) {
  const environments = (Array.isArray(body?.environments) ? body.environments : [])
    .filter((environment) => typeof environment?.adminUserId === 'string' && environment.adminUserId);
  const chosen = environments.find((environment) => environment.relationship === 'OWNER') ?? environments[0];
  if (!chosen) throw new Error('The account has no environment to enter (GET /sws/go/environments returned none)');
  return chosen;
}

/** A per-run key name: unique, recognisable as CI leftovers, within the 120-character limit. */
export function keyName(runId, label) {
  return `e2e-ci-${runId}-${label}`.slice(0, 120);
}

/** Variables a child process inherits, by exact name or prefix; everything else is dropped. */
const INHERITED_VARS = new Set(['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'TZ', 'CI', 'USER', 'SHELL']);
const INHERITED_PREFIXES = ['NODE_', 'npm_config_', 'NPM_CONFIG_', 'PUBLIC_API_'];
/** The account this script signs in with: never handed to the gateway or the suite. */
const WITHHELD_VARS = new Set(['PUBLIC_API_E2E_EMAIL', 'PUBLIC_API_E2E_PASSWORD', 'PUBLIC_API_E2E_CREDENTIALS_FILE']);

/**
 * Minimal environment for the gateway and the suite: the allowlist above plus `extra` (which wins).
 * Keeps unrelated CI secrets (tokens, cloud keys) out of both processes.
 */
export function childEnv(env, extra = {}) {
  const picked = {};
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined || WITHHELD_VARS.has(name)) continue;
    if (INHERITED_VARS.has(name) || INHERITED_PREFIXES.some((prefix) => name.startsWith(prefix))) picked[name] = value;
  }
  return { ...picked, ...extra };
}

/** Active keys named e2e-ci-* that a previous (crashed or cancelled) run did not delete. */
export function leftoverKeys(body, runId) {
  const keys = Array.isArray(body?.apiKeys) ? body.apiKeys : [];
  return keys.filter((key) => key?.isActive !== false
    && typeof key?.id === 'string'
    && typeof key?.name === 'string'
    && key.name.startsWith('e2e-ci-')
    && !key.name.startsWith(`e2e-ci-${runId}-`));
}

/** Overall limit of `run`, in minutes: PUBLIC_API_E2E_TIMEOUT_MINUTES (a positive number) or 30. */
export function runTimeoutMinutes(env) {
  const raw = env.PUBLIC_API_E2E_TIMEOUT_MINUTES?.trim();
  if (!raw) return DEFAULT_RUN_TIMEOUT_MINUTES;
  const minutes = Number(raw);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new Error(`PUBLIC_API_E2E_TIMEOUT_MINUTES must be a positive number of minutes, got '${raw}'`);
  }
  return minutes;
}

/** NODE_OPTIONS for the suite: spec to stdout, plus JUnit XML when a destination is given. */
export function reporterNodeOptions(existing, junitFile) {
  const flags = junitFile
    ? ['--test-reporter=spec', '--test-reporter-destination=stdout', '--test-reporter=junit', `--test-reporter-destination=${junitFile}`]
    : [];
  return [existing?.trim(), ...flags].filter(Boolean).join(' ');
}

/**
 * Sends `send()` again while it answers 401, at most `retries` more times, `delayMs` apart; any other
 * answer (or a thrown error) is returned/raised at once. Only for the first request after a session
 * is issued or rotated: resolving a not-yet-committed token is read-only, so the retry is safe.
 */
// shortcut: GO answers before committing the session (ETP-6152), drop this retry once that fix is in develop
export async function retryOn401(send, { retries = 3, delayMs = 500, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let res = await send();
  for (let attempt = 0; res.status === 401 && attempt < retries; attempt += 1) {
    await sleep(delayMs);
    res = await send();
  }
  return res;
}

// ---------------------------------------------------------------- install

function sh(command, args, options = {}) {
  execFileSync(command, args, { stdio: 'inherit', ...options });
}

function install() {
  const version = pinnedCoreVersion(JSON.parse(readFileSync(join(REPO_DIR, 'package.json'), 'utf8')));
  const stamp = existsSync(INSTALL_STAMP) ? readFileSync(INSTALL_STAMP, 'utf8').trim() : '';
  if (stamp === version) {
    // Dependencies are current; the build is cheap and follows gateway/src, so it always runs.
    log(`gateway dependencies already installed with api-gateway-core from core ${version}`);
    sh('npm', ['run', 'build'], { cwd: GATEWAY_DIR });
    return;
  }
  const work = mkdtempSync(join(tmpdir(), 'public-api-e2e-ci-'));
  try {
    const sourceDir = join(work, 'api-gateway-core');
    const coreDir = process.env.PUBLIC_API_CORE_DIR?.trim();
    if (coreDir) {
      // Read-only on that checkout: the pinned tag's tree is exported, the working tree is untouched.
      log(`exporting ${CORE_PACKAGE_PATH} at tag ${version} from ${coreDir}`);
      const tar = join(work, 'core.tar');
      sh('git', ['-C', coreDir, 'archive', '--format=tar', '-o', tar, version, CORE_PACKAGE_PATH]);
      sh('tar', ['-xf', tar, '-C', work]);
      sh('mv', [join(work, CORE_PACKAGE_PATH), sourceDir]);
    } else {
      const repo = process.env.PUBLIC_API_CORE_REPO?.trim() || DEFAULT_CORE_REPO;
      log(`cloning schema_forge_core at tag ${version}`);
      sh('git', ['clone', '--quiet', '--depth', '1', '--branch', version, repo, join(work, 'core')]);
      sh('mv', [join(work, 'core', CORE_PACKAGE_PATH), sourceDir]);
    }
    packGatewayCore({ coreSourceDir: sourceDir, gatewayDir: GATEWAY_DIR, workDir: work, build: true });
    writeFileSync(INSTALL_STAMP, `${version}\n`);
    log(`gateway installed and built with api-gateway-core from core ${version}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- run

async function request(url, { method = 'GET', jar, csrf, origin, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (jar?.size) headers.Cookie = jar.header();
  if (csrf) headers['X-Go-CSRF'] = csrf;
  if (origin) headers.Origin = origin;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  jar?.update(res.headers);
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : undefined; } catch { json = undefined; }
  return { status: res.status, json, text };
}

/** Error text for a failed call: status plus the server's message, never a request header. */
function failure(what, res) {
  if (res.json?.clientSecret) return new Error(`${what} answered ${res.status}`); // never echo a secret
  const detail = res.json?.error_description ?? res.json?.error?.message ?? res.json?.message ?? res.json?.error ?? res.text?.slice(0, 200);
  return new Error(`${what} answered ${res.status}${detail ? `: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

async function waitForHealth(baseUrl, gateway) {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (gateway.exitCode !== null) throw new Error(`the gateway exited with code ${gateway.exitCode} before answering /healthz`);
    try {
      const res = await fetch(`${baseUrl}/healthz`, { signal: AbortSignal.timeout(2_000) });
      if (res.ok) return;
    } catch { /* not listening yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`the gateway did not answer /healthz within ${HEALTH_TIMEOUT_MS / 1000}s`);
}

/** SIGTERM, then SIGKILL after 5 s. `group` signals the child's whole process group (detached). */
function stopProcess(child, { group = false } = {}) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  const signal = (name) => {
    try {
      if (group) process.kill(-child.pid, name); else child.kill(name);
    } catch { /* already gone */ }
  };
  return new Promise((done) => {
    const kill = setTimeout(() => signal('SIGKILL'), 5_000);
    child.once('exit', () => { clearTimeout(kill); done(); });
    signal('SIGTERM');
  });
}

async function run() {
  const env = process.env;
  const neo = resolveNeoBaseUrl(env);
  const origin = new URL(neo).origin; // same-origin always passes the session's Origin check
  const credentials = resolveCredentials(env);
  const resultsDir = resolve(env.PUBLIC_API_E2E_RESULTS_DIR?.trim() || join(GATEWAY_DIR, 'e2e-results'));
  const junitFile = env.PUBLIC_API_E2E_JUNIT === '0' ? undefined : join(resultsDir, 'junit.xml');
  const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const timeoutMinutes = runTimeoutMinutes(env);
  mkdirSync(resultsDir, { recursive: true });
  if (!existsSync(join(GATEWAY_DIR, 'dist', 'main.js'))) {
    throw new Error('gateway/dist/main.js not found: run `make public-api-e2e-ci-install` first');
  }

  const jar = new CookieJar();
  const keys = [];
  let csrf;
  let gateway;
  let logStream;
  let suite;
  let cleaningUp;

  const cleanup = () => {
    cleaningUp ??= (async () => {
      // The suite first: it must not keep calling the gateway (or create records) while the keys go.
      await stopProcess(suite, { group: true });
      await stopProcess(gateway);
      if (logStream) await new Promise((done) => logStream.end(done));
      for (const key of keys) {
        try {
          const res = await request(`${neo}/oauth2/api-keys/${encodeURIComponent(key.id)}`, { method: 'DELETE', jar, csrf, origin });
          if (res.status === 200 && res.json?.deleted === true) log(`deleted API key ${key.clientId}`);
          else console.error(`[public-api-e2e-ci] could not delete API key ${key.clientId} (${key.name}): ${failure('DELETE', res).message}`);
        } catch (error) {
          console.error(`[public-api-e2e-ci] could not delete API key ${key.clientId} (${key.name}): ${error.message}`);
        }
      }
      if (jar.size) {
        await request(`${neo}/sws/go/session`, { method: 'DELETE', jar, csrf, origin }).catch(() => {});
      }
    })();
    return cleaningUp;
  };
  // A cancelled build stops the pipeline with SIGTERM: clean up before leaving.
  for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
    process.once(signal, () => { cleanup().finally(() => process.exit(code)); });
  }
  // Overall bound: a hung NEO, gateway or suite must not hold the pipeline. Same cleanup as a signal.
  const killTimer = setTimeout(() => {
    console.error(`[public-api-e2e-ci] timed out after ${timeoutMinutes} min (PUBLIC_API_E2E_TIMEOUT_MINUTES): `
      + 'stopping the suite and the gateway and deleting the keys');
    cleanup().finally(() => process.exit(124));
  }, timeoutMinutes * 60_000);

  try {
    log(`signing in to ${neo}`);
    const session = await request(`${neo}/sws/go/session`, { method: 'POST', jar, origin, body: credentials });
    if (session.status !== 200 || !session.json?.csrfToken) throw failure('POST /sws/go/session', session);
    csrf = session.json.csrfToken;

    const environments = await retryOn401(() => request(`${neo}/sws/go/environments`, { jar, origin }));
    if (environments.status !== 200) throw failure('GET /sws/go/environments', environments);
    const environment = pickEnvironment(environments.json);
    const entered = await request(`${neo}/sws/go/session/environment`, {
      method: 'POST', jar, csrf, origin,
      body: {
        userId: environment.adminUserId,
        ...(environment.roleId ? { roleId: environment.roleId } : {}),
        ...(environment.orgId ? { orgId: environment.orgId } : {}),
      },
    });
    if (entered.status !== 200 || !entered.json?.csrfToken) throw failure('POST /sws/go/session/environment', entered);
    csrf = entered.json.csrfToken; // entering rotates the session and its CSRF token
    log(`entered environment "${environment.clientName ?? environment.clientId}"`);

    // A cancelled or crashed run can leave its keys behind; the owner may hold only 10 active ones.
    const existing = await retryOn401(() => request(`${neo}/oauth2/api-keys`, { jar, origin }));
    if (existing.status !== 200) throw failure('GET /oauth2/api-keys', existing);
    for (const stale of leftoverKeys(existing.json, runId)) {
      const res = await request(`${neo}/oauth2/api-keys/${encodeURIComponent(stale.id)}`, { method: 'DELETE', jar, csrf, origin });
      if (res.status === 200 && res.json?.deleted === true) log(`deleted leftover API key ${stale.clientId} (${stale.name})`);
      else console.error(`[public-api-e2e-ci] could not delete leftover API key ${stale.clientId} (${stale.name}): ${failure('DELETE', res).message}`);
    }

    for (const [label, capabilities] of [['full', FULL_CAPABILITIES], ['readonly', READONLY_CAPABILITIES]]) {
      const name = keyName(runId, label);
      const created = await request(`${neo}/oauth2/api-keys`, { method: 'POST', jar, csrf, origin, body: { name, capabilities } });
      // Registered for deletion before anything is checked: a key the server made must not outlive the run.
      if (typeof created.json?.id === 'string') {
        keys.push({ id: created.json.id, name, clientId: created.json.clientId, secret: created.json.clientSecret });
      }
      if (created.status === 409) {
        const error = failure(`POST /oauth2/api-keys (${label})`, created);
        error.message += ' — the account already holds 10 active API keys or one with this name;'
          + ' leftover e2e-ci-* keys were deleted above, so the rest belong to someone else: free some in the account';
        throw error;
      }
      if (created.status !== 201 || !created.json?.clientSecret) throw failure(`POST /oauth2/api-keys (${label})`, created);
      log(`created API key ${created.json.clientId} [${capabilities.join(', ')}] (secret withheld)`);
    }

    const port = Number(env.PUBLIC_API_E2E_GATEWAY_PORT) || await freePort();
    const gatewayUrl = `http://127.0.0.1:${port}`;
    const gatewayLog = join(resultsDir, 'gateway.log');
    logStream = createWriteStream(gatewayLog);
    gateway = spawn(process.execPath, ['dist/main.js'], {
      cwd: GATEWAY_DIR,
      env: childEnv(env, {
        NODE_OPTIONS: '',
        GATEWAY_PORT: String(port),
        NEO_BASE_URL: neo,
        // The suite measures the API, not the throttle: lift the per-key limit far above its volume.
        PUBLIC_API_RATE_LIMIT: env.PUBLIC_API_RATE_LIMIT || '100000',
        PUBLIC_API_RATE_WINDOW_SECONDS: env.PUBLIC_API_RATE_WINDOW_SECONDS || '60',
      }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    gateway.stdout.pipe(logStream);
    gateway.stderr.pipe(logStream);
    log(`starting the gateway on ${gatewayUrl} (log: ${gatewayLog})`);
    await waitForHealth(gatewayUrl, gateway);

    const [full, readonly] = keys;
    log('running the end-to-end suite');
    // Own process group (detached) so cleanup can stop npm, tsx and every test process at once.
    suite = spawn('npm', ['run', 'test:e2e'], {
      cwd: GATEWAY_DIR,
      stdio: 'inherit',
      detached: true,
      env: childEnv(env, {
        NODE_OPTIONS: reporterNodeOptions(env.NODE_OPTIONS, junitFile),
        PUBLIC_API_BASE_URL: gatewayUrl,
        PUBLIC_API_KEY: `${full.clientId}:${full.secret}`,
        PUBLIC_API_KEY_READONLY: `${readonly.clientId}:${readonly.secret}`,
      }),
    });
    const status = await new Promise((done) => suite.once('exit', (code, signal) => done(code ?? (signal ? 1 : 0))));
    log(status === 0 ? 'suite passed' : `suite failed (exit ${status})${junitFile ? ` — JUnit: ${junitFile}` : ''}`);
    return status;
  } finally {
    clearTimeout(killTimer);
    await cleanup();
  }
}

// ---------------------------------------------------------------- entry point

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const command = process.argv[2] ?? 'run';
  try {
    if (command === 'install') {
      install();
    } else if (command === 'run') {
      process.exitCode = await run();
    } else {
      throw new Error(`unknown command "${command}" (expected: install | run)`);
    }
  } catch (error) {
    console.error(`[public-api-e2e-ci] ${error.message}`);
    process.exitCode = 1;
  }
}
