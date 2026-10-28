// @covers scripts/lib/e2e-coverage-map-lookup.js
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ARTIFACT_NAME,
  MAP_FILE,
  candidateCommits,
  findCoverageMap,
  mapRuns,
} from '../lib/e2e-coverage-map-lookup.js';

// develop's first-parent line, newest first; the branch left develop at D3.
const DEVELOP = ['d3333333333', 'd2222222222', 'd1111111111', 'd0000000000'];

function fakeGit({ fail = false } = {}) {
  const calls = [];
  const git = (args) => {
    calls.push(args.join(' '));
    if (fail) throw Object.assign(new Error('fatal'), { stderr: "fatal: Not a valid object name origin/develop\n" });
    if (args[0] === 'merge-base') return `${DEVELOP[0]}\n`;
    if (args[0] === 'rev-list') return `${DEVELOP.slice(0, Number(args[3])).join('\n')}\n`;
    throw new Error(`unexpected git ${args.join(' ')}`);
  };
  return { git, calls };
}

const artifact = (sha, runId, extra = {}) => ({
  name: ARTIFACT_NAME, expired: false, workflow_run: { id: runId, head_branch: 'develop', head_sha: sha }, ...extra,
});

/** gh that lists `artifacts` and downloads a map, unless told to fail. */
function fakeGh({ artifacts = [], apiError = null, downloadError = null, writesMap = true } = {}) {
  const calls = [];
  const gh = (args) => {
    calls.push(args.join(' '));
    if (args[0] === 'api') {
      if (apiError) throw Object.assign(new Error(apiError), { stderr: `${apiError}\n` });
      return JSON.stringify({ total_count: artifacts.length, artifacts });
    }
    if (args[0] === 'run' && args[1] === 'download') {
      if (downloadError) throw Object.assign(new Error(downloadError), { stderr: `${downloadError}\n` });
      const dir = args[args.indexOf('--dir') + 1];
      if (writesMap) writeFileSync(join(dir, MAP_FILE), `{"run": ${args[2]}}`);
      return '';
    }
    throw new Error(`unexpected gh ${args.join(' ')}`);
  };
  return { gh, calls };
}

const root = mkdtempSync(join(tmpdir(), 'coverage-map-lookup-'));
let cacheDir;
let n = 0;
beforeEach(() => {
  cacheDir = join(root, `cache-${n++}`);
});
after(() => rmSync(root, { recursive: true, force: true }));

function keep(sha, text = '{"kept": true}') {
  mkdirSync(join(cacheDir, sha), { recursive: true });
  writeFileSync(join(cacheDir, sha, MAP_FILE), text);
}

describe('candidateCommits', () => {
  it('walks develop first-parent from the merge-base, at most `max` commits', () => {
    const { git, calls } = fakeGit();
    assert.deepEqual(candidateCommits(git, { max: 2 }), DEVELOP.slice(0, 2));
    assert.deepEqual(calls, ['merge-base HEAD origin/develop', `rev-list --first-parent -n 2 ${DEVELOP[0]}`]);
  });
});

describe('mapRuns', () => {
  it('keeps live map artifacts built on develop, the newest run per commit', () => {
    const runs = mapRuns([
      artifact('a', 3),
      artifact('a', 2),
      artifact('b', 1, { expired: true }),
      artifact('c', 4, { name: 'unit-coverage' }),
      { ...artifact('d', 5), workflow_run: { id: 5, head_branch: 'feature/ETP-1', head_sha: 'd' } },
    ]);
    assert.deepEqual([...runs], [['a', 3]]);
  });
});

describe('findCoverageMap', () => {
  it('downloads the map of the newest develop commit that has one, and says how far back it is', () => {
    const { git } = fakeGit();
    const { gh, calls } = fakeGh({ artifacts: [artifact(DEVELOP[1], 77), artifact(DEVELOP[2], 66)] });
    const found = findCoverageMap({ git, gh, cacheDir });
    assert.deepEqual(found, { path: join(cacheDir, DEVELOP[1], MAP_FILE), sha: DEVELOP[1], distance: 1, source: 'downloaded' });
    assert.equal(readFileSync(found.path, 'utf8'), '{"run": 77}');
    assert.deepEqual(calls[1], `run download 77 --name ${ARTIFACT_NAME} --dir ${join(cacheDir, DEVELOP[1])}`);
  });

  it('uses a kept map without downloading it again', () => {
    keep(DEVELOP[0]);
    const { gh, calls } = fakeGh({ artifacts: [artifact(DEVELOP[0], 77)] });
    const found = findCoverageMap({ git: fakeGit().git, gh, cacheDir });
    assert.equal(found.source, 'kept');
    assert.equal(found.distance, 0);
    assert.ok(calls.every((c) => !c.startsWith('run download')));
  });

  it('prefers a newer published map over an older kept one', () => {
    keep(DEVELOP[2]);
    const found = findCoverageMap({ git: fakeGit().git, gh: fakeGh({ artifacts: [artifact(DEVELOP[0], 9)] }).gh, cacheDir });
    assert.equal(found.sha, DEVELOP[0]);
    assert.equal(found.source, 'downloaded');
  });

  it('falls back to a kept map of the window when GitHub cannot be asked, and says so', () => {
    keep(DEVELOP[1]);
    const found = findCoverageMap({ git: fakeGit().git, gh: fakeGh({ apiError: 'error connecting to api.github.com' }).gh, cacheDir });
    assert.equal(found.sha, DEVELOP[1]);
    assert.equal(found.note, `GitHub could not be asked (error connecting to api.github.com), using the map kept for ${DEVELOP[1].slice(0, 9)}`);
  });

  it('fails when GitHub cannot be asked and nothing is kept, naming a missing gh', () => {
    const found = findCoverageMap({ git: fakeGit().git, gh: fakeGh({ apiError: 'HTTP 401: Bad credentials' }).gh, cacheDir });
    assert.deepEqual(found, { error: 'GitHub could not be asked for the map (HTTP 401: Bad credentials) and none is kept' });
    const missing = () => { throw Object.assign(new Error('spawnSync gh ENOENT'), { code: 'ENOENT', path: 'gh' }); };
    assert.deepEqual(findCoverageMap({ git: fakeGit().git, gh: missing, cacheDir }),
      { error: 'GitHub could not be asked for the map (gh is not installed) and none is kept' });
  });

  it('fails when no commit of the window has a map, even if older ones do', () => {
    const { gh } = fakeGh({ artifacts: [artifact(DEVELOP[3], 1)] });
    const found = findCoverageMap({ git: fakeGit().git, gh, cacheDir, max: 3 });
    assert.deepEqual(found, { error: 'no map for any of the last 3 merges into develop' });
  });

  it('fails, leaving nothing behind, when the download fails or brings no map', () => {
    const failed = findCoverageMap({ git: fakeGit().git, gh: fakeGh({ artifacts: [artifact(DEVELOP[0], 5)], downloadError: 'HTTP 410: artifact has expired' }).gh, cacheDir });
    assert.deepEqual(failed, { error: `the map of ${DEVELOP[0].slice(0, 9)} could not be downloaded (HTTP 410: artifact has expired)` });
    const empty = findCoverageMap({ git: fakeGit().git, gh: fakeGh({ artifacts: [artifact(DEVELOP[0], 5)], writesMap: false }).gh, cacheDir });
    assert.deepEqual(empty, { error: `the ${ARTIFACT_NAME} artifact of ${DEVELOP[0].slice(0, 9)} has no ${MAP_FILE}` });
    assert.ok(!existsSync(join(cacheDir, DEVELOP[0])));
  });

  it('fails without a develop to anchor on', () => {
    const found = findCoverageMap({ git: fakeGit({ fail: true }).git, gh: fakeGh().gh, cacheDir });
    assert.deepEqual(found, { error: 'no develop commit to take the map from (fatal: Not a valid object name origin/develop)' });
  });

  it('drops the kept maps of commits that left the window', () => {
    keep('old0000000');
    keep(DEVELOP[0]);
    findCoverageMap({ git: fakeGit().git, gh: fakeGh().gh, cacheDir });
    assert.deepEqual(readdirSync(cacheDir), [DEVELOP[0]]);
  });
});
