// @covers .githooks/lib/target-branch.sh
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isolatedGitEnv } from './isolatedGitEnv.js';

const LIB = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '.githooks', 'lib', 'target-branch.sh');
const ZERO = '0000000000000000000000000000000000000000';
const SHA = '1111111111111111111111111111111111111111';

let root;
let fakeBin;

/** Runs `script` in bash with the lib sourced, behind a fake `gh` that prints `ghOutput`. */
function bash(script, { cwd = root, env = {}, ghOutput = '' } = {}) {
  writeFileSync(join(fakeBin, 'gh'), `#!/bin/sh\nprintf '%s' '${ghOutput}'\n`);
  chmodSync(join(fakeBin, 'gh'), 0o755);
  return spawnSync('bash', ['-c', `set -e; . "${LIB}"; ${script}`], {
    cwd,
    encoding: 'utf8',
    env: isolatedGitEnv({ PATH: `${fakeBin}:${process.env.PATH}`, PRE_PUSH_TARGET: '', ...env }),
  });
}

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: isolatedGitEnv() }).trim();
}

/**
 * A clone of a bare origin: develop holds a.txt, feature/x is checked out and then develop
 * changes a.txt. A conflicting feature edits a.txt too; a clean one only adds b.txt.
 */
function makeRepo(name, { conflicting }) {
  const origin = join(root, `${name}-origin.git`);
  const seed = join(root, `${name}-seed`);
  const clone = join(root, name);
  git(root, 'init', '-q', '--bare', origin);
  mkdirSync(seed);
  git(seed, 'init', '-q', '-b', 'develop');
  git(seed, 'config', 'user.email', 't@example.com');
  git(seed, 'config', 'user.name', 'T');
  writeFileSync(join(seed, 'a.txt'), 'base\n');
  git(seed, 'add', '-A');
  git(seed, 'commit', '-q', '-m', 'base');
  git(seed, 'remote', 'add', 'origin', origin);
  git(seed, 'push', '-q', 'origin', 'develop');
  git(root, 'clone', '-q', '-b', 'develop', origin, clone);
  git(clone, 'config', 'user.email', 't@example.com');
  git(clone, 'config', 'user.name', 'T');
  git(clone, 'checkout', '-q', '-b', 'feature/x');
  writeFileSync(join(clone, conflicting ? 'a.txt' : 'b.txt'), 'feature change\n');
  git(clone, 'add', '-A');
  git(clone, 'commit', '-q', '-m', 'feature');
  // develop moves on after the branch was cut.
  writeFileSync(join(seed, 'a.txt'), 'develop moved\n');
  git(seed, 'commit', '-q', '-am', 'develop moves');
  git(seed, 'push', '-q', 'origin', 'develop');
  return clone;
}

before(() => {
  root = mkdtempSync(join(tmpdir(), 'target-branch-'));
  fakeBin = join(root, 'bin');
  mkdirSync(fakeBin);
});

after(() => rmSync(root, { recursive: true, force: true }));

describe('pushed_branch', () => {
  it('takes the first refs/heads/ remote ref and skips deletions and tags', () => {
    const refs = [
      `refs/heads/old ${ZERO} refs/heads/old ${SHA}`,
      `refs/tags/v1 ${SHA} refs/tags/v1 ${ZERO}`,
      `refs/heads/hotfix/a ${SHA} refs/heads/hotfix/ETP-1 ${ZERO}`,
    ].join('\n');
    const out = bash(`pushed_branch "$REFS"`, { env: { REFS: refs } });
    assert.equal(out.stdout, 'hotfix/ETP-1');
  });

  it('falls back to the checked-out branch when there are no ref lines', () => {
    const repo = join(root, 'plain');
    mkdirSync(repo);
    git(repo, 'init', '-q', '-b', 'feature/y');
    assert.equal(bash('pushed_branch ""', { cwd: repo }).stdout.trim(), 'feature/y');
  });
});

describe('target_branch', () => {
  it('uses PRE_PUSH_TARGET first, without its origin/ prefix', () => {
    const out = bash('target_branch feature/x', { env: { PRE_PUSH_TARGET: 'origin/main' }, ghOutput: 'OPEN develop' });
    assert.equal(out.stdout, 'main');
  });

  it("uses the base of the branch's open PR", () => {
    assert.equal(bash('target_branch hotfix/x', { ghOutput: 'OPEN develop' }).stdout, 'develop');
    assert.equal(bash('target_branch feature/x', { ghOutput: 'OPEN mergeblock/ETP-9' }).stdout, 'mergeblock/ETP-9');
  });

  it('ignores a PR that is no longer open, and skips the lookup on request', () => {
    assert.equal(bash('target_branch hotfix/x', { ghOutput: 'MERGED develop' }).stdout, 'main');
    const out = bash('target_branch feature/x', { env: { PRE_PUSH_TARGET_LOOKUP: '0' }, ghOutput: 'OPEN main' });
    assert.equal(out.stdout, 'develop');
  });

  it('sends main and hotfix/* to main and everything else to develop when there is no PR', () => {
    assert.equal(bash('target_branch hotfix/ETP-1', { ghOutput: '' }).stdout, 'main');
    assert.equal(bash('target_branch main', { ghOutput: '' }).stdout, 'main');
    assert.equal(bash('target_branch feature/ETP-1', { ghOutput: '' }).stdout, 'develop');
    assert.equal(bash('target_branch ""', { ghOutput: '' }).stdout, 'develop');
  });
});

describe('check_target_conflicts', () => {
  it('passes when the branch still merges cleanly into the target', () => {
    const repo = makeRepo('clean', { conflicting: false });
    const out = bash('check_target_conflicts develop', { cwd: repo });
    assert.equal(out.status, 0, out.stdout + out.stderr);
    assert.match(out.stdout, /SUCCESS ✅ \(merges cleanly into origin\/develop\)/);
  });

  it('exits the hook and lists the files when the branch conflicts with the target', () => {
    const repo = makeRepo('conflict', { conflicting: true });
    const out = bash('check_target_conflicts develop; echo still-running', { cwd: repo });
    assert.equal(out.status, 1);
    assert.match(out.stdout, /conflicts with origin\/develop/);
    assert.match(out.stdout, /  - a\.txt/);
    assert.doesNotMatch(out.stdout, /still-running/);
  });

  it('skips without blocking when the target cannot be fetched', () => {
    const repo = makeRepo('missing', { conflicting: false });
    const out = bash('check_target_conflicts release/none', { cwd: repo });
    assert.equal(out.status, 0);
    assert.match(out.stdout, /SKIPPED ⚠️ \(could not fetch origin\/release\/none/);
  });
});
