// @covers scripts/sonar-base-branch.sh
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isolatedGitEnv } from './isolatedGitEnv.js';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'sonar-base-branch.sh');

let root;
let count = 0;

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: isolatedGitEnv() }).trim();
}

function commit(cwd, file) {
  writeFileSync(join(cwd, file), `${file}\n`);
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', file);
}

/**
 * A clone of a bare origin, on feature/x, whose local main is where origin's main was when it was
 * cloned. `behind` commits then land on origin's main and are fetched, so the local main lags.
 */
function makeClone({ behind = 0 } = {}) {
  count += 1;
  const origin = join(root, `origin-${count}.git`);
  const seed = join(root, `seed-${count}`);
  const clone = join(root, `clone-${count}`);
  git(root, 'init', '-q', '--bare', origin);
  mkdirSync(seed);
  git(seed, 'init', '-q', '-b', 'main');
  git(seed, 'config', 'user.email', 't@example.com');
  git(seed, 'config', 'user.name', 'T');
  commit(seed, 'base.txt');
  git(seed, 'remote', 'add', 'origin', origin);
  git(seed, 'push', '-q', 'origin', 'main');
  git(root, 'clone', '-q', '-b', 'main', origin, clone);
  git(clone, 'config', 'user.email', 't@example.com');
  git(clone, 'config', 'user.name', 'T');
  git(clone, 'switch', '-q', '-c', 'feature/x');
  for (let i = 0; i < behind; i += 1) commit(seed, `origin-${i}.txt`);
  git(seed, 'push', '-q', 'origin', 'main');
  git(clone, 'fetch', '-q', 'origin');
  return clone;
}

/** Adds a commit to the clone's local main without leaving feature/x. */
function commitOnLocalMain(clone) {
  git(clone, 'switch', '-q', 'main');
  commit(clone, 'local.txt');
  git(clone, 'switch', '-q', 'feature/x');
}

function run(cwd, ...args) {
  return spawnSync('bash', [SCRIPT, ...args], { cwd, encoding: 'utf8', env: isolatedGitEnv() });
}

const sha = (clone, ref) => git(clone, 'rev-parse', ref);

before(() => {
  root = mkdtempSync(join(tmpdir(), 'sonar-base-branch-'));
});

after(() => rmSync(root, { recursive: true, force: true }));

describe('sonar-base-branch.sh', () => {
  it('leaves a local branch that matches origin alone, and prints the base', () => {
    const clone = makeClone();
    const out = run(clone, 'origin/main');
    assert.equal(out.status, 0, out.stdout + out.stderr);
    assert.match(out.stdout, new RegExp(`^==> Sonar base: main @ ${sha(clone, 'main').slice(0, 7)}\\w* \\(\\d{4}-\\d{2}-\\d{2}\\)$`, 'm'));
  });

  it('fast-forwards a local branch that is only behind, to the origin ref already fetched', () => {
    const clone = makeClone({ behind: 2 });
    const before = sha(clone, 'main');
    const out = run(clone, 'origin/main');
    assert.equal(out.status, 0, out.stdout + out.stderr);
    assert.equal(sha(clone, 'main'), sha(clone, 'origin/main'));
    assert.match(out.stdout, new RegExp(`fast-forwarded from ${before.slice(0, 7)}`));
    assert.equal(git(clone, 'branch', '--show-current'), 'feature/x', 'the checked-out branch does not change');
  });

  it('is fine without a local branch: Sonar then reads origin', () => {
    const clone = makeClone({ behind: 1 });
    git(clone, 'branch', '-q', '-D', 'main');
    const out = run(clone, 'origin/main');
    assert.equal(out.status, 0, out.stdout + out.stderr);
    assert.match(out.stdout, /no local main, so Sonar reads origin's/);
    assert.equal(git(clone, 'branch', '--list', 'main'), '', 'it does not create the branch');
  });

  it('stops on a local branch with commits of its own, ahead or diverged, and leaves it as it is', () => {
    for (const behind of [0, 1]) {
      const clone = makeClone({ behind });
      commitOnLocalMain(clone);
      const local = sha(clone, 'main');
      const out = run(clone, 'origin/main');
      assert.equal(out.status, 1, out.stdout + out.stderr);
      assert.match(out.stdout, /^ERROR: Sonar compares against your local main, at \w+ \(.+\), but origin\/main is at/m);
      assert.match(out.stdout, /It has 1 commit\(s\) that origin\/main lacks/);
      assert.match(out.stdout, /git branch -f main origin\/main/);
      assert.equal(sha(clone, 'main'), local);
    }
  });

  it('stops on a branch that is behind while checked out, here or in another worktree', () => {
    const elsewhere = makeClone({ behind: 1 });
    const stale = sha(elsewhere, 'main');
    git(elsewhere, 'worktree', 'add', '-q', join(root, `wt-${count}`), 'main');
    const out = run(elsewhere, 'origin/main');
    assert.equal(out.status, 1, out.stdout + out.stderr);
    assert.match(out.stdout, /It is checked out, so it cannot be moved from here/);
    assert.match(out.stdout, /git merge --ff-only origin\/main/);
    assert.equal(sha(elsewhere, 'main'), stale);

    const here = makeClone({ behind: 1 });
    git(here, 'switch', '-q', 'main');
    assert.equal(run(here, 'origin/main').status, 1);
  });

  it('leaves a base that is not an origin branch alone, and rejects bad usage', () => {
    const clone = makeClone({ behind: 1 });
    const stale = sha(clone, 'main');
    for (const base of ['main', stale]) {
      const out = run(clone, base);
      assert.equal(out.status, 0, out.stdout + out.stderr);
      assert.match(out.stdout, new RegExp(`^==> Sonar base: ${base} @ `));
    }
    assert.equal(sha(clone, 'main'), stale);
    assert.equal(run(clone).status, 2);
    assert.equal(run(clone, '').status, 2);
  });
});
