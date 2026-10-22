// @covers scripts/check-modules.js
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { declaredBranch, evaluateRepo, normalizeRemote, parseWorktreeConf, resolveDir } from '../check-modules.js';
import { isolatedGitEnv } from './isolatedGitEnv.js';

const EPIC = 'epic/ETP-3504';
let root;
let clone;

function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    env: isolatedGitEnv({ GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }),
    encoding: 'utf8',
  }).trim();
}

function commit(cwd, file, msg) {
  writeFileSync(join(cwd, file), msg);
  git(cwd, 'add', file);
  git(cwd, 'commit', '-q', '-m', msg);
}

// main: c0 | develop: c0 + d1 | epic: develop + e1   (develop-only = d1, epic-only = e1)
before(() => {
  root = mkdtempSync(join(tmpdir(), 'check-modules-'));
  const origin = join(root, 'origin.git');
  const seed = join(root, 'seed');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(root, 'init', '-q', '-b', 'main', seed);
  commit(seed, 'c0', 'c0');
  git(seed, 'checkout', '-q', '-b', 'develop');
  commit(seed, 'd1', 'd1');
  git(seed, 'checkout', '-q', '-b', EPIC);
  commit(seed, 'e1', 'e1');
  git(seed, 'remote', 'add', 'origin', origin);
  git(seed, 'push', '-q', 'origin', 'main', 'develop', EPIC);
  clone = join(root, 'clone');
  git(root, 'clone', '-q', origin, clone);
});

after(() => rmSync(root, { recursive: true, force: true }));

function branchFrom(name, base) {
  git(clone, 'checkout', '-q', '-B', name, `origin/${base}`);
  commit(clone, `work-${name.replace(/\//g, '-')}`, `work ${name}`);
}

const errors = (r) => r.findings.filter((f) => f.level === 'ERROR').map((f) => f.msg);
const epicSpec = { kind: 'epic', remote: null };
const usualSpec = { kind: 'usual', remote: null };

describe('check-modules: fixed-on-epic repos', () => {
  it('accepts the epic branch itself', async () => {
    git(clone, 'checkout', '-q', '-B', EPIC, `origin/${EPIC}`);
    assert.deepEqual(errors(await evaluateRepo(clone, epicSpec, EPIC)), []);
  });

  it('rejects develop: a fixed-on-epic repo must not sit on it', async () => {
    git(clone, 'checkout', '-q', '-B', 'develop', 'origin/develop');
    const errs = errors(await evaluateRepo(clone, epicSpec, EPIC));
    assert.equal(errs.length, 1);
    assert.match(errs[0], /must be on epic\/ETP-3504/);
  });

  it('accepts a feature cut from the epic', async () => {
    branchFrom('feature/ETP-1', EPIC);
    assert.deepEqual(errors(await evaluateRepo(clone, epicSpec, EPIC)), []);
  });

  it('rejects a feature cut from develop (misses the epic-only work)', async () => {
    branchFrom('feature/ETP-2', 'develop');
    const errs = errors(await evaluateRepo(clone, epicSpec, EPIC));
    assert.equal(errs.length, 1);
    assert.match(errs[0], /wrong base/);
  });

  it('rejects a hotfix cut from main for a fixed-on-epic repo', async () => {
    branchFrom('hotfix/ETP-3', 'main');
    assert.match(errors(await evaluateRepo(clone, epicSpec, EPIC))[0], /wrong base/);
  });

  it('flags a detached HEAD', async () => {
    git(clone, 'checkout', '-q', '--detach', `origin/${EPIC}`);
    assert.match(errors(await evaluateRepo(clone, epicSpec, EPIC))[0], /detached HEAD/);
  });
});

describe('check-modules: base / usual repos', () => {
  it('accepts a feature cut from develop', async () => {
    branchFrom('feature/ETP-4', 'develop');
    assert.deepEqual(errors(await evaluateRepo(clone, usualSpec, EPIC)), []);
  });

  it('warns about a feature cut from main (misses develop-only work: cut from main or outdated)', async () => {
    branchFrom('feature/ETP-5', 'main');
    const warns = (await evaluateRepo(clone, usualSpec, EPIC)).findings.filter((f) => f.level === 'WARN').map((f) => f.msg);
    assert.equal(warns.length, 1);
    assert.match(warns[0], /OUTDATED or cut from main: contains none of the 1 develop-only commits/);
  });

  it('rejects a feature cut from the epic', async () => {
    branchFrom('feature/ETP-6', EPIC);
    assert.match(errors(await evaluateRepo(clone, usualSpec, EPIC))[0], /not fixed on epic/);
  });

  it('accepts a hotfix cut from main', async () => {
    branchFrom('hotfix/ETP-7', 'main');
    assert.deepEqual(errors(await evaluateRepo(clone, usualSpec, EPIC)), []);
  });

  it('rejects a hotfix cut from develop (carries unreleased commits)', async () => {
    branchFrom('hotfix/ETP-8', 'develop');
    assert.match(errors(await evaluateRepo(clone, usualSpec, EPIC))[0], /hotfixes must be cut from main/);
  });
});

describe('normalizeRemote', () => {
  it('reduces ssh and https URLs to owner/repo', () => {
    assert.equal(normalizeRemote('git@bitbucket.org:koodu_software/com.smf.ticketbai.git'), 'koodu_software/com.smf.ticketbai');
    assert.equal(normalizeRemote('https://github.com/EtendoSoftware/com.etendoerp.go'), 'etendosoftware/com.etendoerp.go');
  });
});

describe('check-modules: outdated branches', () => {
  const level = (r, lvl) => r.findings.filter((f) => f.level === lvl).map((f) => f.msg);

  before(() => {
    // origin moves on after the branches below are cut: develop gets d2, the epic gets e2.
    const seed = join(root, 'seed');
    git(seed, 'checkout', '-q', 'develop');
    commit(seed, 'd2', 'd2');
    git(seed, 'checkout', '-q', EPIC);
    commit(seed, 'e2', 'e2');
    git(seed, 'push', '-q', 'origin', 'develop', EPIC);
  });

  it('warns that a feature cut from develop is behind the new develop commits', async () => {
    branchFrom('feature/ETP-9', 'develop');
    git(clone, 'fetch', '-q', 'origin');
    const warns = level(await evaluateRepo(clone, usualSpec, EPIC), 'WARN');
    assert.equal(warns.length, 1);
    assert.match(warns[0], /OUTDATED: 1 commits of origin\/develop/);
  });

  it('errors when a fixed-on-epic repo sits on an epic branch that is behind origin', async () => {
    git(clone, 'checkout', '-q', '-B', EPIC, 'origin/epic/ETP-3504~1');
    const errs = errors(await evaluateRepo(clone, epicSpec, EPIC));
    assert.equal(errs.length, 1);
    assert.match(errs[0], /OUTDATED: behind origin\/epic\/ETP-3504 by 1 commits/);
  });

  it('warns that an epic feature lacks the new epic commits, and reports develop commits it does not have', async () => {
    git(clone, 'checkout', '-q', '-B', 'feature/ETP-10', 'origin/epic/ETP-3504~1');
    commit(clone, 'work-10', 'work 10');
    const res = await evaluateRepo(clone, epicSpec, EPIC);
    assert.deepEqual(errors(res), []);
    assert.match(level(res, 'WARN')[0], /OUTDATED: 1 commits of origin\/epic\/ETP-3504/);
    assert.match(level(res, 'INFO')[0], /origin\/develop has 1 commits/);
  });

  it('does not report a branch that is up to date with its base', async () => {
    branchFrom('feature/ETP-11', 'develop');
    assert.deepEqual((await evaluateRepo(clone, usualSpec, EPIC)).findings, []);
  });
});

describe('resolveDir for another environment (--root)', () => {
  const env = {};
  it('finds the functional repo under either directory name and ignores SCHEMA_FORGE_CORE of the main checkout', () => {
    const envRoot = join(root, 'env-ETP-1');
    mkdirSync(join(envRoot, 'schema_forge', '.git'), { recursive: true });
    const self = { location: 'self' };
    assert.equal(resolveDir(self, { etendoRoot: envRoot, explicitRoot: true }), join(envRoot, 'schema_forge'));
    const core = { name: 'schema_forge_core', location: 'root', envDir: 'SCHEMA_FORGE_CORE' };
    assert.equal(resolveDir(core, { etendoRoot: envRoot, explicitRoot: true, env: { SCHEMA_FORGE_CORE: '/main/core' } }), join(envRoot, 'schema_forge_core'));
    assert.equal(resolveDir(core, { etendoRoot: envRoot, explicitRoot: false, env: { SCHEMA_FORGE_CORE: '/main/core' } }), '/main/core');
    assert.equal(resolveDir({ name: 'm', location: 'modules' }, { etendoRoot: envRoot, explicitRoot: true, env }), join(envRoot, 'modules', 'm'));
  });
});

describe('worktree.conf as a patch over the main checkout', () => {
  const conf = parseWorktreeConf([
    '# comment',
    'module com.etendoerp.go feature/ETP-1',
    'module com.smf.ticketbai epic/ETP-3504 adopt',
    'repo schema_forge feature/ETP-1 adopt=/tmp/wt',
    'core - epic/ETP-3504',
  ].join('\n'));

  it('maps each declared repo to its own branch, independent of the other repos', () => {
    assert.equal(declaredBranch(conf, { name: 'com.etendoerp.go', location: 'modules' }, '/x')?.branch, 'feature/ETP-1');
    assert.equal(declaredBranch(conf, { name: 'com.smf.ticketbai', location: 'modules' }, '/x')?.branch, 'epic/ETP-3504');
    assert.equal(declaredBranch(conf, { name: 'com.smf.ticketbai', location: 'modules' }, '/x')?.adopt, true);
    assert.equal(declaredBranch(conf, { name: 'etendo_core', location: 'etendo-root' }, '/x')?.branch, 'epic/ETP-3504');
  });

  it('matches the functional repo by either directory name', () => {
    assert.equal(declaredBranch(conf, { name: 'etendo_schema_forge', location: 'self' }, '/env/schema_forge')?.branch, 'feature/ETP-1');
  });

  it('treats an undeclared repo as an inherited copy of the main checkout', () => {
    assert.equal(declaredBranch(conf, { name: 'com.etendoerp.sif.general', location: 'modules' }, '/x'), null);
    assert.equal(declaredBranch(conf, { name: 'schema_forge_core', location: 'root' }, '/env/schema_forge_core'), null);
  });
});
