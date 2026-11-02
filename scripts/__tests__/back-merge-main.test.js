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
const OPEN_URL = 'https://github.com/etendosoftware/repo/pull/3';

const FAKE_GH = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$GH_STUB_LOG"
json=""; prev=""
for arg in "$@"; do [ "$prev" = --json ] && json="$arg"; prev="$arg"; done
case "$1 $2" in
  "pr list") printf '%s\\n' "\${GH_STUB_OPEN_PR:-}" ;;
  "pr create")
    while [ $# -gt 0 ]; do
      [ "$1" = --body-file ] && cp "$2" "$GH_STUB_BODY"
      shift
    done
    echo "${PR_URL}" ;;
  "pr view")
    case "$json" in
      assignees)
        if [ -n "\${GH_STUB_MERGED_NUMBER:-}" ] && [ "$3" = "\${GH_STUB_MERGED_NUMBER:-}" ]; then
          printf '%s\\n' "\${GH_STUB_MERGED_ASSIGNEE:-}"
        else
          printf '%s\\n' "\${GH_STUB_ASSIGNEES:-0}"
        fi ;;
      reviewDecision) printf '%s\\n' "\${GH_STUB_REVIEW:-REVIEW_REQUIRED}" ;;
      autoMergeRequest) printf '%s\\n' "\${GH_STUB_AUTO_MERGE:-false}" ;;
      mergedBy) printf '%s\\n' "\${GH_STUB_MERGED_BY:-}" ;;
    esac ;;
  "pr edit") exit "\${GH_STUB_EDIT_RC:-0}" ;;
  "pr review") printf 'review-token=%s\\n' "$GH_TOKEN" >> "$GH_STUB_LOG" ;;
  "pr merge") exit "\${GH_STUB_MERGE_RC:-0}" ;;
  "api user") printf '%s\\n' "\${GH_STUB_BOT:-etendobot}" ;;
  api*)
    case "$2" in
      */pulls) printf '%s\\n' "\${GH_STUB_MERGED_NUMBER:-}" ;;
      *) printf '%s\\n' "\${GH_STUB_COMMIT_AUTHOR:-}" ;;
    esac ;;
esac
`;

let tmp;
let repo;

/** No GIT_* variables, none of the user's git config and no inherited GitHub tokens. */
function gitEnv(extra = {}) {
  const env = isolatedGitEnv({ GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_NOSYSTEM: '1', ...extra });
  if (!('GH_TOKEN' in extra)) delete env.GH_TOKEN;
  if (!('APPROVE_TOKEN' in extra)) delete env.APPROVE_TOKEN;
  return env;
}

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
      GH_TOKEN: 'bot-token',
      ...stub,
    }),
  });
}

function ghCalls(prefix = '') {
  if (!existsSync(join(tmp, 'gh.log'))) return [];
  return readFileSync(join(tmp, 'gh.log'), 'utf8').trim().split('\n').filter((call) => call.startsWith(prefix));
}

const prBody = () => readFileSync(join(tmp, 'body.md'), 'utf8');

function hotfix() {
  git('checkout', '-q', 'main');
  commit('b.txt', 'fix\n', 'Issue #42: Fix the totals on main');
  push();
}

function conflict() {
  git('checkout', '-q', 'develop');
  commit('a.txt', 'one on develop\n', 'Feature ETP-1234: Change the first file');
  git('checkout', '-q', 'main');
  commit('a.txt', 'one on main\n', 'Issue #42: Fix the first file on main');
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

  it('opens the PR, assigns whoever moved main and turns on auto-merge', () => {
    hotfix();
    const out = runScript({ GH_STUB_COMMIT_AUTHOR: 'alice', GH_STUB_MERGED_NUMBER: '41' });
    assert.equal(out.status, 0, out.stderr);
    const create = ghCalls('pr create');
    assert.equal(create.length, 1);
    assert.match(create[0], /--base develop --head main --title Merge main into develop/);
    assert.match(prBody(), /Issue #42: Fix the totals on main/);
    assert.match(prBody(), /`main` moved with #41\./);
    assert.match(prBody(), /It merges itself once the required checks pass/);
    assert.deepEqual(ghCalls('pr edit'), [`pr edit ${PR_URL} --add-assignee alice`]);
    assert.deepEqual(ghCalls('pr merge'), [`pr merge ${PR_URL} --auto --merge`]);
    assert.deepEqual(ghCalls('pr review'), []);
  });

  it('approves with the second token when develop needs a review', () => {
    hotfix();
    const out = runScript({ GH_STUB_COMMIT_AUTHOR: 'alice', APPROVE_TOKEN: 'approver-token' });
    assert.equal(out.status, 0, out.stderr);
    assert.equal(ghCalls(`pr review ${PR_URL} --approve`).length, 1);
    assert.deepEqual(ghCalls('review-token='), ['review-token=approver-token']);
  });

  it("falls back to whoever merged the PR of main's last commit", () => {
    hotfix();
    const out = runScript({ GH_STUB_MERGED_NUMBER: '41', GH_STUB_MERGED_BY: 'bob' });
    assert.equal(out.status, 0, out.stderr);
    assert.deepEqual(ghCalls('pr view 41'), ['pr view 41 --json mergedBy --jq .mergedBy.login // empty']);
    assert.deepEqual(ghCalls('pr edit'), [`pr edit ${PR_URL} --add-assignee bob`]);
  });

  it('looks past etendobot as the commit author to whoever merged the PR', () => {
    hotfix();
    const out = runScript({ GH_STUB_COMMIT_AUTHOR: 'etendobot', GH_STUB_MERGED_NUMBER: '41', GH_STUB_MERGED_BY: 'bob' });
    assert.equal(out.status, 0, out.stderr);
    assert.deepEqual(ghCalls('pr edit'), [`pr edit ${PR_URL} --add-assignee bob`]);
  });

  it("assigns an automatic cut's owner: etendobot merged it, its PR's assignee owns it", () => {
    hotfix();
    const out = runScript({
      GH_STUB_COMMIT_AUTHOR: 'etendobot', GH_STUB_MERGED_NUMBER: '60', GH_STUB_MERGED_BY: 'etendobot', GH_STUB_MERGED_ASSIGNEE: 'gremiger',
    });
    assert.equal(out.status, 0, out.stderr);
    assert.deepEqual(ghCalls('pr view 60'), [
      'pr view 60 --json mergedBy --jq .mergedBy.login // empty',
      'pr view 60 --json assignees --jq .assignees[0].login // empty',
    ]);
    assert.deepEqual(ghCalls('pr edit'), [`pr edit ${PR_URL} --add-assignee gremiger`]);
  });

  it('never assigns the bot, even as the assignee of the merged PR', () => {
    hotfix();
    const out = runScript({
      GH_STUB_COMMIT_AUTHOR: 'etendobot', GH_STUB_MERGED_NUMBER: '60', GH_STUB_MERGED_BY: 'etendobot', GH_STUB_MERGED_ASSIGNEE: 'etendobot',
    });
    assert.equal(out.status, 0, out.stderr);
    assert.deepEqual(ghCalls('pr edit'), []);
    assert.equal(ghCalls('pr merge').length, 1);
  });

  it('never assigns the bot that opens the PR', () => {
    hotfix();
    const out = runScript({ GH_STUB_COMMIT_AUTHOR: 'etendobot', GH_STUB_BOT: 'etendobot' });
    assert.equal(out.status, 0, out.stderr);
    assert.deepEqual(ghCalls('pr edit'), []);
    assert.equal(ghCalls('pr merge').length, 1);
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

  it('completes an open PR instead of opening a second one', () => {
    hotfix();
    const out = runScript({ GH_STUB_OPEN_PR: OPEN_URL, GH_STUB_COMMIT_AUTHOR: 'alice', APPROVE_TOKEN: 'approver-token' });
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /Already open/);
    assert.deepEqual(ghCalls('pr create'), []);
    assert.deepEqual(ghCalls('pr edit'), [`pr edit ${OPEN_URL} --add-assignee alice`]);
    assert.equal(ghCalls(`pr review ${OPEN_URL} --approve`).length, 1);
    assert.deepEqual(ghCalls('pr merge'), [`pr merge ${OPEN_URL} --auto --merge`]);
  });

  it('leaves alone an open PR that has everything already', () => {
    hotfix();
    const out = runScript({
      GH_STUB_OPEN_PR: OPEN_URL, GH_STUB_COMMIT_AUTHOR: 'alice', GH_STUB_ASSIGNEES: '1',
      GH_STUB_REVIEW: 'APPROVED', GH_STUB_AUTO_MERGE: 'true', APPROVE_TOKEN: 'approver-token',
    });
    assert.equal(out.status, 0, out.stderr);
    assert.deepEqual([...ghCalls('pr edit'), ...ghCalls('pr review'), ...ghCalls('pr merge')], []);
  });

  it('gives a conflict its assignee but no approval or auto-merge', () => {
    conflict();
    const out = runScript({ GH_STUB_COMMIT_AUTHOR: 'alice', APPROVE_TOKEN: 'approver-token' });
    assert.equal(out.status, 0, out.stderr);
    assert.match(prBody(), /### Conflicts/);
    assert.match(prBody(), /^- a\.txt$/m);
    assert.match(prBody(), /git merge origin\/main/);
    assert.doesNotMatch(prBody(), /It merges itself/);
    assert.deepEqual(ghCalls('pr edit'), [`pr edit ${PR_URL} --add-assignee alice`]);
    assert.deepEqual([...ghCalls('pr review'), ...ghCalls('pr merge')], []);
    assert.match(out.stdout, /it waits for alice/);
  });

  it('leaves the PR open when the assignment or auto-merge is refused', () => {
    hotfix();
    const out = runScript({ GH_STUB_COMMIT_AUTHOR: 'alice', GH_STUB_EDIT_RC: '1', GH_STUB_MERGE_RC: '1' });
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, new RegExp(`Opened ${PR_URL}`));
    assert.match(out.stdout, /::warning::Could not assign/);
    assert.match(out.stdout, /::warning::Could not enable auto-merge/);
  });
});
