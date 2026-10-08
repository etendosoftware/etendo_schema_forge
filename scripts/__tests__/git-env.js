/**
 * Git's repository-discovery environment, neutralised — for tests that build a
 * throwaway git repository in a temp directory.
 *
 * WHY THIS EXISTS (do not "simplify" it away):
 * When git runs a hook it exports GIT_DIR (and friends) pointing at the REAL
 * repository, and every child process inherits them. An exported GIT_DIR BEATS
 * `cwd`, so `git init` / `git add -A` / `git commit` run with only
 * `{ cwd: tmpFixture }` operate on the real repository instead of the fixture.
 * That is not theoretical: run from the pre-push gate, these tests committed
 * their fixture files on top of the user's branch as two commits titled `init`,
 * left conflict markers in a source file, and made the whole working tree read
 * as untracked. Recovery was a hard reset.
 *
 * So every git invocation in these tests — and every child process that runs
 * git itself, i.e. the scripts under test — must get this environment, and the
 * test process scrubs its own `process.env` too, because the scripts are also
 * imported and exercised in-process. With these variables gone, `cwd` is the
 * only thing that decides which repository is touched.
 */

/**
 * Everything git documents under "The Git Repository" in git(1) — the variables
 * that select the repository, its index and its object store — plus GIT_PREFIX
 * (exported to hooks; shifts how relative pathspecs resolve) and the pathspec
 * interpretation switches, so a fixture repo behaves identically everywhere.
 */
export const GIT_REPOSITORY_ENV_VARS = Object.freeze([
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_COMMON_DIR',
  'GIT_INDEX_FILE',
  'GIT_INDEX_VERSION',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_NAMESPACE',
  'GIT_CEILING_DIRECTORIES',
  'GIT_DISCOVERY_ACROSS_FILESYSTEM',
  'GIT_DEFAULT_HASH',
  'GIT_PREFIX',
  'GIT_LITERAL_PATHSPECS',
  'GIT_GLOB_PATHSPECS',
  'GIT_NOGLOB_PATHSPECS',
  'GIT_ICASE_PATHSPECS',
]);

/** Removes the repository-discovery variables from `env` in place. */
export function scrubGitEnv(env = process.env) {
  for (const name of GIT_REPOSITORY_ENV_VARS) delete env[name];
  return env;
}

/**
 * A copy of `process.env` with `extra` applied and the repository-discovery
 * variables removed. Pass it to every `git` call and to every child process
 * that shells out to git.
 */
export function gitEnv(extra = {}) {
  return scrubGitEnv({ ...process.env, ...extra });
}
