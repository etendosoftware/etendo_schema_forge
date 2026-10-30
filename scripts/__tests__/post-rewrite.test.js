// @covers .githooks/post-rewrite
// Commits stamped by the real hooks in a throwaway repository, then rewritten in the ways that keep
// or break their Hooks-Verified seal.
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isolatedGitEnv } from './isolatedGitEnv.js';

const HOOKS = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '.githooks');
const WARNING = 'trailer does not match their content';

let repo;

function git(...args) {
  const out = spawnSync('git', args, { cwd: repo, encoding: 'utf8', env: isolatedGitEnv({ GIT_EDITOR: 'true' }) });
  return { status: out.status, stderr: out.stderr };
}

function ok(...args) {
  const out = git(...args);
  assert.equal(out.status, 0, `git ${args.join(' ')}: ${out.stderr}`);
  return out;
}

function commit(name, content, message, ...extra) {
  writeFileSync(join(repo, name), content);
  ok('add', name);
  return ok('commit', '-q', '-m', message, ...extra);
}

function sealIsValid(rev = 'HEAD') {
  const out = spawnSync('bash', ['-c', `. "${join(HOOKS, 'lib', 'hooks-proof.sh')}"; hooks_verify_commit "$0"`, rev],
    { cwd: repo, encoding: 'utf8', env: isolatedGitEnv() });
  return out.status === 0;
}

/** A feature commit replayed onto a main that changed the same line, conflict resolved. */
function conflictingRebase() {
  ok('checkout', '-q', '-b', 'feature');
  commit('a.txt', 'two\n', 'Feature ETP-1234: Change the line on the feature');
  ok('checkout', '-q', 'main');
  commit('a.txt', 'three\n', 'Feature ETP-1234: Change the line on main');
  ok('checkout', '-q', 'feature');
  assert.notEqual(git('rebase', 'main').status, 0);
  writeFileSync(join(repo, 'a.txt'), 'two and three\n');
  ok('add', 'a.txt');
  return ok('rebase', '--continue');
}

describe('post-rewrite', () => {
  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'post-rewrite-'));
    ok('init', '-q', '-b', 'main');
    ok('config', 'user.email', 'test@example.com');
    ok('config', 'user.name', 'Test');
    ok('config', 'core.hooksPath', HOOKS);
    commit('a.txt', 'one\n', 'Feature ETP-1234: Add the first file');
  });

  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it('stays silent after an amend made with the hooks', () => {
    writeFileSync(join(repo, 'a.txt'), 'one, amended\n');
    ok('add', 'a.txt');
    assert.doesNotMatch(ok('commit', '-q', '--amend', '--no-edit').stderr, new RegExp(WARNING));
    assert.ok(sealIsValid());
  });

  it('warns after an amend that skipped the hooks, with the exact re-seal command', () => {
    writeFileSync(join(repo, 'a.txt'), 'one, amended\n');
    ok('add', 'a.txt');
    const { stderr } = ok('commit', '-q', '--amend', '--no-edit', '--no-verify');
    assert.match(stderr, new RegExp(WARNING));
    assert.match(stderr, /Add the first file/);
    assert.match(stderr, /git rebase --exec 'git commit --amend --no-edit' --root/);
    assert.ok(!sealIsValid());
  });

  it('stays silent after a rebase that replays the same diff', () => {
    ok('checkout', '-q', '-b', 'feature');
    commit('b.txt', 'feature\n', 'Feature ETP-1234: Add a feature file');
    ok('checkout', '-q', 'main');
    commit('a.txt', 'one on main\n', 'Feature ETP-1234: Change the first file on main');
    ok('checkout', '-q', 'feature');
    assert.doesNotMatch(ok('rebase', 'main').stderr, new RegExp(WARNING));
    assert.ok(sealIsValid());
  });

  it('stays silent after a rebase whatever prefixes the user\'s diff config prints', () => {
    ok('config', 'diff.mnemonicPrefix', 'true');
    ok('config', 'diff.noprefix', 'true');
    ok('checkout', '-q', '-b', 'feature');
    commit('b.txt', 'feature\n', 'Feature ETP-1234: Add a feature file');
    ok('checkout', '-q', 'main');
    commit('a.txt', 'one on main\n', 'Feature ETP-1234: Change the first file on main');
    ok('checkout', '-q', 'feature');
    assert.doesNotMatch(ok('rebase', 'main').stderr, new RegExp(WARNING));
    assert.ok(sealIsValid());
  });

  it('warns when a rebase resolves a conflict, naming the base to re-seal from', () => {
    const { stderr } = conflictingRebase();
    assert.match(stderr, new RegExp(WARNING));
    assert.match(stderr, /Change the line on the feature/);
    const main = spawnSync('git', ['rev-parse', '--short', 'main'], { cwd: repo, encoding: 'utf8', env: isolatedGitEnv() }).stdout.trim();
    assert.match(stderr, new RegExp(`git rebase --exec 'git commit --amend --no-edit' ${main}`));
    assert.ok(!sealIsValid());
  });

  it('leaves nothing to warn about once the suggested re-seal runs', () => {
    conflictingRebase();
    assert.doesNotMatch(ok('rebase', '--exec', 'git commit --amend --no-edit', 'main').stderr, new RegExp(WARNING));
    assert.ok(sealIsValid());
  });
});
