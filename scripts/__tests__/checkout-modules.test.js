// @covers scripts/checkout-modules.js
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { moveRepo } from '../checkout-modules.js';
import { isolatedGitEnv } from './isolatedGitEnv.js';

const EPIC = 'epic/ETP-3504';
let root;
let origin;

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

let n = 0;
/** A fresh clone of `origin`, on `branch`. */
function cloneOn(branch) {
  const dir = join(root, `clone-${n++}`);
  git(root, 'clone', '-q', origin, dir);
  git(dir, 'checkout', '-q', branch);
  return dir;
}

// origin: main: c0 | develop: c0 + d1 | epic: develop + e1
before(() => {
  root = mkdtempSync(join(tmpdir(), 'checkout-modules-'));
  origin = join(root, 'origin.git');
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
});

after(() => rmSync(root, { recursive: true, force: true }));

const base = { kind: 'base' };

describe('checkout-modules: moveRepo', () => {
  it('moves a clean repo to the target, creating the local branch from origin', async () => {
    const dir = cloneOn('main');
    const r = await moveRepo(dir, base, EPIC, { fetchFirst: true, pull: false });
    assert.equal(r.status, 'OK', r.msg);
    assert.equal(git(dir, 'branch', '--show-current'), EPIC);
    assert.equal(git(dir, 'rev-parse', 'HEAD'), git(dir, 'rev-parse', `origin/${EPIC}`));
  });

  it('never touches a repo with uncommitted changes', async () => {
    const dir = cloneOn('main');
    writeFileSync(join(dir, 'c0'), 'edited');
    const r = await moveRepo(dir, base, 'develop', { fetchFirst: true, pull: false });
    assert.equal(r.status, 'SKIP');
    assert.equal(r.step, 'status');
    assert.equal(git(dir, 'branch', '--show-current'), 'main', 'still on its branch');
  });

  it('is an error when the target does not exist on origin, and stays where it was', async () => {
    const dir = cloneOn('main');
    const r = await moveRepo(dir, base, 'nope', { fetchFirst: true, pull: false });
    assert.equal(r.status, 'ERROR');
    assert.equal(r.step, 'target');
    assert.equal(git(dir, 'branch', '--show-current'), 'main');
  });

  it('pulls fast-forward only when asked', async () => {
    const dir = cloneOn('develop');
    git(dir, 'reset', '-q', '--hard', 'HEAD~1');
    const kept = await moveRepo(dir, base, 'develop', { fetchFirst: false, pull: false });
    assert.equal(kept.status, 'OK');
    assert.notEqual(git(dir, 'rev-parse', 'HEAD'), git(dir, 'rev-parse', 'origin/develop'),
      'without pull the branch is only checked out');
    const pulled = await moveRepo(dir, base, 'develop', { fetchFirst: false, pull: true });
    assert.equal(pulled.status, 'OK', pulled.msg);
    assert.equal(git(dir, 'rev-parse', 'HEAD'), git(dir, 'rev-parse', 'origin/develop'));
  });

  it('a missing clone is skipped when optional and an error otherwise', async () => {
    const missing = join(root, 'not-cloned');
    assert.equal((await moveRepo(missing, { kind: 'base', optional: true }, 'develop',
      { fetchFirst: false, pull: false })).status, 'SKIP');
    assert.equal((await moveRepo(missing, base, 'develop', { fetchFirst: false, pull: false })).status,
      'ERROR');
  });
});
