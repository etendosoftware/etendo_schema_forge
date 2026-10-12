/**
 * Environment for tests that build throwaway git repos and run git (or a script that runs git)
 * inside them.
 *
 * When git runs a hook from a LINKED worktree (pre-push, pre-commit) it exports GIT_DIR — the
 * absolute path of `.git/worktrees/<name>` — and the hook's children inherit it. A test that
 * then runs `git init` / `git add` / `git commit` in a temp dir is silently redirected to the
 * REAL repository: the fixture commits land on the developer's branch. A plain checkout is not
 * affected (there GIT_DIR is the relative `.git`). Every `GIT_*` variable is dropped, not just
 * the known redirecting ones (GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, GIT_COMMON_DIR,
 * GIT_OBJECT_DIRECTORY, GIT_ALTERNATE_OBJECT_DIRECTORIES, GIT_PREFIX, GIT_NAMESPACE…), so a
 * future git variable cannot reopen the leak.
 *
 * @param {Record<string, string>} [extra] variables to set on top of the cleaned environment
 * @returns {NodeJS.ProcessEnv}
 */
export function isolatedGitEnv(extra = {}) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('GIT_')) env[key] = value;
  }
  return { ...env, ...extra };
}
