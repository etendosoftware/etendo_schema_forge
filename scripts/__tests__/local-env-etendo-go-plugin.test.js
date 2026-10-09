// @covers local-env.d/plugins/etendo-go
//
// Drives the local-env plugin the way local-env does — `<plugin> <hook>` with the
// LOCALENV_* environment — against a throwaway ETENDO_ROOT. `up` reaches the public URL
// alignment before it looks at the SPA, so a live fake SPA pid makes it return
// ("already running") without starting anything.
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'local-env.d', 'plugins', 'etendo-go');

const GRADLE = 'gradle.properties';
const CONFIG = 'config/Openbravo.properties';
const WEBCONTENT = 'WebContent/WEB-INF/Openbravo.properties';
const DEPLOYED = 'build/local-env/catalina/webapps/etendo/WEB-INF/Openbravo.properties';
const ESCAPED_FILES = [CONFIG, WEBCONTENT, DEPLOYED];
const ALL_FILES = [GRADLE, ...ESCAPED_FILES];

const plainProps = (mcp, oauth) =>
  `bbdd.sid=etendo\netgo.mcp.public.url=${mcp}\netgo.oauth2.public.url=${oauth}\nother.url=http://localhost:3100\n`;

let fakeSpa;
let root;
let env;

function write(rel, content) {
  const path = join(env, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

const read = (rel) => readFileSync(join(env, rel), 'utf8');

// Every file at :3100, the way a worktree copies them from the main checkout.
function writeCopiedFromMain() {
  write(GRADLE, plainProps('http://localhost:3100/mcp', 'http://localhost:3100'));
  for (const rel of ESCAPED_FILES) {
    write(rel, plainProps('http\\://localhost\\:3100/mcp', 'http\\://localhost\\:3100/oauth2'));
  }
}

function snapshot() {
  return Object.fromEntries(ALL_FILES.map((rel) => [rel, read(rel)]));
}

function runHook(hook, { spaPort, tomcat = '0', envFile } = {}) {
  const state = join(env, 'build', 'local-env');
  if (envFile !== undefined) writeFileSync(join(state, 'env'), envFile);
  const vars = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    ETENDO_ROOT: env,
    LOCALENV_STATE: state,
    LOCALENV_PLUGIN_STATE: join(state, 'plugins', 'etendo-go'),
    LOCALENV_WORKTREES: join(root, 'worktrees'),
    LOCALENV_URL: 'http://localhost:8199/etendo',
    LOCALENV_TOMCAT: tomcat,
  };
  if (spaPort !== undefined) {
    vars.SPA_PORT = String(spaPort);
    vars.BFF_PORT = '3499';
  }
  const res = spawnSync('bash', [PLUGIN, hook], { env: vars, encoding: 'utf8' });
  assert.equal(res.status, 0, `${hook} exited ${res.status}: ${res.stderr}`);
  return { stdout: res.stdout, stderr: res.stderr, all: res.stdout + res.stderr };
}

const up = (spaPort, opts = {}) => runHook('up', { spaPort, ...opts });

before(() => {
  // a live process that is not a SPA: `up` sees it as already running and returns
  fakeSpa = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' });
  fakeSpa.unref();
});

after(() => {
  try { process.kill(fakeSpa.pid); } catch { /* already gone */ }
});

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'local-env-etendo-go-'));
  env = join(root, 'env');
  mkdirSync(join(env, 'modules', 'com.etendoerp.go'), { recursive: true });
  mkdirSync(join(env, 'schema_forge'), { recursive: true });
  mkdirSync(join(env, 'schema_forge_core', 'packages', 'app-shell-core', 'src'), { recursive: true });
  mkdirSync(join(root, 'worktrees'), { recursive: true });
  const pluginState = join(env, 'build', 'local-env', 'plugins', 'etendo-go');
  mkdirSync(pluginState, { recursive: true });
  writeFileSync(join(pluginState, 'spa.pid'), `${fakeSpa.pid}\n`);
  // origins already allowed: keeps add_origins quiet so only the alignment speaks
  writeFileSync(
    join(env, 'build', 'local-env', 'env'),
    'export ETGO_ALLOWED_ORIGINS=http://localhost:3105,http://127.0.0.1:3105\n',
  );
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('etendo-go plugin: MCP / OAuth public URL alignment on up', () => {
  it('rewrites localhost:3100 to the SPA port in all four files, each with its own escaping', () => {
    writeCopiedFromMain();

    up(3105);

    assert.equal(read(GRADLE), plainProps('http://localhost:3105/mcp', 'http://localhost:3105'));
    for (const rel of ESCAPED_FILES) {
      assert.equal(
        read(rel),
        plainProps('http\\://localhost\\:3105/mcp', 'http\\://localhost\\:3105'),
        `${rel}: escaped, /mcp kept on the MCP URL, /oauth2 dropped from the OAuth URL`,
      );
    }
  });

  it('leaves every file byte-identical when the values already point at the SPA port', () => {
    write(GRADLE, plainProps('http://localhost:3105/mcp', 'http://localhost:3105'));
    for (const rel of ESCAPED_FILES) {
      write(rel, plainProps('http\\://localhost\\:3105/mcp', 'http\\://localhost\\:3105'));
    }
    const beforeRun = snapshot();

    const out = up(3105);

    assert.deepEqual(snapshot(), beforeRun);
    assert.doesNotMatch(out.all, /public\.url/);
  });

  it('keeps a custom host and a 127.0.0.1 value', () => {
    write(GRADLE, plainProps('https://go.example.com/mcp', 'http://127.0.0.1:3100'));
    write(CONFIG, plainProps('https\\://go.example.com/mcp', 'http\\://127.0.0.1\\:3100'));
    const gradleBefore = read(GRADLE);
    const configBefore = read(CONFIG);

    up(3105);

    assert.equal(read(GRADLE), gradleBefore);
    assert.equal(read(CONFIG), configBefore);
  });

  it('does not add an absent property', () => {
    write(GRADLE, 'bbdd.sid=etendo\nother.url=http://localhost:3100\n');
    write(CONFIG, 'etgo.mcp.public.url=http\\://localhost\\:3100/mcp\n');

    up(3105);

    assert.equal(read(GRADLE), 'bbdd.sid=etendo\nother.url=http://localhost:3100\n');
    assert.equal(read(CONFIG), 'etgo.mcp.public.url=http\\://localhost\\:3105/mcp\n', 'no oauth2 line added');
  });

  it('is a no-op when SPA_PORT is 3100', () => {
    writeCopiedFromMain();
    write(GRADLE, plainProps('http://localhost:3105/mcp', 'http://localhost:3105'));
    const beforeRun = snapshot();

    const out = up(3100);

    assert.deepEqual(snapshot(), beforeRun);
    assert.doesNotMatch(out.all, /public\.url/);
  });

  it('keeps the carriage return of CRLF lines', () => {
    write(
      CONFIG,
      'bbdd.sid=etendo\r\netgo.mcp.public.url=http\\://localhost\\:3100/mcp\r\netgo.oauth2.public.url=http\\://localhost\\:3100\r\n',
    );

    up(3105);

    assert.equal(
      read(CONFIG),
      'bbdd.sid=etendo\r\netgo.mcp.public.url=http\\://localhost\\:3105/mcp\r\netgo.oauth2.public.url=http\\://localhost\\:3105\r\n',
    );
  });

  it('keeps the spacing around "=" of the rewritten line', () => {
    write(GRADLE, 'etgo.mcp.public.url = http://localhost:3100/mcp\n');

    up(3105);

    assert.equal(read(GRADLE), 'etgo.mcp.public.url = http://localhost:3105/mcp\n');
  });

  it('is idempotent: a second run leaves the files as the first one did', () => {
    writeCopiedFromMain();

    up(3105);
    const afterFirst = snapshot();
    up(3105);

    assert.deepEqual(snapshot(), afterFirst);
  });

  it('warns to restart an already-running Tomcat when LOCALENV_TOMCAT=0', () => {
    writeCopiedFromMain();

    const out = up(3105, { tomcat: '0' });

    assert.match(out.stderr, /^WARNING: pointed etgo\.mcp\.public\.url \/ etgo\.oauth2\.public\.url at :3105 in .*restart it once/m);
    for (const rel of ALL_FILES) assert.ok(out.stderr.includes(join(env, rel)), `message lists ${rel}`);
    assert.doesNotMatch(out.stdout, /public\.url/);
  });

  it('prints an informational line when the Tomcat is starting now (LOCALENV_TOMCAT=1)', () => {
    writeCopiedFromMain();

    const out = up(3105, { tomcat: '1' });

    assert.match(
      out.stdout,
      /^>> Pointed etgo\.mcp\.public\.url \/ etgo\.oauth2\.public\.url at :3105 in .*\(the Tomcat starting now picks them up\)$/m,
    );
    assert.doesNotMatch(out.stderr, /public\.url/);
  });

  it('says nothing about the alignment on a second up', () => {
    writeCopiedFromMain();

    up(3105);
    const second = up(3105);

    assert.doesNotMatch(second.all, /public\.url/);
  });
});

describe('etendo-go plugin: MCP / OAuth public URL alignment on worktree-create', () => {
  it('points the public URLs at the SPA port it reserves', () => {
    writeCopiedFromMain();

    const out = runHook('worktree-create', { envFile: '' });

    const reserved = readFileSync(join(env, 'build', 'local-env', 'env'), 'utf8').match(/^export SPA_PORT=(\d+)$/m)?.[1];
    assert.ok(reserved && reserved !== '3100', `a non-main SPA port was reserved (${reserved})`);
    assert.equal(read(GRADLE), plainProps(`http://localhost:${reserved}/mcp`, `http://localhost:${reserved}`));
    for (const rel of ESCAPED_FILES) {
      assert.equal(read(rel), plainProps(`http\\://localhost\\:${reserved}/mcp`, `http\\://localhost\\:${reserved}`), rel);
    }
    assert.match(out.stdout, new RegExp(`^>> Pointed etgo\\.mcp\\.public\\.url / etgo\\.oauth2\\.public\\.url at :${reserved} in `, 'm'));
  });
});
