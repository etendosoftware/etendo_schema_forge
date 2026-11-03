// Finds the coverage map scripts/select-mocked-specs.js picks mocked specs with (ETP-5891): the map
// CI published for the newest develop commit at or before where this branch left develop, within
// the last MAX_MERGES merges into develop (`--first-parent`). CI publishes it as the
// `e2e-coverage-map` artifact of the run on each push to develop.
//
// A downloaded map is kept under <cacheDir>/<sha>/map.json, so the next push needs no download,
// and a kept map of a candidate commit is used when GitHub cannot be asked. Any other problem (no
// develop to anchor on, no gh, no login, no network, no map recent enough, a download that fails)
// comes back as { error }: the caller then runs the whole suite, never fewer specs.
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export const ARTIFACT_NAME = 'e2e-coverage-map';
export const MAP_FILE = 'map.json';
export const MAX_MERGES = 20;
const DEVELOP_BRANCH = 'develop';

/** The develop commits a map may come from, newest first: the merge-base and the merges before it. */
export function candidateCommits(git, { developRef = `origin/${DEVELOP_BRANCH}`, head = 'HEAD', max = MAX_MERGES } = {}) {
  const base = git(['merge-base', head, developRef]).trim();
  return git(['rev-list', '--first-parent', '-n', String(max), base]).split('\n').filter(Boolean);
}

/** sha → workflow run id of the live map artifacts built on develop (the API lists newest first). */
export function mapRuns(artifacts) {
  const runs = new Map();
  for (const artifact of artifacts) {
    const run = artifact.workflow_run;
    if (artifact.name !== ARTIFACT_NAME || artifact.expired || run?.head_branch !== DEVELOP_BRANCH) continue;
    if (!runs.has(run.head_sha)) runs.set(run.head_sha, run.id);
  }
  return runs;
}

const short = (sha) => sha.slice(0, 9);

function message(err) {
  if (err?.code === 'ENOENT') return `${err.path ?? 'the command'} is not installed`;
  const text = String(err?.stderr || err?.message || err).trim().split('\n')[0];
  return text || 'unknown error';
}

/**
 * { path, sha, distance, source: 'kept' | 'downloaded', note? } or { error }. `git(args)` and
 * `gh(args)` run those commands and return stdout, throwing on failure; `cacheDir` keeps the maps.
 */
export function findCoverageMap({ git, gh, cacheDir, developRef, max = MAX_MERGES }) {
  let candidates;
  try {
    candidates = candidateCommits(git, { developRef, max });
  } catch (err) {
    return { error: `no develop commit to take the map from (${message(err)})` };
  }
  if (!candidates.length) return { error: 'no develop commit to take the map from' };

  const kept = (sha) => existsSync(join(cacheDir, sha, MAP_FILE));
  let runs = null;
  let unreachable = null;
  try {
    const page = JSON.parse(gh(['api', `repos/{owner}/{repo}/actions/artifacts?name=${ARTIFACT_NAME}&per_page=100`]));
    runs = mapRuns(page.artifacts ?? []);
  } catch (err) {
    unreachable = message(err);
  }

  prune(cacheDir, candidates);
  for (let distance = 0; distance < candidates.length; distance++) {
    const sha = candidates[distance];
    const path = join(cacheDir, sha, MAP_FILE);
    if (kept(sha)) {
      const note = unreachable ? `GitHub could not be asked (${unreachable}), using the map kept for ${short(sha)}` : undefined;
      return { path, sha, distance, source: 'kept', ...(note && { note }) };
    }
    if (!runs?.has(sha)) continue;
    try {
      mkdirSync(join(cacheDir, sha), { recursive: true });
      gh(['run', 'download', String(runs.get(sha)), '--name', ARTIFACT_NAME, '--dir', join(cacheDir, sha)]);
    } catch (err) {
      rmSync(join(cacheDir, sha), { recursive: true, force: true });
      return { error: `the map of ${short(sha)} could not be downloaded (${message(err)})` };
    }
    if (!existsSync(path)) {
      rmSync(join(cacheDir, sha), { recursive: true, force: true });
      return { error: `the ${ARTIFACT_NAME} artifact of ${short(sha)} has no ${MAP_FILE}` };
    }
    return { path, sha, distance, source: 'downloaded' };
  }
  if (unreachable) return { error: `GitHub could not be asked for the map (${unreachable}) and none is kept` };
  return { error: `no map for any of the last ${candidates.length} merges into develop` };
}

/** Drops the kept maps of commits that left the window. */
function prune(cacheDir, candidates) {
  if (!existsSync(cacheDir)) return;
  const keep = new Set(candidates);
  for (const entry of readdirSync(cacheDir)) {
    if (!keep.has(entry)) rmSync(join(cacheDir, entry), { recursive: true, force: true });
  }
}
