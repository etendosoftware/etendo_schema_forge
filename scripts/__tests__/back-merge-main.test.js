// @covers scripts/back-merge-main.sh
// A throwaway repository with its own origin, where main moves in the ways that do and do not
// need a main -> develop PR, and a fake gh that records what the script asks GitHub for.
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isolatedGitEnv } from './isolatedGitEnv.js';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'back-merge-main.sh');
const PR_URL = 'https://github.com/etendosoftware/repo/pull/7';

const FAKE_GH = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$GH_STUB_LOG"
case "$1 $2" in
  "pr list") printf '%s\\n' "\${GH_STUB_OPEN_PR:-}" ;;
  "pr create")
    while [ $# -gt 0 ]; do
      [ "$1" = --body-file ] && cp "$2" "$GH_STUB_BODY"
      shift
    done
    echo "${PR_URL}" ;;
  "pr edit") exit "\${GH_STUB_EDIT_RC:-0}" ;;
  api*) printf '%s\\n' "\${GH_STUB_MERGED_PR:-}" ;;
esac
`;

let tmp;
let repo;

/** No GIT_* variables and none of the user's git config, so fixture commits stay in the fixture. */
const gitEnv = (extra = {}) => isolatedGitEnv({ GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_NOSYSTEM: '1', ...extra });

function git(...args) {
  const out = spawnSync('git', args, { cwd: repo, encoding: 'utf8', env: gitEnv() });
  assert.equal(out.status, 0, `git ${args.join(' ')}: ${out.stderr}`);
  return out.stdout;
}

function commit(name, content, message) {
  writeFileSync(join(repo, name), content);
  git('add', name);
  git('commit', '-q', '-m', message);
}

const push = () => git('push', '-q', 'origin', 'main', 'develop');

function runScript(stub = {}) {
  return spawnSync('bash', [SCRIPT], {
    cwd: repo,
    encoding: 'utf8',
    env: gitEnv({
      PATH: `${join(tmp, 'bin')}${delimiter}${process.env.PATH}`,
      GH_STUB_LOG: join(tmp, 'gh.log'),
      GH_STUB_BODY: join(tmp, 'body.md'),
      MERGED_SHA: 'abc123',
      ...stub,
    }),
  });
}

const ghCalls = () => (existsSync(join(tmp, 'gh.log')) ? readFileSync(join(tmp, 'gh.log'), 'utf8').trim().split('\n') : []);
const prBody = () => readFileSync(join(tmp, 'body.md'), 'utf8');

function hotfix() {
  git('checkout', '-q', 'main');
  commit('b.txt', 'fix\n', 'Issue #42: Fix the totals on main');
  push();
}

describe('back-merge-main.sh', () => {
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'back-merge-main-'));
    repo = join(tmp, 'repo');
    mkdirSync(join(tmp, 'bin'));
    writeFileSync(join(tmp, 'bin', 'gh'), FAKE_GH);
    chmodSync(join(tmp, 'bin', 'gh'), 0o755);
    mkdirSync(repo);
    git('init', '-q', '--bare', '-b', 'main', join(tmp, 'origin.git'));
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    git('remote', 'add', 'origin', join(tmp, 'origin.git'));
    commit('a.txt', 'one\n', 'Feature ETP-1234: Add the first file');
    git('branch', 'develop');
    push();
  });

  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('does nothing when develop already contains main', () => {
    const out = runScript();
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /nothing to bring back/);
    assert.deepEqual(ghCalls(), []);
  });

  it('opens the PR with the hotfix and asks its author to review', () => {
    hotfix();
    const out = runScript({ GH_STUB_MERGED_PR: '41 alice' });
    assert.equal(out.status, 0, out.stderr);
    const create = ghCalls().filter((call) => call.startsWith('pr create'));
    assert.equal(create.length, 1);
    assert.match(create[0], /--base develop --head main --title Merge main into develop/);
    assert.match(prBody(), /Issue #42: Fix the totals on main/);
    assert.match(prBody(), /`main` moved with #41\./);
    assert.doesNotMatch(prBody(), /### Conflicts/);
    assert.ok(ghCalls().includes(`pr edit ${PR_URL} --add-reviewer alice`));
  });

  it('brings only the merge commit of a clean cut', () => {
    git('checkout', '-q', 'develop');
    commit('c.txt', 'feature\n', 'Feature ETP-1234: Add a feature');
    git('checkout', '-q', 'main');
    git('merge', '-q', '--no-ff', '-m', 'Merge pull request #50 from mergeblock/ETP-1234', 'develop');
    push();
    const out = runScript();
    assert.equal(out.status, 0, out.stderr);
    assert.match(prBody(), /Only merge commits/);
    assert.doesNotMatch(prBody(), /Add a feature/);
  });

  it('does not open a second PR', () => {
    hotfix();
    const out = runScript({ GH_STUB_OPEN_PR: 'https://github.com/etendosoftware/repo/pull/3' });
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /Already open/);
    assert.ok(!ghCalls().some((call) => call.startsWith('pr create')));
  });

  it('lists the conflicts and how to resolve them', () => {
    git('checkout', '-q', 'develop');
    commit('a.txt', 'one on develop\n', 'Feature ETP-1234: Change the first file');
    git('checkout', '-q', 'main');
    commit('a.txt', 'one on main\n', 'Issue #42: Fix the first file on main');
    push();
    const out = runScript();
    assert.equal(out.status, 0, out.stderr);
    assert.match(prBody(), /### Conflicts/);
    assert.match(prBody(), /^- a\.txt$/m);
    assert.match(prBody(), /git merge origin\/main/);
  });

  it('leaves the PR open when the review request is refused', () => {
    hotfix();
    const out = runScript({ GH_STUB_MERGED_PR: '41 etendobot', GH_STUB_EDIT_RC: '1' });
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, new RegExp(`Opened ${PR_URL}`));
    assert.match(out.stdout, /::warning::Could not request a review from etendobot/);
  });
});
